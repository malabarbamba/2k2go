import {
	ArrowRight,
	Check,
	ChevronDown,
	ChevronLeft,
	Eye,
	Loader2,
	Mic,
	MoreHorizontal,
	Pause,
	Play,
	RefreshCw,
	RotateCcw,
	Share2,
	Square,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	AUDIO_FILES,
	type AudioUrls,
	ReviewMainCardSurface,
	theme,
} from "./VocabCardShared";
import { useAuth } from "@/contexts/AuthContext";
import { DEMO_CARDS, demoCardToVocabCard } from "@/data/demoReviewData";
import type { PreviewDiscussionAudioPost } from "@/features/preview-new-concept/discussionService";
import { useMissionProgress } from "@/hooks/useMissionProgress";
import { useProfile } from "@/hooks/useProfile";
import type { ReviewType, VocabCard } from "@/lib/deck-perso-adapters";
import {
	getGuestFoundationDueCards,
	submitGuestFoundationReview,
} from "@/lib/guestFoundationReviewStore";
import { markFoundationDeckStarted } from "@/lib/progressPathOnboarding";
import { emitReviewCardFlipped } from "@/lib/reviewSidebarFocus";
import { countReviewSummaryBuckets } from "@/lib/reviewSummaryBuckets";
import { cn } from "@/lib/utils";
import { buildAppProfilePath } from "@/routes/routeAuthContract";
import { useAudio } from "@/services/audioService";
import {
	hasCollectedDeckInAccountLight,
	searchAppVocabularyBank,
} from "@/services/appVocabularySearchService";
import {
	fetchDueCardsByReviewTypes,
	submitReviewForCard,
} from "@/services/deckPersoDueReviewService";
import type { BinaryReviewRating } from "@/services/deckPersoService";
import type { FriendListItem } from "@/services/friendsService";
import {
	type ReviewFilter,
	ReviewFilterDropdown,
} from "@/components/deck-perso-visual/ReviewFilterDropdown";

const REVIEW_FILTER_DEFINITIONS = [
	{ id: 1, label: "Foundations 2000", reviewType: "foundation" },
	{ id: 2, label: "Collected cards", reviewType: "collected" },
	{ id: 3, label: "Cards from my teacher", reviewType: "sent" },
] as const;

// Default filters - counts will be updated dynamically
// Note: Alphabet deck has its own dedicated mini-deck UX, not FSRS reviews
const DEFAULT_FILTERS: ReviewFilter[] = REVIEW_FILTER_DEFINITIONS.map(
	({ id, label }) => ({
		id,
		label,
		checked: true,
		count: 0,
	}),
);

const ALL_REVIEW_TYPES: ReviewType[] = REVIEW_FILTER_DEFINITIONS.map(
	({ reviewType }) => reviewType,
);
const MAX_DECK_AVAILABILITY_SEARCH = 1000;

function resolveCardReviewType(
	card: Pick<VocabCard, "source" | "tags" | "sourceType">,
): ReviewType {
	const sourceType = card.sourceType ?? null;

	if (card.source === "foundation") {
		return "foundation";
	}
	if (sourceType === "sent") {
		return "sent";
	}
	if (sourceType === "collected") {
		return "collected";
	}

	const hasProfTag = card.tags.some((tag) => tag.toLowerCase() === "prof");
	return hasProfTag ? "sent" : "collected";
}

function resolveSessionContactDisplayName(friend: FriendListItem): string {
	const fullName = [friend.firstName, friend.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();

	if (fullName.length > 0) {
		return fullName;
	}

	if (
		typeof friend.username === "string" &&
		friend.username.trim().length > 0
	) {
		return `@${friend.username.trim()}`;
	}

	if (typeof friend.email === "string" && friend.email.trim().length > 0) {
		return friend.email.trim();
	}

	return "contact";
}

// Card sound preference helper
const CARD_SOUND_KEY = "2k2go-card-sound";
const readCardSoundEnabled = (): boolean => {
	try {
		const stored = localStorage.getItem(CARD_SOUND_KEY);
		if (stored === null) return true;
		return stored === "true";
	} catch {
		return true;
	}
};

const PREVIEW_SESSION_MAX_RECORDING_SECONDS = 7;
const PREVIEW_SESSION_MAX_RECORDING_DURATION_MS =
	PREVIEW_SESSION_MAX_RECORDING_SECONDS * 1000;
const PREVIEW_SESSION_CARD_AUDIO_CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_SESSION_RECORDING_BITRATE = 24_000;
const PREVIEW_SESSION_RECORDING_MIME_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
] as const;
const PREVIEW_SESSION_RECORDING_CONSTRAINTS: MediaTrackConstraints = {
	autoGainControl: true,
	channelCount: 1,
	echoCancellation: true,
	noiseSuppression: true,
};

const createSessionShareKey = (): string => {
	const cryptoRef =
		typeof globalThis !== "undefined" ? globalThis.crypto : null;
	if (cryptoRef?.randomUUID) {
		return cryptoRef.randomUUID();
	}

	return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
};

type CardAudioPostCacheEntry = {
	fetchedAt: number;
	post: PreviewDiscussionAudioPost | null;
};

const buildSessionCardAudioCacheKey = (
	card: Pick<VocabCard, "id" | "foundationCardId" | "vocabularyCardId">,
): string => {
	if (card.vocabularyCardId) {
		return `v:${card.vocabularyCardId}`;
	}

	if (card.foundationCardId) {
		return `f:${card.foundationCardId}`;
	}

	return `c:${String(card.id)}`;
};

const resolveSessionRecordingMimeType = (): string | null => {
	if (
		typeof MediaRecorder === "undefined" ||
		typeof MediaRecorder.isTypeSupported !== "function"
	) {
		return null;
	}

	for (const mimeType of PREVIEW_SESSION_RECORDING_MIME_TYPES) {
		if (MediaRecorder.isTypeSupported(mimeType)) {
			return mimeType;
		}
	}

	return null;
};

const resolveRecordingAudioExtension = (mimeType: string): string => {
	const normalizedMimeType = mimeType.toLowerCase();

	if (normalizedMimeType.includes("ogg")) {
		return "ogg";
	}

	if (
		normalizedMimeType.includes("mp4") ||
		normalizedMimeType.includes("m4a")
	) {
		return "m4a";
	}

	if (
		normalizedMimeType.includes("mpeg") ||
		normalizedMimeType.includes("mp3")
	) {
		return "mp3";
	}

	if (normalizedMimeType.includes("wav")) {
		return "wav";
	}

	if (normalizedMimeType.includes("aac")) {
		return "aac";
	}

	return "webm";
};

const buildSessionRecordingFile = (blob: Blob): File => {
	const mimeType = blob.type || "audio/webm";
	const extension = resolveRecordingAudioExtension(mimeType);
	return new File([blob], `session-prononciation-${Date.now()}.${extension}`, {
		type: mimeType,
	});
};

interface CardsReviewProps {
	onBackClick?: () => void;
	/** True if in preview mode (guest or <10 cards) */
	isPreviewMode?: boolean;
	/** True when a tutorial is actively running and demo cards are expected */
	isTutorialMode?: boolean;
	previewCards?: VocabCard[];
	forceLiveSubmission?: boolean;
	onGuestReviewAction?: () => void;
	onCardsChanged?: (cards: VocabCard[]) => void;
	onSessionCompleted?: () => void;
	onReviewReminderNudgeClick?: () => void;
	sessionChromeVariant?: "default" | "plain_html";
}

const ReviewCardLoadingSkeleton = ({
	simplified = false,
}: {
	simplified?: boolean;
}) => {
	if (simplified) {
		return (
			<div
				data-testid="review-card-loading-skeleton"
				className="relative h-full w-full overflow-hidden rounded-[36px]"
				style={{
					background: theme.backgroundWrap,
					border: `1px solid ${theme.borderWrap}`,
					boxShadow: "0 10px 26px -16px rgba(0,0,0,0.28)",
				}}
			>
				<div className="absolute inset-0 flex min-h-0 flex-col px-5 pt-6 pb-5">
					<div className="flex justify-center">
						<Skeleton className="h-8 w-[82%] bg-muted/45" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<div
				data-testid="review-card-loading-skeleton"
				className="relative h-full w-full overflow-hidden rounded-[36px]"
				style={{
					background: theme.backgroundWrap,
					border: `1px solid ${theme.borderWrap}`,
					boxShadow: "0 10px 26px -16px rgba(0,0,0,0.28)",
				}}
			>
				<div className="absolute inset-0 flex min-h-0 flex-col">
					<div
						className="flex min-h-0 flex-1 flex-col px-4 pt-4 sm:px-5 sm:pt-5"
						style={{ paddingBottom: "28%" }}
					>
						<div className="mb-4 flex w-full items-center justify-between">
							<Skeleton className="h-3 w-20 bg-muted/60" />
							<Skeleton className="h-3 w-14 bg-muted/60" />
						</div>

						<div className="mb-3 flex flex-col items-center gap-2">
							<Skeleton className="h-6 w-[72%] bg-muted/70" />
							<Skeleton className="h-6 w-[58%] bg-muted/70" />
						</div>

						<div className="mb-3 flex justify-center">
							<Skeleton className="h-8 w-44 bg-muted/60" />
						</div>

						<div className="rounded-xl border border-white/10 bg-black/15 p-3">
							<div className="mb-3 flex items-center gap-2">
								<Skeleton className="h-8 w-8 rounded-full bg-muted/60" />
								<Skeleton className="h-8 w-8 rounded-full bg-muted/60" />
								<Skeleton className="h-5 w-24 rounded-full bg-muted/60" />
							</div>
							<Skeleton className="h-4 w-11/12 bg-muted/60" />
						</div>

						<div className="mt-3 flex justify-center">
							<Skeleton className="h-24 w-[78%] rounded-lg bg-muted/60" />
						</div>
					</div>

					<div className="absolute inset-x-0 bottom-0 flex h-[22%] overflow-hidden">
						<div className="relative flex-1 border-t border-red-200/15 bg-gradient-to-t from-red-500/20 via-red-500/8 to-transparent">
							<Skeleton className="absolute bottom-[16%] left-1/2 h-4 w-10 -translate-x-1/2 bg-red-200/20" />
						</div>
						<div className="relative flex-1 border-t border-emerald-200/15 bg-gradient-to-t from-emerald-500/20 via-emerald-500/8 to-transparent">
							<Skeleton className="absolute bottom-[16%] left-1/2 h-4 w-10 -translate-x-1/2 bg-emerald-200/20" />
						</div>
					</div>
				</div>
			</div>
		</>
	);
};

const ReviewSummaryLoadingSkeleton = () => {
	return (
		<div
			data-testid="review-summary-loading-skeleton"
			className="mt-5 flex flex-col items-center pt-1 sm:mt-4"
			aria-hidden="true"
		>
			<div className="flex items-center gap-2">
				<Skeleton className="h-4 w-4 rounded bg-sky-500/35" />
				<span className="text-muted-foreground" aria-hidden="true">
					·
				</span>
				<Skeleton className="h-4 w-4 rounded bg-rose-500/35" />
				<span className="text-muted-foreground" aria-hidden="true">
					·
				</span>
				<Skeleton className="h-4 w-4 rounded bg-emerald-500/35" />
			</div>
			<Skeleton className="mt-1 h-3 w-40 bg-muted/60" />
		</div>
	);
};

const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const REVIEW_TUTORIAL_CARD_SIDE_EVENT = "arur:review-tutorial-card-side";
const CARD_ASPECT_RATIO = 3 / 4;
const CARD_MIN_WIDTH = 180;
const CARD_MIN_HEIGHT = 260;
const CARD_MAX_WIDTH = 800;
const CARD_MAX_HEIGHT = 1200;
const CARD_HORIZONTAL_PADDING = 16;
const CARD_VERTICAL_PADDING = 12;
const CARD_VIEWPORT_EDGE_GUTTER = 8;
const SESSION_CARD_WIDTH = "clamp(320px, min(36vw, 54vh), 540px)";
const DUE_FEEDBACK_FADE_IN_MS = 600;
const DUE_FEEDBACK_HOLD_MS = 1600;
const DUE_FEEDBACK_FADE_OUT_MS = 1000;
const SWIPE_DRAG_COOLDOWN_MS = 1000;
const SESSION_DUE_CARDS_CACHE_TTL_MS = 45_000;
const IS_VITEST_RUNTIME = Boolean(
	(import.meta as ImportMeta & { vitest?: unknown }).vitest,
);

type SessionDueCardsCacheEntry = {
	cards: VocabCard[];
	fetchedAt: number;
};

const sessionDueCardsCacheByScope = new Map<
	string,
	SessionDueCardsCacheEntry
>();
const sessionDueCardsInFlightByScope = new Map<
	string,
	Promise<Awaited<ReturnType<typeof fetchDueCardsByReviewTypes>>>
>();

const isSessionDueCardsCacheFresh = (
	entry: SessionDueCardsCacheEntry,
): boolean => Date.now() - entry.fetchedAt <= SESSION_DUE_CARDS_CACHE_TTL_MS;

const loadSessionDueCardsWithDedup = (
	cacheScope: string,
): Promise<Awaited<ReturnType<typeof fetchDueCardsByReviewTypes>>> => {
	if (IS_VITEST_RUNTIME) {
		return fetchDueCardsByReviewTypes(ALL_REVIEW_TYPES);
	}

	const inFlightRequest = sessionDueCardsInFlightByScope.get(cacheScope);
	if (inFlightRequest) {
		return inFlightRequest;
	}

	const request = fetchDueCardsByReviewTypes(ALL_REVIEW_TYPES);
	sessionDueCardsInFlightByScope.set(cacheScope, request);

	void request.finally(() => {
		if (sessionDueCardsInFlightByScope.get(cacheScope) === request) {
			sessionDueCardsInFlightByScope.delete(cacheScope);
		}
	});

	return request;
};

type DueFeedbackPhase = "hidden" | "entering" | "visible" | "exiting";

function resolveSchedulerDueAt(data: unknown): Date | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	const payload = data as Record<string, unknown>;
	const rawNextReviewAt =
		(typeof payload.nextReviewAt === "string" && payload.nextReviewAt) ||
		(typeof payload.next_review_at === "string" && payload.next_review_at) ||
		null;

	if (rawNextReviewAt) {
		const nextDate = new Date(rawNextReviewAt);
		if (!Number.isNaN(nextDate.getTime())) {
			return nextDate;
		}
	}

	const intervalDays =
		(typeof payload.intervalDays === "number" &&
		Number.isFinite(payload.intervalDays)
			? payload.intervalDays
			: null) ??
		(typeof payload.interval_days === "number" &&
		Number.isFinite(payload.interval_days)
			? payload.interval_days
			: null);

	if (intervalDays === null || intervalDays < 0) {
		return null;
	}

	return new Date(Date.now() + intervalDays * ONE_DAY_MS);
}

