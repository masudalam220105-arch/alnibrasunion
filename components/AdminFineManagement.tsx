'use client';

import React, { useMemo, useState } from 'react';
import {
  IndianRupee,
  Search,
  Filter,
  Plus,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Ban,
  FileText,
  Trash2,
  Edit,
  X,
  Users,
  ChevronDown,
} from 'lucide-react';
import type { CustomTypeRecord, FineRecord, FineStatus, UserProfile } from '@/lib/types';
import { filterFines, formatINR, getIndiaDateISO } from '@/lib/portal-logic';
import { CustomTypeSelector } from './CustomTypeSelector';
import { DeviceFileUpload, type UploadedFileMeta } from './DeviceFileUpload';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import SelectWithCustom from './SelectWithCustom';

export interface AdminFineManagementProps {
  fines: FineRecord[];
  users: UserProfile[];
  customTypes: CustomTypeRecord[];
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast: (message: string, type: 'success' | 'error') => void;
  onAddNewCustomType?: (module: string, name: string) => void;
}

const DEFAULT_FINE_CATEGORIES = ['Library', 'Administrative', 'Academic', 'Disciplinary', 'Equipment', 'Program'];

export function AdminFineManagement({
  fines = [],
  users = [],
  customTypes = [],
  onMutate,
  showToast,
  onAddNewCustomType,
}: AdminFineManagementProps) {
  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FineStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedStudentFilter, setSelectedStudentFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingFine, setEditingFine] = useState<FineRecord | null>(null);
  const [pendingDeleteFine, setPendingDeleteFine] = useState<FineRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [recipientMode, setRecipientMode] = useState<'single' | 'multiple' | 'class'>('single');
  const [selectedStudentUids, setSelectedStudentUids] = useState<string[]>([]);
  const [singleStudentUid, setSingleStudentUid] = useState<string>('');
  const [selectedDepartmentClass, setSelectedDepartmentClass] = useState<string>('all');

  const [fineForm, setFineForm] = useState(() => ({
    title: '',
    description: '',
    amount: 250,
    category: 'Library',
    issueDate: getIndiaDateISO(),
    dueDate: getIndiaDateISO(new Date(Date.now() + 14 * 86400000)),
    status: 'unpaid' as FineStatus,
    documentUrl: '',
    documentName: '',
  }));

  const filtered = useMemo(() => {
    return filterFines(fines, {
      query: searchQuery,
      status: statusFilter,
      studentUid: selectedStudentFilter === 'all' ? '' : selectedStudentFilter,
      category: categoryFilter,
    });
  }, [fines, searchQuery, statusFilter, selectedStudentFilter, categoryFilter]);

  // Summary Metrics
  const stats = useMemo(() => {
    let unpaidTotal = 0;
    let paidTotal = 0;
    let overdueCount = 0;
    let unpaidCount = 0;
    let paidCount = 0;

    for (const f of fines) {
      if (f.status === 'unpaid') {
        unpaidTotal += f.amount;
        unpaidCount += 1;
      } else if (f.status === 'overdue') {
        unpaidTotal += f.amount;
        overdueCount += 1;
      } else if (f.status === 'paid') {
        paidTotal += f.amount;
        paidCount += 1;
      }
    }
    return { unpaidTotal, paidTotal, overdueCount, unpaidCount, paidCount };
  }, [fines]);

  const openCreateModal = () => {
    setEditingFine(null);
    setRecipientMode('single');
    setSingleStudentUid(students[0]?.uid || '');
    setSelectedStudentUids([]);
    setFineForm({
      title: '',
      description: '',
      amount: 250,
      category: 'Library',
      issueDate: getIndiaDateISO(),
      dueDate: getIndiaDateISO(new Date(Date.now() + 14 * 86400000)),
      status: 'unpaid',
      documentUrl: '',
      documentName: '',
    });
    setShowModal(true);
  };

  const openEditModal = (fine: FineRecord) => {
    setEditingFine(fine);
    setRecipientMode('single');
    setSingleStudentUid(fine.studentUid);
    setFineForm({
      title: fine.title,
      description: fine.description,
      amount: fine.amount,
      category: fine.category,
      issueDate: fine.issueDate,
      dueDate: fine.dueDate,
      status: fine.status,
      documentUrl: fine.documentUrl || '',
      documentName: fine.documentName || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fineForm.title.trim()) {
      showToast('Fine title is required.', 'error');
      return;
    }
    if (fineForm.amount <= 0) {
      showToast('Fine amount must be greater than zero.', 'error');
      return;
    }

    if (editingFine) {
      const res = await onMutate({
        action: 'UPDATE_FINE',
        fineId: editingFine.id,
        ...fineForm,
      });
      if (res.ok) {
        showToast('Fine record successfully updated.', 'success');
        setShowModal(false);
      } else {
        showToast(res.error || 'Failed to update fine record.', 'error');
      }
      return;
    }

    // Determine target students
    let targetStudents: UserProfile[] = [];
    if (recipientMode === 'single') {
      const found = students.find((s) => s.uid === singleStudentUid);
      if (found) targetStudents = [found];
    } else if (recipientMode === 'multiple') {
      targetStudents = students.filter((s) => selectedStudentUids.includes(s.uid));
    } else if (recipientMode === 'class') {
      targetStudents =
        selectedDepartmentClass === 'all'
          ? students
          : students.filter((s) => s.department === selectedDepartmentClass);
    }

    if (targetStudents.length === 0) {
      showToast('Please select at least one student recipient.', 'error');
      return;
    }

    const res = await onMutate({
      action: 'CREATE_FINE',
      targetStudentUids: targetStudents.map((s) => s.uid),
      ...fineForm,
    });

    if (res.ok) {
      showToast(`Fine record issued to ${targetStudents.length} student(s).`, 'success');
      setShowModal(false);
    } else {
      showToast(res.error || 'Failed to issue fine.', 'error');
    }
  };

  const handleDelete = (fine: FineRecord) => {
    setPendingDeleteFine(fine);
  };

  const executeDeleteFine = async () => {
    if (!pendingDeleteFine) return;
    setIsDeleting(true);
    try {
      const res = await onMutate({
        action: 'DELETE_FINE',
        fineId: pendingDeleteFine.id,
      });
      if (res.ok) {
        showToast('Fine record deleted.', 'success');
        setPendingDeleteFine(null);
      } else {
        showToast(res.error || 'Failed to delete fine.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateStatus = async (fine: FineRecord, newStatus: FineStatus) => {
    const res = await onMutate({
      action: 'UPDATE_FINE_STATUS',
      fineId: fine.id,
      status: newStatus,
    });
    if (res.ok) {
      showToast(`Fine status changed to ${newStatus.toUpperCase()}.`, 'success');
    } else {
      showToast(res.error || 'Failed to update fine status.', 'error');
    }
  };

  const handleExportReport = () => {
    if (filtered.length === 0) {
      showToast('No fine records to export in current filter view.', 'error');
      return;
    }

    const headers = [
      'Fine ID',
      'Student Name',
      'Student Roll',
      'Department',
      'Title',
      'Category',
      'Amount (INR)',
      'Status',
      'Issue Date',
      'Due Date',
      'Settled At',
    ];

    const rows = filtered.map((f) => [
      f.id,
      `"${f.studentName.replace(/"/g, '""')}"`,
      f.studentRoll,
      `"${f.studentDepartment.replace(/"/g, '""')}"`,
      `"${f.title.replace(/"/g, '""')}"`,
      `"${f.category.replace(/"/g, '""')}"`,
      f.amount,
      f.status,
      f.issueDate,
      f.dueDate,
      f.paidAt || 'N/A',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `alnibras-fines-report-${getIndiaDateISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${filtered.length} fine records to CSV report.`, 'success');
  };

  const uniqueDepartments = Array.from(new Set(students.map((s) => s.department)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif-display font-bold text-[#0B192C]">
            Fine &amp; Dues Management System
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer institutional fines, late dues, disciplinary penalties, and receipt issuance
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-[#C5A059]" />
            Export Fine Report
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B192C] bg-[#C5A059] hover:bg-[#d4b06a] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Issue New Fine
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Unpaid Dues</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {formatINR(stats.unpaidTotal)}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              ({stats.unpaidCount + stats.overdueCount} notices)
            </span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Paid Dues</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {formatINR(stats.paidTotal)}
            <span className="text-xs font-normal text-slate-400 ml-1.5">
              ({stats.paidCount} cleared)
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
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Records</span>
            <IndianRupee className="w-4 h-4 text-[#0B192C]" />
          </div>
          <p className="text-2xl font-bold text-[#0B192C] font-mono-tabular">
            {fines.length}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        <div className="sm:col-span-4 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student, title, description, or roll..."
            className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
          />
        </div>

        <div className="sm:col-span-3">
          <SelectWithCustom
            aria-label="Filter by fine status"
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as 'all' | FineStatus)}
            options={[
              { value: 'all', label: 'All Fine Statuses' },
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'paid', label: 'Paid' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            customPlaceholder="Type status..."
            selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#0B192C]"
          />
        </div>

        <div className="sm:col-span-3">
          <SelectWithCustom
            aria-label="Filter by student"
            value={selectedStudentFilter}
            onChange={setSelectedStudentFilter}
            options={[
              { value: 'all', label: 'All Students' },
              ...students.map((s) => ({
                value: s.uid,
                label: `${s.fullName} (${s.rollNumber})`,
              })),
            ]}
            customPlaceholder="Type student UID..."
            selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#0B192C]"
          />
        </div>

        <div className="sm:col-span-2">
          <SelectWithCustom
            aria-label="Filter by fine category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: 'all', label: 'All Categories' },
              ...DEFAULT_FINE_CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
            savedCustomOptions={customTypes
              .filter((ct) => ct.module === 'fines')
              .map((ct) => ct.name)}
            customPlaceholder="Type category..."
            selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-[#0B192C]"
          />
        </div>
      </div>

      {/* Fines Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No fines match your search and filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Student Scholar</th>
                  <th className="py-3 px-4">Fine Title &amp; Details</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((fine) => {
                  return (
                    <tr key={fine.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-[#0B192C]">{fine.studentName}</p>
                        <p className="text-[11px] text-slate-500 font-mono-tabular">
                          Roll: {fine.studentRoll} · {fine.studentDepartment}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="font-medium text-slate-900">{fine.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">{fine.description}</p>
                        {fine.documentUrl && (
                          <a
                            href={fine.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#B48A3E] hover:underline mt-0.5"
                          >
                            <FileText className="w-3 h-3" />
                            {fine.documentName || 'Supporting Notice Attachment'}
                          </a>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-700">{fine.category}</td>

                      <td className="py-3.5 px-4 font-bold text-[#0B192C] font-mono-tabular">
                        {formatINR(fine.amount)}
                      </td>

                      <td className="py-3.5 px-4 font-mono-tabular text-slate-600">
                        <div>{fine.dueDate}</div>
                        <div className="text-[11px] text-slate-400">Issued: {fine.issueDate}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
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
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {fine.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(fine, 'paid')}
                            title="Mark as Paid"
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {fine.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(fine, 'unpaid')}
                            title="Mark as Unpaid"
                            className="p-1 text-amber-600 hover:bg-amber-50 rounded cursor-pointer"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                        )}
                        {fine.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(fine, 'cancelled')}
                            title="Cancel Fine"
                            className="p-1 text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(fine)}
                          title="Edit Fine"
                          className="p-1 text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(fine)}
                          title="Delete Fine"
                          className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Fine Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8">
            <div className="bg-[#0B192C] px-6 py-4 text-white flex items-center justify-between border-b border-[#C5A059]/30">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-[#C5A059]" />
                <h3 className="font-serif-display font-bold text-lg text-white">
                  {editingFine ? 'Edit Fine Record' : 'Issue Institutional Fine Notice'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {!editingFine && (
                <div className="space-y-2 pb-3 border-b border-slate-100">
                  <label className="block text-xs font-semibold text-slate-700">
                    Recipient Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setRecipientMode('single')}
                      className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                        recipientMode === 'single'
                          ? 'border-[#0B192C] bg-[#0B192C] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Single Student
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientMode('multiple')}
                      className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                        recipientMode === 'multiple'
                          ? 'border-[#0B192C] bg-[#0B192C] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Multiple Students
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipientMode('class')}
                      className={`p-2 rounded-lg border font-medium text-center transition-colors cursor-pointer ${
                        recipientMode === 'class'
                          ? 'border-[#0B192C] bg-[#0B192C] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Entire Cohort / Class
                    </button>
                  </div>

                  {recipientMode === 'single' && (
                    <div className="pt-2">
                      <label className="block text-slate-600 mb-1">Select Student</label>
                      <SelectWithCustom
                        aria-label="Select Student"
                        value={singleStudentUid}
                        onChange={setSingleStudentUid}
                        options={students.map((s) => ({
                          value: s.uid,
                          label: `${s.fullName} (${s.rollNumber}) · ${s.department}`,
                        }))}
                        customPlaceholder="Type student UID..."
                        selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                        required
                      />
                    </div>
                  )}

                  {recipientMode === 'multiple' && (
                    <div className="pt-2 space-y-1">
                      <label className="block text-slate-600 mb-1">
                        Select Students ({selectedStudentUids.length} selected)
                      </label>
                      <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-[#FAF9F5]">
                        {students.map((s) => {
                          const isChecked = selectedStudentUids.includes(s.uid);
                          return (
                            <label
                              key={s.uid}
                              className="flex items-center gap-2 text-xs text-slate-800 hover:bg-white p-1 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudentUids((prev) => [...prev, s.uid]);
                                  } else {
                                    setSelectedStudentUids((prev) =>
                                      prev.filter((id) => id !== s.uid)
                                    );
                                  }
                                }}
                              />
                              <span>
                                {s.fullName} ({s.rollNumber}) · {s.department}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {recipientMode === 'class' && (
                    <div className="pt-2">
                      <label className="block text-slate-600 mb-1">
                        Select Academic Department / Cohort
                      </label>
                      <SelectWithCustom
                        aria-label="Select Academic Department or Cohort"
                        value={selectedDepartmentClass}
                        onChange={setSelectedDepartmentClass}
                        options={[
                          { value: 'all', label: 'All Enrolled Scholars (Entire Union)' },
                          ...uniqueDepartments.map((dept) => ({ value: dept, label: dept })),
                        ]}
                        customPlaceholder="Type department or cohort..."
                        selectClassName="w-full px-3 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg text-slate-800"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fine Title
                </label>
                <input
                  type="text"
                  value={fineForm.title}
                  onChange={(e) => setFineForm({ ...fineForm, title: e.target.value })}
                  placeholder="e.g. Late Return of Archival Monograph, AV Equipment Retention..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description &amp; Violation Details
                </label>
                <textarea
                  rows={3}
                  value={fineForm.description}
                  onChange={(e) => setFineForm({ ...fineForm, description: e.target.value })}
                  placeholder="Provide precise details of the fee or infraction..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B192C]"
                />
              </div>

              {/* Category (with Custom Type) & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CustomTypeSelector
                  label="Fine Category"
                  module="fines"
                  defaultOptions={DEFAULT_FINE_CATEGORIES}
                  customTypes={customTypes}
                  value={fineForm.category}
                  onChange={(val) => setFineForm({ ...fineForm, category: val })}
                  onAddNewCustomType={onAddNewCustomType}
                  onDeleteCustomType={async (id, name) => {
                    const res = await onMutate({ action: 'DELETE_CUSTOM_TYPE', id });
                    if (res.ok) {
                      showToast(`Custom category "${name}" removed.`, 'success');
                    } else {
                      showToast(res.error || 'Failed to remove custom category.', 'error');
                    }
                  }}
                  required
                />

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fine Amount (₹ INR)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={fineForm.amount}
                    onChange={(e) =>
                      setFineForm({ ...fineForm, amount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
              </div>

              {/* Issue Date & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={fineForm.issueDate}
                    onChange={(e) => setFineForm({ ...fineForm, issueDate: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={fineForm.dueDate}
                    onChange={(e) => setFineForm({ ...fineForm, dueDate: e.target.value })}
                    className="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg font-mono-tabular"
                    required
                  />
                </div>
              </div>

              {editingFine && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Settlement Status
                  </label>
                  <SelectWithCustom
                    aria-label="Settlement Status"
                    value={fineForm.status}
                    onChange={(val) => setFineForm({ ...fineForm, status: val as FineStatus })}
                    options={[
                      { value: 'unpaid', label: 'Unpaid' },
                      { value: 'paid', label: 'Paid' },
                      { value: 'overdue', label: 'Overdue' },
                      { value: 'cancelled', label: 'Cancelled' },
                    ]}
                    customPlaceholder="Type settlement status..."
                    selectClassName="w-full px-3.5 py-2 text-xs bg-[#FAF9F5] border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {/* Upload Supporting Document from Device */}
              <div className="pt-2">
                <DeviceFileUpload
                  label="Upload Supporting Document (Optional)"
                  accept="application/pdf,.doc,.docx,image/*"
                  helpText="Attach official notice, citation slip, or receipt from your device"
                  currentUrl={fineForm.documentUrl}
                  currentName={fineForm.documentName}
                  onFileUploaded={(meta: UploadedFileMeta) => {
                    setFineForm({
                      ...fineForm,
                      documentUrl: meta.url,
                      documentName: meta.name,
                    });
                  }}
                  onClear={() => {
                    setFineForm({
                      ...fineForm,
                      documentUrl: '',
                      documentName: '',
                    });
                  }}
                  compact
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0B192C] text-white font-semibold rounded-lg hover:bg-[#162944]"
                >
                  {editingFine ? 'Save Changes' : 'Issue Fine Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(pendingDeleteFine)}
        title="Delete Fine Record"
        itemLabel={
          pendingDeleteFine
            ? `${pendingDeleteFine.title} (${pendingDeleteFine.studentName} · ${formatINR(pendingDeleteFine.amount)})`
            : undefined
        }
        description="This will permanently remove the fine notice from the student's dues ledger."
        isDeleting={isDeleting}
        onCancel={() => setPendingDeleteFine(null)}
        onConfirm={executeDeleteFine}
      />
    </div>
  );
}
