export type UserRole = 'admin' | 'student' | 'teacher';
export type AccountStatus = 'active' | 'inactive';
export type ContentStatus = 'published' | 'draft';
export type PriorityLevel = 'normal' | 'high' | 'urgent';
export type FineStatus = 'unpaid' | 'paid' | 'overdue' | 'cancelled';
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type ResultPosition = '1st Place' | '2nd Place' | '3rd Place' | 'None';
export type ResultGrade = 'A' | 'B' | 'None';

export type ActivityActionType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'ACCOUNT_CREATION'
  | 'TEACHER_CREATION'
  | 'ACCOUNT_DELETED'
  | 'USERNAME_CHANGE'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_INITIATED'
  | 'PROFILE_UPDATE'
  | 'CONTENT_PUBLICATION'
  | 'CONTENT_EDIT'
  | 'CONTENT_DELETION'
  | 'FINE_ISSUED'
  | 'FINE_STATUS_UPDATED'
  | 'FINE_DELETED'
  | 'PROGRAM_RESULT_SAVED'
  | 'PROGRAM_RESULT_DELETED'
  | 'STUDENT_RESULT_UPDATED'
  | 'STUDENT_RESULT_DELETED'
  | 'CERTIFICATE_GENERATED'
  | 'CALENDAR_EVENT_SAVED'
  | 'CALENDAR_EVENT_DELETED'
  | 'LIVE_MESSAGE_SENT';

export type MediaDestination = 'public' | 'user';

