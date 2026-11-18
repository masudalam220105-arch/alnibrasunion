'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  Download,
  Eye,
  FileBadge,
  Medal,
  Trophy,
} from 'lucide-react';
import type {
  CertificateRecord,
  PortalDatabaseState,
  StudentResultRecord,
  UserProfile,
} from '@/lib/types';
import CertificatePreviewModal, { downloadCertificateAsPdf } from './CertificateModalAndPdf';
import { OfficialLogo } from './OfficialBrandingView';

export interface StudentResultsAndPointsViewProps {
  currentUser: UserProfile;
  state: PortalDatabaseState;
  mode: 'myResults' | 'myCertificates';
}

export function StudentResultsAndPointsView({
  currentUser,
  state,
  mode,
}: StudentResultsAndPointsViewProps) {
  const [previewCertificate, setPreviewCertificate] = useState<CertificateRecord | null>(null);

  // Strictly filter to ONLY the logged-in student's published results
  const myPublishedResults: StudentResultRecord[] = useMemo(() => {
    return (state.studentResults || []).filter(
      (r) => r.studentUid === currentUser.uid && r.status === 'published'
    );
  }, [state.studentResults, currentUser.uid]);

  const resolveCertificateForResult = (sr: StudentResultRecord): CertificateRecord => {
    const found = (state.certificates || []).find(
      (c) => c.id === sr.certificateId || c.resultId === sr.id
    );
    if (found) return found;
    return {
      id: sr.certificateId || `cert_${sr.id}`,
      certificateNumber: `ALN-CERT-2026-${sr.id.slice(-4).toUpperCase()}`,
      resultId: sr.id,
      programId: sr.programId,
      programName: sr.programName,
      programCategory: sr.programCategory,
      programDate: sr.programDate,
      publicationDate: sr.publicationDate,
      studentUid: sr.studentUid,
      studentId: sr.studentId,
      studentName: sr.studentName,
      studentDepartment: sr.studentDepartment,
      position: sr.position,
      grade: sr.grade,
      positionPoints: sr.positionPoints,
      gradePoints: sr.gradePoints,
      totalPoints: sr.totalPoints,
      authorizedByName: state.certificateSettings?.authorizedByName || 'SUPER ADMIN',
      authorizedByDesignation:
        state.certificateSettings?.authorizedByDesignation ||
        'Director General · AL-NIBRAS Class Union',
      unionName: state.certificateSettings?.unionName || 'AL-NIBRAS Class Union',
      qrVerificationCode: '',
      status: 'active',
      createdAt: sr.createdAt,
      updatedAt: sr.updatedAt,
    };
  };

  if (mode === 'myCertificates') {
    return (
      <div className="space-y-6">
        <div className="bg-[#0B192C] text-white rounded-2xl p-6 sm:p-7 border border-[#C5A059]/40 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <OfficialLogo
              branding={state.branding}
              placement="certificates"
              size="md"
              showText={false}
            />
            <div>
              <div className="inline-flex items-center gap-2 text-[#C5A059] text-xs font-bold uppercase tracking-widest mb-1">
                <FileBadge className="w-4 h-4" /> Official Achievement Certificates
              </div>
              <h2 className="font-serif-display text-2xl font-bold">My Certificates</h2>
              <p className="text-slate-300 text-xs sm:text-sm mt-1">
                Preview and download your official A4 landscape AL-NIBRAS Class Union certificates with dynamic position badges.
              </p>
            </div>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-white/10 border border-[#C5A059]/30 text-xs font-mono-tabular shrink-0">
            <span className="text-[#C5A059] font-bold">{myPublishedResults.length}</span> Certificate(s) Issued
          </div>
        </div>

        {myPublishedResults.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
            <Award className="w-10 h-10 text-[#B48A3E] mx-auto mb-3 opacity-60" />
            <h3 className="font-serif-display text-lg font-bold text-[#0B192C]">
              No Certificates Issued Yet
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              When the Union Secretariat publishes program results for you, your official A4 certificates will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {myPublishedResults.map((sr) => {
              const cert = resolveCertificateForResult(sr);
              const badgeColor =
                sr.position === '1st Place'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : sr.position === '2nd Place'
                  ? 'bg-slate-100 text-slate-800 border-slate-300'
                  : sr.position === '3rd Place'
                  ? 'bg-orange-100 text-orange-900 border-orange-300'
                  : 'bg-blue-50 text-blue-900 border-blue-200';
              const positionDisplay =
                sr.position === '1st Place'
                  ? '1ST POSITION'
                  : sr.position === '2nd Place'
                  ? '2ND POSITION'
                  : sr.position === '3rd Place'
                  ? '3RD POSITION'
                  : sr.position === 'None'
                  ? 'MERIT ACHIEVEMENT'
                  : String(sr.position).toUpperCase();

              return (
                <div
                  key={sr.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between gap-4 hover:border-[#C5A059] transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${badgeColor}`}
                      >
                        <Medal className="w-3.5 h-3.5" />
                        {positionDisplay}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-slate-500">
                        {cert.certificateNumber}
                      </span>
                    </div>

                    <h3 className="text-lg font-serif-display font-bold text-[#0B192C]">
                      {sr.programName}
                    </h3>

                    <p className="text-xs text-slate-600">
                      Category: <span className="font-semibold text-[#0B192C]">{sr.programCategory}</span> · Grade:{' '}
                      <span className="font-semibold text-[#0B192C]">
                        {sr.grade === 'None' ? 'Standard' : `${sr.grade} Grade`}
                      </span>
                    </p>

                    <p className="text-[11px] font-mono-tabular text-slate-500">
                      Program Date: {sr.programDate} · Issued: {sr.publicationDate}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPreviewCertificate(cert)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-[#FAF9F5] hover:bg-slate-100 text-xs font-semibold text-[#0B192C] cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#B48A3E]" />
                      Preview Certificate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const matchedProg = (state.programResults || []).find(
                          (pr) => pr.id === cert.programId
                        );
                        void downloadCertificateAsPdf(cert, state.certificateSettings, state.branding, {
                          fallbackVenue: matchedProg?.programVenue || matchedProg?.venue,
                        });
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B192C] hover:bg-[#162944] text-xs font-semibold text-white cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-[#C5A059]" />
                      Download PDF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <CertificatePreviewModal
          certificate={previewCertificate}
          settings={state.certificateSettings}
          branding={state.branding}
          fallbackVenue={
            previewCertificate
              ? (state.programResults || []).find((pr) => pr.id === previewCertificate.programId)
                  ?.programVenue ||
                (state.programResults || []).find((pr) => pr.id === previewCertificate.programId)
                  ?.venue
              : undefined
          }
          onClose={() => setPreviewCertificate(null)}
        />
      </div>
    );
  }

  // Default mode: 'myResults' (MY RESULTS & ACHIEVEMENTS)
  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-[#0C1A2E] text-white rounded-2xl p-6 sm:p-7 border border-[#C59B27]/40 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <OfficialLogo
            branding={state.branding}
            placement="dashboard"
            size="md"
            showText={false}
          />
          <div>
            <div className="inline-flex items-center gap-2 text-[#E6C665] text-xs font-bold uppercase tracking-widest mb-1">
              <Award className="w-4 h-4" /> Personal Scholastic Portfolio
            </div>
            <h2 className="font-serif text-2xl font-bold">My Results &amp; Achievement History</h2>
            <p className="text-slate-300 text-sm mt-1">
              View your individual program results, positions, grades, result points, and official certificates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/10 border border-[#C59B27]/40 rounded-xl px-4 py-3 shrink-0">
          <Trophy className="w-6 h-6 text-[#E6C665]" />
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
              Published Achievements
            </div>
            <div className="font-mono text-xl font-bold text-white">
              {myPublishedResults.length} Program(s)
            </div>
          </div>
        </div>
      </div>

      {myPublishedResults.length === 0 ? (
        <div className="bg-white border border-[#E2DDD2] rounded-xl p-12 text-center">
          <Award className="w-10 h-10 text-[#9A7515] mx-auto mb-3 opacity-60" />
          <h3 className="font-serif text-lg font-bold text-[#0C1A2E]">
            No Personal Results Published Yet
          </h3>
          <p className="text-sm text-[#475569] mt-1">
            When the Union Secretariat publishes results for programs you participated in, your positions, grades, result points, and certificates will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {myPublishedResults.map((sr) => {
            const cert = resolveCertificateForResult(sr);
            return (
              <div
                key={sr.id}
                data-testid={`student-result-card-${sr.id}`}
                className="bg-white border border-[#E2DDD2] rounded-xl p-6 shadow-xs hover:shadow-md transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-[#0C1A2E] text-[#E6C665] text-xs font-bold uppercase tracking-wider">
                        {sr.programCategory}
                      </span>
                      <span className="text-xs font-mono text-[#64748B] flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Program Date: {sr.programDate}
                      </span>
                      <span className="text-xs font-mono text-[#9A7515]">
                        · Published: {sr.publicationDate}
                      </span>
                    </div>

                    <h3 className="font-serif text-xl font-bold text-[#0C1A2E]">
                      {sr.programName}
                    </h3>

                    {sr.remarks && (
                      <p className="text-sm text-[#475569] italic">
                        &ldquo;{sr.remarks}&rdquo;
                      </p>
                    )}

                    {/* Individual Result Points Breakdown Pills */}
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                        <span className="text-[#64748B] font-semibold">Position: </span>
                        <span className="font-bold text-[#0C1A2E]">
                          {sr.position === 'None' ? 'Participant' : sr.position}
                        </span>{' '}
                        <span className="font-mono font-bold text-[#9A7515]">
                          ({sr.positionPoints} pts)
                        </span>
                      </div>

                      <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                        <span className="text-[#64748B] font-semibold">Grade: </span>
                        <span className="font-bold text-[#0C1A2E]">
                          {sr.grade === 'None' ? 'Standard' : `${sr.grade} Grade`}
                        </span>{' '}
                        <span className="font-mono font-bold text-emerald-800">
                          ({sr.gradePoints} pts)
                        </span>
                      </div>

                      <div className="px-3.5 py-1.5 rounded-lg bg-[#0C1A2E] text-[#E6C665] text-xs font-mono font-bold">
                        Result Points: +{sr.totalPoints} pts
                      </div>
                    </div>
                  </div>

                  {/* Certificate Preview & Download Buttons */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#E2DDD2]">
                    <button
                      type="button"
                      onClick={() => setPreviewCertificate(cert)}
                      data-testid={`student-preview-cert-${sr.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#E2DDD2] bg-[#F7F5F0] hover:bg-[#E2DDD2]/60 text-xs font-bold text-[#0C1A2E] uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      <Eye className="w-4 h-4 text-[#9A7515]" /> Preview Certificate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const matchedProg = (state.programResults || []).find(
                          (pr) => pr.id === cert.programId
                        );
                        void downloadCertificateAsPdf(cert, state.certificateSettings, state.branding, {
                          fallbackVenue: matchedProg?.programVenue || matchedProg?.venue,
                        });
                      }}
                      data-testid={`student-download-cert-${sr.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C59B27] hover:bg-[#b0891f] text-[#07111F] text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                    >
                      <Download className="w-4 h-4" /> Download Certificate
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CertificatePreviewModal
        certificate={previewCertificate}
        settings={state.certificateSettings}
        branding={state.branding}
        fallbackVenue={
          previewCertificate
            ? (state.programResults || []).find((pr) => pr.id === previewCertificate.programId)
                ?.programVenue ||
              (state.programResults || []).find((pr) => pr.id === previewCertificate.programId)
                ?.venue
            : undefined
        }
        onClose={() => setPreviewCertificate(null)}
      />
    </div>
  );
}

export default StudentResultsAndPointsView;
