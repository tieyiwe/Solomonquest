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
