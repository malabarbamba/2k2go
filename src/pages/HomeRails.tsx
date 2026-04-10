import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AUDIO_FILES,
	CardBack,
	theme,
} from "@/components/deck-perso-visual/VocabCardShared";
import { getFoundation2kDeck, type Foundation2kCard } from "@/data/foundation2kDeck";
import { useAppLocale } from "@/contexts/AppLocaleContext";
import type { VocabCard } from "@/lib/deck-perso-adapters";
import { resolveFoundationDeckMedia } from "@/lib/foundationDeckMedia";

const RAIL_SIZE = 18;
const RAIL_BASE_CARD_WIDTH = 248;
const RAIL_BASE_CARD_HEIGHT = (RAIL_BASE_CARD_WIDTH * 4) / 3;
const RAIL_BASE_GAP = 20;
const RAIL_BASE_RADIUS = 36;
const RAIL_CONTENT_SCALE_RATIO = 1;
const RAIL_SCROLL_DURATION_RIGHT_S = 120;
const RAIL_SCROLL_DURATION_LEFT_S = 150;
const RAIL_HOVER_SLOWDOWN_FACTOR = 1.25;
const SHORTS_LAYOUT_BASE_WIDTH = 380;
const SHORTS_LAYOUT_BASE_HEIGHT = (SHORTS_LAYOUT_BASE_WIDTH * 16) / 9;

const clampNumber = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const getRailWordKey = (card: VocabCard): string => {
	const vocabDefKey = card.vocabDef.trim().toLowerCase();
	if (vocabDefKey.length > 0) {
		return vocabDefKey;
	}

	return card.vocabBase.trim().toLowerCase();
};

const hasAdjacentRailDuplicates = (cards: VocabCard[]): boolean => {
	for (let index = 1; index < cards.length; index += 1) {
		if (getRailWordKey(cards[index]) === getRailWordKey(cards[index - 1])) {
			return true;
		}
	}

	return false;
};

const reorderRailCardsAvoidingAdjacentDuplicates = (
	cards: VocabCard[],
): VocabCard[] => {
	if (cards.length <= 1) {
		return cards;
	}

	const ordered = [...cards];

	for (let index = 1; index < ordered.length; index += 1) {
		const previousKey = getRailWordKey(ordered[index - 1]);
		const currentKey = getRailWordKey(ordered[index]);

		if (currentKey !== previousKey) {
			continue;
		}

		let swapIndex = -1;
		for (
			let candidateIndex = index + 1;
			candidateIndex < ordered.length;
			candidateIndex += 1
		) {
			if (getRailWordKey(ordered[candidateIndex]) !== previousKey) {
				swapIndex = candidateIndex;
				break;
			}
		}

		if (swapIndex === -1) {
			continue;
		}

		const [replacement] = ordered.splice(swapIndex, 1);
		ordered.splice(index, 0, replacement);
	}

	if (
		getRailWordKey(ordered[0]) !== getRailWordKey(ordered[ordered.length - 1])
	) {
		return ordered;
	}

	for (let rotation = 1; rotation < ordered.length; rotation += 1) {
		const rotated = [...ordered.slice(rotation), ...ordered.slice(0, rotation)];
		if (
			getRailWordKey(rotated[0]) === getRailWordKey(rotated[rotated.length - 1])
		) {
			continue;
		}
		if (!hasAdjacentRailDuplicates(rotated)) {
			return rotated;
		}
	}

	return ordered;
};

const buildRailCard = (
	card: Foundation2kCard,
	index: number,
): VocabCard => {
	const sentence = card.exampleSentenceAr || card.wordAr;
	const media = resolveFoundationDeckMedia(card.wordAr, card.wordAr, sentence);

	return {
		id: `foundation-${index}`,
		focus: String(card.focus),
		tags: card.category ? [card.category] : ["foundation"],
		sentBase: sentence,
		sentFull: sentence,
		sentFrench: card.exampleSentenceFr || card.wordFr,
		vocabBase: card.wordAr,
		vocabFull: card.wordAr,
		vocabDef: card.wordFr,
		image: media.imageUrl,
		vocabAudioUrl: media.vocabAudioUrl,
		sentenceAudioUrl: media.sentenceAudioUrl,
	};
};

