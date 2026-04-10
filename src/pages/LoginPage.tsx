import type { FormEvent } from "react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAppLocale } from "@/contexts/AppLocaleContext";
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

export default function LoginPage() {
	const { user, loading, signIn } = useAuth();
	const { locale } = useAppLocale();
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isSubmitHovered, setIsSubmitHovered] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const isEnglish = locale === "en";

	if (!loading && user) {
		return <Navigate to="/app" replace />;
	}

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSubmitting(true);
		setMessage(null);

		const result = await signIn(email.trim(), password);
		if (result.error) {
			setMessage(
				result.error.message ||
					(isEnglish ? "Unable to sign in." : "Impossible de se connecter."),
			);
			setIsSubmitting(false);
			return;
		}

		navigate("/app", { replace: true });
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
						{isEnglish ? "password" : "mot de passe"}
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
							{isSubmitting
								? isEnglish
									? "signing in..."
									: "connexion..."
								: isEnglish
									? "sign in"
									: "se connecter"}
						</button>
					</p>
				</form>

				{message ? <p style={baseTextStyle}>{message}</p> : null}

				<p style={baseTextStyle}>
					{isEnglish ? "no account yet?" : "pas encore de compte ?"}{" "}
					<Link to="/signup" style={plainLinkStyle}>
						{isEnglish ? "create account" : "créer un compte"}
					</Link>
				</p>
				<p style={baseTextStyle}>
					<Link to="/home" style={plainLinkStyle}>
						{isEnglish ? "← back to home page" : "← retour à la page d'accueil"}
					</Link>
				</p>
			</div>
		</main>
	);
}
