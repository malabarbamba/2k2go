const HEADING_ID_CLEANUP_PATTERN = /[^a-z0-9]+/g;

const toDocsHeadingAnchorId = (value: string): string => {
	const normalized = value
		.trim()
		.toLocaleLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[’']/g, "");

	const slug = normalized
		.replace(HEADING_ID_CLEANUP_PATTERN, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+/, "")
		.replace(/-+$/, "");

	if (!slug) {
		return "section";
	}

	if (slug.startsWith("phase-0")) {
		return "phase-0";
	}

	if (slug.startsWith("phase-1")) {
		return "phase-1";
	}

	if (slug.startsWith("phase-2")) {
		return "phase-2";
	}

	if (slug.startsWith("phase-3")) {
		return "phase-3";
	}

	return slug;
};

const buildDocsHeadingAnchorIds = (values: readonly string[]): string[] => {
	const anchorOccurrencesMap = new Map<string, number>();

	return values.map((value) => {
		const anchorBase = toDocsHeadingAnchorId(value);
		const anchorCount = anchorOccurrencesMap.get(anchorBase) ?? 0;

		anchorOccurrencesMap.set(anchorBase, anchorCount + 1);

		if (anchorCount === 0) {
			return anchorBase;
		}

		return `${anchorBase}-${anchorCount + 1}`;
	});
};

export { buildDocsHeadingAnchorIds, toDocsHeadingAnchorId };
