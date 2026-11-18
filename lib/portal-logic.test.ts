import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateGradePoints,
  calculatePositionPoints,
  calculateResultPoints,
  canAccessUserProfile,
  computeActivityGrowthOverTime,
  computeDashboardMetrics,
  computeFinancialSummary,
  computeStudentLeaderboard,
  countUnreadNotifications,
  createSanitizedActivityLog,
  filterActivityLogs,
  filterStudents,
  filterVisibleContent,
  formatINR,
  getStudentFinancialProfile,
  hashPasswordSync,
  isValidResourceId,
  parseUnionEventDate,
  recomputeStudentPointSummaries,
  validateAnnouncementPayload,
  validateStudentUpdatePayload,
  verifyPasswordSync,
} from './portal-logic';
import type { Announcement, PortalNotification, StudentResultRecord, UserProfile } from './types';

const sampleStudent: UserProfile = {
  uid: 'student_1',
  fullName: 'Ahmed Al-Mansoor',
  username: 'ahmed.mansoor',
  studentId: 'AN-2026-101',
  rollNumber: '01',
  role: 'student',
  status: 'active',
  contactEmail: 'ahmed.mansoor@alnibras.edu',
  contactPhone: '+971-50-234-8891',
  avatarUrl: '/images/avatar_admin_portrait.jpg',
  department: 'Islamic Jurisprudence & Ethics',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-01T08:00:00.000Z',
};

test('password hashing and verification never expose plaintext and match deterministically', () => {
  const hash = hashPasswordSync('AlNibras#Admin2026');
  assert.equal(hash.includes('AlNibras#Admin2026'), false);
  assert.equal(verifyPasswordSync('AlNibras#Admin2026', hash), true);
  assert.equal(verifyPasswordSync('WrongPassword', hash), false);
});

test('Dirty Dozen #1, #2, #3: student update validation blocks shadow fields, status tampering, and cross-user writes', () => {
  // Shadow field injection (#2)
  const shadowRes = validateStudentUpdatePayload(
    sampleStudent,
    { username: 'ahmed_new', isSuperAdmin: true },
    { uid: 'student_1', role: 'student', emailVerified: true }
  );
  assert.equal(shadowRes.valid, false);
  assert.match(shadowRes.reason ?? '', /SHADOW_FIELD_DETECTED/);

  // Student attempting to change own account status (#3)
  const statusTamper = validateStudentUpdatePayload(
    sampleStudent,
    { status: 'active' },
    { uid: 'student_1', role: 'student', emailVerified: true }
  );
  assert.equal(statusTamper.valid, false);
  assert.match(statusTamper.reason ?? '', /FORBIDDEN_STUDENT_KEY:status/);

  // Student updating another student (#4)
  const crossUser = validateStudentUpdatePayload(
    sampleStudent,
    { username: 'hacked' },
    { uid: 'student_2', role: 'student', emailVerified: true }
  );
  assert.equal(crossUser.valid, false);
  assert.equal(crossUser.reason, 'CROSS_USER_UPDATE_DENIED');

  // Valid self-update of username
  const validSelf = validateStudentUpdatePayload(
    sampleStudent,
    { username: 'ahmed.scholar', updatedAt: new Date().toISOString() },
    { uid: 'student_1', role: 'student', emailVerified: true }
  );
  assert.equal(validSelf.valid, true);
});

test('Dirty Dozen #4 & #5: PII isolation restricts profile read access to owner or admin', () => {
  assert.equal(
    canAccessUserProfile({ uid: 'student_1', role: 'student' }, 'student_1'),
    true
  );
  assert.equal(
    canAccessUserProfile({ uid: 'student_1', role: 'student' }, 'student_2'),
    false
  );
  assert.equal(
    canAccessUserProfile({ uid: 'admin_1', role: 'admin' }, 'student_2'),
    true
  );
});

test('Dirty Dozen #6: draft content remains invisible to students and public visitors', () => {
  const announcements: Announcement[] = [
    {
      id: 'ann_1',
      title: 'Annual Convocation Schedule',
      content: 'Convocation starts at 9 AM in the Grand Hall.',
      category: 'Academic',
      status: 'published',
      priority: 'high',
      authorId: 'admin_1',
      authorName: 'SUPER ADMIN',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
    {
      id: 'ann_2',
      title: 'Internal Draft Budget Review',
      content: 'Draft notes for executive committee.',
      category: 'Executive',
      status: 'draft',
      priority: 'normal',
      authorId: 'admin_1',
      authorName: 'SUPER ADMIN',
      createdAt: '2026-10-02T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
    },
  ];

  const studentVisible = filterVisibleContent(announcements, 'student');
  assert.equal(studentVisible.length, 1);
  assert.equal(studentVisible[0].id, 'ann_1');

  const adminVisible = filterVisibleContent(announcements, 'admin');
  assert.equal(adminVisible.length, 2);
});

test('Dirty Dozen #7, #8, #9, #10: announcement validation blocks students, unverified emails, oversized titles, and bad IDs', () => {
  // Student attempting to publish (#7)
  const studentAttempt = validateAnnouncementPayload(
    {
      title: 'Fake Notice',
      content: 'Classes cancelled.',
      category: 'General',
      status: 'published',
      priority: 'urgent',
      authorId: 'student_1',
      authorName: 'Student',
    },
    { uid: 'student_1', role: 'student', emailVerified: true }
  );
  assert.equal(studentAttempt.valid, false);
  assert.equal(studentAttempt.reason, 'ADMIN_ROLE_REQUIRED');

  // Unverified email spoof (#8)
  const spoofAttempt = validateAnnouncementPayload(
    {
      title: 'Spoofed Notice',
      content: 'Valid length content.',
      category: 'General',
      status: 'published',
      priority: 'normal',
      authorId: 'admin_1',
      authorName: 'SUPER ADMIN',
    },
    { uid: 'admin_1', role: 'admin', emailVerified: false }
  );
  assert.equal(spoofAttempt.valid, false);
  assert.equal(spoofAttempt.reason, 'EMAIL_NOT_VERIFIED');

  // Oversized title (#9)
  const oversizedAttempt = validateAnnouncementPayload(
    {
      title: 'A'.repeat(250),
      content: 'Valid length content.',
      category: 'General',
      status: 'published',
      priority: 'normal',
      authorId: 'admin_1',
      authorName: 'SUPER ADMIN',
    },
    { uid: 'admin_1', role: 'admin', emailVerified: true }
  );
  assert.equal(oversizedAttempt.valid, false);
  assert.equal(oversizedAttempt.reason, 'INVALID_TITLE_BOUNDARY');

  // Malformed ID (#10)
  assert.equal(isValidResourceId('valid_id-123'), true);
  assert.equal(isValidResourceId('bad$id with spaces!'), false);
});

test('activity logs scrub accidental password strings and notifications count unread items accurately', () => {
  const log = createSanitizedActivityLog({
    id: 'log_1',
    actorId: 'student_1',
    actorName: 'Ahmed Al-Mansoor',
    actionType: 'PASSWORD_CHANGE',
    details: 'User updated credentials password: MySecretPassword123',
    targetId: 'student_1',
  });
  assert.equal(log.details.includes('MySecretPassword123'), false);
  assert.equal(log.details.includes('[REDACTED]'), true);

  const notifications: PortalNotification[] = [
    {
      id: 'notif_1',
      recipientId: 'ALL_STUDENTS',
      title: 'New Announcement',
      message: 'Term calendar published',
      type: 'announcement',
      read: false,
      readByUids: [],
      relatedId: 'ann_1',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
    {
      id: 'notif_2',
      recipientId: 'ALL_STUDENTS',
      title: 'Read Notice',
      message: 'Already read by student_1',
      type: 'notice',
      read: false,
      readByUids: ['student_1'],
      relatedId: 'not_1',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    },
  ];
  assert.equal(countUnreadNotifications(notifications, 'student_1'), 1);
  assert.equal(countUnreadNotifications(notifications, 'student_2'), 2);
});

test('student search and dashboard metrics compute exact institutional counts', () => {
  const users: UserProfile[] = [
    sampleStudent,
    {
      ...sampleStudent,
      uid: 'student_2',
      fullName: 'Zaynab Al-Rashid',
      username: 'zaynab.rashid',
      studentId: 'AN-2026-102',
      rollNumber: '02',
      status: 'inactive',
      department: 'Arabic Rhetoric & Literature',
    },
  ];
  const filtered = filterStudents(users, 'zaynab', 'all');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].uid, 'student_2');

  const metrics = computeDashboardMetrics({
    users,
    announcements: [],
    notices: [],
    events: [],
    resources: [],
    gallery: [],
  });
  assert.equal(metrics.totalStudents, 2);
  assert.equal(metrics.activeAccounts, 1);
  assert.equal(metrics.inactiveAccounts, 1);
});

test('computeActivityGrowthOverTime correctly groups and aggregates student activities chronologically', () => {
  const sampleLogs = [
    createSanitizedActivityLog({
      id: 'l1',
      actorId: 'student_1',
      actorName: 'Ahmed Al-Mansoor',
      actionType: 'PROFILE_UPDATE',
      details: 'Updated details',
      targetId: 'student_1',
      createdAt: '2026-11-01T10:00:00Z',
    }),
    createSanitizedActivityLog({
      id: 'l2',
      actorId: 'admin_super',
      actorName: 'SUPER ADMIN',
      actionType: 'CONTENT_PUBLICATION',
      details: 'Published notice',
      targetId: 'not_1',
      createdAt: '2026-11-01T11:00:00Z',
    }),
    createSanitizedActivityLog({
      id: 'l3',
      actorId: 'student_1',
      actorName: 'Ahmed Al-Mansoor',
      actionType: 'LOGIN',
      details: 'Student login',
      targetId: 'student_1',
      createdAt: '2026-11-02T08:00:00Z',
    }),
    createSanitizedActivityLog({
      id: 'l4',
      actorId: 'student_2',
      actorName: 'Zaynab Al-Rashid',
      actionType: 'PASSWORD_CHANGE',
      details: 'Password updated',
      targetId: 'student_2',
      createdAt: '2026-11-02T12:00:00Z',
    }),
  ];

  const growth = computeActivityGrowthOverTime(sampleLogs, [
    sampleStudent,
    {
      ...sampleStudent,
      uid: 'student_2',
      fullName: 'Zaynab Al-Rashid',
      username: 'zaynab.rashid',
      role: 'student',
    },
  ]);

  assert.equal(growth.length, 2);
  assert.equal(growth[0].dateKey, '2026-11-01');
  assert.equal(growth[0].studentEvents, 1);
  assert.equal(growth[0].totalEvents, 2);
  assert.equal(growth[0].cumulativeStudentEvents, 1);

  assert.equal(growth[1].dateKey, '2026-11-02');
  assert.equal(growth[1].studentEvents, 2);
  assert.equal(growth[1].totalEvents, 2);
  assert.equal(growth[1].cumulativeStudentEvents, 3);
});

