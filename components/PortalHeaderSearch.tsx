'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  Megaphone,
  FileText,
  Users,
  Building2,
  ArrowUpRight,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ALNIBRAS_EASE } from './MotionPrimitives';
import { SafeImage } from './SafeImage';
import {
  searchPortalTopBar,
  type PortalTopSearchFilter,
  type PortalTopSearchResult,
} from '@/lib/portal-search';
import type { PortalDatabaseState } from '@/lib/types';

interface PortalHeaderSearchProps {
  viewerRole: 'admin' | 'teacher' | 'student';
  state: PortalDatabaseState;
  onSelectResult: (result: PortalTopSearchResult) => void;
}

const FILTER_TABS: { id: PortalTopSearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'notice', label: 'Notices' },
  { id: 'user', label: 'Users & Dept' },
];

export function PortalHeaderSearch({
  viewerRole,
  state,
  onSelectResult,
}: PortalHeaderSearchProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PortalTopSearchFilter>('all');
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () =>
      searchPortalTopBar({
        query,
        filter,
        viewerRole,
        announcements: state.announcements,
        notices: state.notices,
        users: state.users,
        committeeMembers: state.committeeMembers,
        limit: 18,
      }),
    [
      query,
      filter,
      viewerRole,
      state.announcements,
      state.notices,
      state.users,
      state.committeeMembers,
    ]
  );

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setMobileExpanded(false);
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        setMobileExpanded(true);
        setOpen(true);
        inputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const handleChoose = (item: PortalTopSearchResult) => {
    setOpen(false);
    setMobileExpanded(false);
    onSelectResult(item);
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Compact mobile toggle icon */}
      <button
        type="button"
        onClick={() => {
          setMobileExpanded((prev) => {
            const next = !prev;
            if (next) {
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 60);
            }
            return next;
          });
        }}
        aria-label="Toggle portal search"
        data-testid="portal-mobile-search-toggle"
        className="md:hidden p-2 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2] hover:border-[#064E3B] dark:hover:border-[#D4AF37] transition-colors cursor-pointer"
      >
        {mobileExpanded ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
      </button>

      {/* Desktop & Expanded Tablet Input */}
      <div
        className={`${
          mobileExpanded
            ? 'fixed left-3 right-3 top-16 z-50 md:static md:w-60 xl:w-64'
            : 'hidden md:block md:w-52 lg:w-56 xl:w-64'
        }`}
      >
        <div className="relative group">
          <Search className="w-4 h-4 text-[#718078] dark:text-[#9AB0A6] group-focus-within:text-[#064E3B] dark:group-focus-within:text-[#D4AF37] transition-colors absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder="Search announcements, notices, users, dept..."
            aria-label="Search announcements, notices, or users by name or department"
            data-testid="portal-header-search-input"
            className="w-full pl-9 pr-14 py-2 text-xs bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-lg text-[#17221F] dark:text-[#F0F5F2] placeholder:text-[#718078] dark:placeholder:text-[#9AB0A6] focus:outline-none focus:border-[#064E3B] dark:focus:border-[#D4AF37] focus:ring-2 focus:ring-[#064E3B]/15 dark:focus:ring-[#D4AF37]/20 transition-all shadow-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              data-testid="portal-header-search-clear"
              aria-label="Clear portal search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#718078] hover:text-[#17221F] dark:hover:text-white rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#718078] dark:text-[#9AB0A6] bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              /
            </kbd>
          )}
        </div>

        {/* Search Results Dropdown */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: ALNIBRAS_EASE }}
              data-testid="portal-header-search-results"
              className="absolute left-0 right-0 md:left-auto md:right-0 md:w-[430px] mt-2 bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              {/* Category Filter Strip */}
              <div className="px-3 py-2.5 bg-[#F8FAF7] dark:bg-[#071713] border-b border-[#E5EAE6] dark:border-[#1B3B31] flex flex-wrap items-center gap-1.5">
                {FILTER_TABS.map((tab) => {
                  const active = filter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFilter(tab.id)}
                      data-testid={`portal-search-filter-${tab.id}`}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#064E3B] text-white dark:bg-[#D4AF37] dark:text-[#071713]'
                          : 'bg-white dark:bg-[#0D231D] text-[#718078] dark:text-[#9AB0A6] border border-[#E5EAE6] dark:border-[#1B3B31] hover:text-[#17221F] dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
                <span className="ml-auto text-[10px] font-mono text-[#718078] dark:text-[#9AB0A6]">
                  {results.length} found
                </span>
              </div>

              {/* Result Items */}
              <div className="max-h-80 overflow-y-auto divide-y divide-[#E5EAE6] dark:divide-[#1B3B31]">
                {results.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#718078] dark:text-[#9AB0A6]">
                    No announcements, notices, or users matched &ldquo;{query}&rdquo;.
                  </div>
                ) : (
                  results.map((item) => (
                    <button
                      key={`${item.kind}-${item.id}`}
                      type="button"
                      onClick={() => handleChoose(item)}
                      data-testid={`portal-search-item-${item.kind}-${item.id}`}
                      className="w-full text-left px-3.5 py-3 hover:bg-[#F8FAF7] dark:hover:bg-[#112A22] transition-colors flex items-start gap-3 cursor-pointer group"
                    >
                      {item.kind === 'user' && item.avatarUrl ? (
                        <div className="w-9 h-9 rounded-full overflow-hidden border border-[#D4AF37]/50 shrink-0 mt-0.5">
                          <SafeImage
                            src={item.avatarUrl}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border ${
                            item.kind === 'announcement'
                              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-[#D4AF37]'
                              : item.kind === 'notice'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-[#064E3B] dark:text-emerald-300'
                              : 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/50 text-sky-700 dark:text-sky-300'
                          }`}
                        >
                          {item.kind === 'announcement' ? (
                            <Megaphone className="w-4 h-4" />
                          ) : item.kind === 'notice' ? (
                            <FileText className="w-4 h-4" />
                          ) : (
                            <Users className="w-4 h-4" />
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-[#17221F] dark:text-white truncate">
                            {item.title}
                          </p>
                          <ArrowUpRight className="w-3.5 h-3.5 text-[#718078] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                        <p className="text-[11px] font-medium text-[#064E3B] dark:text-[#D4AF37] truncate mt-0.5">
                          {item.kind === 'user' && item.department ? (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3 shrink-0" />
                              <span>{item.subtitle}</span>
                            </span>
                          ) : (
                            item.subtitle
                          )}
                        </p>
                        <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6] line-clamp-1 mt-0.5">
                          {item.content}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default PortalHeaderSearch;
