"use client";
import { useState } from "react";
import {
	Keyboard,
	type KeyboardMode,
	type KeyboardOutputMode,
} from "@/components/ui/keyboard";
import { useIsEnglishApp } from "@/contexts/AppLocaleContext";
import { cn } from "@/lib/utils";

const baseTextButtonStyle = {
	fontSize: "13.3333px",
	fontFamily: "Arial, sans-serif",
	color: "#000000",
	backgroundColor: "#efefef",
	border: "1px solid #000000",
	borderRadius: "3px",
	padding: "1px 6px",
	minHeight: "22px",
	minWidth: "170px",
	cursor: "pointer",
} as const;

const getHtmlButtonStyle = (isActive: boolean) => ({
	...baseTextButtonStyle,
	opacity: isActive ? 1 : 0.5,
});

const CLASSIC_BUTTON_CLASS =
	"inline-flex h-8 w-40 items-center justify-center rounded-md border border-neutral-500 bg-gradient-to-b from-neutral-200 to-neutral-300 px-3 text-xs font-semibold leading-none text-neutral-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-colors";

const getClassicButtonClass = (isActive: boolean): string =>
	cn(CLASSIC_BUTTON_CLASS, isActive ? "opacity-100" : "opacity-40");

export default function KeyboardWithPreviewDemo({
	compactSpacing = false,
	plainHtmlMode = false,
}: {
	compactSpacing?: boolean;
	plainHtmlMode?: boolean;
}) {
	const isEnglish = useIsEnglishApp();
	const [mode, setMode] = useState<KeyboardMode>("simplified");
	const [outputMode, setOutputMode] = useState<KeyboardOutputMode>("arabic");

	return (
		<div
			className={cn(
				"flex w-full min-w-0 flex-col items-center",
				compactSpacing
					? "justify-start gap-2 pb-2 pt-0"
					: "min-h-96 justify-center gap-5 py-10 md:min-h-180",
			)}
		>
			{/* Keep the imported keyboard presentation intact and limit changes to the mode controls requested for this page. */}
			<Keyboard
				enableSound
				showPreview
				mode={mode}
				outputMode={outputMode}
				compactSpacing={compactSpacing}
				onOutputModeChange={setOutputMode}
			/>
			<div
				className={cn(
					"flex flex-col items-center gap-2",
					compactSpacing ? "mt-0" : "mt-1",
				)}
			>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setOutputMode("phonetic")}
						className={
							plainHtmlMode
								? undefined
								: getClassicButtonClass(outputMode === "phonetic")
						}
						style={
							plainHtmlMode
								? getHtmlButtonStyle(outputMode === "phonetic")
								: undefined
						}
					>
						{isEnglish ? "write in latin letters" : "écrire en lettres latines"}
					</button>
					<button
						type="button"
						onClick={() => setOutputMode("arabic")}
						className={
							plainHtmlMode
								? undefined
								: getClassicButtonClass(outputMode === "arabic")
						}
						style={
							plainHtmlMode
								? getHtmlButtonStyle(outputMode === "arabic")
								: undefined
						}
					>
						{isEnglish ? "write in arabic" : "écrire en arabe"}
					</button>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setMode("simplified")}
						className={
							plainHtmlMode
								? undefined
								: getClassicButtonClass(mode === "simplified")
						}
						style={
							plainHtmlMode
								? getHtmlButtonStyle(mode === "simplified")
								: undefined
						}
					>
						{isEnglish ? "learning keyboard" : "clavier pédagogique"}
					</button>
					<button
						type="button"
						onClick={() => setMode("normal")}
						className={
							plainHtmlMode
								? undefined
								: getClassicButtonClass(mode === "normal")
						}
						style={
							plainHtmlMode ? getHtmlButtonStyle(mode === "normal") : undefined
						}
					>
						{isEnglish ? "standard keyboard" : "clavier standard"}
					</button>
				</div>
			</div>
		</div>
	);
}
