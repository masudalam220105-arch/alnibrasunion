'use client';

import React, { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Eye,
  EyeOff,
  Bell,
  Search,
  Trash2,
  Edit,
  X,
  FileText,
  Download,
  CalendarDays,
  List,
} from 'lucide-react';
import type { CalendarEvent, CustomTypeRecord, UserProfile } from '@/lib/types';
import { filterCalendarEvents, getIndiaDateISO } from '@/lib/portal-logic';
import { CustomTypeSelector } from './CustomTypeSelector';
import { DeviceFileUpload, type UploadedFileMeta } from './DeviceFileUpload';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import SelectWithCustom from './SelectWithCustom';

export interface AdvancedCalendarViewProps {
  currentUser: UserProfile;
  calendarEvents: CalendarEvent[];
  customTypes: CustomTypeRecord[];
  onMutate?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast?: (message: string, type: 'success' | 'error') => void;
  onAddNewCustomType?: (module: string, name: string) => void;
}

const DEFAULT_CALENDAR_CATEGORIES = ['Academic', 'Meeting', 'Examination', 'Holiday', 'Symposium', 'Program', 'Deadline'];

export function AdvancedCalendarView({
  currentUser,
  calendarEvents = [],
  customTypes = [],
  onMutate,
  showToast,
  onAddNewCustomType,
}: AdvancedCalendarViewProps) {
  const isAdmin = currentUser.role === 'admin';

  // Navigation Date: defaults to current India Standard Time (IST) date
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(`${getIndiaDateISO()}T00:00:00`));
  const [viewMode, setViewMode] = useState<'monthly' | 'weekly' | 'daily' | 'agenda'>('monthly');

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<CalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Event Form State
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    category: 'Academic',
    startDate: getIndiaDateISO(),
    endDate: getIndiaDateISO(),
    startTime: '09:00',
    endTime: '11:00',
    location: 'Main Auditorium, Ibn Khaldun Hall',
    isAllDay: false,
    visibility: 'public' as 'public' | 'private',
    reminder: '1 day prior',
    imageUrl: '',
    attachmentUrl: '',
    attachmentName: '',
  });

  const filteredEvents = useMemo(() => {
    return filterCalendarEvents(calendarEvents, {
      userRole: currentUser.role,
      category: categoryFilter,
      query: searchQuery,
    });
  }, [calendarEvents, currentUser.role, categoryFilter, searchQuery]);

  // Calendar Calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (dateString: string) => {
    if (isAdmin) {
      setEditingEvent(null);
      setEventForm({
        title: '',
        description: '',
        category: 'Academic',
        startDate: dateString,
        endDate: dateString,
        startTime: '09:00',
        endTime: '11:00',
        location: 'Union Complex, Suite 204',
        isAllDay: false,
        visibility: 'public',
        reminder: '1 day prior',
        imageUrl: '',
        attachmentUrl: '',
        attachmentName: '',
      });
      setShowEventModal(true);
    }
  };

  const openEditModal = (evt: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingEvent(evt);
    setEventForm({
      title: evt.title,
      description: evt.description,
      category: evt.category,
      startDate: evt.startDate,
      endDate: evt.endDate,
      startTime: evt.startTime || '09:00',
      endTime: evt.endTime || '11:00',
      location: evt.location,
      isAllDay: evt.isAllDay,
      visibility: evt.visibility,
      reminder: evt.reminder || '1 day prior',
      imageUrl: evt.imageUrl || '',
      attachmentUrl: evt.attachmentUrl || '',
      attachmentName: evt.attachmentName || '',
    });
    setViewingEvent(null);
    setShowEventModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.title.trim()) {
      showToast?.('Event title is required.', 'error');
      return;
    }
    if (!onMutate) return;

    const res = await onMutate({
      action: 'SAVE_CALENDAR_EVENT',
      id: editingEvent ? editingEvent.id : undefined,
      ...eventForm,
    });

    if (res.ok) {
      showToast?.(
        editingEvent ? 'Calendar event updated.' : 'New calendar event scheduled successfully.',
        'success'
      );
      setShowEventModal(false);
    } else {
      showToast?.(res.error || 'Failed to save calendar event.', 'error');
    }
  };

  const handleDelete = (evt: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPendingDeleteEvent(evt);
  };

  const executeDeleteCalendarEvent = async () => {
    if (!pendingDeleteEvent || !onMutate) return;
    setIsDeleting(true);
    try {
      const res = await onMutate({
        action: 'DELETE_CALENDAR_EVENT',
        calendarEventId: pendingDeleteEvent.id,
      });

      if (res.ok) {
        showToast?.('Calendar event removed.', 'success');
        setViewingEvent(null);
        setPendingDeleteEvent(null);
      } else {
        showToast?.(res.error || 'Failed to delete event.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const categoryColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'examination':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'meeting':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'holiday':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'program':
      case 'symposium':
        return 'bg-amber-100 text-amber-900 border-amber-200';
      default:
        return 'bg-slate-100 text-[#0B192C] border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
            Academic &amp; Union Calendar
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Synchronized schedule of colloquia, examinations, secretariat meetings, and university holidays
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* View Mode Toggle */}
          <div className="bg-white border border-slate-200 rounded-lg p-1 flex items-center gap-1 text-xs">
            {(['monthly', 'weekly', 'daily', 'agenda'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition-colors cursor-pointer ${
                  viewMode === m
                    ? 'bg-[#0B192C] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                const today = getIndiaDateISO();
                handleDateClick(today);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B192C] bg-[#C5A059] hover:bg-[#d4b06a] rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Event
            </button>
          )}
        </div>
      </div>

      {/* Control Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-slate-700 cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-base font-bold text-[#0B192C] font-serif-display tracking-wide">
            {monthNames[month]} {year}
          </h2>

          <button
            type="button"
            onClick={() => setCurrentDate(new Date(`${getIndiaDateISO()}T00:00:00`))}
            className="px-2.5 py-1 text-xs border border-slate-200 text-slate-600 hover:text-[#0B192C] rounded-md cursor-pointer"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter events..."
              className="pl-8 pr-3 py-1.5 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
            />
          </div>

          <SelectWithCustom
            aria-label="Filter calendar by category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'all', label: 'All Categories' },
              ...DEFAULT_CALENDAR_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
            ]}
            savedCustomOptions={customTypes
              .filter((ct) => ct.module === 'calendar')
              .map((ct) => ct.name)}
            customPlaceholder="Type category..."
            selectClassName="px-2.5 py-1.5 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-700"
          />
        </div>
      </div>

      {/* MONTHLY VIEW */}
      {viewMode === 'monthly' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          {/* Day of Week Header */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 py-2.5">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 min-h-[500px]">
            {/* Empty offset days */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`offset-${i}`} className="p-2 bg-slate-50/30 text-slate-300" />
            ))}

            {/* Calendar Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(
                dayNum
              ).padStart(2, '0')}`;
              const isToday = dateStr === getIndiaDateISO();

              const dayEvents = filteredEvents.filter(
                (e) => e.startDate <= dateStr && e.endDate >= dateStr
              );

              return (
                <div
                  key={dateStr}
                  onClick={() => handleDateClick(dateStr)}
                  className={`p-2 min-h-[90px] flex flex-col justify-between transition-colors relative group ${
                    isAdmin ? 'cursor-pointer hover:bg-slate-50/70' : ''
                  } ${isToday ? 'bg-[#FAF9F5]' : 'bg-white'}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono-tabular font-semibold rounded-full w-6 h-6 flex items-center justify-center ${
                        isToday
                          ? 'bg-[#0B192C] text-white shadow-xs'
                          : 'text-slate-700'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {isAdmin && (
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-[#B48A3E] font-medium transition-opacity">
                        + Add
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mt-1 grow overflow-hidden">
                    {dayEvents.slice(0, 3).map((evt) => (
                      <div
                        key={evt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingEvent(evt);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium truncate border cursor-pointer hover:opacity-85 ${categoryColor(
                          evt.category
                        )}`}
                        title={`${evt.title} (${evt.category})`}
                      >
                        {evt.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-slate-400 font-mono-tabular">
                        +{dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AGENDA / LIST VIEW */}
      {viewMode === 'agenda' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs divide-y divide-slate-100">
          {filteredEvents.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No calendar events found.
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${categoryColor(
                        evt.category
                      )}`}
                    >
                      {evt.category}
                    </span>
                    {evt.visibility === 'private' && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                        <EyeOff className="w-3 h-3" /> Private Admin
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-[#0B192C]">{evt.title}</h3>
                  <p className="text-xs text-slate-600">{evt.description}</p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-mono-tabular pt-1">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5 text-[#C5A059]" />
                      {evt.startDate} {evt.endDate !== evt.startDate ? `→ ${evt.endDate}` : ''}
                    </span>
                    {!evt.isAllDay && evt.startTime && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {evt.startTime} - {evt.endTime}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {evt.location}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setViewingEvent(evt)}
                    className="px-3 py-1.5 text-xs text-[#0B192C] bg-[#FAF9F5] border border-slate-300 hover:bg-white rounded-lg font-medium cursor-pointer"
                  >
                    View Details
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => openEditModal(evt, e)}
                        className="p-1.5 text-slate-600 hover:text-[#0B192C] hover:bg-slate-100 rounded cursor-pointer"
                        title="Edit Event"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(evt, e)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                        title="Delete Event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* WEEKLY & DAILY FALLBACK GRIDS */}
      {(viewMode === 'weekly' || viewMode === 'daily') && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="text-xs text-slate-500">
            {viewMode === 'weekly'
              ? 'Displaying 7-Day Union Schedule'
              : 'Displaying Daily Time Blocks'}
          </div>
          <div className="space-y-3">
            {filteredEvents.slice(0, 6).map((evt) => (
              <div
                key={evt.id}
                onClick={() => setViewingEvent(evt)}
                className="p-4 rounded-xl border border-slate-200 hover:border-[#0B192C] transition-all cursor-pointer bg-[#FAF9F5]/40 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${categoryColor(
                        evt.category
                      )}`}
                    >
                      {evt.category}
                    </span>
                    <span className="text-xs font-mono-tabular text-slate-500">
                      {evt.startDate}
                    </span>
                  </div>
                  <h4 className="font-semibold text-sm text-[#0B192C]">{evt.title}</h4>
                  <p className="text-xs text-slate-500">{evt.location}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono-tabular text-[#B48A3E]">
                    {evt.isAllDay ? 'All Day' : `${evt.startTime} - ${evt.endTime}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {viewingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/75 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="bg-[#0B192C] px-6 py-4 text-white flex items-center justify-between border-b border-[#C5A059]/30">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-serif-display font-bold text-lg text-white">
                  Calendar Event Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingEvent(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-semibold uppercase ${categoryColor(
                    viewingEvent.category
                  )}`}
                >
                  {viewingEvent.category}
                </span>
                <h2 className="text-lg font-serif-display font-bold text-[#0B192C]">
                  {viewingEvent.title}
                </h2>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {viewingEvent.description}
              </p>

              <div className="grid grid-cols-2 gap-3 p-3 bg-[#FAF9F5] rounded-lg border border-slate-100 font-mono-tabular">
                <div>
                  <span className="text-slate-400 text-[11px] block">Start Date &amp; Time</span>
                  <span className="font-semibold text-slate-800">
                    {viewingEvent.startDate} {viewingEvent.startTime && `· ${viewingEvent.startTime}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">End Date &amp; Time</span>
                  <span className="font-semibold text-slate-800">
                    {viewingEvent.endDate} {viewingEvent.endTime && `· ${viewingEvent.endTime}`}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 text-[11px] block">Venue &amp; Location</span>
                  <span className="font-semibold text-slate-800">{viewingEvent.location}</span>
                </div>
              </div>

              {viewingEvent.attachmentUrl && (
                <div className="pt-2">
                  <a
                    href={viewingEvent.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={viewingEvent.attachmentName || 'Event_Attachment'}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FAF9F5] border border-slate-300 text-[#0B192C] rounded-lg text-xs font-semibold hover:bg-slate-100"
                  >
                    <Download className="w-4 h-4 text-[#C5A059]" />
                    Download {viewingEvent.attachmentName || 'Official Attachment'}
                  </a>
                </div>
              )}

              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(viewingEvent)}
                      className="px-3 py-1.5 bg-[#0B192C] text-white rounded-lg text-xs font-semibold"
                    >
                      Edit Event
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(viewingEvent)}
                      className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs"
                    >
                      Delete
                    </button>
                  </div>
                ) : <div />}
                <button
                  type="button"
                  onClick={() => setViewingEvent(null)}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Add / Edit Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8">
            <div className="bg-[#0B192C] px-6 py-4 text-white flex items-center justify-between border-b border-[#C5A059]/30">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-serif-display font-bold text-lg text-white">
                  {editingEvent ? 'Edit Calendar Event' : 'Schedule New Calendar Event'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Event Title
                </label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  placeholder="e.g. Mid-Term Jurisprudential Examination Series..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                />
              </div>

              {/* Category (with Custom Type) & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CustomTypeSelector
                  label="Category"
                  module="calendar"
                  defaultOptions={DEFAULT_CALENDAR_CATEGORIES}
                  customTypes={customTypes}
                  value={eventForm.category}
                  onChange={(val) => setEventForm({ ...eventForm, category: val })}
                  onAddNewCustomType={onAddNewCustomType}
                  onDeleteCustomType={
                    onMutate
                      ? async (id, name) => {
                          const res = await onMutate({ action: 'DELETE_CUSTOM_TYPE', id });
                          if (res.ok) {
                            showToast?.(`Custom category "${name}" removed.`, 'success');
                          } else {
                            showToast?.(res.error || 'Failed to remove custom category.', 'error');
                          }
                        }
                      : undefined
                  }
                  required
                />

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Location / Venue
                  </label>
                  <input
                    type="text"
                    value={eventForm.location}
                    onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              {/* Dates & Times */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={eventForm.startDate}
                    onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs bg-[#FAF9F5] border border-slate-300 rounded font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={eventForm.endDate}
                    onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs bg-[#FAF9F5] border border-slate-300 rounded font-mono-tabular"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={eventForm.startTime}
                    disabled={eventForm.isAllDay}
                    onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs bg-[#FAF9F5] border border-slate-300 rounded font-mono-tabular disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={eventForm.endTime}
                    disabled={eventForm.isAllDay}
                    onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs bg-[#FAF9F5] border border-slate-300 rounded font-mono-tabular disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Toggles: All Day & Visibility */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-slate-200 bg-[#FAF9F5]">
                  <input
                    type="checkbox"
                    checked={eventForm.isAllDay}
                    onChange={(e) => setEventForm({ ...eventForm, isAllDay: e.target.checked })}
                  />
                  <span className="font-semibold text-slate-800">All-Day Event</span>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Audience Visibility
                  </label>
                  <SelectWithCustom
                    aria-label="Audience Visibility"
                    value={eventForm.visibility}
                    onChange={(val) =>
                      setEventForm({
                        ...eventForm,
                        visibility: val as 'public' | 'private',
                      })
                    }
                    options={[
                      { value: 'public', label: 'Public (Visible to All Students & Faculty)' },
                      { value: 'private', label: 'Private (Admin Secretariat Only)' },
                    ]}
                    customPlaceholder="Type visibility..."
                    selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Upload Document / Flyer from Device */}
              <div className="pt-2 border-t border-slate-100">
                <DeviceFileUpload
                  label="Upload Event Circular / Flyer (from your device)"
                  helpText="Attach official event schedule, syllabus, or flyer (PDF / Image)"
                  accept="application/pdf,image/*"
                  currentUrl={eventForm.attachmentUrl}
                  currentName={eventForm.attachmentName}
                  onFileUploaded={(meta: UploadedFileMeta) => {
                    setEventForm({
                      ...eventForm,
                      attachmentUrl: meta.url,
                      attachmentName: meta.name,
                    });
                  }}
                  onClear={() => {
                    setEventForm({
                      ...eventForm,
                      attachmentUrl: '',
                      attachmentName: '',
                    });
                  }}
                  compact
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0B192C] text-white font-semibold rounded-lg hover:bg-[#162944]"
                >
                  {editingEvent ? 'Save Changes' : 'Schedule Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(pendingDeleteEvent)}
        title="Delete Calendar Event"
        itemLabel={
          pendingDeleteEvent
            ? `${pendingDeleteEvent.title} (${pendingDeleteEvent.startDate})`
            : undefined
        }
        description="This will permanently remove the event from the Union Academic Calendar."
        isDeleting={isDeleting}
        onCancel={() => setPendingDeleteEvent(null)}
        onConfirm={executeDeleteCalendarEvent}
      />
    </div>
  );
}
