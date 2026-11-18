'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  Download,
  Filter,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  FileText,
  X,
  Trash2,
} from 'lucide-react';
import type { ActivityActionType, ActivityLog, UserProfile, UserRole } from '@/lib/types';
import {
  filterActivityLogs,
  formatIndiaDateTime,
  getIndiaDateISO,
} from '@/lib/portal-logic';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import SelectWithCustom from './SelectWithCustom';

export interface AdminActivityLogsViewProps {
  activityLogs: ActivityLog[];
  users: UserProfile[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  actionTypeFilter: 'ALL' | ActivityActionType;
  onActionTypeChange: (value: 'ALL' | ActivityActionType) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  onResetFilters: () => void;
  onDeleteLog?: (id: string) => Promise<{ ok: boolean; error?: string }>;
  showToast?: (message: string, type: 'success' | 'error') => void;
}

const ACTION_TYPES: ActivityActionType[] = [
  'LOGIN',
  'LOGOUT',
  'ACCOUNT_CREATION',
  'USERNAME_CHANGE',
  'PASSWORD_CHANGE',
  'PROFILE_UPDATE',
  'CONTENT_PUBLICATION',
  'CONTENT_EDIT',
  'CONTENT_DELETION',
];

export function AdminActivityLogsView({
  activityLogs,
  users,
  searchQuery,
  onSearchChange,
  actionTypeFilter,
  onActionTypeChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onResetFilters,
  onDeleteLog,
  showToast,
}: AdminActivityLogsViewProps) {
  const [pendingDeleteLog, setPendingDeleteLog] = useState<ActivityLog | null>(null);
  const [isDeletingLog, setIsDeletingLog] = useState(false);
  const userRoleMap = useMemo(() => {
    const map = new Map<string, UserRole>();
    for (const u of users) {
      map.set(u.uid, u.role);
    }
    return map;
  }, [users]);

  const filteredLogs = useMemo(() => {
    return filterActivityLogs(activityLogs, {
      query: searchQuery,
      actionType: actionTypeFilter,
      startDate,
      endDate,
    });
  }, [activityLogs, searchQuery, actionTypeFilter, startDate, endDate]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || actionTypeFilter !== 'ALL' || startDate || endDate
  );

  // Summary metrics for filtered logs
  const stats = useMemo(() => {
    let securityEvents = 0;
    let studentActions = 0;
    let contentOps = 0;

    for (const log of filteredLogs) {
      if (
        log.actionType === 'LOGIN' ||
        log.actionType === 'LOGOUT' ||
        log.actionType === 'PASSWORD_CHANGE' ||
        log.actionType === 'USERNAME_CHANGE' ||
        log.actionType === 'ACCOUNT_CREATION'
      ) {
        securityEvents += 1;
      }

      if (
        log.actionType === 'CONTENT_PUBLICATION' ||
        log.actionType === 'CONTENT_EDIT' ||
        log.actionType === 'CONTENT_DELETION'
      ) {
        contentOps += 1;
      }

      const role = userRoleMap.get(log.actorId);
      if (role === 'student' || log.actorId.startsWith('student_')) {
        studentActions += 1;
      }
    }

    return {
      totalMatching: filteredLogs.length,
      securityEvents,
      studentActions,
      contentOps,
    };
  }, [filteredLogs, userRoleMap]);

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      showToast?.('No activity logs in current filter to export.', 'error');
      return;
    }

