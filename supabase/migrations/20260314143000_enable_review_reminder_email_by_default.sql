alter table public.user_review_reminder_preferences
    alter column email_enabled set default true;
update public.user_review_reminder_preferences
set email_enabled = true,
    updated_at = timezone('utc', now())
where email_enabled is distinct from true;
