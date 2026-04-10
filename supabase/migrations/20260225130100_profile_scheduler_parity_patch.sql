-- Ensure scheduler profile parity for cloud schema drift.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scheduler_timezone text;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS scheduler_day_cutoff_hour integer;
UPDATE public.profiles
SET scheduler_timezone = 'UTC'
WHERE scheduler_timezone IS NULL
   OR btrim(scheduler_timezone) = '';
UPDATE public.profiles
SET scheduler_day_cutoff_hour = 4
WHERE scheduler_day_cutoff_hour IS NULL;
UPDATE public.profiles
SET scheduler_day_cutoff_hour = LEAST(23, GREATEST(0, scheduler_day_cutoff_hour))
WHERE scheduler_day_cutoff_hour < 0
   OR scheduler_day_cutoff_hour > 23;
ALTER TABLE public.profiles
  ALTER COLUMN scheduler_timezone SET DEFAULT 'UTC';
ALTER TABLE public.profiles
  ALTER COLUMN scheduler_day_cutoff_hour SET DEFAULT 4;
ALTER TABLE public.profiles
  ALTER COLUMN scheduler_timezone SET NOT NULL;
ALTER TABLE public.profiles
  ALTER COLUMN scheduler_day_cutoff_hour SET NOT NULL;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_scheduler_timezone_not_blank_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_scheduler_timezone_not_blank_check
  CHECK (btrim(scheduler_timezone) <> '');
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_scheduler_day_cutoff_hour_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_scheduler_day_cutoff_hour_check
  CHECK (scheduler_day_cutoff_hour >= 0 AND scheduler_day_cutoff_hour <= 23);
