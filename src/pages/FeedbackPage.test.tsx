import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeedbackPage from "@/pages/FeedbackPage";

const { invokeMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
	supabase: {
		functions: {
			invoke: invokeMock,
		},
	},
}));

describe("FeedbackPage", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		window.localStorage.clear();
	});

	it("renders the plain feedback page", () => {
		render(
			<MemoryRouter>
				<FeedbackPage />
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { name: "Feedback beta" })).toBeInTheDocument();
		expect(screen.getByLabelText("Summary")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "send feedback" })).toBeInTheDocument();
	});

	it("validates required fields before submitting", async () => {
		render(
			<MemoryRouter>
				<FeedbackPage />
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: "send feedback" }));

		expect((await screen.findAllByText("This field is required.")).length).toBeGreaterThan(0);
		expect(screen.getByText("Add either an image or an https link.")).toBeInTheDocument();
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("submits feedback successfully with a link", async () => {
		invokeMock.mockResolvedValue({ data: { ok: true, id: "fb-123" }, error: null });

		render(
			<MemoryRouter>
				<FeedbackPage />
			</MemoryRouter>,
		);

		fireEvent.change(screen.getByLabelText("Summary"), {
			target: { value: "Profile page bug" },
		});
		fireEvent.change(screen.getByLabelText("What happened right before?"), {
			target: { value: "I opened my profile." },
		});
		fireEvent.change(screen.getByLabelText("What should normally happen?"), {
			target: { value: "The content should load." },
		});
		fireEvent.change(screen.getByLabelText("What actually happened?"), {
			target: { value: "The page looked broken." },
		});
		fireEvent.change(screen.getByLabelText("Video link"), {
			target: { value: "https://example.com/evidence" },
		});

		fireEvent.click(screen.getByLabelText("Once"));
		fireEvent.click(screen.getByLabelText("Computer"));
		fireEvent.click(screen.getByLabelText("Chrome"));

		fireEvent.click(screen.getByRole("button", { name: "send feedback" }));

		await waitFor(() => {
			expect(invokeMock).toHaveBeenCalledTimes(1);
		});

		expect(invokeMock).toHaveBeenCalledWith(
			"send-feedback-email",
			expect.objectContaining({
				body: expect.objectContaining({
					summary: "Profile page bug",
					frequency: "once",
					device: "computer",
					browser: "chrome",
					evidenceUrl: "https://example.com/evidence",
				}),
				headers: undefined,
			}),
		);

		expect(await screen.findByText(/Feedback sent successfully./)).toBeInTheDocument();
		expect(screen.getByText("fb-123")).toBeInTheDocument();
	});
});
