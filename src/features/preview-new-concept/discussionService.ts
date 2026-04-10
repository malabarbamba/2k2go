import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type {
	Tables,
	TablesInsert,
	TablesUpdate,
} from "@/integrations/supabase/types";
import type { VocabCard } from "@/lib/deck-perso-adapters";

export const PREVIEW_DISCUSSION_AUDIO_BUCKET =
	"preview-session-discussion-audio";
export const PREVIEW_DISCUSSION_SIGNED_URL_TTL_SECONDS = 60 * 60;

const PREVIEW_DISCUSSION_AUTH_MESSAGE =
	"Tu dois etre connecte pour utiliser les discussions du preview.";
const PREVIEW_DISCUSSION_MAX_AUDIO_DURATION_MS = 7000;
const PREVIEW_DISCUSSION_MAX_REPLY_TEXT_LENGTH = 70;
const PREVIEW_DISCUSSION_TEXT_MESSAGE_SELECT_COLUMNS =
	"id, user_id, vocabulary_card_id, foundation_card_id, message_text, created_at, updated_at";
const PREVIEW_DISCUSSION_AUDIO_POST_SELECT_COLUMNS =
	"id, user_id, vocabulary_card_id, foundation_card_id, audio_storage_path, recording_duration_ms, share_selected, share_session_key, share_marked_at, share_dispatched_at, created_at, updated_at";
const PREVIEW_DISCUSSION_AUDIO_REPLY_SELECT_COLUMNS =
	"id, audio_post_id, user_id, body_text, audio_storage_path, audio_duration_ms, created_at, updated_at";

type PreviewDiscussionTextMessageRow = Tables<"preview_session_text_messages">;
type PreviewDiscussionTextMessageInsert =
	TablesInsert<"preview_session_text_messages">;
type PreviewDiscussionTextMessageUpdate =
	TablesUpdate<"preview_session_text_messages">;
type PreviewDiscussionAudioPostRow = Tables<"preview_session_audio_posts">;
type PreviewDiscussionAudioPostInsert =
	TablesInsert<"preview_session_audio_posts">;
type PreviewDiscussionAudioPostUpdate =
	TablesUpdate<"preview_session_audio_posts">;
type PreviewDiscussionAudioReplyRow = Tables<"preview_session_audio_replies">;
type PreviewDiscussionAudioReplyInsert =
	TablesInsert<"preview_session_audio_replies">;
type PreviewDiscussionAudioReplyUpdate =
	TablesUpdate<"preview_session_audio_replies">;
type PreviewDiscussionProfileRow = {
	avatar_url: string | null;
	display_name: string | null;
	user_id: string;
	username: string | null;
};

type ErrorLike = {
	code?: string | null;
	details?: string | null;
	message?: string | null;
};

type PreviewDiscussionCardIds = {
	foundationCardId: string | null;
	vocabularyCardId: string | null;
};

export type PreviewDiscussionCardRef =
	| {
			cardId: string;
			cardKey: string;
			cardType: "vocabulary";
			foundationCardId: null;
			vocabularyCardId: string;
	  }
	| {
			cardId: string;
			cardKey: string;
			cardType: "foundation";
			foundationCardId: string;
			vocabularyCardId: null;
	  };

export type PreviewDiscussionAuthor = {
	avatarUrl: string | null;
	displayName: string;
	firstName: string | null;
	initials: string;
	isCurrentUser: boolean;
	lastName: string | null;
	primaryName: string;
	userId: string;
	username: string | null;
};

export type PreviewDiscussionTextMessage = {
	author: PreviewDiscussionAuthor;
	cardRef: PreviewDiscussionCardRef;
	createdAt: string;
	id: string;
	messageText: string;
	relativeTime: string;
	updatedAt: string;
	userId: string;
};

export type PreviewDiscussionAudioPost = {
	author: PreviewDiscussionAuthor;
	recordingDurationMs: number | null;
	shareDispatchedAt: string | null;
	shareMarkedAt: string | null;
	shareSelected: boolean;
	shareSessionKey: string | null;
	audioStoragePath: string;
	audioUrl: string | null;
	cardRef: PreviewDiscussionCardRef;
	createdAt: string;
	id: string;
	relativeTime: string;
	updatedAt: string;
	userId: string;
};

export type PreviewDiscussionPrivateAudioReply = {
	audioPostId: string;
	audioDurationMs: number | null;
	audioStoragePath: string | null;
	audioUrl: string | null;
	author: PreviewDiscussionAuthor;
	createdAt: string;
	id: string;
	relativeTime: string;
	text: string | null;
	updatedAt: string;
	userId: string;
};

export type PreviewDiscussionAudioUploadScope = "audio-posts" | "audio-replies";

export type UploadPreviewDiscussionAudioFileInput = {
	entityId: string;
	file: File;
	scope: PreviewDiscussionAudioUploadScope;
	userId?: string;
};

export type CreatePreviewDiscussionTextMessageInput = {
	card: PreviewDiscussionCardRef | VocabCard;
	messageText: string;
};

export type CreateOrReplaceCurrentUserPreviewDiscussionAudioPostInput = {
	audioFile?: File | null;
	audioStoragePath?: string | null;
	card: PreviewDiscussionCardRef | VocabCard;
	recordingDurationMs?: number | null;
};

export type CreatePreviewDiscussionPrivateAudioReplyInput = {
	audioFile?: File | null;
	audioPostId: string;
	audioStoragePath?: string | null;
	audioDurationMs?: number | null;
	text?: string | null;
};

export type SetPreviewSessionAudioPostShareIntentInput = {
	audioPostId: string;
	selected: boolean;
	sessionKey?: string | null;
};

export type DispatchPreviewSessionAudioShareBatchResult = {
	alreadyDispatched: boolean;
	notifiedFriendCount: number;
	sharedAudioCount: number;
};

export type UpdatePreviewDiscussionTextMessageInput = {
	messageId: string;
	messageText: string;
};

