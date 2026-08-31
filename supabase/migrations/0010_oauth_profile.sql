-- =============================================================================
-- 0010_oauth_profile.sql
--
-- Populate a profile properly when the account comes from an OAuth provider.
--
-- handle_new_user() only read `full_name`, which the email signup form sets.
-- Google puts the display name in `full_name` OR `name` depending on the scope
-- granted, and the picture in `avatar_url` OR `picture`. Without this, users who
-- sign in with Google land with a null name and no avatar, showing as "Unnamed
-- user" throughout the app.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    -- Email signup sets full_name; Google may use either key.
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    ),
    nullif(
      trim(
        coalesce(
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'picture',
          ''
        )
      ),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
