export const CLAVIER_ARABE_SCORING = {
	quickPhrases: {
		maxVisibleDefault: 6,
		recommendationThreshold: 5,
		recencyWeightToday: 1,
		recencyWeightFloor: 0.3,
		recencyDecayPerDay: 0.1,
	},
	autocomplete: {
		minPrefixLength: 2,
		maxSuggestions: 5,
		localSeedWeight: 1,
		userWordBonus: 2,
	},
	intentDetection: {
		minimumCharacters: 3,
		arabiziConfidenceThreshold: 0.7,
	},
} as const;