    const headers = ['Log ID', 'Actor Name', 'Actor ID', 'Activity Type', 'Details', 'Record ID', 'Timestamp'];
    const rows = filteredLogs.map((log) => [
      log.id,
      `"${log.actorName.replace(/"/g, '""')}"`,
      log.actorId,
      log.actionType,
      `"${log.details.replace(/"/g, '""')}"`,
      log.targetId,
      log.createdAt,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `alnibras-activity-logs-${getIndiaDateISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast?.(`Exported ${filteredLogs.length} activity log entries to CSV.`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
            Security &amp; Operational Activity Logs
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable audit trail of logins, account creation, credential updates, and content publication with search and date-range filtering
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            aria-label="Download CSV"
            title="Download CSV"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B192C] bg-[#C5A059] hover:bg-[#d4b06a] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      </div>

      {/* Audit Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Matching Logs</span>
            <Activity className="w-4 h-4 text-[#C5A059]" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {stats.totalMatching}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              / {activityLogs.length} total
            </span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Student Actions</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {stats.studentActions}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Auth &amp; Security</span>
            <ShieldCheck className="w-4 h-4 text-[#0B192C]" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {stats.securityEvents}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">CMS Operations</span>
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {stats.contentOps}
          </p>
        </div>
      </div>

      {/* Search, Activity Type, and Date-Range Filtering Bar */}
      <div className="bg-white p-5 border border-slate-200 rounded-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Search Input */}
          <div className="md:col-span-5">
            <label
              htmlFor="activity-log-search-input"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Search Activity Logs
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="activity-log-search-input"
                type="text"
                aria-label="Search activity logs"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search by actor, details, action type, or record ID..."
                className="w-full pl-10 pr-9 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search query"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Activity Type Select */}
          <div className="md:col-span-3">
            <label
              htmlFor="activity-log-type-select"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Activity Type
            </label>
            <SelectWithCustom
              id="activity-log-type-select"
              aria-label="Filter by activity type"
              value={actionTypeFilter}
              onChange={(val) => onActionTypeChange(val as 'ALL' | ActivityActionType)}
              options={[
                { value: 'ALL', label: 'All Activity Types' },
                ...ACTION_TYPES.map((type) => ({ value: type, label: type })),
              ]}
              customPlaceholder="Type activity type..."
              selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#0B192C]"
            />
          </div>

          {/* Start Date Input */}
          <div className="md:col-span-2">
            <label
              htmlFor="activity-log-start-date"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Start Date
            </label>
            <div className="relative">
              <input
                id="activity-log-start-date"
                type="date"
                aria-label="Start date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#0B192C]"
              />
            </div>
          </div>

          {/* End Date Input */}
          <div className="md:col-span-2">
            <label
              htmlFor="activity-log-end-date"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              End Date
            </label>
            <div className="relative">
              <input
                id="activity-log-end-date"
                type="date"
                aria-label="End date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#0B192C]"
              />
            </div>
          </div>
        </div>

        {/* Quick Date Range Presets & Active Filter Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-[#C5A059]" />
              Quick Date Range:
            </span>
            <button
              type="button"
              onClick={() => {
                onStartDateChange('');
                onEndDateChange('');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                !startDate && !endDate
                  ? 'bg-[#0B192C] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => {
                onStartDateChange('2026-11-01');
                onEndDateChange('2026-11-03');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                startDate === '2026-11-01' && endDate === '2026-11-03'
                  ? 'bg-[#0B192C] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Nov 1 – Nov 3, 2026
            </button>
            <button
              type="button"
              onClick={() => {
                onStartDateChange('2026-11-04');
                onEndDateChange('2026-11-05');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                startDate === '2026-11-04' && endDate === '2026-11-05'
                  ? 'bg-[#0B192C] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Nov 4 – Nov 5, 2026
            </button>
            <button
              type="button"
              onClick={() => {
                onStartDateChange('2026-11-05');
                onEndDateChange('2026-11-05');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                startDate === '2026-11-05' && endDate === '2026-11-05'
                  ? 'bg-[#0B192C] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Nov 5 Only
            </button>
          </div>

          <div className="text-xs text-slate-500 font-mono-tabular">
            Showing <span className="font-semibold text-[#0B192C]">{filteredLogs.length}</span> of{' '}
            <span className="font-semibold text-[#0B192C]">{activityLogs.length}</span> entries
            {(startDate || endDate) && (
              <span className="ml-2 text-[#B48A3E]">
                ({startDate || 'Start'} → {endDate || 'Present'})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Activity Logs Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="py-14 px-6 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Activity className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[#0B192C]">
                No Activity Logs Match Your Filter Criteria
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Try broadening your search query, selecting &ldquo;All Activity Types&rdquo;, or adjusting the start and end dates.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B192C] rounded-lg hover:bg-[#162a45] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Search &amp; Date Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">User Identity</th>
                  <th className="py-3.5 px-4">Activity Type</th>
                  <th className="py-3.5 px-4">Audit Description</th>
                  <th className="py-3.5 px-4">Record ID</th>
                  <th className="py-3.5 px-4 text-right">Date &amp; Time</th>
                  {onDeleteLog && <th className="py-3.5 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogs.map((log) => {
                  const role = userRoleMap.get(log.actorId);
                  const isStudent = role === 'student' || log.actorId.startsWith('student_');
                  const dateObj = new Date(log.createdAt);
                  const isoDate = !isNaN(dateObj.getTime())
                    ? getIndiaDateISO(dateObj)
                    : '';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#0B192C]">{log.actorName}</div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular">
                          {isStudent ? 'Student Scholar' : 'Administrator'} · {log.actorId}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono-tabular text-[#B48A3E] font-medium">
                        {log.actionType}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 max-w-md">{log.details}</td>
                      <td className="py-3.5 px-4 font-mono-tabular text-slate-500">
                        {log.targetId}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular">
                        <div className="text-[#0B192C] font-medium">
                          {formatIndiaDateTime(dateObj)}
                        </div>
                        <div className="text-[11px] text-slate-400">{isoDate}</div>
                      </td>
                      {onDeleteLog && (
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setPendingDeleteLog(log)}
                            title="Delete log entry"
                            aria-label={`Delete activity log ${log.id}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={Boolean(pendingDeleteLog)}
        title="Delete Activity Log Entry"
        itemLabel={pendingDeleteLog ? `${pendingDeleteLog.actionType} · ${pendingDeleteLog.details}` : undefined}
        description="This will remove the selected activity log record from the portal audit list."
        isDeleting={isDeletingLog}
        onCancel={() => setPendingDeleteLog(null)}
        onConfirm={async () => {
          if (!pendingDeleteLog || !onDeleteLog) return;
          setIsDeletingLog(true);
          try {
            const res = await onDeleteLog(pendingDeleteLog.id);
            if (res.ok) {
              showToast?.('Activity log entry deleted.', 'success');
              setPendingDeleteLog(null);
            } else {
              showToast?.(res.error || 'Failed to delete activity log.', 'error');
            }
          } finally {
            setIsDeletingLog(false);
          }
        }}
      />
    </div>
  );
}
