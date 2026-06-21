-- Mariposa schema — the eight entities from the data model.
--
-- Clinical values are stored exactly as defined in Reference_Data. A NULL value
-- represents MISSING (Req 1.8): the Missing-Data detector and the UI flag it
-- rather than rendering a blank or a substituted value. The seed couple
-- "Maya & Daniel" (couple_001) is written by lib/db/seed.ts from
-- /reference-data/sample-couple.md.
--
-- Entities: couple, member, her_profile, him_profile, trying_window, task,
--           calendar_event, call_record.

-- Couple — the single shared workspace row (Together_View data lives here).
create table if not exists couple (
  id                  text primary key,
  display_name        text not null,
  trying_since_months integer,
  goal                text,
  top_concern         text,
  insurance_provider  text,
  plan_type           text,
  member_id           text,
  group_number        text,
  policy_holder       text,
  coverage_status     text
);

-- Member — one row per partner (role = 'her' | 'him').
create table if not exists member (
  id        uuid primary key default gen_random_uuid(),
  couple_id text not null references couple (id) on delete cascade,
  role      text not null,
  name      text not null,
  age       integer,
  dob       date
);

-- Her profile — female labs/cycle data. NULL labs (day3_fsh, day3_estradiol,
-- mid_luteal_progesterone, prolactin, ...) represent MISSING.
create table if not exists her_profile (
  couple_id               text primary key references couple (id) on delete cascade,
  last_period_start       date,
  avg_cycle_length        integer,
  cycle_length_min        integer,
  cycle_length_max        integer,
  cycle_regular           boolean,
  months_trying           integer,
  conditions              jsonb,
  prior_meds              jsonb,
  ovulation_tracking      text,
  prior_pregnancies       integer,
  amh                     numeric,
  tsh                     numeric,
  day3_fsh                numeric,
  day3_estradiol          numeric,
  mid_luteal_progesterone numeric,
  prolactin               numeric
);

-- Him profile — semen analysis results, lifestyle, history, readiness score.
-- Any NULL semen parameter represents MISSING.
create table if not exists him_profile (
  couple_id                text primary key references couple (id) on delete cascade,
  semen_analysis_status    text,
  semen_analysis_date      date,
  volume_ml                numeric,
  concentration_million_ml numeric,
  total_count_million      numeric,
  progressive_motility_pct numeric,
  total_motility_pct       numeric,
  morphology_normal_pct    numeric,
  vitality_pct             numeric,
  ph                       numeric,
  lifestyle                jsonb,
  medical_history          jsonb,
  readiness_score          integer
);

-- Trying window — output of the Trying-Window engine, persisted per couple.
create table if not exists trying_window (
  id                  uuid primary key default gen_random_uuid(),
  couple_id           text not null references couple (id) on delete cascade,
  fertile_window_start date,
  fertile_window_end   date,
  min_ovulation        date,
  max_ovulation        date,
  confidence           text,
  reasons              jsonb
);

-- Call record — declared before task so task.source_call_record_id can
-- reference it.
create table if not exists call_record (
  id               uuid primary key default gen_random_uuid(),
  couple_id        text not null references couple (id) on delete cascade,
  call_type        text not null,
  transcript       jsonb,
  extracted_result jsonb,
  used_fallback    boolean not null default false,
  unresolved_fields jsonb
);

-- Task — Her / His / Together delegation board items. "column" is a reserved
-- word in SQL, so it is quoted.
create table if not exists task (
  id                    uuid primary key default gen_random_uuid(),
  couple_id             text not null references couple (id) on delete cascade,
  "column"              text not null,
  title                 text not null,
  completed             boolean not null default false,
  weight                integer not null default 0,
  source_call_record_id uuid references call_record (id) on delete set null
);

-- Calendar event — trying window, priority days, reminders, booked consult.
create table if not exists calendar_event (
  id          uuid primary key default gen_random_uuid(),
  couple_id   text not null references couple (id) on delete cascade,
  type        text not null,
  title       text not null,
  date        date,
  time        text,
  description text
);

-- Lookup indexes for the couple-scoped reads in lib/db/queries.ts.
create index if not exists member_couple_id_idx on member (couple_id);
create index if not exists trying_window_couple_id_idx on trying_window (couple_id);
create index if not exists task_couple_id_idx on task (couple_id);
create index if not exists calendar_event_couple_id_idx on calendar_event (couple_id);
create index if not exists call_record_couple_id_idx on call_record (couple_id);
