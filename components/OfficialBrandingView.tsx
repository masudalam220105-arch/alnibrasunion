'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  Layers,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react';
import { uploadImageAsset } from '@/lib/supabase-storage';
import type { BrandingConfig } from '@/lib/types';

export const OFFICIAL_ALNIBRAS_LOGO_PATH = '/assets/aistudio/al-nibras_logo_3b0dfbfe.png';

export interface OfficialLogoProps {
  branding?: BrandingConfig;
  placement?:
    | 'navbar'
    | 'sidebar'
    | 'login'
    | 'certificate'
    | 'certificates'
    | 'receipt'
    | 'receipts'
    | 'footer'
    | 'card'
    | 'homepage'
    | 'dashboard';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  sizePx?: number;
  showText?: boolean;
  lightText?: boolean;
  className?: string;
}

export function OfficialLogo({
  branding,
  placement = 'navbar',
  size,
  sizePx,
  showText = false,
  lightText = false,
  className = '',
}: OfficialLogoProps) {
  const logoSrc = branding?.logoUrl || OFFICIAL_ALNIBRAS_LOGO_PATH;
  const sizeFromToken =
    size === 'sm' ? 36 : size === 'md' ? 44 : size === 'lg' ? 58 : size === 'xl' ? 76 : undefined;
  const computedHeight =
    sizePx ||
    sizeFromToken ||
    (placement === 'navbar'
      ? branding?.navbarHeightPx || 44
      : placement === 'sidebar'
      ? branding?.sidebarHeightPx || 40
      : placement === 'certificate' || placement === 'certificates'
      ? branding?.certificateLogoHeightPx || 72
      : placement === 'receipt' || placement === 'receipts'
      ? branding?.receiptLogoHeightPx || 56
      : 44);

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className="inline-flex items-center justify-center rounded-xl bg-white p-1 border border-[#C59B27]/50 shadow-xs shrink-0 overflow-hidden"
        style={{ width: computedHeight, height: computedHeight }}
      >
        <img
          src={logoSrc}
          alt={branding?.unionTitle || 'AL-NIBRAS Official Logo'}
          className="w-full h-full object-contain"
        />
      </div>
      {showText && (
        <div className="min-w-0 text-left">
          <div
            className={`font-serif font-bold leading-tight ${
              placement === 'sidebar'
                ? 'text-xs tracking-normal'
                : 'text-sm tracking-wide truncate'
            } ${lightText ? 'text-white' : 'text-[#0C1A2E]'}`}
          >
            {branding?.unionTitle || 'AL-NIBRAS'}
          </div>
          <div
            className={`text-[10px] font-semibold uppercase tracking-widest truncate ${
              lightText ? 'text-[#E6C665]' : 'text-[#9A7515]'
            }`}
          >
            11th Batch of DHBC
          </div>
        </div>
      )}
    </div>
  );
}

