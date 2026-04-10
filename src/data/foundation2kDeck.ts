import foundation2kCsvRaw from "@/assets/deck-fondations-2k/Fondations-2k.csv?raw";
import { stripControlMarkerArtifacts } from "@/lib/textEncoding";

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

const csvRows = parseSemicolonCsv(foundation2kCsvRaw);

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

export const foundation2kDeck: Foundation2kCard[] = dataRows
	.map((row, index) => {
		const wordAr =
			sanitizeCsvCell(getCell(row, "VocabFull")) ||
			sanitizeCsvCell(getCell(row, "VocabBase"));
		const wordFr = sanitizeCsvCell(getCell(row, "VocabDef"));
		const exampleSentenceAr =
			sanitizeCsvCell(getCell(row, "SentFull")) ||
			sanitizeCsvCell(getCell(row, "SentBase"));
		const exampleSentenceFr = sanitizeCsvCell(getCell(row, "SentFrench"));
		const categoryRaw = sanitizeCsvCell(getCell(row, "Tags"));
		const focusRaw = sanitizeCsvCell(getCell(row, "Focus"));
		const focusParsed = Number.parseInt(focusRaw, 10);
		const focusValue = Number.isFinite(focusParsed) ? focusParsed : index + 1;

		if (!wordAr || !wordFr) {
			return null;
		}

		return {
			frequencyRank: index + 1,
			focus: focusValue,
			wordAr,
			wordFr,
			exampleSentenceAr,
			exampleSentenceFr,
			category: categoryRaw.length > 0 ? categoryRaw : null,
		};
	})
	.filter((card): card is Foundation2kCard => card !== null);
