'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowRight,
  Calendar,
  MapPin,
  Mail,
  Phone,
  Send,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Bell,
  Megaphone,
  Users,
  Award,
  Image as ImageIcon,
  X,
  Menu,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ALNIBRAS_EASE,
  AmbientBackground,
  AnimatedCounter,
  GradientText,
  InteractiveCard,
  MagneticAction,
  ParallaxLayer,
  RippleButton,
  ScrollProgressBar,
  SectionReveal,
  ShimmerImage,
  StaggerGrid,
  StaggerItem,
  TextReveal,
  TextScramble,
} from './MotionPrimitives';
import { LiveDateTimeClock } from './LiveDateTimeClock';
import { OfficialLogo } from './OfficialBrandingView';
import { FloatingThemeToggle } from './ThemeToggle';
import PhotoLightboxModal from './PhotoLightboxModal';
import { SafeImage } from './SafeImage';
import { filterVisibleContent } from '@/lib/portal-logic';
import {
  searchGlobalPortalContent,
  type GlobalSearchFilter,
  type GlobalSearchResultItem,
} from '@/lib/portal-search';
import type {
  Announcement,
  BrandingConfig,
  CommitteeMember,
  ExpenseRecord,
  GalleryItem,
  IncomeRecord,
  Notice,
  ProgramResult,
  PublicHomepageConfig,
  SlideshowSlide,
  UnionSettings,
  UserProfile,
} from '@/lib/types';

