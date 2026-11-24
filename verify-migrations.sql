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

  ('schema-drift-fixes.sql: assignments.assignment_type + require_full_watch',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='assignments' and column_name='assignment_type')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='assignments' and column_name='require_full_watch')),

  ('schema-drift-fixes.sql: attendance.checked_in_at',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='attendance' and column_name='checked_in_at')),

  ('schema-drift-fixes.sql: courses.is_live + class_date',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='courses' and column_name='is_live')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='courses' and column_name='class_date')),

  ('schema-drift-fixes.sql: courses.class_end_time',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='courses' and column_name='class_end_time')),

  ('schema-drift-fixes.sql: schools.applications_open + assignment_routing',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='applications_open')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='assignment_routing')),

  ('schema-drift-fixes.sql: role_permissions.feature + is_enabled',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='role_permissions' and column_name='feature')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='role_permissions' and column_name='is_enabled')),

  ('schema-drift-fixes.sql: video_sessions.is_active',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='video_sessions' and column_name='is_active')),

  ('schema-drift-fixes.sql: student_applications.updated_at',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='student_applications' and column_name='updated_at')),

  ('schema-drift-fixes.sql: quizzes.attempt_limit + release_scores_immediately',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quizzes' and column_name='attempt_limit')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quizzes' and column_name='release_scores_immediately')),

  ('schema-drift-fixes.sql: quiz_questions.order_index + question + type',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quiz_questions' and column_name='order_index')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quiz_questions' and column_name='question')),

  ('schema-drift-fixes.sql: quiz_attempts.status/earned_points/answers',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quiz_attempts' and column_name='status')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quiz_attempts' and column_name='earned_points')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quiz_attempts' and column_name='answers')),

  ('schools-deleted-at.sql: schools.deleted_at',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='deleted_at')),

  ('usage-tracking.sql: usage_events table',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='usage_events')),

  ('stripe-connect.sql: schools.stripe_connect_account_id',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='stripe_connect_account_id')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='stripe_connect_status')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='stripe_connect_charges_enabled')),

  ('accounting-suite.sql: expenses table',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='expenses')),

  ('supabase-schema-additions.sql: invitations.archived',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='invitations' and column_name='archived')),

  ('resource-download-count.sql: school_resources.download_count + increment fn',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='school_resources' and column_name='download_count')
    and exists (select 1 from information_schema.routines
      where routine_schema='public' and routine_name='increment_school_resource_download')),

  ('submission-files.sql: submissions.file_url + file_name',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='submissions' and column_name='file_url')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='submissions' and column_name='file_name')),

  ('storage-buckets.sql: school-assets + course-resources buckets and upload policies',
    exists (select 1 from storage.buckets where id='school-assets')
    and exists (select 1 from storage.buckets where id='course-resources')
    and exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='course-resources insert')),

  ('rls-lockdown.sql: permissive using(true) policies dropped + narrow ones added',
    not exists (select 1 from pg_policies where schemaname='public'
      and policyname in ('submissions_all', 'Allow all on quiz_questions', 'profiles_read', 'profiles_update'))
    and not exists (select 1 from pg_policies where schemaname='public'
      and (qual = 'true' or with_check = 'true'))
    and exists (select 1 from pg_policies where schemaname='public'
      and policyname='lockdown_notifications_select_own')),

  ('course-modules.sql: course_modules, course_lessons, course_module_items, lesson_completions',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='course_modules')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='course_lessons')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='course_module_items')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='lesson_completions')),

  ('late-work-and-alerts.sql: late policy columns + assignment_extensions + school_risk_settings',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='assignments' and column_name='late_cutoff_at')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='submissions' and column_name='raw_grade')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='assignment_extensions')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='school_risk_settings')),

  ('certificates.sql: certificate_settings + certificates tables',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='certificate_settings')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='certificates')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='certificates' and column_name='verification_code')),

  ('question-banks.sql: question_banks, question_bank_questions, quiz_bank_draws + quiz_attempts.drawn_question_ids',
    exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='question_banks')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='question_bank_questions')
    and exists (select 1 from information_schema.tables
      where table_schema='public' and table_name='quiz_bank_draws')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='quiz_attempts' and column_name='drawn_question_ids')),

  ('bulk-import.sql: invitations.first_name + last_name + course_ids',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='invitations' and column_name='first_name')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='invitations' and column_name='last_name')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='invitations' and column_name='course_ids')),

  ('school-branding.sql: schools.branding + tagline + logo_url',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='branding')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='tagline')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='schools' and column_name='logo_url')),

  ('chat-message-delete.sql: chat_messages.deleted_at + deleted_by',
    exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='chat_messages' and column_name='deleted_at')
    and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='chat_messages' and column_name='deleted_by')),

  ('chat-typing.sql: realtime.messages typing policies',
    exists (select 1 from pg_policies
      where schemaname='realtime' and tablename='messages' and policyname='chat_typing_select_member')
    and exists (select 1 from pg_policies
      where schemaname='realtime' and tablename='messages' and policyname='chat_typing_insert_member'))

) as checks(migration, ok)
order by ok asc, migration;
