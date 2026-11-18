-- =============================================================================
-- AL-NIBRAS CLASS UNION PORTAL — COMPLETE NORMALIZED SUPABASE SCHEMA & RLS
-- =============================================================================
-- Safe, idempotent PostgreSQL DDL script for a new or existing Supabase project.
-- - Does NOT drop tables or delete/overwrite existing data or bucket privacy.
-- - Defines all 30 normalized application tables matching PortalDatabaseState.
-- - Never stores or exposes password hashes in public.users or state snapshots
--   in public.portal_settings.
-- - Supports SUPER_ADMIN, ADMIN, TEACHER, and STUDENT roles with trigger-level
--   and RLS-level protection of the SUPER ADMIN (admin_super) account.
-- - Fixes all foreign key constraints (zero NOT NULL with ON DELETE SET NULL).
-- - Enables Row Level Security (RLS) on all 30 tables with strict student
--   privacy isolation.
-- - Configures all 8 Supabase Storage buckets with ON CONFLICT (id) DO NOTHING.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 0: EXTENSIONS, UPDATED_AT TRIGGER & SUPER ADMIN PROTECTION TRIGGER
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Enforces immutable protection for the SUPER ADMIN ('admin_super') account
CREATE OR REPLACE FUNCTION public.protect_super_admin_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.uid = 'admin_super' OR OLD.is_super_admin = TRUE THEN
      RAISE EXCEPTION 'Protected Account: The SUPER ADMIN account (%) cannot be deleted.', OLD.uid;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.uid = 'admin_super' THEN
      IF NEW.uid <> 'admin_super'
         OR NEW.is_super_admin <> TRUE
         OR NEW.status <> 'active'
         OR LOWER(NEW.role) NOT IN ('admin', 'super_admin') THEN
        RAISE EXCEPTION 'Protected Account: The SUPER ADMIN account cannot be deactivated, renamed, or demoted.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- PART 1: CORE APPLICATION TABLES (30 TABLES MATCHING PortalDatabaseState)
-- =============================================================================

-- 1. USERS (Super Admin, Admin, Teacher, Student) -> state.users
-- Security Note: Credentials are verified server-side only and never stored in public.users.
CREATE TABLE IF NOT EXISTS public.users (
  uid TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN (
      'super_admin',
      'admin',
      'teacher',
      'student',
      'SUPER_ADMIN',
      'ADMIN',
      'TEACHER',
      'STUDENT'
    )
  ),
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  contact_email TEXT,
  contact_phone TEXT,
  avatar_url TEXT NOT NULL,
  department TEXT NOT NULL,
  class_info TEXT,
  designation TEXT,
  qualifications TEXT,
  house_building TEXT,
  street_road TEXT,
  village_area TEXT,
  post_office TEXT,
  police_station TEXT,
  district TEXT,
  state TEXT,
  pin_code TEXT,
  country TEXT DEFAULT 'India',
  address JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_student_id ON public.users(student_id);

-- 2. COMMITTEE MEMBERS -> state.committeeMembers
CREATE TABLE IF NOT EXISTS public.committee_members (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  position TEXT,
  designation TEXT,
  role_category TEXT DEFAULT 'Executive' CHECK (
    role_category IN ('Executive', 'Advisory', 'Academic', 'Cultural', 'Media', 'Finance')
  ),
  department TEXT NOT NULL,
  batch_info TEXT,
  batch TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  avatar_url TEXT NOT NULL,
  bio TEXT,
  display_order INTEGER NOT NULL DEFAULT 1,
  show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_committee_members_status ON public.committee_members(status);
CREATE INDEX IF NOT EXISTS idx_committee_members_order ON public.committee_members(display_order);

-- 3. HOMEPAGE SLIDESHOW SLIDES -> state.slideshow
CREATE TABLE IF NOT EXISTS public.slideshow_slides (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  image_url TEXT NOT NULL,
  cta_text TEXT,
  cta_href TEXT,
  cta_link TEXT,
  display_order INTEGER NOT NULL DEFAULT 1,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slideshow_slides_visible ON public.slideshow_slides(visible, display_order);

-- 4. NOTICES -> state.notices
CREATE TABLE IF NOT EXISTS public.notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT,
  reference_no TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  effective_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
  attachment_url TEXT,
  attachment_name TEXT,
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notices_status ON public.notices(status);
CREATE INDEX IF NOT EXISTS idx_notices_author_id ON public.notices(author_id);

-- 5. ANNOUNCEMENTS -> state.announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
  attachment_url TEXT,
  attachment_name TEXT,
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_author_id ON public.announcements(author_id);

-- 6. EVENTS -> state.events
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  event_date TEXT NOT NULL,
  venue TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
  attachment_url TEXT,
  attachment_name TEXT,
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date);

-- 7. CALENDAR EVENTS -> state.calendarEvents
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  location TEXT NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'students', 'private')),
  reminder TEXT,
  image_url TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_dates ON public.calendar_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_visibility ON public.calendar_events(visibility);

-- 8. PHOTO GALLERY (Public Gallery & User Panel Gallery) -> state.gallery
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  description TEXT,
  album_name TEXT,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  category TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT 'public' CHECK (destination IN ('public', 'user')),
  show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_items_destination ON public.gallery_items(destination, status);

-- 9. VIDEO GALLERY (Public Video Gallery & User Panel Video Gallery) -> state.videos
CREATE TABLE IF NOT EXISTS public.video_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  playlist TEXT NOT NULL DEFAULT 'General',
  source_type TEXT NOT NULL DEFAULT 'upload',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  duration TEXT,
  publication_date TEXT,
  destination TEXT NOT NULL DEFAULT 'public' CHECK (destination IN ('public', 'user')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_on_homepage BOOLEAN NOT NULL DEFAULT FALSE,
  show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  uploaded_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  uploaded_by_name TEXT NOT NULL DEFAULT 'SUPER ADMIN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_items_destination ON public.video_items(destination, status);

-- 10. STUDY MATERIALS & RESOURCES -> state.resources
CREATE TABLE IF NOT EXISTS public.study_resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  subject TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_resources_status ON public.study_resources(status);
CREATE INDEX IF NOT EXISTS idx_study_resources_subject ON public.study_resources(subject);

-- 11. PROGRAM RESULTS -> state.programResults
CREATE TABLE IF NOT EXISTS public.program_results (
  id TEXT PRIMARY KEY,
  program_name TEXT NOT NULL,
  category TEXT NOT NULL,
  program_date TEXT NOT NULL,
  publication_date TEXT,
  venue TEXT NOT NULL DEFAULT 'Main Auditorium',
  description TEXT NOT NULL,
  winner_summary TEXT NOT NULL,
  participants JSONB NOT NULL DEFAULT '[]'::JSONB,
  certificate_url TEXT,
  certificate_name TEXT,
  document_url TEXT,
  document_name TEXT,
  image_url TEXT,
  certificate_title TEXT,
  certificate_subtitle TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  author_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_results_status ON public.program_results(status);

-- 12. STUDENT RESULTS & AUTOMATIC POINTS -> state.studentResults
CREATE TABLE IF NOT EXISTS public.student_results (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES public.program_results(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  program_category TEXT NOT NULL,
  program_date TEXT NOT NULL,
  publication_date TEXT NOT NULL,
  student_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_avatar TEXT NOT NULL,
  student_department TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('1st Place', '2nd Place', '3rd Place', 'None')),
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'None')),
  position_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  grade_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  remarks TEXT,
  judge_name TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
  certificate_id TEXT,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_results_uid ON public.student_results(student_uid);
CREATE INDEX IF NOT EXISTS idx_student_results_program_id ON public.student_results(program_id);

-- 13. STUDENT POINT SUMMARIES (Leaderboard & Achievement Totals) -> state.studentPoints
CREATE TABLE IF NOT EXISTS public.student_points (
  student_uid TEXT PRIMARY KEY REFERENCES public.users(uid) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_avatar TEXT NOT NULL,
  student_department TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  first_place_count INTEGER NOT NULL DEFAULT 0,
  second_place_count INTEGER NOT NULL DEFAULT 0,
  third_place_count INTEGER NOT NULL DEFAULT 0,
  grade_a_count INTEGER NOT NULL DEFAULT 0,
  grade_b_count INTEGER NOT NULL DEFAULT 0,
  total_achievements INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_points_total ON public.student_points(total_points DESC);

-- 14. POINT TRANSACTIONS (Audit Trail for Automatic Points) -> state.pointTransactions
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id TEXT PRIMARY KEY,
  student_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  program_id TEXT REFERENCES public.program_results(id) ON DELETE SET NULL,
  program_name TEXT NOT NULL,
  result_id TEXT REFERENCES public.student_results(id) ON DELETE SET NULL,
  delta_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  previous_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  new_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL CHECK (
    reason IN ('RESULT_PUBLISHED', 'RESULT_EDITED', 'RESULT_DELETED', 'ACCOUNT_CLEANUP')
  ),
  position TEXT NOT NULL CHECK (position IN ('1st Place', '2nd Place', '3rd Place', 'None')),
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'None')),
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_student_uid ON public.point_transactions(student_uid);

