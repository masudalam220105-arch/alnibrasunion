'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Crown,
  Download,
  Eye,
  History,
  Medal,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import type {
  CertificateRecord,
  PortalDatabaseState,
  StudentPointSummary,
  StudentResultRecord,
} from '@/lib/types';
import {
  computeStudentLeaderboard,
  getIndiaDateISO,
  recomputeStudentPointSummaries,
} from '@/lib/portal-logic';
import CertificatePreviewModal, { downloadCertificateAsPdf } from './CertificateModalAndPdf';
import SelectWithCustom from './SelectWithCustom';

export interface AdminPointManagementProps {
  state: PortalDatabaseState;
}

export function AdminPointManagement({ state }: AdminPointManagementProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'points' | 'achievements' | 'name'>('points');
  const [selectedStudent, setSelectedStudent] = useState<
    (StudentPointSummary & { rank: number }) | null
  >(null);
  const [previewCert, setPreviewCert] = useState<CertificateRecord | null>(null);

  const summaries = useMemo(() => {
    if (state.studentPoints && state.studentPoints.length > 0) {
      return state.studentPoints;
    }
    return recomputeStudentPointSummaries(state.users || [], state.studentResults || []);
  }, [state.studentPoints, state.users, state.studentResults]);

  const leaderboard = useMemo(() => computeStudentLeaderboard(summaries), [summaries]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const s of summaries) {
      if (s.studentDepartment) set.add(s.studentDepartment);
    }
    return Array.from(set);
  }, [summaries]);

  const filteredLeaderboard = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = leaderboard.filter((item) => {
      if (departmentFilter !== 'all' && item.studentDepartment !== departmentFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.studentName.toLowerCase().includes(q) ||
        item.studentId.toLowerCase().includes(q) ||
        item.studentDepartment.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'achievements') {
      return [...list].sort(
        (a, b) => b.totalAchievements - a.totalAchievements || b.totalPoints - a.totalPoints
      );
    }
    if (sortBy === 'name') {
      return [...list].sort((a, b) => a.studentName.localeCompare(b.studentName));
    }
    return list;
  }, [leaderboard, searchQuery, departmentFilter, sortBy]);

  const aggregateStats = useMemo(() => {
    let totalPointsAwarded = 0;
    let totalFirstPlaces = 0;
    let totalSecondPlaces = 0;
    let totalThirdPlaces = 0;
    let totalGradeA = 0;
    let totalGradeB = 0;
    for (const s of summaries) {
      totalPointsAwarded += s.totalPoints;
      totalFirstPlaces += s.firstPlaceCount;
      totalSecondPlaces += s.secondPlaceCount;
      totalThirdPlaces += s.thirdPlaceCount;
      totalGradeA += s.gradeACount;
      totalGradeB += s.gradeBCount;
    }
    return {
      totalPointsAwarded,
      totalFirstPlaces,
      totalSecondPlaces,
      totalThirdPlaces,
      totalGradeA,
      totalGradeB,
    };
  }, [summaries]);

  const handleExportCsv = () => {
    const headers = [
      'Rank',
      'Student Name',
      'Student ID',
      'Roll Number',
      'Department',
      'Total Points',
      '1st Positions',
      '2nd Positions',
      '3rd Positions',
      'A Grades',
      'B Grades',
      'Total Achievements',
    ];
    const rows = filteredLeaderboard.map((s) => [
      s.rank,
      `"${s.studentName.replace(/"/g, '""')}"`,
      s.studentId,
      s.rollNumber,
      `"${s.studentDepartment.replace(/"/g, '""')}"`,
      s.totalPoints,
      s.firstPlaceCount,
      s.secondPlaceCount,
      s.thirdPlaceCount,
      s.gradeACount,
      s.gradeBCount,
      s.totalAchievements,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ALNIBRAS_Student_Points_Leaderboard_${getIndiaDateISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const selectedStudentResults: StudentResultRecord[] = useMemo(() => {
    if (!selectedStudent) return [];
    return (state.studentResults || []).filter(
      (r) => r.studentUid === selectedStudent.studentUid && r.status === 'published'
    );
  }, [selectedStudent, state.studentResults]);

  const selectedStudentTransactions = useMemo(() => {
    if (!selectedStudent) return [];
    return (state.pointTransactions || []).filter(
      (t) => t.studentUid === selectedStudent.studentUid
    );
  }, [selectedStudent, state.pointTransactions]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0C1A2E] text-white rounded-xl p-6 border border-[#C59B27]/30 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[#E6C665] text-xs font-bold uppercase tracking-widest mb-1">
            <Crown className="w-4 h-4" /> Official Merit Ledger & Leaderboard
          </div>
          <h2 className="font-serif text-2xl font-bold">
            Student Point Management & Institutional Leaderboard
          </h2>
          <p className="text-slate-300 text-sm mt-1">
            Real-time cumulative point standings, position & grade breakdowns, transaction audit history, and CSV reporting.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          data-testid="export-points-csv"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C59B27] hover:bg-[#b0891f] text-[#07111F] text-xs font-bold uppercase tracking-wider transition-all shadow-md shrink-0"
        >
          <Download className="w-4 h-4" /> Export Point Report (CSV)
        </button>
      </div>

      {/* Position & Grade Statistics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
            Total Points Awarded
          </div>
          <div className="font-serif text-2xl font-bold text-[#0C1A2E] mt-1">
            {aggregateStats.totalPointsAwarded} <span className="text-xs font-mono text-[#9A7515]">pts</span>
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            1st Place Finishes
          </div>
          <div className="font-serif text-2xl font-bold text-[#0C1A2E] mt-1">
            {aggregateStats.totalFirstPlaces} <span className="text-xs font-mono text-[#64748B]">(3 pts ea)</span>
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
            2nd Place Finishes
          </div>
          <div className="font-serif text-2xl font-bold text-[#0C1A2E] mt-1">
            {aggregateStats.totalSecondPlaces} <span className="text-xs font-mono text-[#64748B]">(2 pts ea)</span>
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-orange-700">
            3rd Place Finishes
          </div>
          <div className="font-serif text-2xl font-bold text-[#0C1A2E] mt-1">
            {aggregateStats.totalThirdPlaces} <span className="text-xs font-mono text-[#64748B]">(1 pt ea)</span>
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
            A Grade Honors
          </div>
          <div className="font-serif text-2xl font-bold text-[#0C1A2E] mt-1">
            {aggregateStats.totalGradeA} <span className="text-xs font-mono text-[#64748B]">(5 pts ea)</span>
          </div>
        </div>
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            B Grade Honors
          </div>
          <div className="font-serif text-2xl font-bold text-[#0C1A2E] mt-1">
            {aggregateStats.totalGradeB} <span className="text-xs font-mono text-[#64748B]">(3 pts ea)</span>
          </div>
        </div>
      </div>

      {/* Top Laureates Podium */}
      {leaderboard.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {leaderboard.slice(0, 3).map((stu, idx) => (
            <div
              key={stu.studentUid}
              className={`rounded-xl p-5 border shadow-xs flex items-center justify-between ${
                stu.rank === 1
                  ? 'bg-gradient-to-br from-[#0C1A2E] to-[#162844] text-white border-[#C59B27]'
                  : 'bg-white text-[#0C1A2E] border-[#E2DDD2]'
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center font-serif font-bold text-lg shrink-0 ${
                    stu.rank === 1
                      ? 'bg-[#C59B27] text-[#07111F]'
                      : 'bg-[#F7F5F0] text-[#0C1A2E] border border-[#E2DDD2]'
                  }`}
                >
                  #{stu.rank}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#C59B27]">
                    {stu.rank === 1 ? ' Leaderboard Laureate' : `Rank #${stu.rank} Scholar`}
                  </div>
                  <div className="font-serif text-base font-bold truncate">{stu.studentName}</div>
                  <div
                    className={`text-xs font-mono truncate ${
                      stu.rank === 1 ? 'text-slate-300' : 'text-[#64748B]'
                    }`}
                  >
                    {stu.studentId} · {stu.totalAchievements} Program(s)
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <div
                  className={`font-mono text-2xl font-bold ${
                    stu.rank === 1 ? 'text-[#E6C665]' : 'text-[#0C1A2E]'
                  }`}
                >
                  {stu.totalPoints}
                </div>
                <div
                  className={`text-[10px] uppercase tracking-wider font-bold ${
                    stu.rank === 1 ? 'text-slate-300' : 'text-[#64748B]'
                  }`}
                >
                  Total Points
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search & Sort Controls */}
      <div className="bg-white rounded-xl border border-[#E2DDD2] p-4 flex flex-col md:flex-row gap-3 items-center justify-between shadow-xs">
        <div className="relative w-full md:max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student by name, Student ID, or department..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-[#E2DDD2] focus:outline-none focus:border-[#0C1A2E]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <SelectWithCustom
            aria-label="Filter by Department"
            value={departmentFilter}
            onChange={setDepartmentFilter}
            options={[
              { value: 'all', label: 'All Departments' },
              ...departments.map((d) => ({ value: d, label: d })),
            ]}
            customPlaceholder="Type department..."
            selectClassName="px-3 py-2 text-xs font-semibold rounded-lg border border-[#E2DDD2] bg-white text-[#0C1A2E]"
          />

          <SelectWithCustom
            aria-label="Sort Leaderboard"
            value={sortBy}
            onChange={(val) => setSortBy(val as 'points' | 'achievements' | 'name')}
            options={[
              { value: 'points', label: 'Sort by: Highest Points (Leaderboard)' },
              { value: 'achievements', label: 'Sort by: Total Achievements' },
              { value: 'name', label: 'Sort by: Student Name (A–Z)' },
            ]}
            customPlaceholder="Custom sort key..."
            selectClassName="px-3 py-2 text-xs font-semibold rounded-lg border border-[#E2DDD2] bg-white text-[#0C1A2E]"
          />
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white rounded-xl border border-[#E2DDD2] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0C1A2E] text-white text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Rank</th>
                <th className="py-3.5 px-4">Student Name</th>
                <th className="py-3.5 px-3">Student ID</th>
                <th className="py-3.5 px-3 text-center">1st / 2nd / 3rd</th>
                <th className="py-3.5 px-3 text-center">A / B Grades</th>
                <th className="py-3.5 px-3 text-center">Achievements</th>
                <th className="py-3.5 px-4 text-right">Total Points</th>
                <th className="py-3.5 px-4 text-right">Point History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2DDD2] text-sm">
              {filteredLeaderboard.map((stu) => (
                <tr
                  key={stu.studentUid}
                  data-testid={`leaderboard-row-${stu.studentUid}`}
                  className="hover:bg-[#F7F5F0]/60 transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-mono text-xs font-bold ${
                        stu.rank === 1
                          ? 'bg-[#C59B27] text-[#07111F]'
                          : stu.rank === 2
                          ? 'bg-slate-200 text-slate-900'
                          : stu.rank === 3
                          ? 'bg-orange-100 text-orange-900'
                          : 'bg-[#F7F5F0] text-[#475569]'
                      }`}
                    >
                      #{stu.rank}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#0C1A2E] text-[#E6C665] flex items-center justify-center font-serif font-bold text-xs shrink-0">
                        {stu.studentName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-[#0C1A2E]">{stu.studentName}</div>
                        <div className="text-xs text-[#64748B]">{stu.studentDepartment}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-mono text-xs font-semibold text-[#334155]">
                    {stu.studentId}
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 font-bold">
                      {stu.firstPlaceCount}
                    </span>{' '}
                    /{' '}
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                      {stu.secondPlaceCount}
                    </span>{' '}
                    /{' '}
                    <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-900 font-bold">
                      {stu.thirdPlaceCount}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 font-bold">
                      {stu.gradeACount} A
                    </span>{' '}
                    ·{' '}
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 font-bold">
                      {stu.gradeBCount} B
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono text-xs font-bold text-[#0C1A2E]">
                    {stu.totalAchievements}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-[#0C1A2E] text-[#E6C665] font-mono text-sm font-bold">
                      {stu.totalPoints} pts
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(stu)}
                      data-testid={`inspect-student-points-${stu.studentUid}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2DDD2] bg-white hover:bg-[#F7F5F0] text-xs font-semibold text-[#0C1A2E] transition-colors"
                    >
                      <History className="w-3.5 h-3.5 text-[#9A7515]" /> Point History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual Student Point History & Certificates Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E2DDD2] max-w-3xl w-full overflow-hidden shadow-2xl my-8">
            <div className="bg-[#0C1A2E] text-white px-6 py-4 flex items-center justify-between border-b border-[#C59B27]/30">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#E6C665]">
                  RANK #{selectedStudent.rank} · {selectedStudent.studentId}
                </span>
                <h3 className="font-serif text-lg font-bold">
                  {selectedStudent.studentName} — Point & Achievement Ledger
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#F7F5F0] p-3 rounded-lg border border-[#E2DDD2]">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">Total Points</div>
                  <div className="font-mono text-xl font-bold text-[#0C1A2E]">
                    {selectedStudent.totalPoints} pts
                  </div>
                </div>
                <div className="bg-[#F7F5F0] p-3 rounded-lg border border-[#E2DDD2]">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">
                    1st / 2nd / 3rd
                  </div>
                  <div className="font-mono text-base font-bold text-[#0C1A2E]">
                    {selectedStudent.firstPlaceCount} / {selectedStudent.secondPlaceCount} /{' '}
                    {selectedStudent.thirdPlaceCount}
                  </div>
                </div>
                <div className="bg-[#F7F5F0] p-3 rounded-lg border border-[#E2DDD2]">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">A / B Grades</div>
                  <div className="font-mono text-base font-bold text-[#0C1A2E]">
                    {selectedStudent.gradeACount} A · {selectedStudent.gradeBCount} B
                  </div>
                </div>
                <div className="bg-[#F7F5F0] p-3 rounded-lg border border-[#E2DDD2]">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">Programs</div>
                  <div className="font-mono text-xl font-bold text-[#0C1A2E]">
                    {selectedStudent.totalAchievements}
                  </div>
                </div>
              </div>

              {/* Program-wise Results */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0C1A2E] mb-2.5">
                  Published Program Results & Certificates ({selectedStudentResults.length})
                </h4>
                {selectedStudentResults.length === 0 ? (
                  <p className="text-xs text-[#64748B] bg-[#F7F5F0] p-4 rounded-lg">
                    No published results recorded for this student yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedStudentResults.map((sr) => {
                      const cert = (state.certificates || []).find(
                        (c) => c.id === sr.certificateId || c.resultId === sr.id
                      );
                      return (
                        <div
                          key={sr.id}
                          className="border border-[#E2DDD2] rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-semibold text-sm text-[#0C1A2E]">
                              {sr.programName}
                            </div>
                            <div className="text-xs text-[#64748B] font-mono">
                              Date: {sr.programDate} · Position: {sr.position} ({sr.positionPoints}
                              p) · Grade: {sr.grade} ({sr.gradePoints}p)
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded bg-[#0C1A2E] text-[#E6C665] font-mono text-xs font-bold">
                              +{sr.totalPoints} pts
                            </span>
                            {cert && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPreviewCert(cert)}
                                  className="px-2.5 py-1 rounded border border-[#E2DDD2] text-xs font-semibold text-[#0C1A2E] hover:bg-[#F7F5F0]"
                                >
                                  Preview Cert
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadCertificateAsPdf(cert, state.certificateSettings)
                                  }
                                  className="px-2.5 py-1 rounded bg-[#C59B27] text-[#07111F] text-xs font-bold"
                                >
                                  PDF
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Point Transactions Audit Log */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0C1A2E] mb-2.5">
                  Point Transaction Audit Log ({selectedStudentTransactions.length})
                </h4>
                {selectedStudentTransactions.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No point transactions logged.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedStudentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="bg-[#FAF9F6] border border-[#E2DDD2] rounded-lg px-3.5 py-2.5 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-[#0C1A2E]">{tx.programName}</span>
                          <span className="text-[#64748B] ml-2 font-mono">
                            ({tx.reason} · {tx.position} / {tx.grade})
                          </span>
                        </div>
                        <div className="font-mono font-bold">
                          <span
                            className={
                              tx.deltaPoints >= 0 ? 'text-emerald-700' : 'text-red-700'
                            }
                          >
                            {tx.deltaPoints >= 0 ? `+${tx.deltaPoints}` : tx.deltaPoints} pts
                          </span>
                          <span className="text-[#64748B] ml-2">
                            (Bal: {tx.previousBalance} → {tx.newBalance})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <CertificatePreviewModal
        certificate={previewCert}
        settings={state.certificateSettings}
        branding={state.branding}
        onClose={() => setPreviewCert(null)}
      />
    </div>
  );
}

export default AdminPointManagement;

