'use client';

import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  User,
  Receipt,
  MessageSquareCode,
  Trophy,
  CalendarDays,
  Megaphone,
  FileText,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  Bell,
  CheckCheck,
  Globe,
  Menu,
  X,
  Award,
  FileBadge,
  IndianRupee,
  ShieldCheck,
  Phone,
  Mail,
  Home,
  Users,
  ThumbsUp,
  AtSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Send,
  Star,
  Camera,
  Upload,
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
  TextReveal,
} from './MotionPrimitives';
import { LiveDateTimeClock } from './LiveDateTimeClock';
import { SafeImage } from './SafeImage';
import { OfficialLogo } from './OfficialBrandingView';
import ThemeToggle from './ThemeToggle';
import PhotoLightboxModal from './PhotoLightboxModal';
import PortalHeaderSearch from './PortalHeaderSearch';
import type { PortalTopSearchResult } from '@/lib/portal-search';
import { StudentFinesView } from './StudentFinesView';
import { LiveMessagingView } from './LiveMessagingView';
import { ProgramResultsView } from './ProgramResultsView';
import { AdvancedCalendarView } from './AdvancedCalendarView';
import { StudentResultsAndPointsView } from './StudentResultsAndPointsView';
import {
  countUnreadNotifications,
  filterVisibleContent,
  formatIndiaDate,
  formatINR,
  isNotificationUnreadForUser,
} from '@/lib/portal-logic';
import { SelectWithCustom } from './SelectWithCustom';
import { uploadImageAsset } from '@/lib/supabase-storage';
import type { PortalDatabaseState, UserProfile } from '@/lib/types';

export type StudentTab =
  | 'dashboard'
  | 'notices'
  | 'announcements'
  | 'calendar'
  | 'gallery'
  | 'committee'
  | 'programResults'
  | 'myResults'
  | 'myCertificates'
  | 'financialSummary'
  | 'fines'
  | 'feedback'
  | 'notifications'
  | 'messages'
  | 'profile'
  | 'changeUsername'
  | 'changePassword';

interface StudentPanelProps {
  currentUser: UserProfile;
  state: PortalDatabaseState;
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  onLogout: () => Promise<void>;
  onSwitchToPublic: () => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export function StudentPanel({
  currentUser,
  state,
  onMutate,
  onLogout,
  onSwitchToPublic,
  showToast,
}: StudentPanelProps) {
  const [activeTab, setActiveTab] = useState<StudentTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [galleryTabFilter, setGalleryTabFilter] = useState<'user' | 'all'>('user');
  const [committeeTypeFilter, setCommitteeTypeFilter] = useState<'all' | 'core' | 'sub'>('all');
  const [searchedMemberPreview, setSearchedMemberPreview] = useState<PortalTopSearchResult | null>(
    null
  );

  // Strictly filter published content for students
  const publishedAnnouncements = filterVisibleContent(state.announcements, 'student');
  const publishedNotices = filterVisibleContent(state.notices, 'student');
  const allPublishedGallery = filterVisibleContent(state.gallery, 'student');

  // User Panel Gallery photos (prioritizing destination === 'user', with toggle for all published)
  const userPanelGallery = useMemo(() => {
    const userOnly = allPublishedGallery.filter((g) => g.destination === 'user');
    if (galleryTabFilter === 'user' && userOnly.length > 0) return userOnly;
    if (galleryTabFilter === 'user' && userOnly.length === 0) return allPublishedGallery;
    return allPublishedGallery;
  }, [allPublishedGallery, galleryTabFilter]);

  const unreadNotifCount = countUnreadNotifications(state.notifications, currentUser.uid);

  // Private student fines (Part 9: Student A ONLY sees fines assigned to Student A)
  const myFines = useMemo(
    () => (state.fines || []).filter((f) => f.studentUid === currentUser.uid),
    [state.fines, currentUser.uid]
  );
  const myUnpaidFines = myFines.filter((f) => f.status === 'unpaid' || f.status === 'overdue');
  const myPaidFines = myFines.filter((f) => f.status === 'paid');
  const myTotalAssignedFine = myFines.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const myTotalPaidFine = myPaidFines.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const myRemainingFine = myUnpaidFines.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  const myUnreadChats = (state.chatMessages || []).filter(
    (m) => m.recipientId === currentUser.uid && !m.read
  ).length;
  const myPublishedResultsCount = (state.studentResults || []).filter(
    (r) => r.studentUid === currentUser.uid && r.status === 'published'
  ).length;

  // Union Financial Calculations (Part 8: Current Balance = Total Income - Total Expenses)
  const totalUnionIncome = useMemo(
    () => (state.income || []).reduce((sum, inc) => sum + (Number(inc.amount) || 0), 0),
    [state.income]
  );
  const totalUnionExpenses = useMemo(
    () => (state.expenses || []).reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0),
    [state.expenses]
  );
  const currentUnionBalance = totalUnionIncome - totalUnionExpenses;
  const totalOutstandingDues = useMemo(
    () =>
      (state.studentDues || []).reduce(
        (sum, d) => sum + (Number(d.remainingAmount ?? d.remainingDue) || 0),
        0
      ),
    [state.studentDues]
  );

  // Consolidated Union Financial Transaction History (Part 8)
  const unionTransactions = useMemo(() => {
    const incList = (state.income || []).map((inc) => ({
      id: inc.id,
      date: inc.date,
      type: 'INCOME' as const,
      title: inc.title,
      category: inc.category,
      amount: inc.amount,
      description: inc.description || `Received from ${inc.receivedFrom}`,
      recordedBy: inc.createdBy === 'admin_super' ? 'SUPER ADMIN' : inc.createdBy,
    }));
    const expList = (state.expenses || []).map((exp) => ({
      id: exp.id,
      date: exp.date,
      type: 'EXPENSE' as const,
      title: exp.title,
      category: exp.category,
      amount: exp.amount,
      description: exp.description || `Paid to ${exp.paidTo}`,
      recordedBy: exp.approvedBy || 'SUPER ADMIN',
    }));
    return [...incList, ...expList].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [state.income, state.expenses]);

  // Change Username State
  const [newUsernameInput, setNewUsernameInput] = useState(currentUser.username);
  const [savingUsername, setSavingUsername] = useState(false);

  // Change Password State
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');

  // Profile Avatar Personalization State
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | null>(null);
  const selectedAvatarUrl =
    draftAvatarUrl ?? (currentUser.avatarUrl || '/images/avatar_admin_portrait.jpg');
  const setSelectedAvatarUrl = (next: string) => setDraftAvatarUrl(next);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);

