import {
  SUPER_ADMIN_EMAIL,
  formatSupabaseUiError,
  isMissingSupabaseSchemaError,
  isSupabaseConfigured,
  supabase,
  type SupabaseUser,
} from './supabase';
import { getIndiaDateISO } from './portal-logic';
import { getInitialPortalState } from './seed-data';
import type {
  ActivityActionType,
  ActivityLog,
  Announcement,
  AppointmentBooking,
  AppointmentStatus,
  CalendarEvent,
  CertificateRecord,
  ChatMessage,
  CommitteeMember,
  CustomTypeRecord,
  DirectMessage,
  ExpenseRecord,
  FeedbackRecord,
  FinancialAuditLog,
  FinancialReceiptRecord,
  FineRecord,
  GalleryItem,
  IncomeRecord,
  Notice,
  PasswordResetLog,
  PaymentMethodType,
  PointTransaction,
  PortalDatabaseState,
  PortalNotification,
  ProgramResult,
  ResultGrade,
  ResultPosition,
  SlideshowSlide,
  StudentContributionRecord,
  StudentDueRecord,
  StudentPointSummary,
  StudentResultRecord,
  StudyResource,
  UnionEvent,
  UserProfile,
  UserRole,
  VideoGalleryItem,
} from './types';

export interface TableMapping {
  stateKey: keyof PortalDatabaseState;
  tableName: string;
  idField: string;
  appendOnly?: boolean;
}

export const PORTAL_TABLE_MAPPINGS: readonly TableMapping[] = [
  { stateKey: 'users', tableName: 'users', idField: 'uid' },
  { stateKey: 'announcements', tableName: 'announcements', idField: 'id' },
  { stateKey: 'notices', tableName: 'notices', idField: 'id' },
  { stateKey: 'calendarEvents', tableName: 'calendar_events', idField: 'id' },
  { stateKey: 'gallery', tableName: 'gallery_items', idField: 'id' },
  { stateKey: 'videos', tableName: 'video_items', idField: 'id' },
  { stateKey: 'programResults', tableName: 'program_results', idField: 'id' },
  { stateKey: 'studentResults', tableName: 'student_results', idField: 'id' },
  { stateKey: 'studentPoints', tableName: 'student_points', idField: 'studentUid' },
  { stateKey: 'pointTransactions', tableName: 'point_transactions', idField: 'id', appendOnly: true },
  { stateKey: 'certificates', tableName: 'certificates', idField: 'id' },
  { stateKey: 'fines', tableName: 'fines', idField: 'id' },
  { stateKey: 'income', tableName: 'income_records', idField: 'id' },
  { stateKey: 'expenses', tableName: 'expense_records', idField: 'id' },
  { stateKey: 'studentContributions', tableName: 'student_contributions', idField: 'id' },
  { stateKey: 'studentDues', tableName: 'student_dues', idField: 'id' },
  { stateKey: 'financialReceipts', tableName: 'financial_receipts', idField: 'id' },
  { stateKey: 'financialAuditLogs', tableName: 'financial_audit_logs', idField: 'id', appendOnly: true },
  { stateKey: 'messages', tableName: 'direct_messages', idField: 'id' },
  { stateKey: 'chatMessages', tableName: 'chat_messages', idField: 'id' },
  { stateKey: 'feedback', tableName: 'feedback_records', idField: 'id' },
  { stateKey: 'notifications', tableName: 'notifications', idField: 'id' },
  { stateKey: 'activityLogs', tableName: 'activity_logs', idField: 'id', appendOnly: true },
  { stateKey: 'passwordResetLogs', tableName: 'password_reset_logs', idField: 'id', appendOnly: true },
  { stateKey: 'customTypes', tableName: 'custom_types', idField: 'id' },
  { stateKey: 'slideshow', tableName: 'slideshow_slides', idField: 'id' },
  { stateKey: 'committeeMembers', tableName: 'committee_members', idField: 'id' },
  { stateKey: 'appointments', tableName: 'appointments', idField: 'id' },
] as const;

export interface TableRowUpsert {
  table: string;
  rowId: string;
  data: Record<string, unknown>;
  isNew: boolean;
}

export interface TableRowDelete {
  table: string;
  rowId: string;
}

export interface SupabaseSyncPlan {
  upserts: TableRowUpsert[];
  deletes: TableRowDelete[];
  updateSettingsSingleton: boolean;
}

export function sanitizeForSupabase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForSupabase(item)) as unknown as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[key] = sanitizeForSupabase(v);
      }
    }
    return out as T;
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sanitizeForSupabase(value));
}