export interface StudentAddress {
  houseBuilding?: string;
  streetRoad?: string;
  villageArea: string;
  postOffice: string;
  policeStation: string;
  district: string;
  state: string;
  pinCode: string;
  country: string;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  studentId: string;
  rollNumber: string;
  role: UserRole;
  status: AccountStatus;
  contactEmail: string;
  contactPhone: string;
  avatarUrl: string;
  department: string;
  classInfo?: string;
  address?: StudentAddress;
  designation?: string; // For teachers
  qualifications?: string; // For teachers
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  status: ContentStatus;
  priority: PriorityLevel;
  showOnHomepage?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  referenceCode: string;
  status: ContentStatus;
  category?: string;
  effectiveDate: string;
  showOnHomepage?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UnionEvent {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  venue: string;
  category: string;
  status: ContentStatus;
  showOnHomepage?: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  caption: string;
  description?: string;
  albumName?: string;
  imageUrl: string;
  category: string;
  destination?: MediaDestination; // 'public' | 'user'
  showOnHomepage?: boolean;
  status: ContentStatus;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudyResource {
  id: string;
  title: string;
  description: string;
  subject: string;
  fileUrl: string;
  fileType: string;
  status: ContentStatus;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  subject: string;
  body: string;
  status: 'unread' | 'read' | 'replied';
  replyText?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentBooking {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  preferredDate: string;
  preferredTime: string;
  purpose: string;
  notes?: string;
  status: AppointmentStatus;
  studentUid?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortalNotification {
  id: string;
  recipientId: string; // 'ALL_STUDENTS' or specific uid
  title: string;
  message: string;
  type: 'announcement' | 'notice' | 'event' | 'system' | 'fine' | 'chat' | 'result' | 'certificate' | 'finance';
  read: boolean;
  readByUids?: string[];
  relatedId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  actorId: string;
  actorName: string;
  actionType: ActivityActionType;
  details: string;
  targetId: string;
  createdAt: string;
}

export interface UnionSettings {
  unionName: string;
  academicSession: string;
  motto: string;
  missionStatement: string;
  facultyAdvisor: string;
  unionPresident: string;
  generalSecretary: string;
  officeLocation: string;
  officeEmail: string;
  bannerImageUrl?: string;
  enableStudentFinancialStatement?: boolean;
  updatedBy: string;
  updatedAt: string;
}

// 4. FINE MANAGEMENT SYSTEM
export interface FineRecord {
  id: string;
  studentUid: string;
  studentName: string;
  studentRoll: string;
  studentDepartment: string;
  title: string;
  description: string;
  amount: number;
  category: string;
  status: FineStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  documentUrl?: string;
  documentName?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// 5. TELEGRAM-STYLE CHAT SYSTEM
export interface ChatAttachment {
  url: string;
  name: string;
  type: 'image' | 'video' | 'pdf' | 'document';
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  recipientId: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachments?: ChatAttachment[];
  replyToId?: string;
  replyToText?: string;
  replyToSender?: string;
  replyToSenderName?: string;
  forwardedFrom?: string;
  forwardedFromName?: string;
  delivered?: boolean;
  read: boolean;
  createdAt: string;
}

// 6. PROGRAM RESULT, AUTOMATIC POINT & CERTIFICATE MANAGEMENT
export interface ProgramParticipant {
  id: string;
  studentUid?: string;
  studentId?: string;
  studentAvatar?: string;
  studentDepartment?: string;
  name: string;
  position: string; // '1st Place' | '2nd Place' | '3rd Place' | 'None'
  grade?: ResultGrade; // 'A' | 'B' | 'None'
  positionPoints?: number;
  gradePoints?: number;
  totalPoints?: number;
  remarks?: string;
  score?: string;
  isWinner?: boolean;
  certificateId?: string;
}

export interface ProgramResult {
  id: string;
  programName: string;
  description: string;
  programDate: string;
  publicationDate?: string;
  category: string;
  status: ContentStatus;
  participants: ProgramParticipant[];
  winnerSummary: string;
  certificateUrl?: string;
  certificateName?: string;
  documentUrl?: string;
  documentName?: string;
  imageUrl?: string;
  certificateTitle?: string;
  certificateSubtitle?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentResultRecord {
  id: string;
  programId: string;
  programName: string;
  programCategory: string;
  programDate: string;
  publicationDate: string;
  studentUid: string;
  studentId: string;
  studentName: string;
  studentAvatar: string;
  studentDepartment: string;
  position: ResultPosition;
  grade: ResultGrade;
  positionPoints: number;
  gradePoints: number;
  totalPoints: number;
  remarks?: string;
  status: ContentStatus;
  certificateId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentPointSummary {
  studentUid: string;
  studentId: string;
  studentName: string;
  studentAvatar: string;
  studentDepartment: string;
  rollNumber: string;
  totalPoints: number;
  firstPlaceCount: number;
  secondPlaceCount: number;
  thirdPlaceCount: number;
  gradeACount: number;
  gradeBCount: number;
  totalAchievements: number;
  updatedAt: string;
}

export interface PointTransaction {
  id: string;
  studentUid: string;
  studentId: string;
  studentName: string;
  programId: string;
  programName: string;
  resultId: string;
  deltaPoints: number;
  previousBalance: number;
  newBalance: number;
  reason: 'RESULT_PUBLISHED' | 'RESULT_EDITED' | 'RESULT_DELETED' | 'ACCOUNT_CLEANUP';
  position: ResultPosition;
  grade: ResultGrade;
  createdBy: string;
  createdAt: string;
}

export interface CertificateRecord {
  id: string;
  certificateNumber: string;
  resultId: string;
  programId: string;
  programName: string;
  programCategory: string;
  programDate: string;
  publicationDate: string;
  studentUid: string;
  studentId: string;
  studentName: string;
  studentDepartment: string;
  position: ResultPosition;
  grade: ResultGrade;
  positionPoints: number;
  gradePoints: number;
  totalPoints: number;
  authorizedByName: string;
  authorizedByDesignation: string;
  unionName: string;
  logoUrl?: string;
  qrVerificationCode: string;
  status: 'active' | 'revoked';
  createdAt: string;
  updatedAt: string;
}

export interface CertificateSettings {
  title: string;
  subtitle: string;
  authorizedByName: string;
  authorizedByDesignation: string;
  signatureImageUrl?: string;
  logoUrl?: string;
  unionName: string;
  footerNote: string;
  showQrCode: boolean;
  updatedAt: string;
}

// 7. ADVANCED CALENDAR MANAGEMENT
export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location: string;
  isAllDay: boolean;
  visibility: 'public' | 'private';
  reminder?: string;
  imageUrl?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

// 8. CUSTOM TYPE OPTION
export interface CustomTypeRecord {
  id: string;
  module: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

// 10. PASSWORD RESET MANAGEMENT
export interface PasswordResetLog {
  id: string;
  targetUid: string;
  targetName: string;
  targetRole: UserRole;
  targetUsername: string;
  initiatedByUid: string;
  initiatedByName: string;
  status: 'initiated' | 'completed';
  initiatedAt: string;
  completedAt?: string;
  notes?: string;
}

// 11. OFFICIAL BRANDING & LOGO MANAGEMENT
export interface BrandingConfig {
  logoUrl: string;
  unionTitle?: string;
  logoWidth?: number;
  logoHeight?: number;
  navbarHeightPx?: number;
  sidebarHeightPx?: number;
  certificateLogoHeightPx?: number;
  receiptLogoHeightPx?: number;
  showInNavbar?: boolean;
  showInSidebars?: boolean;
  showInLogin?: boolean;
  showInCertificates?: boolean;
  showInReceipts?: boolean;
  showInFooter?: boolean;
  tagline: string;
  batchSubtitle?: string;
  placement?: {
    navbar: boolean;
    sidebar: boolean;
    login: boolean;
    certificates: boolean;
    receipts: boolean;
    footer: boolean;
  };
  updatedBy: string;
  updatedAt: string;
}

// 12. VIDEO GALLERY MANAGEMENT
export interface VideoGalleryItem {
  id: string;
  title: string;
  description: string;
  category: string;
  playlist: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration?: string;
  publicationDate?: string;
  destination?: MediaDestination; // 'public' | 'user'
  featuredOnHomepage?: boolean;
  status: ContentStatus;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlideshowSlide {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaText?: string;
  ctaHref?: string;
  ctaLink?: string;
  order: number;
  visible?: boolean;
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CommitteeType = 'core' | 'sub';

export interface CommitteeMember {
  id: string;
  fullName: string;
  committeeType?: CommitteeType;
  wingName?: string;
  subRole?: string;
  position?: string;
  designation?: string;
  roleCategory?: string;
  department: string;
  batchInfo?: string;
  batch?: string;
  contactEmail?: string;
  contactPhone?: string;
  avatarUrl: string;
  bio?: string;
  order: number;
  showOnHomepage: boolean;
  status?: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackRecord {
  id: string;
  studentUid: string;
  studentName: string;
  studentId: string;
  category: string;
  subject: string;
  message: string;
  rating?: number;
  status: 'submitted' | 'reviewed' | 'resolved';
  adminResponse?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseBackupMeta {
  backupId: string;
  createdAt: string;
  backupFilePath: string;
  verifiedRestorable: boolean;
  recordsBackedUp: number;
  preservedSuperAdminUid: string;
  resetCompletedAt: string;
}

// 13. PUBLIC HOMEPAGE MANAGEMENT
export interface HomepageSectionItem {
  id: 'hero' | 'stats' | 'about' | 'announcements' | 'events' | 'gallery' | 'videos' | 'appointments' | 'contact';
  label: string;
  visible: boolean;
  order: number;
}

export interface PublicHomepageConfig {
  logoUrl?: string;
  unionName?: string;
  unionSubtitle?: string;
  heroBadgeText?: string;
  heroHeading?: string;
  heroSubheading?: string;
  heroBannerImageUrl?: string;
  heroBackgroundUrl?: string;
  primaryCtaText?: string;
  secondaryCtaText?: string;
  welcomeHeading?: string;
  welcomeDescription?: string;
  aboutHeading?: string;
  aboutMission?: string;
  aboutVision?: string;
  contactHeading?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  officeHours?: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
    whatsapp?: string;
  };
  footerDescription?: string;
  footerCopyright: string;
  navItems?: { id: string; label: string; href: string; visible: boolean }[];
  sections: HomepageSectionItem[];
  heroBannerText?: string;
  heroBackgroundImage?: string;
  heroImageCaptionTitle?: string;
  heroImageCaptionSubtitle?: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  aboutSectionKicker?: string;
  aboutSectionHeading?: string;
  aboutSectionDescription?: string;
  announcementsHeading?: string;
  noticesHeading?: string;
  eventsHeading?: string;
  galleryHeading?: string;
  videosHeading?: string;
  contactDescription?: string;
  addressText?: string;
  navLinks?: { label: string; href: string; visible: boolean }[];
  accentColor?: string;
  status?: ContentStatus;
  updatedBy: string;
  updatedAt: string;
}

// 14. UNION FINANCIAL MANAGEMENT SYSTEM (INR ₹)
export type PaymentMethodType =
  | 'UPI'
  | 'Bank Transfer'
  | 'Cash'
  | 'Card'
  | 'Cheque'
  | 'Online Portal'
  | 'Online Payment'
  | 'Other'
  | (string & {});

export interface IncomeRecord {
  id: string;
  receiptNumber?: string;
  title: string;
  category: string;
  amount: number; // INR
  date: string;
  receivedFrom?: string;
  sourceReceivedFrom?: string;
  studentUid?: string;
  studentName?: string;
  studentId?: string;
  paymentMethod: PaymentMethodType;
  referenceNumber?: string;
  referenceReceiptNo?: string;
  transactionReference?: string;
  description: string;
  attachmentUrl?: string;
  attachmentName?: string;
  receiptUrl?: string;
  receiptName?: string;
  sourceType?: 'GENERAL_INCOME' | 'STUDENT_CONTRIBUTION' | 'DUE_PAYMENT';
  sourceContributionId?: string;
  sourceDueId?: string;
  linkedContributionId?: string;
  linkedDueId?: string;
  verified?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord {
  id: string;
  voucherNumber?: string;
  title?: string;
  expenseTitle?: string;
  category: string;
  amount: number; // INR
  date?: string;
  expenseDate?: string;
  paidTo: string;
  paymentMethod: PaymentMethodType;
  referenceNumber?: string;
  billInvoiceNo?: string;
  approvedBy?: string;
  description: string;
  purpose?: string;
  billUrl?: string;
  billName?: string;
  verified?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentContributionRecord {
  id: string;
  receiptNumber: string;
  studentUid: string;
  studentName: string;
  studentId: string;
  rollNumber?: string;
  studentClass?: string;
  classInfo?: string;
  amount: number; // INR
  date?: string;
  paymentDate?: string;
  paymentMethod: PaymentMethodType;
  purpose?: string;
  contributionPurpose?: string;
  category: string;
  referenceNumber?: string;
  transactionReference?: string;
  receiptUrl?: string;
  receiptName?: string;
  receiptId?: string;
  remarks?: string;
  description?: string;
  paymentStatus: 'paid' | 'Paid';
  status?: 'Paid' | 'paid';
  linkedIncomeId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDuePaymentEntry {
  id: string;
  amount: number; // INR
  date: string;
  paymentDate?: string;
  paymentMethod: PaymentMethodType;
  receiptNumber: string;
  receiptId?: string;
  referenceNumber?: string;
  transactionReference?: string;
  remarks?: string;
  recordedBy: string;
  createdAt: string;
}

export interface StudentDueRecord {
  id: string;
  studentUid: string;
  studentName: string;
  studentId: string;
  rollNumber?: string;
  studentClass?: string;
  classInfo?: string;
  dueTitle?: string;
  feeTitle?: string;
  dueCategory?: string;
  title?: string;
  reason?: string;
  category?: string;
  totalAmount: number; // INR
  paidAmount?: number; // INR
  remainingAmount?: number; // INR
  amountPaid?: number;
  remainingDue?: number;
  issueDate?: string;
  dueDate: string;
  status:
    | 'pending'
    | 'partial'
    | 'paid'
    | 'overdue'
    | 'cancelled'
    | 'Pending'
    | 'Partially Paid'
    | 'Paid'
    | 'Cancelled';
  remarks?: string;
  payments: StudentDuePaymentEntry[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialReceiptRecord {
  id: string;
  receiptNumber: string;
  type: 'income' | 'contribution' | 'due_payment' | 'fine_payment';
  sourceRecordId: string;
  studentUid?: string;
  studentName?: string;
  studentId?: string;
  payerOrPayeeName: string;
  title: string;
  category: string;
  amount: number; // INR
  date: string;
  paymentDate?: string;
  purpose?: string;
  paymentMethod: PaymentMethodType;
  referenceNumber?: string;
  transactionReference?: string;
  remarks?: string;
  sourceType?: 'CONTRIBUTION' | 'DUE_PAYMENT' | 'FINE_PAYMENT';
  sourceId?: string;
  authorizedBy: string;
  createdAt: string;
}

export interface FinancialAuditLog {
  id: string;
  actorId: string;
  actorUid?: string;
  actorName: string;
  action: string;
  amount: number;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface PortalDatabaseState {
  users: UserProfile[];
  announcements: Announcement[];
  notices: Notice[];
  events?: UnionEvent[];
  gallery: GalleryItem[];
  videos?: VideoGalleryItem[];
  resources?: StudyResource[];
  messages: DirectMessage[];
  notifications: PortalNotification[];
  activityLogs: ActivityLog[];
  settings: UnionSettings;
  branding?: BrandingConfig;
  homepageConfig?: PublicHomepageConfig;
  fines: FineRecord[];
  chatMessages: ChatMessage[];
  programResults: ProgramResult[];
  studentResults: StudentResultRecord[];
  studentPoints: StudentPointSummary[];
  pointTransactions: PointTransaction[];
  certificates: CertificateRecord[];
  certificateSettings: CertificateSettings;
  calendarEvents: CalendarEvent[];
  customTypes: CustomTypeRecord[];
  passwordResetLogs: PasswordResetLog[];
  income?: IncomeRecord[];
  expenses?: ExpenseRecord[];
  studentContributions?: StudentContributionRecord[];
  studentDues?: StudentDueRecord[];
  financialReceipts?: FinancialReceiptRecord[];
  financialAuditLogs?: FinancialAuditLog[];
  slideshow?: SlideshowSlide[];
  committeeMembers?: CommitteeMember[];
  feedback?: FeedbackRecord[];
  appointments?: AppointmentBooking[];
  backupMeta?: DatabaseBackupMeta;
}
