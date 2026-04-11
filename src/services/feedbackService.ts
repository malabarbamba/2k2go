import { supabase } from "@/integrations/supabase/client";
import type {
	FeedbackBrowser,
	FeedbackDevice,
	FeedbackFormData,
	FeedbackFrequency,
} from "@/lib/feedback";

type FeedbackEvidenceAttachment = {
	filename: string;
	mimeType: string;
	contentBase64: string;
};

type FeedbackSubmissionPayload = {
	summary: string;
	beforeContext: string;
	expectedBehavior: string;
	actualBehavior: string;
	errorMessage: string | null;
	evidenceUrl: string | null;
	evidenceAttachment: FeedbackEvidenceAttachment | null;
	frequency: FeedbackFrequency;
	device: FeedbackDevice;
	browser: FeedbackBrowser | null;
	occurredDate: string;
	occurredTime: string;
	accountEmail: string | null;
};

type FeedbackSubmissionResponse = {
	ok: boolean;
	id: string;
};

const toBase64 = async (file: File): Promise<string> => {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Unable to read the selected file."));
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.readAsDataURL(file);
	});

	const splitIndex = dataUrl.indexOf(",");
	if (splitIndex < 0) {
		throw new Error("Invalid attachment format.");
	}

	return dataUrl.slice(splitIndex + 1);
};

const buildFeedbackPayload = async (
	data: FeedbackFormData,
	evidenceFile: File | null,
): Promise<FeedbackSubmissionPayload> => {
	let evidenceAttachment: FeedbackEvidenceAttachment | null = null;
	if (evidenceFile) {
		evidenceAttachment = {
			filename: evidenceFile.name,
			mimeType: evidenceFile.type || "application/octet-stream",
			contentBase64: await toBase64(evidenceFile),
		};
	}

	if (!data.frequency || !data.device) {
		throw new Error("Missing required feedback metadata.");
	}

	return {
		summary: data.summary.trim(),
		beforeContext: data.beforeContext.trim(),
		expectedBehavior: data.expectedBehavior.trim(),
		actualBehavior: data.actualBehavior.trim(),
		errorMessage: data.errorMessage.trim() || null,
		evidenceUrl: data.evidenceUrl.trim() || null,
		evidenceAttachment,
		frequency: data.frequency,
		device: data.device,
		browser: data.device === "computer" ? data.browser : null,
		occurredDate: data.occurredDate,
		occurredTime: data.occurredTime,
		accountEmail: data.accountEmail.trim() || null,
	};
};

export const submitFeedback = async (
	data: FeedbackFormData,
	evidenceFile: File | null,
): Promise<FeedbackSubmissionResponse> => {
	const payload = await buildFeedbackPayload(data, evidenceFile);
	const { data: response, error } =
		await supabase.functions.invoke<FeedbackSubmissionResponse>(
			"send-feedback-email",
			{ body: payload },
		);

	if (error) {
		throw error;
	}

	if (!response?.ok || typeof response.id !== "string" || !response.id.trim()) {
		throw new Error("Unexpected feedback response.");
	}

	return response;
};