export type UpdatePreviewDiscussionPrivateAudioReplyInput = {
	replyId: string;
	text: string;
};

const trimOptionalString = (value: unknown): string | null => {
	if (typeof value !== "string") {
		return null;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : null;
};

const normalizeAudioDurationMs = (value: unknown): number | null => {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return null;
	}

	const normalizedValue = Math.round(value);
	if (normalizedValue <= 0) {
		return null;
	}

	return normalizedValue;
};

const parseAudioDurationMsOrThrow = (
	value: unknown,
	errorMessage: string,
): number | null => {
	if (value === null || typeof value === "undefined") {
		return null;
	}

	const normalizedDurationMs = normalizeAudioDurationMs(value);
	if (normalizedDurationMs === null) {
		throw new Error(errorMessage);
	}

	if (normalizedDurationMs > PREVIEW_DISCUSSION_MAX_AUDIO_DURATION_MS) {
		throw new Error(
			`L'audio depasse ${PREVIEW_DISCUSSION_MAX_AUDIO_DURATION_MS / 1000} secondes.`,
		);
	}

	return normalizedDurationMs;
};

const normalizeObjectPath = (value: string): string =>
	value.replace(/^\/+/, "").trim();

const generateUuid = (): string => {
	const cryptoRef =
		typeof globalThis !== "undefined" ? globalThis.crypto : null;
	if (cryptoRef?.randomUUID) {
		return cryptoRef.randomUUID();
	}

	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
};

const resolveAudioFileExtension = (file: File): string => {
	const explicitExtension = file.name.split(".").pop()?.trim().toLowerCase();
	if (explicitExtension) {
		return explicitExtension;
	}

	if (file.type.includes("ogg")) {
		return "ogg";
	}

	if (file.type.includes("mpeg") || file.type.includes("mp3")) {
		return "mp3";
	}

	if (file.type.includes("mp4") || file.type.includes("m4a")) {
		return "m4a";
	}

	if (file.type.includes("aac")) {
		return "aac";
	}

	if (file.type.includes("wav")) {
		return "wav";
	}

	return "webm";
};

const normalizeDiscussionErrorMessage = (
	error: ErrorLike | null | undefined,
	fallbackMessage: string,
): string => {
	const haystack =
		`${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`
			.toLowerCase()
			.trim();

	if (
		haystack.includes("jwt") ||
		haystack.includes("auth") ||
		haystack.includes("permission") ||
		haystack.includes("token") ||
		error?.code === "PGRST301"
	) {
		return PREVIEW_DISCUSSION_AUTH_MESSAGE;
	}

	const trimmedMessage = trimOptionalString(error?.message);
	return trimmedMessage ?? fallbackMessage;
};

const normalizeSignedUrlPathList = (paths: string[]): string[] =>
	Array.from(
		new Set(
			paths
				.map((path) => normalizeObjectPath(path))
				.filter((path) => path.length > 0),
		),
	);

const isPreviewDiscussionCardRef = (
	value: PreviewDiscussionCardRef | VocabCard,
): value is PreviewDiscussionCardRef =>
	"cardKey" in value &&
	"cardType" in value &&
	(value.cardType === "vocabulary" || value.cardType === "foundation");

const buildPreviewDiscussionCardRefFromIds = ({
	foundationCardId,
	vocabularyCardId,
}: PreviewDiscussionCardIds): PreviewDiscussionCardRef => {
	const normalizedVocabularyCardId = trimOptionalString(vocabularyCardId);
	const normalizedFoundationCardId = trimOptionalString(foundationCardId);

	if (normalizedVocabularyCardId && !normalizedFoundationCardId) {
		return {
			cardId: normalizedVocabularyCardId,
			cardKey: `v:${normalizedVocabularyCardId}`,
			cardType: "vocabulary",
			foundationCardId: null,
			vocabularyCardId: normalizedVocabularyCardId,
		};
	}

	if (normalizedFoundationCardId && !normalizedVocabularyCardId) {
		return {
			cardId: normalizedFoundationCardId,
			cardKey: `f:${normalizedFoundationCardId}`,
			cardType: "foundation",
			foundationCardId: normalizedFoundationCardId,
			vocabularyCardId: null,
		};
	}

	throw new Error(
		"La discussion preview exige exactement un vocabularyCardId ou un foundationCardId.",
	);
};

const toPreviewDiscussionCardRef = (
	value: PreviewDiscussionCardRef | VocabCard,
): PreviewDiscussionCardRef =>
	isPreviewDiscussionCardRef(value)
		? value
		: buildPreviewDiscussionCardRef(value);

const toPreviewDiscussionCardColumns = (
	cardRef: PreviewDiscussionCardRef,
): PreviewDiscussionCardIds => ({
	foundationCardId: cardRef.foundationCardId,
	vocabularyCardId: cardRef.vocabularyCardId,
});

const getPreviewDiscussionCurrentUserId = async (): Promise<string | null> => {
	try {
		const { data, error } = await supabase.auth.getUser();
		if (!error && data.user?.id) {
			return data.user.id;
		}
	} catch {
		// Fallback to getSession below.
	}

	try {
		const { data, error } = await supabase.auth.getSession();
		const sessionUserId = data.session?.user?.id ?? null;
		if (
			!error &&
			typeof sessionUserId === "string" &&
			sessionUserId.length > 0
		) {
			return sessionUserId;
		}
	} catch {
		return null;
	}

	return null;
};

const requirePreviewDiscussionCurrentUserId = async (): Promise<string> => {
	const userId = await getPreviewDiscussionCurrentUserId();
	if (!userId) {
		throw new Error(PREVIEW_DISCUSSION_AUTH_MESSAGE);
	}

	return userId;
};

const normalizePreviewDiscussionUserIds = (userIds: string[]): string[] =>
	Array.from(
		new Set(
			userIds
				.map((userId) => trimOptionalString(userId))
				.filter((userId): userId is string => userId !== null),
		),
	);