export default function HomeRails() {
	const { locale } = useAppLocale();
	const foundationDeck = useMemo(() => getFoundation2kDeck(locale), [locale]);

	const railContainerRefs = useRef<Record<"left" | "right", HTMLDivElement | null>>({
		left: null,
		right: null,
	});
	const railTrackRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const railAnimationsRef = useRef<Record<string, Animation>>({});
	const [viewport, setViewport] = useState<{ width: number; height: number }>(
		() => ({
			width: typeof window === "undefined" ? 1440 : window.innerWidth,
			height: typeof window === "undefined" ? 900 : window.innerHeight,
		}),
	);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const updateViewport = () => {
			setViewport({ width: window.innerWidth, height: window.innerHeight });
		};

		window.addEventListener("resize", updateViewport);

		return () => {
			window.removeEventListener("resize", updateViewport);
		};
	}, []);

	const railScale = useMemo(() => {
		const widthFactor = viewport.width / 1440;
		const heightFactor = viewport.height / 900;
		const nextScale = Math.min(widthFactor, heightFactor) * 0.98;
		return Math.max(0.58, Math.min(0.9, nextScale));
	}, [viewport.height, viewport.width]);

	const railContentScale = useMemo(() => {
		const nextScale = railScale * RAIL_CONTENT_SCALE_RATIO;
		return Math.max(0.58, Math.min(1.04, nextScale));
	}, [railScale]);

	const railCardWidth = Math.round(RAIL_BASE_CARD_WIDTH * railScale);
	const railCardHeight = Math.round(RAIL_BASE_CARD_HEIGHT * railScale);
	const railGap = Math.max(12, Math.round(RAIL_BASE_GAP * railScale));
	const railRadius = Math.round(RAIL_BASE_RADIUS * railScale);
	const railWidth = railCardWidth + 16;
	const railBackLayoutMetrics = useMemo(() => {
		const rawScale = Math.min(
			RAIL_BASE_CARD_WIDTH / SHORTS_LAYOUT_BASE_WIDTH,
			RAIL_BASE_CARD_HEIGHT / SHORTS_LAYOUT_BASE_HEIGHT,
		);
		const scale = clampNumber(rawScale, 0.74, 1);

		return {
			scale,
			lineHeightScale: clampNumber(scale * 0.84, 0.75, 1),
			paddingScale: clampNumber(scale * 0.9, 0.78, 1),
			buttonScale: clampNumber(scale * 0.94, 0.82, 1),
			frenchScale: clampNumber(scale * 0.96, 0.84, 1),
			arabicScale: clampNumber(scale * 0.985, 0.88, 1),
		};
	}, []);

	const railCards = useMemo(
		() =>
			reorderRailCardsAvoidingAdjacentDuplicates(
				foundationDeck
					.slice(0, RAIL_SIZE)
					.map(buildRailCard)
					.filter(
						(card) => typeof card.image === "string" && card.image.length > 0,
					),
			),
		[foundationDeck],
	);

	const rightRailCards = useMemo(() => {
		if (railCards.length <= 1) {
			return railCards;
		}

		const reversed = [...railCards].reverse();
		const offset = Math.max(1, Math.floor(reversed.length / 3));
		return reorderRailCardsAvoidingAdjacentDuplicates([
			...reversed.slice(offset),
			...reversed.slice(0, offset),
		]);
	}, [railCards]);

	const setRailPlaybackRate = useCallback(
		(side: "left" | "right", rate: number): void => {
			(["a", "b"] as const).forEach((trackKey) => {
				const animation = railAnimationsRef.current[`${side}-${trackKey}`];
				if (animation) {
					animation.playbackRate = rate;
				}
			});
		},
		[],
	);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const cleanupCallbacks: Array<() => void> = [];

		(["left", "right"] as const).forEach((side) => {
			const railNode = railContainerRefs.current[side];
			if (!railNode) {
				return;
			}

			const handlePointerEnter = () => {
				setRailPlaybackRate(side, 1 / RAIL_HOVER_SLOWDOWN_FACTOR);
			};
			const handlePointerLeave = () => {
				setRailPlaybackRate(side, 1);
			};

			railNode.addEventListener("pointerenter", handlePointerEnter);
			railNode.addEventListener("pointerleave", handlePointerLeave);

			cleanupCallbacks.push(() => {
				railNode.removeEventListener("pointerenter", handlePointerEnter);
				railNode.removeEventListener("pointerleave", handlePointerLeave);
			});
		});

		return () => {
			cleanupCallbacks.forEach((cleanup) => {
				cleanup();
			});
		};
	}, [setRailPlaybackRate]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const nextAnimations: Record<string, Animation> = {};

		(["left", "right"] as const).forEach((side) => {
			const durationMs =
				(side === "left"
					? RAIL_SCROLL_DURATION_LEFT_S
					: RAIL_SCROLL_DURATION_RIGHT_S) * 1000;
			const isMovingUp = side === "right";

			(["a", "b"] as const).forEach((trackKey) => {
				const trackId = `${side}-${trackKey}`;
				const node = railTrackRefs.current[trackId];
				if (!node) {
					return;
				}

				const fromTransform =
					trackKey === "a"
						? isMovingUp
							? "translate3d(0, 100%, 0)"
							: "translate3d(0, -100%, 0)"
						: "translate3d(0, 0, 0)";
				const toTransform =
					trackKey === "a"
						? "translate3d(0, 0, 0)"
						: isMovingUp
							? "translate3d(0, -100%, 0)"
							: "translate3d(0, 100%, 0)";

				const animation = node.animate(
					[{ transform: fromTransform }, { transform: toTransform }],
					{
						duration: durationMs,
						iterations: Number.POSITIVE_INFINITY,
						easing: "linear",
						fill: "both",
					},
				);

				nextAnimations[trackId] = animation;
			});
		});

		railAnimationsRef.current = nextAnimations;

		return () => {
			Object.values(nextAnimations).forEach((animation) => {
				animation.cancel();
			});
			railAnimationsRef.current = {};
		};
	}, []);

	return (
		<>
			<style>
				{`
          .home-v2-rail {
            position: fixed;
            top: 0;
            bottom: 0;
            width: ${railWidth}px;
            overflow: hidden;
            pointer-events: auto;
            opacity: 0.9;
            z-index: 1;
            mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
            -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%);
            contain: layout paint style;
          }

          .home-v2-rail-left {
            left: 14px;
          }

          .home-v2-rail-right {
            right: 14px;
          }

          .home-v2-rail-track {
            position: absolute;
            top: 0;
            left: 0;
            display: flex;
            flex-direction: column;
            gap: ${railGap}px;
            width: 100%;
            padding-top: 8px;
            padding-bottom: 8px;
            padding-left: 8px;
            padding-right: 8px;
            box-sizing: border-box;
            will-change: transform;
          }

          .home-v2-rail-card-slot {
            width: ${railCardWidth}px;
            height: ${railCardHeight}px;
            overflow: hidden;
            border-radius: ${railRadius}px;
            position: relative;
            box-shadow: 0 4px 12px -10px rgba(0, 0, 0, 0.42);
          }

          .home-v2-rail-card-scale-wrap {
            position: absolute;
            top: 0;
            left: 50%;
            width: ${RAIL_BASE_CARD_WIDTH}px;
            height: ${RAIL_BASE_CARD_HEIGHT}px;
            transform-origin: top center;
          }

          .home-v2-rail [data-testid="shorts-back-content"] {
            overflow: hidden !important;
            scrollbar-width: none !important;
            padding-top: 8px !important;
            padding-bottom: 8px !important;
          }

          .home-v2-rail [data-testid="shorts-back-content"]::-webkit-scrollbar {
            display: none !important;
          }

          .home-v2-rail .sent-center {
            margin-bottom: 4px !important;
            padding-top: 2px !important;
          }

          .home-v2-rail [data-testid="shorts-back-content"] > div > .mt-2,
          .home-v2-rail [data-testid="shorts-back-content"] > div > .mt-3,
          .home-v2-rail [data-testid="shorts-back-content"] > div > .mt-1 {
            margin-top: 2px !important;
          }

          .home-v2-rail .rounded-xl {
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            min-height: 0 !important;
          }

          .home-v2-rail .rounded-xl > .flex.h-full.w-full.items-center.justify-center.p-2 {
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
          }

          @media (max-width: 1024px) {
            .home-v2-rail {
              display: none;
            }
          }
        `}
			</style>

			{(["left", "right"] as const).map((side) => {
				const cardsForSide = side === "left" ? railCards : rightRailCards;

				return (
					<div
						key={side}
						className={`home-v2-rail home-v2-rail-${side}`}
						ref={(node) => {
							railContainerRefs.current[side] = node;
						}}
					>
						{(["a", "b"] as const).map((trackKey) => (
							<div
								key={`${side}-${trackKey}`}
								className="home-v2-rail-track"
								ref={(node) => {
									railTrackRefs.current[`${side}-${trackKey}`] = node;
								}}
								style={{
									transform:
										trackKey === "a"
											? side === "right"
												? "translate3d(0, 100%, 0)"
												: "translate3d(0, -100%, 0)"
											: "translate3d(0, 0, 0)",
								}}
							>
								{cardsForSide.map((card, index) => {
									const shouldPrioritizeImage = trackKey === "b" && index < 3;

									return (
										<div
											key={`${side}-${trackKey}-${String(card.id)}-${index}`}
											className="home-v2-rail-card-slot"
										>
											<div
												className="home-v2-rail-card-scale-wrap"
												style={{
													transform: `translateX(-50%) scale(${railContentScale})`,
												}}
											>
												<div
													style={{
														position: "relative",
														width: "100%",
														height: "100%",
														background: theme.backgroundWrap,
														border: `1px solid ${theme.borderWrap}`,
														boxShadow: "0 6px 14px -12px rgba(0,0,0,0.42)",
														borderRadius: "36px",
														overflow: "hidden",
													}}
												>
													<CardBack
														card={card}
														isFlipped
														showVowels
														onToggleVowels={() => {}}
														onFlip={() => {}}
														audioUrls={AUDIO_FILES}
														isLoadingAudio={false}
														flipKey={index}
														showImage
														imageLoading={shouldPrioritizeImage ? "eager" : "lazy"}
														onVocabAudioMouseMove={() => {}}
														onVocabAudioMouseLeave={() => {}}
														onSentenceAudioMouseMove={() => {}}
														onSentenceAudioMouseLeave={() => {}}
														variant="shorts"
														layoutMetrics={railBackLayoutMetrics}
														showSourceChip={false}
														imageSize="review"
														hideShortsUtilityControls
														hideShortsActionZone
														muteFlipAudio
													/>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						))}
					</div>
				);
			})}
		</>
	);
}
