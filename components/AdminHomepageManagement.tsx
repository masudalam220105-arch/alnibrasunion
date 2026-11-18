'use client';

import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Globe,
  Image as ImageIcon,
  Layout,
  Save,
  Sparkles,
  Upload,
} from 'lucide-react';
import { uploadImageAsset } from '@/lib/supabase-storage';
import type { BrandingConfig, HomepageSectionItem, PublicHomepageConfig } from '@/lib/types';
import { OFFICIAL_ALNIBRAS_LOGO_PATH } from './OfficialBrandingView';

interface AdminHomepageManagementProps {
  config?: PublicHomepageConfig;
  branding?: BrandingConfig;
  onSaveConfig?: (config: Partial<PublicHomepageConfig>) => Promise<void>;
  onMutate?: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  notify?: (type: 'success' | 'error', msg: string) => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

export function AdminHomepageManagement({
  config,
  onSaveConfig,
  onMutate,
  notify,
  showToast,
}: AdminHomepageManagementProps) {
  const [unionName, setUnionName] = useState(config?.unionName || 'AL-NIBRAS');
  const [unionSubtitle, setUnionSubtitle] = useState(
    config?.unionSubtitle || '11th Batch of DHBC · Class Union Directorate'
  );
  const [logoUrl, setLogoUrl] = useState(config?.logoUrl || OFFICIAL_ALNIBRAS_LOGO_PATH);
  const [heroBadgeText, setHeroBadgeText] = useState(
    config?.heroBadgeText || '2026–2027 Academic Term · Official Class Union Portal'
  );
  const [heroHeading, setHeroHeading] = useState(
    config?.heroHeading || 'Enlightening Minds, Empowering the Future.'
  );
  const [heroSubheading, setHeroSubheading] = useState(
    config?.heroSubheading ||
      'The official academic assembly, cultural fellowship, and administrative portal for scholars of the AL-NIBRAS Class Union (11th Batch of DHBC).'
  );
  const [heroBannerImageUrl, setHeroBannerImageUrl] = useState(
    config?.heroBannerImageUrl || '/images/hero_campus_library.jpg'
  );
  const [primaryCtaText, setPrimaryCtaText] = useState(
    config?.primaryCtaText || 'Access Member Workspace'
  );
  const [secondaryCtaText, setSecondaryCtaText] = useState(
    config?.secondaryCtaText || 'Explore Union Charter'
  );
  const [welcomeHeading, setWelcomeHeading] = useState(
    config?.welcomeHeading || 'A Legacy of Scholarly Excellence & Collective Stewardship'
  );
  const [welcomeDescription, setWelcomeDescription] = useState(
    config?.welcomeDescription ||
      'Founded to cultivate rhetorical eloquence, ethical leadership, and academic distinction, AL-NIBRAS unites student scholars through symposia, publications, and community service.'
  );
  const [aboutHeading, setAboutHeading] = useState(
    config?.aboutHeading || 'About the AL-NIBRAS Class Union'
  );
  const [aboutMission, setAboutMission] = useState(
    config?.aboutMission ||
      'Founded to cultivate scholarly distinction, rhetorical eloquence, and civic stewardship, the AL-NIBRAS Class Union serves as the official representative assembly and academic fellowship for enrolled scholars.'
  );
  const [aboutVision, setAboutVision] = useState(
    config?.aboutVision ||
      'Bridging classical intellectual heritage with contemporary academic rigor through student-led symposia, literary journals, and transparent union governance.'
  );
  const [contactHeading, setContactHeading] = useState(
    config?.contactHeading || 'Secretariat & Public Inquiries'
  );
  const [contactEmail, setContactEmail] = useState(
    config?.contactEmail || 'secretariat@alnibras-union.edu'
  );
  const [contactPhone, setContactPhone] = useState(config?.contactPhone || '+91 98470 22105');
  const [contactAddress, setContactAddress] = useState(
    config?.contactAddress ||
      'Al-Nibras Union Complex, Second Floor, Suite 204, DHBC Campus, Kerala, India'
  );
  const [officeHours, setOfficeHours] = useState(
    config?.officeHours || 'Monday – Saturday · 9:00 AM to 5:00 PM IST'
  );
  const [facebook, setFacebook] = useState(
    config?.socialLinks?.facebook || 'https://facebook.com/alnibras.union'
  );
  const [instagram, setInstagram] = useState(
    config?.socialLinks?.instagram || 'https://instagram.com/alnibras.union'
  );
  const [youtube, setYoutube] = useState(
    config?.socialLinks?.youtube || 'https://youtube.com/@alnibrasunion'
  );
  const [whatsapp, setWhatsapp] = useState(
    config?.socialLinks?.whatsapp || 'https://wa.me/919847022105'
  );
  const [footerDescription, setFooterDescription] = useState(
    config?.footerDescription ||
      'Official Institutional Portal of AL-NIBRAS Class Union (11th Batch of DHBC). Dedicated to academic excellence, cultural heritage, and student welfare.'
  );
  const [footerCopyright, setFooterCopyright] = useState(
    config?.footerCopyright || '© 2026 AL-NIBRAS Class Union Directorate. All Rights Reserved.'
  );
  const [sections, setSections] = useState<HomepageSectionItem[]>(() => {
    const base = config?.sections || [
      { id: 'hero', label: 'Hero & Welcome Banner', visible: true, order: 1 },
      { id: 'about', label: 'About Us & Union Charter', visible: true, order: 2 },
      { id: 'announcements', label: 'Latest Announcements & Notices', visible: true, order: 3 },
      { id: 'gallery', label: 'Gallery Preview', visible: true, order: 4 },
      { id: 'contact', label: 'Contact & Inquiry Desk', visible: true, order: 5 },
    ];
    return base
      .filter((s) => s.id !== 'events' && s.id !== 'videos')
      .map((s, i) => ({ ...s, order: i + 1 }));
  });
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const emitToast = (type: 'success' | 'error', msg: string) => {
    if (notify) notify(type, msg);
    else if (showToast) showToast(msg, type);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingBanner(true);
    try {
      const result = await uploadImageAsset(file, {
        folder: 'slideshow',
        destination: 'public',
        maxSizeMb: 15,
        maxDimension: 1400,
      });
      setHeroBannerImageUrl(result.url);
      emitToast('success', `Uploaded banner image "${file.name}".`);
    } catch (err) {
      emitToast(
        'error',
        err instanceof Error && err.message ? err.message : 'Failed to upload banner image.'
      );
    } finally {
      setUploadingBanner(false);
    }
  };

  const toggleSectionVisibility = (id: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    );
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const next = [...sections];
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setSections(next.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<PublicHomepageConfig> = {
        logoUrl,
        unionName,
        unionSubtitle,
        heroBadgeText,
        heroHeading,
        heroSubheading,
        heroBannerImageUrl,
        heroBackgroundUrl: heroBannerImageUrl,
        primaryCtaText,
        secondaryCtaText,
        welcomeHeading,
        welcomeDescription,
        aboutHeading,
        aboutMission,
        aboutVision,
        contactHeading,
        contactEmail,
        contactPhone,
        contactAddress,
        officeHours,
        socialLinks: {
          facebook,
          instagram,
          youtube,
          whatsapp,
        },
        footerDescription,
        footerCopyright,
        sections,
      };
      if (onSaveConfig) {
        await onSaveConfig(payload);
      } else if (onMutate) {
        const res = await onMutate({ action: 'SAVE_HOMEPAGE_CONFIG', config: payload });
        if (res.ok) {
          emitToast('success', 'Public Homepage layout and content saved.');
        } else {
          emitToast('error', res.error || 'Could not update homepage config.');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-homepage-management">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#0C1A2E] via-[#132642] to-[#0C1A2E] rounded-2xl p-6 text-white border border-[#C59B27]/30 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#C59B27]/20 border border-[#C59B27]/40 text-[#E6C665] text-[11px] font-bold uppercase tracking-widest mb-1">
            <Globe className="w-3.5 h-3.5" /> Website CMS &amp; Section Builder
          </div>
          <h2 className="font-serif text-2xl font-bold text-white">
            Public Homepage Management
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Control Hero Headings, Banner Images, About Union, Featured Sections, Contact Details,
            Social Links, Footer, and Section Visibility.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Hero & Banner Settings */}
          <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A] border-b border-[#E2DDD2] pb-3">
              1. Hero Section, Headings &amp; CTA Buttons
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Union Brand Name
                </label>
                <input
                  type="text"
                  value={unionName}
                  onChange={(e) => setUnionName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Batch / Subtitle
                </label>
                <input
                  type="text"
                  value={unionSubtitle}
                  onChange={(e) => setUnionSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Hero Headline
              </label>
              <input
                type="text"
                value={heroHeading}
                onChange={(e) => setHeroHeading(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm font-serif font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Hero Subheading Description
              </label>
              <textarea
                rows={2}
                value={heroSubheading}
                onChange={(e) => setHeroSubheading(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Primary Button Label
                </label>
                <input
                  type="text"
                  value={primaryCtaText}
                  onChange={(e) => setPrimaryCtaText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Secondary Button Label
                </label>
                <input
                  type="text"
                  value={secondaryCtaText}
                  onChange={(e) => setSecondaryCtaText(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-16 h-11 rounded-lg border border-slate-200 overflow-hidden bg-white shrink-0">
                  <img
                    src={heroBannerImageUrl || '/images/hero_campus_library.jpg'}
                    alt="Hero banner preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0C1A2E]">Hero Banner Image</div>
                  <div className="text-[11px] text-[#64748B] truncate max-w-xs sm:max-w-md">
                    {heroBannerImageUrl.startsWith('data:')
                      ? 'Uploaded Device Image Ready'
                      : heroBannerImageUrl.slice(0, 60)}
                  </div>
                </div>
              </div>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0C1A2E] text-[#E6C665] text-xs font-bold">
                <Upload className="w-3.5 h-3.5" />
                {uploadingBanner ? 'Uploading Banner...' : 'Upload Banner Image'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingBanner}
                  onChange={handleBannerUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* 2. Welcome & About Union */}
          <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A] border-b border-[#E2DDD2] pb-3">
              2. Welcome Message &amp; About Union Section
            </h3>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Welcome Heading
              </label>
              <input
                type="text"
                value={welcomeHeading}
                onChange={(e) => setWelcomeHeading(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                About Mission Statement
              </label>
              <textarea
                rows={3}
                value={aboutMission}
                onChange={(e) => setAboutMission(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                About Vision Statement
              </label>
              <textarea
                rows={2}
                value={aboutVision}
                onChange={(e) => setAboutVision(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>
          </div>

          {/* 3. Contact, Social Links & Footer */}
          <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="font-serif text-lg font-bold text-[#0F172A] border-b border-[#E2DDD2] pb-3">
              3. Contact Information, Social Links &amp; Footer
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Secretariat Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Campus / Secretariat Address
              </label>
              <input
                type="text"
                value={contactAddress}
                onChange={(e) => setContactAddress(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="Facebook URL"
                className="px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-xs"
              />
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="Instagram URL"
                className="px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-xs"
              />
              <input
                type="text"
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="YouTube URL"
                className="px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-xs"
              />
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="WhatsApp Link"
                className="px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#475569] mb-1">
                Footer Copyright Line
              </label>
              <input
                type="text"
                value={footerCopyright}
                onChange={(e) => setFooterCopyright(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm"
              />
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                disabled={saving || uploadingBanner}
                data-testid="save-homepage-config-btn"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0C1A2E] hover:bg-[#162946] disabled:opacity-60 text-[#E6C665] text-xs font-bold uppercase tracking-wider shadow-md"
              >
                <Save className="w-4 h-4" />
                {uploadingBanner
                  ? 'Uploading Banner...'
                  : saving
                  ? 'Saving Homepage...'
                  : 'Save Public Homepage Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Section Visibility & Ordering */}
        <div className="bg-white border border-[#E2DDD2] rounded-2xl p-6 shadow-xs space-y-4 h-fit">
          <div className="flex items-center gap-2 border-b border-[#E2DDD2] pb-3">
            <Layout className="w-4 h-4 text-[#9A7515]" />
            <h3 className="font-serif text-base font-bold text-[#0F172A]">
              Section Visibility &amp; Order
            </h3>
          </div>
          <p className="text-xs text-[#64748B]">
            Toggle which sections appear on the Public Homepage and reorder them dynamically.
          </p>

          <div className="space-y-2.5">
            {sections.map((sec, idx) => (
              <div
                key={sec.id}
                className="p-3 rounded-xl border border-[#E2DDD2] bg-[#F8FAFC] flex items-center justify-between gap-2"
              >
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sec.visible}
                    onChange={() => toggleSectionVisibility(sec.id)}
                    className="w-4 h-4 accent-[#0C1A2E] rounded"
                  />
                  <span className="text-xs font-bold text-[#0F172A]">{sec.label}</span>
                </label>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSection(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(idx, 1)}
                    disabled={idx === sections.length - 1}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}

export default AdminHomepageManagement;