test('filterActivityLogs filters accurately by search query, actionType, and inclusive date range', () => {
  const sampleLogs = [
    createSanitizedActivityLog({
      id: 'l1',
      actorId: 'student_1',
      actorName: 'Ahmed Al-Mansoor',
      actionType: 'PROFILE_UPDATE',
      details: 'Updated contact phone number',
      targetId: 'student_1',
      createdAt: '2026-11-01T10:00:00Z',
    }),
    createSanitizedActivityLog({
      id: 'l2',
      actorId: 'admin_super',
      actorName: 'SUPER ADMIN',
      actionType: 'CONTENT_PUBLICATION',
      details: 'Published symposium announcement',
      targetId: 'ann_1',
      createdAt: '2026-11-03T11:00:00Z',
    }),
    createSanitizedActivityLog({
      id: 'l3',
      actorId: 'student_2',
      actorName: 'Zaynab Al-Rashid',
      actionType: 'LOGIN',
      details: 'Student authenticated via portal',
      targetId: 'student_2',
      createdAt: '2026-11-05T08:00:00Z',
    }),
  ];

  // Search query filtering
  const bySearch = filterActivityLogs(sampleLogs, { query: 'symposium' });
  assert.equal(bySearch.length, 1);
  assert.equal(bySearch[0].id, 'l2');

  // Action type filtering
  const byType = filterActivityLogs(sampleLogs, { actionType: 'LOGIN' });
  assert.equal(byType.length, 1);
  assert.equal(byType[0].id, 'l3');

  // Date range filtering (inclusive start and end)
  const byDateRange = filterActivityLogs(sampleLogs, {
    startDate: '2026-11-02',
    endDate: '2026-11-04',
  });
  assert.equal(byDateRange.length, 1);
  assert.equal(byDateRange[0].id, 'l2');

  // Combined search + date range
  const combined = filterActivityLogs(sampleLogs, {
    query: 'Zaynab',
    startDate: '2026-11-05',
    endDate: '2026-11-05',
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'l3');
});

test('Automatic Point System calculates exact Position + Grade points for all combinations and handles edits/deletions accurately', () => {
  assert.equal(calculatePositionPoints('1st Place'), 3);
  assert.equal(calculatePositionPoints('2nd Place'), 2);
  assert.equal(calculatePositionPoints('3rd Place'), 1);
  assert.equal(calculatePositionPoints('None'), 0);

  assert.equal(calculateGradePoints('A'), 5);
  assert.equal(calculateGradePoints('B'), 3);
  assert.equal(calculateGradePoints('None'), 0);

  // Examples 1 to 6 from specification:
  // Example 1: 1st Place + A = 8
  assert.equal(calculateResultPoints('1st Place', 'A').totalPoints, 8);
  // Example 2: 2nd Place + B = 5
  assert.equal(calculateResultPoints('2nd Place', 'B').totalPoints, 5);
  // Example 3: 3rd Place + A = 6
  assert.equal(calculateResultPoints('3rd Place', 'A').totalPoints, 6);
  // Example 4: 1st Place + None = 3
  assert.equal(calculateResultPoints('1st Place', 'None').totalPoints, 3);
  // Example 5: None + B = 3
  assert.equal(calculateResultPoints('None', 'B').totalPoints, 3);
  // Example 6: None + None = 0
  assert.equal(calculateResultPoints('None', 'None').totalPoints, 0);

  const student2: UserProfile = {
    ...sampleStudent,
    uid: 'student_2',
    fullName: 'Zaynab Al-Rashid',
    studentId: 'AN-2026-102',
  };
  const student3: UserProfile = {
    ...sampleStudent,
    uid: 'student_3',
    fullName: 'Omar Ibn Farooq',
    studentId: 'AN-2026-103',
  };

  const results: StudentResultRecord[] = [
    {
      id: 'sr_1',
      programId: 'prog_1',
      programName: 'Debate',
      programCategory: 'Debate',
      programDate: '2026-10-28',
      publicationDate: '2026-10-29',
      studentUid: 'student_1',
      studentId: 'AN-2026-101',
      studentName: 'Ahmed Al-Mansoor',
      studentAvatar: '/images/avatar_admin_portrait.jpg',
      studentDepartment: 'Islamic Jurisprudence & Ethics',
      position: '1st Place',
      grade: 'A',
      positionPoints: 3,
      gradePoints: 5,
      totalPoints: 8,
      status: 'published',
      certificateId: 'cert_1',
      createdBy: 'admin_super',
      createdAt: '2026-10-29T10:00:00Z',
      updatedAt: '2026-10-29T10:00:00Z',
    },
    {
      id: 'sr_2',
      programId: 'prog_1',
      programName: 'Debate',
      programCategory: 'Debate',
      programDate: '2026-10-28',
      publicationDate: '2026-10-29',
      studentUid: 'student_2',
      studentId: 'AN-2026-102',
      studentName: 'Zaynab Al-Rashid',
      studentAvatar: '/images/avatar_admin_portrait.jpg',
      studentDepartment: 'Islamic Jurisprudence & Ethics',
      position: '1st Place',
      grade: 'A',
      positionPoints: 3,
      gradePoints: 5,
      totalPoints: 8,
      status: 'published',
      certificateId: 'cert_2',
      createdBy: 'admin_super',
      createdAt: '2026-10-29T10:00:00Z',
      updatedAt: '2026-10-29T10:00:00Z',
    },
    {
      id: 'sr_3',
      programId: 'prog_1',
      programName: 'Debate',
      programCategory: 'Debate',
      programDate: '2026-10-28',
      publicationDate: '2026-10-29',
      studentUid: 'student_3',
      studentId: 'AN-2026-103',
      studentName: 'Omar Ibn Farooq',
      studentAvatar: '/images/avatar_admin_portrait.jpg',
      studentDepartment: 'Islamic Jurisprudence & Ethics',
      position: '2nd Place',
      grade: 'B',
      positionPoints: 2,
      gradePoints: 3,
      totalPoints: 5,
      status: 'published',
      certificateId: 'cert_3',
      createdBy: 'admin_super',
      createdAt: '2026-10-29T10:00:00Z',
      updatedAt: '2026-10-29T10:00:00Z',
    },
  ];

  const summaries = recomputeStudentPointSummaries([sampleStudent, student2, student3], results);
  const leaderboard = computeStudentLeaderboard(summaries);

  // student_1 and student_2 both have 8 points -> tied rank 1!
  assert.equal(leaderboard[0].totalPoints, 8);
  assert.equal(leaderboard[0].rank, 1);
  assert.equal(leaderboard[1].totalPoints, 8);
  assert.equal(leaderboard[1].rank, 1);
  // student_3 has 5 points -> rank 3
  assert.equal(leaderboard[2].totalPoints, 5);
  assert.equal(leaderboard[2].rank, 3);
});

test('formatINR formats Indian Rupees accurately and parseUnionEventDate extracts YYYY-MM-DD for calendar views', () => {
  assert.equal(formatINR(0), '₹0');
  assert.equal(formatINR(500), '₹500');
  assert.equal(formatINR(125000).includes('₹'), true);

  assert.equal(parseUnionEventDate('2026-11-28'), '2026-11-28');
  assert.equal(parseUnionEventDate('November 28, 2026 · 05:00 PM'), '2026-11-28');
});

test('computeFinancialSummary and getStudentFinancialProfile compute exact INR income, expenses, contributions, and student dues', () => {
  const summary = computeFinancialSummary({
    income: [
      {
        id: 'inc_1',
        title: 'Patron Donation',
        category: 'Donation',
        amount: 15000,
        date: '2026-11-01',
        sourceReceivedFrom: 'Alumni Board',
        paymentMethod: 'Bank Transfer',
        referenceReceiptNo: 'ALN-INC-01',
        description: '',
        createdBy: 'SUPER ADMIN',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
    ],
    expenses: [
      {
        id: 'exp_1',
        expenseTitle: 'Stage Sound System',
        category: 'Sound & Stage',
        amount: 6000,
        expenseDate: '2026-11-02',
        paidTo: 'Malabar Audio',
        paymentMethod: 'UPI',
        billInvoiceNo: 'INV-01',
        description: '',
        approvedBy: 'SUPER ADMIN',
        createdAt: '2026-11-02T10:00:00Z',
        updatedAt: '2026-11-02T10:00:00Z',
      },
    ],
    studentContributions: [
      {
        id: 'con_1',
        studentUid: 'student_1',
        studentId: 'AN-2026-101',
        studentName: 'Ahmed Al-Mansoor',
        rollNumber: '01',
        classInfo: '11th Batch of DHBC',
        contributionPurpose: 'Union Fest Fund',
        category: 'Program Contribution',
        amount: 1000,
        paymentDate: '2026-11-03',
        paymentMethod: 'UPI',
        receiptNumber: 'ALN-RCP-101',
        remarks: '',
        paymentStatus: 'Paid',
        createdAt: '2026-11-03T10:00:00Z',
        updatedAt: '2026-11-03T10:00:00Z',
      },
    ],
    studentDues: [
      {
        id: 'due_1',
        studentUid: 'student_1',
        studentId: 'AN-2026-101',
        studentName: 'Ahmed Al-Mansoor',
        rollNumber: '01',
        classInfo: '11th Batch of DHBC',
        feeTitle: 'Annual Union Membership',
        category: 'Union Membership Fee',
        totalAmount: 1500,
        amountPaid: 500,
        remainingDue: 1000,
        dueDate: '2026-12-01',
        status: 'Partially Paid',
        payments: [],
        remarks: '',
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      },
    ],
    fines: [],
  });

  // Total income = 15000 (direct) + 1000 (contributions) + 500 (paid dues) = 16500
  assert.equal(summary.totalIncome, 16500);
  assert.equal(summary.totalExpenses, 6000);
  assert.equal(summary.currentUnionBalance, 10500);
  assert.equal(summary.totalOutstandingDues, 1000);

  const studentFin = getStudentFinancialProfile(
    {
      studentContributions: [
        {
          id: 'con_1',
          studentUid: 'student_1',
          studentId: 'AN-2026-101',
          studentName: 'Ahmed Al-Mansoor',
          rollNumber: '01',
          classInfo: '11th Batch of DHBC',
          contributionPurpose: 'Union Fest Fund',
          category: 'Program Contribution',
          amount: 1000,
          paymentDate: '2026-11-03',
          paymentMethod: 'UPI',
          receiptNumber: 'ALN-RCP-101',
          remarks: '',
          paymentStatus: 'Paid',
          createdAt: '2026-11-03T10:00:00Z',
          updatedAt: '2026-11-03T10:00:00Z',
        },
      ],
      studentDues: [
        {
          id: 'due_1',
          studentUid: 'student_1',
          studentId: 'AN-2026-101',
          studentName: 'Ahmed Al-Mansoor',
          rollNumber: '01',
          classInfo: '11th Batch of DHBC',
          feeTitle: 'Annual Union Membership',
          category: 'Union Membership Fee',
          totalAmount: 1500,
          amountPaid: 500,
          remainingDue: 1000,
          dueDate: '2026-12-01',
          status: 'Partially Paid',
          payments: [],
          remarks: '',
          createdAt: '2026-11-01T10:00:00Z',
          updatedAt: '2026-11-01T10:00:00Z',
        },
      ],
      fines: [],
      financialReceipts: [],
    },
    'student_1'
  );

  assert.equal(studentFin.contributionTotal, 1000);
  assert.equal(studentFin.duesTotalAssigned, 1500);
  assert.equal(studentFin.duesTotalPaid, 500);
  assert.equal(studentFin.remainingBalance, 1000);
});

test('Supabase client and lib/supabase-schema.sql match all 39 tables (31 domain incl. appointments + 8 control), 6 NOLOGIN roles, RLS on all 39 tables, 10 buckets, and append-only triggers', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {
    supabase,
    SUPABASE_PROJECT_ID,
    SUPABASE_URL,
    SUPABASE_TABLES,
    SUPABASE_REQUIRED_BUCKETS,
    SUPABASE_SERVER_INFRA_BUCKETS,
    SUPABASE_ALL_BUCKETS,
    SUPABASE_PUBLIC_BUCKETS,
    SUPABASE_PRIVATE_BUCKETS,
    testSupabaseConnection,
  } = await import('./supabase');
  const { resolveSupabaseBucket, isPrivateSupabaseBucket, validateStorageFile } = await import(
    './supabase-storage'
  );

  assert.ok(supabase);
  assert.equal(SUPABASE_PROJECT_ID, 'ehxpegiusizkbmzdtcir');
  assert.equal(SUPABASE_URL, 'https://ehxpegiusizkbmzdtcir.supabase.co');
  assert.equal(SUPABASE_TABLES.length, 31);
  assert.equal(SUPABASE_TABLES.includes('appointments'), true);
  assert.equal(SUPABASE_REQUIRED_BUCKETS.length, 8);
  assert.equal(SUPABASE_SERVER_INFRA_BUCKETS.length, 2);
  assert.equal(SUPABASE_ALL_BUCKETS.length, 10);

  assert.equal(resolveSupabaseBucket('gallery', 'public'), 'public-gallery');
  assert.equal(resolveSupabaseBucket('gallery', 'user'), 'user-gallery');
  assert.equal(resolveSupabaseBucket('avatars', 'user'), 'user-gallery');
  assert.equal(resolveSupabaseBucket('videos', 'public'), 'videos');
  assert.equal(resolveSupabaseBucket('resources', 'public'), 'study-materials');
  assert.equal(resolveSupabaseBucket('branding', 'public'), 'official-branding');
  assert.equal(resolveSupabaseBucket('homepage', 'public'), 'slideshow');
  assert.equal(resolveSupabaseBucket('receipts', 'public'), 'documents');

  for (const pub of SUPABASE_PUBLIC_BUCKETS) {
    assert.equal(isPrivateSupabaseBucket(pub), false);
  }
  for (const priv of SUPABASE_PRIVATE_BUCKETS) {
    assert.equal(isPrivateSupabaseBucket(priv), true);
  }

  // Parse and audit lib/supabase-schema.sql
  const sqlPath = path.join(process.cwd(), 'lib', 'supabase-schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  const expectedControlTables = [
    'user_credentials',
    'auth_sessions',
    'login_rate_limits',
    'portal_backups',
    'portal_restore_journal',
    'storage_files',
    'portal_state_watermark',
    'portal_server_store',
  ];
  const expectedAll39Tables = [...SUPABASE_TABLES, ...expectedControlTables];

  // 1. Verify exact 39 tables (31 domain + 8 control)
  const createdTables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)/g)].map(
    (m) => m[1]
  );
  assert.equal(createdTables.length, 39);
  assert.deepEqual(new Set(createdTables), new Set(expectedAll39Tables));

  // 2. Verify SUPER_ADMIN role in users constraint
  assert.match(sql, /'super_admin'/);
  assert.match(sql, /'SUPER_ADMIN'/);

  // 3. Verify zero NOT NULL REFERENCES ... ON DELETE SET NULL inconsistencies and zero invalid pg_catalog.coalesce
  const inconsistentFks = [...sql.matchAll(/NOT NULL\s+REFERENCES\s+[^\n;]+ON DELETE SET NULL/gi)];
  assert.equal(inconsistentFks.length, 0);
  assert.equal(sql.toLowerCase().includes('pg_catalog.coalesce'), false);

  // 4. Verify RLS enabled on all 39 tables and every table has policies
  const rlsEnabledTables = [
    ...sql.matchAll(/ALTER TABLE public\.([a-z0-9_]+) ENABLE ROW LEVEL SECURITY;/g),
  ].map((m) => m[1]);
  assert.equal(rlsEnabledTables.length, 39);
  assert.deepEqual(new Set(rlsEnabledTables), new Set(expectedAll39Tables));

  for (const tbl of expectedAll39Tables) {
    const policyRegex = new RegExp(`ON public\\.${tbl}\\s+FOR\\s+`, 'i');
    assert.match(sql, policyRegex, `Missing RLS policy for table public.${tbl}`);
  }

  // 5. Verify all 10 buckets (4 public = TRUE, 6 private/infra = FALSE) with ON CONFLICT (id) DO NOTHING
  for (const privBucket of [...SUPABASE_PRIVATE_BUCKETS, ...SUPABASE_SERVER_INFRA_BUCKETS]) {
    const bucketRegex = new RegExp(`'${privBucket}',\\s*'${privBucket}',\\s*FALSE`, 'i');
    assert.match(sql, bucketRegex, `Expected bucket ${privBucket} to be private (FALSE)`);
  }
  for (const pubBucket of SUPABASE_PUBLIC_BUCKETS) {
    const bucketRegex = new RegExp(`'${pubBucket}',\\s*'${pubBucket}',\\s*TRUE`, 'i');
    assert.match(sql, bucketRegex, `Expected bucket ${pubBucket} to be public (TRUE)`);
  }
  assert.equal(sql.includes('ON CONFLICT (id) DO UPDATE'), false);

  // 6. Verify 6 NOLOGIN roles and append-only triggers on portal_backups, portal_restore_journal, and storage.objects
  for (const roleName of [
    'alnibras_rls_reader',
    'alnibras_super_admin_guard',
    'alnibras_watermark_writer',
    'alnibras_ratelimit_writer',
    'alnibras_mutation_writer',
    'alnibras_restore_writer',
  ]) {
    assert.equal(sql.includes(roleName), true, `Missing NOLOGIN role ${roleName}`);
  }
  assert.match(sql, /CREATE TRIGGER trg_portal_backups_append_only/);
  assert.match(sql, /CREATE TRIGGER trg_portal_restore_journal_append_only/);
  assert.match(sql, /CREATE TRIGGER trg_validate_restore_journal_transition/);
  assert.match(sql, /IF OLD\.bucket_id = 'portal-backups' OR NEW\.bucket_id = 'portal-backups' THEN/);
  assert.match(sql, /GRANT SELECT, INSERT ON public\.portal_restore_journal TO alnibras_restore_writer;/);

  // 7. Verify no password_hash column in public.users and no state_snapshot / backup_meta in public.portal_settings
  assert.equal(sql.includes('password_hash'), false);
  assert.equal(sql.includes('state_snapshot JSONB'), false);
  assert.equal(sql.includes('backup_meta JSONB'), false);
  assert.match(sql, /CREATE TRIGGER trg_protect_super_admin/);

  const diag = await testSupabaseConnection();
  assert.equal(diag.configured, true);
  assert.equal(diag.projectId, 'ehxpegiusizkbmzdtcir');
  assert.equal(diag.storageBuckets.length, 8);
  assert.equal(typeof validateStorageFile, 'function');
});

