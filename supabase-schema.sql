-- SolomonQuest LMS — Run this in your Supabase SQL Editor

-- Schools
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid references auth.users,
  primary_color text,
  secondary_color text,
  logo_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Profiles (mirrors auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  school_id uuid references schools,
  role text check (role in ('super_admin','admin','teacher','staff','student')),
  first_name text,
  last_name text,
  avatar_url text,
  bio text
);

-- Programs
create table if not exists programs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools,
  name text not null,
  code text,
  description text,
  level text,
  is_active boolean default true
);

-- Courses
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools,
  program_id uuid references programs,
  teacher_id uuid references profiles,
  title text not null,
  code text,
  term text,
  description text,
  is_published boolean default false
);

-- Enrollments
create table if not exists course_enrollments (
  course_id uuid references courses,
  student_id uuid references profiles,
  status text check (status in ('active','dropped')) default 'active',
  primary key (course_id, student_id)
);

-- Assignments
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses,
  title text not null,
  description text,
  due_date timestamptz,
  points_possible int,
  is_published boolean default false
);

-- Submissions
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments,
  student_id uuid references profiles,
  content text,
  grade numeric,
  status text check (status in ('draft','submitted','graded')) default 'draft',
  unique (assignment_id, student_id)
);

-- Announcements
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools,
  course_id uuid references courses,
  title text not null,
  content text,
  is_pinned boolean default false,
  posted_by uuid references profiles,
  created_at timestamptz default now()
);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles,
  title text,
  body text,
  link text,
  is_read boolean default false,
  created_at timestamptz default now()
);

-- Student Applications
create table if not exists student_applications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools,
  program_id uuid references programs,
  applicant_id uuid references profiles,
  status text check (status in ('submitted','under_review','accepted','enrolled','rejected')) default 'submitted',
  created_at timestamptz default now()
);

-- Attendance
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses,
  student_id uuid references profiles,
  session_date date,
  status text check (status in ('present','absent','late')),
  unique (course_id, student_id, session_date)
);

-- Enable RLS on all tables
alter table schools enable row level security;
alter table profiles enable row level security;
alter table programs enable row level security;
alter table courses enable row level security;
alter table course_enrollments enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table announcements enable row level security;
alter table notifications enable row level security;
alter table student_applications enable row level security;
alter table attendance enable row level security;

-- RLS Policies (note: CREATE POLICY does not support IF NOT EXISTS)
-- Drop first if re-running, then recreate

-- Profiles
drop policy if exists "profiles_read" on profiles;
drop policy if exists "profiles_insert" on profiles;
drop policy if exists "profiles_update" on profiles;
create policy "profiles_read" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Schools
drop policy if exists "schools_read" on schools;
drop policy if exists "schools_insert" on schools;
drop policy if exists "schools_update" on schools;
create policy "schools_read" on schools for select using (true);
create policy "schools_insert" on schools for insert with check (auth.uid() = owner_id);
create policy "schools_update" on schools for update using (auth.uid() = owner_id);

-- Programs
drop policy if exists "programs_read" on programs;
drop policy if exists "programs_write" on programs;
create policy "programs_read" on programs for select using (true);
create policy "programs_write" on programs for all using (
  exists (select 1 from profiles where id = auth.uid() and school_id = programs.school_id and role in ('admin','super_admin'))
);

-- Courses
drop policy if exists "courses_read" on courses;
drop policy if exists "courses_write" on courses;
create policy "courses_read" on courses for select using (true);
create policy "courses_write" on courses for all using (
  exists (select 1 from profiles where id = auth.uid() and school_id = courses.school_id and role in ('admin','super_admin','teacher'))
);

-- All other tables
drop policy if exists "enrollments_all" on course_enrollments;
drop policy if exists "assignments_all" on assignments;
drop policy if exists "submissions_all" on submissions;
drop policy if exists "announcements_all" on announcements;
drop policy if exists "notifications_all" on notifications;
drop policy if exists "applications_all" on student_applications;
drop policy if exists "attendance_all" on attendance;
create policy "enrollments_all" on course_enrollments for all using (true);
create policy "assignments_all" on assignments for all using (true);
create policy "submissions_all" on submissions for all using (true);
create policy "announcements_all" on announcements for all using (true);
create policy "notifications_all" on notifications for all using (true);
create policy "applications_all" on student_applications for all using (true);
create policy "attendance_all" on attendance for all using (true);

-- Auto-create profile on signup trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    split_part(coalesce(new.raw_user_meta_data->>'full_name', ''), ' ', 1),
    split_part(coalesce(new.raw_user_meta_data->>'full_name', ''), ' ', 2)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- SCHEMA ADDITIONS — New LMS Features