  // Feedback Form State
  const [fbCategory, setFbCategory] = useState('Academic');
  const [fbSubject, setFbSubject] = useState('');
  const [fbMessage, setFbMessage] = useState('');
  const [fbRating, setFbRating] = useState(5);
  const [submittingFb, setSubmittingFb] = useState(false);

  const myFeedbackList = useMemo(
    () => (state.feedback || []).filter((fb) => fb.studentUid === currentUser.uid),
    [state.feedback, currentUser.uid]
  );

  // Student Panel Navigation per Part 14
  const navItems: {
    id: StudentTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'notices', label: 'Notices', icon: FileText },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'gallery', label: 'Photo Gallery', icon: ImageIcon },
    { id: 'committee', label: 'Committee Members', icon: Users },
    { id: 'programResults', label: 'Program Results', icon: Trophy },
    { id: 'myResults', label: 'My Results & Points', icon: Award },
    { id: 'myCertificates', label: 'My Certificates', icon: FileBadge },
    { id: 'financialSummary', label: 'Union Financial Summary', icon: IndianRupee },
    { id: 'fines', label: 'My Fines', icon: Receipt, badge: myUnpaidFines.length },
    { id: 'feedback', label: 'Feedback', icon: ThumbsUp },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifCount },
    { id: 'messages', label: 'Messages', icon: MessageSquareCode, badge: myUnreadChats },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'changeUsername', label: 'Change Username', icon: AtSign },
    { id: 'changePassword', label: 'Change Password', icon: KeyRound },
  ];

  const handleUsernameSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newUsernameInput.trim().toLowerCase();
    if (cleaned.length < 3 || /\s/.test(cleaned)) {
      showToast('Username must be at least 3 characters with no spaces.', 'error');
      return;
    }
    setSavingUsername(true);
    try {
      const res = await onMutate({
        action: 'CHANGE_USERNAME',
        newUsername: cleaned,
      });
      if (res.ok) {
        showToast(`Username updated to @${cleaned}`, 'success');
      } else {
        showToast(res.error || 'Could not change username', 'error');
      }
    } finally {
      setSavingUsername(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordInput !== confirmPasswordInput) {
      showToast('New password and confirmation do not match', 'error');
      return;
    }
    const res = await onMutate({
      action: 'CHANGE_PASSWORD',
      currentPassword: currentPasswordInput,
      newPassword: newPasswordInput,
    });
    if (res.ok) {
      showToast('Your password has been updated securely', 'success');
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
    } else {
      showToast(res.error || 'Could not change password', 'error');
    }
  };

  const handleSaveAvatar = async (nextUrl?: string) => {
    const targetUrl = (nextUrl ?? selectedAvatarUrl).trim();
    if (!targetUrl) {
      showToast('Please select or upload an avatar image.', 'error');
      return;
    }
    setSavingAvatar(true);
    try {
      const res = await onMutate({
        action: 'UPDATE_AVATAR',
        avatarUrl: targetUrl,
      });
      if (res.ok) {
        setDraftAvatarUrl(null);
        showToast('Profile avatar updated', 'success');
      } else {
        showToast(res.error || 'Could not update profile avatar', 'error');
      }
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadImageAsset(file, {
        folder: 'avatars',
        destination: 'user',
        maxSizeMb: 15,
        maxDimension: 900,
      });
      setSelectedAvatarUrl(uploaded.url);
      await handleSaveAvatar(uploaded.url);
    } catch (err) {
      showToast(
        err instanceof Error && err.message ? err.message : 'Failed to upload avatar image.',
        'error'
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fbSubject.trim().length < 3 || fbMessage.trim().length < 5) {
      showToast('Please provide a subject and feedback message.', 'error');
      return;
    }
    setSubmittingFb(true);
    try {
      const res = await onMutate({
        action: 'SUBMIT_FEEDBACK',
        category: fbCategory,
        subject: fbSubject.trim(),
        message: fbMessage.trim(),
        rating: fbRating,
      });
      if (res.ok) {
        showToast('Feedback submitted to the Union Administration', 'success');
        setFbSubject('');
        setFbMessage('');
        setFbRating(5);
      } else {
        showToast(res.error || 'Could not submit feedback', 'error');
      }
    } finally {
      setSubmittingFb(false);
    }
  };

  // Part 7: Address without House Name / Building Number or Street / Road / Locality
  const addr = currentUser.address || {
    villageArea: '',
    postOffice: '',
    policeStation: '',
    district: '',
    state: '',
    pinCode: '',
    country: 'India',
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2]">
      {/* Mobile Drawer Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="student-mobile-backdrop"
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

      {/* Student Sidebar */}
      <aside
        aria-label="Student sidebar navigation"
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

        <nav className="grow px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
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
                className={`relative w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-[#071713] font-bold'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="student-sidebar-active"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-[#D4AF37] shadow-xs"
                    aria-hidden="true"
                  />
                )}
                <div className="relative z-10 flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`relative z-10 px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full ${
                      isActive ? 'bg-[#071713] text-[#D4AF37]' : 'bg-[#D4AF37] text-[#071713]'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
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

      {/* Main Content Area */}
      <div className="grow flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white dark:bg-[#0D231D] border-b border-[#E5EAE6] dark:border-[#1B3B31] px-4 lg:px-5 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 shrink">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 text-[#17221F] dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-[#718078] dark:text-[#9AB0A6] truncate">
              <span className="hidden 2xl:inline">Student Portal</span>
              <span className="2xl:hidden">Portal</span>
              <span aria-hidden="true" className="mx-1.5">
                /
              </span>
              <span className="font-bold text-[#064E3B] dark:text-[#D4AF37]">
                {navItems.find((i) => i.id === activeTab)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LiveDateTimeClock variant="header" />
            <PortalHeaderSearch
              viewerRole="student"
              state={state}
              onSelectResult={(result) => {
                if (result.kind === 'announcement') {
                  setActiveTab('announcements');
                } else if (result.kind === 'notice') {
                  setActiveTab('notices');
                } else if (result.kind === 'user') {
                  setSearchedMemberPreview(result);
                }
              }}
            />
            <ThemeToggle compact />

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifDropdownOpen((prev) => !prev)}
                aria-label="Student notifications"
                className="group press-scale p-2 text-[#718078] dark:text-[#9AB0A6] hover:text-[#064E3B] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors inline-flex items-center cursor-pointer"
              >
                <Bell className="w-4 h-4 group-hover-bounce" />
                {unreadNotifCount > 0 && (
                  <span className="ml-1 text-[11px] font-mono font-bold text-[#064E3B] dark:text-[#D4AF37]">
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
                    className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-[#064E3B] text-white flex items-center justify-between">
                      <span className="text-xs font-semibold">
                        Notifications ({unreadNotifCount} unread)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          void onMutate({ action: 'MARK_ALL_NOTIFICATIONS_READ' });
                        }}
                        className="text-[11px] text-[#D4AF37] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-[#E5EAE6] dark:divide-[#1B3B31]">
                      {state.notifications.length === 0 ? (
                        <div className="p-4 text-xs text-[#718078] text-center">
                          No notifications yet.
                        </div>
                      ) : (
                        state.notifications.map((n) => {
                          const isUnread = isNotificationUnreadForUser(n, currentUser.uid);
                          return (
                            <div
                              key={n.id}
                              className={`p-3.5 text-xs space-y-1 ${
                                isUnread
                                  ? 'bg-[#F8FAF7] dark:bg-[#071713]'
                                  : 'bg-white dark:bg-[#0D231D]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-[#17221F] dark:text-white">
                                  {n.title}
                                </span>
                                {isUnread && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void onMutate({
                                        action: 'MARK_NOTIFICATION_READ',
                                        notificationId: n.id,
                                      });
                                    }}
                                    className="text-[11px] text-[#064E3B] dark:text-[#D4AF37] hover:underline shrink-0 cursor-pointer"
                                  >
                                    Mark read
                                  </button>
                                )}
                              </div>
                              <p className="text-[#718078] dark:text-[#9AB0A6]">{n.message}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2.5 pl-3 border-l border-[#E5EAE6] dark:border-[#1B3B31]">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-[#D4AF37]">
                <SafeImage
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold text-[#17221F] dark:text-white leading-none">
                  {currentUser.fullName}
                </p>
                <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6] font-mono mt-0.5">
                  {currentUser.studentId}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Student Viewport with Smooth Tab Transitions */}
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
          {/* 1. STUDENT DASHBOARD (Part 14) */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              {/* Personalized Welcome Banner with Ambient Motion & Live Clock */}
              <div className="relative overflow-hidden p-6 lg:p-8 bg-gradient-to-r from-[#064E3B] to-[#0B3D32] text-white rounded-xl border border-[#D4AF37]/30 flex flex-col gap-5 shadow-md">
                <AmbientBackground />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#D4AF37] shrink-0 shadow-md">
                      <SafeImage
                        src={currentUser.avatarUrl}
                        alt={currentUser.fullName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wider text-[#D4AF37] font-bold">
                        Al-Nibras Student Portal · {currentUser.classInfo || '11th Batch of DHBC'}
                      </p>
                      <h1 className="text-2xl lg:text-3xl font-extrabold text-white">
                        <TextReveal variant="slide-up">Welcome, {currentUser.fullName}</TextReveal>
                      </h1>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 font-mono">
                        <span>ID: {currentUser.studentId}</span>
                        <span>·</span>
                        <span>Roll #{currentUser.rollNumber}</span>
                        <span>·</span>
                        <span>@{currentUser.username}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-3 shrink-0">
                    <LiveDateTimeClock variant="banner" />
                    <div className="flex flex-wrap items-center gap-2.5">
                      <RippleButton
                        type="button"
                        onClick={() => setActiveTab('financialSummary')}
                        className="px-4 py-2.5 bg-[#D4AF37] hover:bg-[#c29d2f] text-[#071713] text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Union Finances</span>
                      </RippleButton>
                      <RippleButton
                        type="button"
                        onClick={() => setActiveTab('fines')}
                        className="px-4 py-2.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Receipt className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>My Fines ({formatINR(myRemainingFine)})</span>
                      </RippleButton>
                      <RippleButton
                        type="button"
                        onClick={() => setActiveTab('profile')}
                        className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        My Profile
                      </RippleButton>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Metric Cards: Union Financial Balance, Personal Fine Summary, Published Results, Notifications */}
              <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('financialSummary')}
                    className="group p-5 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl cursor-pointer hover:border-[#064E3B] dark:hover:border-[#D4AF37]/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#718078] dark:text-[#9AB0A6]">
                        Union Current Balance
                      </span>
                      <Wallet className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] group-hover-bounce" />
                    </div>
                    <div className="text-xl font-extrabold text-[#17221F] dark:text-white tabular-nums">
                      <AnimatedCounter value={currentUnionBalance} formatter={formatINR} />
                    </div>
                    <div className="text-[11px] text-[#718078] dark:text-[#9AB0A6] mt-1">
                      Income: {formatINR(totalUnionIncome)} · Exp: {formatINR(totalUnionExpenses)}
                    </div>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('fines')}
                    className="group p-5 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl cursor-pointer hover:border-[#064E3B] dark:hover:border-[#D4AF37]/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#718078] dark:text-[#9AB0A6]">
                        Personal Fine Summary
                      </span>
                      <Receipt className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] group-hover-bounce" />
                    </div>
                    <div className="text-xl font-extrabold text-[#17221F] dark:text-white tabular-nums">
                      <AnimatedCounter value={myRemainingFine} formatter={formatINR} />
                    </div>
                    <div className="text-[11px] text-[#718078] dark:text-[#9AB0A6] mt-1">
                      {myUnpaidFines.length === 0
                        ? 'You have no pending fines.'
                        : `${myUnpaidFines.length} pending fine(s)`}
                    </div>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('myResults')}
                    className="group p-5 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl cursor-pointer hover:border-[#064E3B] dark:hover:border-[#D4AF37]/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#718078] dark:text-[#9AB0A6]">
                        Results &amp; Certificates
                      </span>
                      <Award className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] group-hover-bounce" />
                    </div>
                    <div className="text-xl font-extrabold text-[#17221F] dark:text-white tabular-nums">
                      <AnimatedCounter value={myPublishedResultsCount} /> Published
                    </div>
                    <div className="text-[11px] text-[#718078] dark:text-[#9AB0A6] mt-1">
                      View merits &amp; download certificates
                    </div>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard
                    tilt
                    spotlight
                    shine
                    onClick={() => setActiveTab('notifications')}
                    className="group p-5 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl cursor-pointer hover:border-[#064E3B] dark:hover:border-[#D4AF37]/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#718078] dark:text-[#9AB0A6]">
                        Notifications
                      </span>
                      <Bell className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] group-hover-bounce" />
                    </div>
                    <div className="text-xl font-extrabold text-[#17221F] dark:text-white tabular-nums">
                      <AnimatedCounter value={unreadNotifCount} /> Unread
                    </div>
                    <div className="text-[11px] text-[#718078] dark:text-[#9AB0A6] mt-1">
                      {state.notifications.length} total alerts
                    </div>
                  </InteractiveCard>
                </StaggerItem>
              </StaggerGrid>

              {/* Latest Notices & Latest Announcements */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E5EAE6] dark:border-[#1B3B31] pb-3">
                    <h2 className="text-base font-bold text-[#17221F] dark:text-white">
                      Latest Notices
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('notices')}
                      className="text-xs font-bold text-[#064E3B] dark:text-[#D4AF37] hover:underline cursor-pointer"
                    >
                      View All
                    </button>
                  </div>
                  {publishedNotices.length === 0 ? (
                    <p className="text-xs text-[#718078] dark:text-[#9AB0A6] py-6 text-center">
                      No notices available at the moment.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {publishedNotices.slice(0, 4).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => setActiveTab('notices')}
                          className="hover-lift p-3.5 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[11px] font-semibold text-[#064E3B] dark:text-[#D4AF37]">
                            <span>{n.referenceCode}</span>
                            <span>{n.effectiveDate}</span>
                          </div>
                          <div className="text-sm font-bold text-[#17221F] dark:text-white mt-0.5">
                            {n.title}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E5EAE6] dark:border-[#1B3B31] pb-3">
                    <h2 className="text-base font-bold text-[#17221F] dark:text-white">
                      Latest Announcements
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('announcements')}
                      className="text-xs font-bold text-[#064E3B] dark:text-[#D4AF37] hover:underline cursor-pointer"
                    >
                      View All
                    </button>
                  </div>
                  {publishedAnnouncements.length === 0 ? (
                    <p className="text-xs text-[#718078] dark:text-[#9AB0A6] py-6 text-center">
                      No announcements published yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {publishedAnnouncements.slice(0, 4).map((ann) => (
                        <div
                          key={ann.id}
                          onClick={() => setActiveTab('announcements')}
                          className="hover-lift p-3.5 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[11px] font-semibold text-[#064E3B] dark:text-[#D4AF37]">
                            <span>{ann.category}</span>
                            <span>{formatIndiaDate(ann.createdAt)}</span>
                          </div>
                          <div className="text-sm font-bold text-[#17221F] dark:text-white mt-0.5">
                            {ann.title}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. NOTICES */}
          {activeTab === 'notices' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">Notices</h1>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Official circulars and union notifications
                </p>
              </div>
              {publishedNotices.length === 0 ? (
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center text-sm text-[#718078]">
                  No notices available at the moment.
                </div>
              ) : (
                <div className="space-y-4">
                  {publishedNotices.map((notice) => (
                    <div
                      key={notice.id}
                      className="hover-lift p-6 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/40 dark:hover:border-[#D4AF37]/50 rounded-xl space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-[#064E3B] dark:text-[#D4AF37]">
                        <span>{notice.referenceCode}</span>
                        <span>Effective: {notice.effectiveDate}</span>
                      </div>
                      <h2 className="text-base font-bold text-[#17221F] dark:text-white">
                        {notice.title}
                      </h2>
                      <p className="text-sm text-[#718078] dark:text-[#9AB0A6] leading-relaxed">
                        {notice.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">Announcements</h1>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Official updates from the Al-Nibras Executive Council
                </p>
              </div>
              {publishedAnnouncements.length === 0 ? (
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center text-sm text-[#718078]">
                  No notices available at the moment.
                </div>
              ) : (
                <div className="space-y-4">
                  {publishedAnnouncements.map((ann) => (
                    <article
                      key={ann.id}
                      className="hover-lift p-6 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/40 dark:hover:border-[#D4AF37]/50 rounded-xl space-y-2 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-xs text-[#718078] dark:text-[#9AB0A6]">
                        <span className="font-bold text-[#064E3B] dark:text-[#D4AF37]">
                          {ann.category}
                        </span>
                        <span>·</span>
                        <span>{formatIndiaDate(ann.createdAt)}</span>
                      </div>
                      <h2 className="text-base font-bold text-[#17221F] dark:text-white">
                        {ann.title}
                      </h2>
                      <p className="text-sm text-[#718078] dark:text-[#9AB0A6] leading-relaxed">
                        {ann.content}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. CALENDAR */}
          {activeTab === 'calendar' && (
            <AdvancedCalendarView
              currentUser={currentUser}
              calendarEvents={state.calendarEvents || []}
              customTypes={state.customTypes || []}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* 6. PHOTO GALLERY WITH LIGHTBOX VIEWER (Parts 5 & 10) */}
          {activeTab === 'gallery' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">
                    Photo Gallery
                  </h1>
                  <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                    Click any photograph to open the full-screen Lightbox viewer with Next and Previous controls.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setGalleryTabFilter('user')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                      galleryTabFilter === 'user'
                        ? 'bg-[#064E3B] text-white'
                        : 'bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31]'
                    }`}
                  >
                    User Panel Photos
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryTabFilter('all')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                      galleryTabFilter === 'all'
                        ? 'bg-[#064E3B] text-white'
                        : 'bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31]'
                    }`}
                  >
                    All Union Photos ({allPublishedGallery.length})
                  </button>
                </div>
              </div>

              {userPanelGallery.length === 0 ? (
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-12 text-center">
                  <ImageIcon className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-60" />
                  <p className="text-sm font-bold text-[#17221F] dark:text-white">
                    No photos uploaded yet.
                  </p>
                </div>
              ) : (
                <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {userPanelGallery.map((item, idx) => (
                    <StaggerItem key={item.id}>
                      <InteractiveCard
                        tilt
                        spotlight
                        shine
                        onClick={() => setLightboxIndex(idx)}
                        className="group bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl overflow-hidden cursor-pointer hover:border-[#064E3B] dark:hover:border-[#D4AF37] transition-colors h-full"
                      >
                        <div className="aspect-4/3 bg-[#071713] overflow-hidden relative">
                          <SafeImage
                            src={item.imageUrl}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-bold uppercase">
                            {item.category}
                          </span>
                        </div>
                        <div className="p-4 space-y-1">
                          <h2 className="text-sm font-bold text-[#17221F] dark:text-white">
                            {item.title}
                          </h2>
                          <p className="text-xs text-[#718078] dark:text-[#9AB0A6] leading-relaxed">
                            {item.caption}
                          </p>
                        </div>
                      </InteractiveCard>
                    </StaggerItem>
                  ))}
                </StaggerGrid>
              )}

              <PhotoLightboxModal
                items={userPanelGallery}
                currentIndex={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                onNavigate={(nextIdx) => setLightboxIndex(nextIdx)}
              />
            </div>
          )}

          {/* 6. COMMITTEE MEMBERS */}
          {activeTab === 'committee' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">
                    Committee Members
                  </h1>
                  <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                    Core Committee office bearers and Sub Committee wings of Al-Nibras Class Union
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {(['all', 'core', 'sub'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setCommitteeTypeFilter(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        committeeTypeFilter === tab
                          ? 'bg-[#064E3B] text-white'
                          : 'bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] text-[#718078] dark:text-[#9AB0A6]'
                      }`}
                    >
                      {tab === 'all' ? 'All Members' : tab === 'core' ? 'Core Committee' : 'Sub Committee'}
                    </button>
                  ))}
                </div>
              </div>

              {(state.committeeMembers || []).filter((m) =>
                committeeTypeFilter === 'all'
                  ? true
                  : (m.committeeType === 'sub' ? 'sub' : 'core') === committeeTypeFilter
              ).length === 0 ? (
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center text-sm text-[#718078]">
                  No committee members found for the selected view.
                </div>
              ) : (
                <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {(state.committeeMembers || [])
                    .filter((m) =>
                      committeeTypeFilter === 'all'
                        ? true
                        : (m.committeeType === 'sub' ? 'sub' : 'core') === committeeTypeFilter
                    )
                    .map((member) => {
                      const isSub = member.committeeType === 'sub';
                      return (
                        <StaggerItem key={member.id}>
                          <InteractiveCard
                            spotlight
                            shine
                            className="group bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#D4AF37]/60 rounded-xl p-5 flex items-start gap-4 h-full transition-colors"
                          >
                            <div className="flex items-start gap-4">
                              <SafeImage
                                src={member.avatarUrl || '/images/avatar_admin_portrait.jpg'}
                                alt={member.fullName}
                                className="w-14 h-14 rounded-full object-cover border-2 border-[#D4AF37] shrink-0 transition-transform duration-300 group-hover:scale-105"
                              />
                              <div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                      isSub
                                        ? 'bg-amber-500/15 text-amber-800 dark:text-[#D4AF37]'
                                        : 'bg-[#064E3B]/10 dark:bg-[#D4AF37]/15 text-[#064E3B] dark:text-[#D4AF37]'
                                    }`}
                                  >
                                    {isSub ? 'Sub Committee' : 'Core Committee'}
                                  </span>
                                </div>
                                <h3 className="text-sm font-bold text-[#17221F] dark:text-white mt-1">
                                  {member.fullName}
                                </h3>
                                <p className="text-xs font-semibold text-[#064E3B] dark:text-[#D4AF37]">
                                  {isSub
                                    ? `${member.wingName || member.department || 'Sub Wing'} · ${
                                        member.subRole || member.position || member.designation
                                      }`
                                    : member.designation || member.position}
                                </p>
                                <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-0.5">
                                  {isSub
                                    ? `Wing Lead (${member.subRole || member.position || 'Convener'})`
                                    : member.department}
                                </p>
                              </div>
                            </div>
                          </InteractiveCard>
                        </StaggerItem>
                      );
                    })}
                </StaggerGrid>
              )}
            </div>
          )}

          {/* 9. PROGRAM RESULTS */}
          {activeTab === 'programResults' && (
            <ProgramResultsView
              currentUser={currentUser}
              state={state}
              programResults={state.programResults || []}
              customTypes={state.customTypes || []}
              onMutate={onMutate}
              showToast={showToast}
            />
          )}

          {/* 10. MY RESULTS & POINTS */}
          {activeTab === 'myResults' && (
            <StudentResultsAndPointsView
              currentUser={currentUser}
              state={state}
              mode="myResults"
            />
          )}

          {/* 11. MY CERTIFICATES */}
          {activeTab === 'myCertificates' && (
            <StudentResultsAndPointsView
              currentUser={currentUser}
              state={state}
              mode="myCertificates"
            />
          )}

          {/* 12. OFFICIAL UNION FINANCIAL SUMMARY (Part 8: Read-Only for All Students) */}
          {activeTab === 'financialSummary' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">
                  Union Financial Summary
                </h1>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Official financial transparency ledger of Al-Nibras Class Union (Read-Only)
                </p>
              </div>

              <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StaggerItem>
                  <InteractiveCard spotlight shine className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5 h-full">
                    <div className="flex items-center justify-between text-xs font-bold uppercase text-[#718078] dark:text-[#9AB0A6] mb-1">
                      <span>Total Union Income</span>
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      <AnimatedCounter value={totalUnionIncome} formatter={formatINR} />
                    </div>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard spotlight shine className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5 h-full">
                    <div className="flex items-center justify-between text-xs font-bold uppercase text-[#718078] dark:text-[#9AB0A6] mb-1">
                      <span>Total Union Expenses</span>
                      <TrendingDown className="w-4 h-4 text-rose-600" />
                    </div>
                    <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 tabular-nums">
                      <AnimatedCounter value={totalUnionExpenses} formatter={formatINR} />
                    </div>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard spotlight shine className="bg-[#064E3B] text-white border border-[#D4AF37]/40 rounded-xl p-5 h-full">
                    <div className="flex items-center justify-between text-xs font-bold uppercase text-[#D4AF37] mb-1">
                      <span>Current Union Balance</span>
                      <Wallet className="w-4 h-4 text-[#D4AF37]" />
                    </div>
                    <div className="text-2xl font-extrabold text-white tabular-nums">
                      <AnimatedCounter value={currentUnionBalance} formatter={formatINR} />
                    </div>
                  </InteractiveCard>
                </StaggerItem>

                <StaggerItem>
                  <InteractiveCard spotlight shine className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5 h-full">
                    <div className="flex items-center justify-between text-xs font-bold uppercase text-[#718078] dark:text-[#9AB0A6] mb-1">
                      <span>Outstanding Amount</span>
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-2xl font-extrabold text-[#17221F] dark:text-white tabular-nums">
                      <AnimatedCounter value={totalOutstandingDues} formatter={formatINR} />
                    </div>
                  </InteractiveCard>
                </StaggerItem>
              </StaggerGrid>

              {/* Complete Financial Transaction History */}
              <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-[#E5EAE6] dark:border-[#1B3B31]">
                  <h2 className="text-base font-bold text-[#17221F] dark:text-white">
                    Complete Financial Transaction History
                  </h2>
                </div>

                {unionTransactions.length === 0 ? (
                  <div className="p-10 text-center text-xs text-[#718078] dark:text-[#9AB0A6]">
                    No financial transactions recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#F8FAF7] dark:bg-[#071713] border-b border-[#E5EAE6] dark:border-[#1B3B31] text-[#718078] dark:text-[#9AB0A6] uppercase">
                          <th className="py-3 px-4 font-bold">Date</th>
                          <th className="py-3 px-4 font-bold">Transaction Type</th>
                          <th className="py-3 px-4 font-bold">Category</th>
                          <th className="py-3 px-4 font-bold">Description</th>
                          <th className="py-3 px-4 font-bold">Amount</th>
                          <th className="py-3 px-4 font-bold">Recorded By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5EAE6] dark:divide-[#1B3B31]">
                        {unionTransactions.map((tx) => (
                          <tr key={tx.id}>
                            <td className="py-3 px-4 font-mono whitespace-nowrap">{tx.date}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  tx.type === 'INCOME'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold">{tx.category}</td>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-[#17221F] dark:text-white">
                                {tx.title}
                              </div>
                              <div className="text-[#718078] dark:text-[#9AB0A6]">
                                {tx.description}
                              </div>
                            </td>
                            <td
                              className={`py-3 px-4 font-mono font-bold whitespace-nowrap ${
                                tx.type === 'INCOME'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {tx.type === 'INCOME' ? '+' : '-'}
                              {formatINR(tx.amount)}
                            </td>
                            <td className="py-3 px-4">{tx.recordedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 13. MY FINES (Part 9: Strictly Private Student Fine Management) */}
          {activeTab === 'fines' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5">
                  <span className="text-xs font-bold uppercase text-[#718078] dark:text-[#9AB0A6]">
                    Total Assigned Fine
                  </span>
                  <div className="text-2xl font-extrabold text-[#17221F] dark:text-white tabular-nums mt-1">
                    {formatINR(myTotalAssignedFine)}
                  </div>
                </div>
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5">
                  <span className="text-xs font-bold uppercase text-[#718078] dark:text-[#9AB0A6]">
                    Paid Fine
                  </span>
                  <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
                    {formatINR(myTotalPaidFine)}
                  </div>
                </div>
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5">
                  <span className="text-xs font-bold uppercase text-[#718078] dark:text-[#9AB0A6]">
                    Remaining Fine Balance
                  </span>
                  <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-400 tabular-nums mt-1">
                    {formatINR(myRemainingFine)}
                  </div>
                </div>
              </div>

              <StudentFinesView
                currentUser={currentUser}
                fines={myFines}
                showToast={showToast}
              />
            </div>
          )}

          {/* 14. FEEDBACK */}
          {activeTab === 'feedback' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-5 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 space-y-4 self-start">
                <h2 className="text-lg font-bold text-[#17221F] dark:text-white">
                  Submit Feedback
                </h2>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Share suggestions or academic feedback with the Al-Nibras Union Administration.
                </p>

                <form onSubmit={handleFeedbackSubmit} className="space-y-4">
                  <div>
                    <SelectWithCustom
                      id="student-feedback-category"
                      label="Category"
                      value={fbCategory}
                      onChange={(val) => setFbCategory(val)}
                      options={[
                        { value: 'Academic', label: 'Academic Programs' },
                        { value: 'Programs', label: 'Cultural & Academic Programs' },
                        { value: 'Welfare', label: 'Student Welfare' },
                        { value: 'Portal', label: 'Website & Portal' },
                      ]}
                      savedCustomOptions={(state.customTypes || [])
                        .filter((ct) => ct.module === 'feedback')
                        .map((ct) => ct.name)}
                      onCustomValueCommit={(name) => {
                        void onMutate({ action: 'ADD_CUSTOM_TYPE', module: 'feedback', name });
                      }}
                      customPlaceholder="Type custom feedback category..."
                      selectClassName="focus-glow w-full px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Rating (1 to 5)</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setFbRating(num)}
                          className={`press-scale hover-scale p-2 rounded-lg border cursor-pointer transition-colors ${
                            fbRating >= num
                              ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]'
                              : 'border-[#E5EAE6] dark:border-[#1B3B31] text-[#718078]'
                          }`}
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Subject *</label>
                    <input
                      type="text"
                      value={fbSubject}
                      onChange={(e) => setFbSubject(e.target.value)}
                      placeholder="Brief summary"
                      className="focus-glow w-full px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Feedback Details *</label>
                    <textarea
                      rows={4}
                      value={fbMessage}
                      onChange={(e) => setFbMessage(e.target.value)}
                      placeholder="Write your feedback or suggestion..."
                      className="focus-glow w-full px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-sm"
                      required
                    />
                  </div>

                  <RippleButton
                    type="submit"
                    loading={submittingFb}
                    disabled={submittingFb}
                    className="w-full py-2.5 rounded-lg bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold uppercase tracking-wider cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    {!submittingFb && <Send className="w-3.5 h-3.5 text-[#D4AF37]" />}
                    <span>{submittingFb ? 'Submitting...' : 'Submit Feedback'}</span>
                  </RippleButton>
                </form>
              </div>

              <div className="lg:col-span-7 space-y-4">
                <h2 className="text-lg font-bold text-[#17221F] dark:text-white">
                  My Submitted Feedback ({myFeedbackList.length})
                </h2>
                {myFeedbackList.length === 0 ? (
                  <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center text-xs text-[#718078]">
                    You have not submitted any feedback yet.
                  </div>
                ) : (
                  myFeedbackList.map((fb) => (
                    <div
                      key={fb.id}
                      className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#064E3B] dark:text-[#D4AF37]">
                          {fb.category} · {fb.rating}/5 Stars
                        </span>
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {fb.status}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[#17221F] dark:text-white">
                        {fb.subject}
                      </h3>
                      <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">{fb.message}</p>
                      {fb.adminResponse && (
                        <div className="mt-2 p-3 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#D4AF37]/40 text-xs">
                          <span className="font-bold text-[#064E3B] dark:text-[#D4AF37]">
                            Admin Response:{' '}
                          </span>
                          <span>{fb.adminResponse}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 15. NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">
                    Notifications
                  </h1>
                  <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                    Official Union alerts, result updates, and fine notices
                  </p>
                </div>
                {unreadNotifCount > 0 && (
                  <RippleButton
                    type="button"
                    onClick={() => void onMutate({ action: 'MARK_ALL_NOTIFICATIONS_READ' })}
                    className="px-3.5 py-2 bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Mark All Read</span>
                  </RippleButton>
                )}
              </div>

              {state.notifications.length === 0 ? (
                <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center text-xs text-[#718078]">
                  No notifications available.
                </div>
              ) : (
                <div className="space-y-3">
                  {state.notifications.map((n) => {
                    const isUnread = isNotificationUnreadForUser(n, currentUser.uid);
                    return (
                      <div
                        key={n.id}
                        className={`hover-lift p-5 rounded-xl border flex items-start justify-between gap-4 transition-colors ${
                          isUnread
                            ? 'bg-white dark:bg-[#0D231D] border-[#D4AF37]'
                            : 'bg-white/70 dark:bg-[#0D231D]/70 border-[#E5EAE6] dark:border-[#1B3B31]'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#17221F] dark:text-white">
                              {n.title}
                            </span>
                            {isUnread && (
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-[#D4AF37]/25 text-[#064E3B] dark:text-[#D4AF37] rounded-full">
                                New
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#718078] dark:text-[#9AB0A6] leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() =>
                              void onMutate({
                                action: 'MARK_NOTIFICATION_READ',
                                notificationId: n.id,
                              })
                            }
                            className="text-xs font-bold text-[#064E3B] dark:text-[#D4AF37] hover:underline shrink-0 cursor-pointer"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 16. MESSAGES */}
          {activeTab === 'messages' && (
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

          {/* 17. MY PROFILE (Part 7: House Name & Street Removed) */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-3xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">
                    My Profile
                  </h1>
                  <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                    Official Student Union Identity & Residential Record
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#064E3B] text-white text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span>Verified Union Member</span>
                </div>
              </div>

              <div className="p-6 lg:p-8 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl space-y-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-6 border-b border-[#E5EAE6] dark:border-[#1B3B31]">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#D4AF37] shrink-0 group">
                      <SafeImage
                        src={selectedAvatarUrl || currentUser.avatarUrl}
                        alt={currentUser.fullName}
                        className="w-full h-full object-cover"
                      />
                      <label
                        title="Upload custom avatar photo"
                        className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                      >
                        <Camera className="w-5 h-5 text-[#D4AF37]" />
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingAvatar || savingAvatar}
                          onChange={handleAvatarFileUpload}
                          className="hidden"
                          data-testid="student-avatar-file-input"
                        />
                      </label>
                    </div>
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">
                        Active Student Member
                      </div>
                      <h2 className="text-xl font-bold text-[#17221F] dark:text-white">
                        {currentUser.fullName}
                      </h2>
                      <p className="text-xs font-mono text-[#718078] dark:text-[#9AB0A6]">
                        @{currentUser.username} · ID: {currentUser.studentId} · Roll #{currentUser.rollNumber}
                      </p>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold uppercase tracking-wider cursor-pointer shrink-0 self-start sm:self-center">
                    <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{uploadingAvatar ? 'Uploading...' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingAvatar || savingAvatar}
                      onChange={handleAvatarFileUpload}
                      className="hidden"
                      data-testid="student-avatar-upload-btn-input"
                    />
                  </label>
                </div>

                {/* Personal & Academic Details */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#064E3B] dark:text-[#D4AF37] mb-3">
                    Personal & Academic Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">Full Name</p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {currentUser.fullName}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">Student ID</p>
                      <p className="text-xs font-mono font-bold text-[#17221F] dark:text-white mt-0.5">
                        {currentUser.studentId}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">Roll Number</p>
                      <p className="text-xs font-mono font-bold text-[#17221F] dark:text-white mt-0.5">
                        #{currentUser.rollNumber}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">Class / Batch</p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {currentUser.classInfo || '11th Batch of DHBC'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6] flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[#064E3B] dark:text-[#D4AF37]" /> Phone Number
                      </p>
                      <p className="text-xs font-mono font-bold text-[#17221F] dark:text-white mt-0.5">
                        {currentUser.contactPhone || 'Not provided'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6] flex items-center gap-1">
                        <Mail className="w-3 h-3 text-[#064E3B] dark:text-[#D4AF37]" /> Email Address
                      </p>
                      <p className="text-xs font-mono font-bold text-[#17221F] dark:text-white mt-0.5">
                        {currentUser.contactEmail || 'Not provided'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Residential Address Section (Part 7: Only the 7 required address fields) */}
                <div className="pt-4 border-t border-[#E5EAE6] dark:border-[#1B3B31]">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#064E3B] dark:text-[#D4AF37] mb-3 flex items-center gap-1.5">
                    <Home className="w-3.5 h-3.5" /> Residential Address
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">
                        Village / Area / Town
                      </p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {addr.villageArea || '—'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">Post Office</p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {addr.postOffice || '—'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">
                        Police Station / Taluk
                      </p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {addr.policeStation || '—'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">District</p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {addr.district || '—'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">State</p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {addr.state || '—'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">PIN Code</p>
                      <p className="text-xs font-mono font-bold text-[#17221F] dark:text-white mt-0.5">
                        {addr.pinCode || '—'}
                      </p>
                    </div>
                    <div className="p-3.5 bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl">
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">Country</p>
                      <p className="text-xs font-bold text-[#17221F] dark:text-white mt-0.5">
                        {addr.country || 'India'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 18. CHANGE USERNAME */}
          {activeTab === 'changeUsername' && (
            <div className="max-w-md space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">
                  Change Username
                </h1>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Update your unique Al-Nibras portal sign-in username
                </p>
              </div>

              <form
                onSubmit={handleUsernameSave}
                className="p-6 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold mb-1">Current Username</label>
                  <input
                    type="text"
                    disabled
                    value={currentUser.username}
                    className="w-full px-3.5 py-2 text-sm bg-slate-100 dark:bg-white/5 border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#718078]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">New Username *</label>
                  <input
                    type="text"
                    value={newUsernameInput}
                    onChange={(e) => setNewUsernameInput(e.target.value)}
                    placeholder="Enter new username"
                    className="focus-glow w-full px-3.5 py-2 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg"
                    required
                  />
                </div>
                <RippleButton
                  type="submit"
                  loading={savingUsername}
                  disabled={savingUsername}
                  className="px-5 py-2.5 bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  {savingUsername ? 'Updating...' : 'Save New Username'}
                </RippleButton>
              </form>
            </div>
          )}

          {/* 19. CHANGE PASSWORD */}
          {activeTab === 'changePassword' && (
            <div className="max-w-md space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[#17221F] dark:text-white">
                  Change Password
                </h1>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Update your account password securely
                </p>
              </div>

              <form
                onSubmit={handlePasswordSave}
                className="p-6 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl space-y-4"
              >
                <div>
                  <label
                    htmlFor="stu-curr-pass"
                    className="block text-xs font-semibold mb-1"
                  >
                    Current Password
                  </label>
                  <input
                    id="stu-curr-pass"
                    type="password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    className="focus-glow w-full px-3.5 py-2 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="stu-new-pass"
                    className="block text-xs font-semibold mb-1"
                  >
                    New Password
                  </label>
                  <input
                    id="stu-new-pass"
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    className="focus-glow w-full px-3.5 py-2 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="stu-conf-pass"
                    className="block text-xs font-semibold mb-1"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="stu-conf-pass"
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    className="focus-glow w-full px-3.5 py-2 text-sm bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg"
                    required
                  />
                </div>
                <RippleButton
                  type="submit"
                  className="px-5 py-2.5 bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Update Password
                </RippleButton>
              </form>
            </div>
          )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Safe Non-PII Member Directory Preview Modal (from Top Search Bar) */}
      <AnimatePresence>
        {searchedMemberPreview && (
          <motion.div
            key="member-preview-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setSearchedMemberPreview(null)}
            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="searched-member-title"
          >
            <motion.div
              key="member-preview-card"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={{ duration: 0.2, ease: ALNIBRAS_EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="bg-gradient-to-r from-[#064E3B] to-[#0B3D32] px-6 py-4 text-white flex items-center justify-between border-b border-[#D4AF37]/30">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-[#D4AF37]/60 bg-white/10 shrink-0">
                    <SafeImage
                      src={searchedMemberPreview.avatarUrl || '/images/avatar_admin_portrait.jpg'}
                      alt={searchedMemberPreview.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 id="searched-member-title" className="text-base font-bold text-white">
                      {searchedMemberPreview.title}
                    </h3>
                    <p className="text-xs text-[#D4AF37] font-semibold">
                      {searchedMemberPreview.category}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchedMemberPreview(null)}
                  aria-label="Close directory card"
                  className="p-1.5 text-white/80 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] space-y-1.5">
                  <p className="text-[#718078] dark:text-[#9AB0A6] font-semibold uppercase tracking-wider text-[10px]">
                    Department / Batch
                  </p>
                  <p className="text-sm font-bold text-[#17221F] dark:text-white">
                    {searchedMemberPreview.department || '11th Batch of DHBC'}
                  </p>
                </div>
                {searchedMemberPreview.designation && (
                  <div className="p-3 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] space-y-1.5">
                    <p className="text-[#718078] dark:text-[#9AB0A6] font-semibold uppercase tracking-wider text-[10px]">
                      Designation / Position
                    </p>
                    <p className="text-sm font-semibold text-[#064E3B] dark:text-[#D4AF37]">
                      {searchedMemberPreview.designation}
                    </p>
                  </div>
                )}
                {searchedMemberPreview.classInfo && (
                  <div className="p-3 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] space-y-1.5">
                    <p className="text-[#718078] dark:text-[#9AB0A6] font-semibold uppercase tracking-wider text-[10px]">
                      Class / Session
                    </p>
                    <p className="text-xs font-medium text-[#17221F] dark:text-[#F0F5F2]">
                      {searchedMemberPreview.classInfo}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