interface PublicHomePageProps {
  settings: UnionSettings;
  branding?: BrandingConfig;
  homepageConfig?: PublicHomepageConfig;
  slideshow?: SlideshowSlide[];
  committeeMembers?: CommitteeMember[];
  programResults?: ProgramResult[];
  income?: IncomeRecord[];
  expenses?: ExpenseRecord[];
  publicTotalIncome?: number;
  publicTotalExpenses?: number;
  announcements: Announcement[];
  notices: Notice[];
  gallery: GalleryItem[];
  totalStudentsCount: number;
  currentUser: UserProfile | null;
  onOpenLogin: () => void;
  onEnterPortal: () => void;
  onSubmitPublicContact: (payload: {
    senderName: string;
    senderEmail: string;
    subject: string;
    body: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

const DEFAULT_SLIDES: SlideshowSlide[] = [
  {
    id: 'slide_default_1',
    title: 'Welcome to Al-Nibras',
    subtitle: 'Connecting Students, Building Community, Creating Opportunities.',
    imageUrl: '/images/hero_campus_library.jpg',
    ctaText: 'Explore Notices',
    ctaLink: '#notices',
    order: 1,
    enabled: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'slide_default_2',
    title: 'Academic Excellence & Leadership',
    subtitle: 'Empowering the 11th Batch of DHBC through scholarship, debate, and service.',
    imageUrl: '/images/union_hall_symposium.jpg',
    ctaText: 'Latest Announcements',
    ctaLink: '#announcements',
    order: 2,
    enabled: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'slide_default_3',
    title: 'Cultural Heritage & Unity',
    subtitle: 'Celebrating student achievements, publications, and community initiatives.',
    imageUrl: '/images/gallery_convocation.jpg',
    ctaText: 'Photo Gallery',
    ctaLink: '#gallery',
    order: 3,
    enabled: true,
    createdAt: '',
    updatedAt: '',
  },
];

export function PublicHomePage({
  settings,
  branding,
  homepageConfig,
  slideshow = [],
  committeeMembers = [],
  programResults = [],
  announcements,
  notices,
  gallery,
  totalStudentsCount,
  currentUser,
  onOpenLogin,
  onEnterPortal,
  onSubmitPublicContact,
}: PublicHomePageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);

  // Global Navigation Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<GlobalSearchFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [selectedSearchItem, setSelectedSearchItem] = useState<GlobalSearchResultItem | null>(null);
  const desktopSearchContainerRef = useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 24);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchGlobalPortalContent({
      query: searchQuery,
      filter: searchFilter,
      announcements,
      notices,
      events: [],
      limit: 12,
    });
  }, [searchQuery, searchFilter, announcements, notices]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        desktopSearchContainerRef.current &&
        !desktopSearchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
      }
    };

    const handleGlobalKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (event.key === '/' && !isInputFocused) {
        event.preventDefault();
        if (window.innerWidth >= 1024) {
          desktopSearchInputRef.current?.focus();
          setSearchOpen(true);
        } else {
          setMobileSearchOpen(true);
          setTimeout(() => mobileSearchInputRef.current?.focus(), 40);
        }
      } else if (event.key === 'Escape') {
        setSearchOpen(false);
        setSelectedSearchItem(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleGlobalKeys);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleGlobalKeys);
    };
  }, []);

  // Filter published & public-destined items
  const publishedAnnouncements = useMemo(
    () =>
      filterVisibleContent(announcements, 'public').filter(
        (a) => a.showOnHomepage !== false
      ),
    [announcements]
  );

  const publishedNotices = useMemo(
    () =>
      filterVisibleContent(notices, 'public').filter(
        (n) => n.showOnHomepage !== false
      ),
    [notices]
  );

  // Strictly only show photos with destination === 'public' on Public Homepage (Part 5)
  const publicGallery = useMemo(
    () =>
      filterVisibleContent(gallery, 'public').filter(
        (g) => (g.destination || 'public') === 'public'
      ),
    [gallery]
  );

  const visibleCommittee = useMemo(
    () => (committeeMembers || []).filter((m) => m.showOnHomepage !== false),
    [committeeMembers]
  );
  const [committeeFilter, setCommitteeFilter] = useState<'all' | 'core' | 'sub'>('all');
  const filteredCommittee = useMemo(() => {
    if (committeeFilter === 'all') return visibleCommittee;
    return visibleCommittee.filter((m) => (m.committeeType === 'sub' ? 'sub' : 'core') === committeeFilter);
  }, [visibleCommittee, committeeFilter]);

  const publishedResults = useMemo(
    () => (programResults || []).filter((r) => r.status === 'published'),
    [programResults]
  );

  // Slideshow state (Part 4)
  const activeSlides = useMemo(() => {
    const enabled = (slideshow || [])
      .filter((s) => s.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    return enabled.length > 0 ? enabled : DEFAULT_SLIDES;
  }, [slideshow]);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  useEffect(() => {
    if (activeSlides.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % activeSlides.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [activeSlides.length]);

  const safeSlideIndex = currentSlideIndex % activeSlides.length;
  const activeSlide = activeSlides[safeSlideIndex] || DEFAULT_SLIDES[0];

  // Photo Lightbox Modal State
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Contact Form State
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactBody, setContactBody] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [submittingContact, setSubmittingContact] = useState(false);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(false);

    if (
      contactName.trim().length < 2 ||
      !contactEmail.includes('@') ||
      contactSubject.trim().length < 3 ||
      contactBody.trim().length < 5
    ) {
      setContactError('Please enter your name, a valid email, subject, and message.');
      return;
    }

    setSubmittingContact(true);
    try {
      const res = await onSubmitPublicContact({
        senderName: contactName.trim(),
        senderEmail: contactEmail.trim(),
        subject: contactSubject.trim(),
        body: contactBody.trim(),
      });
      if (res.ok) {
        setContactSuccess(true);
        setContactName('');
        setContactEmail('');
        setContactSubject('');
        setContactBody('');
      } else {
        setContactError(res.error || 'Could not send message.');
      }
    } finally {
      setSubmittingContact(false);
    }
  };

  const renderSearchResultsPanel = () => (
    <div
      data-testid="global-search-results"
      className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Category Filter Tabs */}
      <div className="px-3 py-2 border-b border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'notice', label: 'Notices' },
              { id: 'announcement', label: 'Announcements' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSearchFilter(tab.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors press-scale cursor-pointer ${
                searchFilter === tab.id
                  ? 'bg-[#064E3B] text-white'
                  : 'text-[#718078] dark:text-[#9AB0A6] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-semibold text-[#718078] dark:text-[#9AB0A6] tabular-nums shrink-0">
          {searchResults.length} match{searchResults.length === 1 ? '' : 'es'}
        </span>
      </div>

      {/* Results List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-[#E5EAE6] dark:divide-[#1B3B31]">
        {searchResults.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#718078] dark:text-[#9AB0A6]">
            No published notices or announcements match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          searchResults.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => {
                setSelectedSearchItem(item);
                setSearchOpen(false);
                setMobileSearchOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-[#F8FAF7] dark:hover:bg-white/5 transition-colors flex items-start justify-between gap-3 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      item.kind === 'notice'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : item.kind === 'announcement'
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-300'
                    }`}
                  >
                    {item.kind}
                  </span>
                  <span className="text-[11px] font-medium text-[#718078] dark:text-[#9AB0A6] truncate">
                    {item.referenceCode || item.category}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-[#17221F] dark:text-[#F0F5F2] truncate">
                  {item.title}
                </div>
                <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6] line-clamp-1 mt-0.5">
                  {item.summary}
                </p>
              </div>
              <span className="text-[11px] text-[#718078] dark:text-[#9AB0A6] tabular-nums shrink-0">
                {item.dateLabel}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2]">
      <ScrollProgressBar />

      {/* Live Day, Date & Ticking Time Ribbon */}
      <LiveDateTimeClock variant="public" />

      {/* Sticky Institutional Navigation Bar with Scroll-Aware Shrink */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b border-[#E5EAE6] dark:border-[#1B3B31] transition-all duration-300 ${
          navScrolled
            ? 'bg-white/95 dark:bg-[#0D231D]/95 shadow-md'
            : 'bg-white/90 dark:bg-[#0D231D]/90'
        }`}
      >
        <div
          className={`max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-2 sm:gap-3 transition-all duration-300 ${
            navScrolled ? 'h-14 sm:h-16' : 'h-16 sm:h-20'
          }`}
        >
          <a
            href="#top"
            className="group flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 lg:flex-initial shrink lg:shrink-0 transition-transform duration-200 hover:translate-x-0.5"
          >
            <OfficialLogo branding={branding} placement="navbar" size="md" showText={false} />
            <div className="min-w-0">
              <span className="block text-xs sm:text-base xl:text-lg font-extrabold tracking-tight text-[#064E3B] dark:text-white leading-none truncate lg:whitespace-nowrap">
                {homepageConfig?.unionName || settings.unionName || 'AL-NIBRAS'}
              </span>
              <span className="block text-[10px] sm:text-[11px] font-semibold text-[#718078] dark:text-[#D4AF37] mt-1 truncate">
                {homepageConfig?.unionSubtitle || settings.academicSession || '11th Batch of DHBC'}
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links with Animated Underlines */}
          <nav className="hidden lg:flex items-center gap-2.5 xl:gap-4 text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] whitespace-nowrap">
            {[
              { label: 'About', href: '#about' },
              { label: 'Notices', href: '#notices' },
              { label: 'Announcements', href: '#announcements' },
              { label: 'Gallery', href: '#gallery' },
              { label: 'Committee', href: '#committee' },
              { label: 'Contact', href: '#contact' },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group relative py-1 hover:text-[#064E3B] dark:hover:text-[#D4AF37] transition-colors press-scale"
              >
                <span>{item.label}</span>
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 w-full h-0.5 bg-[#064E3B] dark:bg-[#D4AF37] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-200"
                />
              </a>
            ))}
          </nav>

          {/* Desktop Global Search Input */}
          <div ref={desktopSearchContainerRef} className="hidden lg:block relative w-44 xl:w-56 shrink-0">
            <div className="relative flex items-center group">
              <Search className="w-3.5 h-3.5 text-[#718078] group-focus-within:text-[#064E3B] dark:group-focus-within:text-[#D4AF37] transition-colors absolute left-3 pointer-events-none" />
              <input
                ref={desktopSearchInputRef}
                type="text"
                role="searchbox"
                inputMode="search"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search notices..."
                aria-label="Search published notices and announcements"
                data-testid="global-nav-search-input"
                className="w-full pl-8 pr-8 py-2 text-xs bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] placeholder:text-[#718078] focus-glow"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                    desktopSearchInputRef.current?.focus();
                  }}
                  aria-label="Clear search query"
                  data-testid="global-nav-search-clear"
                  className="absolute right-2 p-0.5 text-[#718078] hover:text-[#17221F] dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono text-[#718078] bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded pointer-events-none">
                  /
                </kbd>
              )}
            </div>

            <AnimatePresence>
              {searchOpen && searchQuery.trim().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: ALNIBRAS_EASE }}
                  className="absolute right-0 mt-2 w-96 z-50"
                >
                  {renderSearchResultsPanel()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Buttons & Mobile Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                setMobileSearchOpen((prev) => !prev);
                setTimeout(() => mobileSearchInputRef.current?.focus(), 40);
              }}
              aria-label="Toggle search bar"
              data-testid="mobile-search-toggle"
              className="lg:hidden p-2 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] text-[#17221F] dark:text-white cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </motion.button>

            <FloatingThemeToggle />

            {currentUser ? (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={onEnterPortal}
                className="group inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold shadow-xs transition-all whitespace-nowrap cursor-pointer"
              >
                <span>{currentUser.role === 'admin' ? 'Admin' : 'Student'} Panel</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-0.5 transition-transform" />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={onOpenLogin}
                data-testid="open-login-modal-btn"
                className="group inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold shadow-xs transition-all whitespace-nowrap cursor-pointer"
              >
                <span>Portal Login</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-0.5 transition-transform" />
              </motion.button>
            )}

            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle mobile navigation"
              className="lg:hidden p-2 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] text-[#17221F] dark:text-white cursor-pointer"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileMenuOpen ? (
                  <motion.span
                    key="menu-close"
                    initial={{ rotate: -45, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 45, opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    className="inline-flex"
                  >
                    <X className="w-5 h-5" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="menu-open"
                    initial={{ rotate: 45, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -45, opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    className="inline-flex"
                  >
                    <Menu className="w-5 h-5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        {/* Expandable Mobile Global Search Bar */}
        <AnimatePresence>
          {mobileSearchOpen && (
            <motion.div
              key="mobile-search-drawer"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: ALNIBRAS_EASE }}
              className="lg:hidden border-t border-[#E5EAE6] dark:border-[#1B3B31] bg-white dark:bg-[#0D231D] px-4 py-3 space-y-2"
            >
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-[#718078] absolute left-3 pointer-events-none" />
                <input
                  ref={mobileSearchInputRef}
                  type="text"
                  role="searchbox"
                  inputMode="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notices & announcements..."
                  aria-label="Search published notices and announcements"
                  data-testid="mobile-nav-search-input"
                  className="w-full pl-9 pr-9 py-2 text-xs bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] placeholder:text-[#718078] focus-glow"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear mobile search query"
                    className="absolute right-2.5 p-0.5 text-[#718078] hover:text-[#17221F] dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {searchQuery.trim().length > 0 && renderSearchResultsPanel()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              key="mobile-nav-drawer"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: ALNIBRAS_EASE }}
              className="lg:hidden border-t border-[#E5EAE6] dark:border-[#1B3B31] bg-white dark:bg-[#0D231D] px-4 py-4 space-y-2"
            >
              {[
                { label: 'About Al-Nibras', href: '#about' },
                { label: 'Latest Notices', href: '#notices' },
                { label: 'Announcements', href: '#announcements' },
                { label: 'Public Photo Gallery', href: '#gallery' },
                { label: 'Committee Members', href: '#committee' },
                { label: 'Contact Us', href: '#contact' },
              ].map((nav) => (
                <a
                  key={nav.href}
                  href={nav.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-lg text-sm font-semibold text-[#17221F] dark:text-[#F0F5F2] hover:bg-[#F8FAF7] dark:hover:bg-white/5 transition-colors press-scale"
                >
                  {nav.label}
                </a>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* PART 4: AUTOMATIC HOMEPAGE SLIDESHOW HERO SECTION */}
      <section
        id="top"
        data-testid="homepage-hero-slideshow"
        className="relative w-full h-[460px] sm:h-[540px] lg:h-[600px] overflow-hidden bg-[#071713]"
      >
        {activeSlides.map((slide, idx) => (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              idx === safeSlideIndex ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
            }`}
          >
            <img
              src={slide.imageUrl}
              alt={slide.title}
              className={`w-full h-full object-cover object-center transition-transform duration-[4500ms] ease-out ${
                idx === safeSlideIndex ? 'scale-100' : 'scale-105'
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#071713]/92 via-[#064E3B]/75 to-black/50" />
          </div>
        ))}

        {/* Subtle Ambient Aurora Glow over Hero Backdrop */}
        <AmbientBackground className="z-10" />

        {/* Slideshow Content Overlay with Staggered Slide Text Reveal */}
        <div className="relative z-20 max-w-7xl mx-auto h-full px-14 sm:px-16 lg:px-20 flex flex-col justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={activeSlide.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: ALNIBRAS_EASE }}
              className="max-w-3xl space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md bg-white/10 backdrop-blur-xs border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-bold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <TextScramble
                  text={homepageConfig?.heroBadgeText || 'Al-Nibras Class Union · 11th Batch of DHBC'}
                />
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
                <TextReveal variant="blur">
                  {activeSlide.title || 'Welcome to Al-Nibras'}
                </TextReveal>
              </h1>

              <p className="text-base sm:text-xl text-white/90 leading-relaxed max-w-2xl font-medium">
                <TextReveal variant="slide-up" delay={0.08}>
                  {activeSlide.subtitle ||
                    'Connecting Students, Building Community, Creating Opportunities.'}
                </TextReveal>
              </p>

              <div className="pt-3 flex flex-wrap items-center gap-3">
                <MagneticAction>
                  {currentUser ? (
                    <RippleButton
                      onClick={onEnterPortal}
                      className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#D4AF37] hover:bg-[#c29d2f] text-[#071713] text-sm font-bold shadow-lg transition-all cursor-pointer"
                    >
                      <span>Enter {currentUser.role === 'admin' ? 'Admin' : 'Student'} Dashboard</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </RippleButton>
                  ) : (
                    <RippleButton
                      onClick={onOpenLogin}
                      className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#D4AF37] hover:bg-[#c29d2f] text-[#071713] text-sm font-bold shadow-lg transition-all cursor-pointer"
                    >
                      <span>Member Portal Login</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </RippleButton>
                  )}
                </MagneticAction>

                {(() => {
                  const targetHref = activeSlide.ctaLink || activeSlide.ctaHref || '#notices';
                  const ctaLabel = activeSlide.ctaText || 'View Latest Updates';
                  const isLoginCta =
                    targetHref === '#login' || /login/i.test(ctaLabel);
                  if (isLoginCta) {
                    return (
                      <button
                        type="button"
                        onClick={currentUser ? onEnterPortal : onOpenLogin}
                        data-testid="hero-member-login-btn"
                        className="hover-shine press-scale inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/30 text-sm font-semibold transition-all cursor-pointer"
                      >
                        <span>
                          {currentUser
                            ? `Open ${currentUser.role === 'admin' ? 'Admin' : 'Student'} Panel`
                            : ctaLabel}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <a
                      href={targetHref !== '#events' ? targetHref : '#notices'}
                      className="hover-shine press-scale inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/25 text-sm font-semibold transition-all hover:-translate-y-0.5"
                    >
                      <span>{ctaLabel}</span>
                    </a>
                  );
                })()}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Previous / Next Buttons & Slide Indicators */}
        {activeSlides.length > 1 && (
          <>
            <motion.button
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() =>
                setCurrentSlideIndex(
                  (safeSlideIndex - 1 + activeSlides.length) % activeSlides.length
                )
              }
              aria-label="Previous slide"
              className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-[#064E3B] text-white border border-white/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setCurrentSlideIndex((safeSlideIndex + 1) % activeSlides.length)}
              aria-label="Next slide"
              className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-[#064E3B] text-white border border-white/20 flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </motion.button>

            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
              {activeSlides.map((slide, idx) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setCurrentSlideIndex(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === safeSlideIndex
                      ? 'w-8 bg-[#D4AF37]'
                      : 'w-2.5 bg-white/45 hover:bg-white/75'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {/* 1. ABOUT AL-NIBRAS */}
        <SectionReveal id="about" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[#064E3B] dark:text-[#D4AF37]">
              About Al-Nibras
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#17221F] dark:text-[#F0F5F2] tracking-tight">
              <GradientText>{homepageConfig?.aboutHeading || 'About Al-Nibras Class Union'}</GradientText>
            </h2>
            <p className="text-sm sm:text-base text-[#718078] dark:text-[#9AB0A6] leading-relaxed">
              {homepageConfig?.aboutMission ||
                settings.missionStatement ||
                'Al-Nibras serves the 11th Batch of DHBC through academic leadership, cultural programs, transparent union governance, and student welfare.'}
            </p>
            {homepageConfig?.aboutVision && (
              <p className="text-sm text-[#718078] dark:text-[#9AB0A6] leading-relaxed">
                {homepageConfig.aboutVision}
              </p>
            )}
          </div>

          <StaggerGrid className="lg:col-span-5 grid grid-cols-2 gap-4">
            <StaggerItem>
              <InteractiveCard
                tilt
                spotlight
                shine
                className="group hover-glow bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/40 dark:hover:border-[#D4AF37]/50 rounded-xl p-5 shadow-xs transition-colors"
              >
                <Users className="w-6 h-6 text-[#064E3B] dark:text-[#D4AF37] mb-2 group-hover-bounce group-hover:scale-110 transition-transform" />
                <div className="text-2xl font-extrabold text-[#17221F] dark:text-[#F0F5F2]">
                  <AnimatedCounter value={totalStudentsCount} />
                </div>
                <div className="text-xs font-medium text-[#718078] dark:text-[#9AB0A6] mt-0.5">
                  Registered Students
                </div>
              </InteractiveCard>
            </StaggerItem>

            <StaggerItem>
              <InteractiveCard
                tilt
                spotlight
                shine
                className="group hover-glow bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/40 dark:hover:border-[#D4AF37]/50 rounded-xl p-5 shadow-xs transition-colors"
              >
                <Bell className="w-6 h-6 text-[#064E3B] dark:text-[#D4AF37] mb-2 group-hover-bounce group-hover:scale-110 transition-transform" />
                <div className="text-2xl font-extrabold text-[#17221F] dark:text-[#F0F5F2]">
                  <AnimatedCounter value={publishedNotices.length} />
                </div>
                <div className="text-xs font-medium text-[#718078] dark:text-[#9AB0A6] mt-0.5">
                  Official Notices
                </div>
              </InteractiveCard>
            </StaggerItem>

            <StaggerItem>
              <InteractiveCard
                tilt
                spotlight
                shine
                className="group hover-glow bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/40 dark:hover:border-[#D4AF37]/50 rounded-xl p-5 shadow-xs transition-colors"
              >
                <Megaphone className="w-6 h-6 text-[#064E3B] dark:text-[#D4AF37] mb-2 group-hover-bounce group-hover:scale-110 transition-transform" />
                <div className="text-2xl font-extrabold text-[#17221F] dark:text-[#F0F5F2]">
                  <AnimatedCounter value={publishedAnnouncements.length} />
                </div>
                <div className="text-xs font-medium text-[#718078] dark:text-[#9AB0A6] mt-0.5">
                  Active Announcements
                </div>
              </InteractiveCard>
            </StaggerItem>

            <StaggerItem>
              <InteractiveCard
                tilt
                spotlight
                shine
                className="group hover-glow bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/40 dark:hover:border-[#D4AF37]/50 rounded-xl p-5 shadow-xs transition-colors"
              >
                <Award className="w-6 h-6 text-[#064E3B] dark:text-[#D4AF37] mb-2 group-hover-bounce group-hover:scale-110 transition-transform" />
                <div className="text-2xl font-extrabold text-[#17221F] dark:text-[#F0F5F2]">
                  <AnimatedCounter value={publishedResults.length} />
                </div>
                <div className="text-xs font-medium text-[#718078] dark:text-[#9AB0A6] mt-0.5">
                  Published Programs
                </div>
              </InteractiveCard>
            </StaggerItem>
          </StaggerGrid>
        </SectionReveal>

        {/* 2. LATEST NOTICES & 3. ANNOUNCEMENTS */}
        <SectionReveal className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section
            id="notices"
            className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between border-b border-[#E5EAE6] dark:border-[#1B3B31] pb-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#064E3B]/10 dark:bg-[#D4AF37]/15 text-[#064E3B] dark:text-[#D4AF37] flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#17221F] dark:text-[#F0F5F2]">
                      Latest Notices
                    </h2>
                    <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                      Official circulars and union notifications
                    </p>
                  </div>
                </div>
              </div>

              {publishedNotices.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-[#17221F] dark:text-[#F0F5F2]">
                    No notices available at the moment.
                  </p>
                </div>
              ) : (
                <StaggerGrid className="space-y-3">
                  {publishedNotices.slice(0, 5).map((notice) => (
                    <StaggerItem key={notice.id}>
                      <InteractiveCard
                        spotlight
                        shine
                        className="group hover-glow p-4 rounded-xl bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/45 dark:hover:border-[#D4AF37]/50"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#064E3B] dark:text-[#D4AF37] mb-1">
                          <span>{notice.referenceCode}</span>
                          <span className="text-[#718078] dark:text-[#9AB0A6] tabular-nums">
                            {notice.effectiveDate || String(notice.createdAt || '').slice(0, 10)}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#17221F] dark:text-[#F0F5F2] group-hover:text-[#064E3B] dark:group-hover:text-[#D4AF37] transition-colors">
                          {notice.title}
                        </h3>
                        <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-1 line-clamp-2">
                          {notice.content}
                        </p>
                      </InteractiveCard>
                    </StaggerItem>
                  ))}
                </StaggerGrid>
              )}
            </div>
          </section>

          <section
            id="announcements"
            className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 shadow-xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between border-b border-[#E5EAE6] dark:border-[#1B3B31] pb-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#064E3B]/10 dark:bg-[#D4AF37]/15 text-[#064E3B] dark:text-[#D4AF37] flex items-center justify-center">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#17221F] dark:text-[#F0F5F2]">
                      Announcements
                    </h2>
                    <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                      Updates from the Al-Nibras Executive Council
                    </p>
                  </div>
                </div>
              </div>

              {publishedAnnouncements.length === 0 ? (
                <div className="py-10 text-center">
                  <Megaphone className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-[#17221F] dark:text-[#F0F5F2]">
                    No announcements available at the moment.
                  </p>
                </div>
              ) : (
                <StaggerGrid className="space-y-3">
                  {publishedAnnouncements.slice(0, 5).map((ann) => (
                    <StaggerItem key={ann.id}>
                      <InteractiveCard
                        spotlight
                        shine
                        className="group hover-glow p-4 rounded-xl bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/45 dark:hover:border-[#D4AF37]/50"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#064E3B] dark:text-[#D4AF37] mb-1">
                          <span>{ann.category}</span>
                          <span className="text-[#718078] dark:text-[#9AB0A6] tabular-nums">
                            {String(ann.createdAt || '').slice(0, 10)}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#17221F] dark:text-[#F0F5F2] group-hover:text-[#064E3B] dark:group-hover:text-[#D4AF37] transition-colors">
                          {ann.title}
                        </h3>
                        <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-1 line-clamp-2">
                          {ann.content}
                        </p>
                      </InteractiveCard>
                    </StaggerItem>
                  ))}
                </StaggerGrid>
              )}
            </div>
          </section>
        </SectionReveal>

        {/* 5. PUBLIC PHOTO GALLERY */}
        <SectionReveal id="gallery" className="space-y-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#064E3B] dark:text-[#D4AF37]">
              Visual Archive
            </span>
            <h2 className="text-2xl font-bold text-[#17221F] dark:text-[#F0F5F2]">
              Public Photo Gallery
            </h2>
            <p className="text-xs sm:text-sm text-[#718078] dark:text-[#9AB0A6] mt-0.5">
              Click any photo to open the full-screen viewer with Next and Previous controls.
            </p>
          </div>

          {publicGallery.length === 0 ? (
            <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center">
              <ImageIcon className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-[#17221F] dark:text-[#F0F5F2]">
                No photos uploaded yet.
              </p>
            </div>
          ) : (
            <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {publicGallery.map((item, idx) => (
                <StaggerItem key={item.id}>
                  <InteractiveCard
                    tilt
                    shine
                    onClick={() => setLightboxIndex(idx)}
                    className="group hover-glow bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl overflow-hidden shadow-xs hover:shadow-md hover:border-[#064E3B] dark:hover:border-[#D4AF37] transition-all cursor-pointer"
                  >
                    <ParallaxLayer offset={8} className="relative h-52 overflow-hidden bg-[#071713]">
                      <ShimmerImage
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-end p-3">
                        <span className="px-2.5 py-1 rounded-md bg-black/75 text-white text-[11px] font-semibold">
                          View Photo
                        </span>
                      </div>
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider">
                        {item.category}
                      </span>
                    </ParallaxLayer>
                    <div className="p-4">
                      <h3 className="text-sm font-bold text-[#17221F] dark:text-[#F0F5F2] group-hover:text-[#064E3B] dark:group-hover:text-[#D4AF37] transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-1 line-clamp-2">
                        {item.caption}
                      </p>
                    </div>
                  </InteractiveCard>
                </StaggerItem>
              ))}
            </StaggerGrid>
          )}
        </SectionReveal>

        {/* 5. COMMITTEE MEMBERS & 6. PROGRAM HIGHLIGHTS */}
        {(visibleCommittee.length > 0 || publishedResults.length > 0) && (
          <SectionReveal id="committee" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-bold text-[#17221F] dark:text-[#F0F5F2]">
                  Committee Members
                </h2>
                {visibleCommittee.length > 0 && (
                  <div className="flex items-center gap-1 text-[11px]">
                    {(['all', 'core', 'sub'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setCommitteeFilter(tab)}
                        className={`px-2.5 py-1 rounded-md font-bold cursor-pointer transition-colors ${
                          committeeFilter === tab
                            ? 'bg-[#064E3B] text-white'
                            : 'bg-[#F8FAF7] dark:bg-[#071713] text-[#718078] dark:text-[#9AB0A6] border border-[#E5EAE6] dark:border-[#1B3B31]'
                        }`}
                      >
                        {tab === 'all' ? 'All' : tab === 'core' ? 'Core' : 'Sub Wing'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {filteredCommittee.length === 0 ? (
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Executive committee members will be listed here.
                </p>
              ) : (
                <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredCommittee.map((m) => {
                    const isSub = m.committeeType === 'sub';
                    return (
                      <StaggerItem key={m.id}>
                        <InteractiveCard
                          spotlight
                          shine
                          className="group p-3.5 rounded-xl bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/45 dark:hover:border-[#D4AF37]/50 flex items-center gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <SafeImage
                              src={m.avatarUrl || '/images/avatar_admin_portrait.jpg'}
                              alt={m.fullName}
                              className="w-11 h-11 rounded-full object-cover border border-[#D4AF37]/40 group-hover:scale-105 transition-transform shrink-0"
                            />
                            <div className="min-w-0">
                              <span
                                className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-0.5 ${
                                  isSub
                                    ? 'bg-amber-500/15 text-amber-800 dark:text-[#D4AF37]'
                                    : 'bg-[#064E3B]/10 dark:bg-[#D4AF37]/15 text-[#064E3B] dark:text-[#D4AF37]'
                                }`}
                              >
                                {isSub ? 'Sub Committee' : 'Core Committee'}
                              </span>
                              <div className="text-sm font-bold text-[#17221F] dark:text-[#F0F5F2] truncate">
                                {m.fullName}
                              </div>
                              <div className="text-xs font-semibold text-[#064E3B] dark:text-[#D4AF37] truncate">
                                {isSub
                                  ? `${m.wingName || m.department || 'Sub Wing'} · ${
                                      m.subRole || m.position || m.designation
                                    }`
                                  : m.designation || m.position}
                              </div>
                            </div>
                          </div>
                        </InteractiveCard>
                      </StaggerItem>
                    );
                  })}
                </StaggerGrid>
              )}
            </section>

            <section className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 shadow-xs">
              <h2 className="text-lg font-bold text-[#17221F] dark:text-[#F0F5F2] mb-4">
                Program Highlights
              </h2>
              {publishedResults.length === 0 ? (
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6]">
                  Official program results and honors will appear here once published.
                </p>
              ) : (
                <StaggerGrid className="space-y-3">
                  {publishedResults.slice(0, 4).map((prog) => (
                    <StaggerItem key={prog.id}>
                      <InteractiveCard
                        spotlight
                        shine
                        className="p-3.5 rounded-xl bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#064E3B]/45 dark:hover:border-[#D4AF37]/50"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-[#064E3B] dark:text-[#D4AF37]">
                          <span>{prog.category}</span>
                          <span className="tabular-nums">{prog.programDate}</span>
                        </div>
                        <div className="text-sm font-bold text-[#17221F] dark:text-[#F0F5F2] mt-0.5">
                          {prog.programName}
                        </div>
                        <div className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-1">
                          {prog.winnerSummary}
                        </div>
                      </InteractiveCard>
                    </StaggerItem>
                  ))}
                </StaggerGrid>
              )}
            </section>
          </SectionReveal>
        )}

        {/* 10. CONTACT INFORMATION & MESSAGE FORM */}
        <section
          id="contact"
          className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 sm:p-8 shadow-xs"
        >
          <div className="lg:col-span-5 space-y-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#064E3B] dark:text-[#D4AF37]">
                Get in Touch
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-[#17221F] dark:text-[#F0F5F2] mt-1">
                {homepageConfig?.contactHeading || 'Contact Al-Nibras Office'}
              </h2>
              <p className="text-xs sm:text-sm text-[#718078] dark:text-[#9AB0A6] mt-1">
                Reach out to the Union Secretariat for academic inquiries, event participation, or official correspondence.
              </p>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] shrink-0 mt-1" />
                <div>
                  <div className="font-bold text-[#17221F] dark:text-[#F0F5F2]">Office Location</div>
                  <div className="text-[#718078] dark:text-[#9AB0A6]">
                    {homepageConfig?.contactAddress || settings.officeLocation}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] shrink-0 mt-1" />
                <div>
                  <div className="font-bold text-[#17221F] dark:text-[#F0F5F2]">Email Address</div>
                  <div className="text-[#718078] dark:text-[#9AB0A6]">
                    {homepageConfig?.contactEmail || settings.officeEmail}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-[#064E3B] dark:text-[#D4AF37] shrink-0 mt-1" />
                <div>
                  <div className="font-bold text-[#17221F] dark:text-[#F0F5F2]">Phone</div>
                  <div className="text-[#718078] dark:text-[#9AB0A6]">
                    {homepageConfig?.contactPhone || '+91 98765 43210'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleContactSubmit} className="lg:col-span-7 space-y-4">
            {contactError && (
              <motion.div
                key={contactError}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="animate-subtle-shake p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-200 font-medium"
              >
                {contactError}
              </motion.div>
            )}
            {contactSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Your message has been delivered to the Al-Nibras Union Office.</span>
              </motion.div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                  Your Name *
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-sm text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-sm text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                Subject *
              </label>
              <input
                type="text"
                value={contactSubject}
                onChange={(e) => setContactSubject(e.target.value)}
                placeholder="Subject of your message"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-sm text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                Message *
              </label>
              <textarea
                rows={3}
                value={contactBody}
                onChange={(e) => setContactBody(e.target.value)}
                placeholder="Write your message here..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-sm text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all"
                required
              />
            </div>

            <RippleButton
              type="submit"
              loading={submittingContact}
              className="group inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-50"
            >
              {!submittingContact && (
                <Send className="w-3.5 h-3.5 text-[#D4AF37] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              )}
              <span>{submittingContact ? 'Sending...' : 'Send Message'}</span>
            </RippleButton>
          </form>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#0B3D32] text-white border-t border-[#D4AF37]/30 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/80">
          <div className="flex items-center gap-3">
            <OfficialLogo branding={branding} placement="footer" size="sm" showText={false} />
            <span className="font-bold text-white">
              {settings.unionName || 'Al-Nibras Class Union'} · {settings.academicSession}
            </span>
          </div>
          <div>
            {homepageConfig?.footerCopyright ||
              '© 2026 Al-Nibras Class Union · 11th Batch of DHBC. All Rights Reserved.'}
          </div>
        </div>
      </footer>

      {/* Search Result Quick-View Modal */}
      <AnimatePresence>
        {selectedSearchItem && (
          <motion.div
            key="search-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelectedSearchItem(null)}
          >
            <motion.div
              key="search-modal-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: ALNIBRAS_EASE }}
              className="w-full max-w-lg bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-[#064E3B] to-[#0B3D32] px-5 py-4 text-white flex items-center justify-between border-b border-[#D4AF37]/30">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#D4AF37] text-[#071713] text-[10px] font-extrabold uppercase tracking-wider">
                    {selectedSearchItem.kind}
                  </span>
                  <span className="text-xs font-semibold text-white/85">
                    {selectedSearchItem.referenceCode || selectedSearchItem.category}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSearchItem(null)}
                  aria-label="Close detail preview"
                  className="p-1 text-white/75 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <h3 className="text-lg font-bold text-[#17221F] dark:text-[#F0F5F2]">
                  {selectedSearchItem.title}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#718078] dark:text-[#9AB0A6]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#064E3B] dark:text-[#D4AF37]" />
                    {selectedSearchItem.dateLabel}
                  </span>
                  {selectedSearchItem.venue && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#064E3B] dark:text-[#D4AF37]" />
                      {selectedSearchItem.venue}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#17221F]/90 dark:text-[#F0F5F2]/90 leading-relaxed whitespace-pre-line">
                  {selectedSearchItem.content}
                </p>
                <div className="pt-3 border-t border-[#E5EAE6] dark:border-[#1B3B31] flex items-center justify-end gap-2">
                  <a
                    href={
                      selectedSearchItem.kind === 'notice'
                        ? '#notices'
                        : '#announcements'
                    }
                    onClick={() => setSelectedSearchItem(null)}
                    className="px-4 py-2 rounded-lg bg-[#064E3B] text-white text-xs font-bold hover:bg-[#0B3D32] transition-colors press-scale"
                  >
                    Jump to Section
                  </a>
                  <button
                    type="button"
                    onClick={() => setSelectedSearchItem(null)}
                    className="px-4 py-2 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] text-xs font-semibold cursor-pointer press-scale"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox Viewer for Public Photo Gallery */}
      <PhotoLightboxModal
        items={publicGallery}
        currentIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={(nextIdx) => setLightboxIndex(nextIdx)}
      />
    </div>
  );
}
