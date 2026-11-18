'use client';

import React, { useMemo, useState } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Search,
  CheckCircle,
  Clock,
  Lock,
  User,
  AlertCircle,
  RotateCcw,
  History,
} from 'lucide-react';
import type { PasswordResetLog, UserProfile } from '@/lib/types';
import { formatIndiaDateTime } from '@/lib/portal-logic';
import SelectWithCustom from './SelectWithCustom';

export interface AccountPasswordManagementProps {
  users: UserProfile[];
  passwordResetLogs: PasswordResetLog[];
  onInitiateReset: (payload: {
    targetUid: string;
    newPassword?: string;
    notes?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  showToast: (message: string, type: 'success' | 'error') => void;
  onViewActivityHistory?: (user: UserProfile) => void;
}

export function AccountPasswordManagement({
  users = [],
  passwordResetLogs = [],
  onInitiateReset,
  showToast,
  onViewActivityHistory,
}: AccountPasswordManagementProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student'>('all');

  const [selectedUserForReset, setSelectedUserForReset] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetNotes, setResetNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const managedUsers = useMemo(() => {
    return users.filter((u) => u.role !== 'admin');
  }, [users]);

  const filteredUsers = useMemo(() => {
    return managedUsers.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.studentId.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [managedUsers, roleFilter, searchQuery]);

  const handleOpenResetModal = (user: UserProfile) => {
    setSelectedUserForReset(user);
    setNewPassword('');
    setConfirmPassword('');
    setResetNotes(`Administrative credential reset authorized by Super Admin for ${user.fullName}.`);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForReset) return;

    if (newPassword.length < 6) {
      showToast('New password must contain at least 6 characters.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onInitiateReset({
        targetUid: selectedUserForReset.uid,
        newPassword,
        notes: resetNotes,
      });

      if (res.ok) {
        showToast(
          `Security password reset successfully applied for @${selectedUserForReset.username}.`,
          'success'
        );
        setSelectedUserForReset(null);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        showToast(res.error || 'Failed to apply password reset.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
          Account Security &amp; Password Management
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Dedicated administrative console for student scholar password resets and security audit verification
        </p>
      </div>

      {/* Security Best Practices Banner */}
      <div className="bg-[#FAF9F5] border-l-4 border-l-[#C5A059] p-4 rounded-r-xl border border-slate-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#C5A059] shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs">
          <h4 className="font-semibold text-[#0B192C]">
            Zero-Plaintext Security Enforcement
          </h4>
          <p className="text-slate-600 leading-relaxed">
            Passwords are never displayed in plaintext or returned in network payloads. Resetting an account immediately invalidates prior credentials, writes an immutable audit record, and updates the cryptographic hash.
          </p>
        </div>
      </div>

      {/* Account Directory for Password Reset */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-4 p-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative grow max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search scholar by name, username, or ID..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Role:</span>
            <SelectWithCustom
              aria-label="Filter accounts by role"
              value={roleFilter}
              onChange={(val) => setRoleFilter(val as 'all' | 'student')}
              options={[
                { value: 'all', label: 'All Managed Accounts' },
                { value: 'student', label: 'Student Scholars Only' },
              ]}
              customPlaceholder="Type role..."
              selectClassName="px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-3 px-4">Account Holder</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Security Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-[#0B192C]">{user.fullName}</p>
                    <p className="text-[11px] text-slate-500 font-mono-tabular">
                      ID: {user.studentId} · {user.department}
                    </p>
                  </td>

                  <td className="py-3 px-4 capitalize font-medium text-slate-700">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        user.role === 'teacher'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-mono-tabular text-slate-700">
                    @{user.username}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        user.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right space-x-2">
                    {onViewActivityHistory && (
                      <button
                        type="button"
                        onClick={() => onViewActivityHistory(user)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded text-xs cursor-pointer"
                        title="View Account-Specific Activity History"
                      >
                        <History className="w-3.5 h-3.5 text-[#C5A059]" />
                        Activity
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenResetModal(user)}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-[#0B192C] hover:bg-[#162944] text-white rounded text-xs font-semibold cursor-pointer shadow-xs"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-[#C5A059]" />
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Audit Logs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <h3 className="font-semibold text-xs text-[#0B192C] uppercase tracking-wider">
            Administrative Password Reset Audit Trail
          </h3>
          <p className="text-[11px] text-slate-500">
            Chronological verification of administrative password resets initiated across the portal
          </p>
        </div>

        <div className="overflow-x-auto text-xs">
          {passwordResetLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No administrative password resets recorded yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="py-2.5 px-4">Target User</th>
                  <th className="py-2.5 px-4">Initiated By</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Administrative Notes</th>
                  <th className="py-2.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {passwordResetLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 font-mono-tabular">
                    <td className="py-2.5 px-4 font-semibold text-[#0B192C]">
                      {log.targetName} (@{log.targetUsername})
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{log.initiatedByName}</td>
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[10px] uppercase">
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 font-sans max-w-xs truncate">
                      {log.notes || 'Secretariat verification completed'}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-500">
                      {formatIndiaDateTime(log.initiatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Reset Password Modal */}
      {selectedUserForReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/75 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-[#0B192C] px-6 py-4 text-white flex items-center justify-between border-b border-[#C5A059]/30">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-serif-display font-bold text-base text-white">
                  Reset Password for @{selectedUserForReset.username}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForReset(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetSubmit} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                <p className="font-semibold">{selectedUserForReset.fullName}</p>
                <p className="text-[11px] font-mono-tabular">
                  Role: {selectedUserForReset.role.toUpperCase()} · ID: {selectedUserForReset.studentId}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Secure Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter at least 6 characters..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password to confirm..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Audit Notes / Reason
                </label>
                <textarea
                  rows={2}
                  value={resetNotes}
                  onChange={(e) => setResetNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedUserForReset(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#0B192C] hover:bg-[#162944] text-white font-semibold rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'Updating...' : 'Set New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