interface OfficialBrandingViewProps {
  branding?: BrandingConfig;
  onSaveBranding?: (payload: Partial<BrandingConfig>) => Promise<void>;
  onMutate?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  notify?: (type: 'success' | 'error', msg: string) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

export function OfficialBrandingView({
  branding,
  onSaveBranding,
  onMutate,
  notify,
  showToast,
}: OfficialBrandingViewProps) {
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl || OFFICIAL_ALNIBRAS_LOGO_PATH);
  const [unionTitle, setUnionTitle] = useState(branding?.unionTitle || 'AL-NIBRAS CLASS UNION');
  const [tagline, setTagline] = useState(
    branding?.tagline || 'Enlightening Minds, Empowering the Future · 11th Batch of DHBC'
  );
  const [navbarHeightPx, setNavbarHeightPx] = useState(branding?.navbarHeightPx || 44);
  const [sidebarHeightPx, setSidebarHeightPx] = useState(branding?.sidebarHeightPx || 40);
  const [certificateLogoHeightPx, setCertificateLogoHeightPx] = useState(
    branding?.certificateLogoHeightPx || 72
  );
  const [receiptLogoHeightPx, setReceiptLogoHeightPx] = useState(
    branding?.receiptLogoHeightPx || 56
  );
  const [showInNavbar, setShowInNavbar] = useState(branding?.showInNavbar ?? true);
  const [showInSidebars, setShowInSidebars] = useState(branding?.showInSidebars ?? true);
  const [showInLogin, setShowInLogin] = useState(branding?.showInLogin ?? true);
  const [showInCertificates, setShowInCertificates] = useState(branding?.showInCertificates ?? true);
  const [showInReceipts, setShowInReceipts] = useState(branding?.showInReceipts ?? true);
  const [showInFooter, setShowInFooter] = useState(branding?.showInFooter ?? true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  const emitToast = (type: 'success' | 'error', msg: string) => {
    if (notify) notify(type, msg);
    else if (showToast) showToast(msg, type);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoUploadError(null);
    setUploadingLogo(true);
    try {
      const result = await uploadImageAsset(file, {
        folder: 'official-branding',
        destination: 'public',
        maxSizeMb: 15,
        maxDimension: 1200,
        preserveTransparency: true,
      });
      setLogoUrl(result.url);
      emitToast('success', `Uploaded "${file.name}" for live preview. Click Save Official Branding to apply.`);
    } catch (err) {
      const msg =
        err instanceof Error && err.message ? err.message : 'Failed to process uploaded logo image.';
      setLogoUploadError(msg);
      emitToast('error', msg);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<BrandingConfig> = {
        logoUrl,
        unionTitle,
        tagline,
        navbarHeightPx,
        sidebarHeightPx,
        certificateLogoHeightPx,
        receiptLogoHeightPx,
        showInNavbar,
        showInSidebars,
        showInLogin,
        showInCertificates,
        showInReceipts,
        showInFooter,
      };
      if (onSaveBranding) {
        await onSaveBranding(payload);
      } else if (onMutate) {
        const res = await onMutate({ action: 'SAVE_BRANDING', branding: payload });
        if (res.ok) {
          emitToast('success', 'Official Union branding & logo updated across the portal.');
        } else {
          emitToast('error', res.error || 'Could not update branding.');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="official-branding-view">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#0C1A2E] via-[#132642] to-[#0C1A2E] rounded-2xl p-6 text-white border border-[#C59B27]/30 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white p-1.5 border-2 border-[#C59B27] shadow-md shrink-0">
            <img
              src={logoUrl}
              alt="Official AL-NIBRAS Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#C59B27]/20 border border-[#C59B27]/40 text-[#E6C665] text-[11px] font-bold uppercase tracking-widest mb-1">
              <Sparkles className="w-3.5 h-3.5" /> Official Identity & Crest Control
            </div>
            <h2 className="font-serif text-2xl font-bold text-white">
              Official Branding & Union Logo Management
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Centralized control for the official AL-NIBRAS Class Union logo across Public Pages,
              Sidebars, Certificates, Financial Receipts, and Reports.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setLogoUrl(OFFICIAL_ALNIBRAS_LOGO_PATH);
            emitToast('success', 'Restored default official AL-NIBRAS crest.');
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-xs font-semibold text-white transition-colors self-start md:self-auto"
        >
          <RotateCcw className="w-4 h-4 text-[#E6C665]" />
          Restore Official AL-NIBRAS Logo
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Upload & Identity Text */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-[#E2DDD2] pb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#0F172A]">
                  1. Upload or Replace Official Union Logo
                </h3>
                <p className="text-xs text-[#64748B]">
                  Upload PNG, JPG, WEBP, GIF, or BMP from your device. Changes propagate immediately across all modules.
                </p>
                {logoUploadError && (
                  <p className="text-xs font-semibold text-red-600 mt-1">{logoUploadError}</p>
                )}
              </div>
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0C1A2E] hover:bg-[#162946] text-[#E6C665] text-xs font-bold uppercase tracking-wider transition-colors shadow-xs">
                <Upload className="w-4 h-4" />
                {uploadingLogo ? 'Uploading Logo...' : 'Upload From Device'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingLogo}
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="official-branding-file-input"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1.5">
                  Official Union Title
                </label>
                <input
                  type="text"
                  value={unionTitle}
                  onChange={(e) => setUnionTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:border-[#0C1A2E]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1.5">
                  Official Tagline / Batch Subtitle
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#0F172A] focus:outline-none focus:border-[#0C1A2E]"
                  required
                />
              </div>
            </div>

            {/* Dimensions Controls */}
            <div className="pt-2 border-t border-[#E2DDD2]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0C1A2E] mb-3 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#9A7515]" />
                2. Logo Dimensions Across Contexts (Pixels)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Navbar Size ({navbarHeightPx}px)
                  </label>
                  <input
                    type="number"
                    min={28}
                    max={80}
                    value={navbarHeightPx}
                    onChange={(e) => setNavbarHeightPx(Number(e.target.value) || 44)}
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Sidebar Size ({sidebarHeightPx}px)
                  </label>
                  <input
                    type="number"
                    min={28}
                    max={72}
                    value={sidebarHeightPx}
                    onChange={(e) => setSidebarHeightPx(Number(e.target.value) || 40)}
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Certificate Size ({certificateLogoHeightPx}px)
                  </label>
                  <input
                    type="number"
                    min={48}
                    max={120}
                    value={certificateLogoHeightPx}
                    onChange={(e) => setCertificateLogoHeightPx(Number(e.target.value) || 72)}
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                    Receipt Size ({receiptLogoHeightPx}px)
                  </label>
                  <input
                    type="number"
                    min={36}
                    max={100}
                    value={receiptLogoHeightPx}
                    onChange={(e) => setReceiptLogoHeightPx(Number(e.target.value) || 56)}
                    className="w-full px-3 py-2 rounded-lg border border-[#CBD5E1] text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Placement Toggles */}
            <div className="pt-2 border-t border-[#E2DDD2]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0C1A2E] mb-3">
                3. Placement Visibility Controls
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Public Navbar & Header', checked: showInNavbar, setter: setShowInNavbar },
                  { label: 'Admin & Student Sidebars', checked: showInSidebars, setter: setShowInSidebars },
                  { label: 'Login & Auth Modal', checked: showInLogin, setter: setShowInLogin },
                  { label: 'Official Certificates', checked: showInCertificates, setter: setShowInCertificates },
                  { label: 'Financial Receipts & Reports', checked: showInReceipts, setter: setShowInReceipts },
                  { label: 'Website Footer', checked: showInFooter, setter: setShowInFooter },
                ].map((item) => (
                  <label
                    key={item.label}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E2DDD2] bg-[#F8FAFC] cursor-pointer hover:border-[#C59B27]"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => item.setter(e.target.checked)}
                      className="w-4 h-4 accent-[#0C1A2E] rounded"
                    />
                    <span className="text-xs font-semibold text-[#0F172A]">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-[#E2DDD2] flex justify-end">
              <button
                type="submit"
                disabled={saving || uploadingLogo}
                data-testid="save-branding-btn"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0C1A2E] hover:bg-[#162946] disabled:opacity-60 text-[#E6C665] text-xs font-bold uppercase tracking-wider transition-all shadow-md"
              >
                <Save className="w-4 h-4" />
                {uploadingLogo ? 'Uploading Logo...' : saving ? 'Saving Official Branding...' : 'Save Official Branding'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Multi-Surface Preview */}
        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-[#E2DDD2] pb-3">
            <Eye className="w-4 h-4 text-[#9A7515]" />
            <h3 className="font-serif text-base font-bold text-[#0F172A]">
              Live Multi-Placement Preview
            </h3>
          </div>

          {/* Light Surface Preview */}
          <div className="p-4 rounded-xl bg-[#FDFBF7] border border-[#E2DDD2] text-center space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Certificate & Receipt Crest
            </span>
            <div className="mx-auto w-28 h-28 rounded-2xl bg-white border-2 border-[#C59B27] p-2 flex items-center justify-center shadow-sm">
              <img src={logoUrl} alt="Logo Preview" className="w-full h-full object-contain" />
            </div>
            <div className="font-serif text-sm font-bold text-[#0C1A2E]">{unionTitle}</div>
            <div className="text-[11px] text-[#64748B]">{tagline}</div>
          </div>

          {/* Dark Sidebar Header Preview */}
          <div className="p-4 rounded-xl bg-[#0C1A2E] border border-[#C59B27]/40 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white p-1 border border-[#C59B27] shrink-0">
              <img src={logoUrl} alt="Sidebar Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="font-serif text-sm font-bold text-white truncate">{unionTitle}</div>
              <div className="text-[10px] text-[#E6C665] uppercase tracking-widest truncate">
                11th Batch of DHBC
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 leading-relaxed">
              The official AL-NIBRAS calligraphy &amp; open-book emblem is active across Public
              Navbar, Admin &amp; Student Sidebars, Certificates, and Financial Receipts.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

export default OfficialBrandingView;

