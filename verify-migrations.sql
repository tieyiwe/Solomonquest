-- Run in the Supabase SQL editor to verify every migration from this
-- session actually landed. Each row should show `ok = true`. Any row with
-- `ok = false` means that migration file still needs to be (re-)run.

select * from (values
  ('supabase-schema-additions.sql: tuition_installments.payment_id',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='tuition_installments' and column_name='payment_id')),

  ('supabase-perf-denormalize-email.sql: profiles.email index + trigger fn',
    exists (select 1 from pg_indexes where schemaname='public' and indexname='profiles_email_idx')
    and exists (select 1 from pg_proc where proname='handle_new_user_email')),

  ('test-mode-admin-access.sql: profiles.test_mode_admin_access',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='test_mode_admin_access')),

  ('rubric-grading.sql: assignments.rubric + submissions.rubric_scores',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='assignments' and column_name='rubric')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='submissions' and column_name='rubric_scores')),

  ('stripe-tuition.sql: tuition_installments.stripe_checkout_session_id',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='tuition_installments' and column_name='stripe_checkout_session_id')),

  ('parent-portal.sql: parent_student_links table',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='parent_student_links')),

  ('course-audit-log.sql: course_audit_log table',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='course_audit_log')),

  ('forum-scoping-mentions.sql: forum_mentions table',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='forum_mentions')),

  ('foreign-key-indexes.sql: tuition_installments_payment_id_idx',
    exists (select 1 from pg_indexes where schemaname='public' and indexname='tuition_installments_payment_id_idx')),

  ('terms.sql: terms table + courses.term_id',
    exists (select 1 from information_schema.tables where table_schema='public' and table_name='terms')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='courses' and column_name='term_id')),

  ('forum-reaction-indexes.sql: partial unique indexes',
    exists (select 1 from pg_indexes where schemaname='public' and indexname='forum_reactions_topic_user_idx')
    and exists (select 1 from pg_indexes where schemaname='public' and indexname='forum_reactions_comment_user_idx')),

  ('grading-engine.sql: submissions.feedback/graded_at/graded_by',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='submissions' and column_name='feedback')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='submissions' and column_name='graded_at')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='submissions' and column_name='graded_by')),

  ('grading-engine.sql: courses.attendance_weight_percent',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='courses' and column_name='attendance_weight_percent')),

  ('grading-engine.sql / video-watch-verification.sql: video_watch_progress table',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='video_watch_progress')),

  ('video-watch-progress-atomic-upsert.sql: upsert_video_watch_progress() function',
    exists (select 1 from pg_proc where proname='upsert_video_watch_progress')),

  ('school-creation-requests.sql: school_creation_requests table',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='school_creation_requests')),

  ('profile-suspension.sql: profiles.is_suspended',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='is_suspended')),

  ('schools-deleted-at.sql: schools.deleted_at',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='deleted_at'))

) as checks(migration, ok)
order by ok asc, migration;
