'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileText,
  Medal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  CertificateRecord,
  CertificateSettings,
  ContentStatus,
  CustomTypeRecord,
  PortalDatabaseState,
  ProgramParticipant,
  ProgramResult,
  ResultGrade,
  ResultPosition,
  StudentResultRecord,
  UserProfile,
} from '@/lib/types';
import {
  calculateResultPoints,
  filterProgramResults,
  getIndiaDateISO,
} from '@/lib/portal-logic';
import DeviceFileUpload from './DeviceFileUpload';
import CustomTypeSelector from './CustomTypeSelector';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import CertificatePreviewModal, { downloadCertificateAsPdf } from './CertificateModalAndPdf';
import SelectWithCustom from './SelectWithCustom';

export interface ProgramResultsViewProps {
  currentUser: UserProfile;
  state: PortalDatabaseState;
  programResults?: ProgramResult[];
  customTypes?: CustomTypeRecord[];
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onAddNewCustomType?: (module: string, name: string) => void;
}

const DEFAULT_CATEGORIES = ['Debate', 'Quiz', 'Cultural', 'Sports', 'Academic', 'General'];
const POSITIONS: ResultPosition[] = ['1st Place', '2nd Place', '3rd Place', 'None'];
const GRADES: ResultGrade[] = ['A', 'B', 'None'];

