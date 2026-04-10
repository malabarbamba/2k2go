import { Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type ReviewFilter = {
	id: number;
	label: string;
	checked: boolean;
	count: number;
};

interface ReviewFilterDropdownProps {
	filters: ReviewFilter[];
	onFiltersChange: (filters: ReviewFilter[]) => void;
	plainHtmlMode?: boolean;
}

const FOUNDATION_FILTER_ID = 1;
const FOUNDATION_SOURCE_URL = "https://aclanthology.org/2021.wanlp-1.10v2.pdf";

export const ReviewFilterDropdown = ({
	filters,
	onFiltersChange,
	plainHtmlMode = false,
}: ReviewFilterDropdownProps) => {
	const [showFoundationInfo, setShowFoundationInfo] = useState(false);
	const areAllFiltersChecked =
		filters.length > 0 && filters.every((filter) => filter.checked);

	const toggleFilter = (id: number) => {
		onFiltersChange(
			filters.map((f) => (f.id === id ? { ...f, checked: !f.checked } : f)),
		);
	};

	const toggleAllFilters = () => {
		if (filters.length === 0) {
			return;
		}

		const shouldCheckAll = !areAllFiltersChecked;
		onFiltersChange(
			filters.map((filter) => ({
				...filter,
				checked: shouldCheckAll,
			})),
		);
	};

	return (
		<>
			<div
				className={
					plainHtmlMode
						? "absolute top-full left-1/2 z-50 mt-1 w-[280px] -translate-x-1/2 overflow-hidden"
						: "absolute top-full left-1/2 z-50 mt-0.5 w-[280px] -translate-x-1/2 overflow-hidden rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-2xl"
				}
				style={
					plainHtmlMode
						? {
								fontFamily: "Arial, sans-serif",
								fontSize: "13.3333px",
								backgroundColor: "#efefef",
								border: "1px solid #000000",
								color: "#000000",
							}
						: { fontFamily: "'Segoe UI', sans-serif" }
				}
			>
				{/* Header */}
				<div
					className={
						plainHtmlMode
							? "px-1 py-1"
							: "border-b border-border/80 px-1 py-0.5"
					}
					style={
						plainHtmlMode ? { borderBottom: "1px solid #000000" } : undefined
					}
				>
					<button
						type="button"
						onClick={toggleAllFilters}
						className={
							plainHtmlMode
								? "flex w-full items-center gap-2 px-1 py-0.5 text-left"
								: "flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-accent"
						}
						style={
							plainHtmlMode
								? {
										fontFamily: "Arial, sans-serif",
										fontSize: "13.3333px",
										color: "#000000",
										backgroundColor: "#efefef",
									}
								: undefined
						}
					>
						<div
							className={
								plainHtmlMode
									? "flex h-4 w-4 flex-shrink-0 items-center justify-center"
									: `flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
											areAllFiltersChecked
												? "border-primary bg-primary"
												: "border-border bg-transparent"
										}`
							}
							style={
								plainHtmlMode ? { border: "1px solid #000000" } : undefined
							}
						>
							{areAllFiltersChecked && (
								<Check
									className={
										plainHtmlMode ? "h-3 w-3 text-black" : "h-3 w-3 text-white"
									}
									strokeWidth={3}
								/>
							)}
						</div>
						<span
							className={
								plainHtmlMode
									? "leading-4"
									: "text-[11px] font-semibold leading-4 text-popover-foreground"
							}
						>
							Sélectionner tout
						</span>
					</button>
				</div>

				{/* Options */}
				<div className="py-0">
					{filters.length === 0 && (
						<p className="px-2.5 py-1 text-[10px] text-muted-foreground">
							Aucun deck disponible.
						</p>
					)}
					{filters.map((filter) => {
						const isFoundationFilter = filter.id === FOUNDATION_FILTER_ID;

						return (
							<div key={filter.id} className="px-1 py-px">
								<div className="flex items-center gap-0.5">
									<button
										type="button"
										onClick={() => toggleFilter(filter.id)}
										className={`${isFoundationFilter ? (plainHtmlMode ? "px-1" : "px-1.5") : plainHtmlMode ? "w-full px-1" : "w-full px-1.5"} flex items-center gap-1.5 ${plainHtmlMode ? "" : "rounded-md transition-colors hover:bg-accent"} py-0.5 text-left`}
										style={
											plainHtmlMode
												? {
														fontFamily: "Arial, sans-serif",
														fontSize: "13.3333px",
														color: "#000000",
														backgroundColor: "#efefef",
													}
												: undefined
										}
									>
										{/* Checkbox */}
										<div
											className={
												plainHtmlMode
													? "flex h-4 w-4 flex-shrink-0 items-center justify-center"
													: `flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
															filter.checked
																? "border-primary bg-primary"
																: "border-border bg-transparent"
														}`
											}
											style={
												plainHtmlMode
													? { border: "1px solid #000000" }
													: undefined
											}
										>
											{filter.checked && (
												<Check
													className={
														plainHtmlMode
															? "h-3 w-3 text-black"
															: "h-3 w-3 text-white"
													}
													strokeWidth={3}
												/>
											)}
										</div>
										{/* Icon */}
										{plainHtmlMode ? null : (
											<svg
												width="13"
												height="13"
												viewBox="0 0 16 16"
												fill="none"
												className="text-muted-foreground flex-shrink-0"
												aria-label="Deck"
												role="img"
											>
												<title>Deck</title>
												<rect
													x="2"
													y="2"
													width="12"
													height="12"
													rx="2"
													stroke="currentColor"
													strokeWidth="1.2"
												/>
												<rect
													x="4"
													y="4"
													width="8"
													height="3"
													rx="0.5"
													fill="currentColor"
													opacity="0.4"
												/>
												<rect
													x="4"
													y="9"
													width="5"
													height="3"
													rx="0.5"
													fill="currentColor"
													opacity="0.4"
												/>
											</svg>
										)}
										<span
											className={`${isFoundationFilter ? "text-[11px] leading-4 text-popover-foreground" : "flex-1 text-[11px] leading-4 text-popover-foreground"}`}
											style={
												plainHtmlMode
													? { fontSize: "13.3333px", color: "#000000" }
													: undefined
											}
										>
											{filter.label}
										</span>
										{!isFoundationFilter && (
											<span
												className={
													plainHtmlMode
														? ""
														: "text-[10px] text-muted-foreground"
												}
												style={
													plainHtmlMode
														? { fontSize: "13.3333px", color: "#000000" }
														: undefined
												}
											>
												{filter.count}
											</span>
										)}
									</button>

									{isFoundationFilter && (
										<>
											<button
												type="button"
												onClick={() => setShowFoundationInfo(true)}
												className={
													plainHtmlMode
														? "flex items-center justify-center"
														: "flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
												}
												style={
													plainHtmlMode
														? {
																height: "auto",
																minWidth: "auto",
																border: "1px solid #000000",
																borderRadius: "3px",
																padding: "1px 6px",
																backgroundColor: "#efefef",
																fontFamily: "Arial, sans-serif",
																fontSize: "13.3333px",
																color: "#000000",
															}
														: undefined
												}
												aria-label="Qu'est-ce que le Deck Fondations 2000 ?"
												title="Qu'est-ce que le Deck Fondations 2000 ?"
											>
												?
											</button>
											<span
												className={
													plainHtmlMode
														? "ml-auto"
														: "ml-auto text-[10px] text-muted-foreground"
												}
												style={
													plainHtmlMode
														? { fontSize: "13.3333px", color: "#000000" }
														: undefined
												}
											>
												{filter.count}
											</span>
										</>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<Dialog open={showFoundationInfo} onOpenChange={setShowFoundationInfo}>
				<DialogContent
					className={
						plainHtmlMode
							? "max-w-sm"
							: "max-w-sm border-border/80 bg-popover text-popover-foreground"
					}
					style={
						plainHtmlMode
							? {
									fontFamily: "Arial, sans-serif",
									fontSize: "13.3333px",
									backgroundColor: "#f7f6f2",
									border: "1px solid #000000",
									color: "#000000",
									borderRadius: 0,
								}
							: undefined
					}
					aria-describedby={undefined}
				>
					<DialogTitle className="sr-only text-sm font-medium text-popover-foreground">
						Information sur le Deck Fondations 2000
					</DialogTitle>
					<div
						className={
							plainHtmlMode
								? "pt-2 space-y-3"
								: "pt-2 text-xs leading-relaxed space-y-3"
						}
						style={
							plainHtmlMode
								? {
										fontFamily: "Arial, sans-serif",
										fontSize: "13.3333px",
										lineHeight: 1.35,
										color: "#000000",
									}
								: undefined
						}
					>
						<p>
							Le Deck Fondations 2000, c'est les 2 000 mots arabes les plus
							utilisés. Si tu apprends bien cette base, tu peux déjà comprendre
							environ 80 % de ce que tu vois. En général, ce cap se travaille en
							environ 3 mois avec de la régularité. Arabe Immersion a pu
							construire cette base grâce à un corpus partagé par ces
							universités.
						</p>
						<a
							href={FOUNDATION_SOURCE_URL}
							target="_blank"
							rel="noopener noreferrer"
							className={
								plainHtmlMode
									? "inline-flex items-center gap-1"
									: "inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:text-primary/80"
							}
							style={
								plainHtmlMode
									? {
											fontFamily: "Arial, sans-serif",
											fontSize: "13.3333px",
											color: "#000000",
											textDecoration: "underline",
										}
									: undefined
							}
						>
							Corpus: Mohamed bin Zayed University et New York University Abu
							Dhabi
							<ExternalLink className="h-3 w-3" aria-hidden="true" />
						</a>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
};