function nullableStr(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampEnum(val: unknown, allowed: readonly string[], fallback: string): string {
  const s = String(val ?? '').trim();
  if (allowed.includes(s)) return s;
  const lowerMatch = allowed.find((item) => item.toLowerCase() === s.toLowerCase());
  return lowerMatch || fallback;
}

export function appointmentToSupabaseRow(
  appt: AppointmentBooking
): Record<string, unknown> {
  return sanitizeForSupabase({
    id: appt.id,
    full_name: appt.fullName,
    email: appt.email.trim().toLowerCase(),
    phone: appt.phone,
    department: appt.department,
    preferred_date: appt.preferredDate,
    preferred_time: appt.preferredTime,
    purpose: appt.purpose,
    notes: appt.notes || null,
    status: appt.status || 'pending',
    student_uid: appt.studentUid || null,
    admin_notes: appt.adminNotes || null,
    created_at: appt.createdAt || new Date().toISOString(),
    updated_at: appt.updatedAt || new Date().toISOString(),
  });
}

export function supabaseRowToAppointment(
  row: Record<string, unknown>
): AppointmentBooking {
  const rawStatus = String(row.status || 'pending').toLowerCase();
  const status: AppointmentStatus =
    rawStatus === 'confirmed' || rawStatus === 'completed' || rawStatus === 'cancelled'
      ? rawStatus
      : 'pending';

  return {
    id: String(row.id || ''),
    fullName: String(row.full_name || row.fullName || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    department: String(row.department || 'Union Secretariat'),
    preferredDate: String(row.preferred_date || row.preferredDate || ''),
    preferredTime: String(row.preferred_time || row.preferredTime || ''),
    purpose: String(row.purpose || ''),
    notes: row.notes ? String(row.notes) : undefined,
    status,
    studentUid: row.student_uid ? String(row.student_uid) : undefined,
    adminNotes: row.admin_notes ? String(row.admin_notes) : undefined,
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.updatedAt || new Date().toISOString()),
  };
}

export function toSnakeCaseRow(
  tableName: string,
  record: Record<string, unknown>
): Record<string, unknown> {
  const now = new Date().toISOString();
  switch (tableName) {
    case 'appointments':
      return appointmentToSupabaseRow(record as unknown as AppointmentBooking);

    case 'users':
      return sanitizeForSupabase({
        uid: String(record.uid || ''),
        full_name: String(record.fullName || ''),
        username: String(record.username || ''),
        student_id: String(record.studentId || ''),
        roll_number: String(record.rollNumber || ''),
        role: String(record.role || 'student'),
        is_super_admin: String(record.uid) === 'admin_super',
        status: clampEnum(record.status, ['active', 'inactive'], 'active'),
        contact_email: record.contactEmail
          ? String(record.contactEmail).trim().toLowerCase()
          : null,
        contact_phone: nullableStr(record.contactPhone),
        avatar_url: String(record.avatarUrl || '/images/avatar_admin_portrait.jpg'),
        department: String(record.department || '11th Batch of DHBC'),
        class_info: nullableStr(record.classInfo),
        designation: nullableStr(record.designation),
        qualifications: nullableStr(record.qualifications),
        address: record.address || {},
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'committee_members': {
      const allowedRoleCategories = new Set([
        'Executive',
        'Advisory',
        'Academic',
        'Cultural',
        'Media',
        'Finance',
      ]);
      const rawRoleCat = String(record.roleCategory || 'Executive');
      const dbRoleCategory = allowedRoleCategories.has(rawRoleCat) ? rawRoleCat : 'Executive';
      const committeeType = record.committeeType === 'sub' ? 'sub' : 'core';
      const wingName = record.wingName ? String(record.wingName) : '';
      const subRole = record.subRole ? String(record.subRole) : '';
      const rawBatch = record.batch ? String(record.batch) : String(record.batchInfo || '');
      const encodedBatch =
        committeeType === 'sub' || !allowedRoleCategories.has(rawRoleCat)
          ? `ALN_COM_V1:${JSON.stringify({
              ct: committeeType,
              w: wingName,
              sr: subRole,
              rc: rawRoleCat,
              b: rawBatch,
            })}`
          : nullableStr(rawBatch);

      return sanitizeForSupabase({
        id: String(record.id || ''),
        full_name: String(record.fullName || ''),
        position: nullableStr(record.position),
        designation: nullableStr(record.designation),
        role_category: dbRoleCategory,
        department: String(record.department || wingName || '11th Batch of DHBC'),
        batch_info: nullableStr(
          committeeType === 'sub' ? 'Sub Committee' : record.batchInfo || 'Core Committee'
        ),
        batch: encodedBatch,
        contact_email: nullableStr(record.contactEmail),
        contact_phone: nullableStr(record.contactPhone),
        avatar_url: String(record.avatarUrl || '/images/avatar_admin_portrait.jpg'),
        bio: nullableStr(record.bio),
        display_order: Number(record.order) || 1,
        show_on_homepage: record.showOnHomepage !== false,
        status: String(record.status || 'published'),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });
    }

    case 'slideshow_slides':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        title: String(record.title || ''),
        subtitle: String(record.subtitle || ''),
        image_url: String(record.imageUrl || ''),
        cta_text: nullableStr(record.ctaText),
        cta_href: nullableStr(record.ctaHref),
        cta_link: nullableStr(record.ctaLink),
        display_order: Number(record.order) || 1,
        visible: record.visible !== false,
        enabled: record.enabled !== false,
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'notices':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        title: String(record.title || ''),
        summary: String(record.content || '').slice(0, 280),
        content: String(record.content || ''),
        reference_no: String(record.referenceCode || ''),
        category: String(record.category || 'General'),
        effective_date: String(record.effectiveDate || getIndiaDateISO()),
        status: clampEnum(record.status, ['published', 'draft'], 'published'),
        show_on_homepage: record.showOnHomepage !== false,
        attachment_url: nullableStr(record.attachmentUrl),
        attachment_name: nullableStr(record.attachmentName),
        author_id: nullableStr(record.authorId),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'announcements':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        title: String(record.title || ''),
        content: String(record.content || ''),
        category: String(record.category || 'General'),
        status: clampEnum(record.status, ['published', 'draft'], 'published'),
        priority: clampEnum(record.priority, ['normal', 'high', 'urgent'], 'normal'),
        show_on_homepage: record.showOnHomepage !== false,
        attachment_url: nullableStr(record.attachmentUrl),
        attachment_name: nullableStr(record.attachmentName),
        author_id: nullableStr(record.authorId),
        author_name: String(record.authorName || 'SUPER ADMIN'),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });


    case 'calendar_events':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        title: String(record.title || ''),
        description: String(record.description || ''),
        category: String(record.category || 'Academic'),
        start_date: String(record.startDate || getIndiaDateISO()),
        end_date: String(record.endDate || record.startDate || getIndiaDateISO()),
        start_time: nullableStr(record.startTime),
        end_time: nullableStr(record.endTime),
        location: String(record.location || 'Main Campus'),
        is_all_day: Boolean(record.isAllDay),
        visibility: clampEnum(record.visibility, ['public', 'students', 'private'], 'public'),
        reminder: nullableStr(record.reminder),
        image_url: nullableStr(record.imageUrl),
        attachment_url: nullableStr(record.attachmentUrl),
        attachment_name: nullableStr(record.attachmentName),
        author_id: nullableStr(record.authorId),
        created_by: nullableStr(record.authorId),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'gallery_items':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        title: String(record.title || ''),
        caption: String(record.caption || ''),
        description: nullableStr(record.description),
        album_name: nullableStr(record.albumName),
        image_url: String(record.imageUrl || ''),
        category: String(record.category || 'General'),
        destination: clampEnum(record.destination, ['public', 'user'], 'public'),
        show_on_homepage: record.showOnHomepage !== false,
        status: clampEnum(record.status, ['published', 'draft'], 'published'),
        author_id: nullableStr(record.authorId),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'video_items':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        title: String(record.title || ''),
        description: String(record.description || ''),
        category: String(record.category || 'Events'),
        playlist: String(record.playlist || 'General'),
        video_url: String(record.videoUrl || ''),
        thumbnail_url: String(record.thumbnailUrl || ''),
        duration: nullableStr(record.duration),
        publication_date: nullableStr(record.publicationDate),
        destination: String(record.destination || 'public'),
        featured_on_homepage: Boolean(record.featuredOnHomepage),
        status: String(record.status || 'published'),
        author_id: nullableStr(record.authorId),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });


    case 'program_results':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        program_name: String(record.programName || ''),
        category: String(record.category || 'Academic'),
        program_date: String(record.programDate || getIndiaDateISO()),
        publication_date: nullableStr(record.publicationDate),
        venue: String(record.programVenue || record.venue || ''),
        description: String(record.description || ''),
        winner_summary: String(record.winnerSummary || ''),
        participants: Array.isArray(record.participants) ? record.participants : [],
        certificate_url: nullableStr(record.certificateUrl),
        certificate_name: nullableStr(record.certificateName),
        document_url: nullableStr(record.documentUrl),
        document_name: nullableStr(record.documentName),
        image_url: nullableStr(record.imageUrl),
        certificate_title: nullableStr(record.certificateTitle),
        certificate_subtitle: nullableStr(record.certificateSubtitle),
        status: clampEnum(record.status, ['published', 'draft'], 'published'),
        author_id: nullableStr(record.authorId),
        created_by: nullableStr(record.authorId),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'student_results':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        program_id: String(record.programId || ''),
        program_name: String(record.programName || ''),
        program_category: String(record.programCategory || ''),
        program_date: String(record.programDate || getIndiaDateISO()),
        publication_date: String(record.publicationDate || getIndiaDateISO()),
        student_uid: String(record.studentUid || ''),
        student_id: String(record.studentId || ''),
        student_name: String(record.studentName || ''),
        student_avatar: String(record.studentAvatar || '/images/avatar_admin_portrait.jpg'),
        student_department: String(record.studentDepartment || '11th Batch of DHBC'),
        position: clampEnum(record.position, ['1st Place', '2nd Place', '3rd Place', 'None'], 'None'),
        grade: clampEnum(record.grade, ['A', 'B', 'None'], 'None'),
        position_points: Number(record.positionPoints) || 0,
        grade_points: Number(record.gradePoints) || 0,
        total_points: Number(record.totalPoints) || 0,
        remarks: nullableStr(record.remarks),
        status: clampEnum(record.status, ['published', 'draft'], 'published'),
        certificate_id: nullableStr(record.certificateId),
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'student_points':
      return sanitizeForSupabase({
        student_uid: String(record.studentUid || ''),
        student_id: String(record.studentId || ''),
        student_name: String(record.studentName || ''),
        student_avatar: String(record.studentAvatar || '/images/avatar_admin_portrait.jpg'),
        student_department: String(record.studentDepartment || '11th Batch of DHBC'),
        roll_number: String(record.rollNumber || ''),
        total_points: Number(record.totalPoints) || 0,
        first_place_count: Number(record.firstPlaceCount) || 0,
        second_place_count: Number(record.secondPlaceCount) || 0,
        third_place_count: Number(record.thirdPlaceCount) || 0,
        grade_a_count: Number(record.gradeACount) || 0,
        grade_b_count: Number(record.gradeBCount) || 0,
        total_achievements: Number(record.totalAchievements) || 0,
        updated_at: String(record.updatedAt || now),
      });

    case 'point_transactions':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        student_uid: String(record.studentUid || ''),
        student_id: String(record.studentId || ''),
        student_name: String(record.studentName || ''),
        program_id: nullableStr(record.programId),
        program_name: String(record.programName || ''),
        result_id: nullableStr(record.resultId),
        delta_points: Number(record.deltaPoints) || 0,
        previous_balance: Number(record.previousBalance) || 0,
        new_balance: Number(record.newBalance) || 0,
        reason: String(record.reason || 'RESULT_PUBLISHED'),
        position: String(record.position || 'None'),
        grade: String(record.grade || 'None'),
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
      });

    case 'certificates':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        certificate_number: String(record.certificateNumber || ''),
        result_id: String(record.resultId || ''),
        program_id: String(record.programId || ''),
        program_name: String(record.programName || ''),
        program_category: String(record.programCategory || ''),
        program_date: String(record.programDate || getIndiaDateISO()),
        program_venue: nullableStr(record.programVenue),
        issue_date: String(record.issueDate || record.publicationDate || getIndiaDateISO()),
        publication_date: nullableStr(record.publicationDate),
        student_uid: String(record.studentUid || ''),
        student_id: String(record.studentId || ''),
        student_name: String(record.studentName || ''),
        student_department: String(record.studentDepartment || '11th Batch of DHBC'),
        position: String(record.position || 'None'),
        grade: String(record.grade || 'None'),
        position_points: Number(record.positionPoints) || 0,
        grade_points: Number(record.gradePoints) || 0,
        total_points: Number(record.totalPoints) || 0,
        authorized_by_name: String(record.authorizedByName || 'SUPER ADMIN'),
        authorized_by_designation: String(record.authorizedByDesignation || 'Union President'),
        union_name: String(record.unionName || 'Al-Nibras Class Union'),
        logo_url: nullableStr(record.logoUrl),
        qr_verification_code: String(record.qrVerificationCode || ''),
        status: String(record.status || 'active'),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'fines':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        student_uid: String(record.studentUid || ''),
        student_name: String(record.studentName || ''),
        student_roll: String(record.studentRoll || ''),
        student_department: String(record.studentDepartment || '11th Batch of DHBC'),
        title: String(record.title || ''),
        description: String(record.description || ''),
        amount: Number(record.amount) || 0,
        category: String(record.category || 'Disciplinary'),
        status: clampEnum(record.status, ['unpaid', 'paid', 'overdue', 'cancelled'], 'unpaid'),
        issue_date: String(record.issueDate || getIndiaDateISO()),
        due_date: String(record.dueDate || getIndiaDateISO()),
        paid_at: nullableStr(record.paidAt),
        document_url: nullableStr(record.documentUrl),
        document_name: nullableStr(record.documentName),
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'income_records':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        receipt_number: nullableStr(record.receiptNumber),
        title: String(record.title || ''),
        category: String(record.category || 'General'),
        amount: Number(record.amount) || 0,
        tx_date: String(record.date || getIndiaDateISO()),
        received_from: nullableStr(record.receivedFrom),
        source_received_from: nullableStr(record.sourceReceivedFrom),
        student_uid: nullableStr(record.studentUid),
        student_name: nullableStr(record.studentName),
        student_id: nullableStr(record.studentId),
        payment_method: String(record.paymentMethod || 'Cash'),
        reference_number: nullableStr(record.referenceNumber),
        reference_receipt_no: nullableStr(record.referenceReceiptNo),
        transaction_reference: nullableStr(record.transactionReference),
        description: String(record.description || ''),
        attachment_url: nullableStr(record.attachmentUrl),
        attachment_name: nullableStr(record.attachmentName),
        receipt_url: nullableStr(record.receiptUrl),
        receipt_name: nullableStr(record.receiptName),
        source_type: String(record.sourceType || 'GENERAL_INCOME'),
        source_contribution_id: nullableStr(record.sourceContributionId),
        source_due_id: nullableStr(record.sourceDueId),
        linked_contribution_id: nullableStr(record.linkedContributionId),
        linked_due_id: nullableStr(record.linkedDueId),
        verified: record.verified !== false,
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'expense_records':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        voucher_number: nullableStr(record.voucherNumber),
        title: String(record.title || record.expenseTitle || ''),
        expense_title: nullableStr(record.expenseTitle),
        category: String(record.category || 'General'),
        amount: Number(record.amount) || 0,
        tx_date: String(record.date || record.expenseDate || getIndiaDateISO()),
        expense_date: nullableStr(record.expenseDate),
        paid_to: String(record.paidTo || ''),
        payment_method: String(record.paymentMethod || 'Cash'),
        reference_number: nullableStr(record.referenceNumber),
        bill_invoice_no: nullableStr(record.billInvoiceNo),
        approved_by: nullableStr(record.approvedBy),
        description: String(record.description || ''),
        purpose: nullableStr(record.purpose),
        bill_url: nullableStr(record.billUrl),
        bill_name: nullableStr(record.billName),
        verified: record.verified !== false,
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'student_contributions':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        receipt_number: String(record.receiptNumber || ''),
        student_uid: String(record.studentUid || ''),
        student_name: String(record.studentName || ''),
        student_id: String(record.studentId || ''),
        roll_number: nullableStr(record.rollNumber),
        student_class: nullableStr(record.studentClass),
        class_info: nullableStr(record.classInfo),
        amount: Number(record.amount) || 0,
        payment_date: String(record.paymentDate || record.date || getIndiaDateISO()),
        payment_method: String(record.paymentMethod || 'Cash'),
        purpose: String(record.purpose || record.contributionPurpose || 'Union Contribution'),
        contribution_purpose: nullableStr(record.contributionPurpose),
        category: String(record.category || 'Contribution'),
        reference_number: nullableStr(record.referenceNumber),
        transaction_reference: nullableStr(record.transactionReference),
        receipt_url: nullableStr(record.receiptUrl),
        receipt_name: nullableStr(record.receiptName),
        receipt_id: nullableStr(record.receiptId),
        remarks: nullableStr(record.remarks),
        description: nullableStr(record.description),
        payment_status: String(record.paymentStatus || 'Paid'),
        linked_income_id: nullableStr(record.linkedIncomeId),
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'student_dues':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        student_uid: String(record.studentUid || ''),
        student_name: String(record.studentName || ''),
        student_id: String(record.studentId || ''),
        roll_number: nullableStr(record.rollNumber),
        student_class: nullableStr(record.studentClass),
        class_info: nullableStr(record.classInfo),
        fee_title: String(record.feeTitle || record.dueTitle || record.title || ''),
        due_title: nullableStr(record.dueTitle),
        category: String(record.category || record.dueCategory || 'Fee'),
        total_amount: Number(record.totalAmount) || 0,
        paid_amount: Number(record.paidAmount ?? record.amountPaid) || 0,
        remaining_amount: Number(record.remainingAmount ?? record.remainingDue) || 0,
        issue_date: nullableStr(record.issueDate),
        due_date: String(record.dueDate || getIndiaDateISO()),
        status: String(record.status || 'Pending'),
        remarks: nullableStr(record.remarks),
        payments: Array.isArray(record.payments) ? record.payments : [],
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'financial_receipts':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        receipt_number: String(record.receiptNumber || ''),
        tx_type: String(record.type || 'income'),
        source_record_id: String(record.sourceRecordId || ''),
        student_uid: nullableStr(record.studentUid),
        student_name: nullableStr(record.studentName),
        student_id: nullableStr(record.studentId),
        payer_or_payee_name: String(record.payerOrPayeeName || ''),
        title: String(record.title || ''),
        category: String(record.category || 'General'),
        amount: Number(record.amount) || 0,
        tx_date: String(record.date || record.paymentDate || getIndiaDateISO()),
        purpose: nullableStr(record.purpose),
        payment_method: String(record.paymentMethod || 'Cash'),
        reference_number: nullableStr(record.referenceNumber),
        transaction_reference: nullableStr(record.transactionReference),
        remarks: nullableStr(record.remarks),
        source_type: nullableStr(record.sourceType),
        authorized_by: String(record.authorizedBy || 'SUPER ADMIN'),
        created_at: String(record.createdAt || now),
      });

    case 'financial_audit_logs':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        actor_id: nullableStr(record.actorId || record.actorUid),
        actor_name: String(record.actorName || 'SUPER ADMIN'),
        action: String(record.action || ''),
        amount: Number(record.amount) || 0,
        target_id: String(record.targetId || ''),
        details: String(record.details || ''),
        created_at: String(record.createdAt || now),
      });

    case 'direct_messages':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        sender_id: String(record.senderId || 'public_visitor'),
        sender_name: String(record.senderName || ''),
        recipient_id: String(record.recipientId || 'admin_super'),
        subject: String(record.subject || ''),
        body: String(record.body || ''),
        status: String(record.status || 'unread'),
        reply_text: nullableStr(record.replyText),
        attachment_url: nullableStr(record.attachmentUrl),
        attachment_name: nullableStr(record.attachmentName),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'chat_messages':
    case 'messages':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        conversation_id: String(record.conversationId || ''),
        sender_id: String(record.senderId || ''),
        sender_name: String(record.senderName || ''),
        sender_role: String(record.senderRole || 'student'),
        recipient_id: String(record.recipientId || ''),
        text: String(record.text || ''),
        attachment_url: nullableStr(record.attachmentUrl),
        attachment_name: nullableStr(record.attachmentName),
        attachment_type: nullableStr(record.attachmentType),
        attachments: Array.isArray(record.attachments) ? record.attachments : [],
        reply_to_id: nullableStr(record.replyToId),
        reply_to_text: nullableStr(record.replyToText),
        reply_to_sender: nullableStr(record.replyToSender),
        reply_to_sender_name: nullableStr(record.replyToSenderName),
        forwarded_from: nullableStr(record.forwardedFrom),
        forwarded_from_name: nullableStr(record.forwardedFromName),
        delivered: record.delivered !== false,
        read: Boolean(record.read),
        created_at: String(record.createdAt || now),
      });

    case 'feedback_records':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        student_uid: String(record.studentUid || ''),
        student_name: String(record.studentName || ''),
        student_id: String(record.studentId || ''),
        category: String(record.category || 'General'),
        subject: String(record.subject || ''),
        message: String(record.message || ''),
        rating: typeof record.rating === 'number' ? record.rating : 5,
        status: clampEnum(record.status, ['submitted', 'reviewed', 'resolved'], 'submitted'),
        admin_response: nullableStr(record.adminResponse),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'notifications':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        recipient_id: String(record.recipientId || 'ALL_STUDENTS'),
        title: String(record.title || ''),
        message: String(record.message || ''),
        notif_type: String(record.type || 'system'),
        read: Boolean(record.read),
        read_by_uids: Array.isArray(record.readByUids) ? record.readByUids : [],
        related_id: String(record.relatedId || ''),
        created_at: String(record.createdAt || now),
        updated_at: String(record.updatedAt || now),
      });

    case 'activity_logs':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        actor_id: nullableStr(record.actorId),
        actor_name: String(record.actorName || ''),
        action_type: String(record.actionType || 'LOGIN'),
        details: String(record.details || ''),
        target_id: String(record.targetId || ''),
        created_at: String(record.createdAt || now),
      });

    case 'password_reset_logs':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        target_uid: nullableStr(record.targetUid),
        target_name: String(record.targetName || ''),
        target_role: String(record.targetRole || 'student'),
        target_username: String(record.targetUsername || ''),
        initiated_by_uid: nullableStr(record.initiatedByUid),
        initiated_by_name: String(record.initiatedByName || 'SUPER ADMIN'),
        status: String(record.status || 'completed'),
        initiated_at: String(record.initiatedAt || now),
        completed_at: nullableStr(record.completedAt),
        notes: nullableStr(record.notes),
      });

    case 'custom_types':
      return sanitizeForSupabase({
        id: String(record.id || ''),
        module: String(record.module || ''),
        name: String(record.name || ''),
        created_by: nullableStr(record.createdBy),
        created_at: String(record.createdAt || now),
      });

    default:
      return sanitizeForSupabase({ ...record });
  }
}

