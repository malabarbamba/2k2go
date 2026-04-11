import { resolveProfileAvatarSeed } from "@/lib/profileIdentity";
import type { FriendListItem } from "@/services/friendsService";
import type { PreviewReviewCard } from "./types";

const PREVIEW_NEW_CONCEPT_BASE_PATH = "/app";
const PREVIEW_PROFILE_PATH_SEGMENT = "profil";

export function resolveReviewActionHints(card: PreviewReviewCard | null): {
	fail: string;
	pass: string;
} {
	if (!card) {
		return { fail: "10 min", pass: "1 j" };
	}

	const normalizedStatus = card.status?.toLowerCase();
	if (normalizedStatus === "new") {
		return { fail: "10 min", pass: "1 j" };
	}
	if (normalizedStatus === "learning") {
		return { fail: "10 min", pass: "2 j" };
	}

	return { fail: "10 min", pass: "3+ j" };
}

export function renderHighlightedText(text: string, highlight?: string) {
	if (!highlight) {
		return text;
	}

	const highlightIndex = text.indexOf(highlight);
	if (highlightIndex < 0) {
		return text;
	}

	return (
		<>
			{text.slice(0, highlightIndex)}
			<span className="font-semibold text-foreground">{highlight}</span>
			{text.slice(highlightIndex + highlight.length)}
		</>
	);
}

export function getFriendDisplayName(friend: FriendListItem) {
	const fullName = [friend.firstName, friend.lastName]
		.filter(Boolean)
		.join(" ")
		.trim();

	if (fullName) {
		return fullName;
	}

	if (friend.username) {
		return `@${friend.username}`;
	}

	return "Camarade 2k2go";
}

export function getFriendInitials(friend: FriendListItem) {
	const displayName = getFriendDisplayName(friend).replace(/^@/, "").trim();
	const parts = displayName.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "C2";
	}

	return parts
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("");
}

export function getFriendAvatarSeed(friend: FriendListItem) {
	const displayName = getFriendDisplayName(friend).replace(/^@/, "").trim();

	return resolveProfileAvatarSeed({
		username: friend.username,
		email: friend.email,
		displayName,
		userId: friend.userId,
	});
}

export function getFriendPrimaryName(friend: FriendListItem) {
	const firstName = friend.firstName?.trim();
	if (firstName) {
		return firstName;
	}

	const displayName = getFriendDisplayName(friend).replace(/^@/, "").trim();
	const [primaryName] = displayName.split(/\s+/).filter(Boolean);
	return primaryName || "Camarade";
}

export function buildPreviewProfilePath(
	username: string | null | undefined,
	basePath: string = PREVIEW_NEW_CONCEPT_BASE_PATH,
): string {
	const normalizedBasePath = basePath.trim() || PREVIEW_NEW_CONCEPT_BASE_PATH;
	const normalizedUsername = username?.trim();
	if (!normalizedUsername) {
		return `${normalizedBasePath}/${PREVIEW_PROFILE_PATH_SEGMENT}`;
	}

	return `${normalizedBasePath}/${PREVIEW_PROFILE_PATH_SEGMENT}/${encodeURIComponent(normalizedUsername)}`;
}

export function formatConnectionDate(connectedAt?: string | null) {
	if (!connectedAt) {
		return null;
	}

	const parsed = new Date(connectedAt);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed.toLocaleDateString("fr-FR", {
		day: "numeric",
		month: "short",
	});
}

function capitalizeFirstLetter(value: string) {
	if (!value) {
		return value;
	}

	return value[0].toUpperCase() + value.slice(1);
}

export function formatPreviewCompletionStatus(
	createdAt?: string | null,
	referenceDate: Date = new Date(),
) {
	if (!createdAt) {
		return null;
	}

	const parsed = new Date(createdAt);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	const diffMs = Math.max(0, referenceDate.getTime() - parsed.getTime());
	const diffSeconds = Math.floor(diffMs / 1000);
	if (diffSeconds < 60) {
		return `fait il y a ${diffSeconds} sec`;
	}

	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) {
		return `fait il y a ${diffMinutes} min`;
	}

	const diffHours = Math.floor(diffMinutes / 60);
	return `fait il y a ${diffHours} h`;
}

export function formatPreviewNotificationTime(createdAt?: string | null) {
	if (!createdAt) {
		return "Maintenant";
	}

	const parsed = new Date(createdAt);
	if (Number.isNaN(parsed.getTime())) {
		return "Maintenant";
	}

	const diffMs = Date.now() - parsed.getTime();
	const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
	if (diffSeconds < 60) {
		return "Maintenant";
	}

	const diffMinutes = Math.floor(diffSeconds / 60);
	if (diffMinutes < 60) {
		return `Il y a ${diffMinutes} min`;
	}

	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) {
		return `Il y a ${diffHours} h`;
	}

	const diffDays = Math.floor(diffHours / 24);
	if (diffDays === 1) {
		return "Hier";
	}
	if (diffDays < 7) {
		return capitalizeFirstLetter(
			parsed.toLocaleDateString("fr-FR", { weekday: "long" }),
		);
	}

	return parsed.toLocaleDateString("fr-FR", {
		day: "numeric",
		month: "short",
	});
}
