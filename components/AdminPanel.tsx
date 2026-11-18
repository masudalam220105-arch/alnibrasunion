'use client';

import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Receipt,
  MessageSquareCode,
  Trophy,
  CalendarDays,
  KeyRound,
  History,
  Megaphone,
  FileText,
  Landmark,
  Image as ImageIcon,
  MessageSquare,
  Activity,
  Settings,
  LogOut,
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  Bell,
  CheckCheck,
  Globe,
  X,
  Menu,
  UserCheck,
  UserX,
  Reply,
  Award,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  BarChart3,
  Sparkles,
  FileBadge,
  Home,
  Sliders,
  FileSpreadsheet,
  ThumbsUp,
  Layers,
  Lock,
  CalendarCheck2,
  Clock,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ALNIBRAS_EASE,
  AmbientBackground,
  AnimatedCounter,
  InteractiveCard,
  RippleButton,
  StaggerGrid,
  StaggerItem,
} from './MotionPrimitives';
import { LiveDateTimeClock } from './LiveDateTimeClock';
import { SafeImage } from './SafeImage';
import { OfficialLogo, OfficialBrandingView } from './OfficialBrandingView';
import ThemeToggle from './ThemeToggle';
import PhotoLightboxModal from './PhotoLightboxModal';
import AdminExportDataView from './AdminExportDataView';
import PortalHeaderSearch from './PortalHeaderSearch';
import {
  AdminSlideshowManager,
  AdminCommitteeManager,
  AdminFeedbackManager,
  AdminDatabaseBackupResetCard,
  SupabaseRlsDiagnosticCard,
} from './AdminUpgradeModules';
import { AdminStatsChart } from './AdminStatsChart';
import { AdminActivityLogsView } from './AdminActivityLogsView';
import { AdminFineManagement } from './AdminFineManagement';
import { LiveMessagingView } from './LiveMessagingView';
import { ProgramResultsView } from './ProgramResultsView';
import { AdminPointManagement } from './AdminPointManagement';
import { AdvancedCalendarView } from './AdvancedCalendarView';
import { AccountPasswordManagement } from './AccountPasswordManagement';
import { AccountActivityHistoryModal } from './AccountActivityHistoryModal';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { DeviceFileUpload } from './DeviceFileUpload';
import {
  UnionFinancialManagement,
  StudentFinancialStatementView,
  type FinancialSubTab,
} from './UnionFinancialManagement';
import { AdminHomepageManagement } from './AdminHomepageManagement';
import CertificatePreviewModal, { downloadCertificateAsPdf } from './CertificateModalAndPdf';
import { SelectWithCustom } from './SelectWithCustom';
import {
  computeDashboardMetrics,
  countUnreadNotifications,
  filterActivityLogs,
  filterStudents,
  formatIndiaDate,
  formatIndiaDateTime,
  formatINR,
  isNotificationUnreadForUser,
} from '@/lib/portal-logic';
import type {
  AccountStatus,
  ActivityActionType,
  Announcement,
  CertificateRecord,
  ContentStatus,
  MediaDestination,
  PortalDatabaseState,
  PriorityLevel,
  StudentAddress,
  UnionSettings,
  UserProfile,
} from '@/lib/types';

export type AdminTab =
  | 'dashboard'
  | 'students'
  | 'passwords'
  | 'programResults'
  | 'pointManagement'
  | 'certificateManagement'
  | 'announcements'
  | 'notices'
  | 'calendar'
  | 'gallery'
  | 'publicGallery'
  | 'userGallery'
  | 'homeSlideshow'
  | 'committee'
  | 'feedback'
  | 'exportData'
  | 'liveMessages'
  | 'appointments'
  | 'messages'
  | 'notifications'
  | 'financialDashboard'
  | 'incomeManagement'
  | 'expenseManagement'
  | 'studentContributions'
  | 'studentDues'
  | 'fines'
  | 'financialReports'
  | 'publicHomepage'
  | 'officialBranding'
  | 'classInfo'
  | 'customTypes'
  | 'activityLogs'
  | 'loginHistory'
  | 'accountChangeHistory'
  | 'auditHistory'
  | 'settings';

interface AdminPanelProps {
  currentUser: UserProfile;
  state: PortalDatabaseState;
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => Promise<void>;
  onSwitchToPublic: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

const AVATAR_PRESETS = [
  { label: 'Distinguished Portrait', url: '/images/avatar_admin_portrait.jpg' },
  { label: 'Symposium Hall', url: '/images/union_hall_symposium.jpg' },
  { label: 'Convocation Courtyard', url: '/images/gallery_convocation.jpg' },
];

const EMPTY_ADDRESS: StudentAddress = {
  villageArea: '',
  postOffice: '',
  policeStation: '',
  district: '',
  state: 'Kerala',
  pinCode: '',
  country: 'India',
};

export function AdminPanel({
  currentUser,
  state,
  onMutate,
  onLogout,
  onSwitchToPublic,
  showToast,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);

  // Student Management States
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | AccountStatus>('all');
  const [showCreateStudentModal, setShowCreateStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<UserProfile | null>(null);
  const [viewingStudent, setViewingStudent] = useState<UserProfile | null>(null);
  const [financialProfileStudent, setFinancialProfileStudent] = useState<UserProfile | null>(null);
  const [previewCertificate, setPreviewCertificate] = useState<CertificateRecord | null>(null);
  const [uploadingNewStudentPhoto, setUploadingNewStudentPhoto] = useState(false);
  const [uploadingEditStudentPhoto, setUploadingEditStudentPhoto] = useState(false);
  const [uploadingGalleryPhoto, setUploadingGalleryPhoto] = useState(false);

  // Unified Delete Confirmation Modal State
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{
    title: string;
    itemLabel: string;
    description: string;
    payload: Record<string, unknown>;
    successMessage: string;
  } | null>(null);
  const [isExecutingDelete, setIsExecutingDelete] = useState(false);

  // Quick Password Reset Modal State
  const [resetPasswordTarget, setResetPasswordTarget] = useState<UserProfile | null>(null);
  const [quickResetPassInput, setQuickResetPassInput] = useState('');
  const [isResettingPass, setIsResettingPass] = useState(false);

  // Create Student Form (No Academic Department field per Part 10; includes 9-field Address + Optional Email + Device Photo Upload)
  const [newStudentForm, setNewStudentForm] = useState({
    fullName: '',
    username: '',
    studentId: '',
    rollNumber: '',
    classInfo: '11th Batch of DHBC',
    contactEmail: '',
    contactPhone: '',
    avatarUrl: '',
    status: 'active' as AccountStatus,
    password: '',
    address: { ...EMPTY_ADDRESS },
  });

  // Edit Student Form
  const [editStudentForm, setEditStudentForm] = useState({
    fullName: '',
    username: '',
    studentId: '',
    rollNumber: '',
    classInfo: '11th Batch of DHBC',
    contactEmail: '',
    contactPhone: '',
    avatarUrl: '',
    status: 'active' as AccountStatus,
    newPassword: '',
    address: { ...EMPTY_ADDRESS },
  });

  // CMS Modals / Forms
  const [annForm, setAnnForm] = useState({
    id: '',
    title: '',
    content: '',
    category: 'Academic Convocation',
    status: 'published' as ContentStatus,
    priority: 'normal' as PriorityLevel,
  });
  const [showAnnModal, setShowAnnModal] = useState(false);

  const [noticeForm, setNoticeForm] = useState({
    id: '',
    title: '',
    content: '',
    referenceCode: '',
    effectiveDate: '',
    status: 'published' as ContentStatus,
  });
  const [showNoticeModal, setShowNoticeModal] = useState(false);

  const [galleryForm, setGalleryForm] = useState({
    id: '',
    title: '',
    caption: '',
    imageUrl: '/images/union_hall_symposium.jpg',
    category: 'Academic Symposium',
    status: 'published' as ContentStatus,
    destination: 'public' as MediaDestination,
  });
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [adminLightboxIndex, setAdminLightboxIndex] = useState<number | null>(null);

  // Class Info Form
  const [classInfoForm, setClassInfoForm] = useState<UnionSettings>(state.settings);

  // Custom Types Form
  const [newCustomTypeModule, setNewCustomTypeModule] = useState('incomeCategory');
  const [newCustomTypeName, setNewCustomTypeName] = useState('');

  // Messages Reply State
  const [replyingMsgId, setReplyingMsgId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Activity Log Search & Date-Range Filter
  const [logSearch, setLogSearch] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'ALL' | ActivityActionType>('ALL');
  const [logStartDate, setLogStartDate] = useState('');
  const [logEndDate, setLogEndDate] = useState('');

  const handleResetLogFilters = () => {
    setLogSearch('');
    setLogTypeFilter('ALL');
    setLogStartDate('');
    setLogEndDate('');
  };

  // Admin Settings Forms
  const [adminUsernameInput, setAdminUsernameInput] = useState(currentUser.username);
  const [adminCurrentPass, setAdminCurrentPass] = useState('');
  const [adminNewPass, setAdminNewPass] = useState('');

  // Activity Timeline State
  const [selectedAccountForActivity, setSelectedAccountForActivity] = useState<UserProfile | null>(null);

  const metrics = computeDashboardMetrics({
    users: state.users,
    announcements: state.announcements,
    notices: state.notices,
    gallery: state.gallery,
    messages: state.messages || [],
    fines: state.fines || [],
    chatMessages: state.chatMessages || [],
    programResults: state.programResults || [],
    calendarEvents: state.calendarEvents || [],
    activityLogs: state.activityLogs || [],
  });

  const unreadNotifCount = countUnreadNotifications(state.notifications, currentUser.uid);

  const filteredStudentList = filterStudents(
    state.users,
    studentSearch,
    studentStatusFilter
  );

  const filteredLogs = filterActivityLogs(state.activityLogs, {
    query: logSearch,
    actionType: logTypeFilter,
    startDate: logStartDate,
    endDate: logEndDate,
  });

  // Execute Confirmed Deletion
  const executeConfirmedDelete = async () => {
    if (!pendingDeleteAction) return;
    setIsExecutingDelete(true);
    try {
      const res = await onMutate(pendingDeleteAction.payload);
      if (res.ok) {
        showToast(pendingDeleteAction.successMessage, 'success');
        setPendingDeleteAction(null);
      } else {
        showToast(res.error || 'Deletion failed. Please try again.', 'error');
      }
    } finally {
      setIsExecutingDelete(false);
    }
  };

  const handleAdminMutate = async (
    payload: Record<string, unknown>,
    successMessage: string
  ) => {
    const res = await onMutate(payload);
    if (res.ok) {
      showToast(successMessage, 'success');
    } else {
      showToast(res.error || 'Operation failed. Please try again.', 'error');
    }
  };

  // Handlers
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onMutate({
      action: 'CREATE_STUDENT',
      ...newStudentForm,
      avatarUrl: newStudentForm.avatarUrl || '/images/avatar_admin_portrait.jpg',
    });
    if (res.ok) {
      showToast(`Student account created for ${newStudentForm.fullName}`, 'success');
      setShowCreateStudentModal(false);
      setNewStudentForm({
        fullName: '',
        username: '',
        studentId: '',
        rollNumber: '',
        classInfo: '11th Batch of DHBC',
        contactEmail: '',
        contactPhone: '',
        avatarUrl: '',
        status: 'active',
        password: '',
        address: { ...EMPTY_ADDRESS },
      });
    } else {
      showToast(res.error || 'Failed to create student account', 'error');
    }
  };

  const openEditStudentModal = (student: UserProfile) => {
    setUploadingEditStudentPhoto(false);
    setEditingStudent(student);
    setEditStudentForm({
      fullName: student.fullName,
      username: student.username,
      studentId: student.studentId,
      rollNumber: student.rollNumber,
      classInfo: student.classInfo || '11th Batch of DHBC',
      contactEmail: student.contactEmail || '',
      contactPhone: student.contactPhone || '',
      avatarUrl: student.avatarUrl,
      status: student.status,
      newPassword: '',
      address: student.address ? { ...student.address } : { ...EMPTY_ADDRESS },
    });
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    const res = await onMutate({
      action: 'UPDATE_STUDENT',
      targetUid: editingStudent.uid,
      newPassword: editStudentForm.newPassword || undefined,
      patch: {
        fullName: editStudentForm.fullName,
        username: editStudentForm.username,
        studentId: editStudentForm.studentId,
        rollNumber: editStudentForm.rollNumber,
        classInfo: editStudentForm.classInfo,
        contactEmail: editStudentForm.contactEmail,
        contactPhone: editStudentForm.contactPhone,
        avatarUrl: editStudentForm.avatarUrl,
        status: editStudentForm.status,
        address: editStudentForm.address,
      },
    });
    if (res.ok) {
      showToast(`Updated student record for ${editStudentForm.fullName}`, 'success');
      setEditingStudent(null);
    } else {
      showToast(res.error || 'Failed to update student profile', 'error');
    }
  };

  const handleToggleStudentStatus = async (student: UserProfile) => {
    const nextStatus: AccountStatus = student.status === 'active' ? 'inactive' : 'active';
    const res = await onMutate({
      action: 'UPDATE_STUDENT',
      targetUid: student.uid,
      patch: { status: nextStatus },
    });
    if (res.ok) {
      showToast(
        `Account for ${student.fullName} is now ${nextStatus.toUpperCase()}`,
        'success'
      );
    } else {
      showToast(res.error || 'Could not update status', 'error');
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onMutate({
      action: 'SAVE_ANNOUNCEMENT',
      ...annForm,
    });
    if (res.ok) {
      showToast(
        annForm.id ? 'Announcement updated' : 'Official announcement saved',
        'success'
      );
      setShowAnnModal(false);
    } else {
      showToast(res.error || 'Failed to save announcement', 'error');
    }
  };

  const handleToggleAnnouncementPublish = async (ann: Announcement) => {
    const nextStatus: ContentStatus = ann.status === 'published' ? 'draft' : 'published';
    const res = await onMutate({
      action: 'SAVE_ANNOUNCEMENT',
      ...ann,
      status: nextStatus,
    });
    if (res.ok) {
      showToast(
        `Announcement "${ann.title}" moved to ${nextStatus.toUpperCase()}`,
        'success'
      );
    } else {
      showToast(res.error || 'Failed to update announcement visibility', 'error');
    }
  };

  const handleDeleteAnnouncement = (ann: Announcement) => {
    setPendingDeleteAction({
      title: 'Delete Official Announcement',
      itemLabel: ann.title,
      description: 'This will permanently remove the announcement from both the Student Panel and Public Home Page.',
      payload: { action: 'DELETE_ANNOUNCEMENT', id: ann.id },
      successMessage: `Announcement "${ann.title}" deleted.`,
    });
  };

  const handleSaveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onMutate({
      action: 'SAVE_NOTICE',
      ...noticeForm,
    });
    if (res.ok) {
      showToast('Official notice saved', 'success');
      setShowNoticeModal(false);
    } else {
      showToast(res.error || 'Failed to save notice', 'error');
    }
  };

  const handleSaveGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onMutate({
      action: 'SAVE_GALLERY',
      ...galleryForm,
    });
    if (res.ok) {
      showToast('Gallery item saved', 'success');
      setShowGalleryModal(false);
    } else {
      showToast(res.error || 'Failed to save gallery item', 'error');
    }
  };

  const handleSaveClassInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onMutate({
      action: 'UPDATE_SETTINGS',
      ...classInfoForm,
    });
    if (res.ok) {
      showToast('Class Union charter information updated', 'success');
    } else {
      showToast(res.error || 'Failed to update class information', 'error');
    }
  };