test('Part 1 & Part 9: Post-reset seed state preserves ONLY SUPER ADMIN, initializes 3 slideshow slides, and enforces private student fines', async () => {
  const { getInitialPortalState } = await import('./seed-data');
  const { filterFines } = await import('./portal-logic');

  const seed = getInitialPortalState();
  assert.equal(seed.users.length, 1);
  assert.equal(seed.users[0].uid, 'admin_super');
  assert.equal(seed.users[0].username, 'alnibras@admin');
  assert.equal(seed.users[0].role, 'admin');
  assert.equal(seed.notices.length, 0);
  assert.equal(seed.announcements.length, 0);
  assert.equal(seed.events.length, 0);
  assert.equal(seed.gallery.length, 0);
  assert.equal(seed.videos.length, 0);
  assert.equal(seed.fines.length, 0);
  assert.equal((seed.slideshow || []).length, 3);

  const sampleFines = [
    {
      id: 'fine_a',
      studentUid: 'student_a',
      studentName: 'Student A',
      studentRoll: '01',
      studentDepartment: '11th Batch of DHBC',
      title: 'Library Late Return',
      description: '2 days overdue',
      category: 'Library Fine',
      amount: 100,
      issueDate: '2026-11-01',
      dueDate: '2026-11-10',
      status: 'unpaid' as const,
      createdBy: 'SUPER ADMIN',
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    },
    {
      id: 'fine_b',
      studentUid: 'student_b',
      studentName: 'Student B',
      studentRoll: '02',
      studentDepartment: '11th Batch of DHBC',
      title: 'General Discipline Fine',
      description: 'Assembly tardiness',
      category: 'Discipline Fine',
      amount: 150,
      issueDate: '2026-11-02',
      dueDate: '2026-11-12',
      status: 'unpaid' as const,
      createdBy: 'SUPER ADMIN',
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
    },
  ];

  const studentAFines = filterFines(sampleFines, { studentUid: 'student_a' });
  assert.equal(studentAFines.length, 1);
  assert.equal(studentAFines[0].id, 'fine_a');
});

test('Stage 2 Security Suite #1: Legacy 26-char pbkdf2_v1$ to direct $scrypt$v=2$ password migration, Unicode NFKC safety, and wrong-password rejection', async () => {
  const {
    LEGACY_PBKDF2_V1_BYTE_LENGTH,
    LEGACY_PBKDF2_V1_REGEX,
    isLegacyPbkdf2V1Hash,
    isScryptV2Hash,
    verifyAndMigratePassword,
  } = await import('./password-security');

  // 1. Verify exact 26-ASCII-character format ("pbkdf2_v1$" = 10 + 16 hex = 26)
  const legacyDigest = hashPasswordSync('AlNibras@2026');
  assert.equal(legacyDigest.length, 26);
  assert.equal(Buffer.byteLength(legacyDigest, 'utf8'), LEGACY_PBKDF2_V1_BYTE_LENGTH);
  assert.equal(LEGACY_PBKDF2_V1_REGEX.test(legacyDigest), true);
  assert.equal(isLegacyPbkdf2V1Hash(legacyDigest), true);

  // 2. Wrong password against legacy hash -> rejected, no upgrade
  const wrongLegacy = await verifyAndMigratePassword({
    submittedPassword: 'WrongPassword!123',
    scryptHash: null,
    legacyHash: legacyDigest,
  });
  assert.equal(wrongLegacy.verified, false);
  assert.equal(wrongLegacy.needsUpgrade, false);
  assert.equal(wrongLegacy.upgradedScryptHash, undefined);

  // 3. First login with valid legacy password -> verified & immediately upgraded to direct $scrypt$v=2$
  const firstLogin = await verifyAndMigratePassword({
    submittedPassword: 'AlNibras@2026',
    scryptHash: null,
    legacyHash: legacyDigest,
  });
  assert.equal(firstLogin.verified, true);
  assert.equal(firstLogin.scheme, 'legacy_pbkdf2_v1');
  assert.equal(firstLogin.needsUpgrade, true);
  assert.ok(firstLogin.upgradedScryptHash);
  assert.equal(isScryptV2Hash(firstLogin.upgradedScryptHash), true);
  // Original local legacyDigest string remains completely unchanged
  assert.equal(legacyDigest, hashPasswordSync('AlNibras@2026'));

  // 4. Subsequent login uses $scrypt$v=2$ exclusively and never falls back to legacyHash
  const secondLogin = await verifyAndMigratePassword({
    submittedPassword: 'AlNibras@2026',
    scryptHash: firstLogin.upgradedScryptHash,
    legacyHash: 'pbkdf2_v1$0000000000000000', // Even if legacy hash is different, scrypt_v2 is authoritative
  });
  assert.equal(secondLogin.verified, true);
  assert.equal(secondLogin.scheme, 'scrypt_v2');
  assert.equal(secondLogin.needsUpgrade, false);

  const wrongScrypt = await verifyAndMigratePassword({
    submittedPassword: 'WrongAfterUpgrade',
    scryptHash: firstLogin.upgradedScryptHash,
    legacyHash: legacyDigest,
  });
  assert.equal(wrongScrypt.verified, false);

  // 5. Unicode NFC vs NFD and non-NFKC legacy password compatibility
  const nonNfkcLegacyPassword = 'ＡｌＮｉｂｒａｓ2026'; // Fullwidth compatibility chars where raw !== raw.normalize('NFKC')
  assert.notEqual(nonNfkcLegacyPassword, nonNfkcLegacyPassword.normalize('NFKC'));
  const nonNfkcLegacyHash = hashPasswordSync(nonNfkcLegacyPassword);

  // First login with raw fullwidth form succeeds and upgrades to NFKC-normalized $scrypt$v=2$
  const unicodeFirst = await verifyAndMigratePassword({
    submittedPassword: nonNfkcLegacyPassword,
    scryptHash: null,
    legacyHash: nonNfkcLegacyHash,
  });
  assert.equal(unicodeFirst.verified, true);
  assert.equal(unicodeFirst.needsUpgrade, true);

  // Subsequent login with either raw fullwidth or NFKC normalized ASCII form succeeds!
  const unicodeSubRaw = await verifyAndMigratePassword({
    submittedPassword: nonNfkcLegacyPassword,
    scryptHash: unicodeFirst.upgradedScryptHash,
    legacyHash: nonNfkcLegacyHash,
  });
  assert.equal(unicodeSubRaw.verified, true);

  const unicodeSubNfkc = await verifyAndMigratePassword({
    submittedPassword: 'AlNibras2026',
    scryptHash: unicodeFirst.upgradedScryptHash,
    legacyHash: nonNfkcLegacyHash,
  });
  assert.equal(unicodeSubNfkc.verified, true);

  // Composed (NFC) vs Decomposed (NFD) accents
  const nfcPass = 'AlNibr\u00e9s#2026';
  const nfdPass = 'AlNibre\u0301s#2026';
  const nfcMigration = await verifyAndMigratePassword({
    submittedPassword: nfcPass,
    scryptHash: null,
    legacyHash: hashPasswordSync(nfcPass),
  });
  assert.equal(nfcMigration.verified, true);
  const nfdVerify = await verifyAndMigratePassword({
    submittedPassword: nfdPass,
    scryptHash: nfcMigration.upgradedScryptHash,
    legacyHash: null,
  });
  assert.equal(nfdVerify.verified, true);
});

test('Stage 2 Security Suite #2: Deep binary structural validator accepts valid files and blocks SVG XSS, PDF active content, OOXML macros/XXE/Zip-bombs', async () => {
  const { validateStoredFileBytes } = await import('./file-validator');

  // 1. Valid minimal 1x1 PNG (with IHDR and IEND)
  const validPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBuf = Buffer.from(validPngBase64, 'base64');
  const pngRes = validateStoredFileBytes(pngBuf, 'public-gallery');
  assert.equal(pngRes.valid, true);
  assert.equal(pngRes.detectedMimeType, 'image/png');
  assert.equal(pngRes.width, 1);
  assert.equal(pngRes.height, 1);

  // 2. Spoofed SVG/XSS masquerading as PNG -> blocked
  const svgSpoof = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="10"/></svg>',
    'utf8'
  );
  const svgRes = validateStoredFileBytes(svgSpoof, 'public-gallery');
  assert.equal(svgRes.valid, false);
  assert.equal(svgRes.reason, 'EXECUTABLE_OR_SVG_MARKUP_BLOCKED');

  // 3. Valid clean PDF vs Malicious PDF with /JavaScript and /OpenAction
  const cleanPdf = Buffer.from(
    '%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n%%EOF\n',
    'latin1'
  );
  const cleanPdfRes = validateStoredFileBytes(cleanPdf, 'study-materials');
  assert.equal(cleanPdfRes.valid, true);
  assert.equal(cleanPdfRes.detectedMimeType, 'application/pdf');

  const maliciousPdf = Buffer.from(
    '%PDF-1.7\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF\n',
    'latin1'
  );
  const malPdfRes = validateStoredFileBytes(maliciousPdf, 'study-materials');
  assert.equal(malPdfRes.valid, false);
  assert.match(malPdfRes.reason || '', /PDF_ACTIVE_CONTENT_BLOCKED/);

  // 4. Category bucket mismatch (PDF uploaded to public-gallery image bucket) -> blocked
  const bucketMismatch = validateStoredFileBytes(cleanPdf, 'public-gallery');
  assert.equal(bucketMismatch.valid, false);
  assert.match(bucketMismatch.reason || '', /CATEGORY_NOT_ALLOWED_FOR_BUCKET/);
});

