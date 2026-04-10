import type { FormEvent } from "react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const baseTextStyle = {
	fontSize: "13.3333px",
	fontFamily: "Arial, sans-serif",
} as const;

const buttonStyle = {
	...baseTextStyle,
	color: "#000000",
	backgroundColor: "#efefef",
	border: "1px solid #000000",
	borderRadius: "3px",
	padding: "1px 6px",
} as const;

const plainLinkStyle = {
	...baseTextStyle,
	color: "#000000",
	textDecoration: "underline",
} as const;

export default function OnboardingV2Page() {
	const { user, loading, signUp } = useAuth();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitHovered, setIsSubmitHovered] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	if (!loading && user) {
		return <Navigate to="/app-v2" replace />;
	}

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setMessage(null);

		if (password !== confirmPassword) {
			setMessage("Les mots de passe ne correspondent pas.");
			return;
		}

		setIsSubmitting(true);
		const result = await signUp(email.trim(), password, {
			emailRedirectPath: "/app-v2",
		});
		if (result.error) {
			setMessage(result.error.message || "Impossible de créer le compte.");
			setIsSubmitting(false);
			return;
		}

		setMessage("Compte créé. Tu peux te connecter.");
		setIsSubmitting(false);
		navigate("/login-v2", { replace: true });
	};

	return (
		<main
			style={{
				fontFamily: "Arial, sans-serif",
				fontSize: "13.3333px",
				backgroundColor: "#f7f6f2",
				color: "#000000",
				position: "fixed",
				inset: 0,
				overflowY: "auto",
			}}
		>
			<div
				style={{ maxWidth: "520px", margin: "80px auto 0", padding: "0 16px" }}
			>
				<form onSubmit={handleSubmit}>
					<p style={baseTextStyle}>
						email
						<br />
						<input
							type="email"
							required
							value={email}
							onChange={(event) => {
								setEmail(event.target.value);
							}}
							style={{
								...baseTextStyle,
								width: "100%",
								padding: "2px 6px",
								border: "1px solid #000000",
								backgroundColor: "#ffffff",
							}}
						/>
					</p>

					<p style={baseTextStyle}>
						mot de passe
						<br />
						<input
							type="password"
							required
							value={password}
							onChange={(event) => {
								setPassword(event.target.value);
							}}
							style={{
								...baseTextStyle,
								width: "100%",
								padding: "2px 6px",
								border: "1px solid #000000",
								backgroundColor: "#ffffff",
							}}
						/>
					</p>

					<p style={baseTextStyle}>
						confirmer le mot de passe
						<br />
						<input
							type="password"
							required
							value={confirmPassword}
							onChange={(event) => {
								setConfirmPassword(event.target.value);
							}}
							style={{
								...baseTextStyle,
								width: "100%",
								padding: "2px 6px",
								border: "1px solid #000000",
								backgroundColor: "#ffffff",
							}}
						/>
					</p>

					<p style={{ ...baseTextStyle, marginTop: "10px" }}>
						<button
							type="submit"
							disabled={isSubmitting}
							onMouseEnter={() => {
								setIsSubmitHovered(true);
							}}
							onMouseLeave={() => {
								setIsSubmitHovered(false);
							}}
							style={{
								...buttonStyle,
								backgroundColor: isSubmitHovered ? "#e3e3e3" : "#efefef",
							}}
						>
							{isSubmitting ? "création..." : "créer un compte"}
						</button>
					</p>
				</form>

				{message ? <p style={baseTextStyle}>{message}</p> : null}

				<p style={baseTextStyle}>
					déjà inscrit ?{" "}
					<Link to="/login-v2" style={plainLinkStyle}>
						se connecter
					</Link>
				</p>
				<p style={baseTextStyle}>
					<Link to="/home-v2" style={plainLinkStyle}>
						← retour à la page d'accueil
					</Link>
				</p>
			</div>
		</main>
	);
}
