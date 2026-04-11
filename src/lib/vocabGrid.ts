export type VocabUnit = {
  id?: string;
  word: string;
  seenCount: number;
  unseenCount: number;
  avgInterval: number;
  score: number;
  color: string;
  vocabBase?: string;
  vocabFull?: string;
  category?: string;
  summary?: string;
};

export type VocabSummary = {
  total: number;
  known: number;
  knownPercent: number;
};

export type VocabGridData = {
  units: VocabUnit[];
  summary: VocabSummary;
};

export type VocabGrouping = {
  version: number;
  name: string;
  lang: string;
  source: string;
  leftover_group: string;
  groups: Array<{ name: string; characters?: string; words?: string[] }>;
};

export type VocabCard = {
  fields: Record<string, string>;
  reviewed: boolean;
  interval: number;
};

export const DEFAULT_FIELDS = ["vocabFull", "sentFull", "vocabBase", "sentBase"] as const;

// Kanji Grid gradient colors (26 colors from red to green)
export const DEFAULT_GRADIENT = [
  "#e62e2e", "#e6442e", "#e65a2e", "#e6702e", "#e6872e", "#e69d2e",
  "#e6b32e", "#e6c92e", "#e6df2e", "#d8e62e", "#c2e62e", "#abe62e",
  "#95e62e", "#7fe62e", "#69e62e", "#53e62e", "#3de62e", "#2ee635",
  "#2ee64c", "#2ee662", "#2ee678", "#2ee68e", "#2ee6a4", "#2ee6ba",
  "#2ee6d0", "#2ee6e6",
];

export const DEFAULT_UNSEEN_COLOR = "#ffffff";

export const DEFAULT_INTERVAL_TARGET = 21;

const ARABIC_WORD_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g;

export const scoreAdjust = (score: number) => {
  const adjusted = score + 1;
  return 1 - 1 / (adjusted * adjusted);
};

export const getGradientColorHex = (score: number, gradientColors: string[]) => {
  const maxIndex = gradientColors.length - 1;
  const startIndex = Math.max(0, Math.min(maxIndex, Math.floor(score * maxIndex)));
  const endIndex = Math.min(startIndex + 1, maxIndex);
  const startColor = gradientColors[startIndex];
  const endColor = gradientColors[endIndex];
  const percent = score * maxIndex - startIndex;

  const toRgb = (hex: string) => {
    const cleaned = hex.replace("#", "");
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  };

  const [r1, g1, b1] = toRgb(startColor);
  const [r2, g2, b2] = toRgb(endColor);
  const r = Math.round(r1 + (r2 - r1) * percent);
  const g = Math.round(g1 + (g2 - g1) * percent);
  const b = Math.round(b1 + (b2 - b1) * percent);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

export const extractArabicWords = (text: string) => {
  if (!text) return [];
  const matches = text.match(ARABIC_WORD_RE) ?? [];
  return matches.map((word) => word.replace(/ـ/g, "")).filter(Boolean);
};

export const buildVocabGridData = (
  cards: VocabCard[],
  fields: string[] = DEFAULT_FIELDS as unknown as string[],
  options?: {
    intervalTarget?: number;
    gradient?: string[];
    unseenColor?: string;
  }
): VocabGridData => {
  const intervalTarget = options?.intervalTarget ?? DEFAULT_INTERVAL_TARGET;
  const gradient = options?.gradient ?? DEFAULT_GRADIENT;
  const unseenColor = options?.unseenColor ?? DEFAULT_UNSEEN_COLOR;

  const unitsMap = new Map<string, { seenCount: number; unseenCount: number; avgInterval: number }>();

  cards.forEach((card) => {
    const text = fields.map((field) => card.fields[field] ?? "").join(" ");
    const words = Array.from(new Set(extractArabicWords(text)));
    words.forEach((word) => {
      const existing = unitsMap.get(word) ?? { seenCount: 0, unseenCount: 0, avgInterval: 0 };
      if (card.reviewed) {
        const nextTotal = existing.avgInterval * existing.seenCount + card.interval;
        const nextSeen = existing.seenCount + 1;
        unitsMap.set(word, {
          seenCount: nextSeen,
          unseenCount: existing.unseenCount,
          avgInterval: nextTotal / nextSeen,
        });
      } else {
        unitsMap.set(word, {
          seenCount: existing.seenCount,
          unseenCount: existing.unseenCount + 1,
          avgInterval: existing.avgInterval,
        });
      }
    });
  });

  const units: VocabUnit[] = Array.from(unitsMap.entries()).map(([word, data]) => {
    const score = data.seenCount > 0 ? scoreAdjust(data.avgInterval / intervalTarget) : 0;
    const color = data.seenCount > 0 ? getGradientColorHex(score, gradient) : unseenColor;
    return {
      word,
      seenCount: data.seenCount,
      unseenCount: data.unseenCount,
      avgInterval: data.avgInterval,
      score,
      color,
    };
  });

  const total = units.length;
  const known = units.filter((unit) => unit.seenCount > 0).length;
  const knownPercent = total === 0 ? 0 : Math.round((known / total) * 1000) / 10;

  return {
    units,
    summary: {
      total,
      known,
      knownPercent,
    },
  };
};

export const buildPreviewVocabGrid = (cards: Array<Record<string, string>>) => {
  const previewCards: VocabCard[] = cards.map((card, index) => {
    const seed = Object.values(card).join(" ") + index.toString();
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
    }
    const reviewed = hash % 3 !== 0;
    const interval = (hash % 25) + 1;
    return {
      fields: card,
      reviewed,
      interval,
    };
  });

  return buildVocabGridData(previewCards);
};