export function buildPortalSettingsRowPayload(state: PortalDatabaseState): Record<string, unknown> {
  return sanitizeForSupabase({
    id: 'singleton',
    settings: state.settings,
    branding: state.branding || {},
    homepage_config: state.homepageConfig || {},
    certificate_settings: state.certificateSettings || {},
    updated_at: state.settings.updatedAt || new Date().toISOString(),
  });
}

/**
 * Computes incremental Supabase PostgreSQL table upserts and deletes between two PortalDatabaseState snapshots.
 */
export function computeCollectionSyncPlan(
  prevState: PortalDatabaseState,
  nextState: PortalDatabaseState
): SupabaseSyncPlan {
  const upserts: TableRowUpsert[] = [];
  const deletes: TableRowDelete[] = [];

  for (const mapping of PORTAL_TABLE_MAPPINGS) {
    const prevRaw = prevState[mapping.stateKey];
    const nextRaw = nextState[mapping.stateKey];
    const prevItems = Array.isArray(prevRaw) ? (prevRaw as unknown as Record<string, unknown>[]) : [];
    const nextItems = Array.isArray(nextRaw) ? (nextRaw as unknown as Record<string, unknown>[]) : [];

    const prevMap = new Map<string, Record<string, unknown>>();
    for (const item of prevItems) {
      const idVal = item?.[mapping.idField];
      if (typeof idVal === 'string' && idVal.trim()) {
        prevMap.set(idVal, item);
      }
    }

    const nextIds = new Set<string>();
    for (const item of nextItems) {
      const idVal = item?.[mapping.idField];
      if (typeof idVal !== 'string' || !idVal.trim()) continue;
      nextIds.add(idVal);

      const prevItem = prevMap.get(idVal);
      if (!prevItem || stableJson(prevItem) !== stableJson(item)) {
        upserts.push({
          table: mapping.tableName,
          rowId: idVal,
          data: toSnakeCaseRow(mapping.tableName, item),
          isNew: !prevItem,
        });
      }
    }

    if (!mapping.appendOnly) {
      for (const prevId of prevMap.keys()) {
        if (!nextIds.has(prevId)) {
          deletes.push({
            table: mapping.tableName,
            rowId: prevId,
          });
        }
      }
    }
  }

  const settingsChanged =
    stableJson(prevState.settings) !== stableJson(nextState.settings) ||
    stableJson(prevState.branding) !== stableJson(nextState.branding) ||
    stableJson(prevState.homepageConfig) !== stableJson(nextState.homepageConfig) ||
    stableJson(prevState.certificateSettings) !== stableJson(nextState.certificateSettings);

  return {
    upserts,
    deletes,
    updateSettingsSingleton: settingsChanged,
  };
}

