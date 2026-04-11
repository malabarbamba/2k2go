import coupDenvoiIcon from "@/assets/badges-accompishlemnts-icons/1_whistle.png";
import chaudChipotleIcon from "@/assets/badges-accompishlemnts-icons/2_chipotle.png";
import collecteurIcon from "@/assets/badges-accompishlemnts-icons/3_cards collection.png";
import cadorIcon from "@/assets/badges-accompishlemnts-icons/4_cador.png";
import ramadanPlayerIcon from "@/assets/badges-accompishlemnts-icons/5_ramadan.png";

export type DistinctionId =
	| "coup-denvoi"
	| "chaud-chipotle"
	| "collecteur"
	| "cador"
	| "ramadan-player";

export interface DistinctionDefinition {
	id: DistinctionId;
	name: string;
	description: string;
	iconSrc: string;
}

export const DISTINCTIONS: DistinctionDefinition[] = [
	{
		id: "coup-denvoi",
		name: "Coup d'envoi",
		description: "A valide l'etape 1 sur la page Mon parcours.",
		iconSrc: coupDenvoiIcon,
	},
	{
		id: "chaud-chipotle",
		name: "Chaud harr",
		description:
			"A maintenu une série de revues pendant au moins 10 jours sans manquer une journée.",
		iconSrc: chaudChipotleIcon,
	},
	{
		id: "collecteur",
		name: "Collecteur",
		description:
			"A revu au moins 10 cartes parmi les cartes qu'il a collecté sur les vidéos.",
		iconSrc: collecteurIcon,
	},
	{
		id: "cador",
		name: "Cador",
		description:
			"Tu n’as pas gardé cette pépite pour apprendre l'arabe que pour toi : un camarade s’est lancé grâce à ton partage et a tenu 3 jours d’affilée.",
		iconSrc: cadorIcon,
	},
	{
		id: "ramadan-player",
		name: "Ramadan Player",
		description:
			"A fait ses revues pendant le Ramadan (distinction spéciale disponible uniquement pendant le mois de Ramadan).",
		iconSrc: ramadanPlayerIcon,
	},
];

export const DISTINCTION_IDS: DistinctionId[] = DISTINCTIONS.map(
	({ id }) => id,
);
