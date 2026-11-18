import type {
  AccountStatus,
  ActivityActionType,
  ActivityLog,
  Announcement,
  CalendarEvent,
  ChatMessage,
  ContentStatus,
  DirectMessage,
  ExpenseRecord,
  FineRecord,
  FineStatus,
  GalleryItem,
  IncomeRecord,
  Notice,
  PortalDatabaseState,
  PortalNotification,
  ProgramResult,
  ResultGrade,
  ResultPosition,
  StudentContributionRecord,
  StudentDueRecord,
  StudentPointSummary,
  StudentResultRecord,
  UserProfile,
  UserRole,
} from './types';

export const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function isValidResourceId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && ID_REGEX.test(id);
}

export function sanitizeText(input: string, maxLength = 2000): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMediaUrl(
  input: unknown,
  fallback = '',
  maxLength = 4_000_000
): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return fallback;
  if (raw.length > maxLength) return fallback;
  const lower = raw.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html') || lower.startsWith('data:image/svg')) {
    return fallback;
  }
  if (
    raw.startsWith('/') ||
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('data:application/pdf') ||
    lower.startsWith('data:application/vnd.') ||
    lower.startsWith('data:video/')
  ) {
    return raw.replace(/[<>]/g, '');
  }
  return fallback;
}

export function hashPasswordSync(password: string, salt = 'alnibras_institutional_salt_2026'): string {
  // Deterministic FNV-1a + multi-round bitwise digest for universal client/server verification
  let h1 = 0xdeadbeef ^ salt.length;
  let h2 = 0x41c6ce57 ^ password.length;
  const combined = `${salt}:${password}:AL_NIBRAS_V1`;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `pbkdf2_v1$${hex1}${hex2}`;
}

export function verifyPasswordSync(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;
  return hashPasswordSync(password) === storedHash;
}

export function normalizePosition(pos?: string): ResultPosition {
  if (!pos) return 'None';
  const p = pos.trim().toLowerCase();
  if (p.startsWith('1st') || p === 'first' || p === 'first place') return '1st Place';
  if (p.startsWith('2nd') || p === 'second' || p === 'second place' || p.includes('runner-up')) return '2nd Place';
  if (p.startsWith('3rd') || p === 'third' || p === 'third place') return '3rd Place';
  return 'None';
}

export function normalizeGrade(grade?: string): ResultGrade {
  if (!grade) return 'None';
  const g = grade.trim().toUpperCase();
  if (g === 'A' || g === 'A GRADE') return 'A';
  if (g === 'B' || g === 'B GRADE') return 'B';
  return 'None';
}

export function calculatePositionPoints(position?: string): number {
  const normalized = normalizePosition(position);
  switch (normalized) {
    case '1st Place':
      return 3;
    case '2nd Place':
      return 2;
    case '3rd Place':
      return 1;
    case 'None':
    default:
      return 0;
  }
}

export function calculateGradePoints(grade?: string): number {
  const normalized = normalizeGrade(grade);
  switch (normalized) {
    case 'A':
      return 5;
    case 'B':
      return 3;
    case 'None':
    default:
      return 0;
  }
}

export function calculateResultPoints(
  position?: string,
  grade?: string
): {
  position: ResultPosition;
  grade: ResultGrade;
  positionPoints: number;
  gradePoints: number;
  totalPoints: number;
} {
  const normPos = normalizePosition(position);
  const normGrade = normalizeGrade(grade);
  const positionPoints = calculatePositionPoints(normPos);
  const gradePoints = calculateGradePoints(normGrade);
  return {
    position: normPos,
    grade: normGrade,
    positionPoints,
    gradePoints,
    totalPoints: positionPoints + gradePoints,
  };
}