export const getPreviewDiscussionDisplayName = (
	profile:
		| {
				firstName?: string | null;
				lastName?: string | null;
				username?: string | null;
		  }
		| null
		| undefined,
): string => {
	const firstName = trimOptionalString(profile?.firstName);
	const lastName = trimOptionalString(profile?.lastName);
	const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
	if (fullName) {
		return fullName;
	}

	const username = trimOptionalString(profile?.username);
	if (username) {
		return `@${username}`;
	}

	return "Apprenant";
};

export const getPreviewDiscussionPrimaryName = (
	profile:
		| {
				firstName?: string | null;
				lastName?: string | null;
				username?: string | null;
		  }
		| null
		| undefined,
): string => {
	const firstName = trimOptionalString(profile?.firstName);
	if (firstName) {
		return firstName;
	}

	const displayName = getPreviewDiscussionDisplayName(profile)
		.replace(/^@/, "")
		.trim();
	const [primaryName] = displayName.split(/\s+/).filter(Boolean);
	return primaryName || "Apprenant";
};

export const getPreviewDiscussionInitials = (
	profile:
		| {
				firstName?: string | null;
				lastName?: string | null;
				username?: string | null;
		  }
		| null
		| undefined,
): string => {
	const displayName = getPreviewDiscussionDisplayName(profile)
		.replace(/^@/, "")
		.trim();
	const parts = displayName.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "AP";
	}

	return parts
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
};

export const formatPreviewDiscussionRelativeTime = (
	value: string | null | undefined,
	referenceDate: Date = new Date(),
): string => {
	if (!value) {
		return "Maintenant";
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return "Maintenant";
	}

	const diffMs = Math.max(0, referenceDate.getTime() - parsed.getTime());
	const diffSeconds = Math.floor(diffMs / 1000);
	if (diffSeconds < 60) {
		return "Maintenant";
	}

	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) {
		return diffMinutes === 1 ? "Il y a 1 min" : `Il y a ${diffMinutes} min`;
	}

	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) {
		return diffHours === 1 ? "Il y a 1 h" : `Il y a ${diffHours} h`;
	}

	const diffDays = Math.floor(diffHours / 24);
	if (diffDays === 1) {
		return "Hier";
	}

	if (diffDays < 7) {
		return parsed.toLocaleDateString("fr-FR", { weekday: "long" });
	}

	return parsed.toLocaleDateString("fr-FR", {
		day: "numeric",
		month: "short",
	});
};

const buildFallbackPreviewDiscussionAuthor = (
	userId: string,
	currentUserId: string | null,
): PreviewDiscussionAuthor => {
	const displayName = getPreviewDiscussionDisplayName(null);
	return {
		avatarUrl: null,
		displayName,
		firstName: null,
		initials: getPreviewDiscussionInitials(null),
		isCurrentUser: currentUserId === userId,
		lastName: null,
		primaryName: getPreviewDiscussionPrimaryName(null),
		userId,
		username: null,
	};
};

const mapPreviewDiscussionProfileRowToAuthor = (
	row: PreviewDiscussionProfileRow,
	currentUserId: string | null,
): PreviewDiscussionAuthor => {
	const displayName = row.display_name?.trim() ?? "";
	const [firstNameRaw, ...lastNameParts] =
		displayName.length > 0 ? displayName.split(/\s+/) : [];
	const firstName = firstNameRaw?.trim() ?? null;
	const lastName = lastNameParts.join(" ").trim() || null;

	return {
		avatarUrl: row.avatar_url,
		displayName: getPreviewDiscussionDisplayName({
			firstName,
			lastName,
			username: row.username,
		}),
		firstName,
		initials: getPreviewDiscussionInitials({
			firstName,
			lastName,
			username: row.username,
		}),
		isCurrentUser: currentUserId === row.user_id,
		lastName,
		primaryName: getPreviewDiscussionPrimaryName({
			firstName,
			lastName,
			username: row.username,
		}),
		userId: row.user_id,
		username: row.username,
	};
};

const fetchPreviewDiscussionAuthorsByUserId = async (
	userIds: string[],
	currentUserId: string | null,
): Promise<Map<string, PreviewDiscussionAuthor>> => {
	const authorsByUserId = new Map<string, PreviewDiscussionAuthor>();
	const normalizedUserIds = normalizePreviewDiscussionUserIds(userIds);
	if (normalizedUserIds.length === 0) {
		return authorsByUserId;
	}

	const { data, error } = await (supabase as unknown as {
		rpc: (
			fn: string,
			args?: Record<string, unknown>,
		) => Promise<{ data: unknown; error: PostgrestError | null }>;
	}).rpc("list_profiles_by_user_ids_v1", {
		p_user_ids: normalizedUserIds,
	});

	if (error) {
		console.error("Unable to load preview discussion authors:", error);
		return authorsByUserId;
	}

	const rows = Array.isArray(data) ? (data as PreviewDiscussionProfileRow[]) : [];
	rows.forEach((row) => {
		authorsByUserId.set(
			row.user_id,
			mapPreviewDiscussionProfileRowToAuthor(row, currentUserId),
		);
	});

	return authorsByUserId;
};

const validatePreviewDiscussionAudioObjectPath = ({
	objectPath,
	scope,
	userId,
}: {
	objectPath: string;
	scope: PreviewDiscussionAudioUploadScope;
	userId: string;
}) => {
	const normalizedObjectPath = normalizeObjectPath(objectPath);
	const expectedPrefix = `${userId}/${scope}/`;
	if (!normalizedObjectPath.startsWith(expectedPrefix)) {
		throw new Error(
			`Le chemin audio doit commencer par ${expectedPrefix} pour rester compatible avec les policies preview.`,
		);
	}

	return normalizedObjectPath;
};