test('Stage 2 Security Suite #3: Isolated API verification of 5 authorization bug fixes, 7-field peer scoping, 2 preserved WebP gallery items, and local store SHA-256 preservation', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const crypto = await import('node:crypto');
  const { NextRequest } = await import('next/server');

  const permanentStorePath = path.join(process.cwd(), 'data', 'alnibras_supabase_store.json');
  const expectedPermanentSha256 =
    'fee2e14100ca9e1815a4fb78ff688b76685a3bcf55c3f2f8501d13fc78e43abd';

  const beforeSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(permanentStorePath))
    .digest('hex');
  assert.equal(beforeSha256, expectedPermanentSha256);

  // Configure isolated temporary test store
  const tempStorePath = path.join(
    os.tmpdir(),
    `alnibras_stage2_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
  );
  process.env.ALNIBRAS_TEST_STORE_PATH = tempStorePath;

  const { loadServerStore, resetInMemoryServerStoreCache, scopeStateForActor } = await import(
    './server-db'
  );
  const { GET, POST } = await import('../app/api/portal/route');

  resetInMemoryServerStoreCache();
  const store = loadServerStore();

  // Verify the 2 existing "sonflower" inline WebP gallery items and admin_super are preserved
  assert.equal(store.state.users.length, 1);
  assert.equal(store.state.users[0].uid, 'admin_super');
  assert.equal(store.state.gallery.length, 2);
  assert.equal(store.state.gallery[0].title, 'sonflower');

  // Public GET preserves the 2 published public gallery items while hiding users
  const pubGetReq = new NextRequest('http://localhost:3000/api/portal');
  const pubGetRes = await GET(pubGetReq);
  const pubGetData = (await pubGetRes.json()) as { ok: boolean; state: typeof store.state };
  assert.equal(pubGetData.ok, true);
  assert.equal(pubGetData.state.users.length, 0);
  assert.equal(pubGetData.state.gallery.length, 2);

  // Bug #1 Fix: GOOGLE_LOGIN with raw email is rejected with 403 and NEVER logs in as admin_super
  const googleSpoofReq = new NextRequest('http://localhost:3000/api/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'GOOGLE_LOGIN',
      email: 'attacker@example.com',
    }),
  });
  const googleSpoofRes = await POST(googleSpoofReq);
  assert.equal(googleSpoofRes.status, 403);

  // Authenticate as admin_super (triggers legacy pbkdf2_v1$ -> $scrypt$v=2$ upgrade in isolated test store)
  const adminLoginReq = new NextRequest('http://localhost:3000/api/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'LOGIN',
      username: 'alnibras@admin',
      password: 'AlNibras@2026',
    }),
  });
  const adminLoginRes = await POST(adminLoginReq);
  const adminLoginData = (await adminLoginRes.json()) as {
    ok: boolean;
    passwordScheme: string;
    csrfToken: string;
  };
  assert.equal(adminLoginData.ok, true);
  assert.equal(adminLoginData.passwordScheme, 'upgraded_to_scrypt_v2');
  assert.ok(adminLoginData.csrfToken);

  // Create two test students as admin_super
  for (const [idx, username] of ['student.one', 'student.two'].entries()) {
    const createReq = new NextRequest('http://localhost:3000/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_STUDENT',
        actorUid: 'admin_super',
        fullName: `Scholar ${idx + 1}`,
        username,
        studentId: `AN-10${idx + 1}`,
        rollNumber: `0${idx + 1}`,
        contactEmail: `${username}@alnibras.edu`,
        contactPhone: `+91-900000000${idx + 1}`,
        password: 'StudentPass#2026',
      }),
    });
    const createRes = await POST(createReq);
    assert.equal(createRes.status, 200);
  }

  const studentOne = store.state.users.find((u) => u.username === 'student.one')!;
  const studentTwo = store.state.users.find((u) => u.username === 'student.two')!;
  assert.ok(studentOne);
  assert.ok(studentTwo);

  // Verify 7-field peer scoping for studentOne viewing studentTwo
  const scopedForStudentOne = scopeStateForActor(store.state, studentOne);
  const peerTwo = scopedForStudentOne.users.find((u) => u.uid === studentTwo.uid)!;
  assert.equal(peerTwo.fullName, 'Scholar 2');
  assert.equal(peerTwo.studentId, 'AN-102');
  assert.equal(peerTwo.contactEmail, '');
  assert.equal(peerTwo.contactPhone, '');
  assert.equal(peerTwo.username, '');
  assert.equal(peerTwo.address, undefined);

  // Bug #2 Fix: Student attempting REPLY_MESSAGE is rejected with 403
  const replySpoofReq = new NextRequest('http://localhost:3000/api/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'REPLY_MESSAGE',
      actorUid: studentOne.uid,
      messageId: 'msg_1',
      replyText: 'Unauthorized student reply',
    }),
  });
  const replySpoofRes = await POST(replySpoofReq);
  assert.equal(replySpoofRes.status, 403);

  // Bug #3 Fix: Student attempting ADD_CUSTOM_TYPE is rejected with 403
  const customTypeSpoofReq = new NextRequest('http://localhost:3000/api/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'ADD_CUSTOM_TYPE',
      actorUid: studentOne.uid,
      module: 'fines',
      name: 'Unauthorized Custom Type',
    }),
  });
  const customTypeSpoofRes = await POST(customTypeSpoofReq);
  assert.equal(customTypeSpoofRes.status, 403);

  // Bug #4 Fix: MARK_ALL_NOTIFICATIONS_READ only marks notifications addressed to the caller
  store.state.notifications.push({
    id: 'notif_private_two',
    recipientId: studentTwo.uid,
    title: 'Private Fine Notice',
    message: 'Only for studentTwo',
    type: 'fine',
    read: false,
    readByUids: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const markAllReq = new NextRequest('http://localhost:3000/api/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'MARK_ALL_NOTIFICATIONS_READ',
      actorUid: studentOne.uid,
    }),
  });
  await POST(markAllReq);
  const privateTwoNotif = store.state.notifications.find((n) => n.id === 'notif_private_two')!;
  assert.equal(privateTwoNotif.readByUids?.includes(studentOne.uid), false);

  // Bug #5 Fix: Student attempting SEND_CHAT_MESSAGE to another student is rejected with 403
  const peerChatSpoofReq = new NextRequest('http://localhost:3000/api/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'SEND_CHAT_MESSAGE',
      actorUid: studentOne.uid,
      recipientId: studentTwo.uid,
      text: 'Direct peer message attempt',
    }),
  });
  const peerChatSpoofRes = await POST(peerChatSpoofReq);
  assert.equal(peerChatSpoofRes.status, 403);

  // Clean up temp store and verify permanent store SHA-256 is 100% untouched
  if (fs.existsSync(tempStorePath)) {
    fs.unlinkSync(tempStorePath);
  }
  const afterSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(permanentStorePath))
    .digest('hex');
  assert.equal(afterSha256, expectedPermanentSha256);
});

test('Stage 2 Security Suite #4: Read-only backup preview, atomic concurrent restore lease locking, per-attempt staging race safety, and append-only journal integrity', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const crypto = await import('node:crypto');
  const { NextRequest } = await import('next/server');

  const permanentStorePath = path.join(process.cwd(), 'data', 'alnibras_supabase_store.json');
  const expectedPermanentSha256 =
    'fee2e14100ca9e1815a4fb78ff688b76685a3bcf55c3f2f8501d13fc78e43abd';

  const tempStorePath = path.join(
    os.tmpdir(),
    `alnibras_restore_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
  );
  process.env.ALNIBRAS_TEST_STORE_PATH = tempStorePath;

  const {
    acquireRestoreLock,
    appendRestoreJournalEvent,
    deletePortalBackupRecord,
    deleteRestoreJournalEvent,
    getSimulatedStorageMap,
    heartbeatRestoreLock,
    loadServerStore,
    releaseRestoreLock,
    resetInMemoryServerStoreCache,
    updatePortalBackupRecord,
    updateRestoreJournalEvent,
  } = await import('./server-db');
  const { POST: backupPost } = await import('../app/api/portal/backup/route');

  resetInMemoryServerStoreCache();
  const store = loadServerStore();
  const simStorage = getSimulatedStorageMap();

  // Seed an approved file in store + simulated storage
  const fileBytes = Buffer.from('verified-certificate-binary-content', 'utf8');
  const fileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
  store.storageFiles = {
    sf_cert_1: {
      id: 'sf_cert_1',
      bucketId: 'certificates',
      objectPath: 'certificates/admin_super/cert_1.pdf',
      ownerUid: 'admin_super',
      originalName: 'cert_1.pdf',
      mimeType: 'application/pdf',
      byteSize: fileBytes.byteLength,
      sha256: fileSha256,
      status: 'approved',
      createdAt: '2026-11-10T10:00:00.000Z',
      verifiedAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    },
  };
  simStorage['certificates::certificates/admin_super/cert_1.pdf'] = {
    bytes: fileBytes,
    sha256: fileSha256,
    objectId: 'obj_initial_cert_1',
  };

  // 1. Create encrypted + HMAC-signed backup
  const createReq = new NextRequest('http://localhost:3000/api/portal/backup?mode=create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-uid': 'admin_super' },
    body: JSON.stringify({ actorUid: 'admin_super', mode: 'create' }),
  });
  const createRes = await backupPost(createReq);
  const createData = (await createRes.json()) as {
    ok: boolean;
    backup: { id: string };
    includedTablesCount: number;
  };
  assert.equal(createData.ok, true);
  assert.equal(createData.includedTablesCount, 32);
  const backupId = createData.backup.id;

  // Verify append-only immutability on portalBackups and restoreJournal
  assert.throws(() => updatePortalBackupRecord(), /IMMUTABLE_TABLE_VIOLATION/);
  assert.throws(() => deletePortalBackupRecord(), /IMMUTABLE_TABLE_VIOLATION/);
  assert.throws(() => updateRestoreJournalEvent(), /IMMUTABLE_TABLE_VIOLATION/);
  assert.throws(() => deleteRestoreJournalEvent(), /IMMUTABLE_TABLE_VIOLATION/);

  // 2. Simulate an abandoned restore attempt (crash after staging) by removing the live object and calling commit with simulateCrashAfterStage=true
  delete simStorage['certificates::certificates/admin_super/cert_1.pdf'];
  delete store.storageFiles.sf_cert_1;

  const crashReq = new NextRequest('http://localhost:3000/api/portal/backup?mode=commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-uid': 'admin_super' },
    body: JSON.stringify({
      actorUid: 'admin_super',
      backupId,
      restoreAttemptId: 'rst_crashed_attempt_1',
      simulateCrashAfterStage: true,
    }),
  });
  const crashRes = await backupPost(crashReq);
  assert.equal(crashRes.status, 500);

  // Expire the crashed attempt's lease so it becomes an abandoned attempt
  if (store.restoreLock) {
    store.restoreLock.activeRestoreLeaseExpiresAt = new Date(Date.now() - 5000).toISOString();
  }

  // 3. Verify mode=preview is STRICTLY READ-ONLY: zero journal events added, zero storage objects deleted, and reports abandonedAttempts
  const journalLenBeforePreview = store.restoreJournal?.length || 0;
  const mutationVerBeforePreview = store.mutationVersion;
  const simStorageKeysBeforePreview = Object.keys(simStorage).sort();

  const previewReq = new NextRequest('http://localhost:3000/api/portal/backup?mode=preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-uid': 'admin_super' },
    body: JSON.stringify({ actorUid: 'admin_super', backupId }),
  });
  const previewRes = await backupPost(previewReq);
  const previewData = (await previewRes.json()) as {
    ok: boolean;
    readOnlyGuaranteed: boolean;
    restoreLockStatus: {
      activeAttempt: unknown;
      abandonedAttempts: Array<{ restoreAttemptId: string; pendingCleanupObjectCount: number }>;
    };
  };
  assert.equal(previewData.ok, true);
  assert.equal(previewData.readOnlyGuaranteed, true);
  assert.equal(previewData.restoreLockStatus.abandonedAttempts.length, 1);
  assert.equal(
    previewData.restoreLockStatus.abandonedAttempts[0].restoreAttemptId,
    'rst_crashed_attempt_1'
  );
  // Confirm zero database or storage mutations occurred during preview!
  assert.equal(store.restoreJournal?.length || 0, journalLenBeforePreview);
  assert.equal(store.mutationVersion, mutationVerBeforePreview);
  assert.deepEqual(Object.keys(simStorage).sort(), simStorageKeysBeforePreview);

  // 4. Verify Atomic Concurrent Restore Lock & Renewable Lease Heartbeat
  const lock1 = acquireRestoreLock(store, {
    attemptId: 'rst_active_holder',
    backupId,
    ownerUid: 'admin_super',
    leaseSeconds: 60,
  });
  assert.equal(lock1.acquired, true);

  // A concurrent restore attempt while rst_active_holder holds the lease must be rejected with 409 RESTORE_LOCK_HELD
  const concurrentReq = new NextRequest('http://localhost:3000/api/portal/backup?mode=commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-uid': 'admin_super' },
    body: JSON.stringify({
      actorUid: 'admin_super',
      backupId,
      restoreAttemptId: 'rst_concurrent_contender',
    }),
  });
  const concurrentRes = await backupPost(concurrentReq);
  assert.equal(concurrentRes.status, 409);
  const concurrentData = (await concurrentRes.json()) as { code?: string };
  assert.equal(concurrentData.code, 'RESTORE_LOCK_HELD');

  // Verify heartbeat renews lease for the active owner and rejects wrong attemptId
  const badHb = heartbeatRestoreLock(store, { attemptId: 'wrong_attempt', leaseSeconds: 60 });
  assert.equal(badHb.renewed, false);
  const goodHb = heartbeatRestoreLock(store, { attemptId: 'rst_active_holder', leaseSeconds: 90 });
  assert.equal(goodHb.renewed, true);

  releaseRestoreLock(store, 'rst_active_holder');

  // 5. Execute full restore commit (which sweeps rst_crashed_attempt_1, stages under __restore_staging__, promotes to finalPath, and commits)
  const commitReq = new NextRequest('http://localhost:3000/api/portal/backup?mode=commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-uid': 'admin_super' },
    body: JSON.stringify({
      actorUid: 'admin_super',
      backupId,
      restoreAttemptId: 'rst_clean_commit_2',
    }),
  });
  const commitRes = await backupPost(commitReq);
  const commitData = (await commitRes.json()) as { ok: boolean; restoredObjectsCount: number };
  assert.equal(commitData.ok, true);
  assert.equal(commitData.restoredObjectsCount, 1);
  assert.ok(simStorage['certificates::certificates/admin_super/cert_1.pdf']);

  // Verify illegal state transition after 'committed' is blocked by appendRestoreJournalEvent
  assert.throws(
    () =>
      appendRestoreJournalEvent(store, {
        restoreAttemptId: 'rst_clean_commit_2',
        backupId,
        actorUid: 'admin_super',
        bucketId: 'certificates',
        stagePath: null,
        finalPath: 'certificates/admin_super/cert_1.pdf',
        expectedSha256: fileSha256,
        byteSize: fileBytes.byteLength,
        preExisted: false,
        stageOwned: false,
        finalPathOwned: true,
        eventType: 'cleanup_required',
      }),
    /RESTORE_JOURNAL_TERMINAL_VIOLATION/
  );

  // 6. Verify Race-Condition Protection: If an object is absent at pre-check, staged by Attempt A,
  // and another process creates finalPath with different bytes before promotion/cleanup,
  // cleanup NEVER deletes the other process's live object!
  const concurrentOtherBytes = Buffer.from('concurrent-live-upload-by-another-process', 'utf8');
  const concurrentOtherSha256 = crypto
    .createHash('sha256')
    .update(concurrentOtherBytes)
    .digest('hex');

  appendRestoreJournalEvent(store, {
    restoreAttemptId: 'rst_race_attempt_3',
    backupId,
    actorUid: 'admin_super',
    bucketId: 'documents',
    stagePath: '__restore_staging__/rst_race_attempt_3/staged_doc.pdf',
    finalPath: 'documents/admin_super/concurrent_race_doc.pdf',
    expectedSha256: fileSha256,
    byteSize: fileBytes.byteLength,
    preExisted: false,
    stageOwned: true,
    finalPathOwned: false, // Attempt 3 only staged; it did NOT create finalPath!
    createdStorageObjectId: null,
    eventType: 'planned_staging',
  });
  simStorage['documents::__restore_staging__/rst_race_attempt_3/staged_doc.pdf'] = {
    bytes: fileBytes,
    sha256: fileSha256,
    objectId: 'obj_staged_3',
  };
  // Concurrent Process B creates finalPath while Attempt 3 crashes before promotion
  simStorage['documents::documents/admin_super/concurrent_race_doc.pdf'] = {
    bytes: concurrentOtherBytes,
    sha256: concurrentOtherSha256,
    objectId: 'obj_concurrent_process_b',
  };

  const sweepRaceReq = new NextRequest('http://localhost:3000/api/portal/backup?mode=sweep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-actor-uid': 'admin_super' },
    body: JSON.stringify({ actorUid: 'admin_super', mode: 'sweep' }),
  });
  const sweepRaceRes = await backupPost(sweepRaceReq);
  const sweepRaceData = (await sweepRaceRes.json()) as {
    ok: boolean;
    sweptAttempts: string[];
  };
  assert.equal(sweepRaceData.ok, true);
  assert.equal(sweepRaceData.sweptAttempts.includes('rst_race_attempt_3'), true);
  // Staged file owned by rst_race_attempt_3 was cleaned up:
  assert.equal(
    simStorage['documents::__restore_staging__/rst_race_attempt_3/staged_doc.pdf'],
    undefined
  );
  // Concurrent Process B's file at finalPath was NOT deleted!
  assert.ok(simStorage['documents::documents/admin_super/concurrent_race_doc.pdf']);
  assert.equal(
    simStorage['documents::documents/admin_super/concurrent_race_doc.pdf'].objectId,
    'obj_concurrent_process_b'
  );

  if (fs.existsSync(tempStorePath)) {
    fs.unlinkSync(tempStorePath);
  }
  const finalSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(permanentStorePath))
    .digest('hex');
  assert.equal(finalSha256, expectedPermanentSha256);
});

