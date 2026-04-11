export interface SubtitleWord {
	index?: number;
	i?: number;
	text?: string;
	diacritized_text?: string;
	diacritization_confidence?: number;
	start?: number;
	end?: number;
	pos?: string | null;
	fr_tokens?: string | string[] | null;
	translation_status?: string | null;
	translationStatus?: string | null;
	lexicon_entry_id?: string | number | null;
	lexiconEntryId?: string | number | null;
	highlight_source?: string | null;
}

export interface SubtitleCue {
	id?: number;
	cue_id?: number;
	start?: number;
	end?: number;
	text?: string;
	text_ar?: string;
	diacritized_text?: string;
	diacritization_confidence?: number;
	words?: SubtitleWord[];
}

export interface SubtitlePayload {
	version?: string;
	generated_at?: string;
	source?: string;
	cues?: SubtitleCue[];
	meta?: Record<string, unknown>;
}

export interface Video {
	videoId: string;
	title: string;
	titleFr?: string | null;
	published: string;
	channelName: string;
	thumbnail: string;
	durationSeconds?: number | null;
	isShort?: boolean;
	category?: string;
	categorySlug?: string;
	level?: string | null;
	description?: string | null;
	previewSubtitleFrench?: string;
	youtubeId?: string;
	videoUrl?: string;
	sourcePageUrl?: string;
	hasSubtitles?: boolean;
	hasArabicSubtitles?: boolean;
	hasFrenchSubtitles?: boolean;
	comprehensionPercentage?: number | null;
	subtitlesAr?: SubtitlePayload | null;
	subtitlesFr?: SubtitlePayload | null;
	transcriptionStatus?: string | null;
	cardsGenerated?: boolean;
	layoutOrder?: number | null;
}
