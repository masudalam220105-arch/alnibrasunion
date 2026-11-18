import type { Announcement, Notice, UnionEvent } from './types';

export type GlobalSearchFilter = 'all' | 'announcement' | 'notice' | 'event';

export interface GlobalSearchResultItem {
  id: string;
  kind: 'announcement' | 'notice' | 'event';
  title: string;
  summary: string;
  content: string;
  category: string;
  dateLabel: string;
  referenceCode?: string;
  venue?: string;
  priority?: 'normal' | 'high' | 'urgent';
  score: number;
}

export interface SearchGlobalPortalContentOptions {
  query: string;
  filter?: GlobalSearchFilter;
  announcements?: Announcement[];
  notices?: Notice[];
  events?: UnionEvent[];
  limit?: number;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function computeFieldScore(text: string, query: string, tokens: string[], weight: number): number {
  if (!text) return 0;
  let score = 0;
  if (text === query) {
    score += weight * 3;
  } else if (text.startsWith(query)) {
    score += weight * 2;
  } else if (text.includes(query)) {
    score += weight * 1.4;
  }
  for (const token of tokens) {
    if (token && text.includes(token)) {
      score += weight * 0.5;
    }
  }
  return score;
}

function buildExcerpt(raw: string, maxLength = 150): string {
  const clean = (raw || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Searches published announcements, notices, and events by keyword.
 * Draft items and hidden records are strictly excluded.
 */
export function searchGlobalPortalContent({
  query,
  filter = 'all',
  announcements = [],
  notices = [],
  events = [],
  limit = 24,
}: SearchGlobalPortalContentOptions): GlobalSearchResultItem[] {
  const q = normalizeText(query);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const results: GlobalSearchResultItem[] = [];

  if (filter === 'all' || filter === 'notice') {
    for (const notice of notices) {
      if (notice.status !== 'published') continue;
      const titleLower = normalizeText(notice.title);
      const contentLower = normalizeText(notice.content);
      const refLower = normalizeText(notice.referenceCode);
      const catLower = normalizeText(notice.category || 'Notice');

      let score = 1;
      if (q) {
        score =
          computeFieldScore(titleLower, q, tokens, 10) +
          computeFieldScore(refLower, q, tokens, 8) +
          computeFieldScore(catLower, q, tokens, 5) +
          computeFieldScore(contentLower, q, tokens, 3);
        if (score <= 0) continue;
      }

      results.push({
        id: notice.id,
        kind: 'notice',
        title: notice.title,
        summary: buildExcerpt(notice.content),
        content: notice.content,
        category: notice.category || 'Official Notice',
        dateLabel: notice.effectiveDate || notice.createdAt.slice(0, 10),
        referenceCode: notice.referenceCode,
        score: score + 2,
      });
    }
  }

  if (filter === 'all' || filter === 'announcement') {
    for (const ann of announcements) {
      if (ann.status !== 'published') continue;
      const titleLower = normalizeText(ann.title);
      const contentLower = normalizeText(ann.content);
      const catLower = normalizeText(ann.category);

      let score = 1;
      if (q) {
        score =
          computeFieldScore(titleLower, q, tokens, 10) +
          computeFieldScore(catLower, q, tokens, 6) +
          computeFieldScore(contentLower, q, tokens, 3);
        if (score <= 0) continue;
      }

      results.push({
        id: ann.id,
        kind: 'announcement',
        title: ann.title,
        summary: buildExcerpt(ann.content),
        content: ann.content,
        category: ann.category || 'Announcement',
        dateLabel: ann.createdAt.slice(0, 10),
        priority: ann.priority,
        score: score + (ann.priority === 'urgent' ? 2 : 1),
      });
    }
  }

  if (filter === 'all' || filter === 'event') {
    for (const evt of events) {
      if (evt.status !== 'published') continue;
      const titleLower = normalizeText(evt.title);
      const descLower = normalizeText(evt.description);
      const venueLower = normalizeText(evt.venue);
      const catLower = normalizeText(evt.category);

      let score = 1;
      if (q) {
        score =
          computeFieldScore(titleLower, q, tokens, 10) +
          computeFieldScore(venueLower, q, tokens, 7) +
          computeFieldScore(catLower, q, tokens, 6) +
          computeFieldScore(descLower, q, tokens, 3);
        if (score <= 0) continue;
      }

      results.push({
        id: evt.id,
        kind: 'event',
        title: evt.title,
        summary: buildExcerpt(evt.description),
        content: evt.description,
        category: evt.category || 'Union Event',
        dateLabel: evt.eventDate || evt.createdAt.slice(0, 10),
        venue: evt.venue,
        score,
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.dateLabel.localeCompare(a.dateLabel);
  });

  return results.slice(0, Math.max(1, limit));
}

export type PortalTopSearchFilter = 'all' | 'announcement' | 'notice' | 'user';

export interface PortalTopSearchResult {
  id: string;
  kind: 'announcement' | 'notice' | 'user';
  title: string;
  subtitle: string;
  content: string;
  category: string;
  dateLabel: string;
  status?: 'published' | 'draft' | 'active' | 'inactive';
  referenceCode?: string;
  priority?: 'normal' | 'high' | 'urgent';
  // User / Directory scoped metadata (non-PII for student viewers)
  userSource?: 'user' | 'committee';
  userRole?: string;
  department?: string;
  classInfo?: string;
  designation?: string;
  avatarUrl?: string;
  studentId?: string;
  score: number;
}

export interface SearchPortalTopBarOptions {
  query: string;
  filter?: PortalTopSearchFilter;
  viewerRole: 'admin' | 'teacher' | 'student';
  announcements?: Announcement[];
  notices?: Notice[];
  users?: Array<{
    uid: string;
    fullName: string;
    username: string;
    studentId: string;
    role: string;
    status: 'active' | 'inactive';
    department?: string;
    classInfo?: string;
    designation?: string;
    avatarUrl?: string;
  }>;
  committeeMembers?: Array<{
    id: string;
    fullName: string;
    designation?: string;
    position?: string;
    department?: string;
    batchInfo?: string;
    batch?: string;
    avatarUrl?: string;
    roleCategory?: string;
    committeeType?: 'core' | 'sub';
    wingName?: string;
    subRole?: string;
  }>;
  limit?: number;
}

/**
 * Searches announcements, notices, and users/committee members by keyword, name, or department.
 * Enforces strict RBAC privacy:
 * - Students only see published notices/announcements and non-PII user fields (name, department, role, batch/class, avatar).
 * - Administrators also see draft notices/announcements, student IDs, and inactive member status.
 */
export function searchPortalTopBar({
  query,
  filter = 'all',
  viewerRole,
  announcements = [],
  notices = [],
  users = [],
  committeeMembers = [],
  limit = 20,
}: SearchPortalTopBarOptions): PortalTopSearchResult[] {
  const q = normalizeText(query);
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const isAdmin = viewerRole === 'admin';
  const results: PortalTopSearchResult[] = [];

  if (filter === 'all' || filter === 'announcement') {
    for (const ann of announcements) {
      if (!isAdmin && ann.status !== 'published') continue;
      const titleLower = normalizeText(ann.title);
      const contentLower = normalizeText(ann.content);
      const catLower = normalizeText(ann.category);

      let score = 1;
      if (q) {
        score =
          computeFieldScore(titleLower, q, tokens, 10) +
          computeFieldScore(catLower, q, tokens, 6) +
          computeFieldScore(contentLower, q, tokens, 3);
        if (score <= 0) continue;
      }

      results.push({
        id: ann.id,
        kind: 'announcement',
        title: ann.title,
        subtitle: `${ann.category || 'Announcement'} · ${ann.createdAt.slice(0, 10)}`,
        content: buildExcerpt(ann.content, 160),
        category: ann.category || 'Announcement',
        dateLabel: ann.createdAt.slice(0, 10),
        status: ann.status,
        priority: ann.priority,
        score: score + (ann.priority === 'urgent' ? 2 : 1),
      });
    }
  }

  if (filter === 'all' || filter === 'notice') {
    for (const notice of notices) {
      if (!isAdmin && notice.status !== 'published') continue;
      const titleLower = normalizeText(notice.title);
      const contentLower = normalizeText(notice.content);
      const refLower = normalizeText(notice.referenceCode);
      const catLower = normalizeText(notice.category || 'Official Notice');

      let score = 1;
      if (q) {
        score =
          computeFieldScore(titleLower, q, tokens, 10) +
          computeFieldScore(refLower, q, tokens, 8) +
          computeFieldScore(catLower, q, tokens, 5) +
          computeFieldScore(contentLower, q, tokens, 3);
        if (score <= 0) continue;
      }

      results.push({
        id: notice.id,
        kind: 'notice',
        title: notice.title,
        subtitle: `${notice.referenceCode || 'Circular'} · ${notice.effectiveDate || notice.createdAt.slice(0, 10)}`,
        content: buildExcerpt(notice.content, 160),
        category: notice.category || 'Official Notice',
        dateLabel: notice.effectiveDate || notice.createdAt.slice(0, 10),
        status: notice.status,
        referenceCode: notice.referenceCode,
        score: score + 2,
      });
    }
  }

  if (filter === 'all' || filter === 'user') {
    const seenNames = new Set<string>();

    for (const u of users) {
      if (!isAdmin && u.status !== 'active') continue;
      const nameLower = normalizeText(u.fullName);
      const deptLower = normalizeText(u.department || '');
      const classLower = normalizeText(u.classInfo || '');
      const desigLower = normalizeText(u.designation || '');
      const roleLower = normalizeText(u.role);
      const sidLower = isAdmin ? normalizeText(u.studentId) : '';
      const unameLower = isAdmin ? normalizeText(u.username) : '';

      let score = 1;
      if (q) {
        score =
          computeFieldScore(nameLower, q, tokens, 12) +
          computeFieldScore(deptLower, q, tokens, 10) +
          computeFieldScore(classLower, q, tokens, 6) +
          computeFieldScore(desigLower, q, tokens, 6) +
          computeFieldScore(roleLower, q, tokens, 4) +
          computeFieldScore(sidLower, q, tokens, 8) +
          computeFieldScore(unameLower, q, tokens, 7);
        if (score <= 0) continue;
      }

      seenNames.add(`${nameLower}::${deptLower}`);
      const roleLabel =
        u.role === 'admin' ? 'Administrator' : u.role === 'teacher' ? 'Faculty' : 'Student';
      const deptOrClass = u.department || u.classInfo || '11th Batch of DHBC';

      results.push({
        id: u.uid,
        kind: 'user',
        title: u.fullName,
        subtitle: `${roleLabel} · ${deptOrClass}`,
        content: u.designation
          ? `${u.designation} — ${deptOrClass}`
          : `${roleLabel} in ${deptOrClass}`,
        category: roleLabel,
        dateLabel: u.classInfo || deptOrClass,
        status: isAdmin ? u.status : undefined,
        userSource: 'user',
        userRole: u.role,
        department: u.department || u.classInfo,
        classInfo: u.classInfo,
        designation: u.designation,
        avatarUrl: u.avatarUrl,
        studentId: isAdmin ? u.studentId : undefined,
        score: score + 1,
      });
    }

    for (const cm of committeeMembers) {
      const nameLower = normalizeText(cm.fullName);
      const deptLower = normalizeText(cm.wingName || cm.department || '');
      if (seenNames.has(`${nameLower}::${deptLower}`)) continue;

      const isSub = cm.committeeType === 'sub';
      const roleTitle = isSub
        ? cm.subRole || cm.designation || cm.position || 'Convener'
        : cm.designation || cm.position || 'Committee Member';
      const wingOrDept = isSub
        ? cm.wingName || cm.department || 'Sub Committee'
        : cm.department || cm.batchInfo || cm.batch || '11th Batch of DHBC';
      const batchLabel = cm.batchInfo || cm.batch || (isSub ? 'Sub Committee' : 'Core Committee');
      const roleLower = normalizeText(roleTitle);
      const catLower = normalizeText(cm.roleCategory || (isSub ? 'Sub Committee' : 'Executive'));

      let score = 1;
      if (q) {
        score =
          computeFieldScore(nameLower, q, tokens, 12) +
          computeFieldScore(deptLower, q, tokens, 10) +
          computeFieldScore(roleLower, q, tokens, 7) +
          computeFieldScore(catLower, q, tokens, 4);
        if (score <= 0) continue;
      }

      results.push({
        id: cm.id,
        kind: 'user',
        title: cm.fullName,
        subtitle: `${roleTitle} · ${wingOrDept}`,
        content: isSub ? `Sub Committee (${wingOrDept}) · ${roleTitle}` : `${roleTitle} (${wingOrDept})`,
        category: isSub ? 'Sub Committee' : 'Core Committee',
        dateLabel: batchLabel,
        userSource: 'committee',
        userRole: 'committee',
        department: wingOrDept,
        classInfo: batchLabel,
        designation: roleTitle,
        avatarUrl: cm.avatarUrl,
        score,
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.dateLabel.localeCompare(a.dateLabel);
  });

  return results.slice(0, Math.max(1, limit));
}