test('Supabase Integration & Schema Suite: Confirms Firebase removal, validates project credentials, PGRST205 detection, and UI error formatting', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {
    SUPABASE_PROJECT_ID,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    isSupabaseConfigured,
    isMissingSupabaseSchemaError,
    formatSupabaseUiError,
  } = await import('./supabase');

  // Ensure legacy Firebase artifacts have been cleanly removed
  const removedFirebasePaths = [
    'firebase-applet-config.json',
    'firebase-blueprint.json',
    'firestore.rules',
    'storage.rules',
    'lib/firebase.ts',
    'lib/firebase-db.ts',
    'lib/firebase-storage.ts',
    'lib/firebase-sync.ts',
  ];
  for (const relPath of removedFirebasePaths) {
    assert.equal(
      fs.existsSync(path.join(process.cwd(), relPath)),
      false,
      `Legacy Firebase file still exists: ${relPath}`
    );
  }

  // Verify exact user-supplied Supabase credentials
  assert.equal(isSupabaseConfigured(), true);
  assert.equal(SUPABASE_PROJECT_ID, 'ehxpegiusizkbmzdtcir');
  assert.equal(SUPABASE_URL, 'https://ehxpegiusizkbmzdtcir.supabase.co');
  assert.equal(SUPABASE_ANON_KEY.startsWith('sb_publishable_Fkq9LJe_'), true);

  // Verify PGRST205 / 42P01 missing-table error detection and friendly UI formatting
  assert.equal(
    isMissingSupabaseSchemaError({
      code: 'PGRST205',
      message: "Could not find the table 'public.appointments' in the schema cache",
    }),
    true
  );
  assert.equal(isMissingSupabaseSchemaError({ code: '42P01', message: 'relation "public.appointments" does not exist' }), true);
  assert.equal(isMissingSupabaseSchemaError({ code: '23505', message: 'duplicate key value' }), false);

  const missingMsg = formatSupabaseUiError({
    code: 'PGRST205',
    message: "Could not find the table 'public.appointments' in the schema cache",
  });
  assert.match(missingMsg, /ehxpegiusizkbmzdtcir/);
  assert.match(missingMsg, /lib\/supabase-schema\.sql/);

  const rlsMsg = formatSupabaseUiError(new Error('new row violates row-level security policy for table "appointments"'));
  assert.match(rlsMsg, /Row Level Security/i);
});

test('Theme Utility Suite: Parses stored localStorage theme preference, resolves system preference, and toggles cleanly between dark and light', async () => {
  const {
    THEME_STORAGE_KEY,
    getNextDarkLightTheme,
    parseStoredThemeMode,
    resolveThemeMode,
  } = await import('./theme-utils');

  assert.equal(THEME_STORAGE_KEY, 'theme');
  assert.equal(parseStoredThemeMode('dark'), 'dark');
  assert.equal(parseStoredThemeMode('light'), 'light');
  assert.equal(parseStoredThemeMode('system'), 'system');
  assert.equal(parseStoredThemeMode('invalid-value'), 'light');
  assert.equal(parseStoredThemeMode(null), 'light');

  assert.equal(resolveThemeMode('system', true), 'dark');
  assert.equal(resolveThemeMode('system', false), 'light');
  assert.equal(resolveThemeMode('dark', false), 'dark');
  assert.equal(resolveThemeMode('light', true), 'light');

  assert.equal(getNextDarkLightTheme('light'), 'dark');
  assert.equal(getNextDarkLightTheme('dark'), 'light');
});

test('Global Search Utility Suite: Searches published announcements, notices, and events by keyword, supports category filtering, and excludes drafts', async () => {
  const { searchGlobalPortalContent } = await import('./portal-search');
  const { getInitialPortalState } = await import('./seed-data');

  const seed = getInitialPortalState();
  const sampleNotices = [
    ...seed.notices,
    {
      id: 'not-search-pub',
      title: 'Annual General Assembly Circular',
      content: 'All batch members are invited to the Annual General Assembly at DHBC Main Auditorium.',
      referenceCode: 'CIR-AN/2026/901',
      category: 'General Circular',
      effectiveDate: '2026-09-15',
      status: 'published' as const,
      showOnHomepage: true,
      authorId: 'admin_super',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    },
    {
      id: 'not-search-draft',
      title: 'Internal Draft Audit Circular',
      content: 'Secret draft notice that must never appear in public global search results.',
      referenceCode: 'CIR-DRAFT/001',
      category: 'Internal',
      effectiveDate: '2026-09-20',
      status: 'draft' as const,
      showOnHomepage: false,
      authorId: 'admin_super',
      createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-02T10:00:00.000Z',
    },
  ];

  const sampleAnnouncements = [
    ...seed.announcements,
    {
      id: 'ann-search-pub',
      title: 'Assembly Volunteer Registration Open',
      content: 'Sign up for the Annual General Assembly hospitality and stage team.',
      category: 'Volunteers',
      priority: 'high' as const,
      status: 'published' as const,
      authorId: 'admin_super',
      createdAt: '2026-09-03T10:00:00.000Z',
      updatedAt: '2026-09-03T10:00:00.000Z',
    },
    {
      id: 'ann-search-draft',
      title: 'Secret Draft Assembly Announcement',
      content: 'Unpublished announcement draft.',
      category: 'Drafts',
      priority: 'normal' as const,
      status: 'draft' as const,
      authorId: 'admin_super',
      createdAt: '2026-09-03T11:00:00.000Z',
      updatedAt: '2026-09-03T11:00:00.000Z',
    },
  ];

  const sampleEvents = [
    ...seed.events,
    {
      id: 'evt-search-pub',
      title: 'Inter-Class Debate & Assembly Gala',
      description: 'Formal parliamentary debate session following the Annual General Assembly.',
      eventDate: '2026-09-18',
      eventTime: '14:30',
      venue: 'DHBC Main Auditorium',
      category: 'Literary & Debate',
      status: 'published' as const,
      authorId: 'admin_super',
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z',
    },
    {
      id: 'evt-search-draft',
      title: 'Secret Draft Assembly Rehearsal',
      description: 'Draft event item.',
      eventDate: '2026-09-19',
      eventTime: '16:00',
      venue: 'Room 101',
      category: 'Draft',
      status: 'draft' as const,
      authorId: 'admin_super',
      createdAt: '2026-09-04T12:00:00.000Z',
      updatedAt: '2026-09-04T12:00:00.000Z',
    },
  ];

  const allMatches = searchGlobalPortalContent({
    query: 'Assembly',
    filter: 'all',
    announcements: sampleAnnouncements,
    notices: sampleNotices,
    events: sampleEvents,
  });

  assert.ok(allMatches.some((item) => item.id === 'not-search-pub' && item.kind === 'notice'));
  assert.ok(allMatches.some((item) => item.id === 'ann-search-pub' && item.kind === 'announcement'));
  assert.ok(allMatches.some((item) => item.id === 'evt-search-pub' && item.kind === 'event'));

  // Strictly excludes drafts even on direct keyword match
  const draftMatches = searchGlobalPortalContent({
    query: 'Secret Draft',
    filter: 'all',
    announcements: sampleAnnouncements,
    notices: sampleNotices,
    events: sampleEvents,
  });
  assert.equal(draftMatches.length, 0);

  // Filter tabs narrow results accurately by kind
  const onlyNotices = searchGlobalPortalContent({
    query: 'Assembly',
    filter: 'notice',
    announcements: sampleAnnouncements,
    notices: sampleNotices,
    events: sampleEvents,
  });
  assert.ok(onlyNotices.length >= 1);
  assert.ok(onlyNotices.every((item) => item.kind === 'notice'));

  const onlyEvents = searchGlobalPortalContent({
    query: 'Assembly',
    filter: 'event',
    announcements: sampleAnnouncements,
    notices: sampleNotices,
    events: sampleEvents,
  });
  assert.ok(onlyEvents.length >= 1);
  assert.ok(onlyEvents.every((item) => item.kind === 'event'));

  const onlyAnnouncements = searchGlobalPortalContent({
    query: 'Assembly',
    filter: 'announcement',
    announcements: sampleAnnouncements,
    notices: sampleNotices,
    events: sampleEvents,
  });
  assert.ok(onlyAnnouncements.length >= 1);
  assert.ok(onlyAnnouncements.every((item) => item.kind === 'announcement'));
});

