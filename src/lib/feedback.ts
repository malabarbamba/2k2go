export type FeedbackFrequency = "once" | "sometimes" | "often" | "always";
export type FeedbackDevice = "computer" | "iphone" | "android" | "tablet";
export type FeedbackBrowser = "chrome" | "safari" | "firefox" | "edge" | "other";

export type FeedbackFormData = {
	summary: string;
	beforeContext: string;
	expectedBehavior: string;
	actualBehavior: string;
	errorMessage: string;
	evidenceUrl: string;
	frequency: FeedbackFrequency | null;
	device: FeedbackDevice | null;
	browser: FeedbackBrowser | null;
	occurredDate: string;
	occurredTime: string;
	accountEmail: string;
};

export type FeedbackFormErrors = Partial<
	Record<
		| "summary"
		| "beforeContext"
		| "expectedBehavior"
		| "actualBehavior"
		| "evidence"
		| "frequency"
		| "device"
		| "browser"
		| "accountEmail"
		| "submit",
		string
	>
>;

export const ACCEPTED_FEEDBACK_IMAGE_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
]);

export const FEEDBACK_MAX_UPLOAD_BYTES = 3_000_000;
export const FEEDBACK_HTTPS_URL_PATTERN = /^https:\/\/.+/i;
export const FEEDBACK_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const resolveNowDateInput = (): string => {
	const now = new Date();
	return [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("-");
};

export const resolveNowTimeInput = (): string => {
	const now = new Date();
	return [String(now.getHours()).padStart(2, "0"), String(now.getMinutes()).padStart(2, "0")].join(":");
};

export const createDefaultFeedbackFormData = (
	accountEmail = "",
): FeedbackFormData => ({
	summary: "",
	beforeContext: "",
	expectedBehavior: "",
	actualBehavior: "",
	errorMessage: "",
	evidenceUrl: "",
	frequency: null,
	device: null,
	browser: null,
	occurredDate: resolveNowDateInput(),
	occurredTime: resolveNowTimeInput(),
	accountEmail,
});

export const validateFeedbackFormData = (
	data: FeedbackFormData,
	hasEvidenceFile: boolean,
): FeedbackFormErrors => {
	const errors: FeedbackFormErrors = {};
	const trimmedSummary = data.summary.trim();
	const trimmedBeforeContext = data.beforeContext.trim();
	const trimmedExpectedBehavior = data.expectedBehavior.trim();
	const trimmedActualBehavior = data.actualBehavior.trim();
	const trimmedEvidenceUrl = data.evidenceUrl.trim();
	const trimmedAccountEmail = data.accountEmail.trim();

	if (!trimmedSummary) {
		errors.summary = "This field is required.";
	} else if (trimmedSummary.length > 220) {
		errors.summary = "Keep the summary under 220 characters.";
	}

	if (!trimmedBeforeContext) {
		errors.beforeContext = "This field is required.";
	}

	if (!trimmedExpectedBehavior) {
		errors.expectedBehavior = "This field is required.";
	}

	if (!trimmedActualBehavior) {
		errors.actualBehavior = "This field is required.";
	}

	if (!hasEvidenceFile && !trimmedEvidenceUrl) {
		errors.evidence = "Add either an image or an https link.";
	} else if (
		trimmedEvidenceUrl &&
		!FEEDBACK_HTTPS_URL_PATTERN.test(trimmedEvidenceUrl)
	) {
		errors.evidence = "The link must start with https://";
	}

	if (!data.frequency) {
		errors.frequency = "Select a frequency.";
	}

	if (!data.device) {
		errors.device = "Select a device.";
	}

	if (data.device === "computer" && !data.browser) {
		errors.browser = "Select a browser.";
	}

	if (trimmedAccountEmail && !FEEDBACK_EMAIL_PATTERN.test(trimmedAccountEmail)) {
		errors.accountEmail = "Enter a valid email address.";
	}

	return errors;
};