export function recomputeStudentPointSummaries(
  users: UserProfile[],
  studentResults: StudentResultRecord[],
  nowIso = new Date().toISOString()
): StudentPointSummary[] {
  const students = users.filter((u) => u.role === 'student');
  const publishedResults = studentResults.filter((r) => r.status === 'published');

  return students.map((student) => {
    const records = publishedResults.filter((r) => r.studentUid === student.uid);
    let totalPoints = 0;
    let firstPlaceCount = 0;
    let secondPlaceCount = 0;
    let thirdPlaceCount = 0;
    let gradeACount = 0;
    let gradeBCount = 0;

    for (const r of records) {
      const calc = calculateResultPoints(r.position, r.grade);
      totalPoints += calc.totalPoints;
      if (calc.position === '1st Place') firstPlaceCount += 1;
      if (calc.position === '2nd Place') secondPlaceCount += 1;
      if (calc.position === '3rd Place') thirdPlaceCount += 1;
      if (calc.grade === 'A') gradeACount += 1;
      if (calc.grade === 'B') gradeBCount += 1;
    }

    return {
      studentUid: student.uid,
      studentId: student.studentId,
      studentName: student.fullName,
      studentAvatar: student.avatarUrl,
      studentDepartment: student.department,
      rollNumber: student.rollNumber,
      totalPoints,
      firstPlaceCount,
      secondPlaceCount,
      thirdPlaceCount,
      gradeACount,
      gradeBCount,
      totalAchievements: records.length,
      updatedAt: nowIso,
    };
  });
}

export function computeStudentLeaderboard(
  summaries: StudentPointSummary[]
): (StudentPointSummary & { rank: number })[] {
  const sorted = [...summaries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.firstPlaceCount !== a.firstPlaceCount) return b.firstPlaceCount - a.firstPlaceCount;
    if (b.gradeACount !== a.gradeACount) return b.gradeACount - a.gradeACount;
    return a.studentName.localeCompare(b.studentName);
  });

  let currentRank = 1;
  return sorted.map((item, idx) => {
    if (idx > 0 && item.totalPoints < sorted[idx - 1].totalPoints) {
      currentRank = idx + 1;
    }
    return {
      ...item,
      rank: currentRank,
    };
  });
}

export function filterVisibleContent<T extends { status: ContentStatus }>(
  items: T[],
  viewerRole: UserRole | 'public'
): T[] {
  if (viewerRole === 'admin') {
    return items;
  }
  return items.filter((item) => item.status === 'published');
}

export function canAccessUserProfile(
  viewer: { uid: string; role: UserRole; emailVerified?: boolean } | null,
  targetUserId: string
): boolean {
  if (!viewer || !isValidResourceId(targetUserId)) return false;
  if (viewer.role === 'admin') return true;
  return viewer.uid === targetUserId;
}

export function validateStudentUpdatePayload(
  existingUser: UserProfile,
  incomingPatch: Record<string, unknown>,
  actor: { uid: string; role: UserRole; emailVerified: boolean }
): { valid: boolean; reason?: string } {
  if (!actor.emailVerified) {
    return { valid: false, reason: 'EMAIL_NOT_VERIFIED' };
  }
  const allowedStudentKeys = new Set([
    'username',
    'fullName',
    'contactEmail',
    'contactPhone',
    'avatarUrl',
    'updatedAt',
  ]);
  const allowedAdminKeys = new Set([
    'uid',
    'fullName',
    'username',
    'studentId',
    'rollNumber',
    'role',
    'status',
    'contactEmail',
    'contactPhone',
    'avatarUrl',
    'department',
    'createdAt',
    'updatedAt',
  ]);

  const keys = Object.keys(incomingPatch);
  if (keys.length === 0) {
    return { valid: false, reason: 'EMPTY_UPDATE' };
  }

  for (const key of keys) {
    if (!allowedAdminKeys.has(key)) {
      return { valid: false, reason: `SHADOW_FIELD_DETECTED:${key}` };
    }
  }

  if (actor.role !== 'admin') {
    if (actor.uid !== existingUser.uid) {
      return { valid: false, reason: 'CROSS_USER_UPDATE_DENIED' };
    }
    if (existingUser.status !== 'active') {
      return { valid: false, reason: 'INACTIVE_ACCOUNT_LOCKED' };
    }
    for (const key of keys) {
      if (!allowedStudentKeys.has(key)) {
        return { valid: false, reason: `FORBIDDEN_STUDENT_KEY:${key}` };
      }
    }
  }

  if (typeof incomingPatch.username === 'string') {
    if (incomingPatch.username.trim().length < 3 || incomingPatch.username.trim().length > 64) {
      return { valid: false, reason: 'INVALID_USERNAME_LENGTH' };
    }
  }
  if (typeof incomingPatch.fullName === 'string') {
    if (incomingPatch.fullName.trim().length < 2 || incomingPatch.fullName.trim().length > 120) {
      return { valid: false, reason: 'INVALID_FULLNAME_LENGTH' };
    }
  }
  return { valid: true };
}