test('Supabase Sync Planner & Appointment Booking Mutation Engine: Handles CREATE_STUDENT, SAVE_NOTICE, BOOK_APPOINTMENT, UPDATE_APPOINTMENT_STATUS RBAC, DELETE_APPOINTMENT, and PUBLIC_BOOK_APPOINTMENT API scoping', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { NextRequest } = await import('next/server');
  const { applyPortalMutation } = await import('./portal-mutations');
  const { computeCollectionSyncPlan } = await import('./supabase-db');
  const { getInitialPortalState } = await import('./seed-data');
  const { POST: portalPost, GET: portalGet } = await import('../app/api/portal/route');

  const baseState = getInitialPortalState();
  const adminActor = baseState.users.find((u) => u.role === 'admin')!;
  assert.ok(adminActor, 'Expected seeded SUPER ADMIN user');

  // 1. Admin creates a student
  const createStudentRes = applyPortalMutation(
    baseState,
    {
      action: 'CREATE_STUDENT',
      fullName: 'Tariqul Islam',
      username: 'tariqul2026',
      studentId: 'ANB-2026-099',
      rollNumber: '99',
      contactEmail: 'TARIQUL@EXAMPLE.COM',
      contactPhone: '+91 9876543210',
      password: 'StudentPass@2026',
    },
    adminActor
  );
  assert.equal(createStudentRes.ok, true);
  assert.ok(createStudentRes.state);
  assert.ok(createStudentRes.createdUser);
  const createdStudent = createStudentRes.createdUser!;
  assert.equal(createdStudent.contactEmail, 'tariqul@example.com');

  const planAfterStudent = computeCollectionSyncPlan(baseState, createStudentRes.state!);
  assert.ok(planAfterStudent.upserts.some((u) => u.table === 'users' && u.rowId === createdStudent.uid && u.isNew));
  assert.ok(planAfterStudent.upserts.some((u) => u.table === 'activity_logs'));
  assert.equal(planAfterStudent.updateSettingsSingleton, false);

  // 2. Admin publishes a notice -> notice + notification + activity_log
  const saveNoticeRes = applyPortalMutation(
    createStudentRes.state!,
    {
      action: 'SAVE_NOTICE',
      title: 'Semester Exam Circular',
      content: 'All 11th Batch students must collect hall tickets from the union office.',
      referenceCode: 'CIR-AN/2026/777',
      status: 'published',
    },
    adminActor
  );
  assert.equal(saveNoticeRes.ok, true);
  const planAfterNotice = computeCollectionSyncPlan(createStudentRes.state!, saveNoticeRes.state!);
  assert.ok(planAfterNotice.upserts.some((u) => u.table === 'notices' && u.isNew));
  assert.ok(planAfterNotice.upserts.some((u) => u.table === 'notifications' && u.isNew));
  assert.ok(planAfterNotice.upserts.some((u) => u.table === 'activity_logs'));

  // 3. Appointment Booking Mutation + Supabase snake_case mapping
  const bookApptRes = applyPortalMutation(
    saveNoticeRes.state!,
    {
      action: 'BOOK_APPOINTMENT',
      fullName: 'Tariqul Islam',
      email: 'TARIQUL@EXAMPLE.COM',
      phone: '+91 9876543210',
      department: 'Academic Counselling',
      preferredDate: '2026-12-01',
      preferredTime: '11:00 AM',
      purpose: 'Scholarship documentation review',
      notes: 'Bringing printed transcripts.',
    },
    createdStudent
  );
  assert.equal(bookApptRes.ok, true);
  const bookedAppt = bookApptRes.state!.appointments![0];
  assert.ok(bookedAppt);
  assert.equal(bookedAppt.status, 'pending');
  assert.equal(bookedAppt.studentUid, createdStudent.uid);

  const planAfterAppt = computeCollectionSyncPlan(saveNoticeRes.state!, bookApptRes.state!);
  const apptUpsert = planAfterAppt.upserts.find((u) => u.table === 'appointments' && u.rowId === bookedAppt.id);
  assert.ok(apptUpsert, 'Expected Supabase sync plan to emit appointments upsert');
  assert.equal(apptUpsert!.data.full_name, 'Tariqul Islam');
  assert.equal(apptUpsert!.data.email, 'tariqul@example.com');
  assert.equal(apptUpsert!.data.preferred_date, '2026-12-01');
  assert.equal(apptUpsert!.data.preferred_time, '11:00 AM');
  assert.equal(apptUpsert!.data.purpose, 'Scholarship documentation review');
  assert.equal(apptUpsert!.data.status, 'pending');

  // 4. Student cannot approve/update appointment status (403); admin succeeds; admin can delete
  const studentForbiddenUpdate = applyPortalMutation(
    bookApptRes.state!,
    {
      action: 'UPDATE_APPOINTMENT_STATUS',
      appointmentId: bookedAppt.id,
      status: 'confirmed',
    },
    createdStudent
  );
  assert.equal(studentForbiddenUpdate.ok, false);
  assert.equal(studentForbiddenUpdate.statusCode, 403);

  const adminConfirm = applyPortalMutation(
    bookApptRes.state!,
    {
      action: 'UPDATE_APPOINTMENT_STATUS',
      appointmentId: bookedAppt.id,
      status: 'confirmed',
      adminNotes: 'Confirmed at Secretariat Desk 2.',
    },
    adminActor
  );
  assert.equal(adminConfirm.ok, true);
  assert.equal(adminConfirm.state!.appointments![0].status, 'confirmed');

  const adminDelete = applyPortalMutation(
    adminConfirm.state!,
    {
      action: 'DELETE_APPOINTMENT',
      appointmentId: bookedAppt.id,
    },
    adminActor
  );
  assert.equal(adminDelete.ok, true);
  assert.equal(adminDelete.state!.appointments!.length, 0);

  // 5. Append-only collections never emit deletes even if trimmed in a snapshot
  const trimmedLogsState = {
    ...bookApptRes.state!,
    activityLogs: [],
  };
  const planWithEmptyLogs = computeCollectionSyncPlan(bookApptRes.state!, trimmedLogsState);
  assert.equal(
    planWithEmptyLogs.deletes.some((d) => d.table === 'activity_logs'),
    false
  );

  // 6. Isolated API route test for PUBLIC_BOOK_APPOINTMENT + privacy scoping on unauthenticated GET
  const prevTestStore = process.env.ALNIBRAS_TEST_STORE_PATH;
  const tempStorePath = path.join(os.tmpdir(), `alnibras_appt_test_${Date.now()}.json`);
  process.env.ALNIBRAS_TEST_STORE_PATH = tempStorePath;
  try {
    const reqBook = new NextRequest('http://localhost:3000/api/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'PUBLIC_BOOK_APPOINTMENT',
        fullName: 'Salman Farisi',
        email: 'salman.visitor@example.com',
        phone: '+91 9895001122',
        department: 'Union Secretariat',
        preferredDate: '2026-12-05',
        preferredTime: '10:30 AM',
        purpose: 'Guest Lecture Coordination',
      }),
    });
    const bookApiRes = await portalPost(reqBook);
    assert.equal(bookApiRes.status, 200);
    const bookJson = (await bookApiRes.json()) as {
      ok: boolean;
      appointment?: { id: string; fullName: string; status: string };
      state?: { appointments?: unknown[] };
    };
    assert.equal(bookJson.ok, true);
    assert.equal(bookJson.appointment?.fullName, 'Salman Farisi');
    assert.equal(bookJson.appointment?.status, 'pending');
    // Public response scopes out private appointment PII
    assert.deepEqual(bookJson.state?.appointments, []);

    const getRes = await portalGet(new NextRequest('http://localhost:3000/api/portal'));
    assert.equal(getRes.status, 200);
    const getJson = (await getRes.json()) as { state?: { appointments?: unknown[] } };
    assert.deepEqual(getJson.state?.appointments, []);
  } finally {
    if (fs.existsSync(tempStorePath)) {
      fs.unlinkSync(tempStorePath);
    }
    if (prevTestStore === undefined) {
      delete process.env.ALNIBRAS_TEST_STORE_PATH;
    } else {
      process.env.ALNIBRAS_TEST_STORE_PATH = prevTestStore;
    }
  }
});

test('Portal Top-Bar Search Suite: Finds announcements, notices, and users by name or department with strict student PII protection', async () => {
  const { searchPortalTopBar } = await import('./portal-search');
  const { getInitialPortalState } = await import('./seed-data');

  const seed = getInitialPortalState();
  const sampleUsers = [
    ...seed.users,
    {
      uid: 'stu_arabic_1',
      fullName: 'Amina Siddiqua',
      username: 'amina2026',
      studentId: 'ANB-2026-101',
      rollNumber: '101',
      role: 'student' as const,
      status: 'active' as const,
      department: 'Department of Arabic Literature',
      classInfo: '11th Batch of DHBC',
      avatarUrl: '/images/avatar_student_1.jpg',
    },
    {
      uid: 'stu_inactive_2',
      fullName: 'Inactive Scholar',
      username: 'inactive2026',
      studentId: 'ANB-2026-102',
      rollNumber: '102',
      role: 'student' as const,
      status: 'inactive' as const,
      department: 'Department of Arabic Literature',
      classInfo: '11th Batch of DHBC',
    },
  ];

  const sampleNotices = [
    {
      id: 'not_arab_1',
      title: 'Arabic Debate Registration Circular',
      content: 'Open to all scholars in Arabic Literature.',
      referenceCode: 'CIR-AR-01',
      effectiveDate: '2026-11-15',
      status: 'published' as const,
      authorId: 'admin_super',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'not_draft_1',
      title: 'Arabic Draft Confidential Circular',
      content: 'Draft only.',
      referenceCode: 'CIR-DR-99',
      effectiveDate: '2026-11-20',
      status: 'draft' as const,
      authorId: 'admin_super',
      createdAt: '2026-11-10T11:00:00.000Z',
      updatedAt: '2026-11-10T11:00:00.000Z',
    },
  ];

  // Student searching by department finds published notices & active peers, never drafts, inactive users, or studentId PII
  const studentDeptResults = searchPortalTopBar({
    query: 'Arabic',
    viewerRole: 'student',
    announcements: seed.announcements,
    notices: sampleNotices,
    users: sampleUsers,
    committeeMembers: seed.committeeMembers,
  });

  const foundUserAsStudent = studentDeptResults.find((r) => r.kind === 'user' && r.id === 'stu_arabic_1');
  assert.ok(foundUserAsStudent, 'Expected student search by department to match Amina Siddiqua');
  assert.equal(foundUserAsStudent!.studentId, undefined, 'Student view must never expose peer studentId');
  assert.equal(studentDeptResults.some((r) => r.id === 'stu_inactive_2'), false);
  assert.equal(studentDeptResults.some((r) => r.id === 'not_draft_1'), false);
  assert.ok(studentDeptResults.some((r) => r.kind === 'notice' && r.id === 'not_arab_1'));

  // Admin search finds drafts and includes administrative studentId metadata
  const adminResults = searchPortalTopBar({
    query: 'Arabic',
    viewerRole: 'admin',
    announcements: seed.announcements,
    notices: sampleNotices,
    users: sampleUsers,
    committeeMembers: seed.committeeMembers,
  });
  const foundUserAsAdmin = adminResults.find((r) => r.kind === 'user' && r.id === 'stu_arabic_1');
  assert.equal(foundUserAsAdmin?.studentId, 'ANB-2026-101');
  assert.ok(adminResults.some((r) => r.id === 'not_draft_1'));
});

test('Supabase Storage & XSS Validation Suite: Verifies bucket routing, SVG/HTML XSS blocking, size limits, and safe storage paths', async () => {
  const { validateStorageFile, buildSupabaseStoragePath, resolveSupabaseBucket } = await import(
    './supabase-storage'
  );

  assert.equal(resolveSupabaseBucket('avatars', 'user'), 'user-gallery');
  assert.equal(resolveSupabaseBucket('gallery', 'public'), 'public-gallery');
  assert.equal(resolveSupabaseBucket('resources', 'public'), 'study-materials');

  // Validate SVG & HTML XSS block
  const svgFile = new File(['<svg onload="alert(1)"></svg>'], 'evil.svg', {
    type: 'image/svg+xml',
  });
  assert.equal(validateStorageFile(svgFile).valid, false);

  const htmlFile = new File(['<script>alert(1)</script>'], 'payload.html', {
    type: 'text/html',
  });
  assert.equal(validateStorageFile(htmlFile).valid, false);

  // Validate clean PNG avatar & path scoping
  const validPng = new File([new Uint8Array([137, 80, 78, 71])], 'profile.png', {
    type: 'image/png',
  });
  assert.equal(validateStorageFile(validPng).valid, true);

  const scopedPath = buildSupabaseStoragePath({
    folder: 'avatars',
    fileName: '../my photo?.png',
    ownerUid: 'user_abc',
  });
  assert.match(scopedPath, /^avatars\/user_abc\/\d+_[a-z0-9]+_/);
});

