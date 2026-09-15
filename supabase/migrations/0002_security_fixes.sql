-- Bring a fresh setup in line with the security fixes applied directly on
-- the live database. Safe to run more than once.

-- Empty search_path on set_updated_at closes a small privilege-escalation
-- surface where an attacker able to create objects in a schema on
-- search_path could shadow a function this trigger relies on.
alter function public.set_updated_at() set search_path = '';

-- handle_new_user runs security definer and inserts into public.profiles.
-- It's meant to be called only by the on_auth_user_created trigger, not
-- directly by anyone. Revoke execute from every role that might reach it
-- over the API so it can't be called out-of-band. The trigger keeps
-- working because triggers run as the function's owner regardless.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;