const removePreviewDiscussionAudioObject = async (
	objectPath: string | null | undefined,
) => {
	const normalizedObjectPath =
		typeof objectPath === "string" ? normalizeObjectPath(objectPath) : "";
	if (!normalizedObjectPath) {
		return;
	}

	const { error } = await supabase.storage
		.from(PREVIEW_DISCUSSION_AUDIO_BUCKET)
		.remove([normalizedObjectPath]);

	if (error) {
		console.error("Unable to remove preview discussion audio object:", error);
	}
};

const mapPreviewDiscussionTextMessageRow = ({
	currentUserId,
	row,
	authorsByUserId,
}: {
	currentUserId: string | null;
	row: PreviewDiscussionTextMessageRow;
	authorsByUserId: Map<string, PreviewDiscussionAuthor>;
}): PreviewDiscussionTextMessage => ({
	author:
		authorsByUserId.get(row.user_id) ??
		buildFallbackPreviewDiscussionAuthor(row.user_id, currentUserId),
	cardRef: buildPreviewDiscussionCardRefFromIds({
		foundationCardId: row.foundation_card_id,
		vocabularyCardId: row.vocabulary_card_id,
	}),
	createdAt: row.created_at,
	id: row.id,
	messageText: row.message_text,
	relativeTime: formatPreviewDiscussionRelativeTime(row.created_at),
	updatedAt: row.updated_at,
	userId: row.user_id,
});

const mapPreviewDiscussionAudioPostRow = ({
	currentUserId,
	row,
	audioUrlsByPath,
	authorsByUserId,
}: {
	currentUserId: string | null;
	row: PreviewDiscussionAudioPostRow;
	audioUrlsByPath: Record<string, string>;
	authorsByUserId: Map<string, PreviewDiscussionAuthor>;
}): PreviewDiscussionAudioPost => ({
	author:
		authorsByUserId.get(row.user_id) ??
		buildFallbackPreviewDiscussionAuthor(row.user_id, currentUserId),
	recordingDurationMs: normalizeAudioDurationMs(row.recording_duration_ms),
	shareDispatchedAt: row.share_dispatched_at,
	shareMarkedAt: row.share_marked_at,
	shareSelected: row.share_selected,
	shareSessionKey: row.share_session_key,
	audioStoragePath: row.audio_storage_path,
	audioUrl: audioUrlsByPath[row.audio_storage_path] ?? null,
	cardRef: buildPreviewDiscussionCardRefFromIds({
		foundationCardId: row.foundation_card_id,
		vocabularyCardId: row.vocabulary_card_id,
	}),
	createdAt: row.created_at,
	id: row.id,
	relativeTime: formatPreviewDiscussionRelativeTime(row.updated_at),
	updatedAt: row.updated_at,
	userId: row.user_id,
});

const mapPreviewDiscussionAudioReplyRow = ({
	currentUserId,
	row,
	audioUrlsByPath,
	authorsByUserId,
}: {
	currentUserId: string | null;
	row: PreviewDiscussionAudioReplyRow;
	audioUrlsByPath: Record<string, string>;
	authorsByUserId: Map<string, PreviewDiscussionAuthor>;
}): PreviewDiscussionPrivateAudioReply => ({
	audioPostId: row.audio_post_id,
	audioDurationMs: normalizeAudioDurationMs(row.audio_duration_ms),
	audioStoragePath: row.audio_storage_path,
	audioUrl:
		row.audio_storage_path !== null
			? (audioUrlsByPath[row.audio_storage_path] ?? null)
			: null,
	author:
		authorsByUserId.get(row.user_id) ??
		buildFallbackPreviewDiscussionAuthor(row.user_id, currentUserId),
	createdAt: row.created_at,
	id: row.id,
	relativeTime: formatPreviewDiscussionRelativeTime(row.created_at),
	text: row.body_text,
	updatedAt: row.updated_at,
	userId: row.user_id,
});

export function buildPreviewDiscussionCardRef(
	card: Pick<VocabCard, "foundationCardId" | "vocabularyCardId">,
): PreviewDiscussionCardRef {
	return buildPreviewDiscussionCardRefFromIds({
		foundationCardId: card.foundationCardId ?? null,
		vocabularyCardId: card.vocabularyCardId ?? null,
	});
}

export function buildPreviewDiscussionAudioObjectPath({
	entityId,
	extension,
	scope,
	userId,
}: {
	entityId: string;
	extension: string;
	scope: PreviewDiscussionAudioUploadScope;
	userId: string;
}): string {
	const normalizedExtension = extension.replace(/^\.+/, "").trim() || "bin";
	return `${userId}/${scope}/${entityId}/${Date.now()}-${generateUuid()}.${normalizedExtension}`;
}

export async function uploadPreviewDiscussionAudioFile({
	entityId,
	file,
	scope,
	userId,
}: UploadPreviewDiscussionAudioFileInput): Promise<{
	entityId: string;
	objectPath: string;
	userId: string;
}> {
	const resolvedUserId =
		userId ?? (await requirePreviewDiscussionCurrentUserId());
	const normalizedEntityId = trimOptionalString(entityId);
	if (!normalizedEntityId) {
		throw new Error(
			"Impossible de televerser un audio sans identifiant cible.",
		);
	}

	const objectPath = buildPreviewDiscussionAudioObjectPath({
		entityId: normalizedEntityId,
		extension: resolveAudioFileExtension(file),
		scope,
		userId: resolvedUserId,
	});

	const { error } = await supabase.storage
		.from(PREVIEW_DISCUSSION_AUDIO_BUCKET)
		.upload(objectPath, file, {
			cacheControl: "3600",
			contentType: trimOptionalString(file.type) ?? undefined,
			upsert: false,
		});

	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de televerser l'audio de la discussion preview.",
			),
		);
	}

	return {
		entityId: normalizedEntityId,
		objectPath,
		userId: resolvedUserId,
	};
}

