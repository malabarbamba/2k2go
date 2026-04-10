import { X } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface HeatmapData {
	date: string; // ISO date string (YYYY-MM-DD)
	count: number; // Number of reviews
	hasConnection?: boolean; // At least one connection on that day
	immersionActive?: boolean; // At least one immersion activity on that day
	immersionMinutes?: number; // Minutes of immersion tracked for that day
}

interface ReviewHeatmapProps {
	data: HeatmapData[];
	onDateClick?: (date: string) => void;
	className?: string;
	enableFlicker?: boolean;
	scale?: "default" | "expanded";
}

const HEATMAP_SIZING = {
	default: {
		cellSize: 11,
		cellGap: 4,
		weekGap: 3,
		weekdayLabelWidth: 28,
		leftPadding: 28,
		topPadding: "clamp(0.85rem,2.2vw,1.25rem)",
	},
	expanded: {
		cellSize: 14,
		cellGap: 5,
		weekGap: 4,
		weekdayLabelWidth: 32,
		leftPadding: 32,
		topPadding: "clamp(1rem,2.5vw,1.4rem)",
	},
} as const;

const getColorForLevel = (level: number, darkMode: boolean): string => {
	const lightColors = [
		"#ebedf0", // Level 0 - lightest neutral gray (no tint), still visible on white
		"#d2e7d7", // Level 1 - slightly darker soft green
		"#9fd9ad", // Level 2 - balanced green with moderate saturation
		"#52c671", // Level 3 - stronger, more vibrant green
		"#00C853", // Level 4 - vibrant pure green
	];
	const darkColors = [
		"#303030", // Level 0 - neutral dark empty cell
		"#0F351E",
		"#043A16",
		"#206C34",
		"#59C868",
	];
	const colors = darkMode ? darkColors : lightColors;
	return colors[level] || colors[0];
};

const LEGEND_LEVEL_DESCRIPTIONS = [
	"Aucune activité",
	"Connexion enregistrée",
	"1 à 10 revues",
	"Plus de 10 revues",
	"Plus de 20 revues",
] as const;

interface HeatmapDay {
	date: Date;
	count: number;
	level: number;
	hasConnection: boolean;
	immersionActive: boolean;
}

const calculateLevel = ({
	count,
	hasConnection,
}: {
	count: number;
	hasConnection: boolean;
}): number => {
	if (!hasConnection && count <= 0) {
		return 0;
	}

	if (count > 20) {
		return 4;
	}

	if (count > 10) {
		return 3;
	}

	if (count >= 1) {
		return 2;
	}

	return 1;
};

const formatDateString = (dateString: string): string => {
	const date = new Date(dateString);
	return date.toLocaleDateString("fr-FR", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
	"Jan",
	"Fév",
	"Mar",
	"Avr",
	"Mai",
	"Juin",
	"Juil",
	"Aoû",
	"Sep",
	"Oct",
	"Nov",
	"Déc",
];

const hashString = (value: string): number => {
	let hash = 0;
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	}
	return hash;
};

const getFlickerTiming = (date: Date) => {
	const key = date.toISOString().split("T")[0];
	const hash = hashString(key);
	return {
		delayMs: hash % 600,
		durationMs: 1200 + (hash % 200),
	};
};

