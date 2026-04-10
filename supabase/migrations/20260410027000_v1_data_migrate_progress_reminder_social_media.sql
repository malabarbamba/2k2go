-- Baseline v1 data migration: progress, reminder, social, media

do $$
begin
  if to_regclass('public.user_learning_path_progress') is not null then
    insert into progress.learning_path_progress (
      user_id,
      first_visited_at,
      step_one_choice,
      step_one_completed_at,
      primary_collection_started_at,
      created_at,
      updated_at
    )
    select
      ulpp.user_id,
      ulpp.first_visited_at,
      case
        when ulpp.step_one_choice in ('can-read', 'needs-alphabet', 'quiz-can-read', 'quiz-needs-alphabet') then
          replace(ulpp.step_one_choice, '-', '_')::progress.path_step_one_choice
        else null
      end,
      ulpp.step_one_completed_at,
      ulpp.foundation_deck_started_at,
      coalesce(ulpp.created_at, now()),
      coalesce(ulpp.updated_at, coalesce(ulpp.created_at, now()))
    from public.user_learning_path_progress ulpp
    where ulpp.user_id is not null
    on conflict (user_id) do update
    set
      first_visited_at = coalesce(progress.learning_path_progress.first_visited_at, excluded.first_visited_at),
      step_one_choice = coalesce(excluded.step_one_choice, progress.learning_path_progress.step_one_choice),
      step_one_completed_at = coalesce(excluded.step_one_completed_at, progress.learning_path_progress.step_one_completed_at),
      primary_collection_started_at = coalesce(excluded.primary_collection_started_at, progress.learning_path_progress.primary_collection_started_at),
      updated_at = greatest(progress.learning_path_progress.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.user_accomplishments') is not null then
    insert into progress.user_milestones (
      user_id,
      milestone_key,
      earned_at,
      metadata,
      created_at,
      updated_at
    )
    select
      ua.user_id,
      ua.accomplishment_type,
      min(coalesce(ua.earned_at, now())) as earned_at,
      coalesce(jsonb_agg(ua.metadata) filter (where ua.metadata is not null), '[]'::jsonb) as metadata,
      min(coalesce(ua.earned_at, now())) as created_at,
      max(coalesce(ua.earned_at, now())) as updated_at
    from public.user_accomplishments ua
    where ua.user_id is not null
    group by ua.user_id, ua.accomplishment_type
    on conflict (user_id, milestone_key) do update
    set
      earned_at = coalesce(progress.user_milestones.earned_at, excluded.earned_at),
      metadata = excluded.metadata,
      updated_at = greatest(progress.user_milestones.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.user_accomplishment_states') is not null then
    insert into progress.user_milestones (
      user_id,
      milestone_key,
      notified_at,
      metadata,
      created_at,
      updated_at
    )
    select
      uas.user_id,
      uas.accomplishment_type,
      uas.notified_at,
      jsonb_strip_nulls(
        jsonb_build_object(
          'overlay_version', uas.overlay_version,
          'source_event_ref', uas.source_event_ref
        )
      ),
      coalesce(uas.created_at, now()),
      coalesce(uas.updated_at, coalesce(uas.created_at, now()))
    from public.user_accomplishment_states uas
    where uas.user_id is not null
    on conflict (user_id, milestone_key) do update
    set
      notified_at = coalesce(excluded.notified_at, progress.user_milestones.notified_at),
      metadata = coalesce(progress.user_milestones.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = greatest(progress.user_milestones.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.user_review_reminder_preferences') is not null then
    insert into reminder.preferences (
      user_id,
      enabled,
      email_enabled,
      push_enabled,
      daily_target,
      reminder_time_local,
      timezone,
      week_days,
      created_at,
      updated_at
    )
    select
      urrp.user_id,
      urrp.enabled,
      urrp.email_enabled,
      urrp.web_push_enabled,
      coalesce(urrp.daily_cap, 20),
      make_time(coalesce(urrp.evening_hour, 20), 0, 0),
      'UTC',
      array[1,2,3,4,5,6,7]::smallint[],
      coalesce(urrp.created_at, now()),
      coalesce(urrp.updated_at, coalesce(urrp.created_at, now()))
    from public.user_review_reminder_preferences urrp
    where urrp.user_id is not null
    on conflict (user_id) do update
    set
      enabled = excluded.enabled,
      email_enabled = excluded.email_enabled,
      push_enabled = excluded.push_enabled,
      daily_target = excluded.daily_target,
      reminder_time_local = excluded.reminder_time_local,
      updated_at = greatest(reminder.preferences.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.user_review_calendar_feeds') is not null then
    insert into reminder.calendar_feeds (
      user_id,
      token,
      scope,
      is_active,
      created_at
    )
    select
      urcf.user_id,
      urcf.token::text,
      'all_cards'::reminder.feed_scope,
      true,
      coalesce(urcf.created_at, now())
    from public.user_review_calendar_feeds urcf
    where urcf.user_id is not null
    on conflict (token) do nothing;
  end if;

  if to_regclass('public.user_review_web_push_subscriptions') is not null then
    insert into reminder.push_subscriptions (
      user_id,
      endpoint,
      p256dh,
      auth_secret,
      user_agent,
      is_active,
      last_seen_at,
      created_at,
      updated_at
    )
    select
      urwps.user_id,
      urwps.endpoint,
      urwps.p256dh,
      urwps.auth,
      urwps.user_agent,
      coalesce(urwps.enabled, true),
      coalesce(urwps.last_sent_at, urwps.created_at, now()),
      coalesce(urwps.created_at, now()),
      coalesce(urwps.updated_at, coalesce(urwps.created_at, now()))
    from public.user_review_web_push_subscriptions urwps
    where urwps.user_id is not null
    on conflict (endpoint) do update
    set
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret,
      user_agent = excluded.user_agent,
      is_active = excluded.is_active,
      last_seen_at = excluded.last_seen_at,
      updated_at = greatest(reminder.push_subscriptions.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.friend_requests') is not null then
    insert into social.relationships (
      user_low_id,
      user_high_id,
      initiator_user_id,
      state,
      requested_at,
      responded_at,
      accepted_at,
      metadata,
      created_at,
      updated_at
    )
    select distinct on (
      private.user_pair_low(fr.requester_user_id, fr.recipient_user_id),
      private.user_pair_high(fr.requester_user_id, fr.recipient_user_id)
    )
      private.user_pair_low(fr.requester_user_id, fr.recipient_user_id),
      private.user_pair_high(fr.requester_user_id, fr.recipient_user_id),
      fr.requester_user_id,
      case
        when fr.status = 'pending' then 'pending'::social.relationship_state
        when fr.status = 'accepted' then 'accepted'::social.relationship_state
        when fr.status = 'declined' then 'declined'::social.relationship_state
        else 'removed'::social.relationship_state
      end,
      fr.created_at,
      fr.responded_at,
      case when fr.status = 'accepted' then coalesce(fr.responded_at, fr.created_at) else null end,
      jsonb_build_object('legacy_source', 'friend_requests', 'legacy_request_id', fr.id),
      fr.created_at,
      coalesce(fr.responded_at, fr.created_at)
    from public.friend_requests fr
    where fr.requester_user_id is not null
      and fr.recipient_user_id is not null
    order by
      private.user_pair_low(fr.requester_user_id, fr.recipient_user_id),
      private.user_pair_high(fr.requester_user_id, fr.recipient_user_id),
      coalesce(fr.responded_at, fr.created_at) desc,
      fr.created_at desc,
      fr.id desc
    on conflict (user_low_id, user_high_id) do update
    set
      state = excluded.state,
      initiator_user_id = excluded.initiator_user_id,
      requested_at = least(social.relationships.requested_at, excluded.requested_at),
      responded_at = coalesce(excluded.responded_at, social.relationships.responded_at),
      accepted_at = coalesce(excluded.accepted_at, social.relationships.accepted_at),
      metadata = coalesce(social.relationships.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = greatest(social.relationships.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.friendships') is not null then
    insert into social.relationships (
      user_low_id,
      user_high_id,
      initiator_user_id,
      state,
      requested_at,
      accepted_at,
      metadata,
      created_at,
      updated_at
    )
    select distinct on (
      private.user_pair_low(fs.user_a_id, fs.user_b_id),
      private.user_pair_high(fs.user_a_id, fs.user_b_id)
    )
      private.user_pair_low(fs.user_a_id, fs.user_b_id),
      private.user_pair_high(fs.user_a_id, fs.user_b_id),
      fs.user_a_id,
      'accepted'::social.relationship_state,
      fs.created_at,
      fs.created_at,
      jsonb_build_object('legacy_source', 'friendships', 'legacy_friendship_id', fs.id),
      fs.created_at,
      fs.created_at
    from public.friendships fs
    where fs.user_a_id is not null
      and fs.user_b_id is not null
    order by
      private.user_pair_low(fs.user_a_id, fs.user_b_id),
      private.user_pair_high(fs.user_a_id, fs.user_b_id),
      fs.created_at desc,
      fs.id desc
    on conflict (user_low_id, user_high_id) do update
    set
      state = 'accepted',
      accepted_at = coalesce(social.relationships.accepted_at, excluded.accepted_at),
      metadata = coalesce(social.relationships.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      updated_at = greatest(social.relationships.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.user_notifications') is not null then
    insert into social.notifications (
      id,
      user_id,
      actor_user_id,
      notification_type,
      payload,
      read_at,
      created_at
    )
    select
      un.id,
      un.user_id,
      (un.payload_json ->> 'actor_user_id')::uuid,
      un.notification_type,
      coalesce(un.payload_json, '{}'::jsonb),
      un.read_at,
      coalesce(un.created_at, now())
    from public.user_notifications un
    where un.user_id is not null
    on conflict (id) do update
    set
      actor_user_id = coalesce(excluded.actor_user_id, social.notifications.actor_user_id),
      notification_type = excluded.notification_type,
      payload = excluded.payload,
      read_at = coalesce(excluded.read_at, social.notifications.read_at);
  end if;

  if to_regclass('public.user_shared_decks') is not null then
    insert into catalog.collections (
      id,
      owner_user_id,
      slug,
      title,
      description,
      kind,
      visibility,
      metadata,
      created_at,
      updated_at
    )
    select
      usd.id,
      usd.owner_user_id,
      'shared-' || replace(usd.id::text, '-', ''),
      usd.deck_label,
      'Migrated shared deck',
      'user_shared'::catalog.collection_kind,
      case when usd.is_public then 'public'::catalog.collection_visibility else 'shared'::catalog.collection_visibility end,
      jsonb_strip_nulls(
        jsonb_build_object(
          'deck_client_id', usd.deck_client_id,
          'deck_kind', usd.deck_kind,
          'deck_rows_json', usd.deck_rows_json,
          'deck_cards_count', usd.deck_cards_count,
          'published_at', usd.published_at
        )
      ),
      coalesce(usd.created_at, now()),
      coalesce(usd.updated_at, coalesce(usd.created_at, now()))
    from public.user_shared_decks usd
    where usd.owner_user_id is not null
    on conflict (id) do update
    set
      title = excluded.title,
      visibility = excluded.visibility,
      metadata = excluded.metadata,
      updated_at = greatest(catalog.collections.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.user_shared_deck_recipients') is not null then
    insert into social.collection_access (
      collection_id,
      grantee_user_id,
      granted_by_user_id,
      access_role,
      created_at
    )
    select
      usdr.shared_deck_id,
      usdr.recipient_user_id,
      usdr.granted_by_user_id,
      'viewer'::social.collection_access_role,
      coalesce(usdr.created_at, now())
    from public.user_shared_deck_recipients usdr
    where exists (select 1 from catalog.collections c where c.id = usdr.shared_deck_id)
    on conflict (collection_id, grantee_user_id) do update
    set
      access_role = excluded.access_role,
      revoked_at = null,
      granted_by_user_id = excluded.granted_by_user_id;
  end if;

  if to_regclass('public.user_hidden_shared_decks') is not null then
    insert into catalog.user_collection_state (
      user_id,
      collection_id,
      state,
      joined_at,
      hidden_at,
      created_at,
      updated_at
    )
    select
      uhsd.user_id,
      uhsd.shared_deck_id,
      'hidden'::catalog.user_collection_state_kind,
      coalesce(uhsd.hidden_at, now()),
      uhsd.hidden_at,
      coalesce(uhsd.hidden_at, now()),
      coalesce(uhsd.hidden_at, now())
    from public.user_hidden_shared_decks uhsd
    where exists (select 1 from catalog.collections c where c.id = uhsd.shared_deck_id)
    on conflict (user_id, collection_id) do update
    set
      state = 'hidden',
      hidden_at = coalesce(excluded.hidden_at, catalog.user_collection_state.hidden_at),
      updated_at = greatest(catalog.user_collection_state.updated_at, excluded.updated_at);
  end if;

  if to_regclass('public.preview_session_text_messages') is not null then
    insert into social.threads (
      thread_kind,
      subject_kind,
      subject_id,
      created_by_user_id,
      metadata,
      created_at,
      updated_at
    )
    select
      'preview_discussion'::social.thread_kind,
      'card'::social.thread_subject_kind,
      coalesce(ov.card_id, ofd.card_id),
      pstm.user_id,
      jsonb_build_object('legacy_source', 'preview_session_text_messages', 'legacy_message_id', pstm.id),
      pstm.created_at,
      coalesce(pstm.updated_at, pstm.created_at)
    from public.preview_session_text_messages pstm
    left join lateral (
      select o.card_id from catalog.card_origins o
      where o.source_table = 'vocabulary_cards'
        and o.source_id = pstm.vocabulary_card_id::text
      limit 1
    ) ov on true
    left join lateral (
      select o.card_id from catalog.card_origins o
      where o.source_table = 'foundation_deck'
        and o.source_id = pstm.foundation_card_id::text
      limit 1
    ) ofd on true;

    insert into social.messages (
      thread_id,
      author_user_id,
      message_kind,
      body_text,
      metadata,
      created_at
    )
    select
      t.id,
      pstm.user_id,
      'text'::social.message_kind,
      pstm.message_text,
      jsonb_build_object('legacy_message_id', pstm.id),
      pstm.created_at
    from public.preview_session_text_messages pstm
    join social.threads t
      on (t.metadata ->> 'legacy_message_id') = pstm.id::text
    where not exists (
      select 1 from social.messages m
      where (m.metadata ->> 'legacy_message_id') = pstm.id::text
    );
  end if;

  if to_regclass('public.preview_session_audio_posts') is not null then
    insert into social.threads (
      thread_kind,
      subject_kind,
      subject_id,
      created_by_user_id,
      metadata,
      created_at,
      updated_at
    )
    select
      'preview_discussion'::social.thread_kind,
      'card'::social.thread_subject_kind,
      coalesce(ov.card_id, ofd.card_id),
      aps.user_id,
      jsonb_build_object('legacy_audio_post_id', aps.id),
      aps.created_at,
      coalesce(aps.updated_at, aps.created_at)
    from public.preview_session_audio_posts aps
    left join lateral (
      select o.card_id from catalog.card_origins o
      where o.source_table = 'vocabulary_cards'
        and o.source_id = aps.vocabulary_card_id::text
      limit 1
    ) ov on true
    left join lateral (
      select o.card_id from catalog.card_origins o
      where o.source_table = 'foundation_deck'
        and o.source_id = aps.foundation_card_id::text
      limit 1
    ) ofd on true;

    insert into social.messages (
      thread_id,
      author_user_id,
      message_kind,
      body_text,
      metadata,
      created_at
    )
    select
      t.id,
      aps.user_id,
      'audio'::social.message_kind,
      null,
      jsonb_build_object('legacy_audio_post_id', aps.id),
      aps.created_at
    from public.preview_session_audio_posts aps
    join social.threads t
      on (t.metadata ->> 'legacy_audio_post_id') = aps.id::text
    where not exists (
      select 1 from social.messages m
      where (m.metadata ->> 'legacy_audio_post_id') = aps.id::text
    );

    insert into social.message_assets (
      message_id,
      asset_kind,
      asset_url,
      duration_seconds,
      metadata,
      created_at
    )
    select
      m.id,
      'audio'::social.asset_kind,
      aps.audio_storage_path,
      case when aps.recording_duration_ms is not null then (aps.recording_duration_ms / 1000) else null end,
      jsonb_build_object(
        'share_selected', aps.share_selected,
        'share_session_key', aps.share_session_key,
        'share_marked_at', aps.share_marked_at,
        'share_dispatched_at', aps.share_dispatched_at
      ),
      aps.created_at
    from public.preview_session_audio_posts aps
    join social.messages m
      on (m.metadata ->> 'legacy_audio_post_id') = aps.id::text
    where not exists (
      select 1 from social.message_assets a
      where a.message_id = m.id
        and a.asset_kind = 'audio'::social.asset_kind
    );
  end if;

  if to_regclass('public.preview_session_audio_replies') is not null then
    insert into social.messages (
      thread_id,
      author_user_id,
      message_kind,
      body_text,
      metadata,
      created_at
    )
    select
      t.id,
      apr.user_id,
      case when apr.audio_storage_path is not null then 'audio'::social.message_kind else 'text'::social.message_kind end,
      apr.body_text,
      jsonb_build_object('legacy_audio_reply_id', apr.id),
      apr.created_at
    from public.preview_session_audio_replies apr
    join social.threads t
      on (t.metadata ->> 'legacy_audio_post_id') = apr.audio_post_id::text
    where not exists (
      select 1 from social.messages m
      where (m.metadata ->> 'legacy_audio_reply_id') = apr.id::text
    );

    insert into social.message_assets (
      message_id,
      asset_kind,
      asset_url,
      duration_seconds,
      metadata,
      created_at
    )
    select
      m.id,
      'audio'::social.asset_kind,
      apr.audio_storage_path,
      case when apr.audio_duration_ms is not null then (apr.audio_duration_ms / 1000) else null end,
      jsonb_build_object('legacy_audio_reply_id', apr.id),
      apr.created_at
    from public.preview_session_audio_replies apr
    join social.messages m
      on (m.metadata ->> 'legacy_audio_reply_id') = apr.id::text
    where apr.audio_storage_path is not null
      and not exists (
        select 1 from social.message_assets a
        where a.message_id = m.id
          and a.asset_kind = 'audio'::social.asset_kind
      );
  end if;

  if to_regclass('public.user_vocabulary_card_media') is not null then
    insert into learning.user_cards (user_id, card_id)
    select distinct
      ucm.user_id,
      o.card_id
    from public.user_vocabulary_card_media ucm
    join catalog.card_origins o
      on o.source_table = 'vocabulary_cards'
     and o.source_id = ucm.vocabulary_card_id::text
    on conflict (user_id, card_id) do nothing;

    insert into media.user_card_media (
      user_id,
      card_id,
      media_kind,
      media_url,
      source,
      metadata,
      created_at,
      updated_at
    )
    select
      ucm.user_id,
      o.card_id,
      'image'::media.media_kind,
      ucm.image_url,
      'legacy.user_vocabulary_card_media',
      jsonb_build_object('hide_image', ucm.hide_image),
      coalesce(ucm.created_at, now()),
      coalesce(ucm.updated_at, coalesce(ucm.created_at, now()))
    from public.user_vocabulary_card_media ucm
    join catalog.card_origins o
      on o.source_table = 'vocabulary_cards'
     and o.source_id = ucm.vocabulary_card_id::text
    where ucm.image_url is not null
    on conflict (user_id, card_id, media_kind, media_url) do update
    set metadata = coalesce(media.user_card_media.metadata, '{}'::jsonb) || excluded.metadata;

    insert into media.user_card_media (
      user_id,
      card_id,
      media_kind,
      media_url,
      source,
      metadata,
      created_at,
      updated_at
    )
    select
      ucm.user_id,
      o.card_id,
      'audio'::media.media_kind,
      ucm.audio_url,
      'legacy.user_vocabulary_card_media',
      jsonb_build_object('slot', 'word', 'hide_audio', ucm.hide_audio),
      coalesce(ucm.created_at, now()),
      coalesce(ucm.updated_at, coalesce(ucm.created_at, now()))
    from public.user_vocabulary_card_media ucm
    join catalog.card_origins o
      on o.source_table = 'vocabulary_cards'
     and o.source_id = ucm.vocabulary_card_id::text
    where ucm.audio_url is not null
    on conflict (user_id, card_id, media_kind, media_url) do update
    set metadata = coalesce(media.user_card_media.metadata, '{}'::jsonb) || excluded.metadata;

    insert into media.user_card_media (
      user_id,
      card_id,
      media_kind,
      media_url,
      source,
      metadata,
      created_at,
      updated_at
    )
    select
      ucm.user_id,
      o.card_id,
      'audio'::media.media_kind,
      ucm.sentence_audio_url,
      'legacy.user_vocabulary_card_media',
      jsonb_build_object('slot', 'sentence', 'hide_sentence_audio', ucm.hide_sentence_audio),
      coalesce(ucm.created_at, now()),
      coalesce(ucm.updated_at, coalesce(ucm.created_at, now()))
    from public.user_vocabulary_card_media ucm
    join catalog.card_origins o
      on o.source_table = 'vocabulary_cards'
     and o.source_id = ucm.vocabulary_card_id::text
    where ucm.sentence_audio_url is not null
    on conflict (user_id, card_id, media_kind, media_url) do update
    set metadata = coalesce(media.user_card_media.metadata, '{}'::jsonb) || excluded.metadata;
  end if;
end
$$;
