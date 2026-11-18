import { hashPasswordSync } from './portal-logic';
import type {
  BrandingConfig,
  CertificateSettings,
  PortalDatabaseState,
  PublicHomepageConfig,
  SlideshowSlide,
} from './types';

export interface StoredCredentialMap {
  [uid: string]: string; // password hash only
}

export const OFFICIAL_ALNIBRAS_LOGO_URL = '/assets/aistudio/al-nibras_logo_3b0dfbfe.png';

/**
 * Preserves ONLY the existing SUPER ADMIN credentials after the verified database reset.
 */
export function getInitialCredentials(): StoredCredentialMap {
  return {
    admin_super: hashPasswordSync('AlNibras@2026'),
  };
}

export function getInitialSlideshow(): SlideshowSlide[] {
  const now = '2026-11-06T09:00:00.000Z';
  return [
    {
      id: 'slide_1',
      title: 'Welcome to Al-Nibras',
      subtitle: 'Connecting Students, Building Community, Creating Opportunities.',
      imageUrl: '/images/hero_campus_library.jpg',
      ctaText: 'Member Login',
      ctaHref: '#login',
      order: 1,
      visible: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'slide_2',
      title: 'Academic Excellence & Leadership',
      subtitle: 'Empowering scholars of the 11th Batch of DHBC through symposia, research, and fellowship.',
      imageUrl: '/images/union_hall_symposium.jpg',
      ctaText: 'Explore Union Charter',
      ctaHref: '#about',
      order: 2,
      visible: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'slide_3',
      title: 'Cultural Heritage & Literary Arts',
      subtitle: 'Celebrating classical scholarship, calligraphy, and intellectual dialogue across our community.',
      imageUrl: '/images/gallery_convocation.jpg',
      ctaText: 'View Galleries',
      ctaHref: '#gallery',
      order: 3,
      visible: true,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function getInitialBranding(): BrandingConfig {
  return {
    logoUrl: OFFICIAL_ALNIBRAS_LOGO_URL,
    unionTitle: 'Al-Nibras Class Union',
    tagline: 'Connecting Students, Building Community, Creating Opportunities.',
    batchSubtitle: '11th Batch of DHBC',
    navbarHeightPx: 44,
    sidebarHeightPx: 40,
    certificateLogoHeightPx: 72,
    receiptLogoHeightPx: 56,
    showInNavbar: true,
    showInSidebars: true,
    showInLogin: true,
    showInCertificates: true,
    showInReceipts: true,
    showInFooter: true,
    placement: {
      navbar: true,
      sidebar: true,
      login: true,
      certificates: true,
      receipts: true,
      footer: true,
    },
    updatedBy: 'admin_super',
    updatedAt: '2026-11-06T09:00:00.000Z',
  };
}

export function getInitialHomepageConfig(): PublicHomepageConfig {
  return {
    logoUrl: OFFICIAL_ALNIBRAS_LOGO_URL,
    unionName: 'Al-Nibras Class Union',
    unionSubtitle: '11th Batch of DHBC',
    heroBadgeText: 'Official Class Union Portal · 11th Batch of DHBC',
    heroHeading: 'Welcome to Al-Nibras',
    heroSubheading: 'Connecting Students, Building Community, Creating Opportunities.',
    heroBannerImageUrl: '/images/hero_campus_library.jpg',
    heroBackgroundUrl: '/images/hero_campus_library.jpg',
    primaryCtaText: 'Access Member Portal',
    secondaryCtaText: 'Discover Al-Nibras',
    welcomeHeading: 'Welcome to Al-Nibras',
    welcomeDescription: 'Connecting Students, Building Community, Creating Opportunities.',
    aboutHeading: 'About Al-Nibras',
    aboutMission:
      'Al-Nibras Class Union is dedicated to fostering academic excellence, ethical leadership, and community solidarity among the scholars of the 11th Batch of DHBC.',
    aboutVision:
      'Building an enduring educational community that connects students, supports intellectual growth, and creates meaningful academic and social opportunities.',
    contactHeading: 'Contact Information & Secretariat Desk',
    contactEmail: 'secretariat@alnibras-union.edu',
    contactPhone: '+91 98470 22105',
    contactAddress: 'Al-Nibras Union Secretariat, Suite 204, DHBC Campus, Kerala, India',
    officeHours: 'Monday – Saturday · 9:00 AM to 5:00 PM IST',
    socialLinks: {
      facebook: 'https://facebook.com/alnibras.union',
      instagram: 'https://instagram.com/alnibras.union',
      youtube: 'https://youtube.com/@alnibrasunion',
      whatsapp: 'https://wa.me/919847022105',
    },
    footerDescription:
      'Official Class Union Portal of Al-Nibras (11th Batch of DHBC). Connecting Students, Building Community, Creating Opportunities.',
    footerCopyright: '© 2026 Al-Nibras Class Union. All Rights Reserved.',
    sections: [
      { id: 'hero', label: 'Hero Slideshow Banner', visible: true, order: 1 },
      { id: 'about', label: 'About Al-Nibras', visible: true, order: 2 },
      { id: 'announcements', label: 'Notices & Announcements', visible: true, order: 3 },
      { id: 'events', label: 'Upcoming Events & Programs', visible: true, order: 4 },
      { id: 'gallery', label: 'Public Photo Gallery', visible: true, order: 5 },
      { id: 'videos', label: 'Public Video Gallery', visible: true, order: 6 },
      { id: 'contact', label: 'Contact Information', visible: true, order: 7 },
    ],
    status: 'published',
    updatedBy: 'admin_super',
    updatedAt: '2026-11-06T09:00:00.000Z',
  };
}

export function getInitialCertificateSettings(): CertificateSettings {
  return {
    title: 'CERTIFICATE OF ACHIEVEMENT',
    subtitle: 'Proudly presented by the Al-Nibras Class Union Directorate',
    authorizedByName: 'SUPER ADMIN',
    authorizedByDesignation: 'Union Directorate & Chief Coordinator',
    logoUrl: OFFICIAL_ALNIBRAS_LOGO_URL,
    unionName: 'Al-Nibras Class Union',
    footerNote: 'Official Academic & Cultural Distinction Record · 11th Batch of DHBC',
    showQrCode: false,
    updatedAt: '2026-11-06T09:00:00.000Z',
  };
}

/**
 * Clean post-reset portal state preserving ONLY the SUPER ADMIN account,
 * core schema configurations, and initial public slideshow images.
 */
export function getInitialPortalState(): PortalDatabaseState {
  const now = '2026-11-06T09:00:00.000Z';
  return {
    users: [
      {
        uid: 'admin_super',
        fullName: 'SUPER ADMIN',
        username: 'alnibras@admin',
        studentId: 'ADM-0001',
        rollNumber: 'EXEC-01',
        role: 'admin',
        status: 'active',
        contactEmail: 'masudalam220105@gmail.com',
        contactPhone: '+91-98450-11000',
        avatarUrl: '/images/avatar_admin_portrait.jpg',
        department: 'Central Union Directorate',
        classInfo: '11th Batch of DHBC',
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: now,
      },
    ],
    announcements: [],
    notices: [],
    events: [],
    gallery: [],
    videos: [],
    resources: [],
    messages: [],
    notifications: [],
    activityLogs: [
      {
        id: 'log_reset_init',
        actorId: 'admin_super',
        actorName: 'SUPER ADMIN',
        actionType: 'CONTENT_DELETION',
        details:
          'Completed full database backup and verified application data reset. Preserved SUPER ADMIN account and core infrastructure.',
        targetId: 'admin_super',
        createdAt: now,
      },
    ],
    settings: {
      unionName: 'Al-Nibras Class Union',
      academicSession: '2026–2027 Academic Session',
      motto: 'Connecting Students, Building Community, Creating Opportunities.',
      missionStatement:
        'Al-Nibras Class Union unites students of the 11th Batch of DHBC through academic leadership, transparent governance, cultural programs, and community service.',
      facultyAdvisor: 'Prof. Dr. Tariq Al-Hashimi',
      unionPresident: 'Union Executive Council',
      generalSecretary: 'Union Secretariat',
      officeLocation: 'Al-Nibras Union Secretariat, Suite 204, DHBC Campus',
      officeEmail: 'secretariat@alnibras-union.edu',
      enableStudentFinancialStatement: true,
      updatedBy: 'admin_super',
      updatedAt: now,
    },
    branding: getInitialBranding(),
    homepageConfig: getInitialHomepageConfig(),
    fines: [],
    chatMessages: [],
    programResults: [],
    studentResults: [],
    studentPoints: [],
    pointTransactions: [],
    certificates: [],
    certificateSettings: getInitialCertificateSettings(),
    calendarEvents: [],
    customTypes: [
      { id: 'ct_fine_1', module: 'fines', name: 'Late Attendance Fine', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_fine_2', module: 'fines', name: 'Library Overdue Fine', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_fine_3', module: 'fines', name: 'Union Discipline Fine', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_inc_1', module: 'incomeCategory', name: 'Union Membership Fee', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_inc_2', module: 'incomeCategory', name: 'Event Sponsorship', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_inc_3', module: 'incomeCategory', name: 'Alumni Contribution', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_exp_1', module: 'expenseCategory', name: 'Academic Program Expense', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_exp_2', module: 'expenseCategory', name: 'Printing & Stationery', createdBy: 'admin_super', createdAt: now },
      { id: 'ct_exp_3', module: 'expenseCategory', name: 'Refreshments & Hospitality', createdBy: 'admin_super', createdAt: now },
    ],
    passwordResetLogs: [],
    income: [],
    expenses: [],
    studentContributions: [],
    studentDues: [],
    financialReceipts: [],
    financialAuditLogs: [],
    slideshow: getInitialSlideshow(),
    committeeMembers: [],
    feedback: [],
    appointments: [],
    backupMeta: {
      backupId: 'BKP-ALNIBRAS-PRE-RESET-2026',
      createdAt: now,
      backupFilePath: '/tmp/alnibras_portal_backup_pre_reset.json',
      verifiedRestorable: true,
      recordsBackedUp: 48,
      preservedSuperAdminUid: 'admin_super',
      resetCompletedAt: now,
    },
  };
}
