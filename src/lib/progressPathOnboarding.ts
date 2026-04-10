export const PROGRESS_PATH_ONBOARDING_UPDATED_EVENT =
	"app:progress-path-onboarding-updated";

const STORAGE_KEY = "progress-path-onboarding.v1";

export type StepOneChoice =
	| "can-read"
	| "needs-alphabet"
	| "quiz-can-read"
	| "quiz-needs-alphabet";

export interface ProgressPathOnboardingState {
	firstVisitedAt: string | null;
	firstVisitedAtOwnerUserId: string | null;
	foundationDeckGuideVisible: boolean;
	foundationDeckStarted: boolean;
	stepOneAlphabetStartedAt: string | null;
	stepOneAlphabetConfirmedAt: string | null;
	lastStepOneChoice: StepOneChoice | null;
	lastStepOneResolvedAt: string | null;
	lastImmersionCelebrationDate: string | null;
}

const DEFAULT_STATE: ProgressPathOnboardingState = {
	firstVisitedAt: null,
	firstVisitedAtOwnerUserId: null,
	foundationDeckGuideVisible: false,
	foundationDeckStarted: false,
	stepOneAlphabetStartedAt: null,
	stepOneAlphabetConfirmedAt: null,
	lastStepOneChoice: null,
	lastStepOneResolvedAt: null,
	lastImmersionCelebrationDate: null,
};

const isBrowser = (): boolean => typeof window !== "undefined";

const getVisitFields = (
	current: ProgressPathOnboardingState,
	ownerUserId: string | null,
	fallbackTimestamp: string,
): Pick<
	ProgressPathOnboardingState,
	"firstVisitedAt" | "firstVisitedAtOwnerUserId"
> => {
	if (current.firstVisitedAt) {
		const isReusableForOwner = ownerUserId
			? current.firstVisitedAtOwnerUserId === null ||
				current.firstVisitedAtOwnerUserId === ownerUserId
			: current.firstVisitedAtOwnerUserId === null;

		if (isReusableForOwner) {
			return {
				firstVisitedAt: current.firstVisitedAt,
				firstVisitedAtOwnerUserId:
					ownerUserId ?? current.firstVisitedAtOwnerUserId,
			};
		}
	}

	return {
		firstVisitedAt: fallbackTimestamp,
		firstVisitedAtOwnerUserId: ownerUserId,
	};
};

const normalizeState = (
	value: Partial<ProgressPathOnboardingState> | null | undefined,
): ProgressPathOnboardingState => {
	if (!value) {
		return { ...DEFAULT_STATE };
	}

	const safeChoice =
		value.lastStepOneChoice === "can-read" ||
		value.lastStepOneChoice === "needs-alphabet" ||
		value.lastStepOneChoice === "quiz-can-read" ||
		value.lastStepOneChoice === "quiz-needs-alphabet"
			? value.lastStepOneChoice
			: null;

	return {
		firstVisitedAt:
			typeof value.firstVisitedAt === "string" ? value.firstVisitedAt : null,
		firstVisitedAtOwnerUserId:
			typeof value.firstVisitedAtOwnerUserId === "string"
				? value.firstVisitedAtOwnerUserId
				: null,
		foundationDeckGuideVisible: value.foundationDeckGuideVisible === true,
		foundationDeckStarted: value.foundationDeckStarted === true,
		stepOneAlphabetStartedAt:
			typeof value.stepOneAlphabetStartedAt === "string"
				? value.stepOneAlphabetStartedAt
				: null,
		stepOneAlphabetConfirmedAt:
			typeof value.stepOneAlphabetConfirmedAt === "string"
				? value.stepOneAlphabetConfirmedAt
				: null,
		lastStepOneChoice: safeChoice,
		lastStepOneResolvedAt:
			typeof value.lastStepOneResolvedAt === "string"
				? value.lastStepOneResolvedAt
				: null,
		lastImmersionCelebrationDate:
			typeof value.lastImmersionCelebrationDate === "string"
				? value.lastImmersionCelebrationDate
				: null,
	};
};