function formatDueTiming(nextDueAt: Date, now = new Date()): string {
	const deltaMs = nextDueAt.getTime() - now.getTime();

	if (deltaMs <= ONE_MINUTE_MS) {
		return "moins d'une minute";
	}

	if (deltaMs < ONE_HOUR_MS) {
		const minutes = Math.ceil(deltaMs / ONE_MINUTE_MS);
		return minutes > 1 ? `${minutes} minutes` : "1 minute";
	}

	if (deltaMs < ONE_DAY_MS) {
		const hours = Math.ceil(deltaMs / ONE_HOUR_MS);
		return hours > 1 ? `${hours} heures` : "1 heure";
	}

	const days = Math.ceil(deltaMs / ONE_DAY_MS);
	return days > 1 ? `${days} jours` : "1 jour";
}

function resolveActionHints(card: VocabCard | null): {
	fail: string;
	pass: string;
} {
	if (!card) {
		return { fail: "10 min", pass: "1 j" };
	}

	const normalizedStatus = card.status?.toLowerCase();
	if (normalizedStatus === "new") {
		return { fail: "10 min", pass: "1 j" };
	}
	if (normalizedStatus === "learning") {
		return { fail: "10 min", pass: "2 j" };
	}

	return { fail: "10 min", pass: "3+ j" };
}

