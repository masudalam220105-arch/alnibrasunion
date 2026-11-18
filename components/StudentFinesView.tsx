'use client';

import React, { useMemo, useState } from 'react';
import {
  IndianRupee,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  FileText,
} from 'lucide-react';
import { formatIndiaDate, formatINR } from '@/lib/portal-logic';
import type { FineRecord, FineStatus, UserProfile } from '@/lib/types';

export interface StudentFinesViewProps {
  currentUser: UserProfile;
  fines: FineRecord[];
  showToast?: (message: string, type: 'success' | 'error') => void;
}

export function StudentFinesView({
  currentUser,
  fines = [],
  showToast,
}: StudentFinesViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | FineStatus>('all');

  const myFines = useMemo(() => {
    return fines.filter((f) => f.studentUid === currentUser.uid);
  }, [fines, currentUser.uid]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return myFines;
    return myFines.filter((f) => f.status === statusFilter);
  }, [myFines, statusFilter]);

  const stats = useMemo(() => {
    let unpaidTotal = 0;
    let paidTotal = 0;
    let overdueCount = 0;
    let unpaidCount = 0;

    for (const f of myFines) {
      if (f.status === 'unpaid') {
        unpaidTotal += f.amount;
        unpaidCount += 1;
      } else if (f.status === 'overdue') {
        unpaidTotal += f.amount;
        overdueCount += 1;
      } else if (f.status === 'paid') {
        paidTotal += f.amount;
      }
    }
    return { unpaidTotal, paidTotal, overdueCount, unpaidCount };
  }, [myFines]);

  const handleDownloadNotice = (fine: FineRecord) => {
    const textContent = `
=====================================================
AL-NIBRAS CLASS UNION - OFFICIAL DUES & FINE NOTICE
=====================================================
Notice ID: ${fine.id}
Student: ${fine.studentName} (Roll: ${fine.studentRoll})
Date Issued: ${fine.issueDate}
Due Date: ${fine.dueDate}
Category: ${fine.category}
Status: ${fine.status.toUpperCase()}
Amount Due: ${formatINR(fine.amount)} (INR)

Title: ${fine.title}
Details:
${fine.description}

Payment Instructions:
Please present this official slip at the Union Secretariat Office
(Suite 204, Second Floor) during administrative working hours.
=====================================================
    `.trim();

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AL_NIBRAS_Fine_Notice_${fine.id}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast?.('Official fine notice downloaded.', 'success');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif-display font-bold text-[#0B192C] flex items-center gap-2">
          <IndianRupee className="w-6 h-6 text-[#C5A059]" />
          My Fines
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Review your personal union fines, late library items, and settlement receipts in Indian Rupees (₹ INR)
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Unpaid Fines (INR)</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {formatINR(stats.unpaidTotal)}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              ({stats.unpaidCount + stats.overdueCount} active)
            </span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Overdue Notices</span>
            <Clock className="w-4 h-4 text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-600 font-mono-tabular">
            {stats.overdueCount}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Settled &amp; Paid (INR)</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 font-mono-tabular">
            {formatINR(stats.paidTotal)}
          </p>
        </div>
      </div>

      {/* Filter by status */}
      <div className="flex items-center justify-between bg-white p-3.5 border border-slate-200 rounded-xl">
        <span className="text-xs font-semibold text-slate-700">Filter by Status:</span>
        <div className="flex items-center gap-1.5 text-xs">
          {(['all', 'unpaid', 'paid', 'overdue', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#0B192C] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Fines Cards / List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-xs text-slate-500">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-800">No Fines or Pending Notices</p>
            <p className="text-slate-400 mt-0.5">Your union fine record is in perfect standing.</p>
          </div>
        ) : (
          filtered.map((fine) => (
            <div
              key={fine.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      fine.status === 'paid'
                        ? 'bg-emerald-100 text-emerald-800'
                        : fine.status === 'overdue'
                        ? 'bg-red-100 text-red-800'
                        : fine.status === 'cancelled'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {fine.status}
                  </span>
                  <span className="text-xs font-medium text-[#B48A3E]">
                    {fine.category}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-[#0B192C]">{fine.title}</h3>
                <p className="text-xs text-slate-600">{fine.description}</p>
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 font-mono-tabular pt-1">
                  <span>Issued: {fine.issueDate}</span>
                  <span>Due Date: {fine.dueDate}</span>
                  {fine.paidAt && (
                    <span className="text-emerald-700 font-medium">
                      Settled: {formatIndiaDate(fine.paidAt)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                <div className="text-xl font-bold text-[#0B192C] font-mono-tabular">
                  {formatINR(fine.amount)}
                </div>
                <div className="flex items-center gap-2">
                  {fine.documentUrl && (
                    <a
                      href={fine.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={fine.documentName || 'Supporting_Document'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF9F5] border border-slate-300 text-slate-700 hover:text-[#0B192C] rounded-lg text-xs font-medium"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#C5A059]" />
                      Attachment
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDownloadNotice(fine)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0B192C] hover:bg-[#162944] text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                    Download Notice
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