-- =============================================================================

-- ─── ALTER existing tables ────────────────────────────────────────────────────

alter table courses
  add column if not exists banner_url text,
  add column if not exists objectives text,
  add column if not exists syllabus text,
  add column if not exists duration text;

alter table student_applications
  add column if not exists notes text,
  add column if not exists reviewed_by uuid references profiles,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

alter table profiles
  add column if not exists school_bio text,
  add column if not exists notification_prefs jsonb default '{}'::jsonb,
  add column if not exists internal_email text,
  add column if not exists unique_student_id text,
  add column if not exists online_at timestamptz;

-- ─── Invitations ──────────────────────────────────────────────────────────────

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools on delete cascade,
  email text not null,
  role text not null check (role in ('admin','teacher','staff','student')),
  token text unique not null default gen_random_uuid()::text,
  invited_by uuid references profiles,
  accepted_at timestamptz,
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);

-- ─── Role Permissions ─────────────────────────────────────────────────────────

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools on delete cascade,
  role text not null,
  permission text not null,
  granted boolean default true,
  created_at timestamptz default now(),
  unique (school_id, role, permission)
);

-- ─── Application Form Builder ─────────────────────────────────────────────────

create table if not exists application_form_fields (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools on delete cascade,
  label text not null,
  field_type text not null check (field_type in ('text','textarea','select','radio','checkbox','file','date')),
  options jsonb,
  is_required boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists application_form_responses (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references student_applications on delete cascade,
  field_id uuid references application_form_fields on delete cascade,
  value text,
  created_at timestamptz default now(),
  unique (application_id, field_id)
);

create table if not exists application_course_selections (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references student_applications on delete cascade,
  course_id uuid references courses on delete cascade,
  created_at timestamptz default now(),
  unique (application_id, course_id)
);

-- ─── Course Resources ─────────────────────────────────────────────────────────

create table if not exists course_resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses on delete cascade,
  title text not null,
  description text,
  resource_type text not null check (resource_type in ('file','link','video','document')),
  url text,
  file_size bigint,
  uploaded_by uuid references profiles,
  created_at timestamptz default now()
);

-- ─── School Resources ─────────────────────────────────────────────────────────

create table if not exists school_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools on delete cascade,
  title text not null,
  description text,
  resource_type text not null check (resource_type in ('file','link','video','document')),
  url text,
  file_size bigint,
  is_public boolean default false,
  uploaded_by uuid references profiles,
  created_at timestamptz default now()
);

-- ─── Chat ─────────────────────────────────────────────────────────────────────

create table if not exists chat_channels (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools on delete cascade,
  course_id uuid references courses on delete cascade,
  name text not null,
  description text,
  channel_type text not null check (channel_type in ('school','course','dm','private')),
  created_by uuid references profiles,
  created_at timestamptz default now()
);

create table if not exists chat_channel_members (
  channel_id uuid references chat_channels on delete cascade,
  user_id uuid references profiles on delete cascade,
  joined_at timestamptz default now(),
  primary key (channel_id, user_id)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references chat_channels on delete cascade,
  sender_id uuid references profiles,
  content text not null,
  parent_id uuid references chat_messages,
  is_edited boolean default false,
  edited_at timestamptz,
  created_at timestamptz default now()
);

-- ─── Forum ────────────────────────────────────────────────────────────────────

create table if not exists forum_topics (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references schools on delete cascade,
  course_id uuid references courses on delete cascade,
  title text not null,
  content text,
  author_id uuid references profiles,
  is_pinned boolean default false,
  is_locked boolean default false,
  view_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists forum_comments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references forum_topics on delete cascade,
  parent_id uuid references forum_comments,
  author_id uuid references profiles,
  content text not null,
  is_answer boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists forum_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles on delete cascade,
  topic_id uuid references forum_topics on delete cascade,
  comment_id uuid references forum_comments on delete cascade,
  reaction text not null,
  created_at timestamptz default now(),
  unique (user_id, topic_id, comment_id, reaction)
);

-- ─── Video Sessions ───────────────────────────────────────────────────────────

create table if not exists video_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses on delete cascade,
  title text not null,
  room_name text unique not null,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references profiles,
  created_at timestamptz default now()
);

