const LANDING_PLACEHOLDER_CARD_IDS = [
	"a",
	"b",
	"c",
	"d",
	"e",
	"f",
] as const;

export default function LandingRailPlaceholders() {
	return (
		<>
			{(["left", "right"] as const).map((side) => (
				<div key={side} className={`landing-rail landing-rail-${side}`} aria-hidden="true">
					<div className="landing-rail-track">
						{LANDING_PLACEHOLDER_CARD_IDS.map((id) => (
							<div key={`${side}-${id}`} className="landing-rail-card" />
						))}
					</div>
				</div>
			))}
		</>
	);
}
