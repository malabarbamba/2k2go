update account.profiles
set
  username_change_count = 0,
  username_changed_at = null,
  updated_at = now()
where lower(username) = 'calm-dolphin-921';