export const ReviewHeatmap: React.FC<ReviewHeatmapProps> = ({
	data,
	className = "",
	enableFlicker = true,
	scale = "default",
}) => {
	const { resolvedTheme } = useTheme();
	const [showExplanation, setShowExplanation] = useState(false);
	const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [visibleWeeks, setVisibleWeeks] = useState<number>(1);
	const isDarkMode =
		resolvedTheme === "dark" ||
		(resolvedTheme === undefined &&
			typeof document !== "undefined" &&
			document.documentElement.classList.contains("dark"));
	const sizing = HEATMAP_SIZING[scale];
	const cellTotal = sizing.cellSize + sizing.cellGap;

	useEffect(() => {
		if (typeof document === "undefined") {
			return;
		}

		setPortalRoot(document.body);
	}, []);

	useEffect(() => {
		if (!showExplanation || typeof document === "undefined") {
			return;
		}

		const onEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setShowExplanation(false);
			}
		};

		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", onEscape);

		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", onEscape);
		};
	}, [showExplanation]);

	// Generate last 365 days of heatmap data
	const heatmapData = useMemo(() => {
		const today = new Date();
		const oneYearAgo = new Date(today);
		oneYearAgo.setDate(oneYearAgo.getDate() - 364);

		const dateMap = new Map<string, HeatmapData>();
		data.forEach((day) => {
			dateMap.set(day.date, day);
		});

		const result: HeatmapDay[] = [];
		const currentDate = new Date(oneYearAgo);

		for (let i = 0; i < 365; i++) {
			const dateStr = currentDate.toISOString().split("T")[0];
			const dayData = dateMap.get(dateStr);
			const count = dayData?.count ?? 0;
			const hasConnection = dayData?.hasConnection ?? count > 0;
			const immersionActive = dayData?.immersionActive ?? false;
			const level = calculateLevel({
				count,
				hasConnection,
			});
			result.push({
				date: new Date(currentDate),
				count,
				level,
				hasConnection,
				immersionActive,
			});
			currentDate.setDate(currentDate.getDate() + 1);
		}

		return result;
	}, [data]);

	// Group by weeks for rendering (Monday = first day)
	const weeks = useMemo(() => {
		const weeks: HeatmapDay[][] = [];
		let currentWeek: HeatmapDay[] = [];

		heatmapData.forEach((day) => {
			const dayOfWeek = day.date.getDay(); // 0 = Sunday, 1 = Monday, ...
			const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0, Sunday = 6

			currentWeek[adjustedDay] = day;

			// End week on Sunday
			if (dayOfWeek === 0) {
				// Fill missing days with empty cells
				for (let i = 0; i < 7; i++) {
					if (!currentWeek[i]) {
						currentWeek[i] = {
							date: new Date(
								day.date.getTime() - (6 - i) * 24 * 60 * 60 * 1000,
							),
							count: 0,
							level: 0,
							hasConnection: false,
							immersionActive: false,
						};
					}
				}
				weeks.push([...currentWeek]);
				currentWeek = [];
			}
		});

		// Handle last incomplete week
		if (currentWeek.length > 0) {
			for (let i = 0; i < 7; i++) {
				if (!currentWeek[i]) {
					const lastDate =
						currentWeek.filter((d) => d).pop()?.date || new Date();
					currentWeek[i] = {
						date: new Date(
							lastDate.getTime() +
								(i - currentWeek.length + 1) * 24 * 60 * 60 * 1000,
						),
						count: 0,
						level: 0,
						hasConnection: false,
						immersionActive: false,
					};
				}
			}
			weeks.push(currentWeek);
		}

		return weeks;
	}, [heatmapData]);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const updateVisibleWeeks = (containerWidth: number) => {
			if (containerWidth <= 0) {
				setVisibleWeeks((current) => (current === 1 ? current : 1));
				return;
			}

			const totalWeeks = weeks.length;
			const availableGridWidth =
				containerWidth - sizing.weekdayLabelWidth - sizing.leftPadding;
			const fittedWeeks = Math.floor(
				(availableGridWidth - sizing.weekGap) / cellTotal,
			);
			const nextVisibleWeeks = Math.max(1, Math.min(totalWeeks, fittedWeeks));

			setVisibleWeeks((current) =>
				current === nextVisibleWeeks ? current : nextVisibleWeeks,
			);
		};

		const measureWidth = () => {
			updateVisibleWeeks(container.clientWidth);
		};

		if (typeof ResizeObserver === "undefined") {
			measureWidth();
			window.addEventListener("resize", measureWidth);
			return () => {
				window.removeEventListener("resize", measureWidth);
			};
		}

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			const width = entry?.contentRect?.width ?? container.clientWidth;
			updateVisibleWeeks(width);
		});

		observer.observe(container);
		measureWidth();

		return () => {
			observer.disconnect();
		};
	}, [
		cellTotal,
		sizing.leftPadding,
		sizing.weekGap,
		sizing.weekdayLabelWidth,
		weeks.length,
	]);

	const visibleWeeksData = useMemo(() => {
		if (visibleWeeks >= weeks.length) {
			return weeks;
		}

		return weeks.slice(weeks.length - visibleWeeks);
	}, [weeks, visibleWeeks]);

	// Get month labels with correct week index
	const monthLabels = useMemo(() => {
		const labels: Array<{ month: string; weekIndex: number }> = [];
		let lastMonth = -1;

		visibleWeeksData.forEach((week, weekIndex) => {
			const firstDay = week[0];
			if (firstDay) {
				const month = firstDay.date.getMonth();
				if (month !== lastMonth) {
					labels.push({ month: MONTHS[month], weekIndex });
					lastMonth = month;
				}
			}
		});

		return labels;
	}, [visibleWeeksData]);

	const svgWidth = Math.max(
		1,
		visibleWeeksData.length * cellTotal + sizing.weekGap,
	);
	const svgHeight = 7 * cellTotal + sizing.weekGap;

	return (
		<div ref={containerRef} className={`w-full ${className}`}>
			<div className="flex w-full flex-col items-center">
				<div
					className="relative"
					style={{
						paddingLeft: `${sizing.leftPadding}px`,
						paddingTop: sizing.topPadding,
					}}
				>
					{/* Month labels - aligned with weeks */}
					<div
						className="absolute top-0 right-0 h-4"
						style={{ left: `${sizing.leftPadding}px` }}
					>
						{monthLabels.map((label) => (
							<span
								key={`${label.month}-${label.weekIndex}`}
								className="absolute text-[clamp(0.58rem,1.15vw,0.63rem)] text-muted-foreground"
								style={{ left: `${label.weekIndex * cellTotal}px` }}
							>
								{label.month}
							</span>
						))}
					</div>

					{/* Weekday labels - aligned with rows */}
					<div
						className="absolute top-5 left-0 bottom-0 flex flex-col text-[clamp(0.58rem,1.15vw,0.63rem)] text-muted-foreground"
						style={{ width: `${sizing.weekdayLabelWidth}px` }}
					>
						{WEEKDAYS.map((day) => (
							<span
								key={day}
								className="flex items-center justify-end pr-1"
								style={{ height: `${cellTotal}px` }}
							>
								{day}
							</span>
						))}
					</div>

					{/* Heatmap grid */}
					<svg
						width={svgWidth}
						height={svgHeight}
						className="block"
						role="img"
						aria-label="Heatmap d'activite"
					>
						{visibleWeeksData.map((week, weekIndex) => (
							<g
								key={week[0]?.date.toISOString() ?? `week-${weekIndex}`}
								transform={`translate(${weekIndex * cellTotal}, 0)`}
							>
								{week.map((day, dayIndex) => {
									const y = dayIndex * cellTotal;
									const flickerTiming = getFlickerTiming(day.date);
									const effectiveLevel = enableFlicker ? day.level : 0;
									const dayIso = day.date.toISOString().split("T")[0];
									const dayLabel = formatDateString(dayIso);
									const daySummary =
										day.count > 0
											? `${day.count} ${day.count === 1 ? "revue" : "revues"}`
											: day.hasConnection
												? "Connexion enregistree"
												: "Aucune activite";

									return (
										<rect
											key={`${day.date.toISOString()}`}
											x={0}
											y={y}
											width={sizing.cellSize}
											height={sizing.cellSize}
											rx={2}
											ry={2}
											fill={getColorForLevel(effectiveLevel, isDarkMode)}
											data-date={dayIso}
											data-level={effectiveLevel}
											data-count={day.count}
											className={`transition-opacity hover:opacity-80 ${enableFlicker && day.level > 0 ? "prog-heatmap-flicker-in" : ""}`}
											style={
												enableFlicker && day.level > 0
													? {
															animationDelay: `${flickerTiming.delayMs}ms`,
															animationDuration: `${flickerTiming.durationMs}ms`,
														}
													: undefined
											}
										>
											<title>{`${daySummary} - ${dayLabel}`}</title>
										</rect>
									);
								})}
							</g>
						))}
					</svg>
				</div>

				{/* Bottom row: "À quoi ça sert ?" on left, legend on right */}
				<div className="mt-1.5 flex w-full items-center justify-between text-[clamp(0.55rem,1vw,0.62rem)] text-muted-foreground">
					{/* Left: Help text */}
					<button
						type="button"
						onClick={() => setShowExplanation(true)}
						className="text-muted-foreground transition-colors underline underline-offset-2 hover:text-foreground"
					>
						À quoi ça sert ?
					</button>

					{/* Right: Legend */}
					<div className="flex items-center gap-2">
						<span>Moins</span>
						<div className="flex gap-[2px]">
							{LEGEND_LEVEL_DESCRIPTIONS.map((description, level) => (
								<div
									key={description}
									title={description}
									style={{
										width: `${sizing.cellSize}px`,
										height: `${sizing.cellSize}px`,
										backgroundColor: getColorForLevel(level, isDarkMode),
										borderRadius: "2px",
									}}
								/>
							))}
						</div>
						<span>Plus</span>
					</div>
				</div>
			</div>

			{/* Explanation popup rendered in body to avoid card stacking context */}
			{showExplanation && portalRoot
				? createPortal(
						<div
							className="fixed inset-0 overflow-y-auto p-3 sm:p-6"
							style={{ zIndex: 2147483000 }}
							role="dialog"
							aria-modal="true"
						>
							{/* Backdrop */}
							<button
								type="button"
								aria-label="Fermer l'explication"
								className="absolute inset-0 backdrop-blur-sm bg-black/50"
								onClick={() => setShowExplanation(false)}
							/>

							<div className="relative z-10 flex min-h-full items-start justify-center sm:items-center">
								{/* Popup card */}
								<div className="relative my-2 w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
									{/* Header */}
									<div className="sticky top-0 z-10 flex items-start justify-between border-b border-border/70 bg-popover p-4 pb-2">
										<h3 className="text-[clamp(1rem,2.2vw,1.125rem)] font-semibold text-popover-foreground">
											La heatmap
										</h3>
										<button
											type="button"
											onClick={() => setShowExplanation(false)}
											className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
											aria-label="Fermer"
										>
											<X className="w-4 h-4" />
										</button>
									</div>

									{/* Content */}
									<div className="space-y-3 px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
										<p>
											La heatmap te permet de{" "}
											<strong className="text-popover-foreground">
												suivre ton activité
											</strong>{" "}
											au jour le jour. Chaque case représente un jour.
										</p>

										<p>
											<strong className="text-popover-foreground">
												À quoi ça sert ?
											</strong>
											<br />À te motiver ! Voir ton activité s'accumuler crée un{" "}
											<strong className="text-popover-foreground">
												effet boule de neige
											</strong>{" "}
											: plus tu es actif, plus tu as envie de continuer. Chaque
											case verte est une petite victoire visible.
										</p>

										<p>
											<strong className="text-popover-foreground">
												Comment ça marche ?
											</strong>
											<br />
											Si tu ne te connectes pas, la case reste sombre. Une
											connexion donne le niveau minimal. Puis l'intensité monte
											avec tes revues du jour: 1 a 10 revues, puis plus de 10,
											et le dernier palier a partir de plus de 20 revues.
										</p>
									</div>
								</div>
							</div>
						</div>,
						portalRoot,
					)
				: null}
		</div>
	);
};