-- ─── Quizzes ──────────────────────────────────────────────────────────────────

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses on delete cascade,
  title text not null,
  description text,
  time_limit_minutes int,
  max_attempts int default 1,
  passing_score numeric,
  is_published boolean default false,
  shuffle_questions boolean default false,
  show_results boolean default true,
  created_by uuid references profiles,
  created_at timestamptz default now()
);

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes on delete cascade,
  question_text text not null,
  question_type text not null check (question_type in ('multiple_choice','true_false','short_answer','essay','matching','fill_blank')),
  points numeric default 1,
  sort_order int default 0,
  explanation text,
  created_at timestamptz default now()
);

create table if not exists quiz_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references quiz_questions on delete cascade,
  option_text text not null,
  is_correct boolean default false,
  sort_order int default 0
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid references quizzes on delete cascade,
  student_id uuid references profiles on delete cascade,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  score numeric,
  passed boolean,
  attempt_number int default 1
);

create table if not exists quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references quiz_attempts on delete cascade,
  question_id uuid references quiz_questions on delete cascade,
  answer_text text,
  selected_option_ids uuid[],
  is_correct boolean,
  points_earned numeric,
  created_at timestamptz default now()
);

-- ─── Enable RLS on all new tables ─────────────────────────────────────────────

alter table invitations enable row level security;
alter table role_permissions enable row level security;
alter table application_form_fields enable row level security;
alter table application_form_responses enable row level security;
alter table application_course_selections enable row level security;
alter table course_resources enable row level security;
alter table school_resources enable row level security;
alter table chat_channels enable row level security;
alter table chat_channel_members enable row level security;
alter table chat_messages enable row level security;
alter table forum_topics enable row level security;
alter table forum_comments enable row level security;
alter table forum_reactions enable row level security;
alter table video_sessions enable row level security;
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_question_options enable row level security;
alter table quiz_attempts enable row level security;
alter table quiz_answers enable row level security;

-- Open policies (auth enforced at API layer)
drop policy if exists "invitations_all" on invitations;
drop policy if exists "role_permissions_all" on role_permissions;
drop policy if exists "app_form_fields_all" on application_form_fields;
drop policy if exists "app_form_responses_all" on application_form_responses;
drop policy if exists "app_course_selections_all" on application_course_selections;
drop policy if exists "course_resources_all" on course_resources;
drop policy if exists "school_resources_all" on school_resources;
drop policy if exists "chat_channels_all" on chat_channels;
drop policy if exists "chat_channel_members_all" on chat_channel_members;
drop policy if exists "chat_messages_all" on chat_messages;
drop policy if exists "forum_topics_all" on forum_topics;
drop policy if exists "forum_comments_all" on forum_comments;
drop policy if exists "forum_reactions_all" on forum_reactions;
drop policy if exists "video_sessions_all" on video_sessions;
drop policy if exists "quizzes_all" on quizzes;
drop policy if exists "quiz_questions_all" on quiz_questions;
drop policy if exists "quiz_question_options_all" on quiz_question_options;
drop policy if exists "quiz_attempts_all" on quiz_attempts;
drop policy if exists "quiz_answers_all" on quiz_answers;

create policy "invitations_all" on invitations for all using (true);
create policy "role_permissions_all" on role_permissions for all using (true);
create policy "app_form_fields_all" on application_form_fields for all using (true);
create policy "app_form_responses_all" on application_form_responses for all using (true);
create policy "app_course_selections_all" on application_course_selections for all using (true);
create policy "course_resources_all" on course_resources for all using (true);
create policy "school_resources_all" on school_resources for all using (true);
create policy "chat_channels_all" on chat_channels for all using (true);
create policy "chat_channel_members_all" on chat_channel_members for all using (true);
create policy "chat_messages_all" on chat_messages for all using (true);
create policy "forum_topics_all" on forum_topics for all using (true);
create policy "forum_comments_all" on forum_comments for all using (true);
create policy "forum_reactions_all" on forum_reactions for all using (true);
create policy "video_sessions_all" on video_sessions for all using (true);
create policy "quizzes_all" on quizzes for all using (true);
create policy "quiz_questions_all" on quiz_questions for all using (true);
create policy "quiz_question_options_all" on quiz_question_options for all using (true);
create policy "quiz_attempts_all" on quiz_attempts for all using (true);
create policy "quiz_answers_all" on quiz_answers for all using (true);

-- ─── Fix handle_new_user trigger to use first_name / last_name separately ─────

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name',
             split_part(coalesce(new.raw_user_meta_data->>'full_name', ''), ' ', 1)),
    coalesce(new.raw_user_meta_data->>'last_name',
             split_part(coalesce(new.raw_user_meta_data->>'full_name', ''), ' ', 2))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- notifications table: add message column alias for compatibility
alter table notifications
  add column if not exists message text generated always as (coalesce(body, title)) stored;
