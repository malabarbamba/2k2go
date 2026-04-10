import foundationDeckCsvRaw from "@/assets/deck-fondations-2k/Fondations-2k.csv?raw";
import { stripControlMarkerArtifacts } from "@/lib/textEncoding";

type FoundationMedia = {
	imageUrl?: string;
	sentenceAudioUrl?: string;
	vocabAudioUrl?: string;
};

type FoundationMediaRecord = {
	vocabFull: string;
	vocabBase: string;
	sentFull: string;
	sentBase: string;
	sentAudioFileName: string | null;
	vocabAudioFileName: string | null;
	imageFileName: string | null;
};

const FOUNDATION_MEDIA_FILES = import.meta.glob(
	"../assets/deck-fondations-2k/collection.media/*.{avif,mp3}",
	{
		eager: true,
		import: "default",
	},
) as Record<string, string>;

const mediaUrlByFileName = new Map<string, string>();
Object.entries(FOUNDATION_MEDIA_FILES).forEach(([filePath, fileUrl]) => {
	const fileName = filePath.split("/").pop();
	if (!fileName) {
		return;
	}
	mediaUrlByFileName.set(fileName, fileUrl);
});

function stripHarakat(input: string): string {
	return stripControlMarkerArtifacts(input)
		.replace(/<[^>]*>/g, "")
		.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
		.replace(/ـ/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function parseSemicolonCsv(raw: string): string[][] {
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
}

function extractSoundFileName(value: string): string | null {
	const match = value.match(/\[sound:([^\]]+)\]/i);
	return match?.[1]?.trim() ?? null;
}

function extractImageFileName(value: string): string | null {
	const normalized = value.replace(/""/g, '"').trim();
	const match = normalized.match(/src\s*=\s*"([^"]+)"/i);
	if (match?.[1]) {
		return match[1].trim();
	}
	return null;
}

function stripExtension(fileName: string): string {
	return fileName.replace(/\.[^/.]+$/, "");
}

function firstAvailableMediaUrl(
	fileNames: Array<string | null | undefined>,
): string | undefined {
	for (const fileName of fileNames) {
		if (!fileName) {
			continue;
		}
		const mediaUrl = mediaUrlByFileName.get(fileName);
		if (mediaUrl) {
			return mediaUrl;
		}
	}
	return undefined;
}

function resolveVocabAudioUrl(
	record: FoundationMediaRecord,
): string | undefined {
	const imageStem = record.imageFileName
		? stripExtension(record.imageFileName)
		: null;
	return firstAvailableMediaUrl([
		imageStem ? `${imageStem}_vocabBase.mp3` : null,
		record.vocabAudioFileName,
		imageStem ? `${imageStem}_vocabDef.mp3` : null,
	]);
}

function resolveSentenceAudioUrl(
	record: FoundationMediaRecord,
): string | undefined {
	const imageStem = record.imageFileName
		? stripExtension(record.imageFileName)
		: null;
	return firstAvailableMediaUrl([
		imageStem ? `${imageStem}_sentBase.mp3` : null,
		record.sentAudioFileName,
		imageStem ? `${imageStem}_sentFull.mp3` : null,
	]);
}

function buildFoundationMediaRecords(): FoundationMediaRecord[] {
	const parsedRows = parseSemicolonCsv(foundationDeckCsvRaw);
	const [headerRow, ...dataRows] = parsedRows;

	if (!headerRow) {
		return [];
	}

	const headerIndexByName = new Map<string, number>();
	headerRow.forEach((column, index) => {
		headerIndexByName.set(column.trim(), index);
	});

	const getCell = (row: string[], columnName: string): string => {
		const index = headerIndexByName.get(columnName);
		if (index == null || index < 0 || index >= row.length) {
			return "";
		}
		return row[index] ?? "";
	};

	return dataRows
		.map((row) => {
			const vocabFull = getCell(row, "VocabFull").trim();
			const vocabBase = getCell(row, "VocabBase").trim();
			const sentFull = getCell(row, "SentFull").trim();
			const sentBase = getCell(row, "SentBase").trim();
			return {
				vocabFull,
				vocabBase,
				sentFull,
				sentBase,
				sentAudioFileName: extractSoundFileName(getCell(row, "SentAudio")),
				vocabAudioFileName: extractSoundFileName(getCell(row, "VocabAudio")),
				imageFileName: extractImageFileName(getCell(row, "Image")),
			};
		})
		.filter((record) => Boolean(record.vocabFull || record.vocabBase));
}

const foundationMediaByNormalizedWord = new Map<string, FoundationMedia>();
const foundationMediaByNormalizedSentence = new Map<string, FoundationMedia>();

for (const record of buildFoundationMediaRecords()) {
	const media: FoundationMedia = {
		imageUrl: record.imageFileName
			? mediaUrlByFileName.get(record.imageFileName)
			: undefined,
		sentenceAudioUrl: resolveSentenceAudioUrl(record),
		vocabAudioUrl: resolveVocabAudioUrl(record),
	};

	const keys = [record.vocabFull, record.vocabBase]
		.map(stripHarakat)
		.filter((key) => key.length > 0);
	const sentenceKeys = [record.sentFull, record.sentBase]
		.map(stripHarakat)
		.filter((key) => key.length > 0);

	for (const key of sentenceKeys) {
		if (!foundationMediaByNormalizedSentence.has(key)) {
			foundationMediaByNormalizedSentence.set(key, media);
		}
	}

	for (const key of keys) {
		if (!foundationMediaByNormalizedWord.has(key)) {
			foundationMediaByNormalizedWord.set(key, media);
		}
	}
}

export function resolveFoundationDeckMedia(
	vocabFull: string | null | undefined,
	vocabBase: string | null | undefined,
	sentence: string | null | undefined,
): FoundationMedia {
	const sentenceKeys = [sentence ?? ""]
		.map(stripHarakat)
		.filter((key) => key.length > 0);

	for (const key of sentenceKeys) {
		const media = foundationMediaByNormalizedSentence.get(key);
		if (media) {
			return media;
		}
	}

	const candidateKeys = [vocabFull ?? "", vocabBase ?? ""]
		.map(stripHarakat)
		.filter((key) => key.length > 0);

	for (const key of candidateKeys) {
		const media = foundationMediaByNormalizedWord.get(key);
		if (media) {
			return media;
		}
	}

	return {};
}
