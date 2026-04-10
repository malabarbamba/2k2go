// deno-lint-ignore-file no-explicit-any
type SupabaseClient = any;

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashValue(value: string): Promise<string> {
  const salt = Deno.env.get("PII_HASH_SALT") || "";
  if (!salt) {
    console.warn("PII_HASH_SALT not configured - using unsalted hash");
  }
  const payload = `${salt}:${value}`;
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );
  return arrayBufferToHex(hashBuffer);
}

type DeleteResult = { count: number; error?: string };

function isAuthUserMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user not found") ||
    normalized.includes("not found") ||
    normalized.includes("no rows")
  );
}

async function deleteByColumn(
  supabaseAdmin: SupabaseClient,
  table: string,
  column: string,
  value: string
): Promise<DeleteResult> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .delete({ count: "exact" })
    .eq(column, value);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count ?? 0 };
}

export type DeletionSummary = {
  counts: Record<string, number>;
  skipped: string[];
  authDeletionError: string | null;
};

// deno-lint-ignore no-explicit-any
export async function deleteUserData(
  supabaseAdmin: SupabaseClient,
  userId: string,
  userEmail: string | null
): Promise<DeletionSummary> {
  const counts: Record<string, number> = {
    profiles: 0,
    suggestions: 0,
    user_progress: 0,
    user_flashcard_progress: 0,
    admin_2fa_codes: 0,
    pro_requests: 0,
    pro_waitlist: 0,
    user_roles: 0,
    short_comments: 0,
    short_reactions: 0,
    visitor_sessions: 0,
    page_views: 0,
    click_events: 0,
    avatars: 0,
    deck_downloads: 0,
    gdpr_export_requests: 0,
  };
  const skipped: string[] = [];

  let authDeletionError: string | null = null;
  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    const authMessage = deleteUserError.message ?? "Suppression auth.users échouée";
    if (!isAuthUserMissingError(authMessage)) {
      authDeletionError = authMessage;
      skipped.push("auth.users: delete_failed");
      return { counts, skipped, authDeletionError };
    }

    skipped.push("auth.users: already_deleted");
  }

  const userIdTables = [
    "profiles",
    "suggestions",
    "user_progress",
    "user_flashcard_progress",
    "admin_2fa_codes",
    "pro_requests",
    "pro_waitlist",
    "user_roles",
  ];

  for (const table of userIdTables) {
    const result = await deleteByColumn(supabaseAdmin, table, "user_id", userId);
    counts[table] = result.count;
    if (result.error) {
      skipped.push(`${table}: ${result.error}`);
    }
  }

  const viewerIdTables = ["short_comments", "short_reactions"];
  for (const table of viewerIdTables) {
    const result = await deleteByColumn(supabaseAdmin, table, "viewer_id", userId);
    counts[table] = result.count;
    if (result.error) {
      skipped.push(`${table}: ${result.error}`);
    }
  }

  const { data: sessions, error: sessionListError } = await supabaseAdmin
    .from("visitor_sessions")
    .select("id")
    .eq("user_id", userId);

  if (sessionListError) {
    skipped.push(`visitor_sessions: ${sessionListError.message}`);
  }

  const sessionIds = (sessions ?? []).map((session: { id: string }) => session.id);
  if (sessionIds.length > 0) {
    const pageViewsResult = await supabaseAdmin
      .from("page_views")
      .delete({ count: "exact" })
      .in("session_id", sessionIds);
    if (pageViewsResult.error) {
      skipped.push(`page_views: ${pageViewsResult.error.message}`);
    } else {
      counts.page_views = pageViewsResult.count ?? 0;
    }

    const clickEventsResult = await supabaseAdmin
      .from("click_events")
      .delete({ count: "exact" })
      .in("session_id", sessionIds);
    if (clickEventsResult.error) {
      skipped.push(`click_events: ${clickEventsResult.error.message}`);
    } else {
      counts.click_events = clickEventsResult.count ?? 0;
    }
  }

  const visitorSessionsResult = await deleteByColumn(supabaseAdmin, "visitor_sessions", "user_id", userId);
  counts.visitor_sessions = visitorSessionsResult.count;
  if (visitorSessionsResult.error) {
    skipped.push(`visitor_sessions: ${visitorSessionsResult.error}`);
  }

  const avatarList = await supabaseAdmin.storage
    .from("avatars")
    .list(userId, { limit: 1000, offset: 0 });
  if (avatarList.error) {
    skipped.push(`avatars: ${avatarList.error.message}`);
  } else if (avatarList.data && avatarList.data.length > 0) {
    const paths = avatarList.data.map((item: { name: string }) => `${userId}/${item.name}`);
    const removeResult = await supabaseAdmin.storage.from("avatars").remove(paths);
    if (removeResult.error) {
      skipped.push(`avatars: ${removeResult.error.message}`);
    } else {
      counts.avatars = paths.length;
    }
  }

  if (userEmail) {
    const emailHash = await hashValue(userEmail);
    const deckResult = await deleteByColumn(supabaseAdmin, "deck_downloads", "email_hash", emailHash);
    counts.deck_downloads = deckResult.count;
    if (deckResult.error) {
      skipped.push(`deck_downloads: ${deckResult.error}`);
    }
  } else {
    skipped.push("deck_downloads: email_absent");
  }

  const allUserIdTables = [...userIdTables, "gdpr_export_requests"];
  const fallbackUserIdTables = allUserIdTables.filter((table) => !userIdTables.includes(table));
  for (const table of fallbackUserIdTables) {
    const result = await deleteByColumn(supabaseAdmin, table, "user_id", userId);
    counts[table] = result.count;
    if (result.error) {
      skipped.push(`${table}: ${result.error}`);
    }
  }

  try {
    const userIdHash = await hashValue(userId);
    await supabaseAdmin
      .from("gdpr_deletion_log")
      .insert({
        user_id_hash: userIdHash,
        counts,
        skipped,
      });
  } catch (error) {
    console.error("Failed to log GDPR deletion:", error);
  }

  return { counts, skipped, authDeletionError };
}