export function validateAnnouncementPayload(
  payload: Record<string, unknown>,
  actor: { uid: string; role: UserRole; emailVerified: boolean }
): { valid: boolean; reason?: string } {
  if (!actor.emailVerified) {
    return { valid: false, reason: 'EMAIL_NOT_VERIFIED' };
  }
  if (actor.role !== 'admin') {
    return { valid: false, reason: 'ADMIN_ROLE_REQUIRED' };
  }
  const required = [
    'title',
    'content',
    'category',
    'status',
    'priority',
    'authorId',
    'authorName',
  ];
  for (const req of required) {
    if (!(req in payload)) {
      return { valid: false, reason: `MISSING_REQUIRED_FIELD:${req}` };
    }
  }
  const title = payload.title;
  const content = payload.content;
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 180) {
    return { valid: false, reason: 'INVALID_TITLE_BOUNDARY' };
  }
  if (typeof content !== 'string' || content.trim().length < 5 || content.length > 4000) {
    return { valid: false, reason: 'INVALID_CONTENT_BOUNDARY' };
  }
  if (payload.authorId !== actor.uid) {
    return { valid: false, reason: 'AUTHOR_SPOOFING_DETECTED' };
  }
  if (payload.status !== 'published' && payload.status !== 'draft') {
    return { valid: false, reason: 'INVALID_STATUS_ENUM' };
  }
  return { valid: true };
}

