import type { VocabCard } from "@/data/vocabCards";

export type Screen =
	| "ready"
	| "session"
	| "end"
	| "done"
	| "absent"
	| "bank"
	| "decks"
	| "keyboard"
	| "notifications"
	| "connections"
	| "profile"
	| "settings";

export type PreviewCtaButtonVariant = "styled" | "native";

export type NotificationItem = {
	text: string;
	time: string;
	highlight?: string;
	unread?: boolean;
};

export type PreviewReviewCard = VocabCard;

export type PreviewRailScreen = Extract<
	Screen,
	"ready" | "session" | "end" | "done" | "absent"
>;

export type PreviewProgressMetricSlide = {
	id: string;
	variant: "progress";
	value: number;
	label: string;
	accentLabel?: string;
	progressPct: number;
	progressLabel?: string;
	footerStartLabel: string;
	footerEndLabel: string;
};

export type PreviewStreakFriendRow = {
	userId: string;
	name: string;
	initials: string;
	avatarSeed?: string | null;
	avatarUrl?: string | null;
	profilePath?: string | null;
	friendReviewedToday?: boolean;
	reminderStatus?: PreviewStreakReminderStatus | null;
	sharedStreakDays: number;
	status: "done" | "pending";
	statusText: string;
};

export type PreviewStreakReminderStatus = {
	canSend: boolean;
	cooldownEndsAt: string | null;
	secondsRemaining: number;
	sent: boolean;
	reason?:
		| "backend_unavailable"
		| "ready"
		| "sent"
		| "rate_limited"
		| "already_done_today"
		| "not_friends"
		| "self"
		| "auth_required";
};

export type PreviewStreakMetricSlide = {
	id: string;
	variant: "streak";
	value: number;
	label: string;
	friends: PreviewStreakFriendRow[];
	initialVisibleCount?: number;
};

export type PreviewMetricSlide =
	| PreviewProgressMetricSlide
	| PreviewStreakMetricSlide;

export type PreviewScreenOption = {
	key: PreviewRailScreen;
	label: string;
};

export type NotificationCategoryKey = "all" | "for-me" | "friends" | "correct";

export type NotificationFeedCategory = Exclude<NotificationCategoryKey, "all">;

export type NotificationFeedSource = "authenticated" | "guest-fallback";

export type FeedItemNotifType =
	| "friend-request"
	| "friend-accepted"
	| "friend-activity"
	| "streak-reminder"
	| "correct-pending"
	| "review-reminder"
	| "system";

export type ReviewDueNotificationSlot = "morning" | "midday" | "evening";

export type NotificationCategory = {
	key: NotificationCategoryKey;
	label: string;
	count?: number;
};

export type FeedItem = {
	id: string;
	category: NotificationFeedCategory;
	title: string;
	body: string;
	time: string;
	unread?: boolean;
	actionUrl?: string;
	actionLabel?: string;
	targetUserId?: string;
	targetUsername?: string;
	dueCount?: number;
	localDate?: string;
	slot?: ReviewDueNotificationSlot;
	/** Name of the person who triggered this notification. Used for the avatar seed and bold text. */
	actorName?: string;
	/** Real avatar URL of the person who triggered this notification when available. */
	actorAvatarUrl?: string | null;
	/** Semantic notification sub-type used to derive the CTA label. */
	notifType?: FeedItemNotifType;
};

export type PreviewYoutubeRecommendationSubtitleKind =
	| "manual"
	| "automatic"
	| "unknown";

export type PreviewYoutubeRecommendation = {
	id: string;
	youtubeId: string;
	title: string;
	channelTitle: string;
	videoUrl: string;
	thumbnailUrl: string | null;
	durationSeconds: number | null;
	durationLabel: string;
	comprehensionPercentage: number | null;
	subtitleKind: PreviewYoutubeRecommendationSubtitleKind;
	transcriptSnippet: string | null;
	summaryFr: string | null;
	query: string;
};

export type PreviewYoutubeRecommendationsResult = {
	generatedAt: string;
	recommendationDay: string | null;
	dayEndsAt: string | null;
	seedWords: string[];
	knownWordsCount: number | null;
	recommendationLimit: number;
	minimumWordsRequired: number;
	isLocked: boolean;
	lockMessage: string | null;
	queries: string[];
	warnings: string[];
	strategy: {
		discovery: string;
		subtitles: string;
		model: string;
	};
	recommendations: PreviewYoutubeRecommendation[];
};

export type PreviewYoutubeRecommendationsState = {
	status: "idle" | "loading" | "success" | "error";
	data: PreviewYoutubeRecommendationsResult | null;
	errorMessage: string | null;
};
