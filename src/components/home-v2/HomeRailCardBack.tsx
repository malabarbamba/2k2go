import type { VocabCard } from "@/lib/deck-perso-adapters";

type HomeRailCardBackProps = {
	card: VocabCard;
	scale: number;
	lineHeightScale: number;
	paddingScale: number;
	frenchScale: number;
	arabicScale: number;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

export default function HomeRailCardBack({
	card,
	scale,
	lineHeightScale,
	paddingScale,
	frenchScale,
	arabicScale,
}: HomeRailCardBackProps) {
	const padding = Math.round(14 * paddingScale);
	const vocabFontSize = clamp(28 * arabicScale, 20, 30);
	const sentenceFontSize = clamp(16 * arabicScale, 12, 18);
	const frenchFontSize = clamp(14 * frenchScale, 11, 15);
	const textLineHeight = clamp(1.25 * lineHeightScale, 1.05, 1.25);
	const imageMinHeight = Math.round(170 * scale);
	const sentenceText = card.sentFull?.trim() || card.sentBase?.trim() || "";

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				background: "#ece5d7",
				border: "1px solid #b8b1a3",
				borderRadius: "36px",
				overflow: "hidden",
				boxShadow: "0 10px 26px -16px rgba(0,0,0,0.28)",
			}}
		>
			<div
				style={{
					flex: "1 1 auto",
					minHeight: `${imageMinHeight}px`,
					background: "#ddd4c4",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					overflow: "hidden",
				}}
			>
				{card.image ? (
					<img
						src={card.image}
						alt={card.vocabDef || card.vocabBase}
						loading="eager"
						style={{ width: "100%", height: "100%", objectFit: "cover" }}
					/>
				) : null}
			</div>
			<div
				style={{
					padding: `${padding}px`,
					background: "#f7f6f2",
					color: "#000000",
					fontFamily: "Arial, sans-serif",
					textAlign: "center",
				}}
			>
				<div
					dir="rtl"
					lang="ar"
					style={{
						fontSize: `${vocabFontSize}px`,
						lineHeight: 1,
						fontFamily:
							"'Yakout Linotype', 'Scheherazade New', 'Amiri', 'Noto Naskh Arabic', serif",
					}}
				>
					{card.vocabFull || card.vocabBase}
				</div>
				<div
					style={{
						marginTop: "6px",
						fontSize: `${frenchFontSize}px`,
						lineHeight: textLineHeight,
						opacity: 0.82,
					}}
				>
					{card.vocabDef}
				</div>
				{sentenceText ? (
					<div
						dir="rtl"
						lang="ar"
						style={{
							marginTop: "8px",
							fontSize: `${sentenceFontSize}px`,
							lineHeight: textLineHeight,
							fontFamily:
								"'Yakout Linotype', 'Scheherazade New', 'Amiri', 'Noto Naskh Arabic', serif",
							opacity: 0.92,
						}}
					>
						{sentenceText}
					</div>
				) : null}
			</div>
		</div>
	);
}
