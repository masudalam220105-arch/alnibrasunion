'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  CheckCircle2,
  Users,
  ThumbsUp,
  Database,
  ShieldCheck,
  RefreshCw,
  Star,
} from 'lucide-react';
import { DeviceFileUpload } from './DeviceFileUpload';
import { SafeImage } from './SafeImage';
import { SelectWithCustom } from './SelectWithCustom';
import type {
  CommitteeMember,
  CommitteeType,
  CustomTypeRecord,
  DatabaseBackupMeta,
  FeedbackRecord,
  SlideshowSlide,
  UserProfile,
} from '@/lib/types';
import type { RlsDiagnosticReport } from '@/lib/supabase-rls-diagnostic';

export function AdminSlideshowManager({
  slides = [],
  onMutate,
  showToast,
}: {
  slides: SlideshowSlide[];
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [editingSlide, setEditingSlide] = useState<SlideshowSlide | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('Welcome to Al-Nibras');
  const [subtitle, setSubtitle] = useState(
    'Connecting Students, Building Community, Creating Opportunities.'
  );
  const [imageUrl, setImageUrl] = useState('/images/hero_campus_library.jpg');
  const [ctaText, setCtaText] = useState('Explore Notices');
  const [ctaLink, setCtaLink] = useState('#notices');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlideImage, setUploadingSlideImage] = useState(false);

  const sortedSlides = [...slides].sort((a, b) => (a.order || 0) - (b.order || 0));

  const openAdd = () => {
    setEditingSlide(null);
    setTitle('Welcome to Al-Nibras');
    setSubtitle('Connecting Students, Building Community, Creating Opportunities.');
    setImageUrl('/images/hero_campus_library.jpg');
    setCtaText('Explore Notices');
    setCtaLink('#notices');
    setEnabled(true);
    setShowModal(true);
  };

  const openEdit = (slide: SlideshowSlide) => {
    setEditingSlide(slide);
    setTitle(slide.title);
    setSubtitle(slide.subtitle);
    setImageUrl(slide.imageUrl);
    setCtaText(slide.ctaText || '');
    setCtaLink(slide.ctaLink || '');
    setEnabled(slide.enabled !== false);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await onMutate({
        action: 'SAVE_SLIDESHOW_SLIDE',
        id: editingSlide?.id || '',
        title,
        subtitle,
        imageUrl,
        ctaText,
        ctaLink,
        enabled,
      });
      if (res.ok) {
        showToast(editingSlide ? 'Slideshow image updated' : 'Slideshow image added', 'success');
        setShowModal(false);
      } else {
        showToast(res.error || 'Could not save slide', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= sortedSlides.length) return;
    const ids = sortedSlides.map((s) => s.id);
    const temp = ids[index];
    ids[index] = ids[targetIdx];
    ids[targetIdx] = temp;
    const res = await onMutate({
      action: 'REORDER_SLIDESHOW_SLIDES',
      orderedIds: ids,
    });
    if (res.ok) {
      showToast('Slideshow order updated', 'success');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#17221F] dark:text-white">
            Home Slideshow Management
          </h2>
          <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-0.5">
            Upload, reorder, enable/disable, or delete hero slideshow images displayed at the top of the Public Homepage.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#D4AF37]" />
          <span>Add Slideshow Image</span>
        </button>
      </div>

      {sortedSlides.length === 0 ? (
        <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center">
          <ImageIcon className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-60" />
          <p className="text-sm font-bold">No slideshow images configured.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedSlides.map((slide, idx) => (
            <div
              key={slide.id}
              className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl overflow-hidden flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="relative h-44 bg-[#071713]">
                  <SafeImage
                    src={slide.imageUrl}
                    alt={slide.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-bold">
                      Slide #{idx + 1}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        slide.enabled
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-600 text-white'
                      }`}
                    >
                      {slide.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  <h3 className="text-sm font-bold text-[#17221F] dark:text-white">
                    {slide.title}
                  </h3>
                  <p className="text-xs text-[#718078] dark:text-[#9AB0A6] line-clamp-2">
                    {slide.subtitle}
                  </p>
                </div>
              </div>

              <div className="p-4 pt-3 border-t border-[#E5EAE6] dark:border-[#1B3B31] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => void handleMove(idx, -1)}
                    className="p-1.5 rounded border border-[#E5EAE6] dark:border-[#1B3B31] disabled:opacity-40 cursor-pointer"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === sortedSlides.length - 1}
                    onClick={() => void handleMove(idx, 1)}
                    className="p-1.5 rounded border border-[#E5EAE6] dark:border-[#1B3B31] disabled:opacity-40 cursor-pointer"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(slide)}
                    className="px-3 py-1 rounded border border-[#E5EAE6] dark:border-[#1B3B31] text-xs font-semibold cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await onMutate({
                        action: 'DELETE_SLIDESHOW_SLIDE',
                        slideId: slide.id,
                      });
                      if (res.ok) showToast('Slide removed', 'success');
                    }}
                    className="px-3 py-1 rounded border border-rose-200 text-rose-600 text-xs font-semibold cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between">
              <h3 className="text-base font-bold">
                {editingSlide ? 'Edit Slideshow Image' : 'Add Slideshow Image'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-xs text-white/80 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Slide Heading *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Slide Subtitle *</label>
                <textarea
                  rows={2}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713]"
                  required
                />
              </div>
              <div>
                <DeviceFileUpload
                  label="Upload Slideshow Banner Image"
                  accept="image/*"
                  storageFolder="homepage"
                  destination="public"
                  currentUrl={imageUrl}
                  onUploadingChange={setUploadingSlideImage}
                  onSelect={(res) => setImageUrl(res.dataUrl)}
                  onClear={() => setImageUrl('')}
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#064E3B]"
                  />
                  <span>Enable Slide on Public Homepage</span>
                </label>
                <button
                  type="submit"
                  disabled={saving || uploadingSlideImage}
                  className="px-5 py-2 rounded-lg bg-[#064E3B] disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                >
                  {uploadingSlideImage ? 'Uploading Photo...' : saving ? 'Saving...' : 'Save Slide'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const CORE_POSITION_OPTIONS = [
  'President',
  'Vice President',
  'General Secretary',
  'Joint Secretary',
  'Treasurer',
  'Academic Secretary',
  'Cultural Secretary',
  'Media Secretary',
];

const SUB_WING_SUGGESTIONS = [
  'Literary Wing',
  'Media Wing',
  'Cultural Wing',
  'Finance Wing',
  'Discipline Wing',
  'Sports Wing',
  'Social Welfare Wing',
];

const SUB_ROLE_OPTIONS = ['Chairman', 'Convener'];

export function AdminCommitteeManager({
  members = [],
  users = [],
  customTypes = [],
  onMutate,
  showToast,
}: {
  members: CommitteeMember[];
  users?: UserProfile[];
  customTypes?: CustomTypeRecord[];
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [committeeFilter, setCommitteeFilter] = useState<'all' | CommitteeType>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [linkedStudentUid, setLinkedStudentUid] = useState('');
  const [committeeType, setCommitteeType] = useState<CommitteeType>('core');
  const [fullName, setFullName] = useState('');
  const [designation, setDesignation] = useState('President');
  const [wingName, setWingName] = useState('');
  const [subRole, setSubRole] = useState<string>('Chairman');
  const [department, setDepartment] = useState('11th Batch of DHBC');
  const [contactPhone, setContactPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const activeStudents = users.filter((u) => u.role === 'student' && u.status !== 'inactive');

  const savedCorePositions = customTypes
    .filter((c) => c.module === 'committeePosition')
    .map((c) => c.name);
  const savedSubRoles = customTypes
    .filter((c) => c.module === 'subCommitteeRole')
    .map((c) => c.name);
  const savedSubWings = customTypes
    .filter((c) => c.module === 'subCommitteeWing')
    .map((c) => c.name);

  const commitCustomOption = (moduleName: string, customVal: string) => {
    const trimmed = customVal.trim();
    if (!trimmed) return;
    void onMutate({ action: 'ADD_CUSTOM_TYPE', module: moduleName, name: trimmed });
  };

  const handleLinkStudent = (uid: string) => {
    setLinkedStudentUid(uid);
    if (!uid) return;
    const student = activeStudents.find((s) => s.uid === uid);
    if (!student) return;
    setFullName(student.fullName);
    setAvatarUrl(student.avatarUrl || '');
    setDepartment(student.classInfo || student.department || '11th Batch of DHBC');
    if (student.contactPhone) {
      setContactPhone(student.contactPhone);
    }
  };

  const openCreate = (presetType: CommitteeType = 'core') => {
    setEditingId('');
    setLinkedStudentUid('');
    setCommitteeType(presetType);
    setFullName('');
    setDesignation('President');
    setWingName('');
    setSubRole('Chairman');
    setDepartment('11th Batch of DHBC');
    setContactPhone('');
    setAvatarUrl('');
    setUploadingPhoto(false);
    setSaving(false);
    setShowModal(true);
  };

  const openEdit = (m: CommitteeMember) => {
    const inferredType: CommitteeType =
      m.committeeType === 'sub' || Boolean(m.wingName) || Boolean(m.subRole) ? 'sub' : 'core';
    setEditingId(m.id);
    setLinkedStudentUid('');
    setCommitteeType(inferredType);
    setFullName(m.fullName);
    setDesignation(m.designation || m.position || (inferredType === 'sub' ? 'Chairman' : 'President'));
    setWingName(m.wingName || (inferredType === 'sub' ? m.department : ''));
    setSubRole(m.subRole || m.designation || m.position || 'Chairman');
    setDepartment(m.department || '11th Batch of DHBC');
    setContactPhone(m.contactPhone || '');
    setAvatarUrl(m.avatarUrl || '');
    setUploadingPhoto(false);
    setSaving(false);
    setShowModal(true);
  };

  const handleCommitteeTypeSwitch = (nextType: CommitteeType) => {
    setCommitteeType(nextType);
    if (nextType === 'sub') {
      if (!subRole.trim()) setSubRole('Chairman');
    } else {
      if (!designation.trim() || designation === 'Chairman' || designation === 'Convener') {
        setDesignation('President');
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingPhoto) {
      showToast('Please wait for the photo upload to finish.', 'error');
      return;
    }
    if (!fullName.trim()) {
      showToast('Member full name is required.', 'error');
      return;
    }

    if (committeeType === 'sub') {
      if (!wingName.trim()) {
        showToast('Please enter the Sub Committee Wing name.', 'error');
        return;
      }
      const effectiveSubRole = subRole.trim() || 'Convener';
      setSaving(true);
      try {
        const res = await onMutate({
          action: 'SAVE_COMMITTEE_MEMBER',
          id: editingId,
          committeeType: 'sub',
          fullName: fullName.trim(),
          wingName: wingName.trim(),
          subRole: effectiveSubRole,
          designation: `${effectiveSubRole} — ${wingName.trim()}`,
          position: effectiveSubRole,
          roleCategory: wingName.trim(),
          department: wingName.trim(),
          batch: 'Sub Committee',
          batchInfo: 'Sub Committee',
          contactPhone,
          avatarUrl: avatarUrl || '/images/avatar_admin_portrait.jpg',
          showOnHomepage: true,
        });
        if (res.ok) {
          showToast(
            editingId ? 'Sub Committee member updated' : 'Sub Committee member added',
            'success'
          );
          setShowModal(false);
        } else {
          showToast(res.error || 'Could not save committee member', 'error');
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    const effectiveDesignation = designation.trim() || 'Executive Member';
    setSaving(true);
    try {
      const res = await onMutate({
        action: 'SAVE_COMMITTEE_MEMBER',
        id: editingId,
        committeeType: 'core',
        fullName: fullName.trim(),
        designation: effectiveDesignation,
        position: effectiveDesignation,
        roleCategory: 'Executive',
        wingName: undefined,
        subRole: undefined,
        department: department.trim() || '11th Batch of DHBC',
        batch: 'Core Committee',
        batchInfo: 'Core Committee',
        contactPhone,
        avatarUrl: avatarUrl || '/images/avatar_admin_portrait.jpg',
        showOnHomepage: true,
      });
      if (res.ok) {
        showToast(
          editingId ? 'Core Committee member updated' : 'Core Committee member added',
          'success'
        );
        setShowModal(false);
      } else {
        showToast(res.error || 'Could not save committee member', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const coreCount = members.filter((m) => (m.committeeType || 'core') !== 'sub' && !m.wingName).length;
  const subCount = members.filter((m) => m.committeeType === 'sub' || Boolean(m.wingName)).length;
  const filteredMembers = members.filter((m) => {
    const isSub = m.committeeType === 'sub' || Boolean(m.wingName);
    if (committeeFilter === 'core') return !isSub;
    if (committeeFilter === 'sub') return isSub;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#17221F] dark:text-white">
            Committee Management (Core &amp; Sub Committees)
          </h2>
          <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-0.5">
            Manage Core Committee office bearers and Sub Committee wing Chairmen &amp; Conveners of Al-Nibras Class Union.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate('core')}
            data-testid="add-core-committee-btn"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#064E3B] hover:bg-[#0B3D32] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#D4AF37]" />
            <span>Add Committee Member</span>
          </button>
          <button
            type="button"
            onClick={() => openCreate('sub')}
            data-testid="add-sub-committee-btn"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#D4AF37] bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#064E3B] dark:text-[#D4AF37] text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sub Committee</span>
          </button>
        </div>
      </div>

      {/* Core vs Sub Committee Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'all', label: `All Members (${members.length})` },
            { id: 'core', label: `Core Committee (${coreCount})` },
            { id: 'sub', label: `Sub Committee (${subCount})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCommitteeFilter(tab.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              committeeFilter === tab.id
                ? 'bg-[#064E3B] text-white shadow-xs'
                : 'bg-white dark:bg-[#0D231D] text-[#718078] dark:text-[#9AB0A6] border border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#D4AF37]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filteredMembers.length === 0 ? (
        <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center">
          <Users className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-60" />
          <p className="text-sm font-bold text-[#17221F] dark:text-white">
            No {committeeFilter === 'all' ? 'committee' : committeeFilter === 'core' ? 'Core Committee' : 'Sub Committee'} members added yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMembers.map((m) => {
            const isSub = m.committeeType === 'sub' || Boolean(m.wingName);
            return (
              <div
                key={m.id}
                className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <SafeImage
                    src={m.avatarUrl || '/images/avatar_admin_portrait.jpg'}
                    alt={m.fullName}
                    className="w-14 h-14 rounded-full object-cover border-2 border-[#D4AF37] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          isSub
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-[#064E3B]/10 text-[#064E3B] dark:bg-[#D4AF37]/15 dark:text-[#D4AF37]'
                        }`}
                      >
                        {isSub ? 'Sub Committee' : 'Core Committee'}
                      </span>
                      {isSub && (m.wingName || m.department) && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[#17221F] dark:text-[#F0F5F2]">
                          {m.wingName || m.department}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[#17221F] dark:text-white mt-1.5 truncate">
                      {m.fullName}
                    </h3>
                    <p className="text-xs font-semibold text-[#064E3B] dark:text-[#D4AF37] truncate">
                      {isSub
                        ? `${m.subRole || m.position || 'Convener'} · ${m.wingName || m.department}`
                        : m.designation || m.position}
                    </p>
                    {!isSub && m.department && (
                      <p className="text-[11px] text-[#718078] dark:text-[#9AB0A6] mt-0.5 truncate">
                        {m.department}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5EAE6] dark:border-[#1B3B31]">
                  <button
                    type="button"
                    data-testid={`edit-committee-${m.id}`}
                    onClick={() => openEdit(m)}
                    className="px-3 py-1 rounded border border-[#E5EAE6] dark:border-[#1B3B31] text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === m.id}
                    data-testid={`delete-committee-${m.id}`}
                    aria-label={`Delete ${m.fullName}`}
                    onClick={async () => {
                      setDeletingId(m.id);
                      try {
                        const res = await onMutate({
                          action: 'DELETE_COMMITTEE_MEMBER',
                          memberId: m.id,
                        });
                        if (res.ok) {
                          showToast(`${m.fullName} removed from committee`, 'success');
                        } else {
                          showToast(res.error || 'Could not remove committee member', 'error');
                        }
                      } finally {
                        setDeletingId('');
                      }
                    }}
                    className="px-3 py-1 rounded border border-rose-200 dark:border-rose-900/50 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 text-xs font-semibold cursor-pointer inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> {deletingId === m.id ? 'Removing...' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl max-w-md w-full overflow-hidden shadow-2xl my-6">
            <div className="px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between">
              <h3 className="text-base font-bold">
                {editingId
                  ? `Edit ${committeeType === 'sub' ? 'Sub Committee' : 'Core Committee'} Member`
                  : `Add ${committeeType === 'sub' ? 'Sub Committee' : 'Core Committee'} Member`}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-xs text-white/80 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Committee Type Selector: Core Committee vs Sub Committee */}
              <div>
                <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1.5">
                  Select Committee Tier *
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31]">
                  <button
                    type="button"
                    data-testid="committee-type-core-btn"
                    onClick={() => handleCommitteeTypeSwitch('core')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      committeeType === 'core'
                        ? 'bg-[#064E3B] text-white shadow-xs'
                        : 'text-[#718078] dark:text-[#9AB0A6] hover:text-[#17221F] dark:hover:text-white'
                    }`}
                  >
                    Core Committee
                  </button>
                  <button
                    type="button"
                    data-testid="committee-type-sub-btn"
                    onClick={() => handleCommitteeTypeSwitch('sub')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      committeeType === 'sub'
                        ? 'bg-[#D4AF37] text-[#071713] shadow-xs'
                        : 'text-[#718078] dark:text-[#9AB0A6] hover:text-[#17221F] dark:hover:text-white'
                    }`}
                  >
                    Sub Committee
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                  Link Existing Student Account (Auto-fill Name &amp; Photo)
                </label>
                <select
                  value={linkedStudentUid}
                  onChange={(e) => handleLinkStudent(e.target.value)}
                  data-testid="committee-link-student-select"
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2]"
                >
                  <option value="">-- Optional: Pick a Student Account to Auto-fill --</option>
                  {activeStudents.map((s) => (
                    <option key={s.uid} value={s.uid}>
                      {s.fullName} ({s.studentId || s.username})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                  Member Full Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter full name"
                  data-testid="committee-member-fullname"
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2]"
                  required
                />
              </div>

              {committeeType === 'core' ? (
                <>
                  <SelectWithCustom
                    label="Position / Designation *"
                    value={designation}
                    onChange={setDesignation}
                    options={CORE_POSITION_OPTIONS}
                    savedCustomOptions={savedCorePositions}
                    onCustomValueCommit={(val) => commitCustomOption('committeePosition', val)}
                    customPlaceholder="Type custom position (e.g., Chief Coordinator)..."
                    data-testid="committee-core-position"
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                        Batch / Department
                      </label>
                      <input
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="11th Batch of DHBC"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#17221F] dark:text-[#F0F5F2] mb-1">
                        Contact Phone (Optional)
                      </label>
                      <input
                        type="text"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="+91 ..."
                        className="w-full px-3 py-2 text-xs rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2]"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* SUB COMMITTEE DYNAMIC FIELDS: Wing Name (typeable) + Chairman/Convener (+ Custom Type) */}
                  <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-[#D4AF37]/40 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-[#17221F] dark:text-[#D4AF37] mb-1">
                        Sub Committee Wing Name *
                      </label>
                      <input
                        type="text"
                        value={wingName}
                        onChange={(e) => setWingName(e.target.value)}
                        placeholder="Type Wing Name (e.g., Literary Wing, Media Wing, Academic Wing)..."
                        data-testid="committee-sub-wing-input"
                        className="w-full px-3.5 py-2 text-xs rounded-lg border border-[#D4AF37]/60 bg-white dark:bg-[#071713] text-[#17221F] dark:text-[#F0F5F2] focus:outline-none focus:border-[#064E3B]"
                        required
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Array.from(new Set([...SUB_WING_SUGGESTIONS, ...savedSubWings])).map(
                          (wing) => (
                            <button
                              key={wing}
                              type="button"
                              onClick={() => setWingName(wing)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                                wingName === wing
                                  ? 'bg-[#064E3B] text-white border-[#064E3B]'
                                  : 'bg-white dark:bg-[#0D231D] text-[#718078] dark:text-[#9AB0A6] border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#D4AF37]'
                              }`}
                            >
                              {wing}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#17221F] dark:text-[#D4AF37] mb-1.5">
                        Sub Committee Position (Chairman / Convener) *
                      </label>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {SUB_ROLE_OPTIONS.map((roleOpt) => (
                          <button
                            key={roleOpt}
                            type="button"
                            onClick={() => setSubRole(roleOpt)}
                            data-testid={`committee-sub-role-${roleOpt.toLowerCase()}`}
                            className={`py-2 px-3 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                              subRole === roleOpt
                                ? 'bg-[#064E3B] text-white border-[#064E3B]'
                                : 'bg-white dark:bg-[#0D231D] text-[#17221F] dark:text-[#F0F5F2] border-[#E5EAE6] dark:border-[#1B3B31] hover:border-[#D4AF37]'
                            }`}
                          >
                            {roleOpt}
                          </button>
                        ))}
                      </div>
                      <SelectWithCustom
                        value={subRole}
                        onChange={setSubRole}
                        options={SUB_ROLE_OPTIONS}
                        savedCustomOptions={savedSubRoles}
                        onCustomValueCommit={(val) => commitCustomOption('subCommitteeRole', val)}
                        customPlaceholder="Type custom Sub Committee role..."
                        data-testid="committee-sub-role-select"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#D4AF37] bg-slate-100 shrink-0">
                    <SafeImage
                      src={avatarUrl || '/images/avatar_admin_portrait.jpg'}
                      alt={fullName || 'Member portrait preview'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-[11px] text-[#718078] dark:text-[#9AB0A6]">
                    {avatarUrl ? 'Portrait photo ready for save.' : 'Upload a photo or link a student account above.'}
                  </div>
                </div>
                <DeviceFileUpload
                  label="Member Portrait Photo"
                  accept="image/*"
                  storageFolder="gallery"
                  destination="public"
                  currentUrl={avatarUrl}
                  onUploadingChange={setUploadingPhoto}
                  onFileUploaded={(meta) => setAvatarUrl(meta.url)}
                  onClear={() => setAvatarUrl('')}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingPhoto || saving}
                  data-testid="committee-save-member-btn"
                  className="px-5 py-2 rounded-lg bg-[#064E3B] disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
                >
                  {uploadingPhoto
                    ? 'Uploading Photo...'
                    : saving
                      ? 'Saving...'
                      : `Save ${committeeType === 'sub' ? 'Sub Committee' : 'Core Committee'} Member`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminFeedbackManager({
  feedback = [],
  onMutate,
  showToast,
}: {
  feedback: FeedbackRecord[];
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6">
        <h2 className="text-xl font-bold text-[#17221F] dark:text-white">
          Student Feedback Management
        </h2>
        <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-0.5">
          Review student suggestions, post administrative responses, and update resolution statuses.
        </p>
      </div>

      {feedback.length === 0 ? (
        <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-10 text-center">
          <ThumbsUp className="w-8 h-8 text-[#718078] mx-auto mb-2 opacity-60" />
          <p className="text-sm font-bold">No student feedback submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((fb) => (
            <div
              key={fb.id}
              className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#17221F] dark:text-white">
                    {fb.studentName} ({fb.studentId})
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#064E3B]/10 text-[#064E3B] dark:text-[#D4AF37] text-xs font-bold">
                    {fb.category}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#D4AF37]">
                    <Star className="w-3.5 h-3.5 fill-current" /> {fb.rating}/5
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <SelectWithCustom
                    value={fb.status}
                    onChange={async (nextStatus) => {
                      const res = await onMutate({
                        action: 'UPDATE_FEEDBACK_STATUS',
                        feedbackId: fb.id,
                        status: nextStatus,
                      });
                      if (res.ok) showToast('Feedback status updated', 'success');
                    }}
                    options={[
                      { value: 'submitted', label: 'Submitted' },
                      { value: 'reviewed', label: 'Reviewed' },
                      { value: 'resolved', label: 'Resolved' },
                    ]}
                    customPlaceholder="Custom status..."
                    selectClassName="px-2.5 py-1 rounded border border-[#E5EAE6] dark:border-[#1B3B31] text-xs font-bold bg-[#F8FAF7] dark:bg-[#071713]"
                    aria-label={`Status for ${fb.subject}`}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await onMutate({
                        action: 'DELETE_FEEDBACK',
                        feedbackId: fb.id,
                      });
                      if (res.ok) showToast('Feedback deleted', 'success');
                    }}
                    className="p-1.5 rounded text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[#17221F] dark:text-white">{fb.subject}</h3>
                <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-1">{fb.message}</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  value={replyTextMap[fb.id] ?? fb.adminResponse ?? ''}
                  onChange={(e) =>
                    setReplyTextMap((prev) => ({ ...prev, [fb.id]: e.target.value }))
                  }
                  placeholder="Write administrative response..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onMutate({
                      action: 'UPDATE_FEEDBACK_STATUS',
                      feedbackId: fb.id,
                      status: 'resolved',
                      adminResponse: replyTextMap[fb.id] ?? fb.adminResponse ?? '',
                    });
                    if (res.ok) showToast('Response saved', 'success');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#064E3B] text-white text-xs font-bold cursor-pointer"
                >
                  Save Response
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminDatabaseBackupResetCard({
  backupMeta,
  onMutate,
  showToast,
}: {
  backupMeta?: DatabaseBackupMeta;
  onMutate: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await onMutate({ action: 'RESET_APPLICATION_DATA' });
      if (res.ok) {
        showToast(
          'Database backed up and application data reset (SUPER ADMIN preserved).',
          'success'
        );
        setConfirmOpen(false);
      } else {
        showToast(res.error || 'Could not reset data', 'error');
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#064E3B]/10 text-[#064E3B] dark:text-[#D4AF37] flex items-center justify-center shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#17221F] dark:text-white">
              Database Backup & Clean System Reset
            </h3>
            <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-0.5">
              Verified pre-reset database backup is stored and restorable. Only the SUPER ADMIN account and database schemas are preserved during a full reset.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Backup & Reset Data</span>
        </button>
      </div>

      {backupMeta && (
        <div className="p-3.5 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Backup Verified & Restorable ({backupMeta.backupFilePath})
            </span>
          </div>
          <div className="flex items-center gap-2 text-[#718078] dark:text-[#9AB0A6] font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Preserved Admin: {backupMeta.preservedSuperAdminUid}</span>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 space-y-3">
          <p className="text-xs font-bold text-rose-900 dark:text-rose-200">
            Confirm Complete Application Data Reset: This will create a verified backup and clear all student accounts, notices, events, galleries, fines, and financial transactions while preserving SUPER ADMIN.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={resetting}
              onClick={() => void handleReset()}
              className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
            >
              {resetting ? 'Resetting...' : 'Confirm Backup & Reset'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SupabaseRlsDiagnosticCard({
  actorUid,
  showToast,
}: {
  actorUid: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<RlsDiagnosticReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runCheck = async () => {
    setRunning(true);
    setErrorMsg(null);
    try {
      const csrfMatch =
        typeof document !== 'undefined'
          ? document.cookie.match(/(?:^|;\s*)alnibras_csrf=([^;]+)/)
          : null;
      const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : '';
      const res = await fetch('/api/portal/rls-diagnostic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-uid': actorUid,
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });
      const data = (await res.json()) as RlsDiagnosticReport & { error?: string };
      if (!res.ok) {
        const err = data.error || 'Could not execute Supabase RLS diagnostic check.';
        setErrorMsg(err);
        showToast(err, 'error');
        return;
      }
      setReport(data);
      showToast(
        data.overallStatus === 'PASS'
          ? 'Supabase RLS policies verified for profiles, appointments, and portal_data.'
          : data.overallStatus === 'WARN'
          ? 'RLS diagnostic completed with schema alignment notes.'
          : 'RLS diagnostic detected unrestricted access policies!',
        data.overallStatus === 'FAIL' ? 'error' : 'success'
      );
    } catch {
      const err = 'Network error while running Supabase RLS diagnostic.';
      setErrorMsg(err);
      showToast(err, 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      data-testid="supabase-rls-diagnostic-card"
      className="bg-white dark:bg-[#0D231D] border border-[#E5EAE6] dark:border-[#1B3B31] rounded-xl p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#064E3B]/10 text-[#064E3B] dark:text-[#D4AF37] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#17221F] dark:text-white">
              Supabase Row Level Security (RLS) Diagnostic
            </h3>
            <p className="text-xs text-[#718078] dark:text-[#9AB0A6] mt-0.5">
              Verifies unauthenticated anon isolation and write protection across{' '}
              <span className="font-mono font-semibold">profiles</span>,{' '}
              <span className="font-mono font-semibold">appointments</span>,{' '}
              <span className="font-mono font-semibold">portal_data</span>, and normalized portal tables.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={running}
          onClick={() => void runCheck()}
          data-testid="run-rls-diagnostic-btn"
          className="px-4 py-2 rounded-lg bg-[#0B192C] hover:bg-[#162944] disabled:opacity-60 text-[#E6C665] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{running ? 'Verifying RLS...' : 'Run RLS Security Check'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      {report && (
        <div className="space-y-4 pt-2 border-t border-[#E5EAE6] dark:border-[#1B3B31]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              data-testid="rls-overall-status"
              className={`px-2.5 py-1 rounded-md font-bold uppercase ${
                report.overallStatus === 'PASS'
                  ? 'bg-emerald-100 text-emerald-800'
                  : report.overallStatus === 'WARN'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              Overall Status: {report.overallStatus}
            </span>
            <span className="text-[11px] font-mono text-[#718078] dark:text-[#9AB0A6]">
              Project: {report.projectId} · Checked {new Date(report.checkedAt).toLocaleString()}
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#064E3B] dark:text-[#D4AF37]">
              Requested Policy Targets (profiles · appointments · portal_data)
            </p>
            <div className="grid grid-cols-1 gap-2.5">
              {report.requestedTargets.map((item) => (
                <div
                  key={item.table}
                  data-testid={`rls-target-${item.table}`}
                  className="p-3.5 rounded-lg border border-[#E5EAE6] dark:border-[#1B3B31] bg-[#F8FAF7] dark:bg-[#071713] space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#0B192C] dark:text-white">
                        {item.table}
                      </span>
                      {item.canonicalAlias && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                          mapped → {item.canonicalAlias}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        item.status === 'ENFORCED' || item.status === 'ALIASED_NORMALIZED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'VULNERABLE_UNRESTRICTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#475569] dark:text-[#9AB0A6]">{item.summary}</p>
                  {item.checks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.checks.slice(0, 8).map((c, idx) => (
                        <span
                          key={`${item.table}-${c.operation}-${idx}`}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            c.operation === 'SELECT' && c.detail.startsWith('EXPOSED:')
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : c.operation !== 'SELECT' && c.allowed
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-white dark:bg-[#0D231D] border-[#E5EAE6] dark:border-[#1B3B31] text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {c.operation}: HTTP {c.httpStatus}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {report.schemaAudit && (
            <div className="p-3 rounded-lg bg-[#F8FAF7] dark:bg-[#071713] border border-[#E5EAE6] dark:border-[#1B3B31] text-xs flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#17221F] dark:text-white">
                SQL Policy Audit ({report.schemaAudit.checkedTables.length} core tables):{' '}
                {report.schemaAudit.allTablesHaveRlsEnabled &&
                report.schemaAudit.allTablesHavePolicies &&
                report.schemaAudit.wideOpenWriteTables.length === 0
                  ? 'All tables have RLS enabled & zero wide-open write policies.'
                  : 'Attention needed in schema policies.'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

