-- Vernacular app schema. Auth users live in the neon_auth schema (managed by
-- Neon Auth); these tables key off that user id but deliberately avoid
-- cross-schema foreign keys so auth migrations can't break app data.

create table if not exists app_users (
  id text primary key,                       -- Neon Auth user id (JWT sub)
  email text not null default '',
  display_name text not null default '',
  native_lang text not null default '',      -- onboarding: gloss language ('fr' | 'en')
  accent text not null default 'lilac',
  show_marks boolean not null default true,
  active_lang text not null default 'la',
  prefs_u bigint not null default 0,         -- client ms timestamp, LWW on prefs
  onboarded_at timestamptz,
  tos_accepted_at timestamptz,
  migrated_local_at timestamptz,             -- first-sign-in localStorage import
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_langs (
  user_id text not null references app_users(id) on delete cascade,
  lang text not null,
  goal int not null default 3,
  goal_u bigint not null default 0,
  unlocked int not null default 0,
  reset_at bigint not null default 0,        -- language-wide tombstone (client ms)
  streak int not null default 0,
  last_active text,                          -- 'YYYY-MM-DD' in the user's local time
  by_day jsonb not null default '{}'::jsonb, -- { day: { new, reviews } }
  checkins jsonb not null default '[]'::jsonb, -- [{ day, rating, note, snap, u }]
  updated_at timestamptz not null default now(),
  primary key (user_id, lang)
);
alter table user_langs add column if not exists checkins jsonb not null default '[]'::jsonb;

create table if not exists user_words (
  user_id text not null references app_users(id) on delete cascade,
  lang text not null,
  word_id text not null,
  added_at text not null,                    -- 'YYYY-MM-DD'
  box int not null default 0,
  due text not null,                         -- 'YYYY-MM-DD'
  correct int not null default 0,
  wrong int not null default 0,
  u bigint not null default 0,               -- client ms timestamp, LWW
  primary key (user_id, lang, word_id)
);

create table if not exists word_tombstones (
  user_id text not null references app_users(id) on delete cascade,
  lang text not null,
  word_id text not null,
  removed_at bigint not null,                -- client ms
  primary key (user_id, lang, word_id)
);

-- Push subscriptions, moved off the Vercel Blob JSON. user_id is null for
-- legacy subscriptions imported from the blob until their device re-enables.
create table if not exists push_subs (
  endpoint text primary key,
  user_id text,
  subscription jsonb not null,
  tz text not null default 'UTC',            -- IANA zone the app last reported
  langs jsonb not null default '{}'::jsonb,  -- { code: { index, enabled, reminders, sentAt, stats, pausedUntil } }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table push_subs add column if not exists tz text not null default 'UTC';

create index if not exists push_subs_user_idx on push_subs (user_id);
