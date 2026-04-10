import {
	createServiceClient,
	type RequestAuthContext,
	resolveRequestAuth,
	resolveUserAuthFailure,
	toDeterministicError,
} from "../_shared/edgeAuth.ts";
import {
	jsonResponse as buildJsonResponse,
	isAllowedOrigin,
	optionsResponse,
} from "../_shared/httpSecurity.ts";
import { enforceRateLimit } from "../_shared/rateLimit.ts";

declare const Deno: {
	env: {
		get: (key: string) => string | undefined;
	};
	serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const CORS_OPTIONS = { methods: "POST, OPTIONS" } as const;
const COLLECTED_CARD_MEDIA_BUCKET = "collected-card-media";
const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;
const DEFAULT_R2_REGION = "auto";
const MAX_RESOLVE_CARD_IDS = 200;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AUDIO_CONTENT_TYPES = [
	"audio/webm",
	"audio/ogg",
	"audio/mpeg",
	"audio/mp3",
	"audio/mp4",
	"audio/x-m4a",
	"audio/aac",
	"audio/wav",
	"audio/x-wav",
] as const;

type MediaSlot = "image" | "vocab-audio" | "sentence-audio";
type SharedColumn = "image_url" | "audio_url" | "sentence_audio_url";
type HideColumn = "hide_image" | "hide_audio" | "hide_sentence_audio";

type VocabularyCardRow = {
	id?: string | null;
	image_url?: string | null;
	audio_url?: string | null;
	sentence_audio_url?: string | null;
};

type UserVocabularyCardMediaRow = {
	user_id?: string | null;
	vocabulary_card_id?: string | null;
	image_url?: string | null;
	audio_url?: string | null;
	sentence_audio_url?: string | null;
	hide_image?: boolean | null;
	hide_audio?: boolean | null;
	hide_sentence_audio?: boolean | null;
};

type CollectedCardMediaRecord = {
	vocabularyCardId: string;
	imageStorageRef: string | null;
	vocabAudioStorageRef: string | null;
	sentenceAudioStorageRef: string | null;
	imageUrl: string | null;
	vocabAudioUrl: string | null;
	sentenceAudioUrl: string | null;
	imageHidden: boolean;
	vocabAudioHidden: boolean;
	sentenceAudioHidden: boolean;
	hasCustomImage: boolean;
	hasCustomVocabAudio: boolean;
	hasCustomSentenceAudio: boolean;
};

type R2StorageConfig = {
	bucket: string;
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	deliveryMode: "private-signed" | "public";
	publicBaseUrl: string | null;
	signedUrlTtlSeconds: number;
};

type CollectedCardMediaObjectRef = {
	bucketId: string;
	objectPath: string;
};

type SlotConfig = {
	sharedColumn: SharedColumn;
	privateColumn: SharedColumn;
	hideColumn: HideColumn;
	fileField: "imageFile" | "vocabAudioFile" | "sentenceAudioFile";
	defaultExtension: string;
};

type OverlayState = {
	vocabularyCardId: string;
	imageStorageRef: string | null;
	vocabAudioStorageRef: string | null;
	sentenceAudioStorageRef: string | null;
	imageHidden: boolean;
	vocabAudioHidden: boolean;
	sentenceAudioHidden: boolean;
	effectiveImageRef: string | null;
	effectiveVocabAudioRef: string | null;
	effectiveSentenceAudioRef: string | null;
	hasCustomImage: boolean;
	hasCustomVocabAudio: boolean;
	hasCustomSentenceAudio: boolean;
};

const SLOT_CONFIG: Record<MediaSlot, SlotConfig> = {
	image: {
		sharedColumn: "image_url",
		privateColumn: "image_url",
		hideColumn: "hide_image",
		fileField: "imageFile",
		defaultExtension: "webp",
	},
	"vocab-audio": {
		sharedColumn: "audio_url",
		privateColumn: "audio_url",
		hideColumn: "hide_audio",
		fileField: "vocabAudioFile",
		defaultExtension: "webm",
	},
	"sentence-audio": {
		sharedColumn: "sentence_audio_url",
		privateColumn: "sentence_audio_url",
		hideColumn: "hide_sentence_audio",
		fileField: "sentenceAudioFile",
		defaultExtension: "webm",
	},
};

const jsonResponse = (
	req: Request,
	status: number,
	payload: Record<string, unknown>,
) => buildJsonResponse(req, payload, status, CORS_OPTIONS);

const toTrimmedString = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const toOptionalNonEmptyString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toBoolean = (value: unknown): boolean => value === true;

const normalizeCardIds = (value: unknown): string[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Set<string>();
	const normalizedIds: string[] = [];

	value.forEach((rawId) => {
		const cardId = toTrimmedString(rawId);
		if (!cardId || seen.has(cardId)) {
			return;
		}

		seen.add(cardId);
		normalizedIds.push(cardId);
	});

	return normalizedIds;
};

const normalizeProvider = (value: string | undefined): "r2" | "supabase" =>
	value?.trim().toLowerCase() === "supabase" ? "supabase" : "r2";

const normalizeDeliveryMode = (
	value: string | undefined,
): "private-signed" | "public" =>
	value?.trim().toLowerCase() === "public" ? "public" : "private-signed";

const resolveR2Endpoint = (): string => {
	const explicitEndpoint = toOptionalNonEmptyString(
		Deno.env.get("R2_S3_ENDPOINT"),
	);
	if (explicitEndpoint) {
		return explicitEndpoint.replace(/\/+$/, "");
	}

	const accountId = toOptionalNonEmptyString(Deno.env.get("R2_ACCOUNT_ID"));
	if (!accountId) {
		throw new Error("Configuration R2 incomplete: endpoint missing.");
	}

	return `https://${accountId}.r2.cloudflarestorage.com`;
};

const getStorageConfig = (): R2StorageConfig => {
	const provider = normalizeProvider(
		Deno.env.get("OBJECT_STORE_COLLECTED_CARD_MEDIA_PROVIDER"),
	);
	if (provider !== "r2") {
		throw new Error(
			"Collected card media requires OBJECT_STORE_COLLECTED_CARD_MEDIA_PROVIDER=r2.",
		);
	}

	const bucket = toOptionalNonEmptyString(
		Deno.env.get("R2_COLLECTED_CARD_MEDIA_BUCKET"),
	);
	const accessKeyId = toOptionalNonEmptyString(
		Deno.env.get("R2_ACCESS_KEY_ID"),
	);
	const secretAccessKey = toOptionalNonEmptyString(
		Deno.env.get("R2_SECRET_ACCESS_KEY"),
	);
	if (!bucket || !accessKeyId || !secretAccessKey) {
		throw new Error("Configuration R2 incomplete for collected card media.");
	}

	return {
		bucket,
		endpoint: resolveR2Endpoint(),
		accessKeyId,
		secretAccessKey,
		region:
			toOptionalNonEmptyString(Deno.env.get("R2_JURISDICTION")) ??
			DEFAULT_R2_REGION,
		deliveryMode: normalizeDeliveryMode(
			Deno.env.get("OBJECT_STORE_COLLECTED_CARD_MEDIA_DELIVERY_MODE"),
		),
		publicBaseUrl: toOptionalNonEmptyString(Deno.env.get("R2_PUBLIC_BASE_URL")),
		signedUrlTtlSeconds: DEFAULT_SIGNED_URL_TTL_SECONDS,
	};
};

const normalizeObjectPath = (value: string): string =>
	value.replace(/^\/+/, "").trim();

const buildStorageRef = (objectPath: string): string =>
	`storage://${COLLECTED_CARD_MEDIA_BUCKET}/${normalizeObjectPath(objectPath)}`;

const parseStorageRef = (value: string): CollectedCardMediaObjectRef | null => {
	if (!value.startsWith("storage://")) {
		return null;
	}

	const withoutPrefix = value.slice("storage://".length);
	const slashIndex = withoutPrefix.indexOf("/");
	if (slashIndex <= 0) {
		return null;
	}

	const bucketId = withoutPrefix.slice(0, slashIndex).trim();
	const objectPath = normalizeObjectPath(withoutPrefix.slice(slashIndex + 1));
	if (!bucketId || !objectPath) {
		return null;
	}

	return { bucketId, objectPath };
};

const decodePathSegment = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const parseSupabaseStorageUrl = (
	value: string,
): CollectedCardMediaObjectRef | null => {
	try {
		const parsedUrl = new URL(value);
		const segments = parsedUrl.pathname.split("/").filter(Boolean);
		const objectSegmentIndex = segments.findIndex(
			(segment) => segment === "object",
		);

		if (objectSegmentIndex < 0) {
			return null;
		}

		const mode = segments[objectSegmentIndex + 1];
		if (mode !== "public" && mode !== "authenticated" && mode !== "sign") {
			return null;
		}

		const bucketId = decodePathSegment(
			segments[objectSegmentIndex + 2] ?? "",
		).trim();
		const objectPath = normalizeObjectPath(
			segments
				.slice(objectSegmentIndex + 3)
				.map((segment) => decodePathSegment(segment))
				.join("/"),
		);

		if (!bucketId || !objectPath) {
			return null;
		}

		return { bucketId, objectPath };
	} catch {
		return null;
	}
};

const parseDefaultBucketPath = (
	value: string,
): CollectedCardMediaObjectRef | null => {
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.startsWith(`${COLLECTED_CARD_MEDIA_BUCKET}/`)) {
		const objectPath = normalizeObjectPath(
			trimmed.slice(COLLECTED_CARD_MEDIA_BUCKET.length + 1),
		);
		if (!objectPath) {
			return null;
		}

		return {
			bucketId: COLLECTED_CARD_MEDIA_BUCKET,
			objectPath,
		};
	}

	if (trimmed.includes("/")) {
		return {
			bucketId: COLLECTED_CARD_MEDIA_BUCKET,
			objectPath: normalizeObjectPath(trimmed),
		};
	}

	return null;
};