export const CardsReview = ({
	onBackClick,
	isPreviewMode,
	isTutorialMode,
	previewCards,
	forceLiveSubmission = false,
	onGuestReviewAction,
	onCardsChanged,
	onSessionCompleted,
	onReviewReminderNudgeClick,
	sessionChromeVariant = "default",
}: CardsReviewProps) => {
	const navigate = useNavigate();
	const { playFail, playValider, playFinish, resume, isInitialized } =
		useAudio();
	const { user } = useAuth();
	const { profile } = useProfile(undefined, user?.id);
	const { masteredCards, totalCards } = useMissionProgress();

	// Determine demo mode
	const isGuest = !user;
	const hasPreviewCardOverride = Array.isArray(previewCards);
	const shouldTreatPreviewCardsAsDemo =
		hasPreviewCardOverride && !forceLiveSubmission;
	const shouldUseDemoData =
		shouldTreatPreviewCardsAsDemo ||
		(Boolean(isPreviewMode) && Boolean(isTutorialMode));
	const isGuestLocalReviewMode = isGuest && !shouldUseDemoData;
	const isSessionLayout = Boolean(isPreviewMode && onBackClick);
	const usePlainHtmlSessionChrome =
		isSessionLayout && sessionChromeVariant === "plain_html";
	const dueCardsCacheScope = isGuestLocalReviewMode
		? "guest_local"
		: `auth:${user?.id ?? "guest"}`;
	const sessionPeerLabel = "contact";
	const hasPreviewCards = Array.isArray(previewCards);
	const shouldUseSessionDueCardsCache =
		!IS_VITEST_RUNTIME &&
		!hasPreviewCards &&
		!isGuestLocalReviewMode &&
		!shouldUseDemoData;

	// Card data state
	const [cards, setCards] = useState<VocabCard[]>(() =>
		hasPreviewCards ? previewCards : [],
	);
	const [isLoadingCards, setIsLoadingCards] = useState(!hasPreviewCards);
	const [fetchError, setFetchError] = useState<string | null>(null);
	const [isSubmittingReview, setIsSubmittingReview] = useState(false);
	const [dueTimingFeedback, setDueTimingFeedback] = useState<string | null>(
		null,
	);
	const [dueFeedbackPhase, setDueFeedbackPhase] =
		useState<DueFeedbackPhase>("hidden");
	const [pendingFinishSound, setPendingFinishSound] = useState(false);

	// Request ID ref for preventing stale updates
	const requestIdRef = useRef<number>(0);
	const completionReportedRef = useRef(false);

	// Dropdown state
	const [showFilterDropdown, setShowFilterDropdown] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [isSessionFilterTriggerHovered, setIsSessionFilterTriggerHovered] =
		useState(false);
	const [activeFilters, setActiveFilters] =
		useState<ReviewFilter[]>(DEFAULT_FILTERS);
	const [availableFilterIds, setAvailableFilterIds] = useState<number[]>(() =>
		REVIEW_FILTER_DEFINITIONS.map((filter) => filter.id),
	);

	// Get active review types from filters
	const activeReviewTypes = useMemo(() => {
		const types: ReviewType[] = [];

		REVIEW_FILTER_DEFINITIONS.forEach((filterDefinition) => {
			const isActive = activeFilters.some(
				(filter) => filter.id === filterDefinition.id && filter.checked,
			);
			if (isActive) {
				types.push(filterDefinition.reviewType);
			}
		});

		return types;
	}, [activeFilters]);

	useEffect(() => {
		let isCancelled = false;

		const resolveAvailableFilters = async () => {
			if (isGuestLocalReviewMode) {
				if (!isCancelled) {
					setAvailableFilterIds([1]);
				}
				return;
			}

			if (shouldUseDemoData) {
				if (!isCancelled) {
					setAvailableFilterIds(
						REVIEW_FILTER_DEFINITIONS.map((filter) => filter.id),
					);
				}
				return;
			}

			const availabilityByFilter = await Promise.all(
				REVIEW_FILTER_DEFINITIONS.map(async (filterDefinition) => {
					if (filterDefinition.reviewType === "collected") {
						const collectedDeckResult = await hasCollectedDeckInAccountLight();

						if (collectedDeckResult.ok) {
							return {
								id: filterDefinition.id,
								isAvailable: collectedDeckResult.data,
								isResolved: true,
							};
						}
					}

					const result = await searchAppVocabularyBank(
						"",
						MAX_DECK_AVAILABILITY_SEARCH,
						[filterDefinition.reviewType],
					);

					if (!result.ok) {
						return {
							id: filterDefinition.id,
							isAvailable: false,
							isResolved: false,
						};
					}

					const isAvailable = result.data.some(
						(row) => Boolean(row.is_seen) || Boolean(row.is_added),
					);

					return {
						id: filterDefinition.id,
						isAvailable,
						isResolved: true,
					};
				}),
			);

			if (isCancelled) {
				return;
			}

			const nextAvailableFilterIds = availabilityByFilter
				.filter((filter) => filter.isAvailable)
				.map((filter) => filter.id);

			const hasResolvedAvailability = availabilityByFilter.some(
				(filter) => filter.isResolved,
			);

			if (!hasResolvedAvailability) {
				setAvailableFilterIds(
					REVIEW_FILTER_DEFINITIONS.map((filter) => filter.id),
				);
				return;
			}

			setAvailableFilterIds(nextAvailableFilterIds);
		};

		void resolveAvailableFilters();

		return () => {
			isCancelled = true;
		};
	}, [isGuestLocalReviewMode, shouldUseDemoData]);

	useEffect(() => {
		setActiveFilters((previousFilters) => {
			const nextFilters = previousFilters.filter((filter) =>
				availableFilterIds.includes(filter.id),
			);

			return nextFilters.length === previousFilters.length
				? previousFilters
				: nextFilters;
		});
	}, [availableFilterIds]);

	// ============================================================================
	// FETCH CARDS
	// ============================================================================

	const removeCardFromSession = useCallback(
		(cardId: VocabCard["id"]) => {
			setCards((previousCards) => {
				const nextCards = previousCards.filter((card) => card.id !== cardId);

				if (shouldUseSessionDueCardsCache) {
					sessionDueCardsCacheByScope.set(dueCardsCacheScope, {
						cards: nextCards,
						fetchedAt: Date.now(),
					});
				}

				return nextCards;
			});
		},
		[dueCardsCacheScope, shouldUseSessionDueCardsCache],
	);

	const fetchCards = useCallback(async () => {
		setCardFlipped(false);
		setShowVowels(false);
		setDragX(0);
		setIsSwiping(false);
		setIsSwipeExiting(false);
		setPendingRemovalCardId(null);

		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;

		if (hasPreviewCards) {
			if (requestIdRef.current !== requestId) return;
			setCards(previewCards);
			setFetchError(null);
			setIsLoadingCards(false);
			return;
		}

		if (isGuestLocalReviewMode) {
			const guestCards = getGuestFoundationDueCards();

			if (requestIdRef.current !== requestId) return;
			setCards(guestCards);
			setFetchError(null);
			setIsLoadingCards(false);
			return;
		}

		// Demo mode: use DEMO_CARDS
		if (shouldUseDemoData) {
			const demoCards = DEMO_CARDS.map(demoCardToVocabCard);

			if (requestIdRef.current !== requestId) return;
			setCards(demoCards);
			setFetchError(null);
			setIsLoadingCards(false);
			return;
		}

		const cachedEntry = shouldUseSessionDueCardsCache
			? sessionDueCardsCacheByScope.get(dueCardsCacheScope)
			: undefined;
		setIsLoadingCards(!cachedEntry);
		setFetchError(null);

		try {
			if (cachedEntry) {
				if (requestIdRef.current !== requestId) return;
				setCards(cachedEntry.cards);
				setIsLoadingCards(false);
				if (isSessionDueCardsCacheFresh(cachedEntry)) {
					setFetchError(null);
					return;
				}
			}

			const result = await loadSessionDueCardsWithDedup(dueCardsCacheScope);
			if (requestIdRef.current !== requestId) return;

			if (!result.ok) {
				if (!cachedEntry || cachedEntry.cards.length === 0) {
					setCards([]);
				}
				setFetchError(result.error.message);
			} else {
				setCards(result.data);
				if (shouldUseSessionDueCardsCache) {
					sessionDueCardsCacheByScope.set(dueCardsCacheScope, {
						cards: result.data,
						fetchedAt: Date.now(),
					});
				}
				setFetchError(null);
			}
		} catch (err) {
			if (requestIdRef.current !== requestId) return;
			const cachedEntry = shouldUseSessionDueCardsCache
				? sessionDueCardsCacheByScope.get(dueCardsCacheScope)
				: undefined;
			if (!cachedEntry || cachedEntry.cards.length === 0) {
				setCards([]);
			}
			setFetchError(err instanceof Error ? err.message : String(err));
		} finally {
			if (requestIdRef.current === requestId) {
				setIsLoadingCards(false);
			}
		}
	}, [
		dueCardsCacheScope,
		hasPreviewCards,
		isGuestLocalReviewMode,
		previewCards,
		shouldUseSessionDueCardsCache,
		shouldUseDemoData,
	]);

	// Fetch cards when mode/session context changes
	useEffect(() => {
		void fetchCards();
	}, [fetchCards]);

	// ============================================================================
	// SUBMIT REVIEW
	// ============================================================================

	const submitReview = useCallback(
		async (cardState: VocabCard, rating: BinaryReviewRating) => {
			if (
				(shouldUseDemoData && !isGuestLocalReviewMode) ||
				isSubmittingReview
			) {
				return;
			}

			setIsSubmittingReview(true);
			try {
				setFetchError(null);

				if (isGuestLocalReviewMode) {
					const localResult = submitGuestFoundationReview(
						String(cardState.foundationCardId ?? cardState.id),
						rating,
					);

					if (!localResult.ok) {
						setDueFeedbackPhase("hidden");
						setDueTimingFeedback(null);
						setFetchError(localResult.error);
						return;
					}

					const nextDueAt = new Date(localResult.nextReviewAt);
					setDueTimingFeedback(formatDueTiming(nextDueAt));

					if (resolveCardReviewType(cardState) === "foundation") {
						markFoundationDeckStarted();
					}

					finishSoundOnNextCardsUpdateRef.current = true;
					removeCardFromSession(cardState.id);
					return;
				}

				const result = await submitReviewForCard(
					{
						...cardState,
						vocabularyCardId: cardState.vocabularyCardId,
						foundationCardId: cardState.foundationCardId,
					},
					rating,
					{ mode: shouldUseDemoData ? "preview" : "real" },
				);

				if (!result.ok) {
					setDueFeedbackPhase("hidden");
					setDueTimingFeedback(null);
					if (result.error.code === "DUPLICATE_REVIEW") {
						removeCardFromSession(cardState.id);
						setFetchError(result.error.message);
					} else {
						setFetchError(result.error.message);
					}
					return;
				}

				const nextDueAt = resolveSchedulerDueAt(result.data);
				setDueTimingFeedback(nextDueAt ? formatDueTiming(nextDueAt) : null);

				if (resolveCardReviewType(cardState) === "foundation") {
					markFoundationDeckStarted();
				}

				finishSoundOnNextCardsUpdateRef.current = true;
				removeCardFromSession(cardState.id);
			} catch (err) {
				setDueFeedbackPhase("hidden");
				setDueTimingFeedback(null);
				setFetchError(err instanceof Error ? err.message : String(err));
			} finally {
				setIsSubmittingReview(false);
				setPendingRemovalCardId((prev) =>
					prev === cardState.id ? null : prev,
				);
			}
		},
		[
			isGuestLocalReviewMode,
			isSubmittingReview,
			removeCardFromSession,
			shouldUseDemoData,
		],
	);

	// ============================================================================
	// DERIVED VALUES
	// ============================================================================

	// Card animation states
	const [cardFlipped, setCardFlipped] = useState(false);
	const [showVowels, setShowVowels] = useState(false);
	const [isFlipAudioMuted, setIsFlipAudioMuted] = useState(false);
	const [flipKey, setFlipKey] = useState(0);
	const [isFlipping, setIsFlipping] = useState(false);
	const [dragX, setDragX] = useState(0);
	const [isDraggingCard, setIsDraggingCard] = useState(false);
	const [isSwiping, setIsSwiping] = useState(false);
	const [isSwipeExiting, setIsSwipeExiting] = useState(false);
	const [pendingRemovalCardId, setPendingRemovalCardId] = useState<
		string | null
	>(null);
	const [showReviewLegend, setShowReviewLegend] = useState(false);
	const [currentCardAudioPost, setCurrentCardAudioPost] =
		useState<PreviewDiscussionAudioPost | null>(null);
	const [isCardAudioLoading, setIsCardAudioLoading] = useState(false);
	const [isCardAudioSaving, setIsCardAudioSaving] = useState(false);
	const [isCardAudioPlaying, setIsCardAudioPlaying] = useState(false);
	const [isCardAudioRecording, setIsCardAudioRecording] = useState(false);
	const [cardAudioRecordingSeconds, setCardAudioRecordingSeconds] = useState(0);
	const [isCardAudioShareUpdating, setIsCardAudioShareUpdating] =
		useState(false);
	const [isCardAudioMenuOpen, setIsCardAudioMenuOpen] = useState(false);
	const [showContactAudiosDialog, setShowContactAudiosDialog] = useState(false);
	const [showShareContactsDialog, setShowShareContactsDialog] = useState(false);
	const [sessionConnections, setSessionConnections] = useState<
		FriendListItem[]
	>([]);
	const [isSessionConnectionsLoading, setIsSessionConnectionsLoading] =
		useState(false);
	const [sessionConnectionsError, setSessionConnectionsError] = useState<
		string | null
	>(null);
	const [contactAudioPosts, setContactAudioPosts] = useState<
		PreviewDiscussionAudioPost[]
	>([]);
	const [isContactAudioPostsLoading, setIsContactAudioPostsLoading] =
		useState(false);
	const [contactAudioPostsError, setContactAudioPostsError] = useState<
		string | null
	>(null);
	const [activeContactAudioPostId, setActiveContactAudioPostId] = useState<
		string | null
	>(null);
	const [shareSelectionsByCardKey, setShareSelectionsByCardKey] = useState<
		Record<string, string[]>
	>({});
	const [isSessionTopButtonHovered, setIsSessionTopButtonHovered] = useState<
		"mute" | "vowels" | "flip" | null
	>(null);
	const [
		isSessionAudioMenuTriggerHovered,
		setIsSessionAudioMenuTriggerHovered,
	] = useState(false);
	const [hoveredSessionAudioMenuAction, setHoveredSessionAudioMenuAction] =
		useState<"contacts" | "share" | "rerecord" | "delete" | null>(null);
	const [hoveredSessionDecisionAction, setHoveredSessionDecisionAction] =
		useState<"fail" | "pass" | null>(null);
	const sessionAudioCacheScopeKey = `${isSessionLayout ? "session" : "default"}:${user?.id ?? "guest"}`;

	// Refs for drag handling
	const cardDragRef = useRef<HTMLDivElement>(null);
	const cardFrameHostRef = useRef<HTMLDivElement>(null);
	const dragStartXRef = useRef(0);
	const activePointerIdRef = useRef<number | null>(null);
	const swipeTimeoutRef = useRef<number | null>(null);
	const swipeCooldownUntilRef = useRef(0);
	const hasDraggedRef = useRef(false);
	const finishSoundOnNextCardsUpdateRef = useRef(false);
	const cardAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
	const contactAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
	const cardAudioRecorderRef = useRef<MediaRecorder | null>(null);
	const cardAudioStreamRef = useRef<MediaStream | null>(null);
	const cardAudioChunksRef = useRef<Blob[]>([]);
	const cardAudioIntervalRef = useRef<number | null>(null);
	const cardAudioTimeoutRef = useRef<number | null>(null);
	const cardAudioRecordingStartedAtRef = useRef<number | null>(null);
	const sessionShareKeyRef = useRef<string>(createSessionShareKey());
	const hasSessionShareFlushRef = useRef(false);
	const cardAudioPostCacheRef = useRef<Map<string, CardAudioPostCacheEntry>>(
		new Map(),
	);
	const currentCardAudioCacheKeyRef = useRef<string | null>(null);
	const cardAudioFetchRequestIdRef = useRef(0);
	const cardAudioCacheScopeRef = useRef<string>(sessionAudioCacheScopeKey);
	const sessionAudioMenuRef = useRef<HTMLDivElement | null>(null);
	const [cardFrameSize, setCardFrameSize] = useState<{
		width: number;
		height: number;
	} | null>(null);

	if (cardAudioCacheScopeRef.current !== sessionAudioCacheScopeKey) {
		cardAudioCacheScopeRef.current = sessionAudioCacheScopeKey;
		cardAudioPostCacheRef.current.clear();
		currentCardAudioCacheKeyRef.current = null;
		cardAudioFetchRequestIdRef.current = 0;
	}

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const forceCardSide = (event: Event) => {
			const customEvent = event as CustomEvent<{ side?: unknown }>;
			const side = customEvent.detail?.side;
			if (side !== "front" && side !== "back") {
				return;
			}

			if (swipeTimeoutRef.current) {
				window.clearTimeout(swipeTimeoutRef.current);
				swipeTimeoutRef.current = null;
			}

			setIsDraggingCard(false);
			setIsSwiping(false);
			setIsSwipeExiting(false);
			setDragX(0);
			setShowVowels(false);
			setCardFlipped(side === "back");
		};

		window.addEventListener(
			REVIEW_TUTORIAL_CARD_SIDE_EVENT,
			forceCardSide as EventListener,
		);

		return () => {
			window.removeEventListener(
				REVIEW_TUTORIAL_CARD_SIDE_EVENT,
				forceCardSide as EventListener,
			);
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		if (isSessionLayout) {
			setCardFrameSize(null);
			return;
		}

		const host = cardFrameHostRef.current;
		if (!host) {
			return;
		}

		const visualViewport = window.visualViewport;

		const updateFrameSize = () => {
			const hostRect = host.getBoundingClientRect();
			const viewportHeight = Math.floor(
				visualViewport?.height ?? window.innerHeight,
			);
			const viewportWidth = Math.floor(
				visualViewport?.width ?? window.innerWidth,
			);
			const viewportTop = Math.floor(visualViewport?.offsetTop ?? 0);
			const viewportLeft = Math.floor(visualViewport?.offsetLeft ?? 0);
			const visibleBottom = viewportTop + viewportHeight;
			const visibleRight = viewportLeft + viewportWidth;
			const hostTop = Math.max(hostRect.top, viewportTop);
			const hostLeft = Math.max(hostRect.left, viewportLeft);

			const maxWidthByHost = Math.floor(
				hostRect.width - CARD_HORIZONTAL_PADDING,
			);
			const maxWidthByViewport = Math.floor(
				visibleRight - hostLeft - CARD_VIEWPORT_EDGE_GUTTER,
			);
			const availableWidth = Math.max(
				1,
				Math.min(maxWidthByHost, maxWidthByViewport, CARD_MAX_WIDTH),
			);

			const maxHeightByHost = Math.floor(
				hostRect.height - CARD_VERTICAL_PADDING,
			);
			const maxHeightByViewport = Math.floor(
				visibleBottom - hostTop - CARD_VERTICAL_PADDING,
			);
			const availableHeight = Math.max(
				1,
				Math.min(maxHeightByHost, maxHeightByViewport, CARD_MAX_HEIGHT),
			);

			if (
				!Number.isFinite(availableWidth) ||
				!Number.isFinite(availableHeight)
			) {
				return;
			}

			const maxHeightByWidth = Math.floor(availableWidth / CARD_ASPECT_RATIO);
			const finalHeight = Math.max(
				1,
				Math.min(availableHeight, maxHeightByWidth),
			);
			const fittedWidth = Math.max(
				1,
				Math.floor(finalHeight * CARD_ASPECT_RATIO),
			);
			const nextSize = {
				width: Math.max(1, Math.floor(fittedWidth)),
				height: Math.max(1, Math.floor(finalHeight)),
			};

			setCardFrameSize((previousSize) =>
				previousSize &&
				previousSize.width === nextSize.width &&
				previousSize.height === nextSize.height
					? previousSize
					: nextSize,
			);
		};

		updateFrameSize();
		const rafId = window.requestAnimationFrame(updateFrameSize);
		const timeoutId = window.setTimeout(updateFrameSize, 120);

		const resizeObserver =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(updateFrameSize)
				: null;

		resizeObserver?.observe(host);
		window.addEventListener("resize", updateFrameSize);
		window.addEventListener("orientationchange", updateFrameSize);
		window.addEventListener("scroll", updateFrameSize, { passive: true });
		visualViewport?.addEventListener("resize", updateFrameSize);
		visualViewport?.addEventListener("scroll", updateFrameSize);

		return () => {
			window.cancelAnimationFrame(rafId);
			window.clearTimeout(timeoutId);
			resizeObserver?.disconnect();
			window.removeEventListener("resize", updateFrameSize);
			window.removeEventListener("orientationchange", updateFrameSize);
			window.removeEventListener("scroll", updateFrameSize);
			visualViewport?.removeEventListener("resize", updateFrameSize);
			visualViewport?.removeEventListener("scroll", updateFrameSize);
		};
	}, [isSessionLayout]);

	// Audio URLs (static, loaded once)
	const audioUrls: AudioUrls = AUDIO_FILES;

	// Derived values
	const filteredCards = useMemo(
		() =>
			cards.filter((card) =>
				activeReviewTypes.includes(resolveCardReviewType(card)),
			),
		[cards, activeReviewTypes],
	);
	const visibleCards = useMemo(
		() =>
			pendingRemovalCardId
				? filteredCards.filter((card) => card.id !== pendingRemovalCardId)
				: filteredCards,
		[filteredCards, pendingRemovalCardId],
	);
	const cardsTotal = visibleCards.length;
	const cardsCompleted = cards.length === 0;
	const hasVisibleCards = cardsTotal > 0;
	const isFilterEmpty = !cardsCompleted && !hasVisibleCards;
	const remainingCount = cardsTotal;
	const cardData = hasVisibleCards ? visibleCards[0] : null;
	const currentCardAudioSelectionKey = cardData
		? buildSessionCardAudioCacheKey(cardData)
		: null;
	const selectedShareContactIds = currentCardAudioSelectionKey
		? (shareSelectionsByCardKey[currentCardAudioSelectionKey] ?? [])
		: [];
	const nextCardData = cardsTotal > 1 ? visibleCards[1] : null;
	const isDragActive = Math.abs(dragX) > 4 || isSwiping;
	const showUnderCard =
		hasVisibleCards && !!nextCardData && (Math.abs(dragX) > 4 || isSwiping);
	const actionHints = useMemo(() => resolveActionHints(cardData), [cardData]);
	const cardFrameStyle = isSessionLayout
		? {
				width: "100%",
				aspectRatio: CARD_ASPECT_RATIO,
			}
		: cardFrameSize
			? {
					height: `${cardFrameSize.height}px`,
					width: `${cardFrameSize.width}px`,
					maxHeight: `min(100%, ${CARD_MAX_HEIGHT}px)`,
					maxWidth: `min(100%, ${CARD_MAX_WIDTH}px)`,
					aspectRatio: CARD_ASPECT_RATIO,
				}
			: {
					height: "100%",
					maxHeight: `min(100%, ${CARD_MAX_HEIGHT}px)`,
					width: "auto",
					maxWidth: `min(100%, ${CARD_MAX_WIDTH}px)`,
					minHeight: `${CARD_MIN_HEIGHT}px`,
					minWidth: `${CARD_MIN_WIDTH}px`,
					aspectRatio: CARD_ASPECT_RATIO,
				};
	const dueFeedbackIsVisible =
		dueFeedbackPhase === "entering" || dueFeedbackPhase === "visible";
	const dueFeedbackTransitionMs =
		dueFeedbackPhase === "entering"
			? DUE_FEEDBACK_FADE_IN_MS
			: dueFeedbackPhase === "exiting"
				? DUE_FEEDBACK_FADE_OUT_MS
				: 220;
	const reviewSourceChipProps = {
		sourceChipPlacement: "bottom",
		sourceChipTone: "muted",
		showSourceChipOnBack: false,
	} as const;
	const showReminderNudgeCta =
		Boolean(user) && !shouldUseDemoData && !isGuestLocalReviewMode;
	const profilePath = buildAppProfilePath(profile?.username);

	const stopCardAudioTimers = useCallback(() => {
		if (cardAudioIntervalRef.current !== null) {
			window.clearInterval(cardAudioIntervalRef.current);
			cardAudioIntervalRef.current = null;
		}

		if (cardAudioTimeoutRef.current !== null) {
			window.clearTimeout(cardAudioTimeoutRef.current);
			cardAudioTimeoutRef.current = null;
		}
	}, []);

	const stopCardAudioRecorderStream = useCallback(() => {
		if (!cardAudioStreamRef.current) {
			return;
		}

		for (const track of cardAudioStreamRef.current.getTracks()) {
			track.stop();
		}

		cardAudioStreamRef.current = null;
	}, []);

	const stopCardAudioPlayback = useCallback(() => {
		const audio = cardAudioPlayerRef.current;
		if (!audio) {
			setIsCardAudioPlaying(false);
			return;
		}

		audio.pause();
		audio.currentTime = 0;
		cardAudioPlayerRef.current = null;
		setIsCardAudioPlaying(false);
	}, []);

	const stopContactAudioPlayback = useCallback(() => {
		const audio = contactAudioPlayerRef.current;
		if (!audio) {
			setActiveContactAudioPostId(null);
			return;
		}

		audio.pause();
		audio.currentTime = 0;
		contactAudioPlayerRef.current = null;
		setActiveContactAudioPostId(null);
	}, []);

	const toggleContactAudioPlayback = useCallback(
		async (audioPost: PreviewDiscussionAudioPost) => {
			if (isFlipAudioMuted) {
				return;
			}

			if (!audioPost.audioUrl) {
				return;
			}

			if (activeContactAudioPostId === audioPost.id) {
				stopContactAudioPlayback();
				return;
			}

			stopContactAudioPlayback();
			const audio = new Audio(audioPost.audioUrl);
			audio.onended = () => {
				contactAudioPlayerRef.current = null;
				setActiveContactAudioPostId(null);
			};
			audio.onerror = () => {
				contactAudioPlayerRef.current = null;
				setActiveContactAudioPostId(null);
			};

			contactAudioPlayerRef.current = audio;
			try {
				await audio.play();
				setActiveContactAudioPostId(audioPost.id);
			} catch {
				contactAudioPlayerRef.current = null;
				setActiveContactAudioPostId(null);
				toast.error("Unable to play this audio.");
			}
		},
		[activeContactAudioPostId, isFlipAudioMuted, stopContactAudioPlayback],
	);

	const loadSessionConnectionsForAudio = useCallback(async () => {
		if (!isSessionLayout || !user?.id) {
			setSessionConnections([]);
			setSessionConnectionsError(null);
			return [] as FriendListItem[];
		}

		setIsSessionConnectionsLoading(true);
		setSessionConnectionsError(null);
		try {
			const { loadPreviewConnections } = await import(
				"@/features/preview-new-concept/services"
			);
			const connections = await loadPreviewConnections();
			setSessionConnections(connections);
			return connections;
		} catch (error) {
			console.error(
				"Unable to load preview connections for card audio:",
				error,
			);
			setSessionConnectionsError("Unable to load your contacts right now.");
			return [] as FriendListItem[];
		} finally {
			setIsSessionConnectionsLoading(false);
		}
	}, [isSessionLayout, user?.id]);

	const flushSessionAudioShares = useCallback(
		async (quiet = false) => {
			if (!isSessionLayout || !user?.id || usePlainHtmlSessionChrome) {
				return;
			}

			if (hasSessionShareFlushRef.current) {
				return;
			}

			hasSessionShareFlushRef.current = true;

			try {
				const { dispatchPreviewSessionAudioShareBatch } = await import(
					"@/features/preview-new-concept/discussionService"
				);
				const dispatchResult = await dispatchPreviewSessionAudioShareBatch(
					sessionShareKeyRef.current,
				);

				if (quiet || dispatchResult.sharedAudioCount === 0) {
					return;
				}

				if (dispatchResult.notifiedFriendCount > 0) {
					toast.success(
						`Share sent: ${dispatchResult.sharedAudioCount} audio clip${dispatchResult.sharedAudioCount > 1 ? "s" : ""} to ${dispatchResult.notifiedFriendCount} ${sessionPeerLabel}${dispatchResult.notifiedFriendCount > 1 ? "s" : ""}.`,
					);
					return;
				}

				toast.success(
					`Share ready: ${dispatchResult.sharedAudioCount} audio clip${dispatchResult.sharedAudioCount > 1 ? "s" : ""} saved for this session.`,
				);
			} catch (error) {
				hasSessionShareFlushRef.current = false;
				console.error("Unable to flush session audio shares:", error);
				if (!quiet) {
					toast.error("Unable to send the session share.");
				}
			}
		},
		[isSessionLayout, usePlainHtmlSessionChrome, user?.id],
	);

	const handleSessionBackClick = useCallback(() => {
		if (!onBackClick) {
			return;
		}

		void flushSessionAudioShares();
		onBackClick();
	}, [flushSessionAudioShares, onBackClick]);

	const handleSessionCompletion = useCallback(() => {
		if (!onSessionCompleted) {
			return;
		}

		void flushSessionAudioShares();
		onSessionCompleted();
	}, [flushSessionAudioShares, onSessionCompleted]);

	const setCurrentCardAudioPostInCache = useCallback(
		(audioPost: PreviewDiscussionAudioPost | null) => {
			setCurrentCardAudioPost(audioPost);
			const cacheKey = currentCardAudioCacheKeyRef.current;
			if (!cacheKey) {
				return;
			}

			cardAudioPostCacheRef.current.set(cacheKey, {
				fetchedAt: Date.now(),
				post: audioPost,
			});
		},
		[],
	);

	const invalidateCardAudioFetches = useCallback(() => {
		cardAudioFetchRequestIdRef.current += 1;
		setIsCardAudioLoading(false);
	}, []);

	const refreshCurrentCardAudioPost = useCallback(
		async (activeCard: VocabCard | null) => {
			if (!isSessionLayout || !user?.id || !activeCard) {
				currentCardAudioCacheKeyRef.current = null;
				setCurrentCardAudioPost(null);
				setIsCardAudioLoading(false);
				return;
			}

			const cacheKey = buildSessionCardAudioCacheKey(activeCard);
			currentCardAudioCacheKeyRef.current = cacheKey;

			const cachedEntry = cardAudioPostCacheRef.current.get(cacheKey);
			if (cachedEntry) {
				setCurrentCardAudioPost(cachedEntry.post);
			} else {
				setCurrentCardAudioPost(null);
			}

			const cacheIsFresh =
				typeof cachedEntry !== "undefined" &&
				Date.now() - cachedEntry.fetchedAt <
					PREVIEW_SESSION_CARD_AUDIO_CACHE_TTL_MS;

			if (cacheIsFresh) {
				setIsCardAudioLoading(false);
				return;
			}

			const requestId = cardAudioFetchRequestIdRef.current + 1;
			cardAudioFetchRequestIdRef.current = requestId;
			setIsCardAudioLoading(true);
			try {
				const { listPreviewDiscussionAudioPosts } = await import(
					"@/features/preview-new-concept/discussionService"
				);
				const audioPosts = await listPreviewDiscussionAudioPosts(activeCard);
				const ownAudioPost =
					audioPosts.find((audioPost) => audioPost.userId === user.id) ?? null;

				cardAudioPostCacheRef.current.set(cacheKey, {
					fetchedAt: Date.now(),
					post: ownAudioPost,
				});

				if (
					cardAudioFetchRequestIdRef.current === requestId &&
					currentCardAudioCacheKeyRef.current === cacheKey
				) {
					setCurrentCardAudioPost(ownAudioPost);
				}
			} catch (error) {
				console.error("Unable to load current card audio post:", error);
				if (!cachedEntry) {
					cardAudioPostCacheRef.current.set(cacheKey, {
						fetchedAt: Date.now(),
						post: null,
					});

					if (
						cardAudioFetchRequestIdRef.current === requestId &&
						currentCardAudioCacheKeyRef.current === cacheKey
					) {
						setCurrentCardAudioPost(null);
					}
				}
			} finally {
				if (cardAudioFetchRequestIdRef.current === requestId) {
					setIsCardAudioLoading(false);
				}
			}
		},
		[isSessionLayout, user?.id],
	);

	const stopCardAudioRecording = useCallback(() => {
		if (cardAudioRecorderRef.current?.state === "recording") {
			cardAudioRecorderRef.current.stop();
		}
		stopCardAudioTimers();
	}, [stopCardAudioTimers]);

	const startCardAudioRecording = useCallback(async () => {
		if (!isSessionLayout || !user?.id || !cardData) {
			return;
		}

		if (!navigator.mediaDevices?.getUserMedia) {
			toast.error("Your browser does not support audio recording.");
			return;
		}

		if (typeof MediaRecorder === "undefined") {
			toast.error("Audio recording is not available here.");
			return;
		}

		if (isCardAudioSaving) {
			return;
		}

		setIsCardAudioMenuOpen(false);
		invalidateCardAudioFetches();
		stopCardAudioPlayback();
		stopCardAudioTimers();
		stopCardAudioRecorderStream();

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: PREVIEW_SESSION_RECORDING_CONSTRAINTS,
			});
			cardAudioStreamRef.current = stream;
			cardAudioChunksRef.current = [];

			const preferredMimeType = resolveSessionRecordingMimeType();
			const recorder = preferredMimeType
				? new MediaRecorder(stream, {
						audioBitsPerSecond: PREVIEW_SESSION_RECORDING_BITRATE,
						mimeType: preferredMimeType,
					})
				: new MediaRecorder(stream, {
						audioBitsPerSecond: PREVIEW_SESSION_RECORDING_BITRATE,
					});

			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					cardAudioChunksRef.current.push(event.data);
				}
			};

			recorder.onerror = () => {
				setIsCardAudioRecording(false);
				stopCardAudioTimers();
				stopCardAudioRecorderStream();
				toast.error("Unable to finish recording.");
			};

			recorder.onstop = () => {
				stopCardAudioTimers();
				setIsCardAudioRecording(false);
				stopCardAudioRecorderStream();

				const chunks = cardAudioChunksRef.current;
				cardAudioChunksRef.current = [];
				if (chunks.length === 0) {
					return;
				}

				const durationMs = Math.max(
					1,
					Math.min(
						PREVIEW_SESSION_MAX_RECORDING_DURATION_MS,
						Date.now() - (cardAudioRecordingStartedAtRef.current ?? Date.now()),
					),
				);

				const mimeType = recorder.mimeType || preferredMimeType || "audio/webm";
				const blob = new Blob(chunks, { type: mimeType });
				const audioFile = buildSessionRecordingFile(blob);

				void (async () => {
					setIsCardAudioSaving(true);
					try {
						const { createOrReplaceCurrentUserPreviewDiscussionAudioPost } =
							await import("@/features/preview-new-concept/discussionService");
						const savedAudioPost =
							await createOrReplaceCurrentUserPreviewDiscussionAudioPost({
								audioFile,
								card: cardData,
								recordingDurationMs: durationMs,
							});
						setCurrentCardAudioPostInCache(savedAudioPost);
						hasSessionShareFlushRef.current = false;
						toast.success("Audio saved.");
					} catch (error) {
						console.error("Unable to save card recording:", error);
						toast.error("Unable to save this audio.");
					} finally {
						setIsCardAudioSaving(false);
						setCardAudioRecordingSeconds(0);
					}
				})();
			};

			cardAudioRecorderRef.current = recorder;
			cardAudioRecordingStartedAtRef.current = Date.now();
			setCardAudioRecordingSeconds(0);
			setIsCardAudioRecording(true);
			recorder.start();

			cardAudioIntervalRef.current = window.setInterval(() => {
				setCardAudioRecordingSeconds((seconds) =>
					Math.min(PREVIEW_SESSION_MAX_RECORDING_SECONDS, seconds + 1),
				);
			}, 1000);

			cardAudioTimeoutRef.current = window.setTimeout(() => {
				if (cardAudioRecorderRef.current?.state === "recording") {
					cardAudioRecorderRef.current.stop();
				}
			}, PREVIEW_SESSION_MAX_RECORDING_DURATION_MS);
		} catch (error) {
			console.error("Unable to start card recording:", error);
			stopCardAudioTimers();
			stopCardAudioRecorderStream();
			setIsCardAudioRecording(false);
			toast.error("Unable to start recording.");
		}
	}, [
		cardData,
		invalidateCardAudioFetches,
		isCardAudioSaving,
		isSessionLayout,
		setCurrentCardAudioPostInCache,
		stopCardAudioPlayback,
		stopCardAudioRecorderStream,
		stopCardAudioTimers,
		user?.id,
	]);

	const toggleCurrentCardAudioPlayback = useCallback(async () => {
		if (isFlipAudioMuted) {
			return;
		}

		if (!currentCardAudioPost?.audioUrl) {
			return;
		}

		if (isCardAudioPlaying) {
			stopCardAudioPlayback();
			return;
		}

		stopCardAudioPlayback();

		const audio = new Audio(currentCardAudioPost.audioUrl);
		audio.onended = () => {
			cardAudioPlayerRef.current = null;
			setIsCardAudioPlaying(false);
		};
		audio.onerror = () => {
			cardAudioPlayerRef.current = null;
			setIsCardAudioPlaying(false);
		};

		cardAudioPlayerRef.current = audio;
		try {
			await audio.play();
			setIsCardAudioPlaying(true);
		} catch {
			cardAudioPlayerRef.current = null;
			setIsCardAudioPlaying(false);
			toast.error("Unable to play this audio.");
		}
	}, [
		currentCardAudioPost?.audioUrl,
		isFlipAudioMuted,
		isCardAudioPlaying,
		stopCardAudioPlayback,
	]);

	useEffect(() => {
		if (!isFlipAudioMuted) {
			return;
		}

		stopCardAudioPlayback();
		stopContactAudioPlayback();
	}, [isFlipAudioMuted, stopCardAudioPlayback, stopContactAudioPlayback]);

	const handleDeleteCurrentCardAudio = useCallback(async () => {
		if (!currentCardAudioPost) {
			return;
		}

		setIsCardAudioMenuOpen(false);
		setIsCardAudioSaving(true);
		invalidateCardAudioFetches();
		try {
			const { deletePreviewDiscussionAudioPost } = await import(
				"@/features/preview-new-concept/discussionService"
			);
			await deletePreviewDiscussionAudioPost(currentCardAudioPost.id);
			setCurrentCardAudioPostInCache(null);
			stopCardAudioPlayback();
			hasSessionShareFlushRef.current = false;
			toast.success("Audio deleted.");
		} catch (error) {
			console.error("Unable to delete current card audio:", error);
			toast.error("Unable to delete this audio.");
		} finally {
			setIsCardAudioSaving(false);
		}
	}, [
		currentCardAudioPost,
		invalidateCardAudioFetches,
		setCurrentCardAudioPostInCache,
		stopCardAudioPlayback,
	]);

	const handleToggleCurrentCardShareSelection = useCallback(async () => {
		if (!currentCardAudioPost) {
			return;
		}

		setIsCardAudioShareUpdating(true);
		invalidateCardAudioFetches();
		try {
			const { setPreviewSessionAudioPostShareIntent } = await import(
				"@/features/preview-new-concept/discussionService"
			);
			const shouldSelect = !currentCardAudioPost.shareSelected;
			const updatedPost = await setPreviewSessionAudioPostShareIntent({
				audioPostId: currentCardAudioPost.id,
				selected: shouldSelect,
				sessionKey: shouldSelect ? sessionShareKeyRef.current : null,
			});
			setCurrentCardAudioPostInCache(updatedPost);
			hasSessionShareFlushRef.current = false;
			toast.success(
				shouldSelect
					? "Audio added to end-of-session sharing."
					: "Audio removed from end-of-session sharing.",
			);
		} catch (error) {
			console.error("Unable to update audio share selection:", error);
			toast.error("Unable to update sharing for this audio.");
		} finally {
			setIsCardAudioShareUpdating(false);
		}
	}, [
		currentCardAudioPost,
		invalidateCardAudioFetches,
		setCurrentCardAudioPostInCache,
	]);

	const handleRerecordCurrentCardAudio = useCallback(() => {
		setIsCardAudioMenuOpen(false);
		void startCardAudioRecording();
	}, [startCardAudioRecording]);

	const openContactAudiosDialog = useCallback(async () => {
		setIsCardAudioMenuOpen(false);
		setShowContactAudiosDialog(true);
		setContactAudioPostsError(null);
		setIsContactAudioPostsLoading(true);

		try {
			const { listPreviewDiscussionAudioPosts } = await import(
				"@/features/preview-new-concept/discussionService"
			);
			const [connections, audioPosts] = await Promise.all([
				sessionConnections.length > 0
					? Promise.resolve(sessionConnections)
					: loadSessionConnectionsForAudio(),
				cardData
					? listPreviewDiscussionAudioPosts(cardData)
					: Promise.resolve([]),
			]);

			const connectionIds = new Set(connections.map((friend) => friend.userId));
			const filteredPosts = audioPosts.filter(
				(audioPost) =>
					connectionIds.has(audioPost.userId) &&
					audioPost.userId !== user?.id &&
					Boolean(audioPost.audioUrl),
			);
			setContactAudioPosts(filteredPosts);
		} catch (error) {
			console.error("Unable to load contact audios for current card:", error);
			setContactAudioPosts([]);
			setContactAudioPostsError("Unable to load contact audio for this card.");
		} finally {
			setIsContactAudioPostsLoading(false);
		}
	}, [cardData, loadSessionConnectionsForAudio, sessionConnections, user?.id]);

	const openShareContactsDialog = useCallback(async () => {
		if (!currentCardAudioPost) {
			return;
		}

		setIsCardAudioMenuOpen(false);
		setShowShareContactsDialog(true);
		if (sessionConnections.length === 0) {
			await loadSessionConnectionsForAudio();
		}
	}, [
		currentCardAudioPost,
		loadSessionConnectionsForAudio,
		sessionConnections.length,
	]);

	const toggleContactShareSelection = useCallback(
		(friendUserId: string) => {
			if (!currentCardAudioPost || !currentCardAudioSelectionKey) {
				return;
			}

			setShareSelectionsByCardKey((previousSelections) => {
				const currentSelection =
					previousSelections[currentCardAudioSelectionKey] ?? [];
				const hasFriend = currentSelection.includes(friendUserId);
				const nextSelection = hasFriend
					? currentSelection.filter((id) => id !== friendUserId)
					: [...currentSelection, friendUserId];

				return {
					...previousSelections,
					[currentCardAudioSelectionKey]: nextSelection,
				};
			});
		},
		[currentCardAudioPost, currentCardAudioSelectionKey],
	);

	useEffect(() => {
		let cancelled = false;

		if (!isSessionLayout || !user?.id || !cardData) {
			currentCardAudioCacheKeyRef.current = null;
			setCurrentCardAudioPost(null);
			setIsCardAudioLoading(false);
			setIsCardAudioMenuOpen(false);
			return () => {
				cancelled = true;
			};
		}

		setIsCardAudioMenuOpen(false);
		void (async () => {
			await refreshCurrentCardAudioPost(cardData);
			if (!cancelled) {
				setIsCardAudioMenuOpen(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [cardData, isSessionLayout, refreshCurrentCardAudioPost, user?.id]);

	useEffect(() => {
		if (!usePlainHtmlSessionChrome || !isCardAudioMenuOpen) {
			return;
		}

		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			const target = event.target as Node | null;
			if (!target || !sessionAudioMenuRef.current) {
				return;
			}

			if (!sessionAudioMenuRef.current.contains(target)) {
				setIsCardAudioMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("touchstart", handlePointerDown);

		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("touchstart", handlePointerDown);
		};
	}, [isCardAudioMenuOpen, usePlainHtmlSessionChrome]);

	useEffect(() => {
		if (!showContactAudiosDialog) {
			stopContactAudioPlayback();
		}
	}, [showContactAudiosDialog, stopContactAudioPlayback]);

	useEffect(() => {
		void currentCardAudioSelectionKey;
		setShowContactAudiosDialog(false);
		setShowShareContactsDialog(false);
		stopContactAudioPlayback();
	}, [currentCardAudioSelectionKey, stopContactAudioPlayback]);

	useEffect(() => {
		if (!isSessionLayout || !user?.id) {
			return;
		}

		const handlePageHide = () => {
			void flushSessionAudioShares(true);
		};

		window.addEventListener("pagehide", handlePageHide);
		window.addEventListener("beforeunload", handlePageHide);

		return () => {
			window.removeEventListener("pagehide", handlePageHide);
			window.removeEventListener("beforeunload", handlePageHide);
		};
	}, [flushSessionAudioShares, isSessionLayout, user?.id]);

	useEffect(() => {
		return () => {
			stopCardAudioTimers();
			stopCardAudioRecorderStream();
			stopCardAudioPlayback();
			if (isSessionLayout && user?.id) {
				void flushSessionAudioShares(true);
			}
		};
	}, [
		flushSessionAudioShares,
		isSessionLayout,
		stopCardAudioPlayback,
		stopCardAudioRecorderStream,
		stopCardAudioTimers,
		user?.id,
	]);

	useEffect(() => {
		if (!handleSessionCompletion || isLoadingCards || !cardsCompleted) {
			completionReportedRef.current = false;
			return;
		}

		if (completionReportedRef.current) {
			return;
		}

		completionReportedRef.current = true;
		handleSessionCompletion();
	}, [cardsCompleted, handleSessionCompletion, isLoadingCards]);

	const reviewSummaryCounts = useMemo(() => {
		const counts = countReviewSummaryBuckets(visibleCards);
		return {
			newCards: counts.newCards,
			learningCards: counts.inProgressCards,
			reviewCards: counts.reviewCards,
		};
	}, [visibleCards]);

	const reviewTypeCounts = useMemo(() => {
		return cards.reduce(
			(acc, card) => {
				const type = resolveCardReviewType(card);
				acc[type] += 1;
				return acc;
			},
			{
				foundation: 0,
				collected: 0,
				sent: 0,
			} as Record<ReviewType, number>,
		);
	}, [cards]);

	const filtersWithCounts = useMemo(
		() =>
			activeFilters.map((filter) => {
				const filterDefinition = REVIEW_FILTER_DEFINITIONS.find(
					(definition) => definition.id === filter.id,
				);

				return {
					...filter,
					count: filterDefinition
						? reviewTypeCounts[filterDefinition.reviewType]
						: filter.count,
				};
			}),
		[activeFilters, reviewTypeCounts],
	);

	useEffect(() => {
		onCardsChanged?.(cards);
	}, [cards, onCardsChanged]);

	const visibleFiltersWithCounts = useMemo(
		() =>
			filtersWithCounts.filter((filter) =>
				availableFilterIds.includes(filter.id),
			),
		[availableFilterIds, filtersWithCounts],
	);

	// Resume AudioContext on first user interaction (required for mobile)
	useEffect(() => {
		const handleUserInteraction = () => {
			if (isInitialized) {
				resume();
				window.removeEventListener("click", handleUserInteraction);
				window.removeEventListener("keydown", handleUserInteraction);
				window.removeEventListener("touchstart", handleUserInteraction);
			}
		};

		window.addEventListener("click", handleUserInteraction);
		window.addEventListener("keydown", handleUserInteraction);
		window.addEventListener("touchstart", handleUserInteraction);

		return () => {
			window.removeEventListener("click", handleUserInteraction);
			window.removeEventListener("keydown", handleUserInteraction);
			window.removeEventListener("touchstart", handleUserInteraction);
		};
	}, [isInitialized, resume]);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setShowFilterDropdown(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// Cleanup timeouts
	useEffect(() => {
		return () => {
			if (swipeTimeoutRef.current) {
				window.clearTimeout(swipeTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!dueTimingFeedback) {
			setDueFeedbackPhase("hidden");
			return;
		}

		setDueFeedbackPhase("hidden");

		const frameId = window.requestAnimationFrame(() => {
			setDueFeedbackPhase("entering");
		});

		const markVisibleTimeoutId = window.setTimeout(() => {
			setDueFeedbackPhase("visible");
		}, DUE_FEEDBACK_FADE_IN_MS);

		const startFadeOutTimeoutId = window.setTimeout(() => {
			setDueFeedbackPhase("exiting");
		}, DUE_FEEDBACK_FADE_IN_MS + DUE_FEEDBACK_HOLD_MS);

		const clearTimeoutId = window.setTimeout(
			() => {
				setDueTimingFeedback(null);
				setDueFeedbackPhase("hidden");
			},
			DUE_FEEDBACK_FADE_IN_MS + DUE_FEEDBACK_HOLD_MS + DUE_FEEDBACK_FADE_OUT_MS,
		);

		return () => {
			window.cancelAnimationFrame(frameId);
			window.clearTimeout(markVisibleTimeoutId);
			window.clearTimeout(startFadeOutTimeoutId);
			window.clearTimeout(clearTimeoutId);
		};
	}, [dueTimingFeedback]);

	useEffect(() => {
		if (!finishSoundOnNextCardsUpdateRef.current) {
			return;
		}

		if (cards.length === 0) {
			setPendingFinishSound(true);
		}

		finishSoundOnNextCardsUpdateRef.current = false;
	}, [cards.length]);

	// Play finish sound only after a successful review clears all due cards.
	useEffect(() => {
		if (!pendingFinishSound) {
			return;
		}

		if (!readCardSoundEnabled()) {
			setPendingFinishSound(false);
			return;
		}

		if (!isInitialized) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			playFinish();
			setPendingFinishSound(false);
		}, 100);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [pendingFinishSound, isInitialized, playFinish]);

	// Flip card handler
	const handleFlipCard = () => {
		emitReviewCardFlipped();
		setIsFlipping(true);
		setCardFlipped((prev) => !prev);
		setFlipKey((prev) => prev + 1);
		setTimeout(() => {
			setIsFlipping(false);
		}, 600);
	};

	// Toggle vowels handler
	const handleToggleVowels = () => {
		setShowVowels((prev) => !prev);
	};

	// Trigger swipe action
	const triggerSwipeAction = (
		direction: "left" | "right",
		source: "drag" | "button" = "button",
	) => {
		if (!cardData || isSwiping || isSubmittingReview) return;
		if (Date.now() < swipeCooldownUntilRef.current) {
			return;
		}

		if (isGuest && !isGuestLocalReviewMode) {
			onGuestReviewAction?.();
			return;
		}

		if (shouldUseDemoData) {
			setIsDraggingCard(false);
			setIsSwiping(true);

			if (source === "button") {
				setIsSwipeExiting(false);
				setDragX(0);
				requestAnimationFrame(() => {
					const width = cardDragRef.current?.offsetWidth ?? 320;
					const baseDirection = direction === "right" ? 1 : -1;
					setDragX(baseDirection * width * 0.45);
					setIsSwipeExiting(true);
				});
			} else {
				setIsSwipeExiting(true);
			}

			if (swipeTimeoutRef.current) {
				window.clearTimeout(swipeTimeoutRef.current);
			}

			swipeTimeoutRef.current = window.setTimeout(() => {
				swipeCooldownUntilRef.current = Date.now() + SWIPE_DRAG_COOLDOWN_MS;
				setDragX(0);
				setCardFlipped(false);
				setShowVowels(false);
				setIsSwiping(false);
				setIsSwipeExiting(false);
			}, 220);
			return;
		}

		// Check if sound is enabled and play appropriate SFX
		if (readCardSoundEnabled()) {
			if (direction === "left") {
				playFail();
			} else {
				playValider();
			}
		}

		const currentCard = cardData;
		const rating: BinaryReviewRating = direction === "right" ? "pass" : "fail";

		const width = cardDragRef.current?.offsetWidth ?? 320;
		const baseDirection = direction === "right" ? 1 : -1;
		const exitDistance = Math.max(Math.abs(dragX), width * 1.15);
		const exitX = baseDirection * exitDistance;

		if (swipeTimeoutRef.current) {
			window.clearTimeout(swipeTimeoutRef.current);
		}

		setIsDraggingCard(false);
		setIsSwiping(true);

		if (source === "button") {
			setIsSwipeExiting(false);
			setDragX(0);
			requestAnimationFrame(() => {
				setDragX(exitX);
				setIsSwipeExiting(true);
			});
		} else {
			setIsSwipeExiting(true);
			setDragX(exitX);
		}

		swipeTimeoutRef.current = window.setTimeout(() => {
			swipeCooldownUntilRef.current = Date.now() + SWIPE_DRAG_COOLDOWN_MS;
			// Hide the swiped card immediately to avoid a visual flash while RPC resolves
			if (currentCard) {
				setPendingRemovalCardId(String(currentCard.id));
				void submitReview(currentCard, rating);
			}

			setDragX(0);
			setCardFlipped(false);
			setShowVowels(false);
			setIsSwiping(false);
			setIsSwipeExiting(false);
		}, 320);
	};

	// Pointer handlers for drag
	const handleCardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!cardData || isSwiping) return;
		if (Date.now() < swipeCooldownUntilRef.current) {
			return;
		}
		if (event.isPrimary === false || event.button !== 0) {
			return;
		}

		const target = event.target as HTMLElement | null;
		if (target?.closest("button")) {
			return;
		}

		event.preventDefault();
		activePointerIdRef.current = event.pointerId;
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			// Ignore pointer capture errors (unsupported or invalid state).
		}
		dragStartXRef.current = event.clientX;
		setDragX(0);
		setIsDraggingCard(true);
		hasDraggedRef.current = false;
	};

	const handleCardPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!isDraggingCard || !cardData || isSwiping) return;
		if (activePointerIdRef.current !== event.pointerId) {
			activePointerIdRef.current = null;
			setIsDraggingCard(false);
			setDragX(0);
			hasDraggedRef.current = false;
			return;
		}
		if (event.pointerType === "mouse" && event.buttons === 0) {
			handleCardPointerUp(event);
			return;
		}
		const delta = event.clientX - dragStartXRef.current;
		if (Math.abs(delta) > 4) {
			hasDraggedRef.current = true;
		}
		setDragX(delta);
	};

	const finishCardDragInteraction = (
		event: React.PointerEvent<HTMLDivElement>,
		delta: number,
	) => {
		const width = cardDragRef.current?.offsetWidth ?? 320;
		const absoluteDelta = Math.abs(delta);
		const swipeAssistThreshold = Math.min(72, width * 0.14);

		activePointerIdRef.current = null;
		try {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}
		} catch {
			// Ignore pointer capture errors (unsupported or invalid state).
		}

		if (absoluteDelta >= swipeAssistThreshold) {
			triggerSwipeAction(delta > 0 ? "right" : "left", "drag");
			hasDraggedRef.current = false;
			return;
		}

		if (!hasDraggedRef.current && absoluteDelta <= 4) {
			handleFlipCard();
		}

		setIsDraggingCard(false);
		setDragX(0);
		hasDraggedRef.current = false;
	};

	const handleCardPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (isSwiping) {
			return;
		}

		if (!isDraggingCard || !cardData) {
			setIsDraggingCard(false);
			setDragX(0);
			return;
		}
		if (activePointerIdRef.current !== event.pointerId) {
			return;
		}
		if (event.type === "pointerleave" && event.buttons !== 0) {
			return;
		}

		const delta = event.clientX - dragStartXRef.current;
		finishCardDragInteraction(event, delta);
	};

	const handleCardPointerCancel = (
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		if (isSwiping) {
			return;
		}

		if (!isDraggingCard || !cardData) {
			setIsDraggingCard(false);
			setDragX(0);
			return;
		}

		if (
			activePointerIdRef.current !== null &&
			event.pointerId !== activePointerIdRef.current
		) {
			activePointerIdRef.current = null;
			setIsDraggingCard(false);
			setDragX(0);
			hasDraggedRef.current = false;
			return;
		}

		finishCardDragInteraction(event, dragX);
	};

	const handleGuestActionCapture = (
		event: React.MouseEvent<HTMLDivElement>,
	) => {
		if (!isGuest || isGuestLocalReviewMode) {
			return;
		}

		const target = event.target as HTMLElement | null;
		const actionButton = target?.closest(
			'button[aria-label="Fail card"], button[aria-label="Pass card"]',
		);

		if (!actionButton) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		onGuestReviewAction?.();
	};

	const renderFilterTrigger = (className: string) => (
		<div className={className} ref={dropdownRef}>
			<button
				type="button"
				onClick={() => setShowFilterDropdown(!showFilterDropdown)}
				onMouseEnter={() => {
					if (usePlainHtmlSessionChrome) {
						setIsSessionFilterTriggerHovered(true);
					}
				}}
				onMouseLeave={() => {
					if (usePlainHtmlSessionChrome) {
						setIsSessionFilterTriggerHovered(false);
					}
				}}
				className={
					usePlainHtmlSessionChrome
						? "inline-flex items-center"
						: "flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3.5 py-1.5 text-card-foreground transition-colors hover:bg-accent"
				}
				style={
					usePlainHtmlSessionChrome
						? {
								fontSize: "13.3333px",
								fontFamily: "Arial, sans-serif",
								backgroundColor: isSessionFilterTriggerHovered
									? "#e3e3e3"
									: "#efefef",
								color: "#000000",
								border: "1px solid #000000",
								borderRadius: "3px",
								padding: "1px 6px",
							}
						: undefined
				}
			>
				{usePlainHtmlSessionChrome ? (
					<>
						<span>all my cards</span>
						<span aria-hidden="true" style={{ marginLeft: "4px" }}>
							▾
						</span>
					</>
				) : (
					<>
						<svg
							width="14"
							height="14"
							viewBox="0 0 16 16"
							fill="none"
							className="text-muted-foreground"
							aria-label="Filter"
							role="img"
						>
							<title>Filter</title>
							<rect
								x="2"
								y="2"
								width="12"
								height="12"
								rx="2"
								stroke="currentColor"
								strokeWidth="1.2"
							/>
							<rect
								x="4"
								y="4"
								width="8"
								height="3"
								rx="0.5"
								fill="currentColor"
								opacity="0.4"
							/>
							<rect
								x="4"
								y="9"
								width="5"
								height="3"
								rx="0.5"
								fill="currentColor"
								opacity="0.4"
							/>
						</svg>
						<span className="text-sm text-card-foreground">
							All my reviews
						</span>
						<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
					</>
				)}
			</button>

			{showFilterDropdown && (
				<ReviewFilterDropdown
					filters={visibleFiltersWithCounts}
					onFiltersChange={setActiveFilters}
					plainHtmlMode={usePlainHtmlSessionChrome}
				/>
			)}
		</div>
	);

	const hasCurrentCardAudio = Boolean(currentCardAudioPost?.audioUrl);
	const isCurrentCardSharedInSession = usePlainHtmlSessionChrome
		? selectedShareContactIds.length > 0
		: currentCardAudioPost?.shareSelected === true &&
			currentCardAudioPost.shareSessionKey === sessionShareKeyRef.current;
	const sessionFrontAudioTooltipLabel =
		"Record audio. A voice trace of your progress for later.";

	const renderSessionFrontAudioControl = ({
		iconButtonSize,
		iconSize,
	}: {
		iconButtonSize: number;
		iconSize: number;
	}) => {
		const iconButtonStyle = {
			width: `${iconButtonSize}px`,
			height: `${iconButtonSize}px`,
		};

		const htmlIconButtonStyle = {
			...iconButtonStyle,
			fontFamily: "Arial, sans-serif",
			fontSize: "13.3333px",
			fontWeight: 400,
			backgroundColor: "#efefef",
			border: "1px solid #000000",
			borderRadius: "3px",
			color: "#000000",
		};

		const htmlMenuItemBaseStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "flex-start",
			gap: "6px",
			width: "100%",
			border: "1px solid #000000",
			backgroundColor: "#efefef",
			color: "#000000",
			borderRadius: "3px",
			padding: "1px 8px",
			minHeight: "24px",
			textAlign: "left" as const,
			fontFamily: "Arial, sans-serif",
			fontSize: "13.3333px",
			fontWeight: 400,
			cursor: "pointer",
		};

		const resolveHtmlMenuItemStyle = (
			action: "contacts" | "share" | "rerecord" | "delete",
		) => ({
			...htmlMenuItemBaseStyle,
			backgroundColor:
				hoveredSessionAudioMenuAction === action ? "#e3e3e3" : "#efefef",
		});

		const recordAudioButton = (
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					void startCardAudioRecording();
				}}
				className="flex items-center justify-center"
				style={
					usePlainHtmlSessionChrome ? htmlIconButtonStyle : iconButtonStyle
				}
				aria-label="Record audio"
				disabled={isCardAudioSaving || isFlipAudioMuted}
			>
				{isCardAudioSaving ? (
					<Loader2 size={iconSize} className="animate-spin" />
				) : (
					<Mic size={iconSize} />
				)}
			</button>
		);

		return (
			<div
				className="relative z-40 flex items-center gap-2"
				aria-busy={isCardAudioLoading}
			>
				{isCardAudioRecording ? (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							stopCardAudioRecording();
						}}
						className="relative flex items-center justify-center"
						style={
							usePlainHtmlSessionChrome
								? {
										...htmlIconButtonStyle,
										border: "1px solid #9a2e2e",
										backgroundColor: "#f4dddd",
										color: "#7a1d1d",
									}
								: iconButtonStyle
						}
						aria-label="Stop recording"
						disabled={isCardAudioSaving || isFlipAudioMuted}
					>
						<Square size={iconSize} />
						<span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white shadow-sm">
							{cardAudioRecordingSeconds}s
						</span>
					</button>
				) : hasCurrentCardAudio ? (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							void toggleCurrentCardAudioPlayback();
						}}
						className="flex items-center justify-center"
						style={
							usePlainHtmlSessionChrome ? htmlIconButtonStyle : iconButtonStyle
						}
						aria-label={isCardAudioPlaying ? "Pause" : "Play audio"}
						disabled={isCardAudioSaving || isFlipAudioMuted}
					>
						{isCardAudioPlaying ? (
							<Pause size={iconSize} />
						) : (
							<Play size={iconSize} />
						)}
					</button>
				) : (
					<Tooltip delayDuration={1000}>
						<TooltipTrigger asChild>{recordAudioButton}</TooltipTrigger>
						<TooltipContent
							side="bottom"
							sideOffset={8}
							className="max-w-[220px] text-center"
						>
							{sessionFrontAudioTooltipLabel}
						</TooltipContent>
					</Tooltip>
				)}

				{usePlainHtmlSessionChrome ? (
					<div ref={sessionAudioMenuRef} style={{ position: "relative" }}>
						<button
							type="button"
							onClick={(event) => {
								event.stopPropagation();
								setIsCardAudioMenuOpen((previousOpen) => !previousOpen);
							}}
							onMouseEnter={() => {
								setIsSessionAudioMenuTriggerHovered(true);
							}}
							onMouseLeave={() => {
								setIsSessionAudioMenuTriggerHovered(false);
							}}
							aria-label="Actions audio"
							disabled={
								isCardAudioSaving || isCardAudioRecording || isFlipAudioMuted
							}
							className="flex items-center justify-center"
							style={{
								...htmlIconButtonStyle,
								backgroundColor: isSessionAudioMenuTriggerHovered
									? "#e3e3e3"
									: "#efefef",
							}}
						>
							<MoreHorizontal size={iconSize} />
						</button>

						{isCardAudioMenuOpen ? (
							<div
								role="menu"
								style={{
									position: "absolute",
									right: 0,
									marginTop: "4px",
									display: "flex",
									flexDirection: "column",
									gap: "4px",
									padding: 0,
									backgroundColor: "transparent",
									zIndex: 70,
									minWidth: "210px",
								}}
								onPointerDown={(event) => event.stopPropagation()}
							>
								<button
									type="button"
									onClick={() => {
										void openContactAudiosDialog();
									}}
									onMouseEnter={() => {
										setHoveredSessionAudioMenuAction("contacts");
									}}
									onMouseLeave={() => {
										setHoveredSessionAudioMenuAction((previous) =>
											previous === "contacts" ? null : previous,
										);
									}}
									style={resolveHtmlMenuItemStyle("contacts")}
								>
									<Eye size={14} />
									<span>see my contacts' audio on this card</span>
								</button>
								{hasCurrentCardAudio ? (
									<button
										type="button"
										onClick={() => {
											void openShareContactsDialog();
										}}
										onMouseEnter={() => {
											setHoveredSessionAudioMenuAction("share");
										}}
										onMouseLeave={() => {
											setHoveredSessionAudioMenuAction((previous) =>
												previous === "share" ? null : previous,
											);
										}}
										style={{
											...resolveHtmlMenuItemStyle("share"),
											borderColor: isCurrentCardSharedInSession
												? "#2e6b2e"
												: "#000000",
										}}
									>
										<Share2 size={14} />
										<span>share with a contact</span>
									</button>
								) : null}
								{hasCurrentCardAudio ? (
									<button
										type="button"
										onClick={() => {
											handleRerecordCurrentCardAudio();
										}}
										onMouseEnter={() => {
											setHoveredSessionAudioMenuAction("rerecord");
										}}
										onMouseLeave={() => {
											setHoveredSessionAudioMenuAction((previous) =>
												previous === "rerecord" ? null : previous,
											);
										}}
										style={resolveHtmlMenuItemStyle("rerecord")}
									>
										<RotateCcw size={14} />
										<span>record again</span>
									</button>
								) : null}
								{hasCurrentCardAudio ? (
									<button
										type="button"
										onClick={() => {
											void handleDeleteCurrentCardAudio();
										}}
										onMouseEnter={() => {
											setHoveredSessionAudioMenuAction("delete");
										}}
										onMouseLeave={() => {
											setHoveredSessionAudioMenuAction((previous) =>
												previous === "delete" ? null : previous,
											);
										}}
										style={{
											...resolveHtmlMenuItemStyle("delete"),
										}}
									>
										<Trash2 size={14} />
										<span>delete</span>
									</button>
								) : null}
							</div>
						) : null}
					</div>
				) : hasCurrentCardAudio ? (
					<DropdownMenu
						open={isCardAudioMenuOpen}
						onOpenChange={setIsCardAudioMenuOpen}
					>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								onClick={(event) => event.stopPropagation()}
								className="flex items-center justify-center rounded-lg bg-white/5 text-[#f1eadb]/72 transition-colors hover:bg-white/10 hover:text-[#f1eadb]"
								style={iconButtonStyle}
								aria-label="Actions audio"
								disabled={isCardAudioSaving || isFlipAudioMuted}
							>
								<MoreHorizontal size={iconSize} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							sideOffset={6}
							className="min-w-[190px]"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => event.stopPropagation()}
						>
							<DropdownMenuItem
								className="cursor-pointer"
								onSelect={() => {
									handleRerecordCurrentCardAudio();
								}}
							>
								<RotateCcw className="h-3.5 w-3.5" />
								<span>Record again</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer text-red-500 focus:text-red-500"
								onSelect={() => {
									void handleDeleteCurrentCardAudio();
								}}
							>
								<Trash2 className="h-3.5 w-3.5" />
								<span>Delete</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}
			</div>
		);
	};

	const sessionFrontAudioControl =
		isSessionLayout && user ? renderSessionFrontAudioControl : null;

	const renderSessionCardTopControls = () => {
		if (!isSessionLayout || !usePlainHtmlSessionChrome) {
			return null;
		}

		const isDisabled = !cardData || isLoadingCards || isSubmittingReview;

		const resolveButtonStyle = (
			hoveredControl: "mute" | "vowels" | "flip",
		): React.CSSProperties => ({
			fontSize: "13.3333px",
			fontFamily: "Arial, sans-serif",
			backgroundColor:
				isSessionTopButtonHovered === hoveredControl ? "#e3e3e3" : "#efefef",
			color: "#000000",
			border: "1px solid #000000",
			borderRadius: "3px",
			padding: "1px 8px",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			minHeight: "24px",
		});

		return (
			<div
				className="mb-2 flex w-full items-center justify-center gap-2"
				style={{ fontFamily: "Arial, sans-serif" }}
			>
				<button
					type="button"
					onClick={() => {
						setIsFlipAudioMuted((previous) => !previous);
					}}
					onMouseEnter={() => {
						setIsSessionTopButtonHovered("mute");
					}}
					onMouseLeave={() => {
						setIsSessionTopButtonHovered((previous) =>
							previous === "mute" ? null : previous,
						);
					}}
					style={resolveButtonStyle("mute")}
					disabled={isDisabled}
				>
					{isFlipAudioMuted ? "unmute" : "mute"}
				</button>
				<button
					type="button"
					onClick={() => {
						handleToggleVowels();
					}}
					onMouseEnter={() => {
						setIsSessionTopButtonHovered("vowels");
					}}
					onMouseLeave={() => {
						setIsSessionTopButtonHovered((previous) =>
							previous === "vowels" ? null : previous,
						);
					}}
					style={resolveButtonStyle("vowels")}
					disabled={isDisabled}
				>
					show vowels
				</button>
				<button
					type="button"
					onClick={() => {
						handleFlipCard();
					}}
					onMouseEnter={() => {
						setIsSessionTopButtonHovered("flip");
					}}
					onMouseLeave={() => {
						setIsSessionTopButtonHovered((previous) =>
							previous === "flip" ? null : previous,
						);
					}}
					style={resolveButtonStyle("flip")}
					disabled={isDisabled}
				>
					flip
				</button>
			</div>
		);
	};

	const renderSessionDecisionControls = () => {
		if (!isSessionLayout || !usePlainHtmlSessionChrome || !cardData) {
			return null;
		}

		if (cardsCompleted || isFilterEmpty || isLoadingCards) {
			return null;
		}

		const isDisabled = isSubmittingReview || isSwiping;
		const resolveDecisionStyle = (
			action: "fail" | "pass",
		): React.CSSProperties => ({
			fontSize: "13.3333px",
			fontFamily: "Arial, sans-serif",
			backgroundColor:
				hoveredSessionDecisionAction === action
					? action === "fail"
						? "#ecdede"
						: "#deecde"
					: action === "fail"
						? "#f4eaea"
						: "#eaf4ea",
			color: "#000000",
			border: "1px solid #000000",
			borderRadius: "3px",
			padding: "1px 10px",
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			minHeight: "24px",
		});

		return (
			<div className="mt-5 mb-3 mx-auto flex items-center justify-center gap-2">
				<button
					type="button"
					onClick={() => {
						triggerSwipeAction("left");
					}}
					onMouseEnter={() => {
						setHoveredSessionDecisionAction("fail");
					}}
					onMouseLeave={() => {
						setHoveredSessionDecisionAction((previous) =>
							previous === "fail" ? null : previous,
						);
					}}
					style={resolveDecisionStyle("fail")}
					disabled={isDisabled}
				>
					fail
				</button>
				<button
					type="button"
					onClick={() => {
						triggerSwipeAction("right");
					}}
					onMouseEnter={() => {
						setHoveredSessionDecisionAction("pass");
					}}
					onMouseLeave={() => {
						setHoveredSessionDecisionAction((previous) =>
							previous === "pass" ? null : previous,
						);
					}}
					style={resolveDecisionStyle("pass")}
					disabled={isDisabled}
				>
					pass
				</button>
			</div>
		);
	};

	const renderReviewStage = (className?: string) => (
		<div
			className={cn(
				"flex min-h-0 flex-col items-center",
				isSessionLayout ? "self-center flex-none" : "flex-1",
				className,
			)}
			style={
				isSessionLayout
					? {
							width: "100%",
							maxWidth: SESSION_CARD_WIDTH,
							marginInline: "auto",
						}
					: undefined
			}
		>
			{renderSessionCardTopControls()}
			<div
				ref={cardFrameHostRef}
				className={cn(
					"relative flex w-full items-center justify-center",
					isSessionLayout ? "min-h-0 flex-none" : "h-full min-h-[260px] flex-1",
				)}
			>
				<div
					className="relative mx-auto w-full"
					style={{
						perspective: "1400px",
						...cardFrameStyle,
					}}
				>
					{isLoadingCards && (
						<ReviewCardLoadingSkeleton
							simplified={isSessionLayout && usePlainHtmlSessionChrome}
						/>
					)}

					{!isLoadingCards && (
						<div
							ref={cardDragRef}
							className="relative border-none bg-transparent p-0 text-left"
							style={{
								height: "100%",
								width: "100%",
								userSelect: "none",
							}}
							onClickCapture={handleGuestActionCapture}
							onPointerDown={handleCardPointerDown}
							onPointerMove={handleCardPointerMove}
							onPointerUp={handleCardPointerUp}
							onPointerCancel={handleCardPointerCancel}
							onLostPointerCapture={handleCardPointerCancel}
							onPointerLeave={handleCardPointerUp}
						>
							{showUnderCard && nextCardData && (
								<div
									className="absolute inset-0 pointer-events-none z-10 rounded-[36px] overflow-hidden"
									style={{
										opacity: 1,
										background: theme.backgroundWrap,
										border: `1px solid ${theme.borderWrap}`,
										boxShadow: "0 10px 26px -16px rgba(0,0,0,0.28)",
									}}
								>
									<ReviewMainCardSurface
										card={nextCardData}
										{...reviewSourceChipProps}
										isFlipped={false}
										showVowels={false}
										onToggleVowels={() => {}}
										onFlip={() => {}}
										audioUrls={audioUrls}
										isLoadingAudio={false}
										flipKey={flipKey}
										showImage={true}
										onVocabAudioMouseMove={() => {}}
										onVocabAudioMouseLeave={() => {}}
										onSentenceAudioMouseMove={() => {}}
										onSentenceAudioMouseLeave={() => {}}
										isFlipping={false}
										frontOnly
										className="rounded-[36px]"
										imageSize="review"
										hideShortsUtilityControls={isSessionLayout}
										hideShortsActionZone={isSessionLayout}
										muteFlipAudio={isSessionLayout && isFlipAudioMuted}
										audioMuted={isSessionLayout && isFlipAudioMuted}
									/>
								</div>
							)}

							{cardsCompleted ? (
								<div
									className="absolute inset-0 rounded-[36px] overflow-hidden px-6 text-center flex items-center justify-center"
									style={{
										background: usePlainHtmlSessionChrome
											? "#f7f6f2"
											: theme.backgroundWrap,
										border: usePlainHtmlSessionChrome
											? "1px solid #000000"
											: `1px solid ${theme.borderWrap}`,
										boxShadow: usePlainHtmlSessionChrome
											? "none"
											: "0 10px 26px -16px rgba(0,0,0,0.28)",
									}}
								>
									{usePlainHtmlSessionChrome ? (
										<p
											style={{
												fontFamily: "Arial, sans-serif",
												fontSize: "13.3333px",
												fontWeight: 400,
												color: "#000000",
												margin: 0,
											}}
										>
											review complete for today
										</p>
									) : (
										<div className="flex flex-col items-center">
											<Check
												className="h-12 w-12 text-emerald-400"
												strokeWidth={2.5}
											/>
											<p className="mt-4 text-xl font-bold text-white">
												Reviews completed
											</p>
											<p className="mt-2 text-sm text-white/60">
												{masteredCards} mastered words out of {totalCards}
											</p>
											<p className="mt-4 text-base text-white/80 leading-relaxed max-w-[280px]">
												Your effort is paying off. Keep immersing to lock in
												these words.
											</p>
											<p className="mt-2 text-xs text-white/40 max-w-[260px]">
												You will collect 1 to 3 new cards during active
												immersion.
											</p>

											<div className="mt-6 flex flex-row gap-2 w-full max-w-[280px]">
												<button
													onClick={() => navigate("/app")}
													className="flex-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
													type="button"
												>
													Continue immersion
													<ArrowRight className="h-3 w-3" />
												</button>
												<button
													onClick={() => navigate(profilePath)}
													className="flex-1 rounded-lg border border-border/80 bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
													type="button"
												>
													My progress
												</button>
												{showReminderNudgeCta ? (
													<button
														onClick={() => onReviewReminderNudgeClick?.()}
														className="flex-1 rounded-lg border border-border/80 bg-transparent px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
														type="button"
													>
														Enable reminders
													</button>
												) : null}
											</div>
										</div>
									)}
								</div>
							) : isFilterEmpty ? (
								<div
									className="absolute inset-0 rounded-[36px] overflow-hidden px-6 text-center flex items-center justify-center"
									style={{
										background: theme.backgroundWrap,
										border: `1px solid ${theme.borderWrap}`,
										boxShadow: "0 10px 26px -16px rgba(0,0,0,0.28)",
									}}
								>
									<div className="flex flex-col items-center">
										<p className="text-lg font-semibold text-white">
											No reviews for this filter
										</p>
										<p className="mt-2 max-w-[270px] text-sm text-white/70">
											Re-enable a category in "All my reviews" to continue.
										</p>
									</div>
								</div>
							) : (
								<>
									{!isDragActive && cardData && (
										<div className="relative h-full w-full rounded-[36px] z-10">
											<ReviewMainCardSurface
												card={cardData}
												{...reviewSourceChipProps}
												isFlipped={cardFlipped}
												showVowels={showVowels}
												onToggleVowels={handleToggleVowels}
												onFlip={handleFlipCard}
												onFail={() => triggerSwipeAction("left")}
												onPass={() => triggerSwipeAction("right")}
												failHint={actionHints.fail}
												passHint={actionHints.pass}
												audioUrls={audioUrls}
												isLoadingAudio={false}
												flipKey={flipKey}
												showImage={true}
												onVocabAudioMouseMove={() => {}}
												onVocabAudioMouseLeave={() => {}}
												onSentenceAudioMouseMove={() => {}}
												onSentenceAudioMouseLeave={() => {}}
												isFlipping={isFlipping}
												className="rounded-[36px]"
												imageSize="review"
												shortsExtraControl={sessionFrontAudioControl}
												hideShortsUtilityControls={isSessionLayout}
												hideShortsActionZone={isSessionLayout}
												muteFlipAudio={isSessionLayout && isFlipAudioMuted}
												audioMuted={isSessionLayout && isFlipAudioMuted}
											/>
										</div>
									)}

									{isDragActive && (
										<div
											className="absolute inset-0 rounded-[36px] z-20 pointer-events-none"
											style={{
												transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
												opacity: isSwipeExiting ? 0 : 1,
												transition: isDraggingCard
													? "none"
													: isSwiping || isSwipeExiting
														? "transform 0.32s ease, opacity 0.2s ease 0.12s"
														: "transform 0.2s ease",
											}}
										>
											{cardData && (
												<ReviewMainCardSurface
													card={cardData}
													{...reviewSourceChipProps}
													isFlipped={cardFlipped}
													showVowels={showVowels}
													onToggleVowels={handleToggleVowels}
													onFlip={handleFlipCard}
													onFail={() => triggerSwipeAction("left")}
													onPass={() => triggerSwipeAction("right")}
													failHint={actionHints.fail}
													passHint={actionHints.pass}
													audioUrls={audioUrls}
													isLoadingAudio={false}
													flipKey={flipKey}
													showImage={true}
													onVocabAudioMouseMove={() => {}}
													onVocabAudioMouseLeave={() => {}}
													onSentenceAudioMouseMove={() => {}}
													onSentenceAudioMouseLeave={() => {}}
													isFlipping={isFlipping}
													className="rounded-[36px]"
													imageSize="review"
													shortsExtraControl={sessionFrontAudioControl}
													hideShortsUtilityControls={isSessionLayout}
													hideShortsActionZone={isSessionLayout}
													muteFlipAudio={isSessionLayout && isFlipAudioMuted}
													audioMuted={isSessionLayout && isFlipAudioMuted}
												/>
											)}
										</div>
									)}
								</>
							)}
						</div>
					)}
				</div>

				{dueTimingFeedback && !fetchError && !isLoadingCards && (
					<div
						aria-live="polite"
						className="pointer-events-none absolute inset-x-0 bottom-1 z-30 flex justify-center px-2"
					>
						<div
							className={`max-w-[min(92vw,520px)] rounded-full border border-border/80 bg-popover/90 px-3 py-1.5 text-center text-[11px] leading-[1.25] text-popover-foreground/80 ${
								dueFeedbackIsVisible ? "opacity-100" : "opacity-0"
							}`}
							style={{
								transitionProperty: "opacity",
								transitionDuration: `${dueFeedbackTransitionMs}ms`,
							}}
						>
							This card will come back in {dueTimingFeedback}
							.
						</div>
					</div>
				)}
			</div>
		</div>
	);

	const renderReviewSummarySection = () => {
		if (isLoadingCards) {
			return usePlainHtmlSessionChrome ? null : (
				<ReviewSummaryLoadingSkeleton />
			);
		}

		return (
			<div className="mt-5 flex flex-col items-center pt-1 sm:mt-4">
				<span className="sr-only">{remainingCount} reviews</span>
				<div
					className={
						usePlainHtmlSessionChrome
							? "flex items-center gap-4"
							: "flex items-center gap-2.5"
					}
					data-tutorial="review-summary-counters"
				>
					<button
						type="button"
						onClick={() => setShowReviewLegend(true)}
						className={
							usePlainHtmlSessionChrome
								? "flex items-center justify-center bg-transparent"
								: "flex h-5 w-5 items-center justify-center rounded bg-sky-500/55 text-white transition-opacity hover:opacity-90"
						}
						title="Blue: new cards"
						style={{
							fontFamily: usePlainHtmlSessionChrome
								? "Arial, sans-serif"
								: "system-ui, sans-serif",
							fontSize: usePlainHtmlSessionChrome ? "13.3333px" : "10px",
							fontWeight: usePlainHtmlSessionChrome ? 400 : 500,
							lineHeight: 1,
							color: usePlainHtmlSessionChrome ? "#0ea5e9" : undefined,
							padding: usePlainHtmlSessionChrome ? 0 : undefined,
							minWidth: usePlainHtmlSessionChrome ? "auto" : undefined,
						}}
					>
						{reviewSummaryCounts.newCards}
					</button>
					<button
						type="button"
						onClick={() => setShowReviewLegend(true)}
						className={
							usePlainHtmlSessionChrome
								? "flex items-center justify-center bg-transparent"
								: "flex h-5 w-5 items-center justify-center rounded bg-rose-500/55 text-white transition-opacity hover:opacity-90"
						}
						title="Red: cards in learning"
						style={{
							fontFamily: usePlainHtmlSessionChrome
								? "Arial, sans-serif"
								: "system-ui, sans-serif",
							fontSize: usePlainHtmlSessionChrome ? "13.3333px" : "10px",
							fontWeight: usePlainHtmlSessionChrome ? 400 : 500,
							lineHeight: 1,
							color: usePlainHtmlSessionChrome ? "#f43f5e" : undefined,
							padding: usePlainHtmlSessionChrome ? 0 : undefined,
							minWidth: usePlainHtmlSessionChrome ? "auto" : undefined,
						}}
					>
						{reviewSummaryCounts.learningCards}
					</button>
					<button
						type="button"
						onClick={() => setShowReviewLegend(true)}
						className={
							usePlainHtmlSessionChrome
								? "flex items-center justify-center bg-transparent"
								: "flex h-5 w-5 items-center justify-center rounded bg-emerald-500/55 text-white transition-opacity hover:opacity-90"
						}
						title="Green: cards to review"
						style={{
							fontFamily: usePlainHtmlSessionChrome
								? "Arial, sans-serif"
								: "system-ui, sans-serif",
							fontSize: usePlainHtmlSessionChrome ? "13.3333px" : "10px",
							fontWeight: usePlainHtmlSessionChrome ? 400 : 500,
							lineHeight: 1,
							color: usePlainHtmlSessionChrome ? "#22c55e" : undefined,
							padding: usePlainHtmlSessionChrome ? 0 : undefined,
							minWidth: usePlainHtmlSessionChrome ? "auto" : undefined,
						}}
					>
						{reviewSummaryCounts.reviewCards}
					</button>
				</div>

				<a
					href="/app/why-it-works"
					data-tutorial="review-docs-link"
					className={
						usePlainHtmlSessionChrome
							? "mt-1"
							: "mt-1 text-[11px] text-muted-foreground underline underline-offset-2 decoration-muted-foreground/60 opacity-70 transition-colors hover:text-foreground"
					}
					style={
						usePlainHtmlSessionChrome
							? {
									fontSize: "13.3333px",
									fontFamily: "Arial, sans-serif",
									color: "#000000",
									textDecoration: "underline",
								}
							: undefined
					}
				>
					how do I do my reviews?
				</a>
			</div>
		);
	};

	return (
		<div
			className={cn(
				"relative flex h-full min-h-0 w-full flex-col items-center overflow-hidden",
				isSessionLayout ? "bg-transparent" : "bg-background",
			)}
			style={
				usePlainHtmlSessionChrome
					? { fontFamily: "Arial, sans-serif", fontSize: "13.3333px" }
					: { fontFamily: "'Segoe UI', sans-serif" }
			}
		>
			{!isSessionLayout ? (
				<div
					className="absolute inset-0 pointer-events-none"
					style={{
						background: `
            radial-gradient(ellipse 80% 60% at 50% 30%, hsl(0 0% 14%) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 70%, hsl(0 0% 12%) 0%, transparent 50%),
            hsl(var(--background))
          `,
						filter: "blur(40px)",
						zIndex: -1,
					}}
				/>
			) : null}

			{/* Demo mode banner - hidden when parent shows PreviewBanner */}
			{isGuest && !isPreviewMode && (
				<div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-amber-950 text-center py-1.5 text-sm font-medium">
					{isGuestLocalReviewMode
						? "Guest mode - your reviews stay on this device"
						: "Demo mode - Sign in to save your reviews"}
				</div>
			)}

			{/* Content wrapper */}
			<div
				className={cn(
					"relative z-10 flex h-full min-h-0 w-full flex-1 flex-col",
					isSessionLayout ? "overflow-visible" : "overflow-hidden",
				)}
			>
				{/* Main Content Container */}
				<div
					className={`flex min-h-0 w-full flex-1 flex-col px-3 py-2 sm:px-4 sm:py-2 ${
						isSessionLayout
							? "items-stretch justify-start"
							: "items-center justify-center"
					}`}
				>
					{isSessionLayout ? (
						usePlainHtmlSessionChrome ? (
							<div className="mb-3 flex w-full flex-col items-center sm:mb-4">
								<button
									type="button"
									onClick={handleSessionBackClick}
									style={{
										fontSize: "13.3333px",
										fontFamily: "Arial, sans-serif",
										color: "#000000",
										background: "none",
										border: 0,
										padding: 0,
										textDecoration: "underline",
										cursor: "pointer",
									}}
								>
									← back
								</button>
							</div>
						) : (
							<div className="mb-3 flex w-full justify-start sm:mb-4">
								<button
									type="button"
									onClick={handleSessionBackClick}
									className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
								>
									<ChevronLeft className="h-4 w-4" />
									Back
								</button>
							</div>
						)
					) : (
						renderFilterTrigger("relative mb-3 flex flex-col items-center")
					)}

					{/* Error state with retry */}
					{fetchError && (
						<div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 max-w-sm text-center">
							<p className="text-red-400 text-sm mb-2">{fetchError}</p>
							<button
								type="button"
								onClick={() => void fetchCards()}
								className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm rounded-lg transition-colors"
							>
								<RefreshCw className="w-3.5 h-3.5" />
								Retry
							</button>
						</div>
					)}

					{renderReviewStage()}
					{renderSessionDecisionControls()}
					{renderReviewSummarySection()}
				</div>
			</div>

			<Dialog
				open={showContactAudiosDialog}
				onOpenChange={setShowContactAudiosDialog}
			>
				<DialogContent
					motionPreset="fade"
					className={usePlainHtmlSessionChrome ? "max-w-md" : "max-w-md"}
					style={
						usePlainHtmlSessionChrome
							? {
									fontFamily: "Arial, sans-serif",
									fontSize: "13.3333px",
									backgroundColor: "#f7f6f2",
									border: "1px solid #000000",
									color: "#000000",
									borderRadius: 0,
								}
							: undefined
					}
					aria-describedby={undefined}
				>
					<DialogTitle
						style={
							usePlainHtmlSessionChrome
								? { fontFamily: "Arial, sans-serif", fontSize: "13.3333px" }
								: undefined
						}
					>
						My contacts' audio
					</DialogTitle>
					<div
						className="space-y-2 pt-1"
						style={
							usePlainHtmlSessionChrome
								? {
										fontFamily: "Arial, sans-serif",
										fontSize: "13.3333px",
										lineHeight: 1.35,
										color: "#000000",
									}
								: undefined
						}
					>
						{isContactAudioPostsLoading ? (
							<p>Loading audio...</p>
						) : contactAudioPostsError ? (
							<p>{contactAudioPostsError}</p>
						) : contactAudioPosts.length === 0 ? (
							<>
								<p>
									None of your contacts has recorded audio on this card yet.
								</p>
								<p>
									Be the first to leave an audio trace on this card.
								</p>
							</>
						) : (
							<div className="space-y-2">
								{contactAudioPosts.map((audioPost) => {
									const displayName =
										audioPost.author.primaryName?.trim() ||
										(audioPost.author.username
											? `@${audioPost.author.username}`
											: "contact");
									const isPlaying = activeContactAudioPostId === audioPost.id;

									return (
										<div
											key={audioPost.id}
											className="flex items-center justify-between gap-3"
										>
											<div>
												<p>{displayName}</p>
												<p style={{ opacity: 0.7 }}>{audioPost.relativeTime}</p>
											</div>
											<button
												type="button"
												onClick={() => {
													void toggleContactAudioPlayback(audioPost);
												}}
												disabled={isFlipAudioMuted}
												style={{
													fontSize: "13.3333px",
													fontFamily: "Arial, sans-serif",
													backgroundColor: isPlaying ? "#dcebdc" : "#efefef",
													color: "#000000",
													border: "1px solid #000000",
													borderRadius: "3px",
													padding: "1px 8px",
													opacity: isFlipAudioMuted ? 0.55 : 1,
												}}
											>
												{isPlaying ? "pause" : "listen"}
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={showShareContactsDialog}
				onOpenChange={setShowShareContactsDialog}
			>
				<DialogContent
					motionPreset="fade"
					className={usePlainHtmlSessionChrome ? "max-w-md" : "max-w-md"}
					style={
						usePlainHtmlSessionChrome
							? {
									fontFamily: "Arial, sans-serif",
									fontSize: "13.3333px",
									backgroundColor: "#f7f6f2",
									border: "1px solid #000000",
									color: "#000000",
									borderRadius: 0,
								}
							: undefined
					}
					aria-describedby={undefined}
				>
					<DialogTitle
						style={
							usePlainHtmlSessionChrome
								? { fontFamily: "Arial, sans-serif", fontSize: "13.3333px" }
								: undefined
						}
					>
						Share with a contact
					</DialogTitle>
					<div
						className="space-y-2 pt-1"
						style={
							usePlainHtmlSessionChrome
								? {
										fontFamily: "Arial, sans-serif",
										fontSize: "13.3333px",
										lineHeight: 1.35,
										color: "#000000",
									}
								: undefined
						}
					>
						{!hasCurrentCardAudio ? (
							<p>Record audio on this card before sharing it.</p>
						) : isSessionConnectionsLoading ? (
							<p>Loading your contacts...</p>
						) : sessionConnectionsError ? (
							<p>{sessionConnectionsError}</p>
						) : sessionConnections.length === 0 ? (
							<p>You do not have any contacts to share this audio with yet.</p>
						) : (
							<div className="space-y-2">
								{sessionConnections.map((friend) => {
									const isSelected = selectedShareContactIds.includes(
										friend.userId,
									);

									return (
										<div
											key={friend.userId}
											className="flex items-center justify-between gap-3"
										>
											<p>{resolveSessionContactDisplayName(friend)}</p>
											<button
												type="button"
												onClick={() => {
													toggleContactShareSelection(friend.userId);
												}}
												disabled={isCardAudioShareUpdating}
												style={{
													fontSize: "13.3333px",
													fontFamily: "Arial, sans-serif",
													backgroundColor: isSelected ? "#dcebdc" : "#efefef",
													color: "#000000",
													border: "1px solid #000000",
													borderRadius: "3px",
													padding: "1px 8px",
												}}
											>
												{isSelected ? "remove from sharing" : "share"}
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={showReviewLegend} onOpenChange={setShowReviewLegend}>
				<DialogContent
					motionPreset="fade"
					className={
						usePlainHtmlSessionChrome
							? "max-w-xs"
							: "max-w-xs border-border/80 bg-popover text-popover-foreground"
					}
					style={
						usePlainHtmlSessionChrome
							? {
									fontFamily: "Arial, sans-serif",
									fontSize: "13.3333px",
									backgroundColor: "#f7f6f2",
									border: "1px solid #000000",
									color: "#000000",
									borderRadius: 0,
								}
							: undefined
					}
					aria-describedby={undefined}
				>
					<DialogTitle
						className={
							usePlainHtmlSessionChrome
								? ""
								: "text-sm font-medium text-popover-foreground"
						}
						style={
							usePlainHtmlSessionChrome
								? { fontFamily: "Arial, sans-serif", fontSize: "13.3333px" }
								: undefined
						}
					>
						Counter guide
					</DialogTitle>
					<div
						className={
							usePlainHtmlSessionChrome
								? "space-y-2 pt-1"
								: "space-y-2 pt-1 text-xs leading-relaxed text-muted-foreground"
						}
						style={
							usePlainHtmlSessionChrome
								? {
										fontFamily: "Arial, sans-serif",
										fontSize: "13.3333px",
										lineHeight: 1.35,
										color: "#000000",
									}
								: undefined
						}
					>
						<p>These numbers show how many cards remain by type.</p>
						<p>
							<span className="text-sky-500">Blue</span> : new cards.
							<br />
							<span className="text-rose-500">Red</span> : cards in learning.
							<br />
							<span className="text-emerald-500">Green</span> : cards to review.
						</p>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
};