-- 15. CERTIFICATES -> state.certificates
CREATE TABLE IF NOT EXISTS public.certificates (
  id TEXT PRIMARY KEY,
  certificate_number TEXT NOT NULL UNIQUE,
  result_id TEXT NOT NULL REFERENCES public.student_results(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL REFERENCES public.program_results(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  program_category TEXT NOT NULL,
  program_date TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  publication_date TEXT,
  student_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_department TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('1st Place', '2nd Place', '3rd Place', 'None')),
  grade TEXT NOT NULL CHECK (grade IN ('A', 'B', 'None')),
  position_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  grade_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  authorized_by_name TEXT NOT NULL,
  authorized_by_designation TEXT NOT NULL,
  union_name TEXT NOT NULL,
  logo_url TEXT,
  qr_verification_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'published', 'draft')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_student_uid ON public.certificates(student_uid);
CREATE INDEX IF NOT EXISTS idx_certificates_result_id ON public.certificates(result_id);

-- 16. FINES (Strictly Private per Student) -> state.fines
CREATE TABLE IF NOT EXISTS public.fines (
  id TEXT PRIMARY KEY,
  student_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_roll TEXT NOT NULL,
  student_department TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'overdue', 'cancelled')),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  paid_at TEXT,
  document_url TEXT,
  document_name TEXT,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fines_student_uid ON public.fines(student_uid);
CREATE INDEX IF NOT EXISTS idx_fines_status ON public.fines(status);

