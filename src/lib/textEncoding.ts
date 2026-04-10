const MOJIBAKE_MARKER_RE =
	/[\u00c2\u00c3\u00c4\u00c5\u00c6\u00d0\u00d1\u00e2\u0192\ufffd]/;
const UTF8_DECODER =
	typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;
const EXCEL_ESCAPED_CONTROL_RE = /_x[0-9a-fA-F]{4}_/g;

const CP1252_REVERSE_MAP: Record<number, number> = {
	8364: 0x80,
	8218: 0x82,
	402: 0x83,
	8222: 0x84,
	8230: 0x85,
	8224: 0x86,
	8225: 0x87,
	710: 0x88,
	8240: 0x89,
	352: 0x8a,
	8249: 0x8b,
	338: 0x8c,
	381: 0x8e,
	8216: 0x91,
	8217: 0x92,
	8220: 0x93,
	8221: 0x94,
	8226: 0x95,
	8211: 0x96,
	8212: 0x97,
	732: 0x98,
	8482: 0x99,
	353: 0x9a,
	8250: 0x9b,
	339: 0x9c,
	382: 0x9e,
	376: 0x9f,
};

function hasMojibakeMarkers(value: string): boolean {
	return MOJIBAKE_MARKER_RE.test(value);
}

function toSingleByte(char: string): number | null {
	const codePoint = char.codePointAt(0);
	if (codePoint == null) {
		return null;
	}

	if (codePoint <= 0xff) {
		return codePoint;
	}

	return CP1252_REVERSE_MAP[codePoint] ?? null;
}

function decodeLatin1AsUtf8(value: string): string {
	if (!UTF8_DECODER || value.length === 0) {
		return value;
	}

	const bytes: number[] = [];
	for (const char of value) {
		const byte = toSingleByte(char);
		if (byte == null) {
			return value;
		}
		bytes.push(byte);
	}

	const byteArray = Uint8Array.from(bytes);
	return UTF8_DECODER.decode(byteArray);
}

function replaceRawControlChars(value: string): string {
	let output = "";

	for (const char of value) {
		const codePoint = char.codePointAt(0);
		if (codePoint == null) {
			continue;
		}

		const isUnsafeControl =
			(codePoint < 0x20 &&
				codePoint !== 0x09 &&
				codePoint !== 0x0a &&
				codePoint !== 0x0d) ||
			codePoint === 0x7f;

		output += isUnsafeControl ? " " : char;
	}

	return output;
}

export function stripControlMarkerArtifacts(value: string): string {
	if (!value) {
		return value;
	}

	return replaceRawControlChars(value.replace(EXCEL_ESCAPED_CONTROL_RE, " "))
		.replace(/\s+/g, " ")
		.trim();
}

export function repairMojibake(value: string): string {
	if (!value || !hasMojibakeMarkers(value)) {
		return stripControlMarkerArtifacts(value);
	}

	let repaired = value;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (!hasMojibakeMarkers(repaired)) {
			break;
		}

		const decoded = decodeLatin1AsUtf8(repaired);
		if (!decoded || decoded === repaired || decoded.includes("\ufffd")) {
			break;
		}

		repaired = decoded;
	}

	return stripControlMarkerArtifacts(repaired);
}