export async function createPreviewDiscussionAudioSignedUrls(
	paths: string[],
	expiresIn = PREVIEW_DISCUSSION_SIGNED_URL_TTL_SECONDS,
): Promise<Record<string, string>> {
	const normalizedPaths = normalizeSignedUrlPathList(paths);
	if (normalizedPaths.length === 0) {
		return {};
	}

	const { data, error } = await supabase.storage
		.from(PREVIEW_DISCUSSION_AUDIO_BUCKET)
		.createSignedUrls(normalizedPaths, expiresIn);

	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de signer les audios de la discussion preview.",
			),
		);
	}

	const signedUrlsByPath: Record<string, string> = {};
	for (const item of data ?? []) {
		if (item.path && item.signedUrl) {
			signedUrlsByPath[item.path] = item.signedUrl;
		}
	}

	return signedUrlsByPath;
}

export async function createPreviewDiscussionAudioSignedUrl(
	path: string | null | undefined,
	expiresIn = PREVIEW_DISCUSSION_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
	const normalizedPath = trimOptionalString(path);
	if (!normalizedPath) {
		return null;
	}

	const signedUrlsByPath = await createPreviewDiscussionAudioSignedUrls(
		[normalizedPath],
		expiresIn,
	);
	return signedUrlsByPath[normalizeObjectPath(normalizedPath)] ?? null;
}

export async function listPreviewDiscussionTextMessages(
	card: PreviewDiscussionCardRef | VocabCard,
): Promise<PreviewDiscussionTextMessage[]> {
	const cardRef = toPreviewDiscussionCardRef(card);
	let query = supabase
		.from("preview_session_text_messages")
		.select(PREVIEW_DISCUSSION_TEXT_MESSAGE_SELECT_COLUMNS)
		.order("created_at", { ascending: true });

	if (cardRef.cardType === "vocabulary") {
		query = query
			.eq("vocabulary_card_id", cardRef.vocabularyCardId)
			.is("foundation_card_id", null);
	} else {
		query = query
			.eq("foundation_card_id", cardRef.foundationCardId)
			.is("vocabulary_card_id", null);
	}

	const { data, error } = await query;
	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de charger les messages texte du preview.",
			),
		);
	}

	const rows = data ?? [];
	const currentUserId = await getPreviewDiscussionCurrentUserId();
	const authorsByUserId = await fetchPreviewDiscussionAuthorsByUserId(
		rows.map((row) => row.user_id),
		currentUserId,
	);

	return rows.map((row) =>
		mapPreviewDiscussionTextMessageRow({
			currentUserId,
			row,
			authorsByUserId,
		}),
	);
}

export async function createPreviewDiscussionTextMessage({
	card,
	messageText,
}: CreatePreviewDiscussionTextMessageInput): Promise<PreviewDiscussionTextMessage> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedMessageText = trimOptionalString(messageText);
	if (!normalizedMessageText) {
		throw new Error("Le message texte ne peut pas etre vide.");
	}

	const cardRef = toPreviewDiscussionCardRef(card);
	const cardColumns = toPreviewDiscussionCardColumns(cardRef);
	const insertRow: PreviewDiscussionTextMessageInsert = {
		foundation_card_id: cardColumns.foundationCardId,
		message_text: normalizedMessageText,
		user_id: currentUserId,
		vocabulary_card_id: cardColumns.vocabularyCardId,
	};

	const { data, error } = await supabase
		.from("preview_session_text_messages")
		.insert(insertRow)
		.select(PREVIEW_DISCUSSION_TEXT_MESSAGE_SELECT_COLUMNS)
		.maybeSingle();

	if (error || !data) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible d'envoyer le message texte du preview.",
			),
		);
	}

	const authorsByUserId = await fetchPreviewDiscussionAuthorsByUserId(
		[data.user_id],
		currentUserId,
	);

	return mapPreviewDiscussionTextMessageRow({
		currentUserId,
		row: data,
		authorsByUserId,
	});
}

export async function updatePreviewDiscussionTextMessage({
	messageId,
	messageText,
}: UpdatePreviewDiscussionTextMessageInput): Promise<PreviewDiscussionTextMessage> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedMessageId = trimOptionalString(messageId);
	if (!normalizedMessageId) {
		throw new Error("Impossible de modifier un message sans identifiant.");
	}

	const normalizedMessageText = trimOptionalString(messageText);
	if (!normalizedMessageText) {
		throw new Error("Le message texte ne peut pas etre vide.");
	}

	const updateRow: PreviewDiscussionTextMessageUpdate = {
		message_text: normalizedMessageText,
	};

	const { data, error } = await supabase
		.from("preview_session_text_messages")
		.update(updateRow)
		.eq("id", normalizedMessageId)
		.eq("user_id", currentUserId)
		.select(PREVIEW_DISCUSSION_TEXT_MESSAGE_SELECT_COLUMNS)
		.maybeSingle();

	if (error || !data) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de modifier le message texte du preview.",
			),
		);
	}

	const authorsByUserId = await fetchPreviewDiscussionAuthorsByUserId(
		[data.user_id],
		currentUserId,
	);

	return mapPreviewDiscussionTextMessageRow({
		currentUserId,
		row: data,
		authorsByUserId,
	});
}

export async function deletePreviewDiscussionTextMessage(
	messageId: string,
): Promise<void> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedMessageId = trimOptionalString(messageId);
	if (!normalizedMessageId) {
		throw new Error("Impossible de supprimer un message sans identifiant.");
	}

	const { error } = await supabase
		.from("preview_session_text_messages")
		.delete()
		.eq("id", normalizedMessageId)
		.eq("user_id", currentUserId);

	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de supprimer le message texte du preview.",
			),
		);
	}
}