  const handleSendReply = async (messageId: string) => {
    if (!replyText.trim()) return;
    const res = await onMutate({
      action: 'REPLY_MESSAGE',
      messageId,
      replyText: replyText.trim(),
    });
    if (res.ok) {
      showToast('Official reply sent to student', 'success');
      setReplyingMsgId(null);
      setReplyText('');
    } else {
      showToast(res.error || 'Could not send reply', 'error');
    }
  };

  const handleDeleteStudent = (student: UserProfile) => {
    if (student.uid === 'admin_super' || student.username === 'alnibras@admin') {
      showToast('Super Administrator account cannot be deleted', 'error');
      return;
    }
    setPendingDeleteAction({
      title: 'Delete Student Account',
      itemLabel: `${student.fullName} (@${student.username} · ${student.studentId})`,
      description:
        'This will permanently delete the student account, credentials, and associated profile records. This action cannot be undone.',
      payload: { action: 'DELETE_ACCOUNT', targetUid: student.uid },
      successMessage: `Account for ${student.fullName} has been permanently deleted.`,
    });
  };

  const handleQuickPasswordReset = (student: UserProfile) => {
    setResetPasswordTarget(student);
    setQuickResetPassInput('');
  };

  const submitQuickPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordTarget) return;
    if (quickResetPassInput.trim().length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    setIsResettingPass(true);
    try {
      const res = await onMutate({
        action: 'INITIATE_PASSWORD_RESET',
        targetUid: resetPasswordTarget.uid,
        newPassword: quickResetPassInput.trim(),
        reason: 'Admin initiated password update via Student Management roster',
      });
      if (res.ok) {
        showToast(`Password successfully reset for ${resetPasswordTarget.fullName}`, 'success');
        setResetPasswordTarget(null);
        setQuickResetPassInput('');
      } else {
        showToast(res.error || 'Failed to reset password', 'error');
      }
    } finally {
      setIsResettingPass(false);
    }
  };

  // Organized Admin Sidebar Groups per Part 13
  const navGroups: {
    group: string;
    items: {
      id: AdminTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }[];
  }[] = [
    {
      group: 'DASHBOARD & EXPORT',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'exportData', label: 'Export Data (.XLSX)', icon: FileSpreadsheet },
      ],
    },
    {
      group: 'USER & COMMITTEE',
      items: [
        { id: 'students', label: 'Student Management', icon: Users },
        { id: 'committee', label: 'Committee Management', icon: Layers },
        { id: 'passwords', label: 'Password Management', icon: KeyRound },
      ],
    },
    {
      group: 'PUBLIC PAGE MANAGEMENT',
      items: [
        { id: 'homeSlideshow', label: 'Home Slideshow Management', icon: ImageIcon },
        { id: 'publicGallery', label: 'Public Photo Gallery', icon: Globe },
        { id: 'publicHomepage', label: 'Manage Public Content', icon: Home },
      ],
    },
    {
      group: 'USER PANEL MEDIA',
      items: [
        { id: 'userGallery', label: 'User Gallery Management', icon: Lock },
        { id: 'gallery', label: 'All Photos Archive', icon: ImageIcon },
      ],
    },
    {
      group: 'CONTENT & ACADEMICS',
      items: [
        { id: 'notices', label: 'Notices', icon: FileText },
        { id: 'announcements', label: 'Announcements', icon: Megaphone },
        { id: 'calendar', label: 'Calendar', icon: CalendarDays },
        { id: 'programResults', label: 'Program Results', icon: Trophy },
        { id: 'pointManagement', label: 'Student Point Management', icon: Award },
        { id: 'certificateManagement', label: 'Certificate Management', icon: FileBadge },
      ],
    },
    {
      group: 'COMMUNICATION & FEEDBACK',
      items: [
        { id: 'feedback', label: 'Feedback', icon: ThumbsUp },
        { id: 'liveMessages', label: 'Messages & Chat', icon: MessageSquareCode },
        { id: 'appointments', label: 'Appointments Desk', icon: CalendarCheck2 },
        { id: 'messages', label: 'Public Inquiries', icon: MessageSquare },
        { id: 'notifications', label: 'Notifications', icon: Bell },
      ],
    },
    {
      group: 'FINANCIAL & FINE MANAGEMENT',
      items: [
        { id: 'financialDashboard', label: 'Union Financial Management', icon: IndianRupee },
        { id: 'incomeManagement', label: 'Income Management', icon: TrendingUp },
        { id: 'expenseManagement', label: 'Expense Management', icon: TrendingDown },
        { id: 'studentContributions', label: 'Student Contributions', icon: Wallet },
        { id: 'studentDues', label: 'Student Dues', icon: CreditCard },
        { id: 'fines', label: 'Fine Management', icon: Receipt },
        { id: 'financialReports', label: 'Financial Reports', icon: BarChart3 },
      ],
    },
    {
      group: 'HISTORY, LOGS & SETTINGS',
      items: [
        { id: 'activityLogs', label: 'Audit History & Logs', icon: Activity },
        { id: 'loginHistory', label: 'Login History', icon: History },
        { id: 'accountChangeHistory', label: 'Account Change History', icon: Users },
        { id: 'officialBranding', label: 'Official Branding & Logo', icon: Sparkles },
        { id: 'classInfo', label: 'Class Information', icon: Landmark },
        { id: 'customTypes', label: 'Custom Types', icon: Sliders },
        { id: 'settings', label: 'Website Settings', icon: Settings },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);

  const financialTabMap: Partial<Record<AdminTab, FinancialSubTab>> = {
    financialDashboard: 'dashboard',
    incomeManagement: 'income',
    expenseManagement: 'expenses',
    studentContributions: 'contributions',
    studentDues: 'dues',
    financialReports: 'reports',
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2]">
      {/* Mobile Drawer Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="admin-mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Navigation - Fixed with independent scrolling & Official AL-NIBRAS Logo */}
      <aside
        aria-label="Administrator sidebar navigation"
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B3D32] text-white flex flex-col border-r border-[#D4AF37]/25 transition-transform duration-300 lg:static lg:h-full lg:shrink-0 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <OfficialLogo
            branding={state.branding}
            placement="sidebar"
            size="sm"
            showText={true}
            lightText={true}
          />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden p-1 text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="grow px-3 py-4 space-y-4 overflow-y-auto">
          {navGroups.map((grp) => (
            <div key={grp.group} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-[#D4AF37]">
                {grp.group}
              </p>
              {grp.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`relative w-full flex items-center gap-3 px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'text-[#071713] font-bold'
                        : 'text-white/85 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="admin-sidebar-active"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-[#D4AF37] shadow-xs"
                        aria-hidden="true"
                      />
                    )}
                    <Icon className="relative z-10 w-4 h-4 shrink-0" />
                    <span className="relative z-10 truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1 shrink-0">
          <button
            type="button"
            onClick={onSwitchToPublic}
            className="w-full flex items-center gap-3 px-3.5 py-2 text-xs font-medium text-white/85 hover:bg-white/10 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4 shrink-0 text-[#D4AF37]" />
            <span>Public Homepage</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2 text-xs font-medium text-red-300 hover:bg-red-950/50 hover:text-red-200 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Workspace - Only this container scrolls vertically */}
      <div className="grow flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Workspace Top Header */}
        <header className="sticky top-0 z-30 bg-white dark:bg-[#0D231D] border-b border-[#E5EAE6] dark:border-[#1B3B31] px-4 lg:px-5 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 shrink">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 text-[#17221F] dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-[#718078] dark:text-[#9AB0A6] truncate">
              <span className="hidden 2xl:inline">Al-Nibras Admin</span>
              <span className="2xl:hidden">Admin</span>
              <span aria-hidden="true" className="mx-1.5">
                /
              </span>
              <span className="font-bold text-[#064E3B] dark:text-[#D4AF37]">
                {allNavItems.find((i) => i.id === activeTab)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LiveDateTimeClock variant="header" />
            <PortalHeaderSearch
              viewerRole="admin"
              state={state}
              onSelectResult={(result) => {
                if (result.kind === 'announcement') {
                  setActiveTab('announcements');
                } else if (result.kind === 'notice') {
                  setActiveTab('notices');
                } else if (result.kind === 'user') {
                  if (result.userSource === 'committee') {
                    setActiveTab('committee');
                  } else {
                    const matched = state.users.find((u) => u.uid === result.id);
                    setStudentSearch(result.title);
                    setActiveTab('students');
                    if (matched) setViewingStudent(matched);
                  }
                }
              }}
            />
            <span className="sm:hidden">
              <ThemeToggle compact />
            </span>
            <span className="hidden sm:inline-flex">
              <ThemeToggle />
            </span>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifDropdownOpen((prev) => !prev)}
                aria-label="Notifications"
                className="group relative p-2 text-slate-600 dark:text-[#9AB0A6] hover:text-[#0B192C] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors inline-flex items-center whitespace-nowrap press-scale cursor-pointer"
              >
                <Bell className="w-4 h-4 shrink-0 group-hover-bounce" />
                {unreadNotifCount > 0 && (
                  <span className="ml-1 text-[11px] font-mono-tabular font-bold text-[#B48A3E] dark:text-[#D4AF37]">
                    ({unreadNotifCount})
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.16, ease: ALNIBRAS_EASE }}
                    className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-[#0B192C] text-white flex items-center justify-between">
                      <span className="text-xs font-semibold">
                        Portal Notifications ({unreadNotifCount} unread)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void onMutate({ action: 'MARK_ALL_NOTIFICATIONS_READ' });
                        }}
                        className="text-[11px] text-[#C5A059] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1B3B31]">
                      {state.notifications.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500 text-center">
                          No notifications recorded.
                        </p>
                      ) : (
                        state.notifications.map((n) => {
                          const isUnread = isNotificationUnreadForUser(n, currentUser.uid);
                          return (
                            <div
                              key={n.id}
                              className={`p-3.5 text-xs space-y-1 ${
                                isUnread
                                  ? 'bg-[#FAF9F5] dark:bg-[#071713]'
                                  : 'bg-white dark:bg-[#0D231D]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[#0B192C] dark:text-white">
                                  {n.title}
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isUnread && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void onMutate({
                                          action: 'MARK_NOTIFICATION_READ',
                                          notificationId: n.id,
                                        });
                                      }}
                                      className="text-[11px] text-[#B48A3E] dark:text-[#D4AF37] hover:underline cursor-pointer"
                                    >
                                      Mark read
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPendingDeleteAction({
                                        title: 'Delete Notification',
                                        itemLabel: n.title,
                                        description: 'This will remove the notification from the portal alert stream.',
                                        payload: { action: 'DELETE_NOTIFICATION', id: n.id },
                                        successMessage: 'Notification deleted.',
                                      });
                                    }}
                                    title="Delete notification"
                                    aria-label={`Delete notification ${n.title}`}
                                    className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-slate-600 dark:text-[#9AB0A6]">{n.message}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Admin Profile Badge with Official Al-Nibras Logo */}
            <div
              data-testid="admin-header-profile-logo"
              className="flex items-center gap-2.5 pl-3 border-l border-slate-200 dark:border-[#1B3B31]"
            >
              <div className="transition-transform duration-200 hover:scale-105">
                <OfficialLogo
                  branding={state.branding}
                  placement="dashboard"
                  size="sm"
                  showText={false}
                />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold text-[#0B192C] dark:text-white leading-none">
                  {currentUser.fullName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#9AB0A6] font-mono-tabular mt-0.5">
                  {currentUser.username}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Viewport Content with Smooth Tab Transitions */}
        <main className="p-6 lg:p-8 space-y-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: ALNIBRAS_EASE }}
              className="space-y-8"
            >
          {/* 1. DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl lg:text-3xl font-serif-display font-bold text-[#0B192C] dark:text-white">
                    Executive Union Overview
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-[#9AB0A6] mt-0.5">
                    Welcome back, {currentUser.fullName} ({currentUser.username}) ·{' '}
                    {state.settings.academicSession}
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <RippleButton
                    onClick={() => {
                      setActiveTab('students');
                      setShowCreateStudentModal(true);
                    }}
                    className="hover-lift px-3.5 py-2 bg-[#0B192C] hover:bg-[#162944] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>New Student Account</span>
                  </RippleButton>
                  <RippleButton
                    onClick={() => setActiveTab('financialDashboard')}
                    className="hover-lift px-3.5 py-2 bg-[#C5A059] hover:bg-[#d4b06a] text-[#0B192C] text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <IndianRupee className="w-3.5 h-3.5" />
                    <span>Financial Ledger (₹)</span>
                  </RippleButton>
                  <RippleButton
                    onClick={() => {
                      setAnnForm({
                        id: '',
                        title: '',
                        content: '',
                        category: 'Academic Convocation',
                        status: 'published',
                        priority: 'normal',
                      });
                      setActiveTab('announcements');
                      setShowAnnModal(true);
                    }}
                    className="hover-lift px-3.5 py-2 bg-white dark:bg-[#0D231D] hover:bg-slate-50 dark:hover:bg-[#112A22] text-[#0B192C] dark:text-[#F0F5F2] border border-slate-300 dark:border-[#1B3B31] text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Megaphone className="w-3.5 h-3.5 text-[#B48A3E] dark:text-[#D4AF37]" />
                    <span>Publish Announcement</span>
                  </RippleButton>
                </div>
              </div>

              {/* Executive Summary Stats Widget: Live Day/Date/Time, Active Users, Calendar & Inquiries */}
              <div
                data-testid="admin-summary-stats-widget"
                className="relative overflow-hidden p-5 bg-[#0B192C] text-white rounded-xl border border-[#C5A059]/35 shadow-sm"
              >
                <AmbientBackground />
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-white/10">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#C5A059]">
                      Executive Summary Stats Widget
                    </p>
                    <h2 className="text-base font-serif-display font-bold text-white">
                      Real-Time Institutional Pulse &amp; Operational Readiness
                    </h2>
                  </div>
                  <LiveDateTimeClock variant="banner" />
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Metric 1: Total Active Users */}
                  <div className="hover-lift p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">
                        Total Active Users
                      </p>
                      <p className="text-3xl font-serif-display font-bold text-[#C5A059] font-mono-tabular mt-1">
                        <AnimatedCounter value={metrics.activeAccounts} />
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 font-mono-tabular">
                        {metrics.totalStudents} Scholars · 1 Super Admin
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('students')}
                      className="press-scale px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
                    >
                      Directory
                    </button>
                  </div>

                  {/* Metric 2: Published Notices & Calendar Schedule */}
                  <div className="hover-lift p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">
                        Notices &amp; Calendar Dates
                      </p>
                      <p className="text-3xl font-serif-display font-bold text-white font-mono-tabular mt-1">
                        <AnimatedCounter value={metrics.publishedNoticesCount} />
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 font-mono-tabular">
                        {metrics.publishedNoticesCount} Published Notices · {metrics.upcomingCalendarEventsCount} Calendar Dates
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('calendar')}
                      className="press-scale px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
                    >
                      Calendar
                    </button>
                  </div>

                  {/* Metric 3: Unresolved Public Inquiries */}
                  <div className="hover-lift p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">
                        Unresolved Public Inquiries
                      </p>
                      <p className="text-3xl font-serif-display font-bold text-amber-400 font-mono-tabular mt-1">
                        <AnimatedCounter value={metrics.unresolvedInquiriesCount} />
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 font-mono-tabular">
                        Awaiting Secretariat Reply ({state.messages.length} total)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('messages')}
                      className="press-scale px-3 py-1.5 rounded-lg bg-[#C5A059] hover:bg-[#d4b06a] text-[#0B192C] text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      Respond
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary 9-Metric KPI Grid (All Currency in INR ₹) */}
              <StaggerGrid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('students')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-[#C5A059]/60 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Total Students</p>
                    <p className="text-2xl font-serif-display font-bold text-[#0B192C] dark:text-white font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.totalStudents} />
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-[#9AB0A6] mt-0.5 font-mono-tabular">
                      Enrolled Scholars
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('students')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-[#C5A059]/60 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Active Accounts</p>
                    <p className="text-2xl font-serif-display font-bold text-emerald-700 dark:text-emerald-400 font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.activeAccounts} />
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-[#9AB0A6] mt-0.5 font-mono-tabular">
                      {metrics.inactiveAccounts} Inactive
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('fines')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-amber-300 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Unpaid Fines (INR)</p>
                    <p className="text-2xl font-serif-display font-bold text-amber-700 dark:text-amber-400 font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.totalUnpaidFines} />
                    </p>
                    <p className="text-[11px] text-amber-600 dark:text-amber-300 mt-0.5 font-mono-tabular">
                      {formatINR(metrics.totalUnpaidFineAmount)} Outstanding
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('fines')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-emerald-300 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Paid Fines (INR)</p>
                    <p className="text-2xl font-serif-display font-bold text-emerald-700 dark:text-emerald-400 font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.totalPaidFines} />
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-300 mt-0.5 font-mono-tabular">
                      {formatINR(metrics.totalPaidFineAmount)} Settled
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('programResults')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-[#C5A059]/60 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Upcoming Programs</p>
                    <p className="text-2xl font-serif-display font-bold text-[#0B192C] dark:text-white font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.upcomingProgramsCount} />
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-[#9AB0A6] mt-0.5 font-mono-tabular">
                      Competitions &amp; Programs
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('programResults')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-[#C5A059]/60 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Published Results</p>
                    <p className="text-2xl font-serif-display font-bold text-[#B48A3E] dark:text-[#D4AF37] font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.publishedProgramResultsCount} />
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-[#9AB0A6] mt-0.5 font-mono-tabular">
                      Recorded Competitions
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('messages')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-blue-300 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Unread Messages</p>
                    <p className="text-2xl font-serif-display font-bold text-blue-700 dark:text-sky-400 font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.unreadMessagesCount} />
                    </p>
                    <p className="text-[11px] text-blue-600 dark:text-sky-300 mt-0.5 font-mono-tabular">
                      Student Inquiries &amp; Chat
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('calendar')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-[#C5A059]/60 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Calendar Dates</p>
                    <p className="text-2xl font-serif-display font-bold text-[#0B192C] dark:text-white font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.upcomingCalendarEventsCount} />
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-[#9AB0A6] mt-0.5 font-mono-tabular">
                      Scheduled in Union
                    </p>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('accountChangeHistory')}
                    className="group p-4 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl hover:border-[#C5A059]/60 transition-colors cursor-pointer"
                  >
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-[#9AB0A6] uppercase tracking-wider">Account Changes</p>
                    <p className="text-2xl font-serif-display font-bold text-purple-700 dark:text-purple-400 font-mono-tabular mt-1">
                      <AnimatedCounter value={metrics.recentAccountChangesCount} />
                    </p>
                    <p className="text-[11px] text-purple-600 dark:text-purple-300 mt-0.5 font-mono-tabular">
                      Recent Resets / Edits
                    </p>
                  </InteractiveCard>
                </StaggerItem>
              </StaggerGrid>

              {/* Chart.js Statistics Section */}
              <AdminStatsChart
                users={state.users}
                activityLogs={state.activityLogs}
                publishedAnnouncements={metrics.publishedAnnouncementsCount}
                draftAnnouncements={metrics.draftAnnouncementsCount}
                publishedNotices={metrics.publishedNoticesCount}
              />

              {/* Recent Activities Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#0B192C]">
                      Recent Portal Activities
                    </h2>
                    <p className="text-xs text-slate-500">
                      Live security and content audit trail across the Class Union ({filteredLogs.length} matching records)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('activityLogs')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0B192C] bg-[#FAF9F5] border border-[#C5A059]/40 rounded-lg hover:bg-[#C5A059]/15 transition-colors cursor-pointer self-start sm:self-auto"
                  >
                    <Activity className="w-3.5 h-3.5 text-[#C5A059]" />
                    View Full Audit Log
                  </button>
                </div>

                {/* Quick Dashboard Search & Date-Range Filter Strip */}
                <div className="px-6 py-3 bg-[#FAF9F5]/70 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-5 relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      aria-label="Filter recent dashboard logs"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="Quick search logs by actor, action, or details..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-500 shrink-0">From:</span>
                    <input
                      type="date"
                      aria-label="Dashboard log start date"
                      value={logStartDate}
                      onChange={(e) => setLogStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-500 shrink-0">To:</span>
                    <input
                      type="date"
                      aria-label="Dashboard log end date"
                      value={logEndDate}
                      onChange={(e) => setLogEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    {(logSearch || logStartDate || logEndDate || logTypeFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={handleResetLogFilters}
                        className="text-[11px] font-semibold text-slate-600 hover:text-[#0B192C] underline cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Activity Type</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4 text-right">Timestamp</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredLogs.slice(0, 6).map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-semibold text-[#0B192C]">
                            {log.actorName}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-600">
                            {log.actionType}
                          </td>
                          <td className="py-3 px-4 text-slate-700">{log.details}</td>
                          <td className="py-3 px-4 text-right font-mono-tabular text-slate-500">
                            {formatIndiaDateTime(log.createdAt)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDeleteAction({
                                  title: 'Delete Activity Log Entry',
                                  itemLabel: `${log.actionType} · ${log.details}`,
                                  description: 'This will remove the selected activity log record from the portal audit trail.',
                                  payload: { action: 'DELETE_ACTIVITY_LOG', id: log.id },
                                  successMessage: 'Activity log entry deleted.',
                                })
                              }
                              title="Delete log entry"
                              aria-label={`Delete log ${log.id}`}
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 px-4 text-center text-xs text-slate-500">
                            No activity logs match the selected search or date range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. STUDENT MANAGEMENT */}
          {activeTab === 'students' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                    Student Union Directory &amp; Account Management
                  </h1>
                  <p className="text-xs text-slate-500">
                    Centralized SUPER ADMIN management of student profiles, residential addresses, photos, and financial records
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateStudentModal(true)}
                  className="px-4 py-2.5 bg-[#0B192C] hover:bg-[#162944] text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#C5A059]" />
                  <span>Create Student Union Account</span>
                </button>
              </div>

              {/* Search and Status Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-xl">
                <div className="relative grow max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Search students by name, username, student ID, or roll number"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search by name, @username, Student ID, or Roll No..."
                    className="w-full pl-10 pr-4 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                  />
                </div>

                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                  {(['all', 'active', 'inactive'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStudentStatusFilter(st)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize cursor-pointer ${
                        studentStatusFilter === st
                          ? 'bg-[#0B192C] text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st === 'all' ? 'All Accounts' : st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Students Data Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Scholar</th>
                        <th className="py-3 px-4">Username</th>
                        <th className="py-3 px-4">Student ID / Roll</th>
                        <th className="py-3 px-4">Class / Batch</th>
                        <th className="py-3 px-4">District / State</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredStudentList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            No matching student records found.
                          </td>
                        </tr>
                      ) : (
                        filteredStudentList.map((student) => (
                          <tr key={student.uid} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full overflow-hidden border border-slate-200 shrink-0">
                                  <SafeImage
                                    src={student.avatarUrl}
                                    alt={student.fullName}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div>
                                  <p className="font-semibold text-[#0B192C]">
                                    {student.fullName}
                                  </p>
                                  <p className="text-[11px] text-slate-500">
                                    {student.contactPhone || student.contactEmail || 'No email'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-700">
                              @{student.username}
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-700">
                              {student.studentId} · Roll #{student.rollNumber}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {student.classInfo || '11th Batch of DHBC'}
                            </td>
                            <td className="py-3 px-4 text-slate-500">
                              {student.address?.district
                                ? `${student.address.district}, ${student.address.state}`
                                : 'Kozhikode, Kerala'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`font-semibold capitalize ${
                                  student.status === 'active'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {student.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setViewingStudent(student)}
                                  aria-label={`View profile of ${student.fullName}`}
                                  title="View Full Dossier & Address"
                                  className="p-1.5 text-slate-600 hover:text-[#0B192C] hover:bg-slate-100 rounded-md cursor-pointer"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFinancialProfileStudent(student)}
                                  aria-label={`Financial statement of ${student.fullName}`}
                                  title="View Financial Profile (INR)"
                                  className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-md cursor-pointer"
                                >
                                  <IndianRupee className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditStudentModal(student)}
                                  aria-label={`Edit profile of ${student.fullName}`}
                                  title="Edit Profile & Address"
                                  className="p-1.5 text-slate-600 hover:text-[#0B192C] hover:bg-slate-100 rounded-md cursor-pointer"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleToggleStudentStatus(student)}
                                  aria-label={
                                    student.status === 'active'
                                      ? `Deactivate ${student.fullName}`
                                      : `Activate ${student.fullName}`
                                  }
                                  title={student.status === 'active' ? 'Deactivate Account' : 'Activate Account'}
                                  className="p-1.5 text-slate-600 hover:text-[#0B192C] hover:bg-slate-100 rounded-md cursor-pointer"
                                >
                                  {student.status === 'active' ? (
                                    <UserX className="w-4 h-4 text-amber-700" />
                                  ) : (
                                    <UserCheck className="w-4 h-4 text-emerald-700" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleQuickPasswordReset(student)}
                                  aria-label={`Reset password for ${student.fullName}`}
                                  title="Reset Password"
                                  className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-md cursor-pointer"
                                >
                                  <KeyRound className="w-4 h-4 text-amber-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedAccountForActivity(student)}
                                  aria-label={`Activity history for ${student.fullName}`}
                                  title="Activity History"
                                  className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                                >
                                  <History className="w-4 h-4 text-blue-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteStudent(student)}
                                  aria-label={`Delete account for ${student.fullName}`}
                                  title="Delete Account"
                                  className="p-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. ANNOUNCEMENTS MANAGEMENT */}
          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                    Official Announcements Management
                  </h1>
                  <p className="text-xs text-slate-500">
                    Published announcements appear immediately in the Student Panel and Public Home Page
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAnnForm({
                      id: '',
                      title: '',
                      content: '',
                      category: 'Academic Convocation',
                      status: 'published',
                      priority: 'normal',
                    });
                    setShowAnnModal(true);
                  }}
                  className="px-4 py-2.5 bg-[#0B192C] hover:bg-[#162944] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#C5A059]" />
                  <span>New Announcement</span>
                </button>
              </div>

              <div className="space-y-4">
                {state.announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-start justify-between gap-6"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-[#B48A3E]">{ann.category}</span>
                        <span>·</span>
                        <span
                          className={`font-semibold capitalize ${
                            ann.status === 'published' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {ann.status}
                        </span>
                        <span>·</span>
                        <span className="capitalize">Priority: {ann.priority}</span>
                        <span>·</span>
                        <span className="font-mono-tabular">
                          {formatIndiaDate(ann.createdAt)}
                        </span>
                      </div>
                      <h3 className="text-lg font-serif-display font-bold text-[#0B192C]">
                        {ann.title}
                      </h3>
                      <p className="text-sm text-slate-700 leading-relaxed">{ann.content}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleAnnouncementPublish(ann)}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                      >
                        {ann.status === 'published' ? 'Unpublish to Draft' : 'Publish Now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnnForm({
                            id: ann.id,
                            title: ann.title,
                            content: ann.content,
                            category: ann.category,
                            status: ann.status,
                            priority: ann.priority,
                          });
                          setShowAnnModal(true);
                        }}
                        aria-label={`Edit ${ann.title}`}
                        className="p-2 text-slate-600 hover:text-[#0B192C] border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnnouncement(ann)}
                        aria-label={`Delete ${ann.title}`}
                        className="p-2 text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. NOTICES MANAGEMENT */}
          {activeTab === 'notices' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                    Notice Board Management
                  </h1>
                  <p className="text-xs text-slate-500">
                    Manage formal administrative circulars and examination seating directives
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNoticeForm({
                      id: '',
                      title: '',
                      content: '',
                      referenceCode: `CIR-AN/2026/${Math.floor(110 + Math.random() * 800)}`,
                      effectiveDate: 'November 20, 2026',
                      status: 'published',
                    });
                    setShowNoticeModal(true);
                  }}
                  className="px-4 py-2.5 bg-[#0B192C] hover:bg-[#162944] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#C5A059]" />
                  <span>Issue Official Notice</span>
                </button>
              </div>

              <div className="space-y-4">
                {state.notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-start justify-between gap-6"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono-tabular">
                        <span className="font-semibold text-[#0B192C]">
                          {notice.referenceCode}
                        </span>
                        <span>·</span>
                        <span
                          className={`font-sans font-semibold capitalize ${
                            notice.status === 'published' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {notice.status}
                        </span>
                        <span>·</span>
                        <span>Effective: {notice.effectiveDate}</span>
                      </div>
                      <h3 className="text-base font-semibold text-[#0B192C]">
                        {notice.title}
                      </h3>
                      <p className="text-sm text-slate-700 leading-relaxed">{notice.content}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setNoticeForm({
                            id: notice.id,
                            title: notice.title,
                            content: notice.content,
                            referenceCode: notice.referenceCode,
                            effectiveDate: notice.effectiveDate,
                            status: notice.status,
                          });
                          setShowNoticeModal(true);
                        }}
                        aria-label={`Edit ${notice.title}`}
                        className="p-2 text-slate-600 hover:text-[#0B192C] border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDeleteAction({
                            title: 'Delete Official Notice',
                            itemLabel: `${notice.referenceCode} · ${notice.title}`,
                            description: 'This will permanently delete the circular notice from the portal.',
                            payload: { action: 'DELETE_NOTICE', id: notice.id },
                            successMessage: `Notice "${notice.title}" deleted.`,
                          })
                        }
                        aria-label={`Delete ${notice.title}`}
                        className="p-2 text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. CLASS INFORMATION */}
          {activeTab === 'classInfo' && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                  Class Union Charter &amp; Institutional Information
                </h1>
                <p className="text-xs text-slate-500">
                  Changes saved here update the Public Home Page and Student Portal in real time
                </p>
              </div>

              <form
                onSubmit={handleSaveClassInfo}
                className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="union-name-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Union Name
                    </label>
                    <input
                      id="union-name-input"
                      type="text"
                      value={classInfoForm.unionName}
                      onChange={(e) =>
                        setClassInfoForm({ ...classInfoForm, unionName: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="academic-session-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Academic Session
                    </label>
                    <input
                      id="academic-session-input"
                      type="text"
                      value={classInfoForm.academicSession}
                      onChange={(e) =>
                        setClassInfoForm({ ...classInfoForm, academicSession: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="union-motto-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Official Motto
                  </label>
                  <input
                    id="union-motto-input"
                    type="text"
                    value={classInfoForm.motto}
                    onChange={(e) =>
                      setClassInfoForm({ ...classInfoForm, motto: e.target.value })
                    }
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="union-mission-input"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Mission Statement
                  </label>
                  <textarea
                    id="union-mission-input"
                    rows={4}
                    value={classInfoForm.missionStatement}
                    onChange={(e) =>
                      setClassInfoForm({ ...classInfoForm, missionStatement: e.target.value })
                    }
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="faculty-advisor-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Faculty Advisor
                    </label>
                    <input
                      id="faculty-advisor-input"
                      type="text"
                      value={classInfoForm.facultyAdvisor}
                      onChange={(e) =>
                        setClassInfoForm({ ...classInfoForm, facultyAdvisor: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="union-president-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Union President
                    </label>
                    <input
                      id="union-president-input"
                      type="text"
                      value={classInfoForm.unionPresident}
                      onChange={(e) =>
                        setClassInfoForm({ ...classInfoForm, unionPresident: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="general-secretary-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      General Secretary
                    </label>
                    <input
                      id="general-secretary-input"
                      type="text"
                      value={classInfoForm.generalSecretary}
                      onChange={(e) =>
                        setClassInfoForm({ ...classInfoForm, generalSecretary: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="office-location-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Secretariat Office Location
                    </label>
                    <input
                      id="office-location-input"
                      type="text"
                      value={classInfoForm.officeLocation}
                      onChange={(e) =>
                        setClassInfoForm({ ...classInfoForm, officeLocation: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="office-email-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Secretariat Official Email
                    </label>
                    <input
                      id="office-email-input"
                      type="email"
                      value={classInfoForm.officeEmail}
                      onChange={(e) =>
                        setClassInfoForm({ ...classInfoForm, officeEmail: e.target.value })
                      }
                      className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#0B192C] hover:bg-[#162944] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Save Charter Information
                </button>
              </form>
            </div>
          )}

          {/* 7. GALLERY MANAGEMENT (PUBLIC, USER PANEL, AND ALL PHOTOS) */}
          {(activeTab === 'gallery' ||
            activeTab === 'publicGallery' ||
            activeTab === 'userGallery') && (
            <div className="space-y-6">
              {(() => {
                const targetDest: 'ALL' | MediaDestination =
                  activeTab === 'publicGallery'
                    ? 'public'
                    : activeTab === 'userGallery'
                    ? 'user'
                    : 'ALL';
                const displayedPhotos = state.gallery.filter((g) => {
                  if (targetDest === 'ALL') return true;
                  return (g.destination || 'public') === targetDest;
                });

                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6">
                      <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[#17221F] dark:text-white">
                          {activeTab === 'publicGallery'
                            ? 'Public Photo Gallery Management'
                            : activeTab === 'userGallery'
                            ? 'User Panel Photo Gallery Management'
                            : 'Photo Gallery Management (All Destinations)'}
                        </h1>
                        <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-0.5">
                          {activeTab === 'publicGallery'
                            ? 'Photos published here appear on the Public Homepage without login.'
                            : activeTab === 'userGallery'
                            ? 'Photos published here appear exclusively inside the logged-in Student Portal.'
                            : 'Manage both Public Page and User Panel photographs. Click any image to preview in the Lightbox.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryForm({
                            id: '',
                            title: '',
                            caption: '',
                            imageUrl: '/images/union_hall_symposium.jpg',
                            category: 'Academic Symposium',
                            status: 'published',
                            destination: targetDest === 'user' ? 'user' : 'public',
                          });
                          setShowGalleryModal(true);
                        }}
                        className="px-4 py-2.5 bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-4 h-4 text-[#D4AF37]" />
                        <span>
                          Upload {targetDest === 'user' ? 'User Panel' : 'Public'} Photo
                        </span>
                      </button>
                    </div>

                    {displayedPhotos.length === 0 ? (
                      <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-12 text-center">
                        <ImageIcon className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-60" />
                        <p className="text-sm font-bold">No photos uploaded yet.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {displayedPhotos.map((item, idx) => (
                          <div
                            key={item.id}
                            className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl overflow-hidden flex flex-col justify-between shadow-xs"
                          >
                            <div>
                              <div
                                onClick={() => setAdminLightboxIndex(idx)}
                                className="aspect-4/3 bg-slate-900 overflow-hidden relative cursor-pointer group"
                              >
                                <SafeImage
                                  src={item.imageUrl}
                                  alt={item.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <span
                                  className={`absolute top-3 left-3 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    (item.destination || 'public') === 'public'
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-amber-600 text-white'
                                  }`}
                                >
                                  {(item.destination || 'public') === 'public'
                                    ? 'Public Page'
                                    : 'User Panel'}
                                </span>
                              </div>
                              <div className="p-4 space-y-1.5">
                                <div className="text-xs text-[#718078]">
                                  <span className="font-bold text-[#064E3B] dark:text-[#D4AF37]">
                                    {item.category}
                                  </span>
                                  <span className="mx-1.5">·</span>
                                  <span className="capitalize">{item.status}</span>
                                </div>
                                <h3 className="text-sm font-bold text-[#17221F] dark:text-white">
                                  {item.title}
                                </h3>
                                <p className="text-xs text-[#718078] dark:text-[#9AB0A6] leading-relaxed">
                                  {item.caption}
                                </p>
                              </div>
                            </div>
                            <div className="p-4 pt-0 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setGalleryForm({
                                    id: item.id,
                                    title: item.title,
                                    caption: item.caption,
                                    imageUrl: item.imageUrl,
                                    category: item.category,
                                    status: item.status,
                                    destination: item.destination || 'public',
                                  });
                                  setShowGalleryModal(true);
                                }}
                                className="px-3 py-1 text-xs border border-[#E5EAE6] dark:border-[#1B3B31] rounded-md hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingDeleteAction({
                                    title: 'Delete Gallery Photograph',
                                    itemLabel: item.title,
                                    description:
                                      'This will permanently remove the photograph from the Gallery.',
                                    payload: { action: 'DELETE_GALLERY', id: item.id },
                                    successMessage: `Gallery item "${item.title}" removed.`,
                                  })
                                }
                                className="px-3 py-1 text-xs text-red-600 border border-[#E5EAE6] dark:border-[#1B3B31] rounded-md hover:bg-red-50 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <PhotoLightboxModal
                      items={displayedPhotos}
                      currentIndex={adminLightboxIndex}
                      onClose={() => setAdminLightboxIndex(null)}
                      onNavigate={(nextIdx) => setAdminLightboxIndex(nextIdx)}
                    />
                  </>
                );
              })()}
            </div>
          )}

          {/* 10. INQUIRIES (MESSAGES) */}
          {activeTab === 'messages' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                  Secretariat Communications &amp; Public Inquiries
                </h1>
                <p className="text-xs text-slate-500">
                  Review messages from enrolled scholars and public visitors
                </p>
              </div>

              <div className="space-y-4">
                {state.messages.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
                    No messages in the secretariat inbox.
                  </div>
                ) : (
                  state.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-6 bg-white border border-slate-200 rounded-xl space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div>
                          <span className="font-semibold text-[#0B192C]">{msg.senderName}</span>
                          <span className="mx-1.5">·</span>
                          <span className="capitalize font-semibold text-[#B48A3E]">
                            {msg.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono-tabular">
                            {formatIndiaDateTime(msg.createdAt)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingDeleteAction({
                                title: 'Delete Inquiry Message',
                                itemLabel: `${msg.subject} (from ${msg.senderName})`,
                                description: 'This will permanently remove this inquiry from the Secretariat inbox.',
                                payload: { action: 'DELETE_MESSAGE', id: msg.id },
                                successMessage: 'Inquiry message deleted.',
                              })
                            }
                            aria-label={`Delete inquiry ${msg.subject}`}
                            title="Delete Inquiry"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-base font-semibold text-[#0B192C]">{msg.subject}</h3>
                      <p className="text-sm text-slate-700 leading-relaxed">{msg.body}</p>

                      {msg.replyText && (
                        <div className="p-4 bg-[#FAF9F5] border border-slate-200 rounded-lg text-xs space-y-1">
                          <p className="font-semibold text-[#0B192C]">
                            Official Secretariat Response:
                          </p>
                          <p className="text-slate-700">{msg.replyText}</p>
                        </div>
                      )}

                      {replyingMsgId === msg.id ? (
                        <div className="pt-2 space-y-2">
                          <textarea
                            rows={3}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write official response..."
                            className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSendReply(msg.id)}
                              className="px-4 py-1.5 bg-[#0B192C] text-white text-xs font-semibold rounded-lg cursor-pointer"
                            >
                              Send Response
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setReplyingMsgId(null);
                                setReplyText('');
                              }}
                              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingMsgId(msg.id);
                              setReplyText(msg.replyText || '');
                            }}
                            className="text-xs font-semibold text-[#0B192C] hover:text-[#B48A3E] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Reply className="w-3.5 h-3.5" />
                            <span>{msg.replyText ? 'Update Reply' : 'Reply to Inquiry'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 10B. APPOINTMENTS DESK */}
          {activeTab === 'appointments' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-serif-display font-bold text-[#0B192C] dark:text-[#F0F5F2]">
                  Secretariat Appointments Desk
                </h1>
                <p className="text-xs text-slate-500 dark:text-[#9AB0A6]">
                  Review, confirm, complete, or manage scheduled appointments submitted through the portal and Supabase backend
                </p>
              </div>

              <div className="space-y-4">
                {!state.appointments || state.appointments.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl text-sm text-slate-500 dark:text-[#9AB0A6]">
                    No appointment bookings recorded yet.
                  </div>
                ) : (
                  state.appointments.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-6 bg-white dark:bg-[#0D231D] border border-slate-200 dark:border-[#1B3B31] rounded-xl space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-[#9AB0A6]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[#0B192C] dark:text-white text-sm">
                            {appt.fullName}
                          </span>
                          <span>·</span>
                          <span>{appt.email}</span>
                          <span>·</span>
                          <span>{appt.phone}</span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            appt.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                              : appt.status === 'completed'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300'
                              : appt.status === 'cancelled'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}
                        >
                          {appt.status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-[#064E3B] dark:text-[#D4AF37]">
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {appt.preferredDate} at {appt.preferredTime}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {appt.department}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-[#0B192C] dark:text-[#F0F5F2]">
                          {appt.purpose}
                        </h3>
                        {appt.notes && (
                          <p className="text-xs text-slate-600 dark:text-[#9AB0A6] mt-1">
                            {appt.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-[#1B3B31]">
                        {appt.status !== 'confirmed' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleAdminMutate(
                                { action: 'UPDATE_APPOINTMENT_STATUS', appointmentId: appt.id, status: 'confirmed' },
                                'Appointment confirmed.'
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-[#064E3B] text-white text-xs font-semibold cursor-pointer hover:bg-[#0B3D32]"
                          >
                            Confirm
                          </button>
                        )}
                        {appt.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleAdminMutate(
                                { action: 'UPDATE_APPOINTMENT_STATUS', appointmentId: appt.id, status: 'completed' },
                                'Appointment marked completed.'
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-sky-700 text-white text-xs font-semibold cursor-pointer hover:bg-sky-800"
                          >
                            Mark Completed
                          </button>
                        )}
                        {appt.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleAdminMutate(
                                { action: 'UPDATE_APPOINTMENT_STATUS', appointmentId: appt.id, status: 'cancelled' },
                                'Appointment cancelled.'
                              )
                            }
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#1B3B31] text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setPendingDeleteAction({
                              title: 'Delete Appointment Booking',
                              itemLabel: `${appt.fullName} — ${appt.purpose}`,
                              description: 'This permanently deletes the appointment record.',
                              payload: { action: 'DELETE_APPOINTMENT', appointmentId: appt.id },
                              successMessage: 'Appointment deleted.',
                            })
                          }
                          className="ml-auto p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                          aria-label={`Delete appointment for ${appt.fullName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 11. NOTIFICATIONS MANAGEMENT */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                    Notifications Stream
                  </h1>
                  <p className="text-xs text-slate-500">
                    Manage portal-wide alerts and notification records
                  </p>
                </div>
                {unreadNotifCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void onMutate({ action: 'MARK_ALL_NOTIFICATIONS_READ' })}
                    className="px-4 py-2 bg-[#0B192C] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCheck className="w-4 h-4 text-[#C5A059]" />
                    <span>Mark All Read</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {state.notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-5 bg-white border border-slate-200 rounded-xl flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-[#0B192C]">{n.title}</h3>
                      <p className="text-xs text-slate-600">{n.message}</p>
                      <p className="text-[11px] font-mono-tabular text-slate-400">
                        {formatIndiaDateTime(n.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDeleteAction({
                          title: 'Delete Notification',
                          itemLabel: n.title,
                          description: 'This will remove the notification from the portal stream.',
                          payload: { action: 'DELETE_NOTIFICATION', id: n.id },
                          successMessage: 'Notification deleted.',
                        })
                      }
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 12. CERTIFICATE MANAGEMENT */}
          {activeTab === 'certificateManagement' && (
            <div className="space-y-6">
              <div className="bg-[#0B192C] text-white rounded-xl p-6 border border-[#C5A059]/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <OfficialLogo
                    branding={state.branding}
                    placement="certificates"
                    size="md"
                    showText={false}
                  />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#C5A059]">
                      Official A4 Landscape Certificate Registry
                    </p>
                    <h1 className="text-2xl font-serif-display font-bold">
                      Certificate Management
                    </h1>
                    <p className="text-xs text-slate-300 mt-1">
                      Navy Blue &amp; Gold Ribbon Design · Dynamic Position Badges (1ST, 2ND, 3RD POSITION) · Zero QR Codes
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('programResults')}
                  className="px-4 py-2.5 bg-[#C5A059] text-[#0B192C] text-xs font-bold rounded-lg cursor-pointer shrink-0"
                >
                  Issue via Program Results
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(state.certificates || []).map((cert) => (
                  <div
                    key={cert.id}
                    className="p-5 bg-white border border-slate-200 rounded-xl flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono-tabular font-bold text-[#B48A3E]">
                          {cert.certificateNumber}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px]">
                          {cert.position === '1st Place'
                            ? '1ST POSITION'
                            : cert.position === '2nd Place'
                            ? '2ND POSITION'
                            : cert.position === '3rd Place'
                            ? '3RD POSITION'
                            : cert.position}
                        </span>
                      </div>
                      <h3 className="text-base font-serif-display font-bold text-[#0B192C]">
                        {cert.studentName} ({cert.studentId})
                      </h3>
                      <p className="text-xs text-slate-600">
                        Program: <span className="font-semibold text-[#0B192C]">{cert.programName}</span> · Grade: {cert.grade}
                      </p>
                      <p className="text-[11px] font-mono-tabular text-slate-400">
                        Program Date: {cert.programDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setPreviewCertificate(cert)}
                        className="flex-1 py-2 px-3 rounded-lg border border-slate-200 bg-[#FAF9F5] hover:bg-slate-100 text-xs font-semibold text-[#0B192C] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#B48A3E]" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadCertificateAsPdf(cert, state.certificateSettings, state.branding)
                        }
                        className="flex-1 py-2 px-3 rounded-lg bg-[#0B192C] hover:bg-[#162944] text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <FileBadge className="w-3.5 h-3.5 text-[#C5A059]" />
                        Download PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 13. CUSTOM TYPES MANAGEMENT */}
          {activeTab === 'customTypes' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                  Custom Categories &amp; Types Management
                </h1>
                <p className="text-xs text-slate-500">
                  Add or remove custom dropdown categories across Income, Expenses, Student Dues, Fines, Calendar, and Programs
                </p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newCustomTypeName.trim()) return;
                  const res = await onMutate({
                    action: 'ADD_CUSTOM_TYPE',
                    module: newCustomTypeModule,
                    name: newCustomTypeName.trim(),
                  });
                  if (res.ok) {
                    showToast(`Added custom type "${newCustomTypeName.trim()}"`, 'success');
                    setNewCustomTypeName('');
                  } else {
                    showToast(res.error || 'Could not add custom type', 'error');
                  }
                }}
                className="p-5 bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
              >
                <div className="sm:col-span-4">
                  <SelectWithCustom
                    id="custom-type-target-module"
                    label="Target Module"
                    value={newCustomTypeModule}
                    onChange={(val) => setNewCustomTypeModule(val)}
                    options={[
                      { value: 'incomeCategory', label: 'Income Category' },
                      { value: 'expenseCategory', label: 'Expense Category' },
                      { value: 'dueCategory', label: 'Student Due / Fee Category' },
                      { value: 'fines', label: 'Fine Category' },
                      { value: 'programResults', label: 'Program Result Category' },
                      { value: 'calendar', label: 'Calendar Date Category' },
                      { value: 'committeePosition', label: 'Committee Position / Role' },
                      { value: 'committeeCategory', label: 'Committee Wing / Category' },
                      { value: 'feedback', label: 'Feedback Category' },
                    ]}
                    customPlaceholder="Type custom module key..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus-glow text-slate-800"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Custom Type Name
                  </label>
                  <input
                    type="text"
                    value={newCustomTypeName}
                    onChange={(e) => setNewCustomTypeName(e.target.value)}
                    placeholder="e.g. Alumni Endowment, Stage Decoration..."
                    className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    className="w-full py-2 px-4 bg-[#0B192C] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>Add Custom Type</span>
                  </button>
                </div>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase text-slate-500">
                      <th className="py-3 px-4">Module</th>
                      <th className="py-3 px-4">Type Name</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {(state.customTypes || []).map((ct) => (
                      <tr key={ct.id}>
                        <td className="py-3 px-4 font-mono-tabular text-slate-600">{ct.module}</td>
                        <td className="py-3 px-4 font-semibold text-[#0B192C]">{ct.name}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setPendingDeleteAction({
                                title: 'Delete Custom Type',
                                itemLabel: `${ct.name} (${ct.module})`,
                                description: 'Remove this custom category option from dropdown selectors?',
                                payload: { action: 'DELETE_CUSTOM_TYPE', customTypeId: ct.id },
                                successMessage: `Custom type "${ct.name}" deleted.`,
                              })
                            }
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 14. ACTIVITY LOGS */}
          {activeTab === 'activityLogs' && (
            <AdminActivityLogsView
              activityLogs={state.activityLogs}
              users={state.users}
              searchQuery={logSearch}
              onSearchChange={setLogSearch}
              actionTypeFilter={logTypeFilter}
              onActionTypeChange={setLogTypeFilter}
              startDate={logStartDate}
              onStartDateChange={setLogStartDate}
              endDate={logEndDate}
              onEndDateChange={setLogEndDate}
              onResetFilters={handleResetLogFilters}
              onDeleteLog={(id) => onMutate({ action: 'DELETE_ACTIVITY_LOG', id })}
              showToast={showToast}
            />
          )}

          {/* 15. SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
                  Administrator Account Security Settings
                </h1>
                <p className="text-xs text-slate-500">
                  Manage SUPER ADMIN username and password credentials
                </p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await onMutate({
                    action: 'CHANGE_USERNAME',
                    newUsername: adminUsernameInput,
                  });
                  if (res.ok) {
                    showToast('Administrator username updated', 'success');
                  } else {
                    showToast(res.error || 'Could not update username', 'error');
                  }
                }}
                className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
              >
                <h2 className="text-base font-semibold text-[#0B192C]">
                  Update Administrator Username
                </h2>
                <div>
                  <label
                    htmlFor="admin-username-field"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Administrator Login Username
                  </label>
                  <input
                    id="admin-username-field"
                    type="text"
                    value={adminUsernameInput}
                    onChange={(e) => setAdminUsernameInput(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0B192C] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Save Username
                </button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await onMutate({
                    action: 'CHANGE_PASSWORD',
                    currentPassword: adminCurrentPass,
                    newPassword: adminNewPass,
                  });
                  if (res.ok) {
                    showToast('Administrator password updated securely', 'success');
                    setAdminCurrentPass('');
                    setAdminNewPass('');
                  } else {
                    showToast(res.error || 'Password update failed', 'error');
                  }
                }}
                className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
              >
                <h2 className="text-base font-semibold text-[#0B192C]">
                  Change Administrator Password
                </h2>
                <div>
                  <label
                    htmlFor="admin-current-password"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Current Password
                  </label>
                  <input
                    id="admin-current-password"
                    type="password"
                    value={adminCurrentPass}
                    onChange={(e) => setAdminCurrentPass(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="admin-new-password"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    New Password (minimum 6 characters)
                  </label>
                  <input
                    id="admin-new-password"
                    type="password"
                    value={adminNewPass}
                    onChange={(e) => setAdminNewPass(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#064E3B] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Update Password
                </button>
              </form>

              <AdminDatabaseBackupResetCard
                backupMeta={state.backupMeta}
                onMutate={onMutate}
                showToast={showToast}
              />

              <SupabaseRlsDiagnosticCard
                actorUid={currentUser.uid}
                showToast={showToast}
              />
            </div>
          )}

          {/* EXPORT DATA (Part 12: 20 Excel .XLSX Exports) */}
          {activeTab === 'exportData' && (
            <AdminExportDataView
              portalState={state}
              onNotify={(msg) => showToast(msg, 'success')}
            />
          )}

          {/* HOME SLIDESHOW MANAGEMENT (Part 4) */}
          {activeTab === 'homeSlideshow' && (
            <AdminSlideshowManager
              slides={state.slideshow || []}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* COMMITTEE MANAGEMENT (Part 13) */}
          {activeTab === 'committee' && (
            <AdminCommitteeManager
              members={state.committeeMembers || []}
              users={state.users || []}
              customTypes={state.customTypes || []}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* FEEDBACK MANAGEMENT (Part 13) */}
          {activeTab === 'feedback' && (
            <AdminFeedbackManager
              feedback={state.feedback || []}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* LOGIN HISTORY / ACCOUNT CHANGE HISTORY / AUDIT HISTORY */}
          {(activeTab === 'loginHistory' ||
            activeTab === 'accountChangeHistory' ||
            activeTab === 'auditHistory') && (
            <AdminActivityLogsView
              activityLogs={
                activeTab === 'loginHistory'
                  ? state.activityLogs.filter(
                      (l) => l.actionType === 'LOGIN' || l.actionType === 'LOGOUT'
                    )
                  : activeTab === 'accountChangeHistory'
                  ? state.activityLogs.filter((l) =>
                      [
                        'ACCOUNT_CREATION',
                        'ACCOUNT_DELETED',
                        'PROFILE_UPDATE',
                        'USERNAME_CHANGE',
                        'PASSWORD_CHANGE',
                        'PASSWORD_RESET_INITIATED',
                      ].includes(l.actionType)
                    )
                  : state.activityLogs
              }
              users={state.users}
              searchQuery={logSearch}
              onSearchChange={setLogSearch}
              actionTypeFilter={logTypeFilter}
              onActionTypeChange={setLogTypeFilter}
              startDate={logStartDate}
              onStartDateChange={setLogStartDate}
              endDate={logEndDate}
              onEndDateChange={setLogEndDate}
              onResetFilters={handleResetLogFilters}
              onDeleteLog={(id) => onMutate({ action: 'DELETE_ACTIVITY_LOG', id })}
              showToast={showToast}
            />
          )}

          {/* UNION FINANCIAL MANAGEMENT (INR ₹) */}
          {financialTabMap[activeTab] && (
            <UnionFinancialManagement
              key={activeTab}
              state={state}
              initialTab={financialTabMap[activeTab]}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* FINE MANAGEMENT (INR ₹) */}
          {activeTab === 'fines' && (
            <AdminFineManagement
              fines={state.fines || []}
              users={state.users}
              customTypes={state.customTypes || []}
              onMutate={onMutate}
              showToast={showToast}
              onAddNewCustomType={(mod, name) => {
                void onMutate({ action: 'ADD_CUSTOM_TYPE', module: mod, name });
              }}
            />
          )}

          {/* PUBLIC HOMEPAGE MANAGEMENT */}
          {activeTab === 'publicHomepage' && (
            <AdminHomepageManagement
              key={state.homepageConfig?.updatedAt || 'homepage-init'}
              config={state.homepageConfig}
              branding={state.branding}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* OFFICIAL BRANDING & LOGO */}
          {activeTab === 'officialBranding' && (
            <OfficialBrandingView
              key={state.branding?.updatedAt || 'branding-init'}
              branding={state.branding}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* CHAT */}
          {activeTab === 'liveMessages' && (
            <LiveMessagingView
              currentUser={currentUser}
              users={state.users}
              chatMessages={state.chatMessages || []}
              onSendMessage={(payload) =>
                onMutate({
                  action: 'SEND_CHAT_MESSAGE',
                  ...payload,
                })
              }
              onDeleteMessage={(id) =>
                onMutate({
                  action: 'DELETE_CHAT_MESSAGE',
                  id,
                })
              }
              onMarkRead={(peerId) => {
                void onMutate({
                  action: 'MARK_CHAT_READ',
                  peerId,
                });
              }}
              showToast={showToast}
            />
          )}

          {/* PROGRAM RESULTS */}
          {activeTab === 'programResults' && (
            <ProgramResultsView
              currentUser={currentUser}
              state={state}
              programResults={state.programResults || []}
              customTypes={state.customTypes || []}
              onMutate={onMutate}
              showToast={showToast}
              onAddNewCustomType={(mod, name) => {
                void onMutate({ action: 'ADD_CUSTOM_TYPE', module: mod, name });
              }}
            />
          )}

          {/* POINT MANAGEMENT & LEADERBOARD */}
          {activeTab === 'pointManagement' && (
            <AdminPointManagement state={state} />
          )}

          {/* ADVANCED CALENDAR */}
          {activeTab === 'calendar' && (
            <AdvancedCalendarView
              currentUser={currentUser}
              calendarEvents={state.calendarEvents || []}
              customTypes={state.customTypes || []}
              onMutate={onMutate}
              showToast={showToast}
              onAddNewCustomType={(mod, name) => {
                void onMutate({ action: 'ADD_CUSTOM_TYPE', module: mod, name });
              }}
            />
          )}

          {/* PASSWORD MANAGEMENT CONSOLE */}
          {activeTab === 'passwords' && (
            <AccountPasswordManagement
              users={state.users}
              passwordResetLogs={state.passwordResetLogs || []}
              onInitiateReset={(payload) =>
                onMutate({
                  action: 'INITIATE_PASSWORD_RESET',
                  ...payload,
                })
              }
              showToast={showToast}
              onViewActivityHistory={(targetUser) => setSelectedAccountForActivity(targetUser)}
            />
          )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Account Activity History Modal */}
      {selectedAccountForActivity && (
        <AccountActivityHistoryModal
          user={selectedAccountForActivity}
          activityLogs={state.activityLogs}
          onClose={() => setSelectedAccountForActivity(null)}
        />
      )}

      {/* Certificate Preview Modal */}
      <CertificatePreviewModal
        certificate={previewCertificate}
        settings={state.certificateSettings}
        branding={state.branding}
        onClose={() => setPreviewCertificate(null)}
      />

      {/* Student Financial Statement Modal */}
      {financialProfileStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/75 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#FAF9F5] border border-slate-200 rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl my-8">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <IndianRupee className="w-5 h-5 text-[#C5A059]" />
                <h2 className="text-lg font-serif-display font-bold">
                  Student Financial Profile · {financialProfileStudent.fullName}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFinancialProfileStudent(null)}
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[82vh] overflow-y-auto">
              <StudentFinancialStatementView
                student={financialProfileStudent}
                state={state}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Student Union Account (Part 10: No Academic Department, Complete 9-field Address, Optional Gmail, Device Photo Upload) */}
      {showCreateStudentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-student-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden shadow-xl my-8">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div>
                <h2 id="create-student-title" className="text-lg font-serif-display font-bold">
                  Create Student Union Account
                </h2>
                <p className="text-xs text-[#C5A059]">
                  Official AL-NIBRAS Scholar Identity, Address &amp; Credentials
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateStudentModal(false)}
                aria-label="Close modal"
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateStudent} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {/* Primary Identity Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="new-stu-fullname" className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    id="new-stu-fullname"
                    type="text"
                    value={newStudentForm.fullName}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, fullName: e.target.value })}
                    placeholder="Fatima Al-Zahra"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="new-stu-username" className="block text-xs font-semibold text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    id="new-stu-username"
                    type="text"
                    value={newStudentForm.username}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, username: e.target.value })}
                    placeholder="fatima.zahra"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="new-stu-id" className="block text-xs font-semibold text-slate-700 mb-1">
                    Student ID *
                  </label>
                  <input
                    id="new-stu-id"
                    type="text"
                    value={newStudentForm.studentId}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, studentId: e.target.value })}
                    placeholder="AN-2026-109"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="new-stu-roll" className="block text-xs font-semibold text-slate-700 mb-1">
                    Roll Number *
                  </label>
                  <input
                    id="new-stu-roll"
                    type="text"
                    value={newStudentForm.rollNumber}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, rollNumber: e.target.value })}
                    placeholder="09"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="new-stu-class" className="block text-xs font-semibold text-slate-700 mb-1">
                    Class / Batch
                  </label>
                  <input
                    id="new-stu-class"
                    type="text"
                    value={newStudentForm.classInfo}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, classInfo: e.target.value })}
                    placeholder="11th Batch of DHBC"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="new-stu-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Phone *
                  </label>
                  <input
                    id="new-stu-phone"
                    type="text"
                    value={newStudentForm.contactPhone}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, contactPhone: e.target.value })}
                    placeholder="+91 98470 11223"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="new-stu-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Email / Gmail <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="new-stu-email"
                    type="email"
                    value={newStudentForm.contactEmail}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, contactEmail: e.target.value })}
                    placeholder="Optional (leave blank if none)"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Residential Address Section (Part 7: House Name & Street Removed) */}
              <div className="p-4 bg-[#FAF9F5] border border-slate-200 rounded-xl space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#064E3B]">
                  Residential Address
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Village / Area / Town
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.address.villageArea}
                      onChange={(e) =>
                        setNewStudentForm({
                          ...newStudentForm,
                          address: { ...newStudentForm.address, villageArea: e.target.value },
                        })
                      }
                      placeholder="Chemmad"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Post Office
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.address.postOffice}
                      onChange={(e) =>
                        setNewStudentForm({
                          ...newStudentForm,
                          address: { ...newStudentForm.address, postOffice: e.target.value },
                        })
                      }
                      placeholder="Tirurangadi PO"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Police Station / Taluk
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.address.policeStation}
                      onChange={(e) =>
                        setNewStudentForm({
                          ...newStudentForm,
                          address: { ...newStudentForm.address, policeStation: e.target.value },
                        })
                      }
                      placeholder="Tirurangadi Taluk"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      District
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.address.district}
                      onChange={(e) =>
                        setNewStudentForm({
                          ...newStudentForm,
                          address: { ...newStudentForm.address, district: e.target.value },
                        })
                      }
                      placeholder="Malappuram"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.address.state}
                      onChange={(e) =>
                        setNewStudentForm({
                          ...newStudentForm,
                          address: { ...newStudentForm.address, state: e.target.value },
                        })
                      }
                      placeholder="Kerala"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      PIN Code / Postal Code
                    </label>
                    <input
                      type="text"
                      value={newStudentForm.address.pinCode}
                      onChange={(e) =>
                        setNewStudentForm({
                          ...newStudentForm,
                          address: { ...newStudentForm.address, pinCode: e.target.value },
                        })
                      }
                      placeholder="676306"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                </div>
              </div>

              {/* Profile Picture Upload from Device */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#C5A059] bg-slate-100 shrink-0">
                    <SafeImage
                      src={newStudentForm.avatarUrl || '/images/avatar_admin_portrait.jpg'}
                      alt={newStudentForm.fullName || 'New student portrait preview'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {newStudentForm.avatarUrl
                      ? 'Portrait preview ready for account creation.'
                      : 'Upload a portrait photo from your device or use default.'}
                  </div>
                </div>
                <DeviceFileUpload
                  label="Student Profile Picture (Upload from Device: JPG, PNG, WEBP)"
                  accept="image/*"
                  storageFolder="avatars"
                  destination="user"
                  currentUrl={newStudentForm.avatarUrl}
                  onUploadingChange={setUploadingNewStudentPhoto}
                  onSelect={(res) =>
                    setNewStudentForm((prev) => ({ ...prev, avatarUrl: res.dataUrl }))
                  }
                  onClear={() =>
                    setNewStudentForm((prev) => ({
                      ...prev,
                      avatarUrl: '',
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="new-stu-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Password *
                  </label>
                  <input
                    id="new-stu-pass"
                    type="password"
                    value={newStudentForm.password}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, password: e.target.value })}
                    placeholder="At least 6 characters"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <SelectWithCustom
                    id="new-stu-status"
                    label="Account Status"
                    value={newStudentForm.status}
                    onChange={(val) =>
                      setNewStudentForm({
                        ...newStudentForm,
                        status: val as AccountStatus,
                      })
                    }
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                    customPlaceholder="Type custom account status..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setUploadingNewStudentPhoto(false);
                    setShowCreateStudentModal(false);
                  }}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingNewStudentPhoto}
                  data-testid="create-student-submit-btn"
                  className="px-5 py-2 bg-[#0B192C] disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {uploadingNewStudentPhoto ? 'Uploading Photo...' : 'Provision Student Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Student Account (Full Address, Optional Email, Device Photo Upload) */}
      {editingStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-student-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden shadow-xl my-8">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <h2 id="edit-student-title" className="text-lg font-serif-display font-bold">
                Edit Student Profile · {editingStudent.fullName}
              </h2>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                aria-label="Close modal"
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateStudent} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-stu-fullname" className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    id="edit-stu-fullname"
                    type="text"
                    value={editStudentForm.fullName}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, fullName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-stu-username" className="block text-xs font-semibold text-slate-700 mb-1">
                    Username
                  </label>
                  <input
                    id="edit-stu-username"
                    type="text"
                    value={editStudentForm.username}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="edit-stu-id" className="block text-xs font-semibold text-slate-700 mb-1">
                    Student ID
                  </label>
                  <input
                    id="edit-stu-id"
                    type="text"
                    value={editStudentForm.studentId}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, studentId: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-stu-roll" className="block text-xs font-semibold text-slate-700 mb-1">
                    Roll Number
                  </label>
                  <input
                    id="edit-stu-roll"
                    type="text"
                    value={editStudentForm.rollNumber}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, rollNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Class / Batch
                  </label>
                  <input
                    type="text"
                    value={editStudentForm.classInfo}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, classInfo: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-stu-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Phone
                  </label>
                  <input
                    id="edit-stu-phone"
                    type="text"
                    value={editStudentForm.contactPhone}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="edit-stu-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Contact Email / Gmail <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="edit-stu-email"
                    type="email"
                    value={editStudentForm.contactEmail}
                    onChange={(e) => setEditStudentForm({ ...editStudentForm, contactEmail: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Residential Address (Part 7: House Name & Street Removed) */}
              <div className="p-4 bg-[#FAF9F5] border border-slate-200 rounded-xl space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-[#064E3B]">
                  Residential Address
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Village / Area / Town
                    </label>
                    <input
                      type="text"
                      value={editStudentForm.address.villageArea}
                      onChange={(e) =>
                        setEditStudentForm({
                          ...editStudentForm,
                          address: { ...editStudentForm.address, villageArea: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Post Office
                    </label>
                    <input
                      type="text"
                      value={editStudentForm.address.postOffice}
                      onChange={(e) =>
                        setEditStudentForm({
                          ...editStudentForm,
                          address: { ...editStudentForm.address, postOffice: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Police Station / Taluk
                    </label>
                    <input
                      type="text"
                      value={editStudentForm.address.policeStation}
                      onChange={(e) =>
                        setEditStudentForm({
                          ...editStudentForm,
                          address: { ...editStudentForm.address, policeStation: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      District
                    </label>
                    <input
                      type="text"
                      value={editStudentForm.address.district}
                      onChange={(e) =>
                        setEditStudentForm({
                          ...editStudentForm,
                          address: { ...editStudentForm.address, district: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={editStudentForm.address.state}
                      onChange={(e) =>
                        setEditStudentForm({
                          ...editStudentForm,
                          address: { ...editStudentForm.address, state: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      PIN Code / Postal Code
                    </label>
                    <input
                      type="text"
                      value={editStudentForm.address.pinCode}
                      onChange={(e) =>
                        setEditStudentForm({
                          ...editStudentForm,
                          address: { ...editStudentForm.address, pinCode: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                </div>
              </div>

              {/* Device Upload for Student Profile Picture */}
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#C5A059] bg-slate-100 shrink-0">
                    <SafeImage
                      src={editStudentForm.avatarUrl || '/images/avatar_admin_portrait.jpg'}
                      alt={editStudentForm.fullName || 'Student portrait preview'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {editStudentForm.avatarUrl
                      ? 'Portrait photo ready to save.'
                      : 'Select a portrait photo from your device or choose a preset.'}
                  </div>
                </div>
                <DeviceFileUpload
                  label="Student Profile Picture (Upload or Replace from Device)"
                  accept="image/*"
                  storageFolder="avatars"
                  destination="user"
                  currentUrl={editStudentForm.avatarUrl}
                  onUploadingChange={setUploadingEditStudentPhoto}
                  onSelect={(res) =>
                    setEditStudentForm((prev) => ({ ...prev, avatarUrl: res.dataUrl }))
                  }
                  onClear={() =>
                    setEditStudentForm((prev) => ({
                      ...prev,
                      avatarUrl: '/images/avatar_admin_portrait.jpg',
                    }))
                  }
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {AVATAR_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() =>
                        setEditStudentForm((prev) => ({ ...prev, avatarUrl: preset.url }))
                      }
                      className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                    >
                      Use {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <SelectWithCustom
                    id="edit-stu-status"
                    label="Account Status"
                    value={editStudentForm.status}
                    onChange={(val) =>
                      setEditStudentForm({
                        ...editStudentForm,
                        status: val as AccountStatus,
                      })
                    }
                    options={[
                      { value: 'active', label: 'Active' },
                      { value: 'inactive', label: 'Inactive' },
                    ]}
                    customPlaceholder="Type custom status..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="edit-stu-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                    Reset Password (Optional)
                  </label>
                  <input
                    id="edit-stu-pass"
                    type="password"
                    value={editStudentForm.newPassword}
                    onChange={(e) =>
                      setEditStudentForm({ ...editStudentForm, newPassword: e.target.value })
                    }
                    placeholder="Leave blank to keep existing"
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setUploadingEditStudentPhoto(false);
                    setEditingStudent(null);
                  }}
                  className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingEditStudentPhoto}
                  data-testid="edit-student-submit-btn"
                  className="px-5 py-2 bg-[#0B192C] disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {uploadingEditStudentPhoto ? 'Uploading Photo...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: View Student Profile */}
      {viewingStudent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-student-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <h2 id="view-student-title" className="text-lg font-serif-display font-bold">
                Scholar Dossier &amp; Address
              </h2>
              <button
                type="button"
                onClick={() => setViewingStudent(null)}
                aria-label="Close dossier"
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#C5A059] shrink-0">
                  <SafeImage
                    src={viewingStudent.avatarUrl}
                    alt={viewingStudent.fullName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-serif-display font-bold text-[#0B192C]">
                    {viewingStudent.fullName}
                  </h3>
                  <p className="text-xs font-mono-tabular text-slate-500">
                    @{viewingStudent.username} · {viewingStudent.status.toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-100 pt-4">
                <div>
                  <p className="text-slate-400">Student ID</p>
                  <p className="font-mono-tabular font-semibold text-[#0B192C]">
                    {viewingStudent.studentId}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Roll Number</p>
                  <p className="font-mono-tabular font-semibold text-[#0B192C]">
                    #{viewingStudent.rollNumber}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Class / Batch</p>
                  <p className="font-semibold text-[#0B192C]">
                    {viewingStudent.classInfo || '11th Batch of DHBC'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Contact Phone</p>
                  <p className="font-mono-tabular text-slate-700">
                    {viewingStudent.contactPhone || '—'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-400">Contact Email (Optional)</p>
                  <p className="font-mono-tabular text-slate-700">
                    {viewingStudent.contactEmail || 'Not provided'}
                  </p>
                </div>
                {viewingStudent.address && (
                  <div className="col-span-2 p-3 bg-[#FAF9F5] border border-slate-200 rounded-lg space-y-1">
                    <p className="text-[11px] font-bold uppercase text-[#B48A3E]">
                      Residential Address
                    </p>
                    <p className="text-xs text-[#0B192C]">
                      {[
                        viewingStudent.address.villageArea,
                        viewingStudent.address.postOffice,
                        viewingStudent.address.policeStation,
                        viewingStudent.address.district,
                        viewingStudent.address.state,
                        viewingStudent.address.pinCode,
                        viewingStudent.address.country,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Save Announcement */}
      {showAnnModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ann-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <h2 id="ann-modal-title" className="text-lg font-serif-display font-bold">
                {annForm.id ? 'Edit Announcement' : 'Create Official Announcement'}
              </h2>
              <button
                type="button"
                onClick={() => setShowAnnModal(false)}
                aria-label="Close announcement modal"
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveAnnouncement} className="p-6 space-y-4">
              <div>
                <label htmlFor="ann-title-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Announcement Headline
                </label>
                <input
                  id="ann-title-input"
                  type="text"
                  value={annForm.title}
                  onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                  placeholder="Enter official announcement title"
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="ann-cat-input" className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    id="ann-cat-input"
                    type="text"
                    value={annForm.category}
                    onChange={(e) => setAnnForm({ ...annForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <SelectWithCustom
                    id="ann-status-input"
                    label="Visibility"
                    value={annForm.status}
                    onChange={(val) =>
                      setAnnForm({ ...annForm, status: val as ContentStatus })
                    }
                    options={[
                      { value: 'published', label: 'Published' },
                      { value: 'draft', label: 'Draft (Hidden)' },
                    ]}
                    customPlaceholder="Type custom visibility..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <SelectWithCustom
                    id="ann-prio-input"
                    label="Priority"
                    value={annForm.priority}
                    onChange={(val) =>
                      setAnnForm({ ...annForm, priority: val as PriorityLevel })
                    }
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'high', label: 'High' },
                      { value: 'urgent', label: 'Urgent' },
                    ]}
                    customPlaceholder="Type custom priority..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ann-content-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Announcement Content
                </label>
                <textarea
                  id="ann-content-input"
                  rows={4}
                  value={annForm.content}
                  onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
                  placeholder="Write detailed announcement content..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAnnModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0B192C] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Save Announcement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Save Notice */}
      {showNoticeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notice-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <h2 id="notice-modal-title" className="text-lg font-serif-display font-bold">
                {noticeForm.id ? 'Edit Circular Notice' : 'Issue Official Notice'}
              </h2>
              <button
                type="button"
                onClick={() => setShowNoticeModal(false)}
                aria-label="Close notice modal"
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveNotice} className="p-6 space-y-4">
              <div>
                <label htmlFor="notice-title-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Notice Title
                </label>
                <input
                  id="notice-title-input"
                  type="text"
                  value={noticeForm.title}
                  onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="notice-ref-input" className="block text-xs font-semibold text-slate-700 mb-1">
                    Reference Code
                  </label>
                  <input
                    id="notice-ref-input"
                    type="text"
                    value={noticeForm.referenceCode}
                    onChange={(e) => setNoticeForm({ ...noticeForm, referenceCode: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="notice-date-input" className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective Date
                  </label>
                  <input
                    id="notice-date-input"
                    type="text"
                    value={noticeForm.effectiveDate}
                    onChange={(e) => setNoticeForm({ ...noticeForm, effectiveDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <SelectWithCustom
                    id="notice-status-input"
                    label="Visibility"
                    value={noticeForm.status}
                    onChange={(val) =>
                      setNoticeForm({ ...noticeForm, status: val as ContentStatus })
                    }
                    options={[
                      { value: 'published', label: 'Published' },
                      { value: 'draft', label: 'Draft' },
                    ]}
                    customPlaceholder="Type custom visibility..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="notice-content-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Notice Directive Text
                </label>
                <textarea
                  id="notice-content-input"
                  rows={4}
                  value={noticeForm.content}
                  onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNoticeModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0B192C] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Save Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Save Gallery */}
      {showGalleryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <h2 id="gallery-modal-title" className="text-lg font-serif-display font-bold">
                {galleryForm.id ? 'Edit Gallery Entry' : 'Add Gallery Photograph'}
              </h2>
              <button
                type="button"
                onClick={() => setShowGalleryModal(false)}
                aria-label="Close gallery modal"
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveGallery} className="p-6 space-y-4">
              <div>
                <label htmlFor="gal-title-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Title
                </label>
                <input
                  id="gal-title-input"
                  type="text"
                  value={galleryForm.title}
                  onChange={(e) => setGalleryForm({ ...galleryForm, title: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <DeviceFileUpload
                  label="Upload Photograph from Device or Paste Image URL"
                  accept="image/*"
                  storageFolder="gallery"
                  destination={galleryForm.destination === 'user' ? 'user' : 'public'}
                  currentUrl={galleryForm.imageUrl}
                  onUploadingChange={setUploadingGalleryPhoto}
                  onSelect={(res) =>
                    setGalleryForm((prev) => ({ ...prev, imageUrl: res.dataUrl }))
                  }
                  onClear={() =>
                    setGalleryForm((prev) => ({ ...prev, imageUrl: '' }))
                  }
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <SelectWithCustom
                    id="gal-dest-input"
                    label="Destination *"
                    value={galleryForm.destination}
                    onChange={(val) =>
                      setGalleryForm({
                        ...galleryForm,
                        destination: val as MediaDestination,
                      })
                    }
                    options={[
                      { value: 'public', label: 'Public Page (Homepage)' },
                      { value: 'user', label: 'User Panel (Students Only)' },
                    ]}
                    customPlaceholder="Type custom destination..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label htmlFor="gal-cat-input" className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    id="gal-cat-input"
                    type="text"
                    value={galleryForm.category}
                    onChange={(e) => setGalleryForm({ ...galleryForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <SelectWithCustom
                    id="gal-status-input"
                    label="Status"
                    value={galleryForm.status}
                    onChange={(val) =>
                      setGalleryForm({ ...galleryForm, status: val as ContentStatus })
                    }
                    options={[
                      { value: 'published', label: 'Published' },
                      { value: 'draft', label: 'Draft' },
                    ]}
                    customPlaceholder="Type custom status..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="gal-cap-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Caption
                </label>
                <textarea
                  id="gal-cap-input"
                  rows={3}
                  value={galleryForm.caption}
                  onChange={(e) => setGalleryForm({ ...galleryForm, caption: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadingGalleryPhoto(false);
                    setShowGalleryModal(false);
                  }}
                  className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingGalleryPhoto}
                  data-testid="gallery-submit-btn"
                  className="px-5 py-2 bg-[#0B192C] disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {uploadingGalleryPhoto ? 'Uploading Photo...' : 'Save Photograph'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Quick Password Reset */}
      {resetPasswordTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-reset-pass-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-[#0B192C] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#C5A059]" />
                <h2 id="quick-reset-pass-title" className="text-base font-serif-display font-bold">
                  Reset Account Password
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordTarget(null)}
                aria-label="Close password reset modal"
                className="text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitQuickPasswordReset} className="p-6 space-y-4">
              <div className="p-3 bg-[#FAF9F5] border border-slate-200 rounded-lg text-xs">
                <p className="font-semibold text-[#0B192C]">{resetPasswordTarget.fullName}</p>
                <p className="text-slate-500 font-mono-tabular">
                  @{resetPasswordTarget.username} · {resetPasswordTarget.studentId}
                </p>
              </div>
              <div>
                <label
                  htmlFor="quick-reset-pass-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  New Temporary Password (minimum 6 characters)
                </label>
                <input
                  id="quick-reset-pass-input"
                  type="password"
                  value={quickResetPassInput}
                  onChange={(e) => setQuickResetPassInput(e.target.value)}
                  placeholder="Enter new password..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  autoFocus
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordTarget(null)}
                  className="px-4 py-2 text-xs text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingPass}
                  className="px-5 py-2 bg-[#0B192C] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {isResettingPass ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unified Confirmation Modal for All Deletions */}
      <ConfirmDeleteModal
        open={Boolean(pendingDeleteAction)}
        title={pendingDeleteAction?.title || 'Confirm Deletion'}
        itemLabel={pendingDeleteAction?.itemLabel}
        description={
          pendingDeleteAction?.description ||
          'Are you sure you want to permanently delete this record?'
        }
        isDeleting={isExecutingDelete}
        onCancel={() => setPendingDeleteAction(null)}
        onConfirm={executeConfirmedDelete}
      />
    </div>
  );
}
