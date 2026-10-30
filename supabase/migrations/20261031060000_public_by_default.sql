-- Showlio is for showing work, so profiles now start public; anyone can switch to
-- private in Settings > Privacy. Projects of private profiles stay visible only to
-- their creator.
--
-- Before launch, existing profiles become public too: the Settings switch used to
-- start switched off, which made accounts private without anyone choosing it.
alter table public.profiles alter column visibility set default 'public';
update public.profiles set visibility = 'public' where visibility in ('draft', 'private');