export async function listPreviewDiscussionAudioPosts(
	card: PreviewDiscussionCardRef | VocabCard,
): Promise<PreviewDiscussionAudioPost[]> {
	const cardRef = toPreviewDiscussionCardRef(card);
	let query = supabase
		.from("preview_session_audio_posts")
		.select(PREVIEW_DISCUSSION_AUDIO_POST_SELECT_COLUMNS)
		.order("updated_at", { ascending: false });

	if (cardRef.cardType === "vocabulary") {
		query = query
			.eq("vocabulary_card_id", cardRef.vocabularyCardId)
			.is("foundation_card_id", null);
	} else {
		query = query
			.eq("foundation_card_id", cardRef.foundationCardId)
			.is("vocabulary_card_id", null);
	}

	const { data, error } = await query;
	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de charger les audios du preview.",
			),
		);
	}

	const rows = data ?? [];
	const currentUserId = await getPreviewDiscussionCurrentUserId();
	const [authorsByUserId, audioUrlsByPath] = await Promise.all([
		fetchPreviewDiscussionAuthorsByUserId(
			rows.map((row) => row.user_id),
			currentUserId,
		),
		createPreviewDiscussionAudioSignedUrls(
			rows.map((row) => row.audio_storage_path),
		),
	]);

	return rows.map((row) =>
		mapPreviewDiscussionAudioPostRow({
			currentUserId,
			row,
			audioUrlsByPath,
			authorsByUserId,
		}),
	);
}

export async function deletePreviewDiscussionAudioPost(
	audioPostId: string,
): Promise<void> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedAudioPostId = trimOptionalString(audioPostId);
	if (!normalizedAudioPostId) {
		throw new Error("Impossible de supprimer un audio sans identifiant.");
	}

	const { data: existingPost, error: selectError } = await supabase
		.from("preview_session_audio_posts")
		.select(PREVIEW_DISCUSSION_AUDIO_POST_SELECT_COLUMNS)
		.eq("id", normalizedAudioPostId)
		.eq("user_id", currentUserId)
		.maybeSingle();

	if (selectError || !existingPost) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				selectError,
				"Impossible de charger l'audio à supprimer.",
			),
		);
	}

	const { error } = await supabase
		.from("preview_session_audio_posts")
		.delete()
		.eq("id", normalizedAudioPostId)
		.eq("user_id", currentUserId);

	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de supprimer l'audio du preview.",
			),
		);
	}

	await removePreviewDiscussionAudioObject(existingPost.audio_storage_path);
}

export async function createOrReplaceCurrentUserPreviewDiscussionAudioPost({
	audioFile,
	audioStoragePath,
	card,
	recordingDurationMs,
}: CreateOrReplaceCurrentUserPreviewDiscussionAudioPostInput): Promise<PreviewDiscussionAudioPost> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const cardRef = toPreviewDiscussionCardRef(card);
	const cardColumns = toPreviewDiscussionCardColumns(cardRef);
	const normalizedRecordingDurationMs = parseAudioDurationMsOrThrow(
		recordingDurationMs,
		"La duree de l'audio est invalide.",
	);

	let existingQuery = supabase
		.from("preview_session_audio_posts")
		.select(PREVIEW_DISCUSSION_AUDIO_POST_SELECT_COLUMNS)
		.eq("user_id", currentUserId);

	if (cardRef.cardType === "vocabulary") {
		existingQuery = existingQuery
			.eq("vocabulary_card_id", cardRef.vocabularyCardId)
			.is("foundation_card_id", null);
	} else {
		existingQuery = existingQuery
			.eq("foundation_card_id", cardRef.foundationCardId)
			.is("vocabulary_card_id", null);
	}

	const { data: existingRow, error: existingError } =
		await existingQuery.maybeSingle();
	if (existingError) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				existingError,
				"Impossible de verifier l'audio actuel du preview.",
			),
		);
	}

	const audioPostId = existingRow?.id ?? generateUuid();
	let resolvedAudioStoragePath = trimOptionalString(audioStoragePath);
	let uploadedAudioStoragePath: string | null = null;

	if (!resolvedAudioStoragePath && audioFile instanceof File) {
		const uploadResult = await uploadPreviewDiscussionAudioFile({
			entityId: audioPostId,
			file: audioFile,
			scope: "audio-posts",
			userId: currentUserId,
		});
		resolvedAudioStoragePath = uploadResult.objectPath;
		uploadedAudioStoragePath = uploadResult.objectPath;
	}

	if (!resolvedAudioStoragePath) {
		throw new Error(
			"Un audio fichier ou un chemin audio existant est requis pour publier l'audio du preview.",
		);
	}

	resolvedAudioStoragePath = validatePreviewDiscussionAudioObjectPath({
		objectPath: resolvedAudioStoragePath,
		scope: "audio-posts",
		userId: currentUserId,
	});

	let savedRow: PreviewDiscussionAudioPostRow | null = null;
	try {
		if (existingRow) {
			const updateRow: PreviewDiscussionAudioPostUpdate = {
				audio_storage_path: resolvedAudioStoragePath,
				recording_duration_ms: normalizedRecordingDurationMs,
			};

			const { data, error } = await supabase
				.from("preview_session_audio_posts")
				.update(updateRow)
				.eq("id", existingRow.id)
				.eq("user_id", currentUserId)
				.select(PREVIEW_DISCUSSION_AUDIO_POST_SELECT_COLUMNS)
				.maybeSingle();

			if (error || !data) {
				throw new Error(
					normalizeDiscussionErrorMessage(
						error,
						"Impossible de remplacer l'audio du preview.",
					),
				);
			}

			savedRow = data;
		} else {
			const insertRow: PreviewDiscussionAudioPostInsert = {
				audio_storage_path: resolvedAudioStoragePath,
				foundation_card_id: cardColumns.foundationCardId,
				id: audioPostId,
				recording_duration_ms: normalizedRecordingDurationMs,
				user_id: currentUserId,
				vocabulary_card_id: cardColumns.vocabularyCardId,
			};

			const { data, error } = await supabase
				.from("preview_session_audio_posts")
				.insert(insertRow)
				.select(PREVIEW_DISCUSSION_AUDIO_POST_SELECT_COLUMNS)
				.maybeSingle();

			if (error || !data) {
				throw new Error(
					normalizeDiscussionErrorMessage(
						error,
						"Impossible de publier l'audio du preview.",
					),
				);
			}

			savedRow = data;
		}
	} catch (error) {
		if (uploadedAudioStoragePath) {
			await removePreviewDiscussionAudioObject(uploadedAudioStoragePath);
		}

		throw error;
	}

	if (
		existingRow?.audio_storage_path &&
		existingRow.audio_storage_path !== resolvedAudioStoragePath
	) {
		await removePreviewDiscussionAudioObject(existingRow.audio_storage_path);
	}

	const [authorsByUserId, audioUrlsByPath] = await Promise.all([
		fetchPreviewDiscussionAuthorsByUserId([savedRow.user_id], currentUserId),
		createPreviewDiscussionAudioSignedUrls([savedRow.audio_storage_path]),
	]);

	return mapPreviewDiscussionAudioPostRow({
		currentUserId,
		row: savedRow,
		audioUrlsByPath,
		authorsByUserId,
	});
}

