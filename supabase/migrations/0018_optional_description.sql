-- =============================================================================
-- 0018 — A ticket's description is optional.
--
-- It was `text not null` with `check (char_length(description) between 10 and
-- 10000)`, so a ten-character minimum was enforced in three places: the Zod
-- schema, the NOT NULL, and the CHECK. Relaxing only the schema would have
-- produced a form that accepts an empty description and a database that then
-- rejects it, so all three move together.
--
-- Null rather than empty string. "Not given" and "given as nothing" are the
-- same fact here, and allowing both would mean every read site has to test for
-- two representations. The CHECK below forbids the empty string outright, and
-- createTicketSchema / updateTicketDetailsSchema transform "" to null before it
-- ever reaches the database — the same treatment category_id already gets.
--
-- Idempotent, like the earlier migrations.
-- =============================================================================

alter table public.tickets
  alter column description drop not null;

-- The old constraint carried the 10-character minimum. The replacement keeps
-- the upper bound and forbids '' so that null is the only way to say "empty".
alter table public.tickets
  drop constraint if exists tickets_description_length;

alter table public.tickets
  add constraint tickets_description_length check (
    description is null or char_length(description) between 1 and 10000
  );


-- =============================================================================
-- The full-text index has to be rebuilt.
--
-- Its expression was `title || ' ' || description`, and in Postgres a
-- concatenation with NULL is NULL. A ticket with no description would index as
-- NULL and become unfindable by TITLE too — the failure is silent, and it looks
-- like search is broken rather than like the description is missing.
--
-- The list page currently searches with ilike and does not use this index, so
-- nothing today would have surfaced the problem. It is fixed here anyway,
-- because the index is exactly what that search should eventually use.
-- =============================================================================

drop index if exists public.tickets_search_idx;

create index if not exists tickets_search_idx
  on public.tickets
  using gin (to_tsvector('english', title || ' ' || coalesce(description, '')));