const encodeRfc3986 = (value: string): string =>
	encodeURIComponent(value).replace(/[!'()*]/g, (character) => {
		return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
	});

const buildUrlObjectPath = (objectPath: string): string =>
	normalizeObjectPath(objectPath)
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");

const buildCanonicalUri = (bucket: string, objectPath: string): string => {
	const segments = [
		bucket,
		...normalizeObjectPath(objectPath).split("/").filter(Boolean),
	];
	return `/${segments.map((segment) => encodeRfc3986(segment)).join("/")}`;
};

const buildObjectUrl = (config: R2StorageConfig, objectPath: string): URL => {
	const encodedObjectPath = buildUrlObjectPath(objectPath);
	return new URL(
		`/${config.bucket}/${encodedObjectPath}`,
		`${config.endpoint}/`,
	);
};

const toAmzDate = (date: Date): string =>
	date.toISOString().replace(/[:-]|\.\d{3}/g, "");

const toDateStamp = (date: Date): string => toAmzDate(date).slice(0, 8);

const bytesToHex = (bytes: Uint8Array): string =>
	Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

const toArrayBuffer = (
	value: string | ArrayBuffer | Uint8Array,
): ArrayBuffer => {
	if (typeof value === "string") {
		return new TextEncoder().encode(value).slice().buffer;
	}

	if (value instanceof Uint8Array) {
		return value.slice().buffer;
	}

	return value.slice(0);
};