export async function listPreviewDiscussionPrivateReplies(
	audioPostId: string,
): Promise<PreviewDiscussionPrivateAudioReply[]> {
	const normalizedAudioPostId = trimOptionalString(audioPostId);
	if (!normalizedAudioPostId) {
		throw new Error("Impossible de charger des reponses sans audioPostId.");
	}

	const { data, error } = await supabase
		.from("preview_session_audio_replies")
		.select(PREVIEW_DISCUSSION_AUDIO_REPLY_SELECT_COLUMNS)
		.eq("audio_post_id", normalizedAudioPostId)
		.order("created_at", { ascending: true });

	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de charger les reponses privees du preview.",
			),
		);
	}

	const rows = data ?? [];
	const currentUserId = await getPreviewDiscussionCurrentUserId();
	const [authorsByUserId, audioUrlsByPath] = await Promise.all([
		fetchPreviewDiscussionAuthorsByUserId(
			rows.map((row) => row.user_id),
			currentUserId,
		),
		createPreviewDiscussionAudioSignedUrls(
			rows
				.map((row) => row.audio_storage_path)
				.filter((path): path is string => typeof path === "string"),
		),
	]);

	return rows.map((row) =>
		mapPreviewDiscussionAudioReplyRow({
			currentUserId,
			row,
			audioUrlsByPath,
			authorsByUserId,
		}),
	);
}

export async function createPreviewDiscussionPrivateAudioReply({
	audioFile,
	audioPostId,
	audioStoragePath,
	audioDurationMs,
	text,
}: CreatePreviewDiscussionPrivateAudioReplyInput): Promise<PreviewDiscussionPrivateAudioReply> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedAudioPostId = trimOptionalString(audioPostId);
	if (!normalizedAudioPostId) {
		throw new Error("Impossible de creer une reponse sans audioPostId.");
	}

	const normalizedText = trimOptionalString(text);
	if (
		normalizedText &&
		normalizedText.length > PREVIEW_DISCUSSION_MAX_REPLY_TEXT_LENGTH
	) {
		throw new Error(
			`La reponse texte est limitee a ${PREVIEW_DISCUSSION_MAX_REPLY_TEXT_LENGTH} caracteres.`,
		);
	}

	const normalizedAudioDurationMs = parseAudioDurationMsOrThrow(
		audioDurationMs,
		"La duree de la reponse audio est invalide.",
	);
	let resolvedAudioStoragePath = trimOptionalString(audioStoragePath);
	let uploadedAudioStoragePath: string | null = null;
	const replyId = generateUuid();

	if (!resolvedAudioStoragePath && audioFile instanceof File) {
		const uploadResult = await uploadPreviewDiscussionAudioFile({
			entityId: replyId,
			file: audioFile,
			scope: "audio-replies",
			userId: currentUserId,
		});
		resolvedAudioStoragePath = uploadResult.objectPath;
		uploadedAudioStoragePath = uploadResult.objectPath;
	}

	if (!normalizedText && !resolvedAudioStoragePath) {
		throw new Error(
			"Une reponse privee doit contenir un texte, un audio, ou les deux.",
		);
	}

	if (resolvedAudioStoragePath) {
		resolvedAudioStoragePath = validatePreviewDiscussionAudioObjectPath({
			objectPath: resolvedAudioStoragePath,
			scope: "audio-replies",
			userId: currentUserId,
		});
	}

	let savedRow: PreviewDiscussionAudioReplyRow | null = null;
	try {
		const insertRow: PreviewDiscussionAudioReplyInsert = {
			audio_post_id: normalizedAudioPostId,
			audio_duration_ms: normalizedAudioDurationMs,
			audio_storage_path: resolvedAudioStoragePath,
			body_text: normalizedText,
			id: replyId,
			user_id: currentUserId,
		};

		const { data, error } = await supabase
			.from("preview_session_audio_replies")
			.insert(insertRow)
			.select(PREVIEW_DISCUSSION_AUDIO_REPLY_SELECT_COLUMNS)
			.maybeSingle();

		if (error || !data) {
			throw new Error(
				normalizeDiscussionErrorMessage(
					error,
					"Impossible d'envoyer la reponse privee du preview.",
				),
			);
		}

		savedRow = data;
	} catch (error) {
		if (uploadedAudioStoragePath) {
			await removePreviewDiscussionAudioObject(uploadedAudioStoragePath);
		}

		throw error;
	}

	const [authorsByUserId, audioUrlsByPath] = await Promise.all([
		fetchPreviewDiscussionAuthorsByUserId([savedRow.user_id], currentUserId),
		createPreviewDiscussionAudioSignedUrls(
			savedRow.audio_storage_path ? [savedRow.audio_storage_path] : [],
		),
	]);

	return mapPreviewDiscussionAudioReplyRow({
		currentUserId,
		row: savedRow,
		audioUrlsByPath,
		authorsByUserId,
	});
}