test('Supabase Admin RBAC Guard & Profile Resolution Suite: Blocks unverified admin impersonation, resolves active students, and rejects forged GOOGLE_LOGIN tokens', async () => {
  const { NextRequest } = await import('next/server');
  const { resolveMatchedPortalUser, isSupabaseAdminUser } = await import('./supabase-db');
  const { SUPER_ADMIN_EMAIL } = await import('./supabase');
  const { getInitialPortalState } = await import('./seed-data');
  const { applyPortalMutation } = await import('./portal-mutations');
  const { POST: portalPost } = await import('../app/api/portal/route');

  const seed = getInitialPortalState();

  // 1. Unverified email matching SUPER_ADMIN_EMAIL must NEVER resolve as admin when isAdmin is false
  const unverifiedSupaUser = {
    id: 'unverified_uid_123',
    email: SUPER_ADMIN_EMAIL,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as Parameters<typeof resolveMatchedPortalUser>[0];

  assert.equal(await isSupabaseAdminUser(unverifiedSupaUser), false);
  const blockedUnverified = await resolveMatchedPortalUser(unverifiedSupaUser, seed.users, false);
  assert.equal(blockedUnverified, null);

  // 2. Verified Admin resolves cleanly to admin_super
  const verifiedAdminUser = {
    ...unverifiedSupaUser,
    email_confirmed_at: new Date().toISOString(),
  } as Parameters<typeof resolveMatchedPortalUser>[0];

  assert.equal(await isSupabaseAdminUser(verifiedAdminUser), true);
  const verifiedAdmin = await resolveMatchedPortalUser(verifiedAdminUser, seed.users, true);
  assert.equal(verifiedAdmin?.uid, 'admin_super');
  assert.equal(verifiedAdmin?.role, 'admin');

  // 3. Student account resolves properly when active and isAdmin is false
  const resCreate = applyPortalMutation(
    seed,
    {
      action: 'CREATE_STUDENT',
      fullName: 'Zayd Scholar',
      username: 'zayd.scholar',
      studentId: 'ANB-2026-205',
      rollNumber: '205',
      contactEmail: 'zayd.scholar@alnibras-union.edu',
      contactPhone: '+91 9876500111',
      password: 'Password@123',
    },
    seed.users[0]
  );
  assert.equal(resCreate.ok, true);
  const resolvedStudent = await resolveMatchedPortalUser(
    {
      id: 'supa_student_uid',
      email: 'zayd.scholar@alnibras-union.edu',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as Parameters<typeof resolveMatchedPortalUser>[0],
    resCreate.state!.users,
    false
  );
  assert.equal(resolvedStudent?.role, 'student');
  assert.equal(resolvedStudent?.username, 'zayd.scholar');

  // 4. Forged GOOGLE_LOGIN without a valid Supabase JWT is rejected with 403
  const forgedRes = await portalPost(
    new NextRequest('http://localhost:3000/api/portal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'GOOGLE_LOGIN',
        email: SUPER_ADMIN_EMAIL,
        accessToken: 'not-a-valid-jwt',
      }),
    })
  );
  assert.equal(forgedRes.status, 403);
});

test('Supabase Snake-Case Row Serializers: Maps all domain tables to exact PostgreSQL column names', async () => {
  const { toSnakeCaseRow } = await import('./supabase-db');

  const notifRow = toSnakeCaseRow('notifications', {
    id: 'notif_99',
    recipientId: 'ALL_STUDENTS',
    title: 'Term Circular',
    message: 'Check examination room allotments.',
    type: 'notice',
    read: false,
    readByUids: ['student_1'],
    relatedId: 'not_12',
    createdAt: '2026-11-10T10:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
  });
  assert.equal(notifRow.recipient_id, 'ALL_STUDENTS');
  assert.equal(notifRow.notif_type, 'notice');
  assert.deepEqual(notifRow.read_by_uids, ['student_1']);
  assert.equal(notifRow.related_id, 'not_12');
  assert.equal('recipientId' in notifRow, false);

  const actRow = toSnakeCaseRow('activity_logs', {
    id: 'log_99',
    actorId: 'admin_super',
    actorName: 'SUPER ADMIN',
    actionType: 'NOTICE_PUBLISHED',
    details: 'Published exam circular',
    targetId: 'not_12',
    createdAt: '2026-11-10T10:00:00Z',
  });
  assert.equal(actRow.actor_id, 'admin_super');
  assert.equal(actRow.actor_name, 'SUPER ADMIN');
  assert.equal(actRow.action_type, 'NOTICE_PUBLISHED');
  assert.equal(actRow.target_id, 'not_12');
  assert.equal('actionType' in actRow, false);

  const incRow = toSnakeCaseRow('income_records', {
    id: 'inc_99',
    title: 'Patron Endowment',
    category: 'Donation',
    amount: 25000,
    date: '2026-11-12',
    receivedFrom: 'Alumni Chapter',
    paymentMethod: 'Bank Transfer',
    sourceType: 'GENERAL_INCOME',
    createdAt: '2026-11-12T09:00:00Z',
    updatedAt: '2026-11-12T09:00:00Z',
  });
  assert.equal(incRow.tx_date, '2026-11-12');
  assert.equal(incRow.received_from, 'Alumni Chapter');
  assert.equal(incRow.payment_method, 'Bank Transfer');
  assert.equal(incRow.source_type, 'GENERAL_INCOME');
  assert.equal('paymentMethod' in incRow, false);

  const fineRow = toSnakeCaseRow('fines', {
    id: 'fine_99',
    studentUid: 'student_1',
    studentName: 'Ahmed',
    studentRoll: '01',
    studentDepartment: '11th Batch of DHBC',
    title: 'Library Overdue',
    description: 'Returned 4 days late',
    amount: 100,
    category: 'Library Fine',
    status: 'unpaid',
    issueDate: '2026-11-05',
    dueDate: '2026-11-15',
    createdAt: '2026-11-05T09:00:00Z',
    updatedAt: '2026-11-05T09:00:00Z',
  });
  assert.equal(fineRow.student_uid, 'student_1');
  assert.equal(fineRow.student_roll, '01');
  assert.equal(fineRow.issue_date, '2026-11-05');
  assert.equal(fineRow.due_date, '2026-11-15');
  assert.equal('studentUid' in fineRow, false);

  const certRow = toSnakeCaseRow('certificates', {
    id: 'cert_99',
    certificateNumber: 'CERT-AN-2026-099',
    resultId: 'sr_1',
    programId: 'prog_1',
    programName: 'Debate Finals',
    programCategory: 'Debate',
    programDate: '2026-11-01',
    issueDate: '2026-11-02',
    studentUid: 'student_1',
    studentId: 'AN-2026-101',
    studentName: 'Ahmed',
    studentDepartment: '11th Batch of DHBC',
    position: '1st Place',
    grade: 'A',
    positionPoints: 3,
    gradePoints: 5,
    totalPoints: 8,
    authorizedByName: 'SUPER ADMIN',
    authorizedByDesignation: 'Union President',
    unionName: 'Al-Nibras Class Union',
    qrVerificationCode: 'ALN-QR-099',
    status: 'active',
    createdAt: '2026-11-02T10:00:00Z',
    updatedAt: '2026-11-02T10:00:00Z',
  });
  assert.equal(certRow.certificate_number, 'CERT-AN-2026-099');
  assert.equal(certRow.result_id, 'sr_1');
  assert.equal(certRow.total_points, 8);
  assert.equal(certRow.qr_verification_code, 'ALN-QR-099');
  assert.equal('certificateNumber' in certRow, false);
});

