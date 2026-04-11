import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
	ACCEPTED_FEEDBACK_IMAGE_TYPES,
	createDefaultFeedbackFormData,
	FEEDBACK_MAX_UPLOAD_BYTES,
	type FeedbackBrowser,
	type FeedbackDevice,
	type FeedbackFormData,
	type FeedbackFormErrors,
	type FeedbackFrequency,
	validateFeedbackFormData,
} from "@/lib/feedback";
import { readRememberedEmail } from "@/lib/authPersistence";
import { submitFeedback } from "@/services/feedbackService";

const DEV_DISCORD_USERNAME = "noclipper#2275";

const pageStyle = {
	fontFamily: "Arial, sans-serif",
	fontSize: "13px",
	backgroundColor: "#f7f6f2",
	color: "#000000",
	minHeight: "100vh",
} as const;

const cardStyle = {
	backgroundColor: "#ffffff",
	border: "1px solid #d6d6d6",
	padding: "16px",
} as const;

const inputStyle = {
	width: "100%",
	boxSizing: "border-box" as const,
	border: "1px solid #bcbcbc",
	padding: "8px",
	font: "inherit",
	backgroundColor: "#ffffff",
	color: "#000000",
};

const textareaStyle = {
	...inputStyle,
	minHeight: "110px",
	resize: "vertical" as const,
};

const errorStyle = {
	margin: "6px 0 0",
	color: "#b00020",
	fontSize: "12px",
} as const;

const fieldsetStyle = {
	border: "1px solid #d6d6d6",
	padding: "12px",
	margin: 0,
} as const;

const labelStyle = {
	display: "block",
	marginBottom: "6px",
	fontWeight: 700,
} as const;

function ErrorText({ message }: { message?: string }) {
	if (!message) {
		return null;
	}

	return <p style={errorStyle}>{message}</p>;
}

function RadioGroup<T extends string>({
	name,
	options,
	value,
	onChange,
}: {
	name: string;
	options: Array<{ value: T; label: string }>;
	value: T | null;
	onChange: (value: T) => void;
}) {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
			{options.map((option) => (
				<label key={option.value} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
					<input
						type="radio"
						name={name}
						value={option.value}
						checked={value === option.value}
						onChange={() => {
							onChange(option.value);
						}}
					/>
					<span>{option.label}</span>
				</label>
			))}
		</div>
	);
}

