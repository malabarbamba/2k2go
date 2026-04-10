-- Baseline v1: freeze deprecated legacy write paths

do $$
declare
  t text;
begin
  foreach t in array ARRAY[
    'foundation_deck',
    'vocabulary_cards',
    'user_vocabulary_cards',
    'user_cards',
    'user_card_state',
    'user_vocabulary_progress',
    'user_card_reviews',
    'user_reviews',
    'user_learning_progress',
    'user_stats',
    'user_dashboard_progress',
    'friend_requests',
    'friendships',
    'friend_streak_nudge_guards',
    'user_shared_decks',
    'user_shared_deck_recipients',
    'user_hidden_shared_decks',
    'preview_session_text_messages',
    'preview_session_audio_posts',
    'preview_session_audio_replies',
    'review_reminder_dispatch_runs',
    'review_reminder_delivery_attempts'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on table public.%I from anon, authenticated', t);
      execute format($c$comment on table public.%I is 'DEPRECATED: read-only migration source after Baseline V1 cutover'$c$, t);
    end if;
  end loop;
end
$$;