export function createSanitizedActivityLog(params: {
  id: string;
  actorId: string;
  actorName: string;
  actionType: ActivityActionType;
  details: string;
  targetId: string;
  createdAt?: string;
}): ActivityLog {
  // Never store plaintext passwords or secret tokens in activity logs
  const scrubbedDetails = params.details
    .replace(/password\s*[:=]\s*\S+/gi, 'password: [REDACTED]')
    .slice(0, 600);

  return {
    id: params.id,
    actorId: params.actorId,
    actorName: params.actorName.slice(0, 120),
    actionType: params.actionType,
    details: scrubbedDetails,
    targetId: params.targetId,
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}

export function isNotificationUnreadForUser(
  notification: PortalNotification,
  userId: string
): boolean {
  if (notification.recipientId !== 'ALL_STUDENTS' && notification.recipientId !== userId) {
    return false;
  }
  if (notification.read) return false;
  if (notification.readByUids && notification.readByUids.includes(userId)) {
    return false;
  }
  return true;
}

export function countUnreadNotifications(
  notifications: PortalNotification[],
  userId: string
): number {
  return notifications.filter((n) => isNotificationUnreadForUser(n, userId)).length;
}

export function computeDashboardMetrics(params: {
  users: UserProfile[];
  announcements: Announcement[];
  notices: Notice[];
  gallery: GalleryItem[];
  events?: unknown[];
  resources?: unknown[];
  messages?: DirectMessage[];
  fines?: FineRecord[];
  chatMessages?: ChatMessage[];
  programResults?: ProgramResult[];
  calendarEvents?: CalendarEvent[];
  activityLogs?: ActivityLog[];
}) {
  const students = params.users.filter((u) => u.role === 'student');
  const activeStudents = students.filter((u) => u.status === 'active');
  const inactiveStudents = students.filter((u) => u.status === 'inactive');
  const totalActiveAccounts = params.users.filter((u) => u.status === 'active').length;

  const publishedAnnouncements = params.announcements.filter((a) => a.status === 'published');
  const draftAnnouncements = params.announcements.filter((a) => a.status === 'draft');
  const publishedNotices = params.notices.filter((n) => n.status === 'published');

  const messages = params.messages || [];
  const unresolvedInquiries = messages.filter((m) => m.status !== 'replied');

  const fines = params.fines || [];
  const unpaidFines = fines.filter((f) => f.status === 'unpaid' || f.status === 'overdue');
  const paidFines = fines.filter((f) => f.status === 'paid');
  const totalUnpaidFineAmount = unpaidFines.reduce((sum, f) => sum + (f.amount || 0), 0);
  const totalPaidFineAmount = paidFines.reduce((sum, f) => sum + (f.amount || 0), 0);

  const programResults = params.programResults || [];
  const publishedProgramResults = programResults.filter((p) => p.status === 'published');
  const upcomingPrograms = programResults.filter((p) => {
    const d = new Date(p.programDate);
    return !isNaN(d.getTime()) && d.getTime() >= Date.now() - 86400000;
  });

  const chatMessages = params.chatMessages || [];
  const unreadMessagesCount = chatMessages.filter((m) => !m.read).length;

  const calendarEvents = params.calendarEvents || [];
  const upcomingCalendarEvents = calendarEvents.filter((e) => {
    const d = new Date(e.startDate);
    return !isNaN(d.getTime()) && d.getTime() >= Date.now() - 86400000;
  });

  const activityLogs = params.activityLogs || [];
  const recentAccountChanges = activityLogs.filter(
    (l) =>
      l.actionType === 'ACCOUNT_CREATION' ||
      l.actionType === 'ACCOUNT_DELETED' ||
      l.actionType === 'PASSWORD_CHANGE' ||
      l.actionType === 'USERNAME_CHANGE' ||
      l.actionType === 'PROFILE_UPDATE'
  );

  return {
    totalStudents: students.length,
    totalActiveAccounts,
    unresolvedInquiriesCount: unresolvedInquiries.length,
    totalUnpaidFines: unpaidFines.length,
    totalPaidFines: paidFines.length,
    totalUnpaidFineAmount,
    totalPaidFineAmount,
    upcomingProgramsCount: upcomingPrograms.length,
    publishedProgramResultsCount: publishedProgramResults.length,
    unreadMessagesCount,
    upcomingCalendarEventsCount: upcomingCalendarEvents.length,
    recentAccountChangesCount: recentAccountChanges.length,
    activeAccounts: activeStudents.length,
    inactiveAccounts: inactiveStudents.length,
    publishedAnnouncementsCount: publishedAnnouncements.length,
    draftAnnouncementsCount: draftAnnouncements.length,
    publishedNoticesCount: publishedNotices.length,
    totalGalleryCount: params.gallery.length,
  };
}

export function filterFines(
  fines: FineRecord[],
  options: {
    query?: string;
    status?: 'all' | FineStatus;
    studentUid?: string;
    category?: string;
  } = {}
): FineRecord[] {
  const { query = '', status = 'all', studentUid = '', category = 'all' } = options;
  const q = query.trim().toLowerCase();

  return fines.filter((fine) => {
    if (studentUid && fine.studentUid !== studentUid) return false;
    if (status !== 'all' && fine.status !== status) return false;
    if (category !== 'all' && fine.category !== category) return false;

    if (q) {
      const matchTitle = fine.title.toLowerCase().includes(q);
      const matchDesc = fine.description.toLowerCase().includes(q);
      const matchStudent = fine.studentName.toLowerCase().includes(q);
      const matchRoll = fine.studentRoll.toLowerCase().includes(q);
      const matchCategory = fine.category.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchStudent && !matchRoll && !matchCategory) {
        return false;
      }
    }
    return true;
  });
}

export function filterProgramResults(
  results: ProgramResult[],
  options: {
    query?: string;
    category?: string;
    userRole?: string;
  } = {}
): ProgramResult[] {
  const { query = '', category = 'all', userRole = 'student' } = options;
  const q = query.trim().toLowerCase();

  return results.filter((res) => {
    if (userRole !== 'admin' && res.status !== 'published') return false;
    if (category !== 'all' && res.category !== category) return false;
    if (q) {
      const matchName = res.programName.toLowerCase().includes(q);
      const matchDesc = res.description.toLowerCase().includes(q);
      const matchWinner = res.winnerSummary.toLowerCase().includes(q);
      const matchParticipant = res.participants.some((p) => p.name.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchWinner && !matchParticipant) return false;
    }
    return true;
  });
}

export function filterCalendarEvents(
  events: CalendarEvent[],
  options: {
    userRole?: string;
    category?: string;
    query?: string;
    dateFilter?: string; // YYYY-MM
  } = {}
): CalendarEvent[] {
  const { userRole = 'student', category = 'all', query = '', dateFilter = '' } = options;
  const q = query.trim().toLowerCase();

  return events.filter((evt) => {
    if (userRole !== 'admin' && evt.visibility === 'private') return false;
    if (category !== 'all' && evt.category !== category) return false;
    if (dateFilter && !evt.startDate.startsWith(dateFilter)) return false;
    if (q) {
      const matchTitle = evt.title.toLowerCase().includes(q);
      const matchDesc = evt.description.toLowerCase().includes(q);
      const matchLocation = evt.location.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchLocation) return false;
    }
    return true;
  });
}