export function rowToNotice(r: Record<string, unknown>): Notice {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    content: String(r.content || r.summary || ''),
    referenceCode: String(r.reference_no || r.referenceCode || ''),
    category: r.category ? String(r.category) : 'General',
    effectiveDate: String(r.effective_date || r.effectiveDate || ''),
    status: r.status === 'draft' ? 'draft' : 'published',
    showOnHomepage: r.show_on_homepage !== false,
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
    attachmentName: r.attachment_name ? String(r.attachment_name) : undefined,
    authorId: String(r.author_id || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToAnnouncement(r: Record<string, unknown>): Announcement {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    content: String(r.content || ''),
    category: String(r.category || 'General'),
    status: r.status === 'draft' ? 'draft' : 'published',
    priority: r.priority === 'urgent' || r.priority === 'high' ? r.priority : 'normal',
    showOnHomepage: r.show_on_homepage !== false,
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
    attachmentName: r.attachment_name ? String(r.attachment_name) : undefined,
    authorId: String(r.author_id || 'admin_super'),
    authorName: String(r.author_name || 'SUPER ADMIN'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToEvent(r: Record<string, unknown>): UnionEvent {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    description: String(r.description || ''),
    eventDate: String(r.event_date || ''),
    venue: String(r.venue || ''),
    category: String(r.category || 'Academic'),
    status: r.status === 'draft' ? 'draft' : 'published',
    showOnHomepage: r.show_on_homepage !== false,
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
    attachmentName: r.attachment_name ? String(r.attachment_name) : undefined,
    authorId: String(r.author_id || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToCalendarEvent(r: Record<string, unknown>): CalendarEvent {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    description: String(r.description || ''),
    category: String(r.category || 'Academic'),
    startDate: String(r.start_date || ''),
    endDate: String(r.end_date || ''),
    startTime: r.start_time ? String(r.start_time) : undefined,
    endTime: r.end_time ? String(r.end_time) : undefined,
    location: String(r.location || ''),
    isAllDay: Boolean(r.is_all_day),
    visibility: r.visibility === 'private' ? 'private' : 'public',
    reminder: r.reminder ? String(r.reminder) : undefined,
    imageUrl: r.image_url ? String(r.image_url) : undefined,
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
    attachmentName: r.attachment_name ? String(r.attachment_name) : undefined,
    authorId: String(r.author_id || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToGallery(r: Record<string, unknown>): GalleryItem {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    caption: String(r.caption || ''),
    description: r.description ? String(r.description) : undefined,
    albumName: r.album_name ? String(r.album_name) : undefined,
    imageUrl: String(r.image_url || ''),
    category: String(r.category || 'General'),
    destination: r.destination === 'user' ? 'user' : 'public',
    showOnHomepage: r.show_on_homepage !== false,
    status: r.status === 'draft' ? 'draft' : 'published',
    authorId: String(r.author_id || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToVideo(r: Record<string, unknown>): VideoGalleryItem {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    description: String(r.description || ''),
    category: String(r.category || 'Events'),
    playlist: String(r.playlist || 'General'),
    videoUrl: String(r.video_url || ''),
    thumbnailUrl: String(r.thumbnail_url || ''),
    duration: r.duration ? String(r.duration) : undefined,
    publicationDate: r.publication_date ? String(r.publication_date) : undefined,
    destination: r.destination === 'user' ? 'user' : 'public',
    featuredOnHomepage: Boolean(r.featured_on_homepage),
    status: r.status === 'draft' ? 'draft' : 'published',
    authorId: String(r.author_id || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToResource(r: Record<string, unknown>): StudyResource {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    description: String(r.description || ''),
    subject: String(r.subject || 'General'),
    fileUrl: String(r.file_url || ''),
    fileType: String(r.file_type || 'PDF'),
    status: r.status === 'draft' ? 'draft' : 'published',
    authorId: String(r.author_id || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToCommittee(r: Record<string, unknown>): CommitteeMember {
  let committeeType: CommitteeMember['committeeType'] =
    String(r.batch_info || '').toLowerCase() === 'sub committee' ? 'sub' : 'core';
  let wingName: string | undefined;
  let subRole: string | undefined;
  let roleCategory: string = r.role_category ? String(r.role_category) : 'Executive';
  let batch = r.batch ? String(r.batch) : undefined;

  if (batch && batch.startsWith('ALN_COM_V1:')) {
    try {
      const parsed = JSON.parse(batch.slice('ALN_COM_V1:'.length)) as {
        ct?: string;
        w?: string;
        sr?: string;
        rc?: string;
        b?: string;
      };
      committeeType = parsed.ct === 'sub' ? 'sub' : 'core';
      wingName = parsed.w || undefined;
      subRole = parsed.sr || undefined;
      roleCategory = parsed.rc || roleCategory;
      batch = parsed.b || undefined;
    } catch {
      // Fallback cleanly if malformed
    }
  }

  return {
    id: String(r.id || ''),
    fullName: String(r.full_name || ''),
    committeeType,
    wingName: wingName || (committeeType === 'sub' ? String(r.department || '') : undefined),
    subRole: subRole || (committeeType === 'sub' ? String(r.position || '') : undefined),
    position: r.position ? String(r.position) : undefined,
    designation: r.designation ? String(r.designation) : undefined,
    roleCategory,
    department: String(r.department || ''),
    batchInfo: r.batch_info ? String(r.batch_info) : undefined,
    batch,
    contactEmail: r.contact_email ? String(r.contact_email) : undefined,
    contactPhone: r.contact_phone ? String(r.contact_phone) : undefined,
    avatarUrl: String(r.avatar_url || '/images/avatar_admin_portrait.jpg'),
    bio: r.bio ? String(r.bio) : undefined,
    order: Number(r.display_order) || 1,
    showOnHomepage: r.show_on_homepage !== false,
    status: r.status === 'draft' ? 'draft' : 'published',
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToSlideshow(r: Record<string, unknown>): SlideshowSlide {
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    subtitle: String(r.subtitle || ''),
    imageUrl: String(r.image_url || ''),
    ctaText: r.cta_text ? String(r.cta_text) : undefined,
    ctaHref: r.cta_href ? String(r.cta_href) : undefined,
    ctaLink: r.cta_link ? String(r.cta_link) : undefined,
    order: Number(r.display_order) || 1,
    visible: r.visible !== false,
    enabled: r.enabled !== false,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToUser(r: Record<string, unknown>): UserProfile {
  const roleRaw = String(r.role || 'student').toLowerCase();
  const role: UserProfile['role'] =
    roleRaw === 'super_admin' || roleRaw === 'admin'
      ? 'admin'
      : roleRaw === 'teacher'
      ? 'teacher'
      : 'student';

  return {
    uid: String(r.uid || ''),
    fullName: String(r.full_name || ''),
    username: String(r.username || ''),
    studentId: String(r.student_id || ''),
    rollNumber: String(r.roll_number || ''),
    role,
    status: r.status === 'inactive' ? 'inactive' : 'active',
    contactEmail: String(r.contact_email || ''),
    contactPhone: String(r.contact_phone || ''),
    avatarUrl: String(r.avatar_url || '/images/avatar_admin_portrait.jpg'),
    department: String(r.department || '11th Batch of DHBC'),
    classInfo: r.class_info ? String(r.class_info) : undefined,
    designation: r.designation ? String(r.designation) : undefined,
    qualifications: r.qualifications ? String(r.qualifications) : undefined,
    address: (r.address && typeof r.address === 'object' ? r.address : undefined) as UserProfile['address'],
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToDirectMessage(r: Record<string, unknown>): DirectMessage {
  return {
    id: String(r.id || ''),
    senderId: String(r.sender_id || 'public_visitor'),
    senderName: String(r.sender_name || ''),
    recipientId: String(r.recipient_id || 'admin_super'),
    subject: String(r.subject || ''),
    body: String(r.body || ''),
    status: r.status === 'replied' || r.status === 'read' ? r.status : 'unread',
    replyText: r.reply_text ? String(r.reply_text) : undefined,
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
    attachmentName: r.attachment_name ? String(r.attachment_name) : undefined,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToChatMessage(r: Record<string, unknown>): ChatMessage {
  const roleRaw = String(r.sender_role || 'student').toLowerCase();
  const senderRole: UserRole =
    roleRaw === 'admin' || roleRaw === 'super_admin'
      ? 'admin'
      : roleRaw === 'teacher'
      ? 'teacher'
      : 'student';

  return {
    id: String(r.id || ''),
    conversationId: String(r.conversation_id || ''),
    senderId: String(r.sender_id || ''),
    senderName: String(r.sender_name || ''),
    senderRole,
    recipientId: String(r.recipient_id || ''),
    text: String(r.text || ''),
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
    attachmentName: r.attachment_name ? String(r.attachment_name) : undefined,
    attachmentType: r.attachment_type ? String(r.attachment_type) : undefined,
    attachments: Array.isArray(r.attachments) ? (r.attachments as ChatMessage['attachments']) : undefined,
    replyToId: r.reply_to_id ? String(r.reply_to_id) : undefined,
    replyToText: r.reply_to_text ? String(r.reply_to_text) : undefined,
    replyToSender: r.reply_to_sender ? String(r.reply_to_sender) : undefined,
    replyToSenderName: r.reply_to_sender_name ? String(r.reply_to_sender_name) : undefined,
    forwardedFrom: r.forwarded_from ? String(r.forwarded_from) : undefined,
    forwardedFromName: r.forwarded_from_name ? String(r.forwarded_from_name) : undefined,
    delivered: r.delivered !== false,
    read: Boolean(r.read),
    createdAt: String(r.created_at || ''),
  };
}

export function rowToProgramResult(r: Record<string, unknown>): ProgramResult {
  const venueVal = r.venue ? String(r.venue) : r.program_venue ? String(r.program_venue) : undefined;
  return {
    id: String(r.id || ''),
    programName: String(r.program_name || ''),
    category: String(r.category || ''),
    programDate: String(r.program_date || ''),
    publicationDate: r.publication_date ? String(r.publication_date) : undefined,
    venue: venueVal,
    programVenue: venueVal,
    description: String(r.description || ''),
    winnerSummary: String(r.winner_summary || ''),
    participants: Array.isArray(r.participants) ? (r.participants as ProgramResult['participants']) : [],
    certificateUrl: r.certificate_url ? String(r.certificate_url) : undefined,
    certificateName: r.certificate_name ? String(r.certificate_name) : undefined,
    documentUrl: r.document_url ? String(r.document_url) : undefined,
    documentName: r.document_name ? String(r.document_name) : undefined,
    imageUrl: r.image_url ? String(r.image_url) : undefined,
    certificateTitle: r.certificate_title ? String(r.certificate_title) : undefined,
    certificateSubtitle: r.certificate_subtitle ? String(r.certificate_subtitle) : undefined,
    status: r.status === 'draft' ? 'draft' : 'published',
    authorId: String(r.author_id || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToStudentResult(r: Record<string, unknown>): StudentResultRecord {
  return {
    id: String(r.id || ''),
    programId: String(r.program_id || ''),
    programName: String(r.program_name || ''),
    programCategory: String(r.program_category || ''),
    programDate: String(r.program_date || ''),
    publicationDate: String(r.publication_date || ''),
    studentUid: String(r.student_uid || ''),
    studentId: String(r.student_id || ''),
    studentName: String(r.student_name || ''),
    studentAvatar: String(r.student_avatar || '/images/avatar_admin_portrait.jpg'),
    studentDepartment: String(r.student_department || ''),
    position: (r.position as ResultPosition) || 'None',
    grade: (r.grade as ResultGrade) || 'None',
    positionPoints: Number(r.position_points) || 0,
    gradePoints: Number(r.grade_points) || 0,
    totalPoints: Number(r.total_points) || 0,
    remarks: r.remarks ? String(r.remarks) : undefined,
    status: r.status === 'draft' ? 'draft' : 'published',
    certificateId: String(r.certificate_id || ''),
    createdBy: String(r.created_by || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToStudentPointSummary(r: Record<string, unknown>): StudentPointSummary {
  return {
    studentUid: String(r.student_uid || ''),
    studentId: String(r.student_id || ''),
    studentName: String(r.student_name || ''),
    studentAvatar: String(r.student_avatar || '/images/avatar_admin_portrait.jpg'),
    studentDepartment: String(r.student_department || ''),
    rollNumber: String(r.roll_number || ''),
    totalPoints: Number(r.total_points) || 0,
    firstPlaceCount: Number(r.first_place_count) || 0,
    secondPlaceCount: Number(r.second_place_count) || 0,
    thirdPlaceCount: Number(r.third_place_count) || 0,
    gradeACount: Number(r.grade_a_count) || 0,
    gradeBCount: Number(r.grade_b_count) || 0,
    totalAchievements: Number(r.total_achievements) || 0,
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToPointTransaction(r: Record<string, unknown>): PointTransaction {
  return {
    id: String(r.id || ''),
    studentUid: String(r.student_uid || ''),
    studentId: String(r.student_id || ''),
    studentName: String(r.student_name || ''),
    programId: String(r.program_id || ''),
    programName: String(r.program_name || ''),
    resultId: String(r.result_id || ''),
    deltaPoints: Number(r.delta_points) || 0,
    previousBalance: Number(r.previous_balance) || 0,
    newBalance: Number(r.new_balance) || 0,
    reason: (r.reason as PointTransaction['reason']) || 'RESULT_PUBLISHED',
    position: (r.position as ResultPosition) || 'None',
    grade: (r.grade as ResultGrade) || 'None',
    createdBy: String(r.created_by || 'admin_super'),
    createdAt: String(r.created_at || ''),
  };
}

export function rowToCertificate(r: Record<string, unknown>): CertificateRecord {
  return {
    id: String(r.id || ''),
    certificateNumber: String(r.certificate_number || ''),
    resultId: String(r.result_id || ''),
    programId: String(r.program_id || ''),
    programName: String(r.program_name || ''),
    programCategory: String(r.program_category || ''),
    programDate: String(r.program_date || ''),
    programVenue: r.program_venue ? String(r.program_venue) : r.venue ? String(r.venue) : undefined,
    publicationDate: String(r.publication_date || r.issue_date || ''),
    studentUid: String(r.student_uid || ''),
    studentId: String(r.student_id || ''),
    studentName: String(r.student_name || ''),
    studentDepartment: String(r.student_department || ''),
    position: (r.position as ResultPosition) || 'None',
    grade: (r.grade as ResultGrade) || 'None',
    positionPoints: Number(r.position_points) || 0,
    gradePoints: Number(r.grade_points) || 0,
    totalPoints: Number(r.total_points) || 0,
    authorizedByName: String(r.authorized_by_name || 'SUPER ADMIN'),
    authorizedByDesignation: String(r.authorized_by_designation || 'Union President'),
    unionName: String(r.union_name || 'Al-Nibras Class Union'),
    logoUrl: r.logo_url ? String(r.logo_url) : undefined,
    qrVerificationCode: String(r.qr_verification_code || ''),
    status: r.status === 'revoked' ? 'revoked' : 'active',
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToFine(r: Record<string, unknown>): FineRecord {
  const statusRaw = String(r.status || 'unpaid');
  return {
    id: String(r.id || ''),
    studentUid: String(r.student_uid || ''),
    studentName: String(r.student_name || ''),
    studentRoll: String(r.student_roll || ''),
    studentDepartment: String(r.student_department || ''),
    title: String(r.title || ''),
    description: String(r.description || ''),
    amount: Number(r.amount) || 0,
    category: String(r.category || 'Disciplinary'),
    status:
      statusRaw === 'paid' || statusRaw === 'overdue' || statusRaw === 'cancelled'
        ? statusRaw
        : 'unpaid',
    issueDate: String(r.issue_date || ''),
    dueDate: String(r.due_date || ''),
    paidAt: r.paid_at ? String(r.paid_at) : undefined,
    documentUrl: r.document_url ? String(r.document_url) : undefined,
    documentName: r.document_name ? String(r.document_name) : undefined,
    createdBy: String(r.created_by || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToIncome(r: Record<string, unknown>): IncomeRecord {
  return {
    id: String(r.id || ''),
    receiptNumber: r.receipt_number ? String(r.receipt_number) : undefined,
    title: String(r.title || ''),
    category: String(r.category || ''),
    amount: Number(r.amount) || 0,
    date: String(r.tx_date || ''),
    receivedFrom: r.received_from ? String(r.received_from) : undefined,
    sourceReceivedFrom: r.source_received_from ? String(r.source_received_from) : undefined,
    studentUid: r.student_uid ? String(r.student_uid) : undefined,
    studentName: r.student_name ? String(r.student_name) : undefined,
    studentId: r.student_id ? String(r.student_id) : undefined,
    paymentMethod: (r.payment_method as PaymentMethodType) || 'Cash',
    referenceNumber: r.reference_number ? String(r.reference_number) : undefined,
    referenceReceiptNo: r.reference_receipt_no ? String(r.reference_receipt_no) : undefined,
    transactionReference: r.transaction_reference ? String(r.transaction_reference) : undefined,
    description: String(r.description || ''),
    attachmentUrl: r.attachment_url ? String(r.attachment_url) : undefined,
    attachmentName: r.attachment_name ? String(r.attachment_name) : undefined,
    receiptUrl: r.receipt_url ? String(r.receipt_url) : undefined,
    receiptName: r.receipt_name ? String(r.receipt_name) : undefined,
    sourceType:
      r.source_type === 'STUDENT_CONTRIBUTION' || r.source_type === 'DUE_PAYMENT'
        ? r.source_type
        : 'GENERAL_INCOME',
    sourceContributionId: r.source_contribution_id ? String(r.source_contribution_id) : undefined,
    sourceDueId: r.source_due_id ? String(r.source_due_id) : undefined,
    linkedContributionId: r.linked_contribution_id ? String(r.linked_contribution_id) : undefined,
    linkedDueId: r.linked_due_id ? String(r.linked_due_id) : undefined,
    verified: r.verified !== false,
    createdBy: String(r.created_by || 'admin_super'),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToExpense(r: Record<string, unknown>): ExpenseRecord {
  return {
    id: String(r.id || ''),
    voucherNumber: r.voucher_number ? String(r.voucher_number) : undefined,
    title: String(r.title || ''),
    expenseTitle: r.expense_title ? String(r.expense_title) : undefined,
    category: String(r.category || ''),
    amount: Number(r.amount) || 0,
    date: String(r.tx_date || ''),
    expenseDate: r.expense_date ? String(r.expense_date) : undefined,
    paidTo: String(r.paid_to || ''),
    paymentMethod: (r.payment_method as PaymentMethodType) || 'Cash',
    referenceNumber: r.reference_number ? String(r.reference_number) : undefined,
    billInvoiceNo: r.bill_invoice_no ? String(r.bill_invoice_no) : undefined,
    approvedBy: r.approved_by ? String(r.approved_by) : undefined,
    description: String(r.description || ''),
    purpose: r.purpose ? String(r.purpose) : undefined,
    billUrl: r.bill_url ? String(r.bill_url) : undefined,
    billName: r.bill_name ? String(r.bill_name) : undefined,
    verified: r.verified !== false,
    createdBy: r.created_by ? String(r.created_by) : undefined,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToStudentContribution(r: Record<string, unknown>): StudentContributionRecord {
  return {
    id: String(r.id || ''),
    receiptNumber: String(r.receipt_number || ''),
    studentUid: String(r.student_uid || ''),
    studentName: String(r.student_name || ''),
    studentId: String(r.student_id || ''),
    rollNumber: r.roll_number ? String(r.roll_number) : undefined,
    studentClass: r.student_class ? String(r.student_class) : undefined,
    classInfo: r.class_info ? String(r.class_info) : undefined,
    amount: Number(r.amount) || 0,
    date: String(r.payment_date || ''),
    paymentDate: String(r.payment_date || ''),
    paymentMethod: (r.payment_method as PaymentMethodType) || 'Cash',
    purpose: String(r.purpose || ''),
    contributionPurpose: r.contribution_purpose ? String(r.contribution_purpose) : undefined,
    category: String(r.category || ''),
    referenceNumber: r.reference_number ? String(r.reference_number) : undefined,
    transactionReference: r.transaction_reference ? String(r.transaction_reference) : undefined,
    receiptUrl: r.receipt_url ? String(r.receipt_url) : undefined,
    receiptName: r.receipt_name ? String(r.receipt_name) : undefined,
    receiptId: r.receipt_id ? String(r.receipt_id) : undefined,
    remarks: r.remarks ? String(r.remarks) : undefined,
    description: r.description ? String(r.description) : undefined,
    paymentStatus: r.payment_status === 'paid' ? 'paid' : 'Paid',
    linkedIncomeId: r.linked_income_id ? String(r.linked_income_id) : undefined,
    createdBy: r.created_by ? String(r.created_by) : undefined,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToStudentDue(r: Record<string, unknown>): StudentDueRecord {
  return {
    id: String(r.id || ''),
    studentUid: String(r.student_uid || ''),
    studentName: String(r.student_name || ''),
    studentId: String(r.student_id || ''),
    rollNumber: r.roll_number ? String(r.roll_number) : undefined,
    studentClass: r.student_class ? String(r.student_class) : undefined,
    classInfo: r.class_info ? String(r.class_info) : undefined,
    feeTitle: String(r.fee_title || ''),
    dueTitle: r.due_title ? String(r.due_title) : undefined,
    category: String(r.category || ''),
    totalAmount: Number(r.total_amount) || 0,
    paidAmount: Number(r.paid_amount) || 0,
    remainingAmount: Number(r.remaining_amount) || 0,
    issueDate: r.issue_date ? String(r.issue_date) : undefined,
    dueDate: String(r.due_date || ''),
    status: (r.status as StudentDueRecord['status']) || 'Pending',
    remarks: r.remarks ? String(r.remarks) : undefined,
    payments: Array.isArray(r.payments) ? (r.payments as StudentDueRecord['payments']) : [],
    createdBy: r.created_by ? String(r.created_by) : undefined,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToFinancialReceipt(r: Record<string, unknown>): FinancialReceiptRecord {
  const txType = String(r.tx_type || 'income');
  return {
    id: String(r.id || ''),
    receiptNumber: String(r.receipt_number || ''),
    type:
      txType === 'contribution' || txType === 'due_payment' || txType === 'fine_payment'
        ? txType
        : 'income',
    sourceRecordId: String(r.source_record_id || ''),
    studentUid: r.student_uid ? String(r.student_uid) : undefined,
    studentName: r.student_name ? String(r.student_name) : undefined,
    studentId: r.student_id ? String(r.student_id) : undefined,
    payerOrPayeeName: String(r.payer_or_payee_name || ''),
    title: String(r.title || ''),
    category: String(r.category || ''),
    amount: Number(r.amount) || 0,
    date: String(r.tx_date || ''),
    purpose: r.purpose ? String(r.purpose) : undefined,
    paymentMethod: (r.payment_method as PaymentMethodType) || 'Cash',
    referenceNumber: r.reference_number ? String(r.reference_number) : undefined,
    transactionReference: r.transaction_reference ? String(r.transaction_reference) : undefined,
    remarks: r.remarks ? String(r.remarks) : undefined,
    sourceType: (r.source_type as FinancialReceiptRecord['sourceType']) || undefined,
    authorizedBy: String(r.authorized_by || 'SUPER ADMIN'),
    createdAt: String(r.created_at || ''),
  };
}

export function rowToFinancialAuditLog(r: Record<string, unknown>): FinancialAuditLog {
  return {
    id: String(r.id || ''),
    actorId: String(r.actor_id || 'admin_super'),
    actorName: String(r.actor_name || ''),
    action: String(r.action || ''),
    amount: Number(r.amount) || 0,
    targetId: String(r.target_id || ''),
    details: String(r.details || ''),
    createdAt: String(r.created_at || ''),
  };
}

export function rowToFeedback(r: Record<string, unknown>): FeedbackRecord {
  return {
    id: String(r.id || ''),
    studentUid: String(r.student_uid || ''),
    studentName: String(r.student_name || ''),
    studentId: String(r.student_id || ''),
    category: String(r.category || 'General'),
    subject: String(r.subject || ''),
    message: String(r.message || ''),
    rating: typeof r.rating === 'number' ? r.rating : 5,
    status: r.status === 'reviewed' || r.status === 'resolved' ? r.status : 'submitted',
    adminResponse: r.admin_response ? String(r.admin_response) : undefined,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToNotification(r: Record<string, unknown>): PortalNotification {
  return {
    id: String(r.id || ''),
    recipientId: String(r.recipient_id || 'ALL_STUDENTS'),
    title: String(r.title || ''),
    message: String(r.message || ''),
    type: (r.notif_type as PortalNotification['type']) || 'system',
    read: Boolean(r.read),
    readByUids: Array.isArray(r.read_by_uids) ? (r.read_by_uids as string[]) : [],
    relatedId: String(r.related_id || ''),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function rowToActivityLog(r: Record<string, unknown>): ActivityLog {
  return {
    id: String(r.id || ''),
    actorId: String(r.actor_id || 'admin_super'),
    actorName: String(r.actor_name || ''),
    actionType: (r.action_type as ActivityActionType) || 'LOGIN',
    details: String(r.details || ''),
    targetId: String(r.target_id || ''),
    createdAt: String(r.created_at || ''),
  };
}

export function rowToPasswordResetLog(r: Record<string, unknown>): PasswordResetLog {
  const roleRaw = String(r.target_role || 'student').toLowerCase();
  return {
    id: String(r.id || ''),
    targetUid: String(r.target_uid || ''),
    targetName: String(r.target_name || ''),
    targetRole: roleRaw === 'admin' ? 'admin' : roleRaw === 'teacher' ? 'teacher' : 'student',
    targetUsername: String(r.target_username || ''),
    initiatedByUid: String(r.initiated_by_uid || 'admin_super'),
    initiatedByName: String(r.initiated_by_name || 'SUPER ADMIN'),
    status: r.status === 'initiated' ? 'initiated' : 'completed',
    initiatedAt: String(r.initiated_at || ''),
    completedAt: r.completed_at ? String(r.completed_at) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
  };
}

export function rowToCustomType(r: Record<string, unknown>): CustomTypeRecord {
  return {
    id: String(r.id || ''),
    module: String(r.module || ''),
    name: String(r.name || ''),
    createdBy: String(r.created_by || 'admin_super'),
    createdAt: String(r.created_at || ''),
  };
}

export async function isSupabaseAdminUser(supaUser: SupabaseUser | null): Promise<boolean> {
  if (!supaUser) return false;
  const email = (supaUser.email || '').trim().toLowerCase();
  const isVerified = Boolean(supaUser.email_confirmed_at || supaUser.confirmed_at);
  if (email === SUPER_ADMIN_EMAIL && isVerified) {
    return true;
  }
  try {
    const { data, error } = await supabase
      .from('users')
      .select('uid, role, status, is_super_admin')
      .eq('uid', supaUser.id)
      .maybeSingle();
    if (!error && data && data.status === 'active') {
      const role = String(data.role || '').toLowerCase();
      return role === 'admin' || role === 'super_admin' || Boolean(data.is_super_admin);
    }
  } catch {
    // Non-fatal if users table query fails
  }
  return false;
}

export async function resolveMatchedPortalUser(
  supaUser: SupabaseUser | null,
  users: UserProfile[],
  isAdmin: boolean
): Promise<UserProfile | null> {
  if (!supaUser) return null;
  const email = (supaUser.email || '').trim().toLowerCase();
  const isVerified = Boolean(supaUser.email_confirmed_at || supaUser.confirmed_at);

  if (isAdmin && email === SUPER_ADMIN_EMAIL && isVerified) {
    return (
      users.find((u) => u.uid === 'admin_super') ||
      users.find((u) => u.role === 'admin') ||
      getInitialPortalState().users[0]
    );
  }

  if (email === SUPER_ADMIN_EMAIL && !isAdmin) {
    return null;
  }

  const byEmail = users.find(
    (u) =>
      u.status === 'active' &&
      u.role !== 'admin' &&
      (u.contactEmail || '').trim().toLowerCase() === email
  );
  if (byEmail) return byEmail;

  const byUid = users.find(
    (u) => u.status === 'active' && u.role !== 'admin' && u.uid === supaUser.id
  );
  if (byUid) return byUid;

  return null;
}

export interface LoadPortalResult {
  state: PortalDatabaseState;
  schemaReady: boolean;
  publicTotals: {
    totalStudentsCount: number;
    publicTotalIncome: number;
    publicTotalExpenses: number;
  };
}

/**
 * Hydrates portal state from Supabase PostgreSQL tables when initialized,
 * merging with /api/portal (for local seed fallback and password-authenticated sessions).
 */
export async function loadPortalStateFromSupabase(
  supaUser: SupabaseUser | null
): Promise<LoadPortalResult> {
  const baseState = getInitialPortalState();
  let apiState: PortalDatabaseState | null = null;

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/portal', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as { ok?: boolean; state?: PortalDatabaseState };
        if (json.ok && json.state) {
          apiState = json.state;
        }
      }
    } catch {
      // Non-fatal API fallback error
    }
  }

  const state: PortalDatabaseState = apiState ? { ...baseState, ...apiState } : baseState;
  let schemaReady = false;

  if (isSupabaseConfigured()) {
    try {
      const settingsRes = await supabase
        .from('portal_settings')
        .select('*')
        .eq('id', 'singleton')
        .maybeSingle();

      schemaReady = !isMissingSupabaseSchemaError(settingsRes.error);

      if (schemaReady) {
        const [
          noticesRes,
          announcementsRes,
          calendarRes,
          galleryRes,
          videosRes,
          committeeRes,
          slideshowRes,
          resultsRes,
        ] = await Promise.all([
          supabase.from('notices').select('*').order('created_at', { ascending: false }),
          supabase.from('announcements').select('*').order('created_at', { ascending: false }),
          supabase.from('calendar_events').select('*').order('start_date', { ascending: true }),
          supabase.from('gallery_items').select('*').order('created_at', { ascending: false }),
          supabase.from('video_items').select('*').order('created_at', { ascending: false }),
          supabase.from('committee_members').select('*').order('display_order', { ascending: true }),
          supabase.from('slideshow_slides').select('*').order('display_order', { ascending: true }),
          supabase.from('program_results').select('*').order('created_at', { ascending: false }),
        ]);

        if (settingsRes.data) {
          const row = settingsRes.data as Record<string, unknown>;
          if (row.settings && typeof row.settings === 'object' && Object.keys(row.settings as object).length > 0) {
            state.settings = { ...state.settings, ...(row.settings as PortalDatabaseState['settings']) };
          }
          if (row.branding && typeof row.branding === 'object' && Object.keys(row.branding as object).length > 0) {
            state.branding = { ...state.branding!, ...(row.branding as NonNullable<PortalDatabaseState['branding']>) };
          }
          if (row.homepage_config && typeof row.homepage_config === 'object' && Object.keys(row.homepage_config as object).length > 0) {
            state.homepageConfig = { ...state.homepageConfig!, ...(row.homepage_config as NonNullable<PortalDatabaseState['homepageConfig']>) };
          }
          if (row.certificate_settings && typeof row.certificate_settings === 'object' && Object.keys(row.certificate_settings as object).length > 0) {
            state.certificateSettings = { ...state.certificateSettings, ...(row.certificate_settings as PortalDatabaseState['certificateSettings']) };
          }
        }

        if (Array.isArray(noticesRes.data) && noticesRes.data.length > 0) {
          state.notices = (noticesRes.data as Record<string, unknown>[]).map(rowToNotice);
        }
        if (Array.isArray(announcementsRes.data) && announcementsRes.data.length > 0) {
          state.announcements = (announcementsRes.data as Record<string, unknown>[]).map(rowToAnnouncement);
        }
        if (Array.isArray(calendarRes.data) && calendarRes.data.length > 0) {
          state.calendarEvents = (calendarRes.data as Record<string, unknown>[]).map(rowToCalendarEvent);
        }
        if (Array.isArray(galleryRes.data) && galleryRes.data.length > 0) {
          state.gallery = (galleryRes.data as Record<string, unknown>[]).map(rowToGallery);
        }
        if (Array.isArray(videosRes.data) && videosRes.data.length > 0) {
          state.videos = (videosRes.data as Record<string, unknown>[]).map(rowToVideo);
        }
        if (Array.isArray(committeeRes.data) && committeeRes.data.length > 0) {
          state.committeeMembers = (committeeRes.data as Record<string, unknown>[]).map(rowToCommittee);
        }
        if (Array.isArray(slideshowRes.data) && slideshowRes.data.length > 0) {
          state.slideshow = (slideshowRes.data as Record<string, unknown>[]).map(rowToSlideshow);
        }
        if (Array.isArray(resultsRes.data) && resultsRes.data.length > 0) {
          state.programResults = (resultsRes.data as Record<string, unknown>[]).map(rowToProgramResult);
        }

        if (supaUser) {
          const [
            usersRes,
            studentResultsRes,
            studentPointsRes,
            pointTxRes,
            certsRes,
            finesRes,
            incomeRes,
            expensesRes,
            contribRes,
            duesRes,
            receiptsRes,
            finAuditRes,
            messagesRes,
            chatRes,
            feedbackRes,
            notifRes,
            activityRes,
            pwResetRes,
            customTypesRes,
            appointmentsRes,
            realtimeMessagesRes,
          ] = await Promise.all([
            supabase.from('users').select('*'),
            supabase.from('student_results').select('*').order('created_at', { ascending: false }),
            supabase.from('student_points').select('*').order('total_points', { ascending: false }),
            supabase.from('point_transactions').select('*').order('created_at', { ascending: false }),
            supabase.from('certificates').select('*').order('created_at', { ascending: false }),
            supabase.from('fines').select('*').order('created_at', { ascending: false }),
            supabase.from('income_records').select('*').order('created_at', { ascending: false }),
            supabase.from('expense_records').select('*').order('created_at', { ascending: false }),
            supabase.from('student_contributions').select('*').order('created_at', { ascending: false }),
            supabase.from('student_dues').select('*').order('created_at', { ascending: false }),
            supabase.from('financial_receipts').select('*').order('created_at', { ascending: false }),
            supabase.from('financial_audit_logs').select('*').order('created_at', { ascending: false }),
            supabase.from('direct_messages').select('*').order('created_at', { ascending: false }),
            supabase.from('chat_messages').select('*').order('created_at', { ascending: true }),
            supabase.from('feedback_records').select('*').order('created_at', { ascending: false }),
            supabase.from('notifications').select('*').order('created_at', { ascending: false }),
            supabase.from('activity_logs').select('*').order('created_at', { ascending: false }),
            supabase.from('password_reset_logs').select('*').order('initiated_at', { ascending: false }),
            supabase.from('custom_types').select('*').order('created_at', { ascending: false }),
            supabase.from('appointments').select('*').order('created_at', { ascending: false }),
            supabase.from('messages').select('*').order('created_at', { ascending: true }),
          ]);

          if (Array.isArray(usersRes.data) && usersRes.data.length > 0) {
            state.users = (usersRes.data as Record<string, unknown>[]).map(rowToUser);
          }
          if (Array.isArray(studentResultsRes.data) && studentResultsRes.data.length > 0) {
            state.studentResults = (studentResultsRes.data as Record<string, unknown>[]).map(rowToStudentResult);
          }
          if (Array.isArray(studentPointsRes.data) && studentPointsRes.data.length > 0) {
            state.studentPoints = (studentPointsRes.data as Record<string, unknown>[]).map(rowToStudentPointSummary);
          }
          if (Array.isArray(pointTxRes.data) && pointTxRes.data.length > 0) {
            state.pointTransactions = (pointTxRes.data as Record<string, unknown>[]).map(rowToPointTransaction);
          }
          if (Array.isArray(certsRes.data) && certsRes.data.length > 0) {
            state.certificates = (certsRes.data as Record<string, unknown>[]).map(rowToCertificate);
          }
          if (Array.isArray(finesRes.data) && finesRes.data.length > 0) {
            state.fines = (finesRes.data as Record<string, unknown>[]).map(rowToFine);
          }
          if (Array.isArray(incomeRes.data) && incomeRes.data.length > 0) {
            state.income = (incomeRes.data as Record<string, unknown>[]).map(rowToIncome);
          }
          if (Array.isArray(expensesRes.data) && expensesRes.data.length > 0) {
            state.expenses = (expensesRes.data as Record<string, unknown>[]).map(rowToExpense);
          }
          if (Array.isArray(contribRes.data) && contribRes.data.length > 0) {
            state.studentContributions = (contribRes.data as Record<string, unknown>[]).map(rowToStudentContribution);
          }
          if (Array.isArray(duesRes.data) && duesRes.data.length > 0) {
            state.studentDues = (duesRes.data as Record<string, unknown>[]).map(rowToStudentDue);
          }
          if (Array.isArray(receiptsRes.data) && receiptsRes.data.length > 0) {
            state.financialReceipts = (receiptsRes.data as Record<string, unknown>[]).map(rowToFinancialReceipt);
          }
          if (Array.isArray(finAuditRes.data) && finAuditRes.data.length > 0) {
            state.financialAuditLogs = (finAuditRes.data as Record<string, unknown>[]).map(rowToFinancialAuditLog);
          }
          if (Array.isArray(messagesRes.data) && messagesRes.data.length > 0) {
            state.messages = (messagesRes.data as Record<string, unknown>[]).map(rowToDirectMessage);
          }
          if (
            (Array.isArray(chatRes.data) && chatRes.data.length > 0) ||
            (Array.isArray(realtimeMessagesRes.data) && realtimeMessagesRes.data.length > 0)
          ) {
            const msgMap = new Map<string, ChatMessage>();
            for (const r of (chatRes.data as Record<string, unknown>[] | null) || []) {
              const m = rowToChatMessage(r);
              if (m.id) msgMap.set(m.id, m);
            }
            for (const r of (realtimeMessagesRes.data as Record<string, unknown>[] | null) || []) {
              const m = rowToChatMessage(r);
              if (m.id) msgMap.set(m.id, m);
            }
            state.chatMessages = Array.from(msgMap.values()).sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt)
            );
          }
          if (Array.isArray(feedbackRes.data) && feedbackRes.data.length > 0) {
            state.feedback = (feedbackRes.data as Record<string, unknown>[]).map(rowToFeedback);
          }
          if (Array.isArray(notifRes.data) && notifRes.data.length > 0) {
            state.notifications = (notifRes.data as Record<string, unknown>[]).map(rowToNotification);
          }
          if (Array.isArray(activityRes.data) && activityRes.data.length > 0) {
            state.activityLogs = (activityRes.data as Record<string, unknown>[]).map(rowToActivityLog);
          }
          if (Array.isArray(pwResetRes.data) && pwResetRes.data.length > 0) {
            state.passwordResetLogs = (pwResetRes.data as Record<string, unknown>[]).map(rowToPasswordResetLog);
          }
          if (Array.isArray(customTypesRes.data) && customTypesRes.data.length > 0) {
            state.customTypes = (customTypesRes.data as Record<string, unknown>[]).map(rowToCustomType);
          }
          if (Array.isArray(appointmentsRes.data) && appointmentsRes.data.length > 0) {
            state.appointments = (appointmentsRes.data as Record<string, unknown>[]).map(
              supabaseRowToAppointment
            );
          }
        }
      }
    } catch {
      // Fall back quietly to /api/portal state
    }
  }

  const totalStudentsCount = (state.users || []).filter(
    (u) => u.role === 'student' && u.status === 'active'
  ).length;
  const publicTotalIncome = (state.income || []).reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  const publicTotalExpenses = (state.expenses || []).reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );

  return {
    state,
    schemaReady,
    publicTotals: {
      totalStudentsCount,
      publicTotalIncome,
      publicTotalExpenses,
    },
  };
}

export interface AppointmentSubmitInput {
  fullName: string;
  email: string;
  phone: string;
  department: string;
  preferredDate: string;
  preferredTime: string;
  purpose: string;
  notes?: string;
  studentUid?: string;
}

export interface AppointmentSubmitResult {
  ok: boolean;
  appointment?: AppointmentBooking;
  savedToSupabase: boolean;
  schemaMissing?: boolean;
  error?: string;
}

/**
 * Persists an appointment booking directly into Supabase PostgreSQL (`public.appointments`)
 * and mirrors to `/api/portal` so the portal inbox stays synchronized.
 */
export async function submitAppointmentToSupabase(
  payload: AppointmentSubmitInput
): Promise<AppointmentSubmitResult> {
  const fullName = payload.fullName.trim();
  const email = payload.email.trim().toLowerCase();
  const phone = payload.phone.trim();
  const department = payload.department.trim() || 'Union Secretariat';
  const preferredDate = payload.preferredDate.trim();
  const preferredTime = payload.preferredTime.trim();
  const purpose = payload.purpose.trim();
  const notes = payload.notes?.trim() || undefined;

  if (
    fullName.length < 2 ||
    !email.includes('@') ||
    phone.length < 6 ||
    !preferredDate ||
    !preferredTime ||
    purpose.length < 3
  ) {
    return {
      ok: false,
      savedToSupabase: false,
      error: 'Please fill out your full name, valid email, phone number, preferred date/time, and purpose.',
    };
  }

  const now = new Date().toISOString();
  const appointment: AppointmentBooking = {
    id: `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fullName,
    email,
    phone,
    department,
    preferredDate,
    preferredTime,
    purpose,
    notes,
    status: 'pending',
    studentUid: payload.studentUid || undefined,
    createdAt: now,
    updatedAt: now,
  };

  let savedToSupabase = false;
  let schemaMissing = false;
  let supabaseErrorMsg: string | undefined;

  if (isSupabaseConfigured()) {
    try {
      const row = appointmentToSupabaseRow(appointment);
      const { error } = await supabase.from('appointments').insert(row);
      if (!error) {
        savedToSupabase = true;
      } else if (isMissingSupabaseSchemaError(error)) {
        schemaMissing = true;
        supabaseErrorMsg = formatSupabaseUiError(error);
      } else {
        supabaseErrorMsg = formatSupabaseUiError(error);
      }
    } catch (err) {
      supabaseErrorMsg = formatSupabaseUiError(err);
    }
  }

  let savedToLocalApi = false;
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PUBLIC_BOOK_APPOINTMENT',
          id: appointment.id,
          fullName: appointment.fullName,
          email: appointment.email,
          phone: appointment.phone,
          department: appointment.department,
          preferredDate: appointment.preferredDate,
          preferredTime: appointment.preferredTime,
          purpose: appointment.purpose,
          notes: appointment.notes,
          studentUid: appointment.studentUid,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; appointment?: AppointmentBooking };
      if (res.ok && json.ok) {
        savedToLocalApi = true;
      }
    } catch {
      // Non-fatal fallback error
    }
  }

  if (!savedToSupabase && !savedToLocalApi) {
    return {
      ok: false,
      savedToSupabase: false,
      schemaMissing,
      error: supabaseErrorMsg || 'Could not submit appointment booking to Supabase.',
    };
  }

  return {
    ok: true,
    appointment,
    savedToSupabase,
    schemaMissing,
    error: savedToSupabase ? undefined : supabaseErrorMsg,
  };
}

export async function submitPublicContactToSupabase(payload: {
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; savedToSupabase: boolean; schemaMissing?: boolean; error?: string }> {
  const now = new Date().toISOString();
  const msg: DirectMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    senderId: 'public_visitor',
    senderName: `${payload.senderName.trim()} (${payload.senderEmail.trim()})`,
    recipientId: 'admin_super',
    subject: payload.subject.trim(),
    body: payload.body.trim(),
    status: 'unread',
    createdAt: now,
    updatedAt: now,
  };

  let savedToSupabase = false;
  let schemaMissing = false;

  if (isSupabaseConfigured()) {
    try {
      const { error } = await supabase
        .from('direct_messages')
        .insert(toSnakeCaseRow('direct_messages', msg as unknown as Record<string, unknown>));
      if (!error) {
        savedToSupabase = true;
      } else if (isMissingSupabaseSchemaError(error)) {
        schemaMissing = true;
      }
    } catch {
      // Fall back to API route
    }
  }

  let savedToApi = false;
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PUBLIC_CONTACT_MESSAGE',
          id: msg.id,
          senderName: payload.senderName.trim(),
          senderEmail: payload.senderEmail.trim(),
          subject: payload.subject.trim(),
          body: payload.body.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (res.ok && json.ok) {
        savedToApi = true;
      }
    } catch {
      // Ignore
    }
  }

  if (!savedToSupabase && !savedToApi) {
    return {
      ok: false,
      savedToSupabase: false,
      schemaMissing,
      error: 'Unable to submit message to Supabase.',
    };
  }

  return { ok: true, savedToSupabase, schemaMissing };
}

export interface CommitSyncResult {
  syncedCount: number;
  schemaMissing: boolean;
  warning?: string;
}

/**
 * Commits incremental table changes to Supabase PostgreSQL in parent-first dependency order.
 */
export async function commitSyncPlanToSupabase(
  plan: SupabaseSyncPlan,
  nextState: PortalDatabaseState
): Promise<CommitSyncResult> {
  if (!isSupabaseConfigured()) {
    return { syncedCount: 0, schemaMissing: false };
  }

  let syncedCount = 0;
  let schemaMissing = false;
  const warnings: string[] = [];

  const groupedUpserts = new Map<string, Record<string, unknown>[]>();
  for (const item of plan.upserts) {
    const arr = groupedUpserts.get(item.table) || [];
    arr.push(item.data);
    groupedUpserts.set(item.table, arr);
  }

  for (const [table, rows] of groupedUpserts.entries()) {
    const pkCol = table === 'users' ? 'uid' : table === 'student_points' ? 'student_uid' : 'id';
    const { error } = await supabase.from(table).upsert(rows, { onConflict: pkCol });
    if (!error) {
      syncedCount += rows.length;
    } else if (isMissingSupabaseSchemaError(error)) {
      schemaMissing = true;
      warnings.push(`${table}: ${formatSupabaseUiError(error)}`);
    } else {
      warnings.push(`${table}: ${formatSupabaseUiError(error)}`);
    }
    if (table === 'chat_messages') {
      await supabase.from('messages').upsert(rows, { onConflict: 'id' }).then(
        () => undefined,
        () => undefined
      );
    }
  }

  const groupedDeletes = new Map<string, string[]>();
  for (const item of plan.deletes) {
    const arr = groupedDeletes.get(item.table) || [];
    arr.push(item.rowId);
    groupedDeletes.set(item.table, arr);
  }

  for (const [table, ids] of groupedDeletes.entries()) {
    const pkCol = table === 'users' ? 'uid' : table === 'student_points' ? 'student_uid' : 'id';
    const { error } = await supabase.from(table).delete().in(pkCol, ids);
    if (!error) {
      syncedCount += ids.length;
    } else if (isMissingSupabaseSchemaError(error)) {
      schemaMissing = true;
      warnings.push(`${table}: ${formatSupabaseUiError(error)}`);
    } else {
      warnings.push(`${table}: ${formatSupabaseUiError(error)}`);
    }
    if (table === 'chat_messages') {
      await supabase.from('messages').delete().in('id', ids).then(
        () => undefined,
        () => undefined
      );
    }
  }

  if (plan.updateSettingsSingleton) {
    const { error } = await supabase
      .from('portal_settings')
      .upsert(buildPortalSettingsRowPayload(nextState), { onConflict: 'id' });
    if (!error) {
      syncedCount += 1;
    } else if (isMissingSupabaseSchemaError(error)) {
      schemaMissing = true;
      warnings.push(`portal_settings: ${formatSupabaseUiError(error)}`);
    } else {
      warnings.push(`portal_settings: ${formatSupabaseUiError(error)}`);
    }
  }

  return {
    syncedCount,
    schemaMissing,
    warning: warnings.length > 0 ? warnings[0] : undefined,
  };
}
