import type {
	FoundationLevelThreshold,
	LearningUnitDefinition,
	LearningUnitVideo,
} from "@/features/learning-path/types";

export const LEARNING_UNIT_KEY_PREFIX = "unit-";
export const LEARNING_PATH_FIRST_CORE_UNIT_ID = 1;
export const LEARNING_PATH_LAST_CORE_UNIT_ID = 40;
export const LEARNING_PATH_CORE_UNIT_COUNT =
	LEARNING_PATH_LAST_CORE_UNIT_ID - LEARNING_PATH_FIRST_CORE_UNIT_ID + 1;

export const FOUNDATION_LEVEL_THRESHOLDS: FoundationLevelThreshold[] = [
	{ label: "Embryon", minWords: 0 },
	{ label: "Nouveau-né", minWords: 250 },
	{ label: "Nourrisson", minWords: 500 },
	{ label: "Bébé", minWords: 1000 },
	{ label: "Jeune enfant", minWords: 1500 },
	{ label: "Enfant", minWords: 2000 },
];

const buildUnitKey = (unitId: number): string =>
	`${LEARNING_UNIT_KEY_PREFIX}${unitId}`;

const buildUnitVideos = (
	prefix: string,
	videos: Array<{ title: string; durationLabel: string; url: string }>,
): LearningUnitVideo[] =>
	videos.map((video, index) => ({
		id: `${prefix}-${index + 1}`,
		title: video.title,
		durationLabel: video.durationLabel,
		url: video.url,
	}));

const unitZero: LearningUnitDefinition = {
	id: 0,
	key: buildUnitKey(0),
	title: "Prologue - Alphabet arabe",
	subtitle: "Point de depart pour non-lecteurs",
	description:
		"Si tu ne lis pas encore l'arabe, on pose ici la base visuelle et sonore avant de lancer l'immersion complete.",
	quickActionLabel: "Debloquer l'alphabet",
	requirements: {
		minutesWatched: 25,
		foundationWords: 0,
	},
	coverageGainPercent: 4,
};

const themedUnits: LearningUnitDefinition[] = [
	{
		id: 1,
		key: buildUnitKey(1),
		title: "Unite 1 - Famille",
		subtitle: "Parler de soi et des proches",
		description:
			"Tu apprends les mots de la famille pour comprendre les conversations du quotidien et te presenter naturellement.",
		quickActionLabel: "Immersion famille",
		requirements: {
			minutesWatched: 70,
			foundationWords: 120,
		},
		coverageGainPercent: 8,
		recommendedVideos: buildUnitVideos("u1", [
			{
				title: "Conversation arabe: presenter sa famille",
				durationLabel: "11 min",
				url: "https://www.youtube.com/watch?v=3f7A4i2gkVo",
			},
			{
				title: "Vocabulaire famille en arabe dialectal",
				durationLabel: "9 min",
				url: "https://www.youtube.com/watch?v=w8O8Wg7R6xM",
			},
			{
				title: "Mini-histoire: la maison de mon oncle",
				durationLabel: "7 min",
				url: "https://www.youtube.com/watch?v=1lM2B8z8D9o",
			},
		]),
	},
	{
		id: 2,
		key: buildUnitKey(2),
		title: "Unite 2 - Corps humain",
		subtitle: "Comprendre douleurs, sensations, actions",
		description:
			"Tu integres le lexique du corps humain pour suivre des scenes concretes: sante, sport, gestes et routines.",
		quickActionLabel: "Immersion corps",
		requirements: {
			minutesWatched: 100,
			foundationWords: 220,
		},
		coverageGainPercent: 7,
		recommendedVideos: buildUnitVideos("u2", [
			{
				title: "Le corps humain en arabe pour debutants",
				durationLabel: "13 min",
				url: "https://www.youtube.com/watch?v=7Q3Qx5My7Fo",
			},
			{
				title: "Expliquer un symptome en arabe",
				durationLabel: "8 min",
				url: "https://www.youtube.com/watch?v=GvGvW8xwHfI",
			},
			{
				title: "Dialogue: a la pharmacie",
				durationLabel: "6 min",
				url: "https://www.youtube.com/watch?v=H0I2g2w7B3Y",
			},
		]),
	},
	{
		id: 3,
		key: buildUnitKey(3),
		title: "Unite 3 - Nourriture",
		subtitle: "Commander, cuisiner, decrire les gouts",
		description:
			"Tu deploies un vocabulaire utile pour les repas, les ingredients et les interactions de tous les jours.",
		quickActionLabel: "Immersion nourriture",
		requirements: {
			minutesWatched: 130,
			foundationWords: 320,
		},
		coverageGainPercent: 7,
		recommendedVideos: buildUnitVideos("u3", [
			{
				title: "Commander au restaurant en arabe",
				durationLabel: "10 min",
				url: "https://www.youtube.com/watch?v=W3Pj5f9q4XQ",
			},
			{
				title: "Recette simple expliquee en arabe",
				durationLabel: "9 min",
				url: "https://www.youtube.com/watch?v=I4K8j2R5zvw",
			},
			{
				title: "Vlog marche local - fruits et epices",
				durationLabel: "12 min",
				url: "https://www.youtube.com/watch?v=Q0r8Y6Zk4zM",
			},
		]),
	},
];

const progressionUnits: LearningUnitDefinition[] = Array.from(
	{ length: LEARNING_PATH_LAST_CORE_UNIT_ID - 3 },
	(_, index) => {
		const unitId = index + 4;
		const minutesWatched = 130 + (unitId - 3) * 30;
		const foundationWords = Math.min(2000, 320 + (unitId - 3) * 46);

		return {
			id: unitId,
			key: buildUnitKey(unitId),
			title: `Unite ${unitId} - Progression`,
			subtitle: "Montee en puissance continue",
			description:
				"Tu consolides une comprehension plus stable en enchainant immersion active, reperage rapide et revision ciblee.",
			quickActionLabel: "Cycle immersion + revision",
			requirements: {
				minutesWatched,
				foundationWords,
			},
			coverageGainPercent: 2,
		};
	},
);

export const LEARNING_PATH_UNITS: LearningUnitDefinition[] = [
	unitZero,
	...themedUnits,
	...progressionUnits,
];

export const getLearningUnitById = (
	unitId: number,
): LearningUnitDefinition | undefined =>
	LEARNING_PATH_UNITS.find((unit) => unit.id === unitId);

export const isLearningUnitId = (unitId: number): boolean =>
	LEARNING_PATH_UNITS.some((unit) => unit.id === unitId);

export const getLearningUnitKey = (unitId: number): string =>
	buildUnitKey(unitId);