export const readProgressPathOnboardingState =
	(): ProgressPathOnboardingState => {
		if (!isBrowser()) {
			return { ...DEFAULT_STATE };
		}

		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return { ...DEFAULT_STATE };
		}

		try {
			const parsed = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return { ...DEFAULT_STATE };
			}

			return normalizeState(parsed as Partial<ProgressPathOnboardingState>);
		} catch {
			return { ...DEFAULT_STATE };
		}
	};

const writeProgressPathOnboardingState = (
	state: ProgressPathOnboardingState,
): void => {
	if (!isBrowser()) {
		return;
	}

	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	window.dispatchEvent(new CustomEvent(PROGRESS_PATH_ONBOARDING_UPDATED_EVENT));
};

export const updateProgressPathOnboardingState = (
	updater: (
		current: ProgressPathOnboardingState,
	) => ProgressPathOnboardingState,
): ProgressPathOnboardingState => {
	const current = readProgressPathOnboardingState();
	const next = normalizeState(updater(current));
	writeProgressPathOnboardingState(next);
	return next;
};

export const markStepOneChoice = (
	choice: StepOneChoice,
	ownerUserId: string | null = null,
): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => {
		const now = new Date().toISOString();
		const visitFields = getVisitFields(current, ownerUserId, now);

		return {
			...current,
			...visitFields,
			stepOneAlphabetStartedAt:
				choice === "can-read" || choice === "quiz-can-read"
					? null
					: current.stepOneAlphabetStartedAt,
			stepOneAlphabetConfirmedAt:
				choice === "can-read" || choice === "quiz-can-read"
					? null
					: current.stepOneAlphabetConfirmedAt,
			lastStepOneChoice: choice,
			lastStepOneResolvedAt: now,
		};
	});

export const markProgressPathVisited = (
	ownerUserId: string | null = null,
): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => {
		const visitFields = getVisitFields(
			current,
			ownerUserId,
			new Date().toISOString(),
		);

		if (
			visitFields.firstVisitedAt === current.firstVisitedAt &&
			visitFields.firstVisitedAtOwnerUserId ===
				current.firstVisitedAtOwnerUserId
		) {
			return current;
		}

		return {
			...current,
			...visitFields,
		};
	});

export const resetProgressPathOnboardingState =
	(): ProgressPathOnboardingState => {
		const nextState = { ...DEFAULT_STATE };

		if (!isBrowser()) {
			return nextState;
		}

		window.localStorage.removeItem(STORAGE_KEY);
		window.dispatchEvent(
			new CustomEvent(PROGRESS_PATH_ONBOARDING_UPDATED_EVENT),
		);

		return nextState;
	};

export const markStepOneAlphabetStarted = (
	ownerUserId: string | null = null,
): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => {
		const now = new Date().toISOString();
		const visitFields = getVisitFields(current, ownerUserId, now);

		return {
			...current,
			...visitFields,
			stepOneAlphabetStartedAt: current.stepOneAlphabetStartedAt ?? now,
		};
	});

export const markStepOneAlphabetConfirmed = (
	ownerUserId: string | null = null,
): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => {
		const now = new Date().toISOString();
		const visitFields = getVisitFields(current, ownerUserId, now);

		return {
			...current,
			...visitFields,
			stepOneAlphabetStartedAt: current.stepOneAlphabetStartedAt ?? now,
			stepOneAlphabetConfirmedAt: current.stepOneAlphabetConfirmedAt ?? now,
		};
	});

export const markFoundationDeckFlowStarted = (): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => ({
		...current,
		foundationDeckGuideVisible: true,
	}));

export const markFoundationDeckPlusClicked = (): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => ({
		...current,
		foundationDeckGuideVisible: false,
	}));

export const markFoundationDeckStarted = (): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => {
		if (current.foundationDeckStarted && !current.foundationDeckGuideVisible) {
			return current;
		}

		return {
			...current,
			foundationDeckGuideVisible: false,
			foundationDeckStarted: true,
		};
	});

export const markImmersionCelebrationShownForDate = (
	dateKey: string,
): ProgressPathOnboardingState =>
	updateProgressPathOnboardingState((current) => ({
		...current,
		lastImmersionCelebrationDate: dateKey,
	}));
