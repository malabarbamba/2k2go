export type LearningUnitState = "done" | "current" | "locked";

export interface LearningUnitVideo {
	id: string;
	title: string;
	durationLabel: string;
	url: string;
}

export interface LearningUnitRequirements {
	minutesWatched: number;
	foundationWords: number;
}

export interface LearningUnitDefinition {
	id: number;
	key: string;
	title: string;
	subtitle: string;
	description: string;
	quickActionLabel: string;
	requirements: LearningUnitRequirements;
	coverageGainPercent: number;
	recommendedVideos?: LearningUnitVideo[];
}

export interface LearningProgressSnapshot {
	canReadArabic: boolean | null;
	currentUnitId: number;
	completedUnitIds: string[];
	minutesByUnit: Record<string, number>;
	wordsByUnit: Record<string, number>;
	masteredWordsTotal: number;
	streakDays: number;
	lastCompletedDate: string | null;
	dailyObjectivesByDate: Record<string, LearningDailyObjectiveEntry>;
}

export interface LearningDailyObjectiveEntry {
	immersionCompleted: boolean;
	reviewsCompleted: boolean;
	completedAt: string | null;
}

export interface LearningUnitProgressMetrics {
	minutesWatched: number;
	foundationWords: number;
	minutesRatio: number;
	wordsRatio: number;
}

export type FoundationLevelLabel =
	| "Embryon"
	| "Nouveau-né"
	| "Nourrisson"
	| "Bébé"
	| "Jeune enfant"
	| "Enfant";

export interface FoundationLevelThreshold {
	label: FoundationLevelLabel;
	minWords: number;
}