const sha256Hex = async (value: string): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return bytesToHex(new Uint8Array(digest));
};

const hmacSha256 = async (
	key: string | ArrayBuffer | Uint8Array,
	value: string,
): Promise<Uint8Array> => {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(key) as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		cryptoKey,
		new TextEncoder().encode(value) as BufferSource,
	);
	return new Uint8Array(signature);
};

const buildCredentialScope = (dateStamp: string, region: string): string =>
	`${dateStamp}/${region}/s3/aws4_request`;

const getSigningKey = async (
	secretAccessKey: string,
	dateStamp: string,
	region: string,
): Promise<Uint8Array> => {
	const dateKey = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
	const regionKey = await hmacSha256(dateKey, region);
	const serviceKey = await hmacSha256(regionKey, "s3");
	return hmacSha256(serviceKey, "aws4_request");
};

const buildCanonicalQueryString = (
	entries: Array<[string, string]>,
): string => {
	return [...entries]
		.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
			if (leftKey === rightKey) {
				return leftValue.localeCompare(rightValue);
			}
			return leftKey.localeCompare(rightKey);
		})
		.map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
		.join("&");
};

const buildPublicUrl = (
	config: R2StorageConfig,
	objectPath: string,
): string | null => {
	if (config.deliveryMode !== "public" || !config.publicBaseUrl) {
		return null;
	}

	return new URL(
		buildUrlObjectPath(objectPath),
		`${config.publicBaseUrl.replace(/\/+$/, "")}/`,
	).toString();
};