export default function FeedbackPage() {
	const [formData, setFormData] = useState<FeedbackFormData>(() =>
		createDefaultFeedbackFormData(readRememberedEmail().trim()),
	);
	const [errors, setErrors] = useState<FeedbackFormErrors>({});
	const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [feedbackId, setFeedbackId] = useState<string | null>(null);
	const [isDiscordCopied, setIsDiscordCopied] = useState(false);
	const [fileInputKey, setFileInputKey] = useState(0);

	useEffect(() => {
		if (!isDiscordCopied) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setIsDiscordCopied(false);
		}, 1000);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isDiscordCopied]);

	const updateField = <K extends keyof FeedbackFormData>(
		key: K,
		value: FeedbackFormData[K],
	): void => {
		setFormData((current) => ({ ...current, [key]: value }));
		setErrors((current) => {
			if (!current[key as keyof FeedbackFormErrors]) {
				return current;
			}

			const next = { ...current };
			delete next[key as keyof FeedbackFormErrors];
			return next;
		});
	};

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0] ?? null;
		setFileError(null);
		setErrors((current) => {
			if (!current.evidence) {
				return current;
			}

			const next = { ...current };
			delete next.evidence;
			return next;
		});

		if (!file) {
			setEvidenceFile(null);
			return;
		}

		if (!ACCEPTED_FEEDBACK_IMAGE_TYPES.has(file.type)) {
			setFileError("Only PNG, JPG, WebP, and GIF images are supported.");
			event.target.value = "";
			return;
		}

		if (file.size > FEEDBACK_MAX_UPLOAD_BYTES) {
			setFileError("Image too large. Maximum size is 3 MB.");
			event.target.value = "";
			return;
		}

		setEvidenceFile(file);
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setFeedbackId(null);

		const nextErrors = validateFeedbackFormData(formData, Boolean(evidenceFile));
		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			return;
		}

		setErrors({});
		setIsSubmitting(true);
		try {
			const result = await submitFeedback(formData, evidenceFile);
			setFeedbackId(result.id);
			setEvidenceFile(null);
			setFileInputKey((current) => current + 1);
			setFileError(null);
			setFormData(createDefaultFeedbackFormData(formData.accountEmail.trim()));
		} catch (error) {
			setErrors({
				submit:
					error instanceof Error
						? error.message
						: "Unable to send feedback right now. Please try again.",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const copyDiscord = async () => {
		try {
			await navigator.clipboard.writeText(DEV_DISCORD_USERNAME);
			setIsDiscordCopied(true);
		} catch {
			setIsDiscordCopied(false);
		}
	};

	return (
		<main style={pageStyle}>
			<div style={{ maxWidth: "840px", margin: "0 auto", padding: "16px" }}>
				<div style={{ marginBottom: "18px" }}>
					<Link
						to="/"
						style={{ fontSize: "13px", color: "#000000", textDecoration: "underline" }}
					>
						<span aria-hidden="true">&larr;</span>
						<span>back</span>
					</Link>
				</div>

				<div style={cardStyle}>
					<h1 style={{ margin: "0 0 10px", fontSize: "24px", fontWeight: 400 }}>
						Feedback beta
					</h1>
					<p style={{ margin: "0 0 8px", lineHeight: 1.45 }}>
						Use this page to report a bug or share product feedback. The structure below matches the original in-app feedback flow, but in a plain page instead of a popup.
					</p>
					<p style={{ margin: 0, lineHeight: 1.45 }}>
						If needed, you can also contact the dev directly on Discord: <strong>{DEV_DISCORD_USERNAME}</strong>{" "}
						<button
							type="button"
							onClick={() => {
								void copyDiscord();
							}}
							style={{
								font: "inherit",
								border: "1px solid #bcbcbc",
								background: "#efefef",
								padding: "2px 6px",
								marginLeft: "6px",
								cursor: "pointer",
							}}
						>
							copy
						</button>
						{isDiscordCopied ? <span style={{ marginLeft: "6px" }}>copied</span> : null}
					</p>

					{feedbackId ? (
						<p
							style={{
								margin: "16px 0 0",
								padding: "10px",
								border: "1px solid #b7d7b0",
								backgroundColor: "#edf8ea",
							}}
						>
							Feedback sent successfully. Reference: <strong>{feedbackId}</strong>
						</p>
					) : null}

					<form onSubmit={(event) => void handleSubmit(event)} style={{ marginTop: "18px" }}>
						<div style={{ display: "grid", gap: "16px" }}>
							<fieldset style={fieldsetStyle}>
								<legend style={{ padding: "0 6px", fontWeight: 700 }}>The problem</legend>
								<div style={{ display: "grid", gap: "12px" }}>
									<div>
										<label htmlFor="feedback-summary" style={labelStyle}>Summary</label>
										<input id="feedback-summary" value={formData.summary} onChange={(event) => updateField("summary", event.target.value)} maxLength={220} placeholder="Summary of the issue in one sentence" style={inputStyle} />
										<ErrorText message={errors.summary} />
									</div>

									<div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
										<div>
											<label htmlFor="feedback-before" style={labelStyle}>What happened right before?</label>
											<textarea id="feedback-before" value={formData.beforeContext} onChange={(event) => updateField("beforeContext", event.target.value)} maxLength={1800} placeholder="What did you do just before the issue happened?" style={textareaStyle} />
											<ErrorText message={errors.beforeContext} />
										</div>
										<div>
											<label htmlFor="feedback-expected" style={labelStyle}>What should normally happen?</label>
											<textarea id="feedback-expected" value={formData.expectedBehavior} onChange={(event) => updateField("expectedBehavior", event.target.value)} maxLength={1800} placeholder="Expected result" style={textareaStyle} />
											<ErrorText message={errors.expectedBehavior} />
										</div>
									</div>

									<div>
										<label htmlFor="feedback-actual" style={labelStyle}>What actually happened?</label>
										<textarea id="feedback-actual" value={formData.actualBehavior} onChange={(event) => updateField("actualBehavior", event.target.value)} maxLength={1800} placeholder="Detailed explanation of the issue" style={textareaStyle} />
										<ErrorText message={errors.actualBehavior} />
									</div>

									<div>
										<label htmlFor="feedback-error-message" style={labelStyle}>Error message (optional)</label>
										<input id="feedback-error-message" value={formData.errorMessage} onChange={(event) => updateField("errorMessage", event.target.value)} maxLength={500} placeholder="Paste any error message you saw" style={inputStyle} />
									</div>
								</div>
							</fieldset>

							<div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
								<fieldset style={fieldsetStyle}>
									<legend style={{ padding: "0 6px", fontWeight: 700 }}>When did it happen?</legend>
									<div style={{ display: "grid", gap: "12px" }}>
										<div>
											<label htmlFor="feedback-date" style={labelStyle}>Date</label>
											<input id="feedback-date" type="date" value={formData.occurredDate} onChange={(event) => updateField("occurredDate", event.target.value)} style={inputStyle} />
										</div>
										<div>
											<label htmlFor="feedback-time" style={labelStyle}>Time</label>
											<input id="feedback-time" type="time" value={formData.occurredTime} onChange={(event) => updateField("occurredTime", event.target.value)} style={inputStyle} />
										</div>
									</div>
								</fieldset>

								<fieldset style={fieldsetStyle}>
									<legend style={{ padding: "0 6px", fontWeight: 700 }}>Frequency</legend>
									<RadioGroup<FeedbackFrequency>
										name="feedback-frequency"
										value={formData.frequency}
										onChange={(value) => updateField("frequency", value)}
										options={[
											{ value: "once", label: "Once" },
											{ value: "sometimes", label: "Sometimes" },
											{ value: "often", label: "Often" },
											{ value: "always", label: "Always" },
										]}
									/>
									<ErrorText message={errors.frequency} />
								</fieldset>
							</div>

							<fieldset style={fieldsetStyle}>
								<legend style={{ padding: "0 6px", fontWeight: 700 }}>Environment</legend>
								<div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
									<div>
										<p style={{ ...labelStyle, marginTop: 0 }}>Device</p>
										<RadioGroup<FeedbackDevice>
											name="feedback-device"
											value={formData.device}
											onChange={(value) => {
												updateField("device", value);
												updateField("browser", null);
											}}
											options={[
												{ value: "computer", label: "Computer" },
												{ value: "iphone", label: "iPhone" },
												{ value: "android", label: "Android" },
												{ value: "tablet", label: "Tablet" },
											]}
										/>
										<ErrorText message={errors.device} />
									</div>

									{formData.device === "computer" ? (
										<div>
											<p style={{ ...labelStyle, marginTop: 0 }}>Browser</p>
											<RadioGroup<FeedbackBrowser>
												name="feedback-browser"
												value={formData.browser}
												onChange={(value) => updateField("browser", value)}
												options={[
													{ value: "chrome", label: "Chrome" },
													{ value: "safari", label: "Safari" },
													{ value: "firefox", label: "Firefox" },
													{ value: "edge", label: "Edge" },
													{ value: "other", label: "Other" },
												]}
											/>
											<ErrorText message={errors.browser} />
										</div>
									) : null}
								</div>
							</fieldset>

							<fieldset style={fieldsetStyle}>
								<legend style={{ padding: "0 6px", fontWeight: 700 }}>Evidence</legend>
								<p style={{ marginTop: 0, marginBottom: "12px", lineHeight: 1.45 }}>
									Attach an image or provide a video link. One of the two is required.
								</p>
								<div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
									<div>
										<label htmlFor="feedback-file" style={labelStyle}>Attach an image</label>
										<div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
											<label
												htmlFor="feedback-file"
												style={{
													font: "inherit",
													border: "1px solid #000000",
													backgroundColor: "#efefef",
													padding: "8px 12px",
													cursor: "pointer",
													display: "inline-block",
												}}
											>
												Choose image
											</label>
											<input
												key={fileInputKey}
												id="feedback-file"
												type="file"
												accept="image/png,image/jpeg,image/webp,image/gif"
												onChange={handleFileChange}
												style={{ display: "none" }}
											/>
											<span>{evidenceFile ? evidenceFile.name : "No file selected"}</span>
										</div>
										{evidenceFile ? <p style={{ margin: "6px 0 0" }}>Selected: {evidenceFile.name}</p> : null}
										{fileError ? <p style={errorStyle}>{fileError}</p> : null}
									</div>
									<div>
										<label htmlFor="feedback-link" style={labelStyle}>Video link</label>
										<input id="feedback-link" value={formData.evidenceUrl} onChange={(event) => updateField("evidenceUrl", event.target.value)} placeholder="https://..." style={inputStyle} />
									</div>
								</div>
								<ErrorText message={errors.evidence} />
							</fieldset>

							<fieldset style={fieldsetStyle}>
								<legend style={{ padding: "0 6px", fontWeight: 700 }}>Account email</legend>
								<p style={{ marginTop: 0, marginBottom: "12px", lineHeight: 1.45 }}>
									Optional. If you want, add the email linked to your account so the report is easier to trace.
								</p>
								<input value={formData.accountEmail} onChange={(event) => updateField("accountEmail", event.target.value)} placeholder="name@example.com" style={inputStyle} />
								<ErrorText message={errors.accountEmail} />
							</fieldset>

							{errors.submit ? (
								<p style={{ ...errorStyle, margin: 0 }}>{errors.submit}</p>
							) : null}

							<div style={{ display: "flex", justifyContent: "flex-end" }}>
								<button
									type="submit"
									disabled={isSubmitting}
									style={{
										font: "inherit",
										border: "1px solid #000000",
										backgroundColor: isSubmitting ? "#e3e3e3" : "#efefef",
										padding: "8px 12px",
										cursor: isSubmitting ? "default" : "pointer",
									}}
								>
									{isSubmitting ? "sending..." : "send feedback"}
								</button>
							</div>
						</div>
					</form>
				</div>
			</div>
		</main>
	);
}