export function getAccountActivityLogs(logs: ActivityLog[], targetUid: string): ActivityLog[] {
  return logs.filter((l) => l.targetId === targetUid || l.actorId === targetUid);
}

export function filterStudents(
  users: UserProfile[],
  query: string,
  statusFilter: 'all' | AccountStatus,
  departmentFilter = 'all'
): UserProfile[] {
  const normalizedQuery = query.trim().toLowerCase();
  return users
    .filter((u) => u.role === 'student')
    .filter((u) => (statusFilter === 'all' ? true : u.status === statusFilter))
    .filter((u) => (departmentFilter === 'all' ? true : u.department === departmentFilter))
    .filter((u) => {
      if (!normalizedQuery) return true;
      return (
        u.fullName.toLowerCase().includes(normalizedQuery) ||
        u.username.toLowerCase().includes(normalizedQuery) ||
        u.studentId.toLowerCase().includes(normalizedQuery) ||
        u.rollNumber.toLowerCase().includes(normalizedQuery) ||
        u.department.toLowerCase().includes(normalizedQuery)
      );
    });
}

export interface ActivityTimelinePoint {
  dateKey: string;
  displayDate: string;
  studentEvents: number;
  totalEvents: number;
  cumulativeStudentEvents: number;
}

export function computeActivityGrowthOverTime(
  logs: ActivityLog[],
  users?: UserProfile[]
): ActivityTimelinePoint[] {
  if (!logs || logs.length === 0) {
    return [];
  }

  // Create lookup for student UIDs if users are supplied
  const studentUidSet = new Set<string>();
  if (users && users.length > 0) {
    for (const u of users) {
      if (u.role === 'student') {
        studentUidSet.add(u.uid);
      }
    }
  }

  // Sort logs chronologically ascending
  const sorted = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Group by calendar date (YYYY-MM-DD)
  const map = new Map<
    string,
    { dateKey: string; displayDate: string; studentEvents: number; totalEvents: number }
  >();

  for (const log of sorted) {
    const d = new Date(log.createdAt);
    const dateKey = !isNaN(d.getTime()) ? getIndiaDateISO(d) : '2026-11-01';
    const displayDate = !isNaN(d.getTime())
      ? d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: INDIA_TIME_ZONE })
      : dateKey;

    if (!map.has(dateKey)) {
      map.set(dateKey, {
        dateKey,
        displayDate,
        studentEvents: 0,
        totalEvents: 0,
      });
    }

    const entry = map.get(dateKey)!;
    entry.totalEvents += 1;

    // Check if actor is a student or action is student-oriented
    const isStudentActor =
      studentUidSet.size > 0
        ? studentUidSet.has(log.actorId)
        : log.actorId.startsWith('student_') || log.actorName.toLowerCase() !== 'super admin';

    if (isStudentActor) {
      entry.studentEvents += 1;
    }
  }

  // Calculate cumulative growth
  let cumulative = 0;
  const result: ActivityTimelinePoint[] = [];

  for (const [, val] of map.entries()) {
    cumulative += val.studentEvents;
    result.push({
      dateKey: val.dateKey,
      displayDate: val.displayDate,
      studentEvents: val.studentEvents,
      totalEvents: val.totalEvents,
      cumulativeStudentEvents: cumulative,
    });
  }

  return result;
}

export interface ActivityLogFilterOptions {
  query?: string;
  actionType?: 'ALL' | ActivityActionType;
  startDate?: string;
  endDate?: string;
}

