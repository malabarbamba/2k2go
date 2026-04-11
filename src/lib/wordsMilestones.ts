const WORDS_NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR");

export const WORDS_MILESTONES = [
	{ label: "Premiers mots", end: 200 },
	{ label: "Bases solides", end: 400 },
	{ label: "Conversations simples", end: 600 },
	{ label: "Compréhension", end: 800 },
	{ label: "Autonomie", end: 1000 },
	{ label: "Immersion", end: 1200 },
	{ label: "Fluidité", end: 1400 },
	{ label: "Confiance", end: 1600 },
	{ label: "Pré-matrîse", end: 1800 },
	{ label: "Maîtrise", end: 2000 },
] as const satisfies ReadonlyArray<{
	label: string;
	end: number;
}>;

export const WORDS_MASTERY_TARGET =
	WORDS_MILESTONES[WORDS_MILESTONES.length - 1]?.end ?? 2000;

const normalizeMetricCount = (value: number): number =>
	Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

const formatMetricCount = (value: number): string =>
	WORDS_NUMBER_FORMATTER.format(normalizeMetricCount(value));

const resolveActiveMilestone = (value: number) => {
	const normalizedValue = normalizeMetricCount(value);
	const milestoneIndex = WORDS_MILESTONES.findIndex(
		(milestone) => normalizedValue < milestone.end,
	);
	const safeIndex =
		milestoneIndex >= 0 ? milestoneIndex : WORDS_MILESTONES.length - 1;
	const activeMilestone =
		WORDS_MILESTONES[safeIndex] ??
		WORDS_MILESTONES[WORDS_MILESTONES.length - 1];

	return {
		activeMilestone,
		milestoneIndex: safeIndex,
		normalizedValue,
	};
};

export const resolveWordsMilestoneMeta = ({
	value,
	wordsTarget,
}: {
	value: number;
	wordsTarget: number;
}) => {
	const { activeMilestone, normalizedValue } = resolveActiveMilestone(value);
	const normalizedTarget = Math.max(1, normalizeMetricCount(wordsTarget));
	const milestoneTarget = Math.min(normalizedTarget, activeMilestone.end);

	return {
		footerEndLabel: `${formatMetricCount(normalizedValue)} sur ${formatMetricCount(milestoneTarget)}`,
		footerStartLabel: activeMilestone.label,
	};
};

export const resolveWordsMilestoneTier = (value: number) => {
	const { milestoneIndex } = resolveActiveMilestone(value);

	return {
		currentTier: milestoneIndex + 1,
		totalTiers: WORDS_MILESTONES.length,
	};
};

export const resolveWordsMilestoneProgress = (value: number) => {
	const { activeMilestone, milestoneIndex, normalizedValue } =
		resolveActiveMilestone(value);
	const previousMilestoneEnd = WORDS_MILESTONES[milestoneIndex - 1]?.end ?? 0;
	const targetWords = Math.max(1, activeMilestone.end - previousMilestoneEnd);
	const currentWords = Math.max(
		0,
		Math.min(normalizedValue, activeMilestone.end) - previousMilestoneEnd,
	);

	return {
		currentWords,
		milestoneLabel: activeMilestone.label,
		progressPct: Math.round((currentWords / targetWords) * 100),
		targetWords,
	};
};