export function ProgramResultsView({
  currentUser,
  state,
  onMutate,
  showToast,
}: ProgramResultsViewProps) {
  const isAdmin = currentUser.role === 'admin';
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<ProgramResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [programName, setProgramName] = useState('');
  const [description, setDescription] = useState('');
  const [programDate, setProgramDate] = useState(() => getIndiaDateISO());
  const [publicationDate, setPublicationDate] = useState(() => getIndiaDateISO());
  const [category, setCategory] = useState('Debate');
  const [status, setStatus] = useState<ContentStatus>('published');
  const [winnerSummary, setWinnerSummary] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [certificateTitle, setCertificateTitle] = useState('CERTIFICATE OF ACHIEVEMENT');
  const [certificateSubtitle, setCertificateSubtitle] = useState(
    'OFFICIAL HONORS & SCHOLASTIC MERIT CONFERMENT'
  );
  const [participants, setParticipants] = useState<ProgramParticipant[]>([]);

  // Searchable student dropdown state
  const [studentSearch, setStudentSearch] = useState('');

  // Certificate preview modal state
  const [previewCertificate, setPreviewCertificate] = useState<CertificateRecord | null>(null);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'PROGRAM' | 'STUDENT_RESULT';
    id: string;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const registeredStudents = useMemo(
    () => (state.users || []).filter((u) => u.role === 'student'),
    [state.users]
  );

  const customCategories = useMemo(() => {
    const custom = (state.customTypes || [])
      .filter((ct: CustomTypeRecord) => ct.module === 'programResults')
      .map((ct: CustomTypeRecord) => ct.name);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...custom]));
  }, [state.customTypes]);

  const filteredResults = useMemo(() => {
    return filterProgramResults(state.programResults || [], {
      query: searchQuery,
      category: categoryFilter,
      userRole: currentUser.role,
    });
  }, [state.programResults, searchQuery, categoryFilter, currentUser.role]);

  const filteredStudentCandidates = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return registeredStudents.filter((s) => {
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    });
  }, [registeredStudents, studentSearch]);

  const openCreateModal = () => {
    setEditingResult(null);
    setProgramName('');
    setDescription('');
    setProgramDate(getIndiaDateISO());
    setPublicationDate(getIndiaDateISO());
    setCategory('Debate');
    setStatus('published');
    setWinnerSummary('');
    setDocumentUrl('');
    setDocumentName('');
    setImageUrl('');
    setCertificateTitle(state.certificateSettings?.title || 'CERTIFICATE OF ACHIEVEMENT');
    setCertificateSubtitle(
      state.certificateSettings?.subtitle || 'OFFICIAL HONORS & SCHOLASTIC MERIT CONFERMENT'
    );
    setParticipants([]);
    setStudentSearch('');
    setModalOpen(true);
  };

  const openEditModal = (res: ProgramResult) => {
    setEditingResult(res);
    setProgramName(res.programName);
    setDescription(res.description);
    setProgramDate(res.programDate);
    setPublicationDate(res.publicationDate || res.programDate);
    setCategory(res.category);
    setStatus(res.status);
    setWinnerSummary(res.winnerSummary || '');
    setDocumentUrl(res.documentUrl || '');
    setDocumentName(res.documentName || '');
    setImageUrl(res.imageUrl || '');
    setCertificateTitle(
      res.certificateTitle || state.certificateSettings?.title || 'CERTIFICATE OF ACHIEVEMENT'
    );
    setCertificateSubtitle(
      res.certificateSubtitle ||
        state.certificateSettings?.subtitle ||
        'OFFICIAL HONORS & SCHOLASTIC MERIT CONFERMENT'
    );
    setParticipants(
      (res.participants || []).map((p) => {
        const calc = calculateResultPoints(p.position, p.grade);
        return {
          ...p,
          position: calc.position,
          grade: calc.grade,
          positionPoints: calc.positionPoints,
          gradePoints: calc.gradePoints,
          totalPoints: calc.totalPoints,
        };
      })
    );
    setStudentSearch('');
    setModalOpen(true);
  };

  const handleSelectStudentForProgram = (student: UserProfile) => {
    if (participants.some((p) => p.studentUid === student.uid)) {
      showToast(`${student.fullName} is already added to this program result.`, 'error');
      return;
    }
    const defaultPos: ResultPosition =
      participants.length === 0
        ? '1st Place'
        : participants.length === 1
        ? '2nd Place'
        : participants.length === 2
        ? '3rd Place'
        : 'None';
    const defaultGrade: ResultGrade = 'A';
    const calc = calculateResultPoints(defaultPos, defaultGrade);

    setParticipants((prev) => [
      ...prev,
      {
        id: `sr_${Date.now()}_${prev.length}`,
        studentUid: student.uid,
        studentId: student.studentId,
        studentAvatar: student.avatarUrl,
        studentDepartment: student.department,
        name: student.fullName,
        position: calc.position,
        grade: calc.grade,
        positionPoints: calc.positionPoints,
        gradePoints: calc.gradePoints,
        totalPoints: calc.totalPoints,
        remarks: '',
        isWinner: calc.position === '1st Place',
      },
    ]);
  };

  const updateParticipant = (idx: number, patch: Partial<ProgramParticipant>) => {
    setParticipants((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const next = { ...item, ...patch };
        const calc = calculateResultPoints(next.position, next.grade);
        return {
          ...next,
          position: calc.position,
          grade: calc.grade,
          positionPoints: calc.positionPoints,
          gradePoints: calc.gradePoints,
          totalPoints: calc.totalPoints,
          isWinner: calc.position === '1st Place',
        };
      })
    );
  };

  const removeParticipantRow = (idx: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!programName.trim()) {
      showToast('Program name is required.', 'error');
      return;
    }
    if (participants.length === 0) {
      showToast('Please select at least one participating student.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onMutate({
        action: 'SAVE_PROGRAM_RESULT',
        id: editingResult?.id,
        programName,
        description,
        programDate,
        publicationDate,
        category,
        status,
        winnerSummary,
        documentUrl,
        documentName,
        imageUrl,
        certificateTitle,
        certificateSubtitle,
        participants,
      });

      if (res.ok) {
        showToast(
          editingResult
            ? 'Program result updated! Student points and certificates recalculated.'
            : 'Official program result published! Points and certificates generated automatically.',
          'success'
        );
        setModalOpen(false);
      } else {
        showToast(res.error || 'Failed to save program result.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmAndExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'PROGRAM') {
        const res = await onMutate({
          action: 'DELETE_PROGRAM_RESULT',
          programResultId: deleteTarget.id,
        });
        if (res.ok) {
          showToast(
            'Program result deleted. Associated student points and certificates were deducted.',
            'success'
          );
        } else {
          showToast(res.error || 'Failed to delete program result.', 'error');
        }
      } else {
        const res = await onMutate({
          action: 'DELETE_STUDENT_RESULT',
          resultId: deleteTarget.id,
        });
        if (res.ok) {
          showToast('Student result removed and points adjusted.', 'success');
        } else {
          showToast(res.error || 'Failed to delete student result.', 'error');
        }
      }
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const findCertificateForParticipant = (
    prog: ProgramResult,
    p: ProgramParticipant
  ): CertificateRecord => {
    const existing = (state.certificates || []).find(
      (c) =>
        (p.certificateId && c.id === p.certificateId) ||
        (p.id && c.resultId === p.id) ||
        (c.programId === prog.id && p.studentUid && c.studentUid === p.studentUid)
    );
    if (existing) return existing;

    const calc = calculateResultPoints(p.position, p.grade);
    return {
      id: p.certificateId || `cert_${prog.id}_${p.id}`,
      certificateNumber: `ALN-CERT-2026-${p.id.slice(-4).toUpperCase()}`,
      resultId: p.id,
      programId: prog.id,
      programName: prog.programName,
      programCategory: prog.category,
      programDate: prog.programDate,
      publicationDate: prog.publicationDate || prog.programDate,
      studentUid: p.studentUid || '',
      studentId: p.studentId || 'AN-2026',
      studentName: p.name,
      studentDepartment: p.studentDepartment || 'AL-NIBRAS Scholar',
      position: calc.position,
      grade: calc.grade,
      positionPoints: calc.positionPoints,
      gradePoints: calc.gradePoints,
      totalPoints: calc.totalPoints,
      authorizedByName: state.certificateSettings?.authorizedByName || 'SUPER ADMIN',
      authorizedByDesignation:
        state.certificateSettings?.authorizedByDesignation ||
        'Director General · AL-NIBRAS Class Union',
      unionName: state.certificateSettings?.unionName || 'AL-NIBRAS Class Union',
      qrVerificationCode: `https://alnibras-union.edu/verify/${prog.id}-${p.id}`,
      status: 'active',
      createdAt: prog.createdAt,
      updatedAt: prog.updatedAt,
    };
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0C1A2E] text-white rounded-xl p-6 border border-[#C59B27]/30 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[#E6C665] text-xs font-bold uppercase tracking-widest mb-1">
            <Trophy className="w-4 h-4" /> Official Result, Automatic Points & Certificate Engine
          </div>
          <h2 className="font-serif text-2xl font-bold">
            Program Results & Honors Conferment
          </h2>
          <p className="text-slate-300 text-sm mt-1">
            {isAdmin
              ? 'Publish competition results for registered students. Position points (1st=3, 2nd=2, 3rd=1) and Grade points (A=5, B=3) are calculated automatically with instant A4 certificate generation.'
              : 'Explore official union competition rankings, automatic merit points, and verified digital certificates.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            data-testid="open-publish-result-modal"
            className="inline-flex items-center gap-2 bg-[#C59B27] hover:bg-[#b0891f] text-[#07111F] font-semibold px-5 py-2.5 rounded-lg text-sm transition-all shadow-md shrink-0"
          >
            <Plus className="w-4 h-4" /> Publish New Program Result
          </button>
        )}
      </div>

      {/* Automatic Point Formula Reference Strip */}
      <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0C1A2E]">
          <Sparkles className="w-4 h-4 text-[#C59B27]" /> Official Point Calculation Formula:
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-semibold">
            1st Place = 3 pts
          </span>
          <span className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-semibold">
            2nd Place = 2 pts
          </span>
          <span className="px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200 text-orange-900 font-semibold">
            3rd Place = 1 pt
          </span>
          <span className="text-slate-400 font-bold">+</span>
          <span className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
            A Grade = 5 pts
          </span>
          <span className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-900 font-semibold">
            B Grade = 3 pts
          </span>
          <span className="text-slate-400 font-bold">=</span>
          <span className="px-2.5 py-1 rounded-md bg-[#0C1A2E] text-[#E6C665] font-mono font-bold">
            Max 8 pts / Program
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E2DDD2] p-4 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-xs">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search programs, winners, student names, or categories..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-[#E2DDD2] focus:outline-none focus:border-[#0C1A2E]"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              categoryFilter === 'all'
                ? 'bg-[#0C1A2E] text-white'
                : 'bg-[#F7F5F0] text-[#475569] hover:bg-[#E2DDD2]/60'
            }`}
          >
            All Categories
          </button>
          {customCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                categoryFilter === cat
                  ? 'bg-[#0C1A2E] text-white'
                  : 'bg-[#F7F5F0] text-[#475569] hover:bg-[#E2DDD2]/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results List */}
      {filteredResults.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2DDD2] p-12 text-center">
          <Trophy className="w-10 h-10 text-[#9A7515] mx-auto mb-3 opacity-60" />
          <h3 className="font-serif text-lg font-bold text-[#0C1A2E]">No Program Results Found</h3>
          <p className="text-sm text-[#475569] mt-1">
            No program results match your current filter criteria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredResults.map((res) => (
            <div
              key={res.id}
              data-testid={`program-result-card-${res.id}`}
              className="bg-white rounded-xl border border-[#E2DDD2] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
            >
              <div className="p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-[#0C1A2E]/10 text-[#0C1A2E] text-xs font-bold uppercase tracking-wider">
                        {res.category}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[#64748B] font-mono">
                        <Calendar className="w-3.5 h-3.5" /> Program: {res.programDate}
                      </span>
                      {res.publicationDate && (
                        <span className="inline-flex items-center gap-1 text-xs text-[#9A7515] font-mono">
                          · Published: {res.publicationDate}
                        </span>
                      )}
                      {isAdmin && (
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            res.status === 'published'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {res.status}
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif text-xl font-bold text-[#0C1A2E]">
                      {res.programName}
                    </h3>
                    <p className="text-sm text-[#475569] leading-relaxed">{res.description}</p>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(res)}
                        data-testid={`edit-program-result-${res.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2DDD2] text-xs font-semibold text-[#0C1A2E] hover:bg-[#F7F5F0] transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit Result
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            type: 'PROGRAM',
                            id: res.id,
                            title: res.programName,
                          })
                        }
                        data-testid={`delete-program-result-${res.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50/50 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Winner Highlight Banner */}
                {res.winnerSummary && (
                  <div className="bg-amber-50/80 border border-[#C59B27]/40 rounded-lg p-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#C59B27] text-[#07111F] flex items-center justify-center shrink-0">
                      <Medal className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#9A7515]">
                        Official Honors Summary
                      </div>
                      <div className="text-sm font-bold text-[#0C1A2E]">{res.winnerSummary}</div>
                    </div>
                  </div>
                )}

                {/* Participating Students, Points & Certificates Table */}
                {res.participants && res.participants.length > 0 && (
                  <div className="border border-[#E2DDD2] rounded-xl overflow-hidden">
                    <div className="bg-[#F7F5F0] px-4 py-2.5 border-b border-[#E2DDD2] flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#0C1A2E]">
                        Student Standings, Automatic Points & Digital Certificates (
                        {res.participants.length})
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E2DDD2] bg-[#FAF9F6] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                            <th className="py-2.5 px-4">Student Scholar</th>
                            <th className="py-2.5 px-3">Position</th>
                            <th className="py-2.5 px-3">Grade</th>
                            <th className="py-2.5 px-3">Points Breakdown</th>
                            <th className="py-2.5 px-3">Total Points</th>
                            <th className="py-2.5 px-4 text-right">Certificate & Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2DDD2] text-sm">
                          {res.participants.map((p) => {
                            const calc = calculateResultPoints(p.position, p.grade);
                            const cert = findCertificateForParticipant(res, p);
                            return (
                              <tr key={p.id} className="hover:bg-[#F7F5F0]/50 transition-colors">
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-[#0C1A2E] text-[#E6C665] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                                      {p.name.charAt(0)}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-[#0C1A2E]">{p.name}</div>
                                      <div className="text-[11px] font-mono text-[#64748B]">
                                        {p.studentId || 'AN-SCHOLAR'}
                                        {p.remarks ? ` · ${p.remarks}` : ''}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold ${
                                      calc.position === '1st Place'
                                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                        : calc.position === '2nd Place'
                                        ? 'bg-slate-200 text-slate-900'
                                        : calc.position === '3rd Place'
                                        ? 'bg-orange-100 text-orange-900'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {calc.position === 'None' ? 'No Position' : calc.position}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-bold ${
                                      calc.grade === 'A'
                                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                        : calc.grade === 'B'
                                        ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {calc.grade === 'None' ? 'None' : `${calc.grade} Grade`}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-mono text-xs text-[#475569]">
                                  Pos ({calc.positionPoints}) + Grade ({calc.gradePoints})
                                </td>
                                <td className="py-3 px-3">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#0C1A2E] text-[#E6C665] font-mono text-xs font-bold">
                                    +{calc.totalPoints} pts
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewCertificate(cert)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E2DDD2] bg-white hover:bg-[#F7F5F0] text-xs font-semibold text-[#0C1A2E] transition-colors"
                                      title="Preview Official Certificate"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-[#9A7515]" /> Preview
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        downloadCertificateAsPdf(
                                          cert,
                                          state.certificateSettings,
                                          state.branding
                                        )
                                      }
                                      data-testid={`download-cert-${p.id}`}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0C1A2E] hover:bg-[#162844] text-[#E6C665] text-xs font-semibold transition-colors"
                                      title="Download A4 Landscape Certificate PDF"
                                    >
                                      <Download className="w-3.5 h-3.5" /> PDF
                                    </button>
                                    {isAdmin && p.id.startsWith('sr_') && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setDeleteTarget({
                                            type: 'STUDENT_RESULT',
                                            id: p.id,
                                            title: `${p.name} (${res.programName})`,
                                          })
                                        }
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                                        title="Remove student result and deduct points"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Attached Scoresheets */}
                {res.documentUrl && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={res.documentUrl}
                      download={res.documentName || 'Result_Sheet.pdf'}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7F5F0] hover:bg-[#E2DDD2] text-[#0C1A2E] text-xs font-semibold transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#9A7515]" />
                      {res.documentName || 'Download Official Scoresheet'}
                      <Download className="w-3 h-3 ml-1" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin Create / Edit Result Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E2DDD2] max-w-4xl w-full overflow-hidden shadow-2xl my-8">
            <div className="bg-[#0C1A2E] text-white px-6 py-4 flex items-center justify-between border-b border-[#C59B27]/30">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-5 h-5 text-[#E6C665]" />
                <h3 className="font-serif text-lg font-bold">
                  {editingResult
                    ? 'Edit Program Result & Recalculate Student Points'
                    : 'Publish New Program Result & Auto-Generate Certificates'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="p-6 space-y-6 max-h-[82vh] overflow-y-auto"
            >
              {/* Program Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#334155] mb-1">
                    Program Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={programName}
                    onChange={(e) => setProgramName(e.target.value)}
                    placeholder="e.g. Annual Class Union Parliamentary Debate Championship"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#E2DDD2] focus:outline-none focus:border-[#0C1A2E]"
                  />
                </div>

                <div>
                  <CustomTypeSelector
                    module="programResults"
                    label="Program Category *"
                    value={category}
                    defaultOptions={DEFAULT_CATEGORIES}
                    customTypes={state.customTypes || []}
                    onChange={setCategory}
                    onAddCustomType={async (name) => {
                      await onMutate({
                        action: 'ADD_CUSTOM_TYPE',
                        module: 'programResults',
                        name,
                      });
                    }}
                    onDeleteCustomType={async (customTypeId) => {
                      await onMutate({
                        action: 'DELETE_CUSTOM_TYPE',
                        customTypeId,
                      });
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#334155] mb-1">
                    Publication Status
                  </label>
                  <SelectWithCustom
                    aria-label="Publication Status"
                    value={status}
                    onChange={(val) => setStatus(val as ContentStatus)}
                    options={[
                      { value: 'published', label: 'Published (Award Points & Certificates Immediately)' },
                      { value: 'draft', label: 'Draft (Internal Review Only)' },
                    ]}
                    customPlaceholder="Type publication status..."
                    selectClassName="w-full px-3.5 py-2 text-sm rounded-lg border border-[#E2DDD2] bg-white focus:outline-none focus:border-[#0C1A2E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#334155] mb-1">
                    Program Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={programDate}
                    onChange={(e) => setProgramDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#E2DDD2]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#334155] mb-1">
                    Result Publication Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={publicationDate}
                    onChange={(e) => setPublicationDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#E2DDD2]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#334155] mb-1">
                    Program Description
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide details on evaluation criteria, judges, and program highlights..."
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-[#E2DDD2]"
                  />
                </div>
              </div>

              {/* Searchable Student Selection & Automatic Point Assignment */}
              <div className="bg-[#F7F5F0] p-4 rounded-xl border border-[#E2DDD2] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#0C1A2E] flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-[#9A7515]" /> Select Participating Students & Assign Position / Grade
                    </h4>
                    <p className="text-xs text-[#64748B]">
                      Click any registered student below to add them to this program. Points are calculated automatically.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#0C1A2E] bg-white px-3 py-1 rounded-md border border-[#E2DDD2]">
                    Selected: {participants.length} Student(s)
                  </span>
                </div>

                {/* Searchable Student Picker */}
                <div className="bg-white rounded-lg border border-[#E2DDD2] p-3 space-y-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search registered students by name, Student ID (e.g. AN-2026-101), or department..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-[#E2DDD2] focus:outline-none focus:border-[#0C1A2E]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                    {filteredStudentCandidates.map((stu) => {
                      const alreadyAdded = participants.some((p) => p.studentUid === stu.uid);
                      return (
                        <button
                          key={stu.uid}
                          type="button"
                          onClick={() => handleSelectStudentForProgram(stu)}
                          disabled={alreadyAdded}
                          data-testid={`select-student-${stu.uid}`}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-left transition-all ${
                            alreadyAdded
                              ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 opacity-75 cursor-not-allowed'
                              : 'bg-[#FAF9F6] hover:bg-[#0C1A2E]/5 border-[#E2DDD2] text-[#0C1A2E]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-[#0C1A2E] text-[#E6C665] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                              {stu.fullName.charAt(0)}
                            </div>
                            <div className="truncate">
                              <div className="text-xs font-bold truncate">{stu.fullName}</div>
                              <div className="text-[10px] font-mono text-[#64748B] truncate">
                                {stu.studentId} · Roll #{stu.rollNumber}
                              </div>
                            </div>
                          </div>
                          {alreadyAdded ? (
                            <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                          ) : (
                            <Plus className="w-4 h-4 text-[#9A7515] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Students Table with Position + Grade Selectors */}
                {participants.length === 0 ? (
                  <div className="bg-white border border-dashed border-[#E2DDD2] rounded-lg p-6 text-center text-xs text-[#64748B]">
                    No students added yet. Click on one or more students above to assign their Position and Grade.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {participants.map((p, idx) => {
                      const calc = calculateResultPoints(p.position, p.grade);
                      return (
                        <div
                          key={p.id || idx}
                          className="bg-white rounded-lg border border-[#E2DDD2] p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                        >
                          <div className="sm:col-span-3 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#0C1A2E] text-[#E6C665] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                              {p.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#0C1A2E] truncate">
                                {p.name}
                              </div>
                              <div className="text-[10px] font-mono text-[#64748B] truncate">
                                {p.studentId || 'Registered Student'}
                              </div>
                            </div>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold uppercase text-[#64748B] mb-0.5">
                              Position
                            </label>
                            <SelectWithCustom
                              aria-label="Participant Position"
                              value={calc.position}
                              onChange={(val) =>
                                updateParticipant(idx, {
                                  position: val as ResultPosition,
                                })
                              }
                              options={POSITIONS.map((pos) => ({
                                value: pos,
                                label: pos === 'None' ? 'No Position (0 pt)' : pos,
                              }))}
                              customPlaceholder="Type position..."
                              selectClassName="w-full px-2.5 py-1.5 text-xs rounded border border-[#E2DDD2] bg-white font-semibold text-[#0C1A2E]"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-bold uppercase text-[#64748B] mb-0.5">
                              Grade
                            </label>
                            <SelectWithCustom
                              aria-label="Participant Grade"
                              value={calc.grade}
                              onChange={(val) =>
                                updateParticipant(idx, {
                                  grade: val as ResultGrade,
                                })
                              }
                              options={GRADES.map((g) => ({
                                value: g,
                                label: g === 'None' ? 'None (0 pt)' : `${g} Grade`,
                              }))}
                              customPlaceholder="Type grade..."
                              selectClassName="w-full px-2.5 py-1.5 text-xs rounded border border-[#E2DDD2] bg-white font-semibold text-[#0C1A2E]"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-bold uppercase text-[#64748B] mb-0.5">
                              Additional Remarks
                            </label>
                            <input
                              type="text"
                              value={p.remarks || ''}
                              onChange={(e) =>
                                updateParticipant(idx, { remarks: e.target.value })
                              }
                              placeholder="Optional citation note..."
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-[#E2DDD2]"
                            />
                          </div>

                          <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
                            <div className="text-right">
                              <div className="text-[10px] font-mono text-[#64748B]">
                                {calc.positionPoints} + {calc.gradePoints} pts
                              </div>
                              <div className="inline-flex px-2 py-0.5 rounded bg-[#0C1A2E] text-[#E6C665] font-mono text-xs font-bold">
                                = {calc.totalPoints} pts
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeParticipantRow(idx)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                              title="Remove student from program"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Certificate & File Uploads */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#334155] mb-1">
                    Certificate Heading Title
                  </label>
                  <input
                    type="text"
                    value={certificateTitle}
                    onChange={(e) => setCertificateTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2DDD2]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#334155] mb-1">
                    Winners Summary Citation (Optional Auto-Generated)
                  </label>
                  <input
                    type="text"
                    value={winnerSummary}
                    onChange={(e) => setWinnerSummary(e.target.value)}
                    placeholder="Leave blank to auto-generate from student positions"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2DDD2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DeviceFileUpload
                  label="Upload Result Scoresheet (PDF / Image)"
                  accept="image/*,.pdf,.doc,.docx"
                  currentUrl={documentUrl}
                  currentName={documentName}
                  onSelect={(res) => {
                    setDocumentUrl(res.dataUrl);
                    setDocumentName(res.fileName);
                  }}
                  onClear={() => {
                    setDocumentUrl('');
                    setDocumentName('');
                  }}
                />

                <DeviceFileUpload
                  label="Upload Program Highlight Photo"
                  accept="image/*"
                  currentUrl={imageUrl}
                  onSelect={(res) => setImageUrl(res.dataUrl)}
                  onClear={() => setImageUrl('')}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2DDD2]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#E2DDD2] text-sm font-semibold text-[#475569]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="submit-program-result"
                  className="px-6 py-2.5 rounded-lg bg-[#0C1A2E] hover:bg-[#162844] text-[#E6C665] text-sm font-semibold transition-all shadow-sm disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Saving & Calculating Points...'
                    : editingResult
                    ? 'Update Result & Recalculate Points'
                    : 'Publish Result & Generate Certificates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official Certificate Preview & PDF Modal */}
      <CertificatePreviewModal
        certificate={previewCertificate}
        settings={state.certificateSettings}
        branding={state.branding}
        onClose={() => setPreviewCertificate(null)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.type === 'PROGRAM'
            ? 'Delete Program Result'
            : 'Remove Individual Student Result'
        }
        description={
          deleteTarget?.type === 'PROGRAM'
            ? `Are you sure you want to permanently delete "${deleteTarget.title}"? All points awarded from this program will be automatically deducted from the participating students' balances, and associated certificates will be removed.`
            : `Are you sure you want to remove the result for ${deleteTarget?.title}? Their earned points for this program will be deducted from their total balance.`
        }
        confirmLabel="Delete & Deduct Points"
        isLoading={isDeleting}
        onConfirm={confirmAndExecuteDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default ProgramResultsView;