const signObjectUrl = async (
	config: R2StorageConfig,
	objectPath: string,
	expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string> => {
	const publicUrl = buildPublicUrl(config, objectPath);
	if (publicUrl) {
		return publicUrl;
	}

	const now = new Date();
	const amzDate = toAmzDate(now);
	const dateStamp = toDateStamp(now);
	const credentialScope = buildCredentialScope(dateStamp, config.region);
	const url = buildObjectUrl(config, objectPath);
	const canonicalUri = buildCanonicalUri(config.bucket, objectPath);
	const signedHeaders = "host";
	const queryEntries: Array<[string, string]> = [
		["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
		["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
		["X-Amz-Date", amzDate],
		[
			"X-Amz-Expires",
			String(Math.max(1, Math.min(604800, Math.floor(expiresInSeconds)))),
		],
		["X-Amz-SignedHeaders", signedHeaders],
	];
	const canonicalQueryString = buildCanonicalQueryString(queryEntries);
	const canonicalRequest = [
		"GET",
		canonicalUri,
		canonicalQueryString,
		`host:${url.host}\n`,
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	].join("\n");
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		await sha256Hex(canonicalRequest),
	].join("\n");
	const signingKey = await getSigningKey(
		config.secretAccessKey,
		dateStamp,
		config.region,
	);
	const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

	queryEntries.forEach(([key, value]) => {
		url.searchParams.set(key, value);
	});
	url.searchParams.set("X-Amz-Signature", signature);

	return url.toString();
};

const signR2Headers = async (
	config: R2StorageConfig,
	method: "PUT" | "DELETE",
	objectPath: string,
	url: URL,
): Promise<Record<string, string>> => {
	const now = new Date();
	const amzDate = toAmzDate(now);
	const dateStamp = toDateStamp(now);
	const credentialScope = buildCredentialScope(dateStamp, config.region);
	const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
	const canonicalRequest = [
		method,
		buildCanonicalUri(config.bucket, objectPath),
		"",
		[
			`host:${url.host}`,
			"x-amz-content-sha256:UNSIGNED-PAYLOAD",
			`x-amz-date:${amzDate}`,
		].join("\n") + "\n",
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	].join("\n");
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		await sha256Hex(canonicalRequest),
	].join("\n");
	const signingKey = await getSigningKey(
		config.secretAccessKey,
		dateStamp,
		config.region,
	);
	const signature = bytesToHex(await hmacSha256(signingKey, stringToSign));

	return {
		Authorization: [
			`AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
			`SignedHeaders=${signedHeaders}`,
			`Signature=${signature}`,
		].join(", "),
		"x-amz-content-sha256": "UNSIGNED-PAYLOAD",
		"x-amz-date": amzDate,
	};
};

const readErrorBody = async (response: Response): Promise<string> => {
	try {
		const body = await response.text();
		return body.trim().slice(0, 200);
	} catch {
		return "";
	}
};

const sendSignedR2Request = async (
	config: R2StorageConfig,
	method: "PUT" | "DELETE",
	objectPath: string,
	body?: ArrayBuffer,
	contentType?: string,
): Promise<Response> => {
	const url = buildObjectUrl(config, objectPath);
	const headers = new Headers(
		await signR2Headers(config, method, objectPath, url),
	);
	if (contentType) {
		headers.set("content-type", contentType);
	}

	return fetch(url, {
		method,
		headers,
		body,
	});
};

const uploadObjectToR2 = async (
	config: R2StorageConfig,
	objectPath: string,
	file: File,
): Promise<string> => {
	const response = await sendSignedR2Request(
		config,
		"PUT",
		objectPath,
		await file.arrayBuffer(),
		toOptionalNonEmptyString(file.type) ?? undefined,
	);

	if (!response.ok) {
		throw new Error(
			`R2 upload failed (${response.status}): ${await readErrorBody(response)}`,
		);
	}

	return buildStorageRef(objectPath);
};

const deleteObjectRefFromR2 = async (
	config: R2StorageConfig,
	rawStorageRef: string,
): Promise<void> => {
	const objectRef = parseStorageRef(rawStorageRef);
	if (!objectRef || objectRef.bucketId !== COLLECTED_CARD_MEDIA_BUCKET) {
		return;
	}

	const response = await sendSignedR2Request(
		config,
		"DELETE",
		objectRef.objectPath,
	);

	if (response.ok || response.status === 404) {
		return;
	}

	throw new Error(
		`R2 delete failed (${response.status}): ${await readErrorBody(response)}`,
	);
};

const bestEffortDeleteRefs = async (
	config: R2StorageConfig,
	rawStorageRefs: string[],
): Promise<void> => {
	for (const rawStorageRef of rawStorageRefs) {
		try {
			await deleteObjectRefFromR2(config, rawStorageRef);
		} catch (error) {
			console.error("[collected-card-media] Unable to delete R2 object", {
				rawStorageRef,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
};

const resolveStorageRefUrl = async (
	config: R2StorageConfig,
	rawStorageRef: string,
): Promise<string | null> => {
	const normalizedStorageRef = toOptionalNonEmptyString(rawStorageRef);
	if (!normalizedStorageRef) {
		return null;
	}

	const isHttpStorageRef = /^https?:\/\//i.test(normalizedStorageRef);
	const objectRef =
		parseStorageRef(normalizedStorageRef) ??
		(isHttpStorageRef ? parseSupabaseStorageUrl(normalizedStorageRef) : null) ??
		(!isHttpStorageRef ? parseDefaultBucketPath(normalizedStorageRef) : null);

	if (!objectRef || objectRef.bucketId !== COLLECTED_CARD_MEDIA_BUCKET) {
		return isHttpStorageRef ? normalizedStorageRef : null;
	}

	return signObjectUrl(
		config,
		objectRef.objectPath,
		config.signedUrlTtlSeconds,
	);
};

const resolveStorageRefUrls = async (
	config: R2StorageConfig,
	rawStorageRefs: string[],
): Promise<Map<string, string>> => {
	const urlsByRef = new Map<string, string>();
	const uniqueRefs = Array.from(
		new Set(
			rawStorageRefs
				.map((rawStorageRef) => toOptionalNonEmptyString(rawStorageRef))
				.filter(
					(rawStorageRef): rawStorageRef is string => rawStorageRef !== null,
				),
		),
	);

	await Promise.all(
		uniqueRefs.map(async (rawStorageRef) => {
			const url = await resolveStorageRefUrl(config, rawStorageRef);
			if (url) {
				urlsByRef.set(rawStorageRef, url);
			}
		}),
	);

	return urlsByRef;
};

const getPrivateStorageRef = (
	row: UserVocabularyCardMediaRow | null,
	slot: MediaSlot,
): string | null =>
	toOptionalNonEmptyString(row?.[SLOT_CONFIG[slot].privateColumn]);

const getSharedStorageRef = (
	row: VocabularyCardRow | null,
	slot: MediaSlot,
): string | null =>
	toOptionalNonEmptyString(row?.[SLOT_CONFIG[slot].sharedColumn]);

const getHiddenFlag = (
	row: UserVocabularyCardMediaRow | null,
	slot: MediaSlot,
): boolean => toBoolean(row?.[SLOT_CONFIG[slot].hideColumn]);

const buildOverlayState = (
	vocabularyCardId: string,
	cardRow: VocabularyCardRow | null,
	userRow: UserVocabularyCardMediaRow | null,
): OverlayState => {
	const imageStorageRef = getPrivateStorageRef(userRow, "image");
	const vocabAudioStorageRef = getPrivateStorageRef(userRow, "vocab-audio");
	const sentenceAudioStorageRef = getPrivateStorageRef(
		userRow,
		"sentence-audio",
	);
	const imageHidden = getHiddenFlag(userRow, "image");
	const vocabAudioHidden = getHiddenFlag(userRow, "vocab-audio");
	const sentenceAudioHidden = getHiddenFlag(userRow, "sentence-audio");

	return {
		vocabularyCardId,
		imageStorageRef,
		vocabAudioStorageRef,
		sentenceAudioStorageRef,
		imageHidden,
		vocabAudioHidden,
		sentenceAudioHidden,
		effectiveImageRef: imageHidden
			? null
			: (imageStorageRef ?? getSharedStorageRef(cardRow, "image")),
		effectiveVocabAudioRef: vocabAudioHidden
			? null
			: (vocabAudioStorageRef ?? getSharedStorageRef(cardRow, "vocab-audio")),
		effectiveSentenceAudioRef: sentenceAudioHidden
			? null
			: (sentenceAudioStorageRef ??
				getSharedStorageRef(cardRow, "sentence-audio")),
		hasCustomImage: imageStorageRef !== null,
		hasCustomVocabAudio: vocabAudioStorageRef !== null,
		hasCustomSentenceAudio: sentenceAudioStorageRef !== null,
	};
};

const buildCollectedCardMediaRecord = (
	state: OverlayState,
	urlsByRef: Map<string, string>,
): CollectedCardMediaRecord => ({
	vocabularyCardId: state.vocabularyCardId,
	imageStorageRef: state.imageStorageRef,
	vocabAudioStorageRef: state.vocabAudioStorageRef,
	sentenceAudioStorageRef: state.sentenceAudioStorageRef,
	imageUrl: state.effectiveImageRef
		? (urlsByRef.get(state.effectiveImageRef) ?? null)
		: null,
	vocabAudioUrl: state.effectiveVocabAudioRef
		? (urlsByRef.get(state.effectiveVocabAudioRef) ?? null)
		: null,
	sentenceAudioUrl: state.effectiveSentenceAudioRef
		? (urlsByRef.get(state.effectiveSentenceAudioRef) ?? null)
		: null,
	imageHidden: state.imageHidden,
	vocabAudioHidden: state.vocabAudioHidden,
	sentenceAudioHidden: state.sentenceAudioHidden,
	hasCustomImage: state.hasCustomImage,
	hasCustomVocabAudio: state.hasCustomVocabAudio,
	hasCustomSentenceAudio: state.hasCustomSentenceAudio,
});

const fetchVocabularyCardRowsById = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	vocabularyCardIds: string[],
): Promise<Map<string, VocabularyCardRow>> => {
	const rowsById = new Map<string, VocabularyCardRow>();
	if (vocabularyCardIds.length === 0) {
		return rowsById;
	}

	const { data, error } = await supabaseAdmin
		.from("vocabulary_cards")
		.select("id,image_url,audio_url,sentence_audio_url")
		.in("id", vocabularyCardIds);

	if (error) {
		throw new Error(`VOCABULARY_CARDS_FETCH_FAILED:${error.message}`);
	}

	(data as VocabularyCardRow[] | null | undefined)?.forEach((row) => {
		const cardId = toOptionalNonEmptyString(row.id);
		if (cardId) {
			rowsById.set(cardId, row);
		}
	});

	return rowsById;
};

const fetchUserMediaRowsByCardId = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	userId: string | null,
	vocabularyCardIds: string[],
): Promise<Map<string, UserVocabularyCardMediaRow>> => {
	const rowsById = new Map<string, UserVocabularyCardMediaRow>();
	if (!userId || vocabularyCardIds.length === 0) {
		return rowsById;
	}

	const { data, error } = await supabaseAdmin
		.from("user_vocabulary_card_media")
		.select(
			"user_id,vocabulary_card_id,image_url,audio_url,sentence_audio_url,hide_image,hide_audio,hide_sentence_audio",
		)
		.eq("user_id", userId)
		.in("vocabulary_card_id", vocabularyCardIds);

	if (error) {
		throw new Error(`USER_MEDIA_FETCH_FAILED:${error.message}`);
	}

	(data as UserVocabularyCardMediaRow[] | null | undefined)?.forEach((row) => {
		const cardId = toOptionalNonEmptyString(row.vocabulary_card_id);
		if (cardId) {
			rowsById.set(cardId, row);
		}
	});

	return rowsById;
};

const resolveCollectedCardMediaRecords = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	config: R2StorageConfig,
	vocabularyCardIds: string[],
	userId: string | null,
): Promise<CollectedCardMediaRecord[]> => {
	const normalizedIds = normalizeCardIds(vocabularyCardIds);
	if (normalizedIds.length === 0) {
		return [];
	}

	const [cardRowsById, userRowsById] = await Promise.all([
		fetchVocabularyCardRowsById(supabaseAdmin, normalizedIds),
		fetchUserMediaRowsByCardId(supabaseAdmin, userId, normalizedIds),
	]);

	const overlayStates = normalizedIds.map((cardId) => {
		return buildOverlayState(
			cardId,
			cardRowsById.get(cardId) ?? null,
			userRowsById.get(cardId) ?? null,
		);
	});

	const urlsByRef = await resolveStorageRefUrls(config, [
		...overlayStates.map((state) => state.effectiveImageRef ?? ""),
		...overlayStates.map((state) => state.effectiveVocabAudioRef ?? ""),
		...overlayStates.map((state) => state.effectiveSentenceAudioRef ?? ""),
	]);

	return overlayStates.map((state) =>
		buildCollectedCardMediaRecord(state, urlsByRef),
	);
};

const resolveSingleCollectedCardMediaRecord = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	config: R2StorageConfig,
	vocabularyCardId: string,
	userId: string | null,
): Promise<CollectedCardMediaRecord> => {
	const [record] = await resolveCollectedCardMediaRecords(
		supabaseAdmin,
		config,
		[vocabularyCardId],
		userId,
	);

	return (
		record ?? {
			vocabularyCardId,
			imageStorageRef: null,
			vocabAudioStorageRef: null,
			sentenceAudioStorageRef: null,
			imageUrl: null,
			vocabAudioUrl: null,
			sentenceAudioUrl: null,
			imageHidden: false,
			vocabAudioHidden: false,
			sentenceAudioHidden: false,
			hasCustomImage: false,
			hasCustomVocabAudio: false,
			hasCustomSentenceAudio: false,
		}
	);
};

const slotFromValue = (value: unknown): MediaSlot | null => {
	const normalizedValue = toTrimmedString(value);
	if (
		normalizedValue === "image" ||
		normalizedValue === "vocab-audio" ||
		normalizedValue === "sentence-audio"
	) {
		return normalizedValue;
	}

	return null;
};

const resolveFileExtension = (file: File, slot: MediaSlot): string => {
	const explicitExtension = file.name.split(".").pop()?.trim().toLowerCase();
	if (explicitExtension) {
		return explicitExtension;
	}

	const contentType = toTrimmedString(file.type).toLowerCase();
	if (contentType.includes("webp")) {
		return "webp";
	}
	if (contentType.includes("mpeg") || contentType.includes("mp3")) {
		return "mp3";
	}
	if (contentType.includes("wav")) {
		return "wav";
	}
	if (contentType.includes("ogg")) {
		return "ogg";
	}
	if (contentType.includes("mp4") || contentType.includes("m4a")) {
		return "mp4";
	}

	return SLOT_CONFIG[slot].defaultExtension;
};

const validateUploadedFile = (slot: MediaSlot, file: File): string | null => {
	if (file.size <= 0) {
		return "Le fichier envoye est vide.";
	}

	if (file.size > MAX_UPLOAD_BYTES) {
		return "Le fichier envoye depasse la limite autorisee.";
	}

	const contentType = toTrimmedString(file.type).toLowerCase();
	if (slot === "image") {
		return contentType.startsWith("image/")
			? null
			: "Le fichier image est invalide.";
	}

	if (!contentType.startsWith("audio/")) {
		return "Le fichier audio est invalide.";
	}

	return SUPPORTED_AUDIO_CONTENT_TYPES.some(
		(supportedType) =>
			contentType === supportedType ||
			contentType.startsWith(`${supportedType};`),
	)
		? null
		: "Format audio non supporte. Utilisez WebM, MP3, MP4/M4A, OGG ou WAV.";
};

const buildPrivateObjectPath = (
	userId: string,
	vocabularyCardId: string,
	slot: MediaSlot,
	extension: string,
): string => {
	const normalizedExtension = extension.replace(/^\.+/, "").trim() || "bin";
	return `users/${userId}/${vocabularyCardId}/${slot}-${Date.now()}-${crypto.randomUUID()}.${normalizedExtension}`;
};

const tryClaimSharedStorageRef = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	vocabularyCardId: string,
	slot: MediaSlot,
	storageRef: string,
): Promise<boolean> => {
	const slotConfig = SLOT_CONFIG[slot];
	const { data, error } = await supabaseAdmin
		.from("vocabulary_cards")
		.update({ [slotConfig.sharedColumn]: storageRef })
		.eq("id", vocabularyCardId)
		.is(slotConfig.sharedColumn, null)
		.select("id");

	if (error) {
		throw new Error(`VOCABULARY_CARD_UPDATE_FAILED:${error.message}`);
	}

	return Array.isArray(data) && data.length > 0;
};

const rollbackSharedStorageClaim = async (
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	vocabularyCardId: string,
	slot: MediaSlot,
	storageRef: string,
): Promise<boolean> => {
	const slotConfig = SLOT_CONFIG[slot];
	const { error } = await supabaseAdmin
		.from("vocabulary_cards")
		.update({ [slotConfig.sharedColumn]: null })
		.eq("id", vocabularyCardId)
		.eq(slotConfig.sharedColumn, storageRef);

	if (error) {
		console.error(
			"[collected-card-media] Failed to rollback shared vocabulary card media",
			{
				vocabularyCardId,
				slot,
				storageRef,
				error: error.message,
			},
		);
		return false;
	}

	return true;
};

const requireAuthenticatedUser = (
	req: Request,
	auth: RequestAuthContext,
): Response | null => {
	const authFailure = resolveUserAuthFailure(auth);
	if (!authFailure || auth.user) {
		return null;
	}

	return jsonResponse(
		req,
		authFailure.status,
		toDeterministicError(authFailure),
	);
};

const handleResolveCards = async (
	req: Request,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	config: R2StorageConfig,
	auth: RequestAuthContext,
	payload: Record<string, unknown>,
): Promise<Response> => {
	const vocabularyCardIds = normalizeCardIds(payload.vocabularyCardIds);
	if (vocabularyCardIds.length > MAX_RESOLVE_CARD_IDS) {
		return jsonResponse(req, 400, {
			error: "Trop de cartes ont ete demandees en une seule fois.",
			code: "TOO_MANY_CARD_IDS",
		});
	}

	const records = await resolveCollectedCardMediaRecords(
		supabaseAdmin,
		config,
		vocabularyCardIds,
		auth.user?.id ?? null,
	);

	return jsonResponse(req, 200, { records });
};

const handleSave = async (
	req: Request,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	config: R2StorageConfig,
	auth: RequestAuthContext,
	formData: FormData,
): Promise<Response> => {
	const authFailureResponse = requireAuthenticatedUser(req, auth);
	if (authFailureResponse || !auth.user) {
		return (
			authFailureResponse ??
			jsonResponse(req, 401, {
				error: "Authentification requise.",
				code: "AUTH_REQUIRED",
			})
		);
	}

	const vocabularyCardId = toTrimmedString(formData.get("vocabularyCardId"));
	if (!vocabularyCardId) {
		return jsonResponse(req, 400, {
			error: "Identifiant de carte manquant.",
			code: "VOCABULARY_CARD_ID_REQUIRED",
		});
	}

	const cardRowsById = await fetchVocabularyCardRowsById(supabaseAdmin, [
		vocabularyCardId,
	]);
	const currentCardRow = cardRowsById.get(vocabularyCardId) ?? null;
	if (!currentCardRow) {
		return jsonResponse(req, 404, {
			error: "Carte de vocabulaire introuvable.",
			code: "VOCABULARY_CARD_NOT_FOUND",
		});
	}

	const userRowsById = await fetchUserMediaRowsByCardId(
		supabaseAdmin,
		auth.user.id,
		[vocabularyCardId],
	);
	const currentUserRow = userRowsById.get(vocabularyCardId) ?? null;

	const uploadedRefsToCleanup: string[] = [];
	const refsToDeleteAfterCommit: string[] = [];
	const sharedClaims: Array<{ slot: MediaSlot; storageRef: string }> = [];
	const uploadEntries: Array<{
		slot: MediaSlot;
		file: File;
		extension: string;
	}> = [];
	const userUpdatePayload: {
		user_id: string;
		vocabulary_card_id: string;
		image_url?: string | null;
		audio_url?: string | null;
		sentence_audio_url?: string | null;
		hide_image?: boolean;
		hide_audio?: boolean;
		hide_sentence_audio?: boolean;
	} = {
		user_id: auth.user.id,
		vocabulary_card_id: vocabularyCardId,
	};
	let touchedUserUpdate = false;
	let hasAtLeastOneFile = false;

	for (const slot of Object.keys(SLOT_CONFIG) as MediaSlot[]) {
		const fileField = SLOT_CONFIG[slot].fileField;
		const fileValue = formData.get(fileField);
		if (!(fileValue instanceof File)) {
			continue;
		}

		hasAtLeastOneFile = true;
		const validationError = validateUploadedFile(slot, fileValue);
		if (validationError) {
			return jsonResponse(req, 400, {
				error: validationError,
				code: "INVALID_FILE",
			});
		}

		uploadEntries.push({
			slot,
			file: fileValue,
			extension: resolveFileExtension(fileValue, slot),
		});
	}

	if (!hasAtLeastOneFile) {
		return jsonResponse(req, 400, {
			error: "Aucun media a sauvegarder n'a ete fourni.",
			code: "NO_MEDIA_FILE",
		});
	}

	for (const uploadEntry of uploadEntries) {
		const { slot, file, extension } = uploadEntry;
		const slotConfig = SLOT_CONFIG[slot];
		const sharedStorageRef = getSharedStorageRef(currentCardRow, slot);
		const privateStorageRef = getPrivateStorageRef(currentUserRow, slot);
		const objectPath = buildPrivateObjectPath(
			auth.user.id,
			vocabularyCardId,
			slot,
			extension,
		);
		const uploadedRef = await uploadObjectToR2(config, objectPath, file);
		uploadedRefsToCleanup.push(uploadedRef);

		if (sharedStorageRef) {
			userUpdatePayload[slotConfig.privateColumn] = uploadedRef;
			userUpdatePayload[slotConfig.hideColumn] = false;
			touchedUserUpdate = true;
			if (privateStorageRef && privateStorageRef !== uploadedRef) {
				refsToDeleteAfterCommit.push(privateStorageRef);
			}
			continue;
		}

		const claimedSharedStorageRef = await tryClaimSharedStorageRef(
			supabaseAdmin,
			vocabularyCardId,
			slot,
			uploadedRef,
		);
		if (!claimedSharedStorageRef) {
			userUpdatePayload[slotConfig.privateColumn] = uploadedRef;
			userUpdatePayload[slotConfig.hideColumn] = false;
			touchedUserUpdate = true;
			if (privateStorageRef && privateStorageRef !== uploadedRef) {
				refsToDeleteAfterCommit.push(privateStorageRef);
			}
			continue;
		}

		sharedClaims.push({ slot, storageRef: uploadedRef });
		if (privateStorageRef && privateStorageRef !== uploadedRef) {
			refsToDeleteAfterCommit.push(privateStorageRef);
		}
		if (privateStorageRef || getHiddenFlag(currentUserRow, slot)) {
			userUpdatePayload[slotConfig.privateColumn] = null;
			userUpdatePayload[slotConfig.hideColumn] = false;
			touchedUserUpdate = true;
		}
	}

	try {
		if (touchedUserUpdate) {
			const { error } = await supabaseAdmin
				.from("user_vocabulary_card_media")
				.upsert(userUpdatePayload, {
					onConflict: "user_id,vocabulary_card_id",
				});
			if (error) {
				throw new Error(`USER_MEDIA_UPSERT_FAILED:${error.message}`);
			}
		}

		await bestEffortDeleteRefs(config, refsToDeleteAfterCommit);
		const record = await resolveSingleCollectedCardMediaRecord(
			supabaseAdmin,
			config,
			vocabularyCardId,
			auth.user.id,
		);

		return jsonResponse(req, 200, { record });
	} catch (error) {
		const cleanupProtectedRefs = new Set<string>();
		await Promise.all(
			sharedClaims.map(async ({ slot, storageRef }) => {
				const rolledBack = await rollbackSharedStorageClaim(
					supabaseAdmin,
					vocabularyCardId,
					slot,
					storageRef,
				);
				if (!rolledBack) {
					cleanupProtectedRefs.add(storageRef);
				}
			}),
		);
		await bestEffortDeleteRefs(
			config,
			uploadedRefsToCleanup.filter((ref) => !cleanupProtectedRefs.has(ref)),
		);
		throw error;
	}
};

const handleDeleteSlot = async (
	req: Request,
	supabaseAdmin: ReturnType<typeof createServiceClient>,
	config: R2StorageConfig,
	auth: RequestAuthContext,
	payload: Record<string, unknown>,
): Promise<Response> => {
	const authFailureResponse = requireAuthenticatedUser(req, auth);
	if (authFailureResponse || !auth.user) {
		return (
			authFailureResponse ??
			jsonResponse(req, 401, {
				error: "Authentification requise.",
				code: "AUTH_REQUIRED",
			})
		);
	}

	const vocabularyCardId = toTrimmedString(payload.vocabularyCardId);
	const slot = slotFromValue(payload.slot);
	if (!vocabularyCardId || !slot) {
		return jsonResponse(req, 400, {
			error: "Suppression media invalide.",
			code: "INVALID_DELETE_REQUEST",
		});
	}

	const cardRowsById = await fetchVocabularyCardRowsById(supabaseAdmin, [
		vocabularyCardId,
	]);
	const currentCardRow = cardRowsById.get(vocabularyCardId) ?? null;
	if (!currentCardRow) {
		return jsonResponse(req, 404, {
			error: "Carte de vocabulaire introuvable.",
			code: "VOCABULARY_CARD_NOT_FOUND",
		});
	}

	const userRowsById = await fetchUserMediaRowsByCardId(
		supabaseAdmin,
		auth.user.id,
		[vocabularyCardId],
	);
	const currentUserRow = userRowsById.get(vocabularyCardId) ?? null;
	const privateStorageRef = getPrivateStorageRef(currentUserRow, slot);
	const sharedStorageRef = getSharedStorageRef(currentCardRow, slot);
	const hidden = getHiddenFlag(currentUserRow, slot);

	if (!privateStorageRef && !sharedStorageRef && !hidden) {
		const record = await resolveSingleCollectedCardMediaRecord(
			supabaseAdmin,
			config,
			vocabularyCardId,
			auth.user.id,
		);
		return jsonResponse(req, 200, { record });
	}

	const slotConfig = SLOT_CONFIG[slot];
	const userUpdatePayload: {
		user_id: string;
		vocabulary_card_id: string;
		image_url?: string | null;
		audio_url?: string | null;
		sentence_audio_url?: string | null;
		hide_image?: boolean;
		hide_audio?: boolean;
		hide_sentence_audio?: boolean;
	} = {
		user_id: auth.user.id,
		vocabulary_card_id: vocabularyCardId,
		[slotConfig.privateColumn]: null,
		[slotConfig.hideColumn]: true,
	};

	const { error } = await supabaseAdmin
		.from("user_vocabulary_card_media")
		.upsert(userUpdatePayload, {
			onConflict: "user_id,vocabulary_card_id",
		});
	if (error) {
		throw new Error(`USER_MEDIA_DELETE_UPSERT_FAILED:${error.message}`);
	}

	if (privateStorageRef) {
		await bestEffortDeleteRefs(config, [privateStorageRef]);
	}

	const record = await resolveSingleCollectedCardMediaRecord(
		supabaseAdmin,
		config,
		vocabularyCardId,
		auth.user.id,
	);

	return jsonResponse(req, 200, { record });
};

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") {
		return optionsResponse(req, CORS_OPTIONS);
	}

	if (req.method !== "POST") {
		return jsonResponse(req, 405, { error: "Methode non autorisee." });
	}

	const requestOrigin = req.headers.get("origin");
	if (requestOrigin && !isAllowedOrigin(requestOrigin)) {
		return jsonResponse(req, 403, {
			error: "Origin non autorisee.",
			code: "ORIGIN_NOT_ALLOWED",
		});
	}

	try {
		const supabaseAdmin = createServiceClient();
		const auth = await resolveRequestAuth(req, supabaseAdmin);
		const rateLimit = await enforceRateLimit(supabaseAdmin, req, {
			bucket: "collected-card-media",
			maxRequests: 180,
			identity: auth.user?.id ?? null,
			identityMaxRequests: 240,
		});
		if (!rateLimit.allowed) {
			return jsonResponse(req, 429, {
				error: rateLimit.reason ?? "Trop de demandes.",
				code: "RATE_LIMIT_EXCEEDED",
			});
		}

		const config = getStorageConfig();
		const contentType = toTrimmedString(req.headers.get("content-type"));

		if (contentType.toLowerCase().includes("multipart/form-data")) {
			const formData = await req.formData();
			const action = toTrimmedString(formData.get("action"));
			if (action !== "save") {
				return jsonResponse(req, 400, {
					error: "Action multipart non supportee.",
					code: "INVALID_MULTIPART_ACTION",
				});
			}

			return await handleSave(req, supabaseAdmin, config, auth, formData);
		}

		const payload = (await req.json()) as Record<string, unknown>;
		const action = toTrimmedString(payload.action);
		if (action === "resolve-cards") {
			return await handleResolveCards(
				req,
				supabaseAdmin,
				config,
				auth,
				payload,
			);
		}
		if (action === "delete-slot") {
			return await handleDeleteSlot(req, supabaseAdmin, config, auth, payload);
		}

		return jsonResponse(req, 400, {
			error: "Action non supportee.",
			code: "INVALID_ACTION",
		});
	} catch (error) {
		const authError =
			error instanceof Error && error.message.startsWith("AUTH_")
				? error
				: null;
		if (authError) {
			return jsonResponse(req, 401, {
				error: authError.message,
				code: authError.message,
			});
		}

		const message =
			error instanceof Error && error.message.trim().length > 0
				? error.message
				: "Erreur inattendue lors de la gestion des medias collectes.";
		console.error("[collected-card-media]", message);
		return jsonResponse(req, 500, {
			error: "Impossible de gerer les medias de cette carte.",
			code: "COLLECTED_CARD_MEDIA_FAILED",
			details: message,
		});
	}
});
