import foundation2kCsvRaw from "@/assets/deck-fondations-2k/Fondations-2k.csv?raw";
import foundation2kEnglishCsvRaw from "@/assets/deck-fondations-2k/Fondations-2k-English.csv?raw";
import { stripControlMarkerArtifacts } from "@/lib/textEncoding";
import type { AppLocale } from "@/lib/appLocale";

export interface Foundation2kCard {
	frequencyRank: number;
	focus: number;
	wordAr: string;
	wordFr: string;
	exampleSentenceAr: string;
	exampleSentenceFr: string;
	category: string | null;
}

const stripHtmlTags = (value: string): string =>
	value.replace(/<[^>]*>/g, "").trim();

const normalizeWhitespace = (value: string): string =>
	value.replace(/\s+/g, " ").trim();

const sanitizeCsvCell = (value: string): string =>
	normalizeWhitespace(stripHtmlTags(stripControlMarkerArtifacts(value)));

const parseSemicolonCsv = (raw: string): string[][] => {
	const rows: string[][] = [];
	let currentField = "";
	let currentRow: string[] = [];
	let inQuotes = false;

	for (let i = 0; i < raw.length; i += 1) {
		const char = raw[i];
		const nextChar = raw[i + 1];

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				currentField += '"';
				i += 1;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}

		if (!inQuotes && (char === "\n" || char === "\r")) {
			if (char === "\r" && nextChar === "\n") {
				i += 1;
			}
			currentRow.push(currentField);
			currentField = "";
			if (currentRow.some((field) => field.trim().length > 0)) {
				rows.push(currentRow);
			}
			currentRow = [];
			continue;
		}

		if (!inQuotes && char === ";") {
			currentRow.push(currentField);
			currentField = "";
			continue;
		}

		currentField += char;
	}

	if (currentField.length > 0 || currentRow.length > 0) {
		currentRow.push(currentField);
		if (currentRow.some((field) => field.trim().length > 0)) {
			rows.push(currentRow);
		}
	}

	return rows;
};

const parseFoundation2kDeckCsv = (rawCsv: string): Foundation2kCard[] => {
	const csvRows = parseSemicolonCsv(rawCsv);
	const [headerRow, ...dataRows] = csvRows;
	const headerIndexByName = new Map<string, number>();

	if (headerRow) {
		headerRow.forEach((name, index) => {
			headerIndexByName.set(name.trim(), index);
		});
	}

	const getCell = (row: string[], columnName: string): string => {
		const index = headerIndexByName.get(columnName);
		if (index == null || index < 0 || index >= row.length) {
			return "";
		}
		return row[index] ?? "";
	};

	return dataRows
		.map((row, index) => {
			const wordAr =
				sanitizeCsvCell(getCell(row, "VocabFull")) ||
				sanitizeCsvCell(getCell(row, "VocabBase"));
			const translatedWord = sanitizeCsvCell(getCell(row, "VocabDef"));
			const exampleSentenceAr =
				sanitizeCsvCell(getCell(row, "SentFull")) ||
				sanitizeCsvCell(getCell(row, "SentBase"));
			const translatedSentence = sanitizeCsvCell(getCell(row, "SentFrench"));
			const categoryRaw = sanitizeCsvCell(getCell(row, "Tags"));
			const focusRaw = sanitizeCsvCell(getCell(row, "Focus"));
			const focusParsed = Number.parseInt(focusRaw, 10);
			const focusValue = Number.isFinite(focusParsed) ? focusParsed : index + 1;

			if (!wordAr || !translatedWord) {
				return null;
			}

			return {
				frequencyRank: index + 1,
				focus: focusValue,
				wordAr,
				wordFr: translatedWord,
				exampleSentenceAr,
				exampleSentenceFr: translatedSentence,
				category: categoryRaw.length > 0 ? categoryRaw : null,
			};
		})
		.filter((card): card is Foundation2kCard => card !== null);
};

const foundation2kDeckFr = parseFoundation2kDeckCsv(foundation2kCsvRaw);
const foundation2kDeckEn = parseFoundation2kDeckCsv(foundation2kEnglishCsvRaw);

export const foundation2kDeckByLocale: Record<AppLocale, Foundation2kCard[]> = {
	fr: foundation2kDeckFr,
	en: foundation2kDeckEn,
};

export const getFoundation2kDeck = (locale: AppLocale): Foundation2kCard[] => {
	return foundation2kDeckByLocale[locale];
};

export const foundation2kDeck: Foundation2kCard[] = foundation2kDeckFr;