export async function updatePreviewDiscussionPrivateAudioReply({
	replyId,
	text,
}: UpdatePreviewDiscussionPrivateAudioReplyInput): Promise<PreviewDiscussionPrivateAudioReply> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedReplyId = trimOptionalString(replyId);
	if (!normalizedReplyId) {
		throw new Error("Impossible de modifier une reponse sans identifiant.");
	}

	const normalizedText = trimOptionalString(text);
	if (!normalizedText) {
		throw new Error("La reponse ne peut pas etre vide.");
	}

	if (normalizedText.length > PREVIEW_DISCUSSION_MAX_REPLY_TEXT_LENGTH) {
		throw new Error(
			`La reponse texte est limitee a ${PREVIEW_DISCUSSION_MAX_REPLY_TEXT_LENGTH} caracteres.`,
		);
	}

	const updateRow: PreviewDiscussionAudioReplyUpdate = {
		body_text: normalizedText,
	};

	const { data, error } = await supabase
		.from("preview_session_audio_replies")
		.update(updateRow)
		.eq("id", normalizedReplyId)
		.eq("user_id", currentUserId)
		.select(PREVIEW_DISCUSSION_AUDIO_REPLY_SELECT_COLUMNS)
		.maybeSingle();

	if (error || !data) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de modifier la reponse privee du preview.",
			),
		);
	}

	const [authorsByUserId, audioUrlsByPath] = await Promise.all([
		fetchPreviewDiscussionAuthorsByUserId([data.user_id], currentUserId),
		createPreviewDiscussionAudioSignedUrls(
			data.audio_storage_path ? [data.audio_storage_path] : [],
		),
	]);

	return mapPreviewDiscussionAudioReplyRow({
		currentUserId,
		row: data,
		audioUrlsByPath,
		authorsByUserId,
	});
}

export async function deletePreviewDiscussionPrivateAudioReply(
	replyId: string,
): Promise<void> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedReplyId = trimOptionalString(replyId);
	if (!normalizedReplyId) {
		throw new Error("Impossible de supprimer une reponse sans identifiant.");
	}

	const { data: existingReply, error: selectError } = await supabase
		.from("preview_session_audio_replies")
		.select(PREVIEW_DISCUSSION_AUDIO_REPLY_SELECT_COLUMNS)
		.eq("id", normalizedReplyId)
		.eq("user_id", currentUserId)
		.maybeSingle();

	if (selectError || !existingReply) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				selectError,
				"Impossible de charger la reponse privee a supprimer.",
			),
		);
	}

	const { error } = await supabase
		.from("preview_session_audio_replies")
		.delete()
		.eq("id", normalizedReplyId)
		.eq("user_id", currentUserId);

	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de supprimer la reponse privee du preview.",
			),
		);
	}

	if (existingReply.audio_storage_path) {
		await removePreviewDiscussionAudioObject(existingReply.audio_storage_path);
	}
}

export async function setPreviewSessionAudioPostShareIntent({
	audioPostId,
	selected,
	sessionKey,
}: SetPreviewSessionAudioPostShareIntentInput): Promise<PreviewDiscussionAudioPost> {
	const currentUserId = await requirePreviewDiscussionCurrentUserId();
	const normalizedAudioPostId = trimOptionalString(audioPostId);
	if (!normalizedAudioPostId) {
		throw new Error("Impossible de mettre a jour le partage sans audioPostId.");
	}

	const normalizedSessionKey = trimOptionalString(sessionKey);
	if (selected && !normalizedSessionKey) {
		throw new Error("Une session valide est requise pour partager cet audio.");
	}

	const updatePayload: PreviewDiscussionAudioPostUpdate = {
		share_dispatched_at: null,
		share_marked_at: selected ? new Date().toISOString() : null,
		share_selected: selected,
		share_session_key: selected ? normalizedSessionKey : null,
	};

	const { data, error } = await supabase
		.from("preview_session_audio_posts")
		.update(updatePayload)
		.eq("id", normalizedAudioPostId)
		.eq("user_id", currentUserId)
		.select(PREVIEW_DISCUSSION_AUDIO_POST_SELECT_COLUMNS)
		.maybeSingle();

	if (error || !data) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible de mettre a jour le partage de cet audio.",
			),
		);
	}

	const [authorsByUserId, audioUrlsByPath] = await Promise.all([
		fetchPreviewDiscussionAuthorsByUserId([data.user_id], currentUserId),
		createPreviewDiscussionAudioSignedUrls([data.audio_storage_path]),
	]);

	return mapPreviewDiscussionAudioPostRow({
		currentUserId,
		row: data,
		audioUrlsByPath,
		authorsByUserId,
	});
}

export async function dispatchPreviewSessionAudioShareBatch(
	sessionKey: string,
): Promise<DispatchPreviewSessionAudioShareBatchResult> {
	const normalizedSessionKey = trimOptionalString(sessionKey);
	if (!normalizedSessionKey) {
		throw new Error("Session invalide pour l'envoi groupe.");
	}

	const { data, error } = await supabase.rpc(
		"dispatch_preview_session_audio_share_batch",
		{
			p_session_key: normalizedSessionKey,
		},
	);

	if (error) {
		throw new Error(
			normalizeDiscussionErrorMessage(
				error,
				"Impossible d'envoyer les notifications groupees de la session.",
			),
		);
	}

	const [firstRow] = Array.isArray(data)
		? (data as Array<{
				already_dispatched?: boolean | null;
				notified_friend_count?: number | null;
				shared_audio_count?: number | null;
			}>)
		: [];

	return {
		alreadyDispatched: firstRow?.already_dispatched === true,
		notifiedFriendCount:
			typeof firstRow?.notified_friend_count === "number"
				? Math.max(0, Math.floor(firstRow.notified_friend_count))
				: 0,
		sharedAudioCount:
			typeof firstRow?.shared_audio_count === "number"
				? Math.max(0, Math.floor(firstRow.shared_audio_count))
				: 0,
	};
}

export const isPreviewDiscussionAuthError = (
	error: PostgrestError | ErrorLike | Error | null | undefined,
) =>
	normalizeDiscussionErrorMessage(error, "") ===
	PREVIEW_DISCUSSION_AUTH_MESSAGE;