-- 17. UNION INCOME RECORDS -> state.income
CREATE TABLE IF NOT EXISTS public.income_records (
  id TEXT PRIMARY KEY,
  receipt_number TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tx_date TEXT NOT NULL,
  received_from TEXT,
  source_received_from TEXT,
  student_uid TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  student_name TEXT,
  student_id TEXT,
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  reference_receipt_no TEXT,
  transaction_reference TEXT,
  description TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  attachment_name TEXT,
  receipt_url TEXT,
  receipt_name TEXT,
  source_type TEXT DEFAULT 'GENERAL_INCOME' CHECK (
    source_type IN ('GENERAL_INCOME', 'STUDENT_CONTRIBUTION', 'DUE_PAYMENT')
  ),
  source_contribution_id TEXT,
  source_due_id TEXT,
  linked_contribution_id TEXT,
  linked_due_id TEXT,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_records_student_uid ON public.income_records(student_uid);
CREATE INDEX IF NOT EXISTS idx_income_records_tx_date ON public.income_records(tx_date);

-- 18. UNION EXPENSE RECORDS -> state.expenses
CREATE TABLE IF NOT EXISTS public.expense_records (
  id TEXT PRIMARY KEY,
  voucher_number TEXT,
  title TEXT NOT NULL,
  expense_title TEXT,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tx_date TEXT NOT NULL,
  expense_date TEXT,
  paid_to TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  bill_invoice_no TEXT,
  approved_by TEXT,
  description TEXT NOT NULL DEFAULT '',
  purpose TEXT,
  bill_url TEXT,
  bill_name TEXT,
  verified BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_records_tx_date ON public.expense_records(tx_date);

-- 19. STUDENT CONTRIBUTIONS -> state.studentContributions
CREATE TABLE IF NOT EXISTS public.student_contributions (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL,
  student_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id TEXT NOT NULL,
  roll_number TEXT,
  student_class TEXT,
  class_info TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  purpose TEXT NOT NULL,
  contribution_purpose TEXT,
  category TEXT NOT NULL,
  reference_number TEXT,
  transaction_reference TEXT,
  receipt_url TEXT,
  receipt_name TEXT,
  receipt_id TEXT,
  remarks TEXT,
  description TEXT,
  payment_status TEXT NOT NULL DEFAULT 'Paid' CHECK (payment_status IN ('paid', 'Paid')),
  linked_income_id TEXT,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_contributions_uid ON public.student_contributions(student_uid);

-- 20. STUDENT DUES -> state.studentDues
CREATE TABLE IF NOT EXISTS public.student_dues (
  id TEXT PRIMARY KEY,
  student_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id TEXT NOT NULL,
  roll_number TEXT,
  student_class TEXT,
  class_info TEXT,
  fee_title TEXT NOT NULL,
  due_title TEXT,
  category TEXT NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  issue_date TEXT,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (
    status IN (
      'pending',
      'partial',
      'paid',
      'overdue',
      'cancelled',
      'Pending',
      'Partially Paid',
      'Paid',
      'Cancelled'
    )
  ),
  remarks TEXT,
  payments JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_dues_uid ON public.student_dues(student_uid);
CREATE INDEX IF NOT EXISTS idx_student_dues_status ON public.student_dues(status);

-- 21. FINANCIAL RECEIPTS -> state.financialReceipts
CREATE TABLE IF NOT EXISTS public.financial_receipts (
  id TEXT PRIMARY KEY,
  receipt_number TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL CHECK (
    tx_type IN ('income', 'contribution', 'due_payment', 'fine_payment')
  ),
  source_record_id TEXT NOT NULL,
  student_uid TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  student_name TEXT,
  student_id TEXT,
  payer_or_payee_name TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tx_date TEXT NOT NULL,
  purpose TEXT,
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  transaction_reference TEXT,
  remarks TEXT,
  source_type TEXT CHECK (source_type IN ('CONTRIBUTION', 'DUE_PAYMENT', 'FINE_PAYMENT')),
  authorized_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_receipts_student_uid ON public.financial_receipts(student_uid);

-- 22. FINANCIAL AUDIT LOGS -> state.financialAuditLogs
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_audit_logs_actor_id ON public.financial_audit_logs(actor_id);

-- 23. DIRECT INQUIRIES & MESSAGES -> state.messages
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
  reply_text TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_id ON public.direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_id ON public.direct_messages(recipient_id);

-- 24. LIVE CHAT MESSAGES -> state.chatMessages
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  text TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachments JSONB DEFAULT '[]'::JSONB,
  reply_to_id TEXT,
  reply_to_text TEXT,
  reply_to_sender TEXT,
  reply_to_sender_name TEXT,
  forwarded_from TEXT,
  forwarded_from_name TEXT,
  delivered BOOLEAN NOT NULL DEFAULT TRUE,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient_id ON public.chat_messages(recipient_id);

-- 25. STUDENT FEEDBACK RECORDS (Strictly Private per Student) -> state.feedback
CREATE TABLE IF NOT EXISTS public.feedback_records (
  id TEXT PRIMARY KEY,
  student_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  rating INTEGER DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'resolved')),
  admin_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_records_student_uid ON public.feedback_records(student_uid);

-- 26. PORTAL NOTIFICATIONS -> state.notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notif_type TEXT NOT NULL CHECK (
    notif_type IN (
      'announcement',
      'notice',
      'event',
      'system',
      'fine',
      'chat',
      'result',
      'certificate',
      'finance'
    )
  ),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_uids JSONB NOT NULL DEFAULT '[]'::JSONB,
  related_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);

-- 27. ACTIVITY & SECURITY LOGS -> state.activityLogs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  details TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON public.activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- 28. PASSWORD RESET LOGS -> state.passwordResetLogs
CREATE TABLE IF NOT EXISTS public.password_reset_logs (
  id TEXT PRIMARY KEY,
  target_uid TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  target_name TEXT NOT NULL,
  target_role TEXT NOT NULL,
  target_username TEXT NOT NULL DEFAULT '',
  initiated_by_uid TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  initiated_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('initiated', 'completed')),
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_logs_target_uid ON public.password_reset_logs(target_uid);

-- 29. CUSTOM CATEGORY & TYPE OPTIONS -> state.customTypes
CREATE TABLE IF NOT EXISTS public.custom_types (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_types_module ON public.custom_types(module);

-- 30. PORTAL SETTINGS, BRANDING, HOMEPAGE & CERTIFICATE CONFIG -> state.settings / branding / homepageConfig / certificateSettings
-- Security Note: Contains ONLY public institutional display settings. Private state snapshots and backup metadata are excluded.
CREATE TABLE IF NOT EXISTS public.portal_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  branding JSONB NOT NULL DEFAULT '{}'::JSONB,
  homepage_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  certificate_settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 31. APPOINTMENT BOOKINGS -> state.appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  department TEXT NOT NULL,
  preferred_date TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  purpose TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  student_uid TEXT REFERENCES public.users(uid) ON DELETE SET NULL,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_preferred_date ON public.appointments(preferred_date);
CREATE INDEX IF NOT EXISTS idx_appointments_student_uid ON public.appointments(student_uid);

-- =============================================================================
-- PART 2: AUTOMATIC UPDATED_AT & SUPER ADMIN PROTECTION TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.users;
CREATE TRIGGER trg_protect_super_admin
BEFORE UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_account();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_committee_members_updated_at ON public.committee_members;
CREATE TRIGGER trg_committee_members_updated_at BEFORE UPDATE ON public.committee_members
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_slideshow_slides_updated_at ON public.slideshow_slides;
CREATE TRIGGER trg_slideshow_slides_updated_at BEFORE UPDATE ON public.slideshow_slides
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_notices_updated_at ON public.notices;
CREATE TRIGGER trg_notices_updated_at BEFORE UPDATE ON public.notices
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated_at ON public.events;
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_gallery_items_updated_at ON public.gallery_items;
CREATE TRIGGER trg_gallery_items_updated_at BEFORE UPDATE ON public.gallery_items
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_video_items_updated_at ON public.video_items;
CREATE TRIGGER trg_video_items_updated_at BEFORE UPDATE ON public.video_items
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_study_resources_updated_at ON public.study_resources;
CREATE TRIGGER trg_study_resources_updated_at BEFORE UPDATE ON public.study_resources
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_program_results_updated_at ON public.program_results;
CREATE TRIGGER trg_program_results_updated_at BEFORE UPDATE ON public.program_results
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_student_results_updated_at ON public.student_results;
CREATE TRIGGER trg_student_results_updated_at BEFORE UPDATE ON public.student_results
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_student_points_updated_at ON public.student_points;
CREATE TRIGGER trg_student_points_updated_at BEFORE UPDATE ON public.student_points
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_certificates_updated_at ON public.certificates;
CREATE TRIGGER trg_certificates_updated_at BEFORE UPDATE ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_fines_updated_at ON public.fines;
CREATE TRIGGER trg_fines_updated_at BEFORE UPDATE ON public.fines
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_income_records_updated_at ON public.income_records;
CREATE TRIGGER trg_income_records_updated_at BEFORE UPDATE ON public.income_records
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_expense_records_updated_at ON public.expense_records;
CREATE TRIGGER trg_expense_records_updated_at BEFORE UPDATE ON public.expense_records
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_student_contributions_updated_at ON public.student_contributions;
CREATE TRIGGER trg_student_contributions_updated_at BEFORE UPDATE ON public.student_contributions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_student_dues_updated_at ON public.student_dues;
CREATE TRIGGER trg_student_dues_updated_at BEFORE UPDATE ON public.student_dues
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_direct_messages_updated_at ON public.direct_messages;
CREATE TRIGGER trg_direct_messages_updated_at BEFORE UPDATE ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_feedback_records_updated_at ON public.feedback_records;
CREATE TRIGGER trg_feedback_records_updated_at BEFORE UPDATE ON public.feedback_records
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_portal_settings_updated_at ON public.portal_settings;
CREATE TRIGGER trg_portal_settings_updated_at BEFORE UPDATE ON public.portal_settings
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- PART 3: PRESERVE INITIAL SUPER ADMIN ACCOUNT (IDEMPOTENT, NON-DESTRUCTIVE)
-- =============================================================================
-- Seeds the SUPER ADMIN profile metadata matching lib/seed-data.ts (role = 'admin',
-- is_super_admin = TRUE) without storing or inventing any password hash.
INSERT INTO public.users (
  uid,
  full_name,
  username,
  student_id,
  roll_number,
  role,
  is_super_admin,
  status,
  contact_email,
  contact_phone,
  avatar_url,
  department,
  class_info
)
VALUES (
  'admin_super',
  'SUPER ADMIN',
  'alnibras@admin',
  'ADM-0001',
  'EXEC-01',
  'admin',
  TRUE,
  'active',
  'masudalam220105@gmail.com',
  '+91-98450-11000',
  '/images/avatar_admin_portrait.jpg',
  'Central Union Directorate',
  '11th Batch of DHBC'
)
ON CONFLICT (uid) DO NOTHING;

-- =============================================================================
-- PART 4: SECURITY HELPER FUNCTIONS FOR ROLE-BASED ACCESS CONTROL (RBAC)
-- =============================================================================
-- Resolves the current caller's UID from verified Supabase Auth JWT claims
CREATE OR REPLACE FUNCTION public.current_user_uid()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claims AS (
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb AS jwt
  ),
  direct_uid AS (
    SELECT COALESCE(
      auth.uid()::text,
      NULLIF((SELECT jwt ->> 'uid' FROM claims), ''),
      NULLIF((SELECT jwt ->> 'sub' FROM claims), '')
    ) AS val
  ),
  email_matched_uid AS (
    SELECT u.uid
    FROM public.users u, claims c
    WHERE auth.uid() IS NOT NULL
      AND u.status = 'active'
      AND NULLIF(TRIM(COALESCE(c.jwt ->> 'email', '')), '') IS NOT NULL
      AND LOWER(u.contact_email) = LOWER(TRIM(c.jwt ->> 'email'))
      AND (
        COALESCE(
          (c.jwt -> 'user_metadata' ->> 'email_verified')::boolean,
          (c.jwt ->> 'email_verified')::boolean,
          FALSE
        ) = TRUE
        OR COALESCE(c.jwt -> 'app_metadata' ->> 'provider', '') = 'google'
      )
    ORDER BY (u.uid = 'admin_super') DESC
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT u.uid FROM public.users u, direct_uid d WHERE u.uid = d.val LIMIT 1),
    (SELECT uid FROM email_matched_uid),
    (SELECT val FROM direct_uid)
  );
$$;

-- Returns normalized lowercase role ('super_admin', 'admin', 'teacher', 'student') for active user
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN u.is_super_admin = TRUE OR u.uid = 'admin_super' OR LOWER(u.role) = 'super_admin' THEN 'super_admin'
    ELSE LOWER(u.role)
  END
  FROM public.users u
  WHERE u.uid = public.current_user_uid()
    AND u.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'super_admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('super_admin', 'admin'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'teacher', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_student()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'student', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() IN ('super_admin', 'admin', 'teacher'), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role() IN ('super_admin', 'admin', 'teacher', 'student'),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_financial_statement_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (ps.settings ->> 'enableStudentFinancialStatement')::boolean
      FROM public.portal_settings ps
      WHERE ps.id = 'singleton'
      LIMIT 1
    ),
    FALSE
  );
$$;

-- =============================================================================
-- PART 5: ENABLE ROW LEVEL SECURITY (RLS) ON ALL 30 TABLES
-- =============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slideshow_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PART 6: GRANULAR ROW LEVEL SECURITY POLICIES FOR ALL 30 TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. public.users Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_own_or_staff" ON public.users;
CREATE POLICY "users_select_own_or_staff"
ON public.users FOR SELECT
USING (
  uid = public.current_user_uid()
  OR public.is_staff()
);

DROP POLICY IF EXISTS "users_insert_admin_only" ON public.users;
CREATE POLICY "users_insert_admin_only"
ON public.users FOR INSERT
WITH CHECK (
  public.is_admin()
  AND (
    public.is_super_admin()
    OR (LOWER(role) IN ('student', 'teacher') AND is_super_admin = FALSE)
  )
);

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
CREATE POLICY "users_update_self_or_admin"
ON public.users FOR UPDATE
USING (
  -- Only SUPER ADMIN can target the admin_super or any is_super_admin row
  public.is_super_admin()
  OR (
    public.is_admin()
    AND uid <> 'admin_super'
    AND is_super_admin = FALSE
    AND LOWER(role) IN ('student', 'teacher')
  )
  OR (
    uid = public.current_user_uid()
    AND uid <> 'admin_super'
    AND is_super_admin = FALSE
  )
)
WITH CHECK (
  (
    public.is_super_admin()
    AND (
      uid <> 'admin_super'
      OR (status = 'active' AND is_super_admin = TRUE AND LOWER(role) IN ('admin', 'super_admin'))
    )
  )
  OR (
    public.is_admin()
    AND uid <> 'admin_super'
    AND is_super_admin = FALSE
    AND LOWER(role) IN ('student', 'teacher')
  )
  OR (
    uid = public.current_user_uid()
    AND uid <> 'admin_super'
    AND is_super_admin = FALSE
    AND LOWER(role) = public.current_user_role()
    AND status = 'active'
  )
);

DROP POLICY IF EXISTS "users_delete_admin_protect_super_admin" ON public.users;
CREATE POLICY "users_delete_admin_protect_super_admin"
ON public.users FOR DELETE
USING (
  public.is_admin()
  AND uid <> 'admin_super'
  AND is_super_admin = FALSE
  AND (public.is_super_admin() OR LOWER(role) IN ('student', 'teacher'))
);

-- -----------------------------------------------------------------------------
-- 2. public.committee_members Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "committee_members_select_public_or_staff" ON public.committee_members;
CREATE POLICY "committee_members_select_public_or_staff"
ON public.committee_members FOR SELECT
USING (status = 'published' OR public.is_staff());

DROP POLICY IF EXISTS "committee_members_write_admin" ON public.committee_members;
CREATE POLICY "committee_members_write_admin"
ON public.committee_members FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. public.slideshow_slides Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "slideshow_slides_select_public_or_staff" ON public.slideshow_slides;
CREATE POLICY "slideshow_slides_select_public_or_staff"
ON public.slideshow_slides FOR SELECT
USING ((visible = TRUE AND enabled = TRUE) OR public.is_staff());

DROP POLICY IF EXISTS "slideshow_slides_write_admin" ON public.slideshow_slides;
CREATE POLICY "slideshow_slides_write_admin"
ON public.slideshow_slides FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. public.notices Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notices_select_published_or_staff" ON public.notices;
CREATE POLICY "notices_select_published_or_staff"
ON public.notices FOR SELECT
USING (status = 'published' OR public.is_staff());

DROP POLICY IF EXISTS "notices_write_staff" ON public.notices;
CREATE POLICY "notices_write_staff"
ON public.notices FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 5. public.announcements Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "announcements_select_published_or_staff" ON public.announcements;
CREATE POLICY "announcements_select_published_or_staff"
ON public.announcements FOR SELECT
USING (status = 'published' OR public.is_staff());

DROP POLICY IF EXISTS "announcements_write_staff" ON public.announcements;
CREATE POLICY "announcements_write_staff"
ON public.announcements FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 6. public.events Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "events_select_published_or_staff" ON public.events;
CREATE POLICY "events_select_published_or_staff"
ON public.events FOR SELECT
USING (status = 'published' OR public.is_staff());

DROP POLICY IF EXISTS "events_write_admin" ON public.events;
CREATE POLICY "events_write_admin"
ON public.events FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 7. public.calendar_events Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "calendar_events_select_scoped" ON public.calendar_events;
CREATE POLICY "calendar_events_select_scoped"
ON public.calendar_events FOR SELECT
USING (
  visibility = 'public'
  OR (visibility = 'students' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "calendar_events_write_staff" ON public.calendar_events;
CREATE POLICY "calendar_events_write_staff"
ON public.calendar_events FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 8. public.gallery_items Policies (Public vs User Panel Gallery)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "gallery_items_select_scoped" ON public.gallery_items;
CREATE POLICY "gallery_items_select_scoped"
ON public.gallery_items FOR SELECT
USING (
  (status = 'published' AND destination = 'public')
  OR (status = 'published' AND destination = 'user' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "gallery_items_write_admin" ON public.gallery_items;
CREATE POLICY "gallery_items_write_admin"
ON public.gallery_items FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 9. public.video_items Policies (Public vs User Panel Videos)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "video_items_select_scoped" ON public.video_items;
CREATE POLICY "video_items_select_scoped"
ON public.video_items FOR SELECT
USING (
  (status = 'published' AND destination = 'public')
  OR (status = 'published' AND destination = 'user' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "video_items_write_staff" ON public.video_items;
CREATE POLICY "video_items_write_staff"
ON public.video_items FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 10. public.study_resources Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "study_resources_select_authenticated" ON public.study_resources;
CREATE POLICY "study_resources_select_authenticated"
ON public.study_resources FOR SELECT
USING (
  (status = 'published' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "study_resources_write_staff" ON public.study_resources;
CREATE POLICY "study_resources_write_staff"
ON public.study_resources FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 11. public.program_results Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "program_results_select_published_or_staff" ON public.program_results;
CREATE POLICY "program_results_select_published_or_staff"
ON public.program_results FOR SELECT
USING (
  (status = 'published' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "program_results_write_staff" ON public.program_results;
CREATE POLICY "program_results_write_staff"
ON public.program_results FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 12. public.student_results Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "student_results_select_authenticated_or_staff" ON public.student_results;
CREATE POLICY "student_results_select_authenticated_or_staff"
ON public.student_results FOR SELECT
USING (
  (status = 'published' AND public.is_active_user())
  OR student_uid = public.current_user_uid()
  OR public.is_staff()
);

DROP POLICY IF EXISTS "student_results_write_staff" ON public.student_results;
CREATE POLICY "student_results_write_staff"
ON public.student_results FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 13. public.student_points Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "student_points_select_authenticated" ON public.student_points;
CREATE POLICY "student_points_select_authenticated"
ON public.student_points FOR SELECT
USING (public.is_active_user() OR public.is_staff());

DROP POLICY IF EXISTS "student_points_write_staff" ON public.student_points;
CREATE POLICY "student_points_write_staff"
ON public.student_points FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 14. public.point_transactions Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "point_transactions_select_own_or_staff" ON public.point_transactions;
CREATE POLICY "point_transactions_select_own_or_staff"
ON public.point_transactions FOR SELECT
USING (
  student_uid = public.current_user_uid()
  OR public.is_staff()
);

DROP POLICY IF EXISTS "point_transactions_write_staff" ON public.point_transactions;
CREATE POLICY "point_transactions_write_staff"
ON public.point_transactions FOR ALL
USING (public.is_staff())
WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- 15. public.certificates Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "certificates_select_own_or_staff" ON public.certificates;
CREATE POLICY "certificates_select_own_or_staff"
ON public.certificates FOR SELECT
USING (
  (student_uid = public.current_user_uid() AND status IN ('active', 'published'))
  OR public.is_staff()
);

DROP POLICY IF EXISTS "certificates_write_admin" ON public.certificates;
CREATE POLICY "certificates_write_admin"
ON public.certificates FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 16. public.fines Policies (Strictly Private per Student)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "fines_select_own_or_admin" ON public.fines;
CREATE POLICY "fines_select_own_or_admin"
ON public.fines FOR SELECT
USING (
  student_uid = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "fines_write_admin" ON public.fines;
CREATE POLICY "fines_write_admin"
ON public.fines FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 17. public.income_records Policies
-- Prevents cross-student exposure of DUE_PAYMENT and STUDENT_CONTRIBUTION rows
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "income_records_select_admin_or_statement_enabled" ON public.income_records;
CREATE POLICY "income_records_select_admin_or_statement_enabled"
ON public.income_records FOR SELECT
USING (
  public.is_admin()
  OR student_uid = public.current_user_uid()
  OR (
    public.is_active_user()
    AND public.is_student_financial_statement_enabled()
    AND source_type = 'GENERAL_INCOME'
    AND student_uid IS NULL
  )
);

DROP POLICY IF EXISTS "income_records_write_admin" ON public.income_records;
CREATE POLICY "income_records_write_admin"
ON public.income_records FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 18. public.expense_records Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "expense_records_select_admin_or_statement_enabled" ON public.expense_records;
CREATE POLICY "expense_records_select_admin_or_statement_enabled"
ON public.expense_records FOR SELECT
USING (
  public.is_admin()
  OR (public.is_active_user() AND public.is_student_financial_statement_enabled())
);

DROP POLICY IF EXISTS "expense_records_write_admin" ON public.expense_records;
CREATE POLICY "expense_records_write_admin"
ON public.expense_records FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 19. public.student_contributions Policies (Strictly Private per Student)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "student_contributions_select_own_or_admin" ON public.student_contributions;
CREATE POLICY "student_contributions_select_own_or_admin"
ON public.student_contributions FOR SELECT
USING (
  student_uid = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "student_contributions_write_admin" ON public.student_contributions;
CREATE POLICY "student_contributions_write_admin"
ON public.student_contributions FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 20. public.student_dues Policies (Strictly Private per Student)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "student_dues_select_own_or_admin" ON public.student_dues;
CREATE POLICY "student_dues_select_own_or_admin"
ON public.student_dues FOR SELECT
USING (
  student_uid = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "student_dues_write_admin" ON public.student_dues;
CREATE POLICY "student_dues_write_admin"
ON public.student_dues FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 21. public.financial_receipts Policies (Strictly Private per Student)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "financial_receipts_select_own_or_admin" ON public.financial_receipts;
CREATE POLICY "financial_receipts_select_own_or_admin"
ON public.financial_receipts FOR SELECT
USING (
  student_uid = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "financial_receipts_write_admin" ON public.financial_receipts;
CREATE POLICY "financial_receipts_write_admin"
ON public.financial_receipts FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 22. public.financial_audit_logs Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "financial_audit_logs_select_admin" ON public.financial_audit_logs;
CREATE POLICY "financial_audit_logs_select_admin"
ON public.financial_audit_logs FOR SELECT
USING (public.is_admin());

DROP POLICY IF EXISTS "financial_audit_logs_insert_admin" ON public.financial_audit_logs;
CREATE POLICY "financial_audit_logs_insert_admin"
ON public.financial_audit_logs FOR INSERT
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "financial_audit_logs_delete_super_admin" ON public.financial_audit_logs;
CREATE POLICY "financial_audit_logs_delete_super_admin"
ON public.financial_audit_logs FOR DELETE
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 23. public.direct_messages Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "direct_messages_select_participant_or_admin" ON public.direct_messages;
CREATE POLICY "direct_messages_select_participant_or_admin"
ON public.direct_messages FOR SELECT
USING (
  sender_id = public.current_user_uid()
  OR recipient_id = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "direct_messages_insert_authenticated" ON public.direct_messages;
CREATE POLICY "direct_messages_insert_authenticated"
ON public.direct_messages FOR INSERT
WITH CHECK (
  public.is_active_user()
  AND (sender_id = public.current_user_uid() OR public.is_admin())
);

DROP POLICY IF EXISTS "direct_messages_insert_public_visitor" ON public.direct_messages;
CREATE POLICY "direct_messages_insert_public_visitor"
ON public.direct_messages FOR INSERT
TO anon, authenticated
WITH CHECK (
  sender_id = 'public_visitor'
  AND recipient_id = 'admin_super'
  AND status = 'unread'
);

DROP POLICY IF EXISTS "direct_messages_update_admin" ON public.direct_messages;
CREATE POLICY "direct_messages_update_admin"
ON public.direct_messages FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "direct_messages_delete_admin" ON public.direct_messages;
CREATE POLICY "direct_messages_delete_admin"
ON public.direct_messages FOR DELETE
USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 24. public.chat_messages Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "chat_messages_select_participant_or_staff" ON public.chat_messages;
CREATE POLICY "chat_messages_select_participant_or_staff"
ON public.chat_messages FOR SELECT
USING (
  sender_id = public.current_user_uid()
  OR recipient_id = public.current_user_uid()
  OR (recipient_id = 'ALL_STUDENTS' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "chat_messages_insert_active_user" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_active_user"
ON public.chat_messages FOR INSERT
WITH CHECK (
  public.is_active_user()
  AND sender_id = public.current_user_uid()
);

DROP POLICY IF EXISTS "chat_messages_update_participant_or_admin" ON public.chat_messages;
CREATE POLICY "chat_messages_update_participant_or_admin"
ON public.chat_messages FOR UPDATE
USING (
  sender_id = public.current_user_uid()
  OR recipient_id = public.current_user_uid()
  OR public.is_admin()
)
WITH CHECK (
  sender_id = public.current_user_uid()
  OR recipient_id = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "chat_messages_delete_sender_or_admin" ON public.chat_messages;
CREATE POLICY "chat_messages_delete_sender_or_admin"
ON public.chat_messages FOR DELETE
USING (
  sender_id = public.current_user_uid()
  OR public.is_admin()
);

-- -----------------------------------------------------------------------------
-- 25. public.feedback_records Policies (Strictly Private per Student)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "feedback_records_select_own_or_admin" ON public.feedback_records;
CREATE POLICY "feedback_records_select_own_or_admin"
ON public.feedback_records FOR SELECT
USING (
  student_uid = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "feedback_records_insert_own" ON public.feedback_records;
CREATE POLICY "feedback_records_insert_own"
ON public.feedback_records FOR INSERT
WITH CHECK (
  (public.is_student() AND student_uid = public.current_user_uid())
  OR public.is_admin()
);

DROP POLICY IF EXISTS "feedback_records_update_admin" ON public.feedback_records;
CREATE POLICY "feedback_records_update_admin"
ON public.feedback_records FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "feedback_records_delete_own_or_admin" ON public.feedback_records;
CREATE POLICY "feedback_records_delete_own_or_admin"
ON public.feedback_records FOR DELETE
USING (
  (student_uid = public.current_user_uid() AND status = 'submitted')
  OR public.is_admin()
);

-- -----------------------------------------------------------------------------
-- 26. public.notifications Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_select_recipient_or_staff" ON public.notifications;
CREATE POLICY "notifications_select_recipient_or_staff"
ON public.notifications FOR SELECT
USING (
  recipient_id = public.current_user_uid()
  OR (recipient_id = 'ALL_STUDENTS' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "notifications_insert_staff" ON public.notifications;
CREATE POLICY "notifications_insert_staff"
ON public.notifications FOR INSERT
WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "notifications_update_recipient_or_staff" ON public.notifications;
CREATE POLICY "notifications_update_recipient_or_staff"
ON public.notifications FOR UPDATE
USING (
  recipient_id = public.current_user_uid()
  OR (recipient_id = 'ALL_STUDENTS' AND public.is_active_user())
  OR public.is_staff()
)
WITH CHECK (
  recipient_id = public.current_user_uid()
  OR (recipient_id = 'ALL_STUDENTS' AND public.is_active_user())
  OR public.is_staff()
);

DROP POLICY IF EXISTS "notifications_delete_admin" ON public.notifications;
CREATE POLICY "notifications_delete_admin"
ON public.notifications FOR DELETE
USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 27. public.activity_logs Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "activity_logs_select_own_or_admin" ON public.activity_logs;
CREATE POLICY "activity_logs_select_own_or_admin"
ON public.activity_logs FOR SELECT
USING (
  actor_id = public.current_user_uid()
  OR public.is_admin()
);

DROP POLICY IF EXISTS "activity_logs_insert_active_user" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_active_user"
ON public.activity_logs FOR INSERT
WITH CHECK (
  public.is_active_user()
  AND (actor_id = public.current_user_uid() OR public.is_admin())
);

DROP POLICY IF EXISTS "activity_logs_delete_super_admin" ON public.activity_logs;
CREATE POLICY "activity_logs_delete_super_admin"
ON public.activity_logs FOR DELETE
USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 28. public.password_reset_logs Policies (Admin & Super Admin Only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "password_reset_logs_select_admin" ON public.password_reset_logs;
CREATE POLICY "password_reset_logs_select_admin"
ON public.password_reset_logs FOR SELECT
USING (public.is_admin());

DROP POLICY IF EXISTS "password_reset_logs_write_admin" ON public.password_reset_logs;
CREATE POLICY "password_reset_logs_write_admin"
ON public.password_reset_logs FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 29. public.custom_types Policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "custom_types_select_authenticated" ON public.custom_types;
CREATE POLICY "custom_types_select_authenticated"
ON public.custom_types FOR SELECT
USING (public.is_active_user() OR public.is_staff());

DROP POLICY IF EXISTS "custom_types_write_admin" ON public.custom_types;
CREATE POLICY "custom_types_write_admin"
ON public.custom_types FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 30. public.portal_settings Policies
-- Safe for public SELECT because state_snapshot & backup_meta are excluded from this table.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "portal_settings_select_public" ON public.portal_settings;
CREATE POLICY "portal_settings_select_public"
ON public.portal_settings FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS "portal_settings_write_admin" ON public.portal_settings;
CREATE POLICY "portal_settings_write_admin"
ON public.portal_settings FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 31. public.appointments Policies (Public Appointment Booking Form + Admin Desk)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "appointments_insert_public" ON public.appointments;
CREATE POLICY "appointments_insert_public"
ON public.appointments FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND length(trim(full_name)) >= 2
  AND position('@' IN email) > 1
  AND length(trim(phone)) >= 6
);

DROP POLICY IF EXISTS "appointments_select_own_or_admin" ON public.appointments;
CREATE POLICY "appointments_select_own_or_admin"
ON public.appointments FOR SELECT
USING (
  public.is_admin()
  OR (
    public.current_user_uid() IS NOT NULL
    AND student_uid = public.current_user_uid()
  )
);

DROP POLICY IF EXISTS "appointments_update_admin" ON public.appointments;
CREATE POLICY "appointments_update_admin"
ON public.appointments FOR UPDATE
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "appointments_delete_admin" ON public.appointments;
CREATE POLICY "appointments_delete_admin"
ON public.appointments FOR DELETE
USING (public.is_admin());

-- =============================================================================
-- PART 7: SUPABASE STORAGE BUCKETS (PUBLIC VS PRIVATE) & STORAGE RLS POLICIES
-- =============================================================================
-- Uses ON CONFLICT (id) DO NOTHING so existing bucket privacy configurations
-- are never overwritten on an existing Supabase project.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'public-gallery',
    'public-gallery',
    TRUE,
    15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'videos',
    'videos',
    TRUE,
    52428800,
    ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'official-branding',
    'official-branding',
    TRUE,
    10485760,
    ARRAY['image/png', 'image/jpeg', 'image/webp']
  ),
  (
    'slideshow',
    'slideshow',
    TRUE,
    15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'user-gallery',
    'user-gallery',
    FALSE,
    15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'certificates',
    'certificates',
    FALSE,
    15728640,
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  ),
  (
    'study-materials',
    'study-materials',
    FALSE,
    26214400,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'documents',
    'documents',
    FALSE,
    20971520,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'quarantine-uploads',
    'quarantine-uploads',
    FALSE,
    26214400,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4',
      'video/webm'
    ]
  ),
  (
    'portal-backups',
    'portal-backups',
    FALSE,
    104857600,
    ARRAY['application/octet-stream', 'application/json']
  )
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Storage Object Policies (storage.objects)
-- -----------------------------------------------------------------------------

-- A. Public Buckets ('public-gallery', 'videos', 'official-branding', 'slideshow')
DROP POLICY IF EXISTS "storage_public_buckets_select" ON storage.objects;
CREATE POLICY "storage_public_buckets_select"
ON storage.objects FOR SELECT
USING (
  bucket_id IN ('public-gallery', 'videos', 'official-branding', 'slideshow')
);

DROP POLICY IF EXISTS "storage_public_buckets_write_staff" ON storage.objects;
CREATE POLICY "storage_public_buckets_write_staff"
ON storage.objects FOR INSERT
WITH CHECK (
  (
    bucket_id IN ('public-gallery', 'official-branding', 'slideshow')
    AND public.is_admin()
  )
  OR (
    bucket_id = 'videos'
    AND public.is_staff()
  )
);

DROP POLICY IF EXISTS "storage_public_buckets_update_staff" ON storage.objects;
CREATE POLICY "storage_public_buckets_update_staff"
ON storage.objects FOR UPDATE
USING (
  bucket_id IN ('public-gallery', 'videos', 'official-branding', 'slideshow')
  AND public.is_staff()
)
WITH CHECK (
  bucket_id IN ('public-gallery', 'videos', 'official-branding', 'slideshow')
  AND public.is_staff()
);

DROP POLICY IF EXISTS "storage_public_buckets_delete_admin" ON storage.objects;
CREATE POLICY "storage_public_buckets_delete_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id IN ('public-gallery', 'videos', 'official-branding', 'slideshow')
  AND public.is_admin()
);

-- B. 'user-gallery' Bucket (Private: Authenticated Member Gallery & Student Avatars)
DROP POLICY IF EXISTS "storage_user_gallery_select_authenticated" ON storage.objects;
CREATE POLICY "storage_user_gallery_select_authenticated"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'user-gallery'
  AND public.is_active_user()
);

DROP POLICY IF EXISTS "storage_user_gallery_insert_avatar_or_admin" ON storage.objects;
CREATE POLICY "storage_user_gallery_insert_avatar_or_admin"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'user-gallery'
  AND (
    public.is_admin()
    OR (
      public.is_active_user()
      AND (storage.foldername(name))[1] = 'avatars'
    )
  )
);

DROP POLICY IF EXISTS "storage_user_gallery_update_owner_or_admin" ON storage.objects;
CREATE POLICY "storage_user_gallery_update_owner_or_admin"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'user-gallery'
  AND (public.is_admin() OR owner = auth.uid())
)
WITH CHECK (
  bucket_id = 'user-gallery'
  AND (public.is_admin() OR owner = auth.uid())
);

DROP POLICY IF EXISTS "storage_user_gallery_delete_owner_or_admin" ON storage.objects;
CREATE POLICY "storage_user_gallery_delete_owner_or_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'user-gallery'
  AND (public.is_admin() OR owner = auth.uid())
);

-- C. 'study-materials' Bucket (Private: Authenticated Read, Staff Write)
DROP POLICY IF EXISTS "storage_study_materials_select_authenticated" ON storage.objects;
CREATE POLICY "storage_study_materials_select_authenticated"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'study-materials'
  AND public.is_active_user()
);

DROP POLICY IF EXISTS "storage_study_materials_write_staff" ON storage.objects;
CREATE POLICY "storage_study_materials_write_staff"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'study-materials'
  AND public.is_staff()
);

DROP POLICY IF EXISTS "storage_study_materials_update_staff" ON storage.objects;
CREATE POLICY "storage_study_materials_update_staff"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'study-materials'
  AND public.is_staff()
)
WITH CHECK (
  bucket_id = 'study-materials'
  AND public.is_staff()
);

DROP POLICY IF EXISTS "storage_study_materials_delete_staff" ON storage.objects;
CREATE POLICY "storage_study_materials_delete_staff"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'study-materials'
  AND public.is_staff()
);

-- D. 'certificates' Bucket (Private: Owning Student or Staff Read, Admin Write)
DROP POLICY IF EXISTS "storage_certificates_select_owner_or_staff" ON storage.objects;
CREATE POLICY "storage_certificates_select_owner_or_staff"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'certificates'
  AND (
    public.is_staff()
    OR owner = auth.uid()
    OR (storage.foldername(name))[1] = public.current_user_uid()
  )
);

DROP POLICY IF EXISTS "storage_certificates_write_admin" ON storage.objects;
CREATE POLICY "storage_certificates_write_admin"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'certificates'
  AND public.is_admin()
);

DROP POLICY IF EXISTS "storage_certificates_update_admin" ON storage.objects;
CREATE POLICY "storage_certificates_update_admin"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'certificates'
  AND public.is_admin()
)
WITH CHECK (
  bucket_id = 'certificates'
  AND public.is_admin()
);

DROP POLICY IF EXISTS "storage_certificates_delete_admin" ON storage.objects;
CREATE POLICY "storage_certificates_delete_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'certificates'
  AND public.is_admin()
);

-- E. 'documents' Bucket (Strictly Private: Only Owner or Admin Read/Write)
DROP POLICY IF EXISTS "storage_documents_select_owner_or_admin" ON storage.objects;
CREATE POLICY "storage_documents_select_owner_or_admin"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND (
    public.is_admin()
    OR owner = auth.uid()
    OR (storage.foldername(name))[1] = public.current_user_uid()
  )
);

DROP POLICY IF EXISTS "storage_documents_insert_owner_or_admin" ON storage.objects;
CREATE POLICY "storage_documents_insert_owner_or_admin"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND (
    public.is_admin()
    OR (
      public.is_active_user()
      AND (storage.foldername(name))[1] = public.current_user_uid()
    )
  )
);

DROP POLICY IF EXISTS "storage_documents_update_owner_or_admin" ON storage.objects;
CREATE POLICY "storage_documents_update_owner_or_admin"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'documents'
  AND (public.is_admin() OR owner = auth.uid())
)
WITH CHECK (
  bucket_id = 'documents'
  AND (public.is_admin() OR owner = auth.uid())
);

DROP POLICY IF EXISTS "storage_documents_delete_owner_or_admin" ON storage.objects;
CREATE POLICY "storage_documents_delete_owner_or_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents'
  AND (public.is_admin() OR owner = auth.uid())
);

-- =============================================================================
-- PART 8: SERVER-ONLY CONTROL TABLES (8 TABLES -> 38 TOTAL TABLES),
--         DEDICATED LEAST-PRIVILEGE NOLOGIN ROLES (6 ROLES),
--         APPEND-ONLY IMMUTABILITY TRIGGERS, AND ATOMIC SERVER RPC FUNCTIONS
-- =============================================================================

-- 31. public.user_credentials (Server-only password credential store: legacy pbkdf2_v1$ & $scrypt$v=2$)
CREATE TABLE IF NOT EXISTS public.user_credentials (
  user_uid TEXT PRIMARY KEY REFERENCES public.users(uid) ON DELETE CASCADE,
  password_scheme TEXT NOT NULL DEFAULT 'scrypt_v2' CHECK (password_scheme IN ('legacy_pbkdf2_v1', 'scrypt_v2')),
  credential_digest TEXT NOT NULL,
  upgraded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 32. public.auth_sessions (Server-only revocable session & CSRF store)
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  session_id TEXT PRIMARY KEY,
  user_uid TEXT NOT NULL REFERENCES public.users(uid) ON DELETE CASCADE,
  csrf_token_hash TEXT NOT NULL,
  ip_subnet TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL,
  key_id TEXT NOT NULL DEFAULT 'curr' CHECK (key_id IN ('curr', 'prev')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON public.auth_sessions (user_uid, expires_at);

-- 33. public.login_rate_limits (Server-only composite (ip_subnet, username) sliding-window limiter)
CREATE TABLE IF NOT EXISTS public.login_rate_limits (
  composite_key TEXT PRIMARY KEY,
  ip_subnet TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 0),
  window_start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 34. public.portal_backups (Append-only encrypted backup metadata catalog)
CREATE TABLE IF NOT EXISTS public.portal_backups (
  id TEXT PRIMARY KEY,
  created_by_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_version INTEGER NOT NULL DEFAULT 3,
  table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_object_count INTEGER NOT NULL DEFAULT 0 CHECK (storage_object_count >= 0),
  db_snapshot_path TEXT NOT NULL,
  storage_archive_path TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  hmac_signature TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0)
);

-- 35. public.portal_restore_journal (Append-only restore staging & ownership event log)
CREATE TABLE IF NOT EXISTS public.portal_restore_journal (
  event_id BIGSERIAL PRIMARY KEY,
  restore_attempt_id TEXT NOT NULL,
  backup_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  bucket_id TEXT NOT NULL,
  stage_path TEXT,
  final_path TEXT NOT NULL,
  expected_sha256 TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  pre_existed BOOLEAN NOT NULL DEFAULT FALSE,
  stage_owned BOOLEAN NOT NULL DEFAULT FALSE,
  final_path_owned BOOLEAN NOT NULL DEFAULT FALSE,
  created_storage_object_id UUID,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'verified_preexisting',
      'planned_staging',
      'staged_verified',
      'promoting_to_final',
      'promoted_final_verified',
      'committed',
      'cleanup_required',
      'cleaned_up',
      'aborted'
    )
  ),
  error_detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restore_journal_attempt_object
  ON public.portal_restore_journal (restore_attempt_id, bucket_id, final_path, event_id DESC);

-- 36. public.storage_files (Server-validated file quarantine & approval registry)
CREATE TABLE IF NOT EXISTS public.storage_files (
  id TEXT PRIMARY KEY,
  ticket_id TEXT UNIQUE,
  bucket_id TEXT NOT NULL,
  object_path TEXT NOT NULL,
  quarantine_path TEXT,
  owner_uid TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('quarantined', 'verifying', 'approved', 'rejected', 'deleted')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket_id, object_path)
);
CREATE INDEX IF NOT EXISTS idx_storage_files_status_bucket ON public.storage_files (status, bucket_id);

-- 37. public.portal_state_watermark (Singleton monotonic mutation counter + atomic restore lease lock)
CREATE TABLE IF NOT EXISTS public.portal_state_watermark (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mutation_version BIGINT NOT NULL DEFAULT 1,
  last_action TEXT NOT NULL DEFAULT 'INIT',
  last_actor_uid TEXT,
  active_restore_attempt_id TEXT,
  active_restore_backup_id TEXT,
  active_restore_owner_uid TEXT,
  active_restore_lease_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.portal_state_watermark (id, mutation_version, last_action)
VALUES (1, 1, 'INIT')
ON CONFLICT (id) DO NOTHING;

-- 38. public.portal_server_store (Singleton derived JSONB cache synced atomically by RPC)
CREATE TABLE IF NOT EXISTS public.portal_server_store (
  id TEXT PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  mutation_version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on all 8 server control tables (38/38 tables have RLS enabled)
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_restore_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_state_watermark ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_server_store ENABLE ROW LEVEL SECURITY;

-- Explicit deny-all client policies on the 8 server-only control tables
DROP POLICY IF EXISTS "user_credentials_deny_all_clients" ON public.user_credentials;
CREATE POLICY "user_credentials_deny_all_clients" ON public.user_credentials FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "auth_sessions_deny_all_clients" ON public.auth_sessions;
CREATE POLICY "auth_sessions_deny_all_clients" ON public.auth_sessions FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "login_rate_limits_deny_all_clients" ON public.login_rate_limits;
CREATE POLICY "login_rate_limits_deny_all_clients" ON public.login_rate_limits FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "portal_backups_deny_all_clients" ON public.portal_backups;
CREATE POLICY "portal_backups_deny_all_clients" ON public.portal_backups FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "portal_restore_journal_deny_all_clients" ON public.portal_restore_journal;
CREATE POLICY "portal_restore_journal_deny_all_clients" ON public.portal_restore_journal FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "storage_files_deny_all_clients" ON public.storage_files;
CREATE POLICY "storage_files_deny_all_clients" ON public.storage_files FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "portal_state_watermark_deny_all_clients" ON public.portal_state_watermark;
CREATE POLICY "portal_state_watermark_deny_all_clients" ON public.portal_state_watermark FOR ALL USING (FALSE) WITH CHECK (FALSE);

DROP POLICY IF EXISTS "portal_server_store_deny_all_clients" ON public.portal_server_store;
CREATE POLICY "portal_server_store_deny_all_clients" ON public.portal_server_store FOR ALL USING (FALSE) WITH CHECK (FALSE);

-- -----------------------------------------------------------------------------
-- Append-Only Immutability Triggers on public.portal_backups,
-- public.portal_restore_journal, and storage.objects
-- -----------------------------------------------------------------------------

-- 1. Database-Enforced Append-Only Trigger on public.portal_backups (Never bypassed by service_role)
CREATE OR REPLACE FUNCTION public.enforce_portal_backups_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_TABLE_VIOLATION: DELETE on public.portal_backups is prohibited (backup_id=%).', OLD.id
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'IMMUTABLE_TABLE_VIOLATION: UPDATE on public.portal_backups is prohibited (backup_id=%).', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS trg_portal_backups_append_only ON public.portal_backups;
CREATE TRIGGER trg_portal_backups_append_only
  BEFORE UPDATE OR DELETE ON public.portal_backups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_portal_backups_append_only();

-- 2. Database-Enforced Append-Only & Monotonic Transition Triggers on public.portal_restore_journal
CREATE OR REPLACE FUNCTION public.enforce_restore_journal_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IMMUTABLE_TABLE_VIOLATION: DELETE on public.portal_restore_journal is prohibited (event_id=%).', OLD.event_id
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'IMMUTABLE_TABLE_VIOLATION: UPDATE on public.portal_restore_journal is prohibited (event_id=%).', OLD.event_id
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS trg_portal_restore_journal_append_only ON public.portal_restore_journal;
CREATE TRIGGER trg_portal_restore_journal_append_only
  BEFORE UPDATE OR DELETE ON public.portal_restore_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_restore_journal_append_only();

CREATE OR REPLACE FUNCTION public.validate_restore_journal_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
  v_prev_event TEXT;
BEGIN
  SELECT j.event_type
    INTO v_prev_event
    FROM public.portal_restore_journal j
   WHERE j.restore_attempt_id = NEW.restore_attempt_id
     AND j.bucket_id = NEW.bucket_id
     AND j.final_path = NEW.final_path
   ORDER BY j.event_id DESC
   LIMIT 1;

  IF v_prev_event IN ('committed', 'cleaned_up', 'aborted') THEN
    RAISE EXCEPTION 'RESTORE_JOURNAL_TERMINAL_VIOLATION: Object (%/%) in attempt % is already in terminal state %.',
      NEW.bucket_id, NEW.final_path, NEW.restore_attempt_id, v_prev_event
      USING ERRCODE = '23514';
  END IF;

  IF NEW.event_type = 'committed' AND COALESCE(v_prev_event, 'NONE') NOT IN ('verified_preexisting', 'promoted_final_verified') THEN
    RAISE EXCEPTION 'RESTORE_JOURNAL_TRANSITION_VIOLATION: Cannot transition to committed from %.',
      COALESCE(v_prev_event, 'NONE')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_validate_restore_journal_transition ON public.portal_restore_journal;
CREATE TRIGGER trg_validate_restore_journal_transition
  BEFORE INSERT ON public.portal_restore_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_restore_journal_transition();

-- 3. Complete INSERT, UPDATE, and DELETE Protection Function for storage.objects ('portal-backups')
CREATE OR REPLACE FUNCTION public.protect_portal_backups_objects()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $func$
BEGIN
  -- 1. INSERT CHECK: Enforce canonical path format in portal-backups
  IF TG_OP = 'INSERT' THEN
    IF NEW.bucket_id = 'portal-backups' THEN
      IF NEW.name IS NULL
         OR NEW.name !~ '^bkp_[0-9]+_[a-zA-Z0-9_-]+/(db-snapshot\.enc\.json|storage-archive\.enc\.json|manifest\.json)$'
      THEN
        RAISE EXCEPTION 'IMMUTABLE_BACKUP_VIOLATION: Invalid object path (%) for bucket portal-backups during INSERT.', NEW.name
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;

  -- 2. UPDATE CHECK: Check BOTH OLD.bucket_id and NEW.bucket_id to block inbound/outbound moves and overwrites
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.bucket_id = 'portal-backups' OR NEW.bucket_id = 'portal-backups' THEN
      IF OLD.bucket_id IS DISTINCT FROM NEW.bucket_id THEN
        RAISE EXCEPTION 'IMMUTABLE_BACKUP_VIOLATION: Cross-bucket move involving portal-backups is prohibited (old=%, new=%).',
          OLD.bucket_id, NEW.bucket_id
          USING ERRCODE = '42501';
      END IF;

      IF OLD.id IS DISTINCT FROM NEW.id
         OR OLD.name IS DISTINCT FROM NEW.name
         OR OLD.owner IS DISTINCT FROM NEW.owner
         OR OLD.owner_id IS DISTINCT FROM NEW.owner_id
      THEN
        RAISE EXCEPTION 'IMMUTABLE_BACKUP_VIOLATION: Renaming or reassigning object (%) in portal-backups is prohibited.',
          OLD.name
          USING ERRCODE = '42501';
      END IF;

      -- Allow hosted Supabase storage-api initial single-shot upload completion (where OLD.metadata IS NULL),
      -- and permanently block any subsequent UPDATE once OLD.metadata IS NOT NULL.
      IF OLD.metadata IS NOT NULL THEN
        RAISE EXCEPTION 'IMMUTABLE_BACKUP_VIOLATION: Overwriting finalized object (%) in portal-backups is prohibited.',
          OLD.name
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;

  -- 3. DELETE CHECK: Block all deletions from portal-backups
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.bucket_id = 'portal-backups' THEN
      RAISE EXCEPTION 'IMMUTABLE_BACKUP_VIOLATION: DELETE on storage.objects in bucket portal-backups is prohibited (object=%).',
        OLD.name
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$func$;

DO $attach_storage_trigger$
BEGIN
  DROP TRIGGER IF EXISTS trg_protect_portal_backups_objects ON storage.objects;
  CREATE TRIGGER trg_protect_portal_backups_objects
    BEFORE INSERT OR UPDATE OR DELETE ON storage.objects
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_portal_backups_objects();
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'NOTICE: Hosted Supabase restricted attaching trg_protect_portal_backups_objects on storage.objects; public.portal_backups table trigger and Tier 3 offline backups remain active.';
END;
$attach_storage_trigger$;

-- -----------------------------------------------------------------------------
-- 6 Dedicated Least-Privilege NOLOGIN Function-Owner Roles
-- -----------------------------------------------------------------------------
DO $create_roles$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'alnibras_rls_reader',
    'alnibras_super_admin_guard',
    'alnibras_watermark_writer',
    'alnibras_ratelimit_writer',
    'alnibras_mutation_writer',
    'alnibras_restore_writer'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = r) THEN
      EXECUTE pg_catalog.format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
        r
      );
    END IF;
  END LOOP;
END;
$create_roles$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO
  alnibras_rls_reader,
  alnibras_super_admin_guard,
  alnibras_watermark_writer,
  alnibras_ratelimit_writer,
  alnibras_mutation_writer,
  alnibras_restore_writer;

-- 1. alnibras_rls_reader: column-restricted SELECT on users and portal_settings
GRANT SELECT (uid, role, is_super_admin, status) ON public.users TO alnibras_rls_reader;
GRANT SELECT (id, settings) ON public.portal_settings TO alnibras_rls_reader;

-- 2. alnibras_watermark_writer: SELECT, UPDATE on portal_state_watermark
GRANT SELECT, UPDATE (mutation_version, last_action, last_actor_uid, updated_at)
  ON public.portal_state_watermark TO alnibras_watermark_writer;

-- 3. alnibras_ratelimit_writer: SELECT, INSERT, UPDATE, DELETE on login_rate_limits
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_rate_limits TO alnibras_ratelimit_writer;

-- 4. alnibras_restore_writer: append-only SELECT, INSERT on portal_restore_journal + lock columns on portal_state_watermark
GRANT SELECT, INSERT ON public.portal_restore_journal TO alnibras_restore_writer;
GRANT USAGE, SELECT ON SEQUENCE public.portal_restore_journal_event_id_seq TO alnibras_restore_writer;
GRANT SELECT, UPDATE (
  mutation_version,
  last_action,
  last_actor_uid,
  active_restore_attempt_id,
  active_restore_backup_id,
  active_restore_owner_uid,
  active_restore_lease_expires_at,
  updated_at
) ON public.portal_state_watermark TO alnibras_restore_writer;

-- -----------------------------------------------------------------------------
-- Atomic Restore Lease Lock & Mutation RPCs (Hardened search_path = pg_catalog, pg_temp)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acquire_portal_restore_lock(
  p_attempt_id TEXT,
  p_backup_id TEXT,
  p_owner_uid TEXT,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
  v_clamped INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 15), 120);
  v_expires TIMESTAMPTZ;
BEGIN
  UPDATE public.portal_state_watermark
     SET active_restore_attempt_id = p_attempt_id,
         active_restore_backup_id = p_backup_id,
         active_restore_owner_uid = p_owner_uid,
         active_restore_lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => v_clamped),
         updated_at = pg_catalog.now()
   WHERE id = 1
     AND (
       active_restore_attempt_id IS NULL
       OR active_restore_lease_expires_at <= pg_catalog.now()
       OR active_restore_attempt_id = p_attempt_id
     )
  RETURNING active_restore_lease_expires_at INTO v_expires;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('acquired', FALSE);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'acquired', TRUE,
    'attemptId', p_attempt_id,
    'leaseExpiresAt', v_expires
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.heartbeat_portal_restore_lock(
  p_attempt_id TEXT,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
DECLARE
  v_clamped INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 15), 120);
  v_expires TIMESTAMPTZ;
BEGIN
  UPDATE public.portal_state_watermark
     SET active_restore_lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => v_clamped),
         updated_at = pg_catalog.now()
   WHERE id = 1
     AND active_restore_attempt_id = p_attempt_id
  RETURNING active_restore_lease_expires_at INTO v_expires;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('renewed', FALSE);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'renewed', TRUE,
    'attemptId', p_attempt_id,
    'leaseExpiresAt', v_expires
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.release_portal_restore_lock(
  p_attempt_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $func$
BEGIN
  UPDATE public.portal_state_watermark
     SET active_restore_attempt_id = NULL,
         active_restore_backup_id = NULL,
         active_restore_owner_uid = NULL,
         active_restore_lease_expires_at = NULL,
         updated_at = pg_catalog.now()
   WHERE id = 1
     AND active_restore_attempt_id = p_attempt_id;

  RETURN FOUND;
END;
$func$;

COMMIT;

