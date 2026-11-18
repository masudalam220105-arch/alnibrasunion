'use client';

import React, { useMemo } from 'react';
import {
  History,
  X,
  User,
  Shield,
  Clock,
  Calendar,
  CheckCircle,
  KeyRound,
  FileEdit,
  LogIn,
  AlertTriangle,
} from 'lucide-react';
import type { ActivityActionType, ActivityLog, UserProfile } from '@/lib/types';
import {
  formatIndiaDate,
  formatIndiaDateTime,
  getAccountActivityLogs,
} from '@/lib/portal-logic';

export interface AccountActivityHistoryModalProps {
  user: UserProfile | null;
  activityLogs: ActivityLog[];
  onClose: () => void;
}

export function AccountActivityHistoryModal({
  user,
  activityLogs = [],
  onClose,
}: AccountActivityHistoryModalProps) {
  const targetUid = user?.uid;
  const logs = useMemo(() => {
    if (!targetUid) return [];
    return getAccountActivityLogs(activityLogs, targetUid);
  }, [activityLogs, targetUid]);

  if (!user) return null;

  const actionIcon = (type: ActivityActionType) => {
    switch (type) {
      case 'LOGIN':
        return <LogIn className="w-3.5 h-3.5 text-blue-600" />;
      case 'PASSWORD_CHANGE':
      case 'PASSWORD_RESET_INITIATED':
        return <KeyRound className="w-3.5 h-3.5 text-amber-600" />;
      case 'ACCOUNT_CREATION':
      case 'TEACHER_CREATION':
        return <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />;
      case 'PROFILE_UPDATE':
      case 'USERNAME_CHANGE':
        return <FileEdit className="w-3.5 h-3.5 text-indigo-600" />;
      case 'ACCOUNT_DELETED':
        return <AlertTriangle className="w-3.5 h-3.5 text-red-600" />;
      default:
        return <Shield className="w-3.5 h-3.5 text-[#C5A059]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#0B192C] px-6 py-4 text-white flex items-center justify-between border-b border-[#C5A059]/30">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-[#C5A059]" />
            <div>
              <h3 className="font-serif-display font-bold text-base text-white">
                Account Activity History &amp; Audit Trail
              </h3>
              <p className="text-[11px] text-slate-300">
                {user.fullName} (@{user.username}) · {user.role.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="p-5 border-b border-slate-100 bg-[#FAF9F5]/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular">
          <div>
            <span className="text-[11px] text-slate-500 block uppercase">Identifier</span>
            <span className="font-semibold text-[#0B192C]">{user.studentId}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block uppercase">Status</span>
            <span className="font-semibold text-emerald-700 uppercase">{user.status}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block uppercase">Member Since</span>
            <span className="font-semibold text-slate-700">
              {formatIndiaDate(user.createdAt)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 block uppercase">Total Logs</span>
            <span className="font-semibold text-[#0B192C]">{logs.length} entries</span>
          </div>
        </div>

        {/* Timeline Stream */}
        <div className="p-6 max-h-96 overflow-y-auto space-y-4 text-xs">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              No historical activity records found for this account.
            </div>
          ) : (
            <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {logs.map((log) => {
                const dateObj = new Date(log.createdAt);
                return (
                  <div key={log.id} className="relative group">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-[#C5A059] flex items-center justify-center shadow-xs">
                      {actionIcon(log.actionType)}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1 shadow-2xs hover:border-[#0B192C] transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-tabular text-[11px] font-semibold text-[#B48A3E]">
                          {log.actionType}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-slate-400">
                          {formatIndiaDateTime(dateObj)}
                        </span>
                      </div>

                      <p className="text-slate-700">{log.details}</p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular pt-1 border-t border-slate-50">
                        <span>Performed By: {log.actorName}</span>
                        <span>Record ID: {log.targetId}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0B192C] text-white rounded-lg text-xs font-semibold hover:bg-[#162944]"
          >
            Close Activity Log
          </button>
        </div>
      </div>
    </div>
  );
}