test('Server-Side Supabase Service Role Isolation: Never runs against live DB under ALNIBRAS_TEST_STORE_PATH and never exposes secrets in client files or .env.example', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { getSupabaseAdminClient, isSupabaseAdminConfigured } = await import('./supabase-server');

  const prevTestStore = process.env.ALNIBRAS_TEST_STORE_PATH;
  process.env.ALNIBRAS_TEST_STORE_PATH = '/tmp/isolated_test_store.json';
  try {
    assert.equal(isSupabaseAdminConfigured(), false);
    assert.equal(getSupabaseAdminClient(), null);
  } finally {
    if (prevTestStore === undefined) {
      delete process.env.ALNIBRAS_TEST_STORE_PATH;
    } else {
      process.env.ALNIBRAS_TEST_STORE_PATH = prevTestStore;
    }
  }

  // Ensure service_role secret is never hardcoded in client/server source modules or .env.example
  const clientSrc = fs.readFileSync(path.join(process.cwd(), 'lib', 'supabase.ts'), 'utf-8');
  const serverSrc = fs.readFileSync(path.join(process.cwd(), 'lib', 'supabase-server.ts'), 'utf-8');
  const envExampleSrc = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf-8');
  assert.equal(clientSrc.includes('service_role'), false);
  assert.equal(clientSrc.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
  assert.equal(serverSrc.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
  assert.equal(envExampleSrc.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
});

test('LiveDateTimeFormatter: Deterministically formats day, full date, shortDate, and time across timezones and handles invalid dates', async () => {
  const { formatLiveDateTime } = await import('./portal-logic');

  const sampleUtc = new Date('2026-11-16T14:05:09.000Z');
  const ist = formatLiveDateTime(sampleUtc, 'en-US', 'Asia/Kolkata');
  assert.equal(ist.day, 'Monday');
  assert.ok(ist.date.includes('Nov') && ist.date.includes('16') && ist.date.includes('2026'));
  assert.ok(ist.shortDate.includes('Nov') && ist.shortDate.includes('16'));
  assert.ok(ist.time.includes('7:35:09') || ist.time.includes('07:35:09'));
  assert.equal(ist.isoDate, '2026-11-16');

  const utc = formatLiveDateTime(sampleUtc, 'en-US', 'UTC');
  assert.equal(utc.day, 'Monday');
  assert.ok(utc.time.includes('2:05:09') || utc.time.includes('02:05:09'));

  // Invalid date gracefully falls back to valid clock values
  const fallback = formatLiveDateTime(new Date('invalid-date-string'));
  assert.ok(fallback.day.length > 0);
  assert.ok(fallback.date.length > 0);
  assert.ok(fallback.time.length > 0);
});

test('India Standard Time Helpers: getIndiaDateISO, formatIndiaDate, formatIndiaTime, and formatIndiaDateTime strictly use Asia/Kolkata (+05:30)', async () => {
  const {
    getIndiaDateISO,
    formatIndiaDate,
    formatIndiaTime,
    formatIndiaDateTime,
    formatLiveDateTime,
  } = await import('./portal-logic');

  // 2026-11-16T20:00:00.000Z is 2026-11-17 01:30:00 IST (crosses midnight boundary into Nov 17 in India!)
  const lateNightUtc = new Date('2026-11-16T20:00:00.000Z');
  assert.equal(getIndiaDateISO(lateNightUtc), '2026-11-17');

  const formattedDate = formatIndiaDate(lateNightUtc);
  assert.ok(formattedDate.includes('17') && formattedDate.includes('2026'));

  const formattedTime = formatIndiaTime(lateNightUtc).toLowerCase();
  assert.ok((formattedTime.includes('1:30') || formattedTime.includes('01:30')) && formattedTime.includes('am'));

  const formattedDateTime = formatIndiaDateTime(lateNightUtc).toLowerCase();
  assert.ok(formattedDateTime.includes('17') && (formattedDateTime.includes('1:30') || formattedDateTime.includes('01:30')));
  assert.equal(formatLiveDateTime(lateNightUtc).timeZoneLabel, 'IST');
  assert.equal(formatIndiaDate('invalid'), 'invalid');
});

test('Committee Management & Schema Round-Trip: Supports Core Committee and Sub Committee (Wing Name + Chairman/Convener) through applyPortalMutation and toSnakeCaseRow/rowToCommittee', async () => {
  const { applyPortalMutation } = await import('./portal-mutations');
  const { getInitialPortalState } = await import('./seed-data');
  const { toSnakeCaseRow, rowToCommittee } = await import('./supabase-db');

  const state = getInitialPortalState();
  const adminActor = state.users.find((u) => u.uid === 'admin_super')!;

  // 1. Save a Core Committee member
  const coreRes = applyPortalMutation(
    state,
    {
      action: 'SAVE_COMMITTEE_MEMBER',
      committeeType: 'core',
      fullName: 'Muhammed Rasheed K',
      designation: 'General Secretary',
      roleCategory: 'Core Custom Wing',
      department: '11th Batch of DHBC',
      batch: '2026-2027',
      contactPhone: '+91 9876543210',
      showOnHomepage: true,
    },
    adminActor
  );
  assert.equal(coreRes.ok, true);
  const coreMember = coreRes.state!.committeeMembers.find((m) => m.fullName === 'Muhammed Rasheed K')!;
  assert.equal(coreMember.committeeType, 'core');
  assert.equal(coreMember.roleCategory, 'Core Custom Wing');

  // Round-trip Core member through Supabase row serializer & deserializer
  const coreRoundTrip = rowToCommittee(toSnakeCaseRow('committee_members', coreMember as unknown as Record<string, unknown>));
  assert.equal(coreRoundTrip.committeeType, 'core');
  assert.equal(coreRoundTrip.roleCategory, 'Core Custom Wing');

  // 2. Save a Sub Committee member with wingName and subRole (Chairman / Convener / custom)
  const subRes = applyPortalMutation(
    coreRes.state!,
    {
      action: 'SAVE_COMMITTEE_MEMBER',
      committeeType: 'sub',
      wingName: 'Literary & Debate Wing',
      subRole: 'Convener',
      fullName: 'Salmanul Faris P',
      avatarUrl: '/images/avatar_admin_portrait.jpg',
      showOnHomepage: true,
    },
    adminActor
  );
  assert.equal(subRes.ok, true);
  const subMember = subRes.state!.committeeMembers.find((m) => m.fullName === 'Salmanul Faris P')!;
  assert.equal(subMember.committeeType, 'sub');
  assert.equal(subMember.wingName, 'Literary & Debate Wing');
  assert.equal(subMember.subRole, 'Convener');

  // Round-trip Sub member through Supabase row serializer & deserializer
  const subSnake = toSnakeCaseRow('committee_members', subMember as unknown as Record<string, unknown>);
  assert.equal(subSnake.batch_info, 'Sub Committee');
  const subRoundTrip = rowToCommittee(subSnake);
  assert.equal(subRoundTrip.committeeType, 'sub');
  assert.equal(subRoundTrip.wingName, 'Literary & Debate Wing');
  assert.equal(subRoundTrip.subRole, 'Convener');
  assert.equal(subRoundTrip.fullName, 'Salmanul Faris P');
});

test('Removed Modules & PostgreSQL CHECK Constraint Clamping: Rejects SAVE_VIDEO/DELETE_VIDEO/SAVE_EVENT/CREATE_TEACHER and clamps custom enum strings safely', async () => {
  const { applyPortalMutation } = await import('./portal-mutations');
  const { getInitialPortalState } = await import('./seed-data');
  const { toSnakeCaseRow } = await import('./supabase-db');

  const state = getInitialPortalState();
  const adminActor = state.users.find((u) => u.uid === 'admin_super')!;

  for (const removedAction of ['SAVE_VIDEO', 'DELETE_VIDEO', 'SAVE_EVENT', 'SAVE_RESOURCE', 'CREATE_TEACHER']) {
    const res = applyPortalMutation(state, { action: removedAction }, adminActor);
    assert.equal(res.ok, false, `Expected ${removedAction} to be rejected`);
  }

  // Clamp custom status strings on CHECK-constrained columns
  const customNoticeRow = toSnakeCaseRow('notices', {
    id: 'n_1',
    title: 'Test Notice',
    content: 'Body',
    status: 'Archival Review (Custom)',
  });
  assert.equal(customNoticeRow.status, 'published');

  const customFineRow = toSnakeCaseRow('fines', {
    id: 'f_1',
    studentUid: 'student_1',
    title: 'Library',
    status: 'Deferred Custom',
  });
  assert.equal(customFineRow.status, 'unpaid');
});

test('Media URL Sanitization & Committee/Gallery Upload Persistence: Preserves large >500KB data URLs and HTTPS query tokens while blocking XSS', async () => {
  const { sanitizeMediaUrl } = await import('./portal-logic');
  const { applyPortalMutation } = await import('./portal-mutations');
  const { getInitialPortalState } = await import('./seed-data');

  // Preserves > 600KB inline base64 photo without truncation
  const largeDataUrl = `data:image/jpeg;base64,${'A'.repeat(650_000)}`;
  assert.equal(sanitizeMediaUrl(largeDataUrl).length, largeDataUrl.length);

  // Preserves signed URL query delimiters (&token=) without HTML-entity corruption
  const signedHttps = 'https://ehxpegiusizkbmzdtcir.supabase.co/storage/v1/object/sign/public-gallery/photo.jpg?token=abc&expires=999';
  assert.equal(sanitizeMediaUrl(signedHttps), signedHttps);

  // Blocks dangerous URI schemes & SVG payloads
  assert.equal(sanitizeMediaUrl('javascript:alert(1)', 'fallback.png'), 'fallback.png');
  assert.equal(sanitizeMediaUrl('data:image/svg+xml;base64,PHN2Zz4=', 'fallback.png'), 'fallback.png');

  // Core Committee member saves clean portrait data URL without requiring Wing/Category
  const state = getInitialPortalState();
  const adminActor = state.users.find((u) => u.uid === 'admin_super')!;
  const corePhotoRes = applyPortalMutation(
    state,
    {
      action: 'SAVE_COMMITTEE_MEMBER',
      committeeType: 'core',
      fullName: 'Abdullah Najeeb',
      designation: 'Treasurer',
      department: '11th Batch of DHBC',
      avatarUrl: largeDataUrl,
      showOnHomepage: true,
    },
    adminActor
  );
  assert.equal(corePhotoRes.ok, true);
  const savedMember = corePhotoRes.state!.committeeMembers.find((m) => m.fullName === 'Abdullah Najeeb')!;
  assert.equal(savedMember.committeeType, 'core');
  assert.equal(savedMember.avatarUrl, largeDataUrl);
});

test('Standardized Image Upload Helpers: Infers empty/octet-stream MIMEs by extension and blocks active XSS payloads', async () => {
  const {
    inferImageMimeFromFile,
    isSupportedImageFile,
    validateImageFile,
  } = await import('./supabase-storage');

  // Empty browser MIME on valid .jpg / .webp
  assert.equal(inferImageMimeFromFile({ name: 'portrait.jpg', type: '' }), 'image/jpeg');
  assert.equal(
    inferImageMimeFromFile({ name: 'banner.WEBP', type: 'application/octet-stream' }),
    'image/webp'
  );
  assert.equal(isSupportedImageFile({ name: 'photo.heic', type: '' }), true);
  assert.equal(isSupportedImageFile({ name: 'vector.svg', type: 'image/svg+xml' }), false);
  assert.equal(isSupportedImageFile({ name: 'payload.html', type: 'image/jpeg' }), false);

  const validImg = new File([new Uint8Array(64)], 'avatar.png', { type: '' });
  assert.equal(validateImageFile(validImg).valid, true);

  const xssImg = new File(['<svg onload=alert(1)>'], 'evil.svg', { type: 'image/svg+xml' });
  assert.equal(validateImageFile(xssImg).valid, false);
});

test('Portal API Photo & Branding Persistence: SAVE_BRANDING unwraps nested payload, and UPDATE_STUDENT / UPDATE_AVATAR sync avatars', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { NextRequest } = await import('next/server');

  const tempStorePath = path.join(
    os.tmpdir(),
    `alnibras_photo_branding_${Date.now()}_${Math.random().toString(36).slice(2)}.json`
  );
  const prevTestStore = process.env.ALNIBRAS_TEST_STORE_PATH;
  process.env.ALNIBRAS_TEST_STORE_PATH = tempStorePath;

  try {
    const { loadServerStore, resetInMemoryServerStoreCache } = await import('./server-db');
    const { POST } = await import('../app/api/portal/route');

    resetInMemoryServerStoreCache();
    const store = loadServerStore();

    // 1. SAVE_BRANDING with nested branding object (as sent by OfficialBrandingView)
    const testLogoUrl = `data:image/png;base64,${'B'.repeat(256)}`;
    const brandingReq = new NextRequest('http://localhost:3000/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'SAVE_BRANDING',
        actorUid: 'admin_super',
        branding: {
          logoUrl: testLogoUrl,
          unionTitle: 'AL-NIBRAS TEST UNION',
          unionSubtitle: 'Verified Branding Logo',
          footerTitle: 'Footer Title',
          footerSubtitle: 'Footer Sub',
        },
      }),
    });
    const brandingRes = await POST(brandingReq);
    assert.equal(brandingRes.status, 200);
    const brandingJson = (await brandingRes.json()) as { ok: boolean; state?: typeof store.state };
    assert.equal(brandingJson.ok, true);
    assert.equal(brandingJson.state?.branding?.logoUrl, testLogoUrl);
    assert.equal(brandingJson.state?.branding?.unionTitle, 'AL-NIBRAS TEST UNION');

    // 2. Create student + update avatar via UPDATE_STUDENT and UPDATE_AVATAR
    const createRes = await POST(
      new NextRequest('http://localhost:3000/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_STUDENT',
          actorUid: 'admin_super',
          fullName: 'Photo Verify Scholar',
          username: 'photo.verify',
          studentId: 'AN-2026-888',
          rollNumber: '88',
          contactPhone: '+91-9876500001',
          password: 'PhotoPass#2026',
          avatarUrl: `data:image/jpeg;base64,${'C'.repeat(200)}`,
        }),
      })
    );
    assert.equal(createRes.status, 200);
    const createJson = (await createRes.json()) as { state: typeof store.state };
    const createdStu = createJson.state.users.find((u) => u.username === 'photo.verify')!;
    assert.ok(createdStu);

    // Seed a student result pointing to createdStu to verify avatar propagation
    loadServerStore().state.studentResults.push({
      id: 'res_photo_sync_1',
      studentUid: createdStu.uid,
      studentName: createdStu.fullName,
      studentId: createdStu.studentId,
      studentAvatar: createdStu.avatarUrl,
      programTitle: 'Oratory Contest',
      category: 'Academic',
      position: 'First',
      grade: 'A+',
      points: 15,
      date: '2026-10-12',
      remarks: 'Winner',
      status: 'published',
      createdAt: '2026-10-12T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
    });

    const newAdminAvatar = `data:image/png;base64,${'D'.repeat(220)}`;
    const updateStuRes = await POST(
      new NextRequest('http://localhost:3000/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_STUDENT',
          actorUid: 'admin_super',
          targetUid: createdStu.uid,
          patch: { avatarUrl: newAdminAvatar },
        }),
      })
    );
    assert.equal(updateStuRes.status, 200);
    const updateStuJson = (await updateStuRes.json()) as { state: typeof store.state };
    assert.equal(
      updateStuJson.state.users.find((u) => u.uid === createdStu.uid)?.avatarUrl,
      newAdminAvatar
    );
    assert.equal(
      updateStuJson.state.studentResults.find((r) => r.id === 'res_photo_sync_1')?.studentAvatar,
      newAdminAvatar
    );

    const selfAvatar = `data:image/webp;base64,${'E'.repeat(240)}`;
    const selfAvatarRes = await POST(
      new NextRequest('http://localhost:3000/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_AVATAR',
          actorUid: createdStu.uid,
          avatarUrl: selfAvatar,
        }),
      })
    );
    assert.equal(selfAvatarRes.status, 200);
    const selfAvatarJson = (await selfAvatarRes.json()) as { state: typeof store.state };
    assert.equal(
      selfAvatarJson.state.users.find((u) => u.uid === createdStu.uid)?.avatarUrl,
      selfAvatar
    );
    assert.equal(
      selfAvatarJson.state.studentResults.find((r) => r.id === 'res_photo_sync_1')?.studentAvatar,
      selfAvatar
    );
  } finally {
    if (prevTestStore === undefined) {
      delete process.env.ALNIBRAS_TEST_STORE_PATH;
    } else {
      process.env.ALNIBRAS_TEST_STORE_PATH = prevTestStore;
    }
    const { resetInMemoryServerStoreCache } = await import('./server-db');
    resetInMemoryServerStoreCache();
    if (fs.existsSync(tempStorePath)) fs.unlinkSync(tempStorePath);
  }
});

test('Supabase RLS Diagnostic Utility: Validates lib/supabase-schema.sql policies and detects enforced vs unrestricted tables', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {
    auditSchemaSqlRlsPolicies,
    runSupabaseRlsDiagnostics,
  } = await import('./supabase-rls-diagnostic');

  const schemaSql = fs.readFileSync(path.join(process.cwd(), 'lib', 'supabase-schema.sql'), 'utf-8');
  const schemaAudit = auditSchemaSqlRlsPolicies(schemaSql);
  assert.equal(schemaAudit.allTablesHaveRlsEnabled, true);
  assert.equal(schemaAudit.allTablesHavePolicies, true);
  assert.deepEqual(schemaAudit.wideOpenWriteTables, []);

  // Case 1: Properly Enforced RLS (with normalized schema mapping profiles->users, portal_data->portal_settings+portal_server_store)
  const enforcedFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const table = decodeURIComponent(url.pathname.split('/rest/v1/')[1] || '');
    const method = (init?.method || 'GET').toUpperCase();

    if (table === 'profiles' || table === 'portal_data') {
      return new Response(
        JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${table}'` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'GET') {
      if (table === 'portal_settings') {
        return new Response(JSON.stringify([{ id: 'global' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST') {
      return new Response(
        JSON.stringify({ code: '42501', message: `new row violates row-level security policy for table "${table}"` }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const passReport = await runSupabaseRlsDiagnostics({
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test-key',
    fetchImpl: enforcedFetch,
    schemaSql,
  });

  assert.equal(passReport.overallStatus, 'PASS');
  assert.equal(passReport.ok, true);
  assert.equal(
    passReport.requestedTargets.find((t) => t.table === 'profiles')?.status,
    'ALIASED_NORMALIZED'
  );
  assert.equal(
    passReport.requestedTargets.find((t) => t.table === 'appointments')?.status,
    'ENFORCED'
  );
  assert.equal(
    passReport.requestedTargets.find((t) => t.table === 'portal_data')?.status,
    'ALIASED_NORMALIZED'
  );

  // Case 2: Unrestricted anon SELECT/INSERT leak on appointments & users fails diagnostic immediately
  const vulnerableFetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const table = decodeURIComponent(url.pathname.split('/rest/v1/')[1] || '');
    const method = (init?.method || 'GET').toUpperCase();

    if (table === 'profiles' || table === 'portal_data') {
      return new Response(
        JSON.stringify({ code: 'PGRST205', message: `Could not find the table 'public.${table}'` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'GET' && table === 'appointments') {
      return new Response(JSON.stringify([{ id: 'appt_leaked_1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST' && table === 'users') {
      return new Response(JSON.stringify([{ uid: '__rls_probe_user__' }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST') {
      return new Response(JSON.stringify({ code: '42501', message: 'violates row-level security policy' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const failReport = await runSupabaseRlsDiagnostics({
    supabaseUrl: 'https://example.supabase.co',
    anonKey: 'anon-test-key',
    fetchImpl: vulnerableFetch,
    schemaSql,
  });

  assert.equal(failReport.overallStatus, 'FAIL');
  assert.equal(failReport.ok, false);
  assert.equal(
    failReport.requestedTargets.find((t) => t.table === 'appointments')?.status,
    'VULNERABLE_UNRESTRICTED'
  );
  assert.equal(
    failReport.requestedTargets.find((t) => t.table === 'profiles')?.status,
    'VULNERABLE_UNRESTRICTED'
  );
});