export function filterActivityLogs(
  logs: ActivityLog[],
  options: ActivityLogFilterOptions = {}
): ActivityLog[] {
  const { query = '', actionType = 'ALL', startDate = '', endDate = '' } = options;
  const q = query.trim().toLowerCase();

  return logs.filter((log) => {
    if (actionType !== 'ALL' && log.actionType !== actionType) {
      return false;
    }

    const logDateObj = new Date(log.createdAt);
    const logDateKey = !isNaN(logDateObj.getTime())
      ? getIndiaDateISO(logDateObj)
      : '';

    if (startDate && logDateKey && logDateKey < startDate) {
      return false;
    }
    if (endDate && logDateKey && logDateKey > endDate) {
      return false;
    }

    if (q) {
      const matchesActor =
        log.actorName.toLowerCase().includes(q) || log.actorId.toLowerCase().includes(q);
      const matchesDetails = log.details.toLowerCase().includes(q);
      const matchesAction = log.actionType.toLowerCase().includes(q);
      const matchesTarget = log.targetId.toLowerCase().includes(q);
      if (!matchesActor && !matchesDetails && !matchesAction && !matchesTarget) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Formats any numerical amount in Indian Rupees (INR ₹) using Indian numbering system (e.g. ₹1,25,000 or ₹1,25,000.00).
 */
export function formatINR(amount: number, showDecimals = false): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

/**
 * Normalizes a date string into YYYY-MM-DD in India Standard Time for calendar grids.
 */
export function parseUnionEventDate(eventDateStr: string): string {
  if (!eventDateStr) return '2026-11-18';
  const trimmed = eventDateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const datePart = trimmed.split('·')[0].trim();
  const parsed = new Date(datePart);
  if (!isNaN(parsed.getTime())) {
    return getIndiaDateISO(parsed);
  }
  return '2026-11-18';
}

export interface UnionFinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  currentUnionBalance: number;
  currentBalance: number;
  totalStudentContributions: number;
  totalDuePaymentsReceived: number;
  totalGeneralIncome: number;
  totalOutstandingDues: number;
  pendingStudentDues: number;
  totalStudentsWhoPaid: number;
  studentsPaidCount: number;
  totalStudentsWithPendingPayments: number;
  studentsPendingCount: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  categoryIncomeMap: Record<string, number>;
  categoryExpenseMap: Record<string, number>;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

/**
 * Calculates accurate Union Financial Management metrics from real database records.
 * - Student contributions and verified due payments are counted in totalIncome.
 * - Pending dues are NEVER counted as income.
 * - Current Union Balance = Total Verified Income - Total Verified Expenses.
 */
export function computeFinancialSummary(
  stateOrIncome:
    | Pick<
        PortalDatabaseState,
        'income' | 'expenses' | 'studentContributions' | 'studentDues' | 'fines'
      >
    | IncomeRecord[],
  expensesOrMonthPrefix?: ExpenseRecord[] | string,
  contributionsArg?: StudentContributionRecord[],
  duesArg?: StudentDueRecord[],
  monthPrefixArg = '2026-11'
): UnionFinancialSummary {
  const isStateObj = !Array.isArray(stateOrIncome);
  const incomeList: IncomeRecord[] = isStateObj
    ? stateOrIncome.income || []
    : stateOrIncome || [];
  const expenseList: ExpenseRecord[] = isStateObj
    ? stateOrIncome.expenses || []
    : Array.isArray(expensesOrMonthPrefix)
    ? expensesOrMonthPrefix
    : [];
  const contributions: StudentContributionRecord[] = isStateObj
    ? stateOrIncome.studentContributions || []
    : contributionsArg || [];
  const dues: StudentDueRecord[] = isStateObj
    ? stateOrIncome.studentDues || []
    : duesArg || [];
  const fines: FineRecord[] = isStateObj ? stateOrIncome.fines || [] : [];
  const referenceMonthPrefix =
    typeof expensesOrMonthPrefix === 'string' ? expensesOrMonthPrefix : monthPrefixArg;

  const paidStudentUids = new Set<string>();
  const pendingStudentUids = new Set<string>();
  const categoryIncomeMap: Record<string, number> = {};
  const categoryExpenseMap: Record<string, number> = {};

  let totalGeneralIncome = 0;
  let monthlyIncome = 0;

  // 1. General income entries (excluding auto-mirrored STUDENT_CONTRIBUTION / DUE_PAYMENT to prevent double counting)
  for (const inc of incomeList) {
    if (
      inc.sourceType === 'STUDENT_CONTRIBUTION' ||
      inc.sourceType === 'DUE_PAYMENT' ||
      inc.sourceContributionId ||
      inc.sourceDueId
    ) {
      continue;
    }
    const amt = Number(inc.amount) || 0;
    totalGeneralIncome += amt;
    categoryIncomeMap[inc.category || 'General'] =
      (categoryIncomeMap[inc.category || 'General'] || 0) + amt;
    if (inc.date && inc.date.startsWith(referenceMonthPrefix)) {
      monthlyIncome += amt;
    }
    if (inc.studentUid) {
      paidStudentUids.add(inc.studentUid);
    }
  }

  // 2. Student Contributions (counted once in totalIncome)
  let totalStudentContributions = 0;
  for (const c of contributions) {
    const amt = Number(c.amount) || 0;
    totalStudentContributions += amt;
    const cat = c.category || 'Student Contribution';
    categoryIncomeMap[cat] = (categoryIncomeMap[cat] || 0) + amt;
    const cDate = c.paymentDate || c.date || '';
    if (cDate.startsWith(referenceMonthPrefix)) {
      monthlyIncome += amt;
    }
    if (c.studentUid && amt > 0) {
      paidStudentUids.add(c.studentUid);
    }
  }

  // 3. Student Dues (only actual paid amount increases income; remaining is tracked as outstanding)
  let totalDuePaymentsReceived = 0;
  let totalOutstandingDues = 0;
  for (const d of dues) {
    if (d.status === 'Cancelled' || d.status === 'cancelled') continue;
    const paid = Number(d.paidAmount ?? d.amountPaid) || 0;
    const total = Number(d.totalAmount) || 0;
    const remaining =
      d.remainingAmount !== undefined
        ? Number(d.remainingAmount)
        : d.remainingDue !== undefined
        ? Number(d.remainingDue)
        : Math.max(0, total - paid);

    if (paid > 0) {
      totalDuePaymentsReceived += paid;
      const cat = d.dueCategory || d.category || 'Dues Payment';
      categoryIncomeMap[cat] = (categoryIncomeMap[cat] || 0) + paid;
      if (d.studentUid) {
        paidStudentUids.add(d.studentUid);
      }
      for (const p of d.payments || []) {
        const pDate = p.paymentDate || p.date || '';
        if (pDate.startsWith(referenceMonthPrefix)) {
          monthlyIncome += Number(p.amount) || 0;
        }
      }
    }
    if (remaining > 0) {
      totalOutstandingDues += remaining;
      if (d.studentUid) {
        pendingStudentUids.add(d.studentUid);
      }
    }
  }

  // 4. Paid Fines vs Unpaid Fines
  let totalFineIncome = 0;
  for (const f of fines) {
    if (f.status === 'cancelled') continue;
    const amt = Number(f.amount) || 0;
    if (f.status === 'paid') {
      totalFineIncome += amt;
      categoryIncomeMap['Fine Collection'] = (categoryIncomeMap['Fine Collection'] || 0) + amt;
      if (f.studentUid) paidStudentUids.add(f.studentUid);
      if ((f.paidAt || f.issueDate || '').startsWith(referenceMonthPrefix)) {
        monthlyIncome += amt;
      }
    } else {
      totalOutstandingDues += amt;
      if (f.studentUid) pendingStudentUids.add(f.studentUid);
    }
  }

  // 5. Expenses
  let totalExpenses = 0;
  let monthlyExpenses = 0;
  for (const exp of expenseList) {
    const amt = Number(exp.amount) || 0;
    totalExpenses += amt;
    const cat = exp.category || 'General Expense';
    categoryExpenseMap[cat] = (categoryExpenseMap[cat] || 0) + amt;
    const expDate = exp.expenseDate || exp.date || '';
    if (expDate.startsWith(referenceMonthPrefix)) {
      monthlyExpenses += amt;
    }
  }

  const totalIncome =
    totalGeneralIncome + totalStudentContributions + totalDuePaymentsReceived + totalFineIncome;
  const currentUnionBalance = totalIncome - totalExpenses;

  return {
    totalIncome,
    totalExpenses,
    currentUnionBalance,
    currentBalance: currentUnionBalance,
    totalStudentContributions,
    totalDuePaymentsReceived,
    totalGeneralIncome,
    totalOutstandingDues,
    pendingStudentDues: totalOutstandingDues,
    totalStudentsWhoPaid: paidStudentUids.size,
    studentsPaidCount: paidStudentUids.size,
    totalStudentsWithPendingPayments: pendingStudentUids.size,
    studentsPendingCount: pendingStudentUids.size,
    monthlyIncome,
    monthlyExpenses,
    categoryIncomeMap,
    categoryExpenseMap,
    incomeByCategory: categoryIncomeMap,
    expenseByCategory: categoryExpenseMap,
  };
}

export function getStudentFinancialProfile(
  stateOrUid:
    | Pick<
        PortalDatabaseState,
        'studentContributions' | 'studentDues' | 'fines' | 'financialReceipts'
      >
    | string,
  uidOrState:
    | string
    | Pick<
        PortalDatabaseState,
        'studentContributions' | 'studentDues' | 'fines' | 'financialReceipts'
      >
) {
  const state = typeof stateOrUid === 'string' ? (uidOrState as Pick<
    PortalDatabaseState,
    'studentContributions' | 'studentDues' | 'fines' | 'financialReceipts'
  >) : stateOrUid;
  const studentUid = typeof stateOrUid === 'string' ? stateOrUid : (uidOrState as string);

  const contributions = (state.studentContributions || []).filter(
    (c) => c.studentUid === studentUid
  );
  const dues = (state.studentDues || []).filter(
    (d) => d.studentUid === studentUid && d.status !== 'Cancelled' && d.status !== 'cancelled'
  );
  const fines = (state.fines || []).filter(
    (f) => f.studentUid === studentUid && f.status !== 'cancelled'
  );
  const receipts = (state.financialReceipts || []).filter((r) => r.studentUid === studentUid);

  const contributionTotal = contributions.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const duesTotalAssigned = dues.reduce((acc, d) => acc + (Number(d.totalAmount) || 0), 0);
  const duesTotalPaid = dues.reduce(
    (acc, d) => acc + (Number(d.paidAmount ?? d.amountPaid) || 0),
    0
  );
  const duesRemaining = dues.reduce(
    (acc, d) =>
      acc +
      Math.max(
        0,
        (Number(d.totalAmount) || 0) - (Number(d.paidAmount ?? d.amountPaid) || 0)
      ),
    0
  );

  const finesPaid = fines
    .filter((f) => f.status === 'paid')
    .reduce((acc, f) => acc + (Number(f.amount) || 0), 0);
  const finesUnpaid = fines
    .filter((f) => f.status !== 'paid')
    .reduce((acc, f) => acc + (Number(f.amount) || 0), 0);

  const totalAmountDue = duesTotalAssigned + finesPaid + finesUnpaid;
  const totalAmountPaid = contributionTotal + duesTotalPaid + finesPaid;
  const remainingBalance = duesRemaining + finesUnpaid;

  return {
    totalAmountDue,
    totalAmountPaid,
    contributionTotal,
    totalContributionsPaid: contributionTotal,
    totalContributed: contributionTotal,
    duesTotalAssigned,
    totalDuesAssigned: duesTotalAssigned,
    duesTotalPaid,
    totalDuesPaid: duesTotalPaid,
    remainingBalance,
    totalDuesRemaining: duesRemaining,
    totalDuesPending: duesRemaining,
    totalFinesPaid: finesPaid,
    totalFinesUnpaid: finesUnpaid,
    contributions,
    dues,
    fines,
    receipts,
  };
}

export const INDIA_TIME_ZONE = 'Asia/Kolkata';

export function getIndiaDateISO(date: Date = new Date()): string {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(safeDate);
}

export function formatIndiaDate(
  input: string | Date,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input || '');
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).format(d);
}

export function formatIndiaTime(
  input: string | Date,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true }
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input || '');
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).format(d);
}

export function formatIndiaDateTime(
  input: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input || '');
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).format(d);
}

export interface LiveDateTimeParts {
  day: string;
  date: string;
  shortDate: string;
  time: string;
  isoDate: string;
  timeZoneLabel: string;
}

export function formatLiveDateTime(
  now: Date = new Date(),
  locale = 'en-IN',
  timeZone: string = INDIA_TIME_ZONE
): LiveDateTimeParts {
  const safeDate = Number.isNaN(now.getTime()) ? new Date() : now;
  const resolvedTz = timeZone || INDIA_TIME_ZONE;

  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: resolvedTz,
  }).format(safeDate);

  const date = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: resolvedTz,
  }).format(safeDate);

  const shortDate = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    timeZone: resolvedTz,
  }).format(safeDate);

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: resolvedTz,
  }).format(safeDate);

  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolvedTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(safeDate);

  return {
    day,
    date,
    shortDate,
    time,
    isoDate,
    timeZoneLabel: resolvedTz === INDIA_TIME_ZONE ? 'IST' : resolvedTz,
  };
}

