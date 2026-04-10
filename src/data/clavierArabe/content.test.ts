import { describe, expect, it } from "vitest";

import {
	CLAVIER_ARABE_ACTIONS,
	CLAVIER_ARABE_AUTOCOMPLETE_SEEDS,
	CLAVIER_ARABE_AUTOCOMPLETE_SOURCE,
	CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS,
	CLAVIER_ARABE_COLOR_TOKENS,
	CLAVIER_ARABE_FAQ_ITEMS,
	CLAVIER_ARABE_LAYOUT_ORDER,
	CLAVIER_ARABE_LAYOUTS,
	CLAVIER_ARABE_QUICK_PHRASE_GROUPS,
	CLAVIER_ARABE_SOUND_STRINGS,
	CLAVIER_ARABE_TRUST_COPY,
	CLAVIER_ARABE_TYPOGRAPHY_TOKENS,
} from "@/data/clavierArabe";

describe("clavier arabe data modules", () => {
	it("locks the canonical public labels", () => {
		expect(CLAVIER_ARABE_CANONICAL_PUBLIC_LABELS).toEqual({
			pageTitle: "Clavier arabe en ligne",
			copyText: "Copier le texte",
			downloadText: "Télécharger en .txt",
			translateToArabic: "Traduire en arabe",
			correctText: "Corriger",
			convertArabizi: "Convertir Arabizi",
			addDiacritics: "Ajouter les voyelles",
			aiAssistant: "Assistant IA",
			copyResult: "Copier le résultat",
			replaceText: "Remplacer le texte",
		});
	});

	it("defines two layouts with a visible shared diacritics row", () => {
		expect(CLAVIER_ARABE_LAYOUT_ORDER).toEqual(["azerty", "qwerty"]);
		expect(Object.keys(CLAVIER_ARABE_LAYOUTS)).toEqual(["azerty", "qwerty"]);

		for (const layoutId of CLAVIER_ARABE_LAYOUT_ORDER) {
			const layout = CLAVIER_ARABE_LAYOUTS[layoutId];
			expect(layout.id).toBe(layoutId);
			expect(layout.diacriticsRow.keys.map((key) => key.arabic)).toEqual([
				"َ",
				"ً",
				"ُ",
				"ٌ",
				"ِ",
				"ٍ",
				"ّ",
				"ْ",
				"ٰ",
				"ٖ",
				"ٗ",
			]);
			expect(layout.rows.length).toBeGreaterThanOrEqual(3);
		}
	});

	it("keeps required quick phrase groups and phrase variants", () => {
		expect(
			CLAVIER_ARABE_QUICK_PHRASE_GROUPS.map((group) => group.label),
		).toEqual(["salutations", "quotidien", "messagerie", "formules utiles"]);

		for (const group of CLAVIER_ARABE_QUICK_PHRASE_GROUPS) {
			expect(group.phrases.length).toBeGreaterThan(0);
			expect(group.phrases.some((phrase) => phrase.variants.length > 0)).toBe(
				true,
			);
		}
	});

	it("keeps local, auth-free autocomplete seeds", () => {
		expect(CLAVIER_ARABE_AUTOCOMPLETE_SOURCE).toEqual({
			mode: "local-only",
			authRequired: false,
			label: "Suggestions locales",
		});
		expect(CLAVIER_ARABE_AUTOCOMPLETE_SEEDS.length).toBeGreaterThanOrEqual(10);
		expect(
			CLAVIER_ARABE_AUTOCOMPLETE_SEEDS.every((seed) => seed.localOnly),
		).toBe(true);
	});

	it("locks the required design tokens and sound label", () => {
		expect(CLAVIER_ARABE_COLOR_TOKENS.arabicKeyColor).toBe("#C1121F");
		expect(CLAVIER_ARABE_COLOR_TOKENS.interactionAccent).toBe("#dbeafe");
		expect(CLAVIER_ARABE_TYPOGRAPHY_TOKENS.arabicKeyFont).toBe(
			"IBM Plex Sans Arabic",
		);
		expect(CLAVIER_ARABE_TYPOGRAPHY_TOKENS.textareaFont).toBe(
			"Noto Naskh Arabic",
		);
		expect(CLAVIER_ARABE_SOUND_STRINGS.toggleLabel).toBe(
			"Activer les sons de clavier ?",
		);
	});

	it("keeps actions, FAQ, and trust copy centralized", () => {
		expect(CLAVIER_ARABE_ACTIONS).toHaveLength(9);
		expect(CLAVIER_ARABE_ACTIONS.map((action) => action.label)).toEqual([
			"Copier le texte",
			"Télécharger en .txt",
			"Traduire en arabe",
			"Corriger",
			"Convertir Arabizi",
			"Ajouter les voyelles",
			"Assistant IA",
			"Copier le résultat",
			"Remplacer le texte",
		]);
		expect(CLAVIER_ARABE_FAQ_ITEMS).toHaveLength(4);
		expect(CLAVIER_ARABE_TRUST_COPY.localFirstTitle).toBe("Confidentialité");
	});
});
