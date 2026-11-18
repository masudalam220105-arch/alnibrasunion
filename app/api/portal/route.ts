import { NextRequest, NextResponse } from 'next/server';
import {
  hashPasswordScryptV2,
  verifyAndMigratePassword,
} from '@/lib/password-security';
import {
  loadServerStore,
  performVerifiedResetPreservingSuperAdmin,
  saveServerStore,
  scopeStateForActor,
  type PersistedServerStore,
} from '@/lib/server-db';
import {
  ensureServerHydratedFromSupabase,
  isSupabaseAdminConfigured,
  syncStoreDeltaToSupabaseServer,
} from '@/lib/supabase-server';
import {
  attachSessionCookies,
  checkAndRecordLoginRateLimit,
  clearLoginFailuresOnSuccess,
  clearSessionCookies,
  createPortalSession,
  extractTrustedClientIp,
  recordLoginFailure,
  resolveAuthenticatedActor,
  revokeAllUserSessions,
  revokeSessionById,
} from '@/lib/session-auth';
import {
  calculateResultPoints,
  createSanitizedActivityLog,
  formatINR,
  getIndiaDateISO,
  hashPasswordSync,
  recomputeStudentPointSummaries,
  sanitizeMediaUrl,
  sanitizeText,
  validateStudentUpdatePayload,
} from '@/lib/portal-logic';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';
import type {
  Announcement,
  AppointmentBooking,
  BrandingConfig,
  CalendarEvent,
  CertificateRecord,
  ChatMessage,
  CommitteeMember,
  CustomTypeRecord,
  DirectMessage,
  ExpenseRecord,
  FeedbackRecord,
  FinancialAuditLog,
  FinancialReceiptRecord,
  FineRecord,
  GalleryItem,
  IncomeRecord,
  MediaDestination,
  Notice,
  PasswordResetLog,
  PaymentMethodType,
  PointTransaction,
  PortalDatabaseState,
  PortalNotification,
  ProgramParticipant,
  ProgramResult,
  PublicHomepageConfig,
  SlideshowSlide,
  StudentAddress,
  StudentContributionRecord,
  StudentDueRecord,
  StudentResultRecord,
  UserProfile,
} from '@/lib/types';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 240) {
    return false;
  }
  entry.count += 1;
  return true;
}



export async function GET(req: NextRequest) {
  const store = loadServerStore();
  if (isSupabaseAdminConfigured()) {
    await ensureServerHydratedFromSupabase(store);
  }
  const fallbackActorUid = req.nextUrl.searchParams.get('actorUid') || '';
  const resolved = resolveAuthenticatedActor(req, store, {
    requireCsrf: false,
    fallbackActorUid,
  });
  const actor = resolved.authenticated ? resolved.actor : null;

  return NextResponse.json({
    ok: true,
    user: actor,
    state: scopeStateForActor(store.state, actor),
  });
}

export async function POST(req: NextRequest) {
  const store = loadServerStore();
  const useRemoteSync = isSupabaseAdminConfigured();
  if (useRemoteSync) {
    await ensureServerHydratedFromSupabase(store);
  }

  const prevMutationVersion = store.mutationVersion || 1;
  const prevState = useRemoteSync ? structuredClone(store.state) : null;
  const prevCredFingerprint = useRemoteSync
    ? JSON.stringify({ c: store.credentials, s: store.scryptCredentials || {} })
    : undefined;

  const response = await handlePortalPost(req, store);

  if (useRemoteSync && prevState && (store.mutationVersion || 1) !== prevMutationVersion) {
    const syncRes = await syncStoreDeltaToSupabaseServer(prevState, store, {
      prevCredFingerprint,
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const cloned = response.clone();
        const json = (await cloned.json()) as Record<string, unknown>;
        if (json && json.ok === true) {
          const updatedJson = {
            ...json,
            syncedToSupabase: !syncRes.warning,
            ...(syncRes.warning ? { syncWarning: syncRes.warning } : {}),
          };
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          return new NextResponse(JSON.stringify(updatedJson), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }
      } catch {
        // Keep original response if body could not be cloned/parsed
      }
    }
  }

  return response;
}

async function handlePortalPost(req: NextRequest, store: PersistedServerStore) {
  const clientIp = extractTrustedClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const action = String(body.action || '');
  const actorUid = String(body.actorUid || '');
  const state = store.state;
  const now = new Date().toISOString();

  // 1. LOGIN (Username + Password with 2-State Legacy pbkdf2_v1$ -> Direct $scrypt$v=2$ Upgrade)
  if (action === 'LOGIN') {
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: 'Please enter both username and password.' },
        { status: 400 }
      );
    }

    const rateCheck = checkAndRecordLoginRateLimit(store, clientIp, username);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: `Too many failed login attempts from your network. Please wait ${rateCheck.retryAfterSeconds} seconds.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const user = state.users.find((u) => u.username.toLowerCase() === username);
    if (!user) {
      recordLoginFailure(store, clientIp, username);
      return NextResponse.json(
        { ok: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    const scryptHash = store.scryptCredentials?.[user.uid] || null;
    const legacyHash = store.credentials[user.uid] || null;

    const verResult = await verifyAndMigratePassword({
      submittedPassword: password,
      scryptHash,
      legacyHash,
    });

    if (!verResult.verified) {
      recordLoginFailure(store, clientIp, username);
      return NextResponse.json(
        { ok: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    if (user.status !== 'active') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Your student union account is currently deactivated. Please contact the Union Secretariat.',
        },
        { status: 403 }
      );
    }

    clearLoginFailuresOnSuccess(store, clientIp, username);

    // Immediate upgrade from legacy pbkdf2_v1$ to direct $scrypt$v=2$ while leaving store.credentials untouched
    if (verResult.needsUpgrade && verResult.upgradedScryptHash) {
      if (!store.scryptCredentials) {
        store.scryptCredentials = {};
      }
      store.scryptCredentials[user.uid] = verResult.upgradedScryptHash;
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: user.uid,
        actorName: user.fullName,
        actionType: 'LOGIN',
        details: `Authenticated session started for ${user.fullName} (@${user.username})`,
        targetId: user.uid,
        createdAt: now,
      })
    );
    saveServerStore(store);

    const issuedSession = createPortalSession(store, user, req);
    const response = NextResponse.json({
      ok: true,
      user,
      csrfToken: issuedSession.csrfToken,
      passwordScheme: verResult.needsUpgrade ? 'upgraded_to_scrypt_v2' : verResult.scheme,
      state: scopeStateForActor(state, user),
    });
    return attachSessionCookies(response, issuedSession);
  }

  // 2. GOOGLE_LOGIN (Hardened: Never trusts raw body.email; cryptographically verifies Supabase JWT)
  if (action === 'GOOGLE_LOGIN') {
    const accessToken = String(body.idToken || body.accessToken || '').trim();
    if (!accessToken || accessToken.split('.').length !== 3) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Security Policy: Unverified email login is disabled. A cryptographically verified Supabase session token or username/password login is required.',
        },
        { status: 403 }
      );
    }

    try {
      const lookupRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!lookupRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Invalid or expired Supabase session token. Please sign in again.',
          },
          { status: 403 }
        );
      }

      const supaAccount = (await lookupRes.json()) as {
        id?: string;
        email?: string;
        email_confirmed_at?: string | null;
        confirmed_at?: string | null;
      };

      const verifiedEmail = (supaAccount?.email || '').trim().toLowerCase();
      const isVerified = Boolean(supaAccount?.email_confirmed_at || supaAccount?.confirmed_at);
      if (!supaAccount || !verifiedEmail || !isVerified) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Supabase account email must be verified to sign in to the portal.',
          },
          { status: 403 }
        );
      }

      let matchedUser: UserProfile | undefined;
      if (verifiedEmail === 'masudalam220105@gmail.com') {
        matchedUser = state.users.find((u) => u.uid === 'admin_super' || u.role === 'admin');
      } else {
        matchedUser = state.users.find(
          (u) => (u.contactEmail || '').trim().toLowerCase() === verifiedEmail
        );
      }

      if (!matchedUser || matchedUser.status !== 'active') {
        return NextResponse.json(
          {
            ok: false,
            error: `No active Al-Nibras portal profile is registered for ${verifiedEmail}.`,
          },
          { status: 403 }
        );
      }

      state.activityLogs.unshift(
        createSanitizedActivityLog({
          id: `log_${Date.now()}`,
          actorId: matchedUser.uid,
          actorName: matchedUser.fullName,
          actionType: 'LOGIN',
          details: `Verified Supabase Sign-In for ${matchedUser.fullName} (${verifiedEmail})`,
          targetId: matchedUser.uid,
          createdAt: now,
        })
      );
      saveServerStore(store);

      const issuedSession = createPortalSession(store, matchedUser, req);
      const response = NextResponse.json({
        ok: true,
        user: matchedUser,
        csrfToken: issuedSession.csrfToken,
        state: scopeStateForActor(state, matchedUser),
      });
      return attachSessionCookies(response, issuedSession);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Could not verify Supabase session token at this time. Please use username and password login.',
        },
        { status: 403 }
      );
    }
  }

  // 3. PUBLIC_CONTACT_MESSAGE (From landing page contact form)
  if (action === 'PUBLIC_CONTACT_MESSAGE') {
    const senderName = sanitizeText(String(body.senderName || ''), 120);
    const senderEmail = sanitizeText(String(body.senderEmail || ''), 120);
    const subject = sanitizeText(String(body.subject || ''), 160);
    const messageBody = sanitizeText(String(body.body || ''), 2000);
    const requestedId = body.id ? sanitizeText(String(body.id), 80) : '';

    if (senderName.length < 2 || !senderEmail.includes('@') || subject.length < 3 || messageBody.length < 5) {
      return NextResponse.json(
        { ok: false, error: 'Please complete all contact form fields with valid information.' },
        { status: 400 }
      );
    }

    const msg: DirectMessage = {
      id: requestedId || `msg_${Date.now()}`,
      senderId: 'public_visitor',
      senderName: `${senderName} (${senderEmail})`,
      recipientId: 'admin_super',
      subject,
      body: messageBody,
      status: 'unread',
      createdAt: now,
      updatedAt: now,
    };
    state.messages.unshift(msg);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, null) });
  }

  // 3B. PUBLIC_BOOK_APPOINTMENT (From landing page appointment booking form)
  if (action === 'PUBLIC_BOOK_APPOINTMENT') {
    const fullName = sanitizeText(String(body.fullName || ''), 120);
    const email = sanitizeText(String(body.email || ''), 120).toLowerCase();
    const phone = sanitizeText(String(body.phone || ''), 40);
    const department = sanitizeText(String(body.department || 'Union Secretariat'), 100);
    const preferredDate = sanitizeText(String(body.preferredDate || ''), 30);
    const preferredTime = sanitizeText(String(body.preferredTime || ''), 40);
    const purpose = sanitizeText(String(body.purpose || ''), 200);
    const notes = sanitizeText(String(body.notes || ''), 1500);
    const studentUid = body.studentUid ? sanitizeText(String(body.studentUid), 80) : undefined;
    const requestedId = body.id ? sanitizeText(String(body.id), 80) : '';

    if (
      fullName.length < 2 ||
      !email.includes('@') ||
      phone.length < 6 ||
      !preferredDate ||
      !preferredTime ||
      purpose.length < 3
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Please fill out your full name, valid email, phone number, preferred date/time, and appointment purpose.',
        },
        { status: 400 }
      );
    }

    if (!state.appointments) state.appointments = [];
    const appointment: AppointmentBooking = {
      id: requestedId || `appt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      fullName,
      email,
      phone,
      department,
      preferredDate,
      preferredTime,
      purpose,
      notes: notes || undefined,
      status: 'pending',
      studentUid,
      createdAt: now,
      updatedAt: now,
    };
    state.appointments.unshift(appointment);

    state.notifications.unshift({
      id: `notif_${Date.now()}_appt`,
      recipientId: 'admin_super',
      title: `New Appointment Booking: ${fullName}`,
      message: `${department} on ${preferredDate} at ${preferredTime} — ${purpose}`,
      type: 'system',
      read: false,
      readByUids: [],
      relatedId: appointment.id,
      createdAt: now,
      updatedAt: now,
    });

    saveServerStore(store);
    return NextResponse.json({
      ok: true,
      appointment,
      state: scopeStateForActor(state, null),
    });
  }

  // Require valid authenticated actor (with session/CSRF check when session cookie is present) for all protected portal operations
  const hasSessionCookie = Boolean(req.cookies.get('alnibras_session')?.value);
  const authResult = resolveAuthenticatedActor(req, store, {
    requireCsrf: hasSessionCookie,
    fallbackActorUid: actorUid,
  });

  if (!authResult.authenticated || !authResult.actor) {
    return NextResponse.json(
      { ok: false, error: authResult.error || 'Unauthorized request. Please log in again.' },
      { status: authResult.statusCode || 401 }
    );
  }

  const actor = authResult.actor;

  // 4. LOGOUT
  if (action === 'LOGOUT') {
    if (authResult.session) {
      revokeSessionById(store, authResult.session.sessionId, 'USER_LOGOUT');
    }
    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'LOGOUT',
        details: `Session signed out by ${actor.fullName} (@${actor.username})`,
        targetId: actor.uid,
        createdAt: now,
      })
    );
    saveServerStore(store);
    const res = NextResponse.json({ ok: true, state: scopeStateForActor(state, null) });
    return clearSessionCookies(res);
  }

  // 5. CREATE_STUDENT (Admin Only — House Name & Street removed per Part 7)
  if (action === 'CREATE_STUDENT') {
    if (actor.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: Only SUPER ADMIN can create student accounts.' },
        { status: 403 }
      );
    }
    const fullName = sanitizeText(String(body.fullName || ''), 120);
    const username = sanitizeText(String(body.username || ''), 64).toLowerCase();
    const studentId = sanitizeText(String(body.studentId || ''), 40);
    const rollNumber = sanitizeText(String(body.rollNumber || ''), 40);
    const classInfo = sanitizeText(String(body.classInfo || '11th Batch of DHBC'), 100);
    const department = sanitizeText(String(body.department || classInfo || '11th Batch of DHBC'), 100);
    const contactEmail = sanitizeText(String(body.contactEmail || ''), 120);
    const contactPhone = sanitizeText(String(body.contactPhone || ''), 40);
    const avatarUrl = sanitizeMediaUrl(
      body.avatarUrl,
      '/images/avatar_admin_portrait.jpg'
    );
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    const rawPassword = String(body.password || '');

    const rawAddr = (body.address || {}) as Record<string, unknown>;
    const address: StudentAddress = {
      villageArea: sanitizeText(String(rawAddr.villageArea || ''), 120),
      postOffice: sanitizeText(String(rawAddr.postOffice || ''), 120),
      policeStation: sanitizeText(String(rawAddr.policeStation || ''), 120),
      district: sanitizeText(String(rawAddr.district || ''), 120),
      state: sanitizeText(String(rawAddr.state || ''), 120),
      pinCode: sanitizeText(String(rawAddr.pinCode || ''), 20),
      country: sanitizeText(String(rawAddr.country || 'India'), 80),
    };

    if (
      fullName.length < 2 ||
      username.length < 3 ||
      studentId.length < 2 ||
      rollNumber.length < 1 ||
      contactPhone.length < 3 ||
      rawPassword.length < 6
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Full Name, Username, Student ID, Roll Number, Phone Number, and Password (min 6 chars) are required.',
        },
        { status: 400 }
      );
    }

    if (contactEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json(
        { ok: false, error: 'Please enter a valid email address or leave Contact Email empty.' },
        { status: 400 }
      );
    }

    if (state.users.some((u) => u.username.toLowerCase() === username)) {
      return NextResponse.json(
        { ok: false, error: 'That username is already assigned to another account.' },
        { status: 409 }
      );
    }

    const newUid = `student_${Date.now()}`;
    const newStudent: UserProfile = {
      uid: newUid,
      fullName,
      username,
      studentId,
      rollNumber,
      role: 'student',
      status,
      contactEmail,
      contactPhone,
      avatarUrl,
      department,
      classInfo,
      address,
      createdAt: now,
      updatedAt: now,
    };

    state.users.push(newStudent);
    if (!store.scryptCredentials) store.scryptCredentials = {};
    store.scryptCredentials[newUid] = await hashPasswordScryptV2(rawPassword);
    store.credentials[newUid] = hashPasswordSync(rawPassword);

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'ACCOUNT_CREATION',
        details: `Created student account for ${fullName} (@${username}, ID: ${studentId})`,
        targetId: newUid,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, student: newStudent, state });
  }

  // 6. UPDATE_STUDENT (Admin Only — House Name & Street removed per Part 7)
  if (action === 'UPDATE_STUDENT') {
    if (actor.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: Student profiles are managed exclusively by SUPER ADMIN.' },
        { status: 403 }
      );
    }
    const targetUid = String(body.targetUid || '');
    const targetUser = state.users.find((u) => u.uid === targetUid);
    if (!targetUser) {
      return NextResponse.json({ ok: false, error: 'Student account not found.' }, { status: 404 });
    }

    const patch = (body.patch || {}) as Record<string, unknown>;

    if (typeof patch.username === 'string') {
      const cleanUsername = sanitizeText(patch.username, 64).toLowerCase();
      const conflict = state.users.some(
        (u) => u.uid !== targetUid && u.username.toLowerCase() === cleanUsername
      );
      if (conflict) {
        return NextResponse.json(
          { ok: false, error: 'Username is already taken by another union member.' },
          { status: 409 }
        );
      }
      targetUser.username = cleanUsername;
    }

    if (typeof patch.fullName === 'string') targetUser.fullName = sanitizeText(patch.fullName, 120);
    if (typeof patch.contactEmail === 'string') {
      const cleanEmail = sanitizeText(patch.contactEmail, 120);
      if (cleanEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return NextResponse.json(
          { ok: false, error: 'Please enter a valid email address or leave Contact Email empty.' },
          { status: 400 }
        );
      }
      targetUser.contactEmail = cleanEmail;
    }
    if (typeof patch.contactPhone === 'string')
      targetUser.contactPhone = sanitizeText(patch.contactPhone, 40);
    if (typeof patch.avatarUrl === 'string')
      targetUser.avatarUrl = sanitizeMediaUrl(patch.avatarUrl, targetUser.avatarUrl);
    if (typeof patch.studentId === 'string')
      targetUser.studentId = sanitizeText(patch.studentId, 40);
    if (typeof patch.rollNumber === 'string')
      targetUser.rollNumber = sanitizeText(patch.rollNumber, 40);
    if (typeof patch.classInfo === 'string')
      targetUser.classInfo = sanitizeText(patch.classInfo, 100);
    if (typeof patch.department === 'string')
      targetUser.department = sanitizeText(patch.department, 100);
    if (patch.status === 'active' || patch.status === 'inactive') {
      targetUser.status = patch.status;
      if (patch.status === 'inactive') {
        revokeAllUserSessions(store, targetUid, 'ACCOUNT_DEACTIVATED');
      }
    }
    if (patch.address && typeof patch.address === 'object') {
      const rawAddr = patch.address as Record<string, unknown>;
      targetUser.address = {
        villageArea: sanitizeText(String(rawAddr.villageArea ?? targetUser.address?.villageArea ?? ''), 120),
        postOffice: sanitizeText(String(rawAddr.postOffice ?? targetUser.address?.postOffice ?? ''), 120),
        policeStation: sanitizeText(String(rawAddr.policeStation ?? targetUser.address?.policeStation ?? ''), 120),
        district: sanitizeText(String(rawAddr.district ?? targetUser.address?.district ?? ''), 120),
        state: sanitizeText(String(rawAddr.state ?? targetUser.address?.state ?? ''), 120),
        pinCode: sanitizeText(String(rawAddr.pinCode ?? targetUser.address?.pinCode ?? ''), 20),
        country: sanitizeText(String(rawAddr.country ?? targetUser.address?.country ?? 'India'), 80),
      };
    }
    if (typeof body.newPassword === 'string' && body.newPassword.trim().length >= 6) {
      const cleanPass = body.newPassword.trim();
      if (!store.scryptCredentials) store.scryptCredentials = {};
      store.scryptCredentials[targetUid] = await hashPasswordScryptV2(cleanPass);
      store.credentials[targetUid] = hashPasswordSync(cleanPass);
      revokeAllUserSessions(store, targetUid, 'ADMIN_PASSWORD_UPDATE');
    }

    targetUser.updatedAt = now;

    if (Array.isArray(state.studentResults)) {
      for (const r of state.studentResults) {
        if (r.studentUid === targetUser.uid) {
          r.studentAvatar = targetUser.avatarUrl;
          r.studentName = targetUser.fullName;
        }
      }
    }
    if (Array.isArray(state.studentPoints)) {
      state.studentPoints = recomputeStudentPointSummaries(state.users, state.studentResults || [], now);
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'PROFILE_UPDATE',
        details: `Updated profile details for ${targetUser.fullName} (@${targetUser.username})`,
        targetId: targetUser.uid,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, user: targetUser, state });
  }

  // 7. CHANGE_USERNAME (Authenticated user changes own username, or Admin)
  if (action === 'CHANGE_USERNAME') {
    const newUsername = sanitizeText(String(body.newUsername || ''), 64).toLowerCase();
    if (newUsername.length < 3 || /\s/.test(newUsername)) {
      return NextResponse.json(
        { ok: false, error: 'Username must be at least 3 characters with no spaces.' },
        { status: 400 }
      );
    }
    const conflict = state.users.some(
      (u) => u.uid !== actor.uid && u.username.toLowerCase() === newUsername
    );
    if (conflict) {
      return NextResponse.json(
        { ok: false, error: 'That username is already in use.' },
        { status: 409 }
      );
    }
    const previousUsername = actor.username;
    actor.username = newUsername;
    actor.updatedAt = now;

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'USERNAME_CHANGE',
        details: `Changed portal username from @${previousUsername} to @${newUsername}`,
        targetId: actor.uid,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, user: actor, state: scopeStateForActor(state, actor) });
  }

  // 8. CHANGE_PASSWORD
  if (action === 'CHANGE_PASSWORD') {
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (newPassword.length < 6) {
      return NextResponse.json(
        { ok: false, error: 'New password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const existingScrypt = store.scryptCredentials?.[actor.uid] || null;
    const existingLegacy = store.credentials[actor.uid] || null;

    if (existingScrypt || existingLegacy) {
      const checkCurr = await verifyAndMigratePassword({
        submittedPassword: currentPassword,
        scryptHash: existingScrypt,
        legacyHash: existingLegacy,
      });
      if (!checkCurr.verified) {
        return NextResponse.json(
          { ok: false, error: 'Current password verification failed.' },
          { status: 403 }
        );
      }
    }

    if (!store.scryptCredentials) store.scryptCredentials = {};
    store.scryptCredentials[actor.uid] = await hashPasswordScryptV2(newPassword);
    if (actor.uid !== 'admin_super') {
      store.credentials[actor.uid] = hashPasswordSync(newPassword);
    }
    actor.updatedAt = now;

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'PASSWORD_CHANGE',
        details: `Updated account security password hash for ${actor.fullName}`,
        targetId: actor.uid,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  // 8B. UPDATE_AVATAR (Authenticated student or admin updates their own profile avatar)
  if (action === 'UPDATE_AVATAR') {
    const rawAvatarUrl = String(body.avatarUrl || '').trim();
    const avatarUrl = sanitizeMediaUrl(rawAvatarUrl, '');
    if (!avatarUrl || (!avatarUrl.startsWith('/') && !avatarUrl.startsWith('http') && !avatarUrl.startsWith('data:image/'))) {
      return NextResponse.json(
        { ok: false, error: 'Please select a valid avatar preset or upload an image file.' },
        { status: 400 }
      );
    }

    const validation = validateStudentUpdatePayload(
      actor,
      { avatarUrl, updatedAt: now },
      { uid: actor.uid, role: actor.role, emailVerified: true }
    );
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, error: `Avatar update rejected (${validation.reason}).` },
        { status: 403 }
      );
    }

    actor.avatarUrl = avatarUrl;
    actor.updatedAt = now;

    // Sync avatar across student results and point summaries for consistency
    if (Array.isArray(state.studentResults)) {
      for (const r of state.studentResults) {
        if (r.studentUid === actor.uid) {
          r.studentAvatar = avatarUrl;
        }
      }
    }
    if (Array.isArray(state.studentPoints)) {
      state.studentPoints = recomputeStudentPointSummaries(state.users, state.studentResults || [], now);
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'PROFILE_UPDATE',
        details: `Updated profile avatar image for ${actor.fullName} (@${actor.username})`,
        targetId: actor.uid,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, user: actor, state: scopeStateForActor(state, actor) });
  }

  // 9. CMS ACTIONS (Announcements, Notices, Gallery, Settings) — Admin Only
  if (
    [
      'SAVE_ANNOUNCEMENT',
      'DELETE_ANNOUNCEMENT',
      'SAVE_NOTICE',
      'DELETE_NOTICE',
      'SAVE_GALLERY',
      'DELETE_GALLERY',
      'UPDATE_SETTINGS',
    ].includes(action)
  ) {
    if (actor.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: Administrative privileges required.' },
        { status: 403 }
      );
    }

    if (action === 'SAVE_ANNOUNCEMENT') {
      const id = String(body.id || '');
      const title = sanitizeText(String(body.title || ''), 180);
      const content = sanitizeText(String(body.content || ''), 4000);
      const category = sanitizeText(String(body.category || 'Academic'), 60);
      const status = body.status === 'draft' ? 'draft' : 'published';
      const priority =
        body.priority === 'urgent' || body.priority === 'high' ? body.priority : 'normal';
      const showOnHomepage = body.showOnHomepage !== undefined ? Boolean(body.showOnHomepage) : true;
      const attachmentUrl = body.attachmentUrl
        ? sanitizeMediaUrl(body.attachmentUrl, '')
        : undefined;
      const attachmentName = body.attachmentName
        ? sanitizeText(String(body.attachmentName), 180)
        : undefined;

      if (title.length < 3 || content.length < 5) {
        return NextResponse.json(
          { ok: false, error: 'Announcement title and content are required.' },
          { status: 400 }
        );
      }

      const existingIdx = state.announcements.findIndex((a) => a.id === id);
      if (existingIdx >= 0) {
        const prev = state.announcements[existingIdx];
        const wasDraft = prev.status === 'draft';
        state.announcements[existingIdx] = {
          ...prev,
          title,
          content,
          category,
          status,
          priority,
          showOnHomepage,
          attachmentUrl: attachmentUrl !== undefined ? attachmentUrl : prev.attachmentUrl,
          attachmentName: attachmentName !== undefined ? attachmentName : prev.attachmentName,
          updatedAt: now,
        };
        if (wasDraft && status === 'published') {
          state.notifications.unshift({
            id: `notif_${Date.now()}`,
            recipientId: 'ALL_STUDENTS',
            title: 'New Official Announcement Published',
            message: title,
            type: 'announcement',
            read: false,
            readByUids: [],
            relatedId: prev.id,
            createdAt: now,
            updatedAt: now,
          });
        }
        state.activityLogs.unshift(
          createSanitizedActivityLog({
            id: `log_${Date.now()}`,
            actorId: actor.uid,
            actorName: actor.fullName,
            actionType: status === 'published' ? 'CONTENT_PUBLICATION' : 'CONTENT_EDIT',
            details: `Updated announcement "${title}" (${status})`,
            targetId: prev.id,
            createdAt: now,
          })
        );
      } else {
        const newAnn: Announcement = {
          id: `ann_${Date.now()}`,
          title,
          content,
          category,
          status,
          priority,
          showOnHomepage,
          attachmentUrl,
          attachmentName,
          authorId: actor.uid,
          authorName: actor.fullName,
          createdAt: now,
          updatedAt: now,
        };
        state.announcements.unshift(newAnn);
        if (status === 'published') {
          const notif: PortalNotification = {
            id: `notif_${Date.now()}`,
            recipientId: 'ALL_STUDENTS',
            title: 'New Official Announcement Published',
            message: title,
            type: 'announcement',
            read: false,
            readByUids: [],
            relatedId: newAnn.id,
            createdAt: now,
            updatedAt: now,
          };
          state.notifications.unshift(notif);
        }
        state.activityLogs.unshift(
          createSanitizedActivityLog({
            id: `log_${Date.now()}`,
            actorId: actor.uid,
            actorName: actor.fullName,
            actionType: status === 'published' ? 'CONTENT_PUBLICATION' : 'CONTENT_EDIT',
            details: `Created announcement "${title}" (${status})`,
            targetId: newAnn.id,
            createdAt: now,
          })
        );
      }
      saveServerStore(store);
      return NextResponse.json({ ok: true, state });
    }

    if (action === 'DELETE_ANNOUNCEMENT') {
      const id = String(body.id || body.announcementId || '');
      const target = state.announcements.find((a) => a.id === id);
      if (!target) {
        return NextResponse.json({ ok: false, error: 'Announcement not found.' }, { status: 404 });
      }
      state.announcements = state.announcements.filter((a) => a.id !== id);
      state.notifications = state.notifications.filter((n) => n.relatedId !== id);
      state.activityLogs.unshift(
        createSanitizedActivityLog({
          id: `log_${Date.now()}`,
          actorId: actor.uid,
          actorName: actor.fullName,
          actionType: 'CONTENT_DELETION',
          details: `Deleted announcement "${target.title}"`,
          targetId: id,
          createdAt: now,
        })
      );
      saveServerStore(store);
      return NextResponse.json({ ok: true, state });
    }

    if (action === 'SAVE_NOTICE') {
      const id = String(body.id || '');
      const title = sanitizeText(String(body.title || ''), 180);
      const content = sanitizeText(String(body.content || ''), 3000);
      const referenceCode = sanitizeText(
        String(body.referenceCode || `CIR-AN/2026/${Math.floor(100 + Math.random() * 899)}`),
        50
      );
      const category = body.category ? sanitizeText(String(body.category), 60) : undefined;
      const effectiveDate = sanitizeText(String(body.effectiveDate || 'Immediate Effect'), 40);
      const status = body.status === 'draft' ? 'draft' : 'published';
      const showOnHomepage = body.showOnHomepage !== undefined ? Boolean(body.showOnHomepage) : true;
      const attachmentUrl = body.attachmentUrl
        ? sanitizeMediaUrl(body.attachmentUrl, '')
        : undefined;
      const attachmentName = body.attachmentName
        ? sanitizeText(String(body.attachmentName), 180)
        : undefined;

      if (title.length < 3 || content.length < 5) {
        return NextResponse.json(
          { ok: false, error: 'Notice title and content are required.' },
          { status: 400 }
        );
      }

      const existingIdx = state.notices.findIndex((n) => n.id === id);
      if (existingIdx >= 0) {
        const prev = state.notices[existingIdx];
        state.notices[existingIdx] = {
          ...prev,
          title,
          content,
          referenceCode,
          category: category ?? prev.category,
          effectiveDate,
          status,
          showOnHomepage,
          attachmentUrl: attachmentUrl !== undefined ? attachmentUrl : prev.attachmentUrl,
          attachmentName: attachmentName !== undefined ? attachmentName : prev.attachmentName,
          updatedAt: now,
        };
        state.activityLogs.unshift(
          createSanitizedActivityLog({
            id: `log_${Date.now()}`,
            actorId: actor.uid,
            actorName: actor.fullName,
            actionType: status === 'published' ? 'CONTENT_PUBLICATION' : 'CONTENT_EDIT',
            details: `Updated official notice ${referenceCode}: "${title}" (${status})`,
            targetId: prev.id,
            createdAt: now,
          })
        );
      } else {
        const newNotice: Notice = {
          id: `not_${Date.now()}`,
          title,
          content,
          referenceCode,
          category,
          effectiveDate,
          status,
          showOnHomepage,
          attachmentUrl,
          attachmentName,
          authorId: actor.uid,
          createdAt: now,
          updatedAt: now,
        };
        state.notices.unshift(newNotice);
        if (status === 'published') {
          state.notifications.unshift({
            id: `notif_${Date.now()}`,
            recipientId: 'ALL_STUDENTS',
            title: `Official Notice ${referenceCode}`,
            message: title,
            type: 'notice',
            read: false,
            readByUids: [],
            relatedId: newNotice.id,
            createdAt: now,
            updatedAt: now,
          });
        }
        state.activityLogs.unshift(
          createSanitizedActivityLog({
            id: `log_${Date.now()}`,
            actorId: actor.uid,
            actorName: actor.fullName,
            actionType: status === 'published' ? 'CONTENT_PUBLICATION' : 'CONTENT_EDIT',
            details: `Issued notice ${referenceCode}: "${title}" (${status})`,
            targetId: newNotice.id,
            createdAt: now,
          })
        );
      }
      saveServerStore(store);
      return NextResponse.json({ ok: true, state });
    }

    if (action === 'DELETE_NOTICE') {
      const id = String(body.id || body.noticeId || '');
      const target = state.notices.find((n) => n.id === id);
      if (!target) {
        return NextResponse.json({ ok: false, error: 'Notice not found.' }, { status: 404 });
      }
      state.notices = state.notices.filter((n) => n.id !== id);
      state.notifications = state.notifications.filter((n) => n.relatedId !== id);
      state.activityLogs.unshift(
        createSanitizedActivityLog({
          id: `log_${Date.now()}`,
          actorId: actor.uid,
          actorName: actor.fullName,
          actionType: 'CONTENT_DELETION',
          details: `Deleted notice "${target.title}"`,
          targetId: id,
          createdAt: now,
        })
      );
      saveServerStore(store);
      return NextResponse.json({ ok: true, state });
    }

    if (action === 'SAVE_GALLERY') {
      const id = String(body.id || '');
      const title = sanitizeText(String(body.title || ''), 150);
      const caption = sanitizeText(String(body.caption || ''), 1000);
      const imageUrl = sanitizeMediaUrl(
        body.imageUrl,
        '/images/union_hall_symposium.jpg'
      );
      const category = sanitizeText(String(body.category || 'Academic Archive'), 60);
      const status = body.status === 'draft' ? 'draft' : 'published';
      const destination: MediaDestination = body.destination === 'user' ? 'user' : 'public';
      const showOnHomepage = destination === 'public';

      if (title.length < 2 || caption.length < 2) {
        return NextResponse.json(
          { ok: false, error: 'Gallery title and caption are required.' },
          { status: 400 }
        );
      }

      const existingIdx = state.gallery.findIndex((g) => g.id === id);
      if (existingIdx >= 0) {
        const prev = state.gallery[existingIdx];
        state.gallery[existingIdx] = {
          ...prev,
          title,
          caption,
          imageUrl,
          category,
          status,
          destination,
          showOnHomepage,
          updatedAt: now,
        };
      } else {
        const newItem: GalleryItem = {
          id: `gal_${Date.now()}`,
          title,
          caption,
          imageUrl,
          category,
          status,
          destination,
          showOnHomepage,
          authorId: actor.uid,
          createdAt: now,
          updatedAt: now,
        };
        state.gallery.unshift(newItem);
      }
      state.activityLogs.unshift(
        createSanitizedActivityLog({
          id: `log_${Date.now()}`,
          actorId: actor.uid,
          actorName: actor.fullName,
          actionType: status === 'published' ? 'CONTENT_PUBLICATION' : 'CONTENT_EDIT',
          details: `Saved gallery archive entry "${title}" (${status})`,
          targetId: id || `gal_${Date.now()}`,
          createdAt: now,
        })
      );
      saveServerStore(store);
      return NextResponse.json({ ok: true, state });
    }

    if (action === 'DELETE_GALLERY') {
      const id = String(body.id || body.galleryId || '');
      const target = state.gallery.find((g) => g.id === id);
      if (!target) {
        return NextResponse.json({ ok: false, error: 'Gallery item not found.' }, { status: 404 });
      }
      state.gallery = state.gallery.filter((g) => g.id !== id);
      state.activityLogs.unshift(
        createSanitizedActivityLog({
          id: `log_${Date.now()}`,
          actorId: actor.uid,
          actorName: actor.fullName,
          actionType: 'CONTENT_DELETION',
          details: `Removed gallery photograph "${target.title}"`,
          targetId: id,
          createdAt: now,
        })
      );
      saveServerStore(store);
      return NextResponse.json({ ok: true, state });
    }

    if (action === 'UPDATE_SETTINGS') {
      state.settings = {
        unionName: sanitizeText(String(body.unionName || state.settings.unionName), 120),
        academicSession: sanitizeText(
          String(body.academicSession || state.settings.academicSession),
          60
        ),
        motto: sanitizeText(String(body.motto || state.settings.motto), 200),
        missionStatement: sanitizeText(
          String(body.missionStatement || state.settings.missionStatement),
          2500
        ),
        facultyAdvisor: sanitizeText(
          String(body.facultyAdvisor || state.settings.facultyAdvisor),
          120
        ),
        unionPresident: sanitizeText(
          String(body.unionPresident || state.settings.unionPresident),
          120
        ),
        generalSecretary: sanitizeText(
          String(body.generalSecretary || state.settings.generalSecretary),
          120
        ),
        officeLocation: sanitizeText(
          String(body.officeLocation || state.settings.officeLocation),
          160
        ),
        officeEmail: sanitizeText(String(body.officeEmail || state.settings.officeEmail), 120),
        bannerImageUrl: body.bannerImageUrl
          ? sanitizeMediaUrl(body.bannerImageUrl, state.settings.bannerImageUrl)
          : state.settings.bannerImageUrl,
        updatedBy: actor.uid,
        updatedAt: now,
      };
      state.activityLogs.unshift(
        createSanitizedActivityLog({
          id: `log_${Date.now()}`,
          actorId: actor.uid,
          actorName: actor.fullName,
          actionType: 'CONTENT_EDIT',
          details: `Updated AL-NIBRAS Class Union charter and institutional settings`,
          targetId: 'union_settings',
          createdAt: now,
        })
      );
      saveServerStore(store);
      return NextResponse.json({ ok: true, state });
    }
  }

  // 10. MESSAGING ACTIONS (Students & Admin)
  if (action === 'SEND_MESSAGE') {
    const subject = sanitizeText(String(body.subject || ''), 160);
    const messageBody = sanitizeText(String(body.body || ''), 3000);
    const recipientId = sanitizeText(String(body.recipientId || 'admin_super'), 128);
    const attachmentUrl = body.attachmentUrl
      ? sanitizeMediaUrl(body.attachmentUrl, '') || undefined
      : undefined;
    const attachmentName = body.attachmentName
      ? sanitizeText(String(body.attachmentName), 180)
      : undefined;

    if (subject.length < 2 || messageBody.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'Message subject and body are required.' },
        { status: 400 }
      );
    }

    const msg: DirectMessage = {
      id: `msg_${Date.now()}`,
      senderId: actor.uid,
      senderName: actor.fullName,
      recipientId,
      subject,
      body: messageBody,
      status: 'unread',
      attachmentUrl,
      attachmentName,
      createdAt: now,
      updatedAt: now,
    };
    state.messages.unshift(msg);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  if (action === 'REPLY_MESSAGE') {
    if (actor.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: Only SUPER ADMIN can reply to portal inquiries.' },
        { status: 403 }
      );
    }
    const messageId = String(body.messageId || '');
    const replyText = sanitizeText(String(body.replyText || ''), 2000);
    const targetMsg = state.messages.find((m) => m.id === messageId);
    if (!targetMsg || replyText.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'Valid message and reply text are required.' },
        { status: 400 }
      );
    }
    targetMsg.status = 'replied';
    targetMsg.replyText = replyText;
    targetMsg.updatedAt = now;
    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  if (action === 'DELETE_MESSAGE') {
    const messageId = String(body.messageId || body.id || '');
    const targetMsg = state.messages.find((m) => m.id === messageId);
    if (!targetMsg) {
      return NextResponse.json({ ok: false, error: 'Message not found.' }, { status: 404 });
    }
    if (actor.role !== 'admin' && targetMsg.senderId !== actor.uid) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: You can only delete your own messages.' },
        { status: 403 }
      );
    }
    state.messages = state.messages.filter((m) => m.id !== messageId);
    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_DELETION',
        details: `Deleted message inquiry "${targetMsg.subject}"`,
        targetId: messageId,
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  // 11. NOTIFICATIONS & ACTIVITY LOGS (Mark read / Delete)
  if (action === 'MARK_NOTIFICATION_READ') {
    const notifId = String(body.notificationId || '');
    const notif = state.notifications.find((n) => n.id === notifId);
    if (notif) {
      const canMark =
        actor.role === 'admin' ||
        notif.recipientId === actor.uid ||
        notif.recipientId === 'ALL_USERS' ||
        (actor.role === 'student' && notif.recipientId === 'ALL_STUDENTS') ||
        (actor.role === 'teacher' && notif.recipientId === 'ALL_STAFF');

      if (!canMark) {
        return NextResponse.json(
          { ok: false, error: 'Forbidden: You cannot modify another user notification.' },
          { status: 403 }
        );
      }
      const readBy = new Set(notif.readByUids || []);
      readBy.add(actor.uid);
      notif.readByUids = Array.from(readBy);
      notif.updatedAt = now;
      saveServerStore(store);
    }
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  if (action === 'MARK_ALL_NOTIFICATIONS_READ') {
    for (const notif of state.notifications) {
      const isRecipient =
        actor.role === 'admin' ||
        notif.recipientId === actor.uid ||
        notif.recipientId === 'ALL_USERS' ||
        (actor.role === 'student' && notif.recipientId === 'ALL_STUDENTS') ||
        (actor.role === 'teacher' && notif.recipientId === 'ALL_STAFF');
      if (isRecipient) {
        const readBy = new Set(notif.readByUids || []);
        readBy.add(actor.uid);
        notif.readByUids = Array.from(readBy);
        notif.updatedAt = now;
      }
    }
    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  if (action === 'DELETE_NOTIFICATION') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete notifications.' }, { status: 403 });
    }
    const notifId = String(body.notificationId || body.id || '');
    const target = state.notifications.find((n) => n.id === notifId);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Notification not found.' }, { status: 404 });
    }
    state.notifications = state.notifications.filter((n) => n.id !== notifId);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_ACTIVITY_LOG') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete activity logs.' }, { status: 403 });
    }
    const logId = String(body.logId || body.id || '');
    const target = state.activityLogs.find((l) => l.id === logId);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Activity log entry not found.' }, { status: 404 });
    }
    state.activityLogs = state.activityLogs.filter((l) => l.id !== logId);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 12. STUDENT ACCOUNT MANAGEMENT
  if (action === 'DELETE_ACCOUNT') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete accounts.' }, { status: 403 });
    }
    const targetUid = String(body.targetUid || body.uid || body.id || '');
    if (targetUid === 'admin_super' || targetUid === actor.uid) {
      return NextResponse.json({ ok: false, error: 'Cannot delete main SUPER ADMIN account.' }, { status: 400 });
    }

    const idx = state.users.findIndex((u) => u.uid === targetUid);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: 'Account not found.' }, { status: 404 });
    }

    const deletedUser = state.users[idx];
    if (deletedUser.username.toLowerCase() === 'alnibras@admin') {
      return NextResponse.json({ ok: false, error: 'Cannot delete main SUPER ADMIN account.' }, { status: 400 });
    }

    // Track deleted UID so seed loader never re-adds it
    if (!Array.isArray(store.deletedUserUids)) {
      store.deletedUserUids = [];
    }
    if (!store.deletedUserUids.includes(targetUid)) {
      store.deletedUserUids.push(targetUid);
    }

    // Remove user profile, sessions & credentials
    state.users.splice(idx, 1);
    delete store.credentials[targetUid];
    if (store.scryptCredentials) {
      delete store.scryptCredentials[targetUid];
    }
    revokeAllUserSessions(store, targetUid, 'ACCOUNT_DELETED');

    // Clean up associated records safely without affecting other users
    if (state.fines) {
      state.fines = state.fines.filter((f) => f.studentUid !== targetUid);
    }
    if (state.studentResults) {
      state.studentResults = state.studentResults.filter((sr) => sr.studentUid !== targetUid);
    }
    if (state.certificates) {
      state.certificates = state.certificates.filter((c) => c.studentUid !== targetUid);
    }
    if (state.pointTransactions) {
      state.pointTransactions = state.pointTransactions.filter((pt) => pt.studentUid !== targetUid);
    }
    if (state.programResults) {
      for (const prog of state.programResults) {
        if (Array.isArray(prog.participants)) {
          prog.participants = prog.participants.filter((p) => p.studentUid !== targetUid);
        }
      }
    }
    if (state.messages) {
      state.messages = state.messages.filter(
        (m) => m.senderId !== targetUid && m.recipientId !== targetUid
      );
    }
    if (state.chatMessages) {
      state.chatMessages = state.chatMessages.filter(
        (m) => m.conversationId !== targetUid && m.senderId !== targetUid && m.recipientId !== targetUid
      );
    }
    if (state.notifications) {
      state.notifications = state.notifications.filter((n) => n.recipientId !== targetUid);
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'ACCOUNT_DELETED',
        details: `Deleted ${deletedUser.role} account and cleaned up associated records: ${deletedUser.fullName} (@${deletedUser.username})`,
        targetId: targetUid,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 13. PASSWORD RESET MANAGEMENT
  if (action === 'INITIATE_PASSWORD_RESET') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can initiate administrative password resets.' }, { status: 403 });
    }
    const targetUid = String(body.targetUid || '');
    const newPassword = String(body.newPassword || '');
    const notes = sanitizeText(String(body.notes || 'Administrative reset initiated'), 300);

    const targetUser = state.users.find((u) => u.uid === targetUid);
    if (!targetUser) {
      return NextResponse.json({ ok: false, error: 'Target account not found.' }, { status: 404 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    if (!store.scryptCredentials) store.scryptCredentials = {};
    store.scryptCredentials[targetUid] = await hashPasswordScryptV2(newPassword);
    if (targetUid !== 'admin_super') {
      store.credentials[targetUid] = hashPasswordSync(newPassword);
    }
    revokeAllUserSessions(store, targetUid, 'ADMIN_PASSWORD_RESET');

    const resetLog: PasswordResetLog = {
      id: `pwd_rst_${Date.now()}`,
      targetUid,
      targetName: targetUser.fullName,
      targetRole: targetUser.role,
      targetUsername: targetUser.username,
      initiatedByUid: actor.uid,
      initiatedByName: actor.fullName,
      status: 'completed',
      initiatedAt: now,
      completedAt: now,
      notes,
    };
    if (!state.passwordResetLogs) state.passwordResetLogs = [];
    state.passwordResetLogs.unshift(resetLog);

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'PASSWORD_RESET_INITIATED',
        details: `Administrative password reset executed for @${targetUser.username}`,
        targetId: targetUid,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 14. FINE MANAGEMENT
  if (action === 'CREATE_FINE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can issue fines.' }, { status: 403 });
    }
    const targetStudentUids = Array.isArray(body.targetStudentUids) ? (body.targetStudentUids as string[]) : [];
    const title = sanitizeText(String(body.title || ''), 150);
    const description = sanitizeText(String(body.description || ''), 1000);
    const amount = Number(body.amount) || 25;
    const category = sanitizeText(String(body.category || 'Library'), 80);
    const issueDate = String(body.issueDate || getIndiaDateISO());
    const dueDate = String(body.dueDate || getIndiaDateISO());
    const documentUrl = sanitizeMediaUrl(body.documentUrl, '');
    const documentName = sanitizeText(String(body.documentName || ''), 150);

    if (!title) {
      return NextResponse.json({ ok: false, error: 'Fine title is required.' }, { status: 400 });
    }
    if (targetStudentUids.length === 0) {
      return NextResponse.json({ ok: false, error: 'No student recipients selected.' }, { status: 400 });
    }

    if (!state.fines) state.fines = [];

    for (const uid of targetStudentUids) {
      const student = state.users.find((u) => u.uid === uid);
      if (student) {
        const fineRecord: FineRecord = {
          id: `fine_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          studentUid: student.uid,
          studentName: student.fullName,
          studentRoll: student.rollNumber,
          studentDepartment: student.department,
          title,
          description,
          amount,
          category,
          status: 'unpaid',
          issueDate,
          dueDate,
          documentUrl: documentUrl || undefined,
          documentName: documentName || undefined,
          createdBy: actor.uid,
          createdAt: now,
          updatedAt: now,
        };
        state.fines.unshift(fineRecord);

        state.notifications.unshift({
          id: `notif_${Date.now()}_${student.uid}`,
          recipientId: student.uid,
          title: `Fine Notice Issued: ${title}`,
          message: `Amount: ${formatINR(amount)}. Due date: ${dueDate}. Please review notice in My Fines.`,
          type: 'fine',
          read: false,
          readByUids: [],
          relatedId: fineRecord.id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'FINE_ISSUED',
        details: `Issued fine "${title}" (${formatINR(amount)}) to ${targetStudentUids.length} student(s)`,
        targetId: targetStudentUids[0] || 'fines',
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'UPDATE_FINE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can edit fines.' }, { status: 403 });
    }
    const fineId = String(body.fineId || body.id || '');
    if (!state.fines) state.fines = [];
    const fine = state.fines.find((f) => f.id === fineId);
    if (!fine) {
      return NextResponse.json({ ok: false, error: 'Fine not found.' }, { status: 404 });
    }

    if (body.title) fine.title = sanitizeText(String(body.title), 150);
    if (body.description) fine.description = sanitizeText(String(body.description), 1000);
    if (body.amount !== undefined) fine.amount = Number(body.amount);
    if (body.category) fine.category = sanitizeText(String(body.category), 80);
    if (body.issueDate) fine.issueDate = String(body.issueDate);
    if (body.dueDate) fine.dueDate = String(body.dueDate);
    if (body.status) fine.status = body.status as FineRecord['status'];
    if (body.documentUrl !== undefined) fine.documentUrl = sanitizeMediaUrl(body.documentUrl, '');
    if (body.documentName !== undefined) fine.documentName = sanitizeText(String(body.documentName), 150);
    fine.updatedAt = now;

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'FINE_STATUS_UPDATED',
        details: `Updated fine "${fine.title}" for ${fine.studentName}`,
        targetId: fineId,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_FINE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete fines.' }, { status: 403 });
    }
    const fineId = String(body.fineId || body.id || '');
    if (!state.fines) state.fines = [];
    const idx = state.fines.findIndex((f) => f.id === fineId);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: 'Fine record not found.' }, { status: 404 });
    }
    const deletedFine = state.fines[idx];
    state.fines.splice(idx, 1);
    state.notifications = state.notifications.filter((n) => n.relatedId !== fineId);
    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'FINE_DELETED',
        details: `Deleted fine "${deletedFine.title}" for ${deletedFine.studentName}`,
        targetId: fineId,
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'UPDATE_FINE_STATUS') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can change fine settlement status.' }, { status: 403 });
    }
    const fineId = String(body.fineId || body.id || '');
    const newStatus = String(body.status || 'unpaid');
    if (!state.fines) state.fines = [];
    const fine = state.fines.find((f) => f.id === fineId);
    if (!fine) {
      return NextResponse.json({ ok: false, error: 'Fine not found.' }, { status: 404 });
    }

    fine.status = newStatus as FineRecord['status'];
    if (newStatus === 'paid') {
      fine.paidAt = now;
    } else {
      fine.paidAt = undefined;
    }
    fine.updatedAt = now;

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'FINE_STATUS_UPDATED',
        details: `Updated fine status to ${newStatus.toUpperCase()} for ${fine.studentName}`,
        targetId: fineId,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 15. CHAT MESSAGES (Telegram-Style Chat — Enforces student/teacher -> admin_super recipient restriction)
  if (action === 'SEND_CHAT_MESSAGE') {
    const requestedRecipientId = String(
      body.recipientId || (actor.role === 'admin' ? '' : 'admin_super')
    );
    if (actor.role !== 'admin' && requestedRecipientId !== 'admin_super') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Forbidden: Members can only send live chat messages to Union Administration (admin_super).',
        },
        { status: 403 }
      );
    }
    const recipientId = actor.role === 'admin' ? requestedRecipientId : 'admin_super';
    const text = sanitizeText(String(body.text || ''), 2000);
    const attachmentUrl = sanitizeMediaUrl(body.attachmentUrl, '');
    const attachmentName = sanitizeText(String(body.attachmentName || ''), 150);
    const attachmentType = sanitizeText(String(body.attachmentType || ''), 60);
    const replyToId = body.replyToId ? sanitizeText(String(body.replyToId), 80) : undefined;
    const replyToSenderName = body.replyToSenderName ? sanitizeText(String(body.replyToSenderName), 120) : undefined;
    const replyToText = body.replyToText ? sanitizeText(String(body.replyToText), 300) : undefined;
    const forwardedFromName = body.forwardedFromName ? sanitizeText(String(body.forwardedFromName), 120) : undefined;

    if (!text && !attachmentUrl) {
      return NextResponse.json({ ok: false, error: 'Cannot send empty message.' }, { status: 400 });
    }

    const conversationId = actor.role === 'admin' ? recipientId : actor.uid;

    if (!state.chatMessages) state.chatMessages = [];

    const newMsg: ChatMessage = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      conversationId,
      senderId: actor.uid,
      senderName: actor.fullName,
      senderRole: actor.role,
      recipientId,
      text,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentName || undefined,
      attachmentType: attachmentType || undefined,
      replyToId,
      replyToSenderName,
      replyToText,
      forwardedFromName,
      read: false,
      delivered: true,
      createdAt: now,
    };

    state.chatMessages.push(newMsg);

    // Notify recipient
    state.notifications.unshift({
      id: `notif_${Date.now()}`,
      recipientId,
      title: `New Message from ${actor.fullName}`,
      message: text.slice(0, 80) || 'Sent an attachment',
      type: 'chat',
      read: false,
      readByUids: [],
      relatedId: newMsg.id,
      createdAt: now,
      updatedAt: now,
    });

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'LIVE_MESSAGE_SENT',
        details: `Sent live message to ${recipientId}`,
        targetId: conversationId,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor), message: newMsg });
  }

  if (action === 'MARK_CHAT_READ') {
    const conversationId = String(body.conversationId || '');
    if (state.chatMessages) {
      for (const m of state.chatMessages) {
        if (m.conversationId === conversationId && m.recipientId === actor.uid) {
          m.read = true;
        }
      }
      saveServerStore(store);
    }
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  if (action === 'DELETE_CHAT_MESSAGE') {
    const chatMessageId = String(body.chatMessageId || body.id || '');
    if (!state.chatMessages) state.chatMessages = [];
    const targetMsg = state.chatMessages.find((m) => m.id === chatMessageId);
    if (!targetMsg) {
      return NextResponse.json({ ok: false, error: 'Chat message not found.' }, { status: 404 });
    }
    if (actor.role !== 'admin' && targetMsg.senderId !== actor.uid) {
      return NextResponse.json({ ok: false, error: 'Forbidden: Cannot delete this message.' }, { status: 403 });
    }
    state.chatMessages = state.chatMessages.filter((m) => m.id !== chatMessageId);
    state.notifications = state.notifications.filter((n) => n.relatedId !== chatMessageId);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  // 16. PROGRAM RESULTS, AUTOMATIC POINT CALCULATION & CERTIFICATE GENERATION
  if (action === 'SAVE_PROGRAM_RESULT') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can publish program results.' }, { status: 403 });
    }
    const programName = sanitizeText(String(body.programName || ''), 150);
    const description = sanitizeText(String(body.description || ''), 2000);
    const programDate = String(body.programDate || getIndiaDateISO());
    const publicationDate = String(body.publicationDate || getIndiaDateISO());
    const category = sanitizeText(String(body.category || 'Debate'), 80);
    const status = body.status === 'draft' ? 'draft' : 'published';
    const certificateUrl = sanitizeMediaUrl(body.certificateUrl, '');
    const certificateName = sanitizeText(String(body.certificateName || ''), 150);
    const documentUrl = sanitizeMediaUrl(body.documentUrl, '');
    const documentName = sanitizeText(String(body.documentName || ''), 150);
    const imageUrl = sanitizeMediaUrl(body.imageUrl, '');
    const certificateTitle = body.certificateTitle
      ? sanitizeText(String(body.certificateTitle), 120)
      : undefined;
    const certificateSubtitle = body.certificateSubtitle
      ? sanitizeText(String(body.certificateSubtitle), 160)
      : undefined;
    const rawParticipants = Array.isArray(body.participants)
      ? (body.participants as Partial<ProgramParticipant>[])
      : [];

    if (!programName) {
      return NextResponse.json({ ok: false, error: 'Program name is required.' }, { status: 400 });
    }

    if (!state.programResults) state.programResults = [];
    if (!state.studentResults) state.studentResults = [];
    if (!state.pointTransactions) state.pointTransactions = [];
    if (!state.certificates) state.certificates = [];

    const id = body.id ? String(body.id) : `prog_${Date.now()}`;
    const existingIdx = state.programResults.findIndex((p) => p.id === id);

    // Check for duplicate student entries in the same program
    const seenStudentUids = new Set<string>();
    for (const p of rawParticipants) {
      const uid = p.studentUid ? String(p.studentUid).trim() : '';
      if (uid) {
        if (seenStudentUids.has(uid)) {
          return NextResponse.json(
            {
              ok: false,
              error: 'Duplicate student entry detected. Each student can only be added once per program.',
            },
            { status: 400 }
          );
        }
        seenStudentUids.add(uid);
      }
    }

    // Current balances before mutation
    const currentSummaries = recomputeStudentPointSummaries(state.users, state.studentResults, now);
    const balanceMap = new Map<string, number>();
    for (const s of currentSummaries) {
      balanceMap.set(s.studentUid, s.totalPoints);
    }

    // Existing student results for this program
    const existingProgramStudentResults = state.studentResults.filter((sr) => sr.programId === id);

    // Handle students who were removed from this program during edit
    for (const prevSr of existingProgramStudentResults) {
      if (!seenStudentUids.has(prevSr.studentUid)) {
        const prevEffective = prevSr.status === 'published' ? prevSr.totalPoints : 0;
        const oldBal = balanceMap.get(prevSr.studentUid) ?? 0;
        const newBal = Math.max(0, oldBal - prevEffective);
        balanceMap.set(prevSr.studentUid, newBal);

        if (prevEffective > 0) {
          const tx: PointTransaction = {
            id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            studentUid: prevSr.studentUid,
            studentId: prevSr.studentId,
            studentName: prevSr.studentName,
            programId: id,
            programName,
            resultId: prevSr.id,
            deltaPoints: -prevEffective,
            previousBalance: oldBal,
            newBalance: newBal,
            reason: 'RESULT_DELETED',
            position: prevSr.position,
            grade: prevSr.grade,
            createdBy: actor.uid,
            createdAt: now,
          };
          state.pointTransactions.unshift(tx);
        }

        state.studentResults = state.studentResults.filter((r) => r.id !== prevSr.id);
        state.certificates = state.certificates.filter((c) => c.resultId !== prevSr.id);
      }
    }

    // Process incoming participants
    const normalizedParticipants: ProgramParticipant[] = [];
    const certSettings = state.certificateSettings || {
      title: 'CERTIFICATE OF ACHIEVEMENT',
      subtitle: 'OFFICIAL HONORS & SCHOLASTIC MERIT CONFERMENT',
      authorizedByName: 'SUPER ADMIN',
      authorizedByDesignation: 'Director General · AL-NIBRAS Class Union',
      unionName: 'AL-NIBRAS CLASS UNION',
      footerNote: '',
      showQrCode: true,
      updatedAt: now,
    };

    for (let i = 0; i < rawParticipants.length; i++) {
      const p = rawParticipants[i];
      // Resolve student from users if possible
      const matchedStudent = state.users.find(
        (u) =>
          u.role === 'student' &&
          ((p.studentUid && u.uid === p.studentUid) ||
            (p.studentId && u.studentId.toLowerCase() === String(p.studentId).toLowerCase()) ||
            (p.name && u.fullName.toLowerCase() === String(p.name).trim().toLowerCase()))
      );

      const calc = calculateResultPoints(p.position, p.grade);
      const studentUid = matchedStudent?.uid || (p.studentUid ? String(p.studentUid) : '');
      const studentId = matchedStudent?.studentId || (p.studentId ? String(p.studentId) : 'AN-STUDENT');
      const studentName = sanitizeText(
        matchedStudent?.fullName || String(p.name || 'Student Scholar'),
        120
      );
      const studentAvatar =
        matchedStudent?.avatarUrl || p.studentAvatar || '/images/avatar_admin_portrait.jpg';
      const studentDepartment =
        matchedStudent?.department || p.studentDepartment || 'Classical Arabic & Rhetoric';
      const remarks = p.remarks ? sanitizeText(String(p.remarks), 400) : undefined;

      const existingSr = studentUid
        ? state.studentResults.find((sr) => sr.programId === id && sr.studentUid === studentUid)
        : undefined;

      const resultId = existingSr?.id || (p.id && String(p.id).startsWith('sr_') ? String(p.id) : `sr_${Date.now()}_${i}`);
      const certificateId =
        existingSr?.certificateId ||
        p.certificateId ||
        `cert_${Date.now()}_${i}`;

      if (studentUid) {
        const oldEffectivePoints =
          existingSr && existingSr.status === 'published' ? existingSr.totalPoints : 0;
        const newEffectivePoints = status === 'published' ? calc.totalPoints : 0;
        const deltaPoints = newEffectivePoints - oldEffectivePoints;

        const prevBal = balanceMap.get(studentUid) ?? 0;
        const nextBal = Math.max(0, prevBal + deltaPoints);
        balanceMap.set(studentUid, nextBal);

        const srRecord: StudentResultRecord = {
          id: resultId,
          programId: id,
          programName,
          programCategory: category,
          programDate,
          publicationDate,
          studentUid,
          studentId,
          studentName,
          studentAvatar,
          studentDepartment,
          position: calc.position,
          grade: calc.grade,
          positionPoints: calc.positionPoints,
          gradePoints: calc.gradePoints,
          totalPoints: calc.totalPoints,
          remarks,
          status,
          certificateId,
          createdBy: actor.uid,
          createdAt: existingSr?.createdAt || now,
          updatedAt: now,
        };

        const srIdx = state.studentResults.findIndex((r) => r.id === resultId);
        if (srIdx >= 0) {
          state.studentResults[srIdx] = srRecord;
        } else {
          state.studentResults.unshift(srRecord);
        }

        // Upsert CertificateRecord
        const existingCertIdx = state.certificates.findIndex(
          (c) => c.id === certificateId || c.resultId === resultId
        );
        const certNumber =
          existingCertIdx >= 0
            ? state.certificates[existingCertIdx].certificateNumber
            : `ALN-CERT-2026-${String(state.certificates.length + 1 + i).padStart(4, '0')}`;

        const certRecord: CertificateRecord = {
          id: certificateId,
          certificateNumber: certNumber,
          resultId,
          programId: id,
          programName,
          programCategory: category,
          programDate,
          publicationDate,
          studentUid,
          studentId,
          studentName,
          studentDepartment,
          position: calc.position,
          grade: calc.grade,
          positionPoints: calc.positionPoints,
          gradePoints: calc.gradePoints,
          totalPoints: calc.totalPoints,
          authorizedByName: certSettings.authorizedByName || 'SUPER ADMIN',
          authorizedByDesignation:
            certSettings.authorizedByDesignation || 'Director General · AL-NIBRAS Class Union',
          unionName: certSettings.unionName || state.settings.unionName || 'AL-NIBRAS Class Union',
          qrVerificationCode: `https://alnibras-union.edu/verify/${certNumber}`,
          status: status === 'published' ? 'active' : 'revoked',
          createdAt: existingCertIdx >= 0 ? state.certificates[existingCertIdx].createdAt : now,
          updatedAt: now,
        };

        if (existingCertIdx >= 0) {
          state.certificates[existingCertIdx] = certRecord;
        } else {
          state.certificates.unshift(certRecord);
        }

        // Record PointTransaction if published or points changed
        if (deltaPoints !== 0 || (!existingSr && status === 'published')) {
          const tx: PointTransaction = {
            id: `pt_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 5)}`,
            studentUid,
            studentId,
            studentName,
            programId: id,
            programName,
            resultId,
            deltaPoints,
            previousBalance: prevBal,
            newBalance: nextBal,
            reason: existingSr ? 'RESULT_EDITED' : 'RESULT_PUBLISHED',
            position: calc.position,
            grade: calc.grade,
            createdBy: actor.uid,
            createdAt: now,
          };
          state.pointTransactions.unshift(tx);
        }

        // Notify student on newly published result or point update
        const wasPublished = existingSr && existingSr.status === 'published';
        if (status === 'published' && (!wasPublished || deltaPoints !== 0)) {
          state.notifications.unshift({
            id: `notif_${Date.now()}_${studentUid}_${i}`,
            recipientId: studentUid,
            title: wasPublished
              ? `Result Updated: ${programName}`
              : `Official Result & Certificate Published: ${programName}`,
            message: `${studentName}: Position: ${calc.position} (${calc.positionPoints} pts) · Grade: ${calc.grade} (${calc.gradePoints} pts) · Total Earned: ${calc.totalPoints} Points. Your certificate (${certNumber}) is ready for download.`,
            type: 'result',
            read: false,
            readByUids: [],
            relatedId: resultId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const posLabel = calc.position !== 'None' ? calc.position : 'Participant';
      const gradeLabel = calc.grade !== 'None' ? `${calc.grade} Grade` : 'No Grade';
      normalizedParticipants.push({
        id: resultId,
        studentUid: studentUid || undefined,
        studentId,
        studentAvatar,
        studentDepartment,
        name: studentName,
        position: calc.position,
        grade: calc.grade,
        positionPoints: calc.positionPoints,
        gradePoints: calc.gradePoints,
        totalPoints: calc.totalPoints,
        remarks,
        score: `${calc.totalPoints} Points (${posLabel} + ${gradeLabel})`,
        isWinner: calc.position === '1st Place',
        certificateId,
      });
    }

    const computedWinnerSummary =
      body.winnerSummary && String(body.winnerSummary).trim().length > 0
        ? sanitizeText(String(body.winnerSummary), 250)
        : normalizedParticipants
            .slice(0, 3)
            .map((p) => `${p.position !== 'None' ? p.position : 'Merit'} (${p.grade || 'None'}): ${p.name}`)
            .join(' · ') || 'Official Program Results Published';

    const resultRecord: ProgramResult = {
      id,
      programName,
      description,
      programDate,
      publicationDate,
      category,
      status,
      participants: normalizedParticipants,
      winnerSummary: computedWinnerSummary,
      certificateUrl: certificateUrl || undefined,
      certificateName: certificateName || undefined,
      documentUrl: documentUrl || undefined,
      documentName: documentName || undefined,
      imageUrl: imageUrl || undefined,
      certificateTitle,
      certificateSubtitle,
      authorId: actor.uid,
      createdAt: existingIdx >= 0 ? state.programResults[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      state.programResults[existingIdx] = resultRecord;
    } else {
      state.programResults.unshift(resultRecord);
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'PROGRAM_RESULT_SAVED',
        details: `${existingIdx >= 0 ? 'Updated' : 'Published'} program result "${programName}" with ${normalizedParticipants.length} student result(s) and certificates`,
        targetId: id,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_PROGRAM_RESULT') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete program results.' }, { status: 403 });
    }
    const programResultId = String(body.programResultId || body.id || '');
    if (!state.programResults) state.programResults = [];
    const idx = state.programResults.findIndex((p) => p.id === programResultId);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: 'Program result not found.' }, { status: 404 });
    }

    const deletedProgram = state.programResults[idx];
    const currentSummaries = recomputeStudentPointSummaries(state.users, state.studentResults || [], now);
    const balanceMap = new Map<string, number>();
    for (const s of currentSummaries) {
      balanceMap.set(s.studentUid, s.totalPoints);
    }

    const affectedResults = (state.studentResults || []).filter(
      (sr) => sr.programId === programResultId
    );
    for (const sr of affectedResults) {
      const effectivePoints = sr.status === 'published' ? sr.totalPoints : 0;
      const oldBal = balanceMap.get(sr.studentUid) ?? 0;
      const newBal = Math.max(0, oldBal - effectivePoints);
      balanceMap.set(sr.studentUid, newBal);

      if (effectivePoints > 0) {
        state.pointTransactions.unshift({
          id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          studentUid: sr.studentUid,
          studentId: sr.studentId,
          studentName: sr.studentName,
          programId: programResultId,
          programName: deletedProgram.programName,
          resultId: sr.id,
          deltaPoints: -effectivePoints,
          previousBalance: oldBal,
          newBalance: newBal,
          reason: 'RESULT_DELETED',
          position: sr.position,
          grade: sr.grade,
          createdBy: actor.uid,
          createdAt: now,
        });
      }
    }

    state.programResults.splice(idx, 1);
    state.studentResults = (state.studentResults || []).filter(
      (sr) => sr.programId !== programResultId
    );
    state.certificates = (state.certificates || []).filter(
      (c) => c.programId !== programResultId
    );

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'PROGRAM_RESULT_DELETED',
        details: `Deleted program result "${deletedProgram.programName}" and deducted points/certificates for ${affectedResults.length} student(s)`,
        targetId: programResultId,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_STUDENT_RESULT') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete student results.' }, { status: 403 });
    }
    const resultId = String(body.resultId || body.id || '');
    const sr = (state.studentResults || []).find((r) => r.id === resultId);
    if (!sr) {
      return NextResponse.json({ ok: false, error: 'Student result record not found.' }, { status: 404 });
    }

    const currentSummaries = recomputeStudentPointSummaries(state.users, state.studentResults || [], now);
    const oldBal = currentSummaries.find((s) => s.studentUid === sr.studentUid)?.totalPoints ?? 0;
    const effectivePoints = sr.status === 'published' ? sr.totalPoints : 0;
    const newBal = Math.max(0, oldBal - effectivePoints);

    if (effectivePoints > 0) {
      state.pointTransactions.unshift({
        id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        studentUid: sr.studentUid,
        studentId: sr.studentId,
        studentName: sr.studentName,
        programId: sr.programId,
        programName: sr.programName,
        resultId: sr.id,
        deltaPoints: -effectivePoints,
        previousBalance: oldBal,
        newBalance: newBal,
        reason: 'RESULT_DELETED',
        position: sr.position,
        grade: sr.grade,
        createdBy: actor.uid,
        createdAt: now,
      });
    }

    state.studentResults = state.studentResults.filter((r) => r.id !== resultId);
    state.certificates = (state.certificates || []).filter((c) => c.resultId !== resultId);

    const parentProg = state.programResults.find((p) => p.id === sr.programId);
    if (parentProg && Array.isArray(parentProg.participants)) {
      parentProg.participants = parentProg.participants.filter(
        (p) => p.id !== resultId && p.studentUid !== sr.studentUid
      );
      parentProg.updatedAt = now;
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'STUDENT_RESULT_DELETED',
        details: `Deleted result for ${sr.studentName} in "${sr.programName}" (-${effectivePoints} pts)`,
        targetId: resultId,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'UPDATE_CERTIFICATE_SETTINGS') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can update certificate settings.' }, { status: 403 });
    }
    state.certificateSettings = {
      title: sanitizeText(String(body.title || state.certificateSettings?.title || 'CERTIFICATE OF ACHIEVEMENT'), 120),
      subtitle: sanitizeText(String(body.subtitle || state.certificateSettings?.subtitle || 'OFFICIAL HONORS & SCHOLASTIC MERIT CONFERMENT'), 160),
      authorizedByName: sanitizeText(String(body.authorizedByName || state.certificateSettings?.authorizedByName || 'SUPER ADMIN'), 100),
      authorizedByDesignation: sanitizeText(String(body.authorizedByDesignation || state.certificateSettings?.authorizedByDesignation || 'Director General · AL-NIBRAS Class Union'), 140),
      unionName: sanitizeText(String(body.unionName || state.certificateSettings?.unionName || 'AL-NIBRAS CLASS UNION'), 120),
      footerNote: sanitizeText(String(body.footerNote || state.certificateSettings?.footerNote || ''), 400),
      showQrCode: body.showQrCode !== undefined ? Boolean(body.showQrCode) : true,
      updatedAt: now,
    };
    for (const cert of state.certificates || []) {
      cert.authorizedByName = state.certificateSettings.authorizedByName;
      cert.authorizedByDesignation = state.certificateSettings.authorizedByDesignation;
      cert.unionName = state.certificateSettings.unionName;
    }
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 17. CALENDAR EVENTS
  if (action === 'SAVE_CALENDAR_EVENT') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can schedule calendar events.' }, { status: 403 });
    }
    const title = sanitizeText(String(body.title || ''), 150);
    const description = sanitizeText(String(body.description || ''), 2000);
    const category = sanitizeText(String(body.category || 'Academic'), 80);
    const startDate = String(body.startDate || getIndiaDateISO());
    const endDate = String(body.endDate || startDate);
    const startTime = String(body.startTime || '09:00');
    const endTime = String(body.endTime || '11:00');
    const location = sanitizeText(String(body.location || 'Union Campus'), 150);
    const isAllDay = Boolean(body.isAllDay);
    const visibility = body.visibility === 'private' ? 'private' : 'public';
    const reminder = sanitizeText(String(body.reminder || ''), 60);
    const imageUrl = sanitizeMediaUrl(body.imageUrl, '');
    const attachmentUrl = sanitizeMediaUrl(body.attachmentUrl, '');
    const attachmentName = sanitizeText(String(body.attachmentName || ''), 150);

    if (!title) {
      return NextResponse.json({ ok: false, error: 'Event title is required.' }, { status: 400 });
    }

    if (!state.calendarEvents) state.calendarEvents = [];

    const id = body.id ? String(body.id) : `cal_${Date.now()}`;
    const existingIdx = state.calendarEvents.findIndex((e) => e.id === id);

    const eventRecord: CalendarEvent = {
      id,
      title,
      description,
      category,
      startDate,
      endDate,
      startTime: isAllDay ? undefined : startTime,
      endTime: isAllDay ? undefined : endTime,
      location,
      isAllDay,
      visibility,
      reminder: reminder || undefined,
      imageUrl: imageUrl || undefined,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentName || undefined,
      authorId: actor.uid,
      createdAt: existingIdx >= 0 ? state.calendarEvents[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      state.calendarEvents[existingIdx] = eventRecord;
    } else {
      state.calendarEvents.unshift(eventRecord);
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CALENDAR_EVENT_SAVED',
        details: `Scheduled calendar event "${title}" (${startDate})`,
        targetId: id,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_CALENDAR_EVENT') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can remove calendar events.' }, { status: 403 });
    }
    const calendarEventId = String(body.calendarEventId || body.id || '');
    if (!state.calendarEvents) state.calendarEvents = [];
    const idx = state.calendarEvents.findIndex((e) => e.id === calendarEventId);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: 'Calendar event not found.' }, { status: 404 });
    }
    const deletedEvt = state.calendarEvents[idx];
    state.calendarEvents.splice(idx, 1);
    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CALENDAR_EVENT_DELETED',
        details: `Deleted calendar event "${deletedEvt.title}"`,
        targetId: calendarEventId,
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 18. CUSTOM TYPES
  if (action === 'ADD_CUSTOM_TYPE') {
    if (actor.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Forbidden: Only SUPER ADMIN can add custom types.' },
        { status: 403 }
      );
    }
    const moduleName = sanitizeText(String(body.module || 'announcements'), 50);
    const name = sanitizeText(String(body.name || ''), 60);

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Custom type name is required.' }, { status: 400 });
    }
    if (!state.customTypes) state.customTypes = [];
    const exists = state.customTypes.some(
      (ct) => ct.module === moduleName && ct.name.toLowerCase() === name.toLowerCase()
    );
    if (!exists) {
      state.customTypes.push({
        id: `ct_${Date.now()}`,
        module: moduleName,
        name,
        createdBy: actor.uid,
        createdAt: now,
      });
      saveServerStore(store);
    }
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  if (action === 'DELETE_CUSTOM_TYPE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete custom types.' }, { status: 403 });
    }
    const customTypeId = String(body.customTypeId || body.id || '');
    if (!state.customTypes) state.customTypes = [];
    const idx = state.customTypes.findIndex((ct) => ct.id === customTypeId);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: 'Custom type not found.' }, { status: 404 });
    }
    const removed = state.customTypes[idx];
    state.customTypes.splice(idx, 1);
    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_DELETION',
        details: `Deleted custom category "${removed.name}" (${removed.module})`,
        targetId: customTypeId,
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 19. OFFICIAL BRANDING & LOGO MANAGEMENT
  if (action === 'SAVE_BRANDING') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can manage official branding.' }, { status: 403 });
    }
    const prev = state.branding || {
      logoUrl: '/assets/aistudio/al-nibras_logo_3b0dfbfe.png',
      unionTitle: 'AL-NIBRAS CLASS UNION',
      tagline: 'Enlightening Minds, Empowering the Future · 11th Batch of DHBC',
      navbarHeightPx: 44,
      sidebarHeightPx: 40,
      certificateLogoHeightPx: 72,
      receiptLogoHeightPx: 56,
      showInNavbar: true,
      showInSidebars: true,
      showInLogin: true,
      showInCertificates: true,
      showInReceipts: true,
      showInFooter: true,
      updatedBy: actor.uid,
      updatedAt: now,
    };

    const incoming = ((body.branding && typeof body.branding === 'object' ? body.branding : body) ||
      {}) as Partial<BrandingConfig>;

    const nextBranding: BrandingConfig = {
      logoUrl: incoming.logoUrl ? sanitizeMediaUrl(incoming.logoUrl, prev.logoUrl) : prev.logoUrl,
      unionTitle: incoming.unionTitle ? sanitizeText(String(incoming.unionTitle), 120) : prev.unionTitle,
      tagline: incoming.tagline ? sanitizeText(String(incoming.tagline), 200) : prev.tagline,
      navbarHeightPx: Number(incoming.navbarHeightPx) || prev.navbarHeightPx || 44,
      sidebarHeightPx: Number(incoming.sidebarHeightPx) || prev.sidebarHeightPx || 40,
      certificateLogoHeightPx:
        Number(incoming.certificateLogoHeightPx) || prev.certificateLogoHeightPx || 72,
      receiptLogoHeightPx: Number(incoming.receiptLogoHeightPx) || prev.receiptLogoHeightPx || 56,
      showInNavbar:
        incoming.showInNavbar !== undefined ? Boolean(incoming.showInNavbar) : prev.showInNavbar,
      showInSidebars:
        incoming.showInSidebars !== undefined ? Boolean(incoming.showInSidebars) : prev.showInSidebars,
      showInLogin:
        incoming.showInLogin !== undefined ? Boolean(incoming.showInLogin) : prev.showInLogin,
      showInCertificates:
        incoming.showInCertificates !== undefined
          ? Boolean(incoming.showInCertificates)
          : prev.showInCertificates,
      showInReceipts:
        incoming.showInReceipts !== undefined ? Boolean(incoming.showInReceipts) : prev.showInReceipts,
      showInFooter:
        incoming.showInFooter !== undefined ? Boolean(incoming.showInFooter) : prev.showInFooter,
      updatedBy: actor.uid,
      updatedAt: now,
    };

    state.branding = nextBranding;
    if (state.homepageConfig && incoming.logoUrl) {
      state.homepageConfig.logoUrl = nextBranding.logoUrl;
    }

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_EDIT',
        details: `Updated Official AL-NIBRAS Branding & Logo settings`,
        targetId: 'branding',
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 20. PUBLIC HOMEPAGE MANAGEMENT
  if (action === 'SAVE_HOMEPAGE_CONFIG') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can manage homepage settings.' }, { status: 403 });
    }
    const prev = state.homepageConfig || ({
      socialLinks: {},
      footerCopyright: '© 2026 AL-NIBRAS Class Union Directorate. All Rights Reserved.',
      sections: [],
      updatedBy: actor.uid,
      updatedAt: now,
    } as PublicHomepageConfig);
    const incoming = (body.config || body) as Partial<PublicHomepageConfig>;
    state.homepageConfig = {
      ...prev,
      logoUrl: incoming.logoUrl ? sanitizeMediaUrl(incoming.logoUrl, prev.logoUrl || '') : prev.logoUrl,
      unionName: incoming.unionName ? sanitizeText(String(incoming.unionName), 120) : prev.unionName,
      unionSubtitle: incoming.unionSubtitle ? sanitizeText(String(incoming.unionSubtitle), 160) : prev.unionSubtitle,
      heroBadgeText: incoming.heroBadgeText ? sanitizeText(String(incoming.heroBadgeText), 140) : prev.heroBadgeText,
      heroHeading: incoming.heroHeading ? sanitizeText(String(incoming.heroHeading), 240) : prev.heroHeading,
      heroSubheading: incoming.heroSubheading ? sanitizeText(String(incoming.heroSubheading), 800) : prev.heroSubheading,
      heroBannerImageUrl: incoming.heroBannerImageUrl ? sanitizeMediaUrl(incoming.heroBannerImageUrl, prev.heroBannerImageUrl || '') : prev.heroBannerImageUrl,
      heroBackgroundUrl: incoming.heroBackgroundUrl ? sanitizeMediaUrl(incoming.heroBackgroundUrl, prev.heroBackgroundUrl || '') : prev.heroBackgroundUrl,
      primaryCtaText: incoming.primaryCtaText ? sanitizeText(String(incoming.primaryCtaText), 80) : prev.primaryCtaText,
      secondaryCtaText: incoming.secondaryCtaText ? sanitizeText(String(incoming.secondaryCtaText), 80) : prev.secondaryCtaText,
      welcomeHeading: incoming.welcomeHeading ? sanitizeText(String(incoming.welcomeHeading), 200) : prev.welcomeHeading,
      welcomeDescription: incoming.welcomeDescription ? sanitizeText(String(incoming.welcomeDescription), 1500) : prev.welcomeDescription,
      aboutHeading: incoming.aboutHeading ? sanitizeText(String(incoming.aboutHeading), 200) : prev.aboutHeading,
      aboutMission: incoming.aboutMission ? sanitizeText(String(incoming.aboutMission), 2000) : prev.aboutMission,
      aboutVision: incoming.aboutVision ? sanitizeText(String(incoming.aboutVision), 2000) : prev.aboutVision,
      contactHeading: incoming.contactHeading ? sanitizeText(String(incoming.contactHeading), 160) : prev.contactHeading,
      contactEmail: incoming.contactEmail ? sanitizeText(String(incoming.contactEmail), 120) : prev.contactEmail,
      contactPhone: incoming.contactPhone ? sanitizeText(String(incoming.contactPhone), 60) : prev.contactPhone,
      contactAddress: incoming.contactAddress ? sanitizeText(String(incoming.contactAddress), 300) : prev.contactAddress,
      officeHours: incoming.officeHours ? sanitizeText(String(incoming.officeHours), 140) : prev.officeHours,
      socialLinks: incoming.socialLinks
        ? {
            facebook: sanitizeText(String(incoming.socialLinks.facebook || ''), 300),
            instagram: sanitizeText(String(incoming.socialLinks.instagram || ''), 300),
            youtube: sanitizeText(String(incoming.socialLinks.youtube || ''), 300),
            whatsapp: sanitizeText(String(incoming.socialLinks.whatsapp || ''), 300),
          }
        : prev.socialLinks,
      footerDescription: incoming.footerDescription ? sanitizeText(String(incoming.footerDescription), 600) : prev.footerDescription,
      footerCopyright: incoming.footerCopyright ? sanitizeText(String(incoming.footerCopyright), 200) : prev.footerCopyright,
      navItems: Array.isArray(incoming.navItems) ? incoming.navItems : prev.navItems,
      sections: Array.isArray(incoming.sections) ? incoming.sections : prev.sections,
      updatedBy: actor.uid,
      updatedAt: now,
    };

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_EDIT',
        details: `Updated Public Homepage configuration and section layout`,
        targetId: 'homepage_config',
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 21. VIDEO GALLERY MODULE REMOVED
  if (action === 'SAVE_VIDEO' || action === 'DELETE_VIDEO') {
    return NextResponse.json(
      { ok: false, error: 'Video Gallery module has been removed from this portal.' },
      { status: 410 }
    );
  }

  // 22. COMPLETE UNION FINANCIAL MANAGEMENT SYSTEM (INR ₹)
  if (action === 'SAVE_INCOME') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can record union income.' }, { status: 403 });
    }
    if (!state.income) state.income = [];
    if (!state.financialReceipts) state.financialReceipts = [];
    if (!state.financialAuditLogs) state.financialAuditLogs = [];

    const id = String(body.id || '');
    const title = sanitizeText(String(body.title || ''), 160);
    const category = sanitizeText(String(body.category || 'Union Membership Fee'), 80);
    const amount = Math.max(0, Number(body.amount) || 0);
    const date = String(body.date || getIndiaDateISO());
    const receivedFrom = sanitizeText(String(body.receivedFrom || ''), 140);
    const studentUid = body.studentUid ? String(body.studentUid) : undefined;
    const matchedStudent = studentUid ? state.users.find((u) => u.uid === studentUid) : undefined;
    const paymentMethod = (body.paymentMethod || 'UPI') as PaymentMethodType;
    const referenceNumber = sanitizeText(String(body.referenceNumber || `REF-${Date.now().toString().slice(-6)}`), 80);
    const description = sanitizeText(String(body.description || ''), 1000);
    const attachmentUrl = body.attachmentUrl ? sanitizeMediaUrl(body.attachmentUrl, '') || undefined : undefined;
    const attachmentName = body.attachmentName ? sanitizeText(String(body.attachmentName), 150) : undefined;

    if (!title || amount <= 0 || !receivedFrom) {
      return NextResponse.json({ ok: false, error: 'Income title, positive INR amount, and payer name are required.' }, { status: 400 });
    }

    const existingIdx = state.income.findIndex((inc) => inc.id === id);
    const receiptNumber =
      existingIdx >= 0 && state.income[existingIdx].receiptNumber
        ? state.income[existingIdx].receiptNumber!
        : `ALN-RCP-2026-${String(state.financialReceipts.length + 1).padStart(4, '0')}`;

    const recordId = existingIdx >= 0 ? id : `inc_${Date.now()}`;
    const incomeRecord: IncomeRecord = {
      id: recordId,
      receiptNumber,
      title,
      category,
      amount,
      date,
      receivedFrom,
      studentUid: matchedStudent?.uid || studentUid,
      studentId: matchedStudent?.studentId,
      studentName: matchedStudent?.fullName,
      paymentMethod,
      referenceNumber,
      description,
      attachmentUrl,
      attachmentName,
      verified: true,
      createdBy: actor.uid,
      createdAt: existingIdx >= 0 ? state.income[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      state.income[existingIdx] = incomeRecord;
    } else {
      state.income.unshift(incomeRecord);
    }

    // Upsert official receipt
    const rcpIdx = state.financialReceipts.findIndex((r) => r.sourceRecordId === recordId);
    const receiptObj: FinancialReceiptRecord = {
      id: rcpIdx >= 0 ? state.financialReceipts[rcpIdx].id : `rcp_${Date.now()}`,
      receiptNumber,
      type: 'income',
      sourceRecordId: recordId,
      studentUid: matchedStudent?.uid,
      studentId: matchedStudent?.studentId,
      studentName: matchedStudent?.fullName,
      payerOrPayeeName: receivedFrom,
      title,
      category,
      amount,
      date,
      paymentMethod,
      referenceNumber,
      remarks: description,
      authorizedBy: actor.fullName,
      createdAt: rcpIdx >= 0 ? state.financialReceipts[rcpIdx].createdAt : now,
    };
    if (rcpIdx >= 0) {
      state.financialReceipts[rcpIdx] = receiptObj;
    } else {
      state.financialReceipts.unshift(receiptObj);
    }

    state.financialAuditLogs.unshift({
      id: `fa_${Date.now()}`,
      action: existingIdx >= 0 ? 'INCOME_UPDATED' : 'INCOME_RECORDED',
      details: `${existingIdx >= 0 ? 'Updated' : 'Recorded'} ${formatINR(amount)} income "${title}" from ${receivedFrom} (${receiptNumber})`,
      amount,
      actorId: actor.uid,
      actorName: actor.fullName,
      targetId: recordId,
      createdAt: now,
    });

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_PUBLICATION',
        details: `Recorded union income ${formatINR(amount)}: "${title}" (${receiptNumber})`,
        targetId: recordId,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state, receipt: receiptObj });
  }

  if (action === 'DELETE_INCOME') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete income records.' }, { status: 403 });
    }
    const id = String(body.incomeId || body.id || '');
    if (!state.income) state.income = [];
    const target = state.income.find((inc) => inc.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Income record not found.' }, { status: 404 });
    }
    state.income = state.income.filter((inc) => inc.id !== id);
    if (target.sourceContributionId && state.studentContributions) {
      state.studentContributions = state.studentContributions.filter((c) => c.id !== target.sourceContributionId);
    }
    state.financialReceipts = (state.financialReceipts || []).filter((r) => r.sourceRecordId !== id);
    state.financialAuditLogs = state.financialAuditLogs || [];
    state.financialAuditLogs.unshift({
      id: `fa_${Date.now()}`,
      action: 'INCOME_DELETED',
      details: `Deleted income record "${target.title}" (${formatINR(target.amount)})`,
      amount: target.amount,
      actorId: actor.uid,
      actorName: actor.fullName,
      targetId: id,
      createdAt: now,
    });
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'SAVE_EXPENSE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can record union expenses.' }, { status: 403 });
    }
    if (!state.expenses) state.expenses = [];
    if (!state.financialAuditLogs) state.financialAuditLogs = [];

    const id = String(body.id || '');
    const title = sanitizeText(String(body.title || ''), 160);
    const category = sanitizeText(String(body.category || 'Program Expense'), 80);
    const amount = Math.max(0, Number(body.amount) || 0);
    const date = String(body.date || getIndiaDateISO());
    const paidTo = sanitizeText(String(body.paidTo || ''), 140);
    const paymentMethod = (body.paymentMethod || 'UPI') as PaymentMethodType;
    const referenceNumber = sanitizeText(String(body.referenceNumber || `EXP-${Date.now().toString().slice(-6)}`), 80);
    const approvedBy = sanitizeText(String(body.approvedBy || actor.fullName), 120);
    const description = sanitizeText(String(body.description || ''), 1000);
    const billUrl = body.billUrl ? sanitizeMediaUrl(body.billUrl, '') || undefined : undefined;
    const billName = body.billName ? sanitizeText(String(body.billName), 150) : undefined;

    if (!title || amount <= 0 || !paidTo) {
      return NextResponse.json({ ok: false, error: 'Expense title, positive INR amount, and vendor/recipient name are required.' }, { status: 400 });
    }

    const existingIdx = state.expenses.findIndex((e) => e.id === id);
    const voucherNumber =
      existingIdx >= 0
        ? state.expenses[existingIdx].voucherNumber
        : `ALN-EXP-2026-${String(state.expenses.length + 1).padStart(4, '0')}`;
    const recordId = existingIdx >= 0 ? id : `exp_${Date.now()}`;

    const expenseRecord: ExpenseRecord = {
      id: recordId,
      voucherNumber,
      title,
      category,
      amount,
      date,
      paidTo,
      paymentMethod,
      referenceNumber,
      approvedBy,
      description,
      billUrl,
      billName,
      verified: true,
      createdBy: actor.uid,
      createdAt: existingIdx >= 0 ? state.expenses[existingIdx].createdAt : now,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      state.expenses[existingIdx] = expenseRecord;
    } else {
      state.expenses.unshift(expenseRecord);
    }

    state.financialAuditLogs.unshift({
      id: `fa_${Date.now()}`,
      action: existingIdx >= 0 ? 'EXPENSE_UPDATED' : 'EXPENSE_RECORDED',
      details: `${existingIdx >= 0 ? 'Updated' : 'Recorded'} ${formatINR(amount)} expense "${title}" paid to ${paidTo} (${voucherNumber})`,
      amount,
      actorId: actor.uid,
      actorName: actor.fullName,
      targetId: recordId,
      createdAt: now,
    });

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_PUBLICATION',
        details: `Recorded union expense ${formatINR(amount)}: "${title}" (${voucherNumber})`,
        targetId: recordId,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_EXPENSE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete expense records.' }, { status: 403 });
    }
    const id = String(body.expenseId || body.id || '');
    if (!state.expenses) state.expenses = [];
    const target = state.expenses.find((e) => e.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Expense record not found.' }, { status: 404 });
    }
    state.expenses = state.expenses.filter((e) => e.id !== id);
    state.financialAuditLogs = state.financialAuditLogs || [];
    state.financialAuditLogs.unshift({
      id: `fa_${Date.now()}`,
      action: 'EXPENSE_DELETED',
      details: `Deleted expense record "${target.title}" (${formatINR(target.amount)})`,
      amount: target.amount,
      actorId: actor.uid,
      actorName: actor.fullName,
      targetId: id,
      createdAt: now,
    });
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'SAVE_STUDENT_CONTRIBUTION') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can record student contributions.' }, { status: 403 });
    }
    if (!state.studentContributions) state.studentContributions = [];
    if (!state.income) state.income = [];
    if (!state.financialReceipts) state.financialReceipts = [];
    if (!state.financialAuditLogs) state.financialAuditLogs = [];

    const studentUid = String(body.studentUid || '');
    const student = state.users.find((u) => u.uid === studentUid);
    if (!student) {
      return NextResponse.json({ ok: false, error: 'Please select a valid student.' }, { status: 400 });
    }

    const purpose = sanitizeText(String(body.purpose || ''), 160);
    const category = sanitizeText(String(body.category || 'Union Membership Fee'), 80);
    const amount = Math.max(0, Number(body.amount) || 0);
    const date = String(body.date || getIndiaDateISO());
    const paymentMethod = (body.paymentMethod || 'UPI') as PaymentMethodType;
    const referenceNumber = sanitizeText(String(body.referenceNumber || `CNT-${Date.now().toString().slice(-6)}`), 80);
    const remarks = sanitizeText(String(body.remarks || ''), 500);

    if (!purpose || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'Contribution purpose and positive INR amount are required.' }, { status: 400 });
    }

    const contribId = `contrib_${Date.now()}`;
    const incomeId = `inc_${Date.now()}`;
    const receiptNumber = `ALN-RCP-2026-${String(state.financialReceipts.length + 1).padStart(4, '0')}`;

    const contrib: StudentContributionRecord = {
      id: contribId,
      receiptNumber,
      studentUid: student.uid,
      studentId: student.studentId,
      studentName: student.fullName,
      studentClass: student.classInfo || student.department || '11th Batch of DHBC',
      purpose,
      category,
      amount,
      date,
      paymentMethod,
      paymentStatus: 'paid',
      referenceNumber,
      remarks,
      linkedIncomeId: incomeId,
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    const linkedIncome: IncomeRecord = {
      id: incomeId,
      receiptNumber,
      title: `${purpose} — ${student.fullName}`,
      category: 'Student Contribution',
      amount,
      date,
      receivedFrom: `${student.fullName} (${student.studentId})`,
      studentUid: student.uid,
      studentId: student.studentId,
      studentName: student.fullName,
      paymentMethod,
      referenceNumber,
      description: remarks || purpose,
      sourceContributionId: contribId,
      verified: true,
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    };

    const receipt: FinancialReceiptRecord = {
      id: `rcp_${Date.now()}`,
      receiptNumber,
      type: 'contribution',
      sourceRecordId: contribId,
      studentUid: student.uid,
      studentId: student.studentId,
      studentName: student.fullName,
      payerOrPayeeName: student.fullName,
      title: purpose,
      category,
      amount,
      date,
      paymentMethod,
      referenceNumber,
      remarks,
      authorizedBy: actor.fullName,
      createdAt: now,
    };

    state.studentContributions.unshift(contrib);
    state.income.unshift(linkedIncome);
    state.financialReceipts.unshift(receipt);

    state.notifications.unshift({
      id: `notif_${Date.now()}_${student.uid}`,
      recipientId: student.uid,
      title: `Contribution Receipt Issued: ${receiptNumber}`,
      message: `Received ${formatINR(amount)} for "${purpose}". Official receipt is available in your Financial Statement.`,
      type: 'announcement',
      read: false,
      readByUids: [],
      relatedId: contribId,
      createdAt: now,
      updatedAt: now,
    });

    state.financialAuditLogs.unshift({
      id: `fa_${Date.now()}`,
      action: 'CONTRIBUTION_RECORDED',
      details: `Recorded ${formatINR(amount)} contribution from ${student.fullName} for "${purpose}" (${receiptNumber})`,
      amount,
      actorId: actor.uid,
      actorName: actor.fullName,
      targetId: contribId,
      createdAt: now,
    });

    saveServerStore(store);
    return NextResponse.json({ ok: true, state, receipt });
  }

  if (action === 'DELETE_STUDENT_CONTRIBUTION') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete student contributions.' }, { status: 403 });
    }
    const id = String(body.contributionId || body.id || '');
    if (!state.studentContributions) state.studentContributions = [];
    const target = state.studentContributions.find((c) => c.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Contribution record not found.' }, { status: 404 });
    }
    state.studentContributions = state.studentContributions.filter((c) => c.id !== id);
    state.income = (state.income || []).filter(
      (inc) => inc.id !== target.linkedIncomeId && inc.sourceContributionId !== id
    );
    state.financialReceipts = (state.financialReceipts || []).filter((r) => r.sourceRecordId !== id);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'SAVE_STUDENT_DUE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can assign student dues.' }, { status: 403 });
    }
    if (!state.studentDues) state.studentDues = [];
    if (!state.financialAuditLogs) state.financialAuditLogs = [];

    const targetStudentUids = Array.isArray(body.targetStudentUids)
      ? (body.targetStudentUids as string[])
      : body.studentUid
      ? [String(body.studentUid)]
      : [];
    const dueTitle = sanitizeText(String(body.dueTitle || ''), 160);
    const dueCategory = sanitizeText(String(body.dueCategory || 'Monthly Union Fee'), 80);
    const totalAmount = Math.max(0, Number(body.totalAmount) || 0);
    const dueDate = String(body.dueDate || getIndiaDateISO());
    const remarks = sanitizeText(String(body.remarks || ''), 500);

    if (!dueTitle || totalAmount <= 0 || targetStudentUids.length === 0) {
      return NextResponse.json({ ok: false, error: 'Due title, positive INR amount, and at least one student are required.' }, { status: 400 });
    }

    for (const uid of targetStudentUids) {
      const student = state.users.find((u) => u.uid === uid);
      if (!student) continue;
      const dueId = `due_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const newDue: StudentDueRecord = {
        id: dueId,
        studentUid: student.uid,
        studentId: student.studentId,
        studentName: student.fullName,
        studentClass: student.classInfo || student.department || '11th Batch of DHBC',
        dueTitle,
        dueCategory,
        totalAmount,
        paidAmount: 0,
        remainingAmount: totalAmount,
        dueDate,
        status: 'pending',
        remarks,
        payments: [],
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      };
      state.studentDues.unshift(newDue);

      state.notifications.unshift({
        id: `notif_${Date.now()}_${student.uid}`,
        recipientId: student.uid,
        title: `Union Due Assigned: ${dueTitle}`,
        message: `Amount: ${formatINR(totalAmount)} · Due by ${dueDate}. View details in your Financial Statement.`,
        type: 'fine',
        read: false,
        readByUids: [],
        relatedId: dueId,
        createdAt: now,
        updatedAt: now,
      });
    }

    state.financialAuditLogs.unshift({
      id: `fa_${Date.now()}`,
      action: 'DUE_ASSIGNED',
      details: `Assigned due "${dueTitle}" (${formatINR(totalAmount)}) to ${targetStudentUids.length} student(s)`,
      amount: totalAmount,
      actorId: actor.uid,
      actorName: actor.fullName,
      targetId: 'student_dues',
      createdAt: now,
    });

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'RECORD_DUE_PAYMENT') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can record due payments.' }, { status: 403 });
    }
    const dueId = String(body.dueId || '');
    if (!state.studentDues) state.studentDues = [];
    if (!state.income) state.income = [];
    if (!state.financialReceipts) state.financialReceipts = [];
    if (!state.financialAuditLogs) state.financialAuditLogs = [];

    const due = state.studentDues.find((d) => d.id === dueId);
    if (!due) {
      return NextResponse.json({ ok: false, error: 'Student due record not found.' }, { status: 404 });
    }

    const currentRemaining = due.remainingAmount ?? due.remainingDue ?? Math.max(0, due.totalAmount - (due.paidAmount ?? due.amountPaid ?? 0));
    const currentPaid = due.paidAmount ?? due.amountPaid ?? 0;
    const payAmount = Math.max(0, Number(body.amount) || 0);
    if (payAmount <= 0 || payAmount > currentRemaining) {
      return NextResponse.json(
        { ok: false, error: `Payment amount must be between ₹1 and ${formatINR(currentRemaining)}.` },
        { status: 400 }
      );
    }

    const date = String(body.date || getIndiaDateISO());
    const paymentMethod = (body.paymentMethod || 'UPI') as PaymentMethodType;
    const referenceNumber = sanitizeText(String(body.referenceNumber || `DUE-${Date.now().toString().slice(-6)}`), 80);
    const remarks = sanitizeText(String(body.remarks || ''), 400);
    const receiptNumber = `ALN-RCP-2026-${String(state.financialReceipts.length + 1).padStart(4, '0')}`;
    const dueTitleText = due.dueTitle || due.feeTitle || due.title || 'Union Due';
    const dueCatText = due.dueCategory || due.category || 'Monthly Union Fee';

    due.paidAmount = Math.min(due.totalAmount, currentPaid + payAmount);
    due.remainingAmount = Math.max(0, due.totalAmount - due.paidAmount);
    due.status = due.remainingAmount === 0 ? 'paid' : 'partial';
    due.updatedAt = now;
    due.payments.unshift({
      id: `dp_${Date.now()}`,
      amount: payAmount,
      date,
      paymentMethod,
      receiptNumber,
      referenceNumber,
      remarks,
      recordedBy: actor.uid,
      createdAt: now,
    });

    const incomeId = `inc_${Date.now()}`;
    state.income.unshift({
      id: incomeId,
      receiptNumber,
      title: `Due Payment: ${dueTitleText} — ${due.studentName}`,
      category: 'Student Due Payment',
      amount: payAmount,
      date,
      receivedFrom: `${due.studentName} (${due.studentId})`,
      studentUid: due.studentUid,
      studentId: due.studentId,
      studentName: due.studentName,
      paymentMethod,
      referenceNumber,
      description: remarks || `Settlement towards ${dueTitleText}`,
      sourceDueId: due.id,
      verified: true,
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    });

    const receipt: FinancialReceiptRecord = {
      id: `rcp_${Date.now()}`,
      receiptNumber,
      type: 'due_payment',
      sourceRecordId: due.id,
      studentUid: due.studentUid,
      studentId: due.studentId,
      studentName: due.studentName,
      payerOrPayeeName: due.studentName,
      title: `${due.remainingAmount === 0 ? 'Full' : 'Partial'} Due Payment: ${dueTitleText}`,
      category: dueCatText,
      amount: payAmount,
      date,
      paymentMethod,
      referenceNumber,
      remarks: `Paid: ${formatINR(due.paidAmount)} / ${formatINR(due.totalAmount)} · Remaining: ${formatINR(due.remainingAmount)}`,
      authorizedBy: actor.fullName,
      createdAt: now,
    };
    state.financialReceipts.unshift(receipt);

    state.financialAuditLogs.unshift({
      id: `fa_${Date.now()}`,
      action: 'DUE_PAYMENT_RECORDED',
      details: `Recorded ${formatINR(payAmount)} payment from ${due.studentName} towards "${due.dueTitle}" (${receiptNumber})`,
      amount: payAmount,
      actorId: actor.uid,
      actorName: actor.fullName,
      targetId: due.id,
      createdAt: now,
    });

    saveServerStore(store);
    return NextResponse.json({ ok: true, state, receipt });
  }

  if (action === 'DELETE_STUDENT_DUE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete student dues.' }, { status: 403 });
    }
    const id = String(body.dueId || body.id || '');
    if (!state.studentDues) state.studentDues = [];
    const target = state.studentDues.find((d) => d.id === id);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Student due record not found.' }, { status: 404 });
    }
    state.studentDues = state.studentDues.filter((d) => d.id !== id);
    state.income = (state.income || []).filter((inc) => inc.sourceDueId !== id);
    state.financialReceipts = (state.financialReceipts || []).filter((r) => r.sourceRecordId !== id);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 23. HOME SLIDESHOW MANAGEMENT (Part 4)
  if (action === 'SAVE_SLIDESHOW_SLIDE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can manage homepage slideshow.' }, { status: 403 });
    }
    if (!state.slideshow) state.slideshow = [];
    const id = String(body.id || '');
    const title = sanitizeText(String(body.title || 'Welcome to Al-Nibras'), 180);
    const subtitle = sanitizeText(
      String(body.subtitle || 'Connecting Students, Building Community, Creating Opportunities.'),
      300
    );
    const imageUrl = sanitizeMediaUrl(body.imageUrl, '/images/hero_campus_library.jpg');
    const ctaText = body.ctaText ? sanitizeText(String(body.ctaText), 60) : undefined;
    const rawLink = body.ctaHref ?? body.ctaLink;
    const ctaHref = rawLink ? sanitizeText(String(rawLink), 120) : undefined;
    const visible =
      body.visible !== undefined
        ? Boolean(body.visible)
        : body.enabled !== undefined
        ? Boolean(body.enabled)
        : true;

    const existingIdx = state.slideshow.findIndex((s) => s.id === id);
    if (existingIdx >= 0) {
      const prev = state.slideshow[existingIdx];
      state.slideshow[existingIdx] = {
        ...prev,
        title,
        subtitle,
        imageUrl,
        ctaText,
        ctaHref,
        ctaLink: ctaHref,
        visible,
        enabled: visible,
        order: body.order !== undefined ? Number(body.order) : prev.order,
        updatedAt: now,
      };
    } else {
      const newSlide: SlideshowSlide = {
        id: `slide_${Date.now()}`,
        title,
        subtitle,
        imageUrl,
        ctaText,
        ctaHref,
        ctaLink: ctaHref,
        order: state.slideshow.length + 1,
        visible,
        enabled: visible,
        createdAt: now,
        updatedAt: now,
      };
      state.slideshow.push(newSlide);
    }
    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_EDIT',
        details: `${existingIdx >= 0 ? 'Updated' : 'Added'} homepage slideshow slide "${title}"`,
        targetId: id || 'slideshow',
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_SLIDESHOW_SLIDE') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can delete slideshow slides.' }, { status: 403 });
    }
    const slideId = String(body.slideId || body.id || '');
    if (!state.slideshow) state.slideshow = [];
    state.slideshow = state.slideshow
      .filter((s) => s.id !== slideId)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'REORDER_SLIDESHOW_SLIDES') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can reorder slideshow slides.' }, { status: 403 });
    }
    const orderedIds = Array.isArray(body.orderedIds) ? (body.orderedIds as string[]) : [];
    if (state.slideshow && orderedIds.length > 0) {
      const map = new Map(state.slideshow.map((s) => [s.id, s]));
      const nextSlides: SlideshowSlide[] = [];
      orderedIds.forEach((sid, idx) => {
        const found = map.get(sid);
        if (found) {
          nextSlides.push({ ...found, order: idx + 1, updatedAt: now });
          map.delete(sid);
        }
      });
      map.forEach((rem) => {
        nextSlides.push({ ...rem, order: nextSlides.length + 1 });
      });
      state.slideshow = nextSlides;
      saveServerStore(store);
    }
    return NextResponse.json({ ok: true, state });
  }

  // 24. COMMITTEE MANAGEMENT
  if (action === 'SAVE_COMMITTEE_MEMBER') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can manage committee members.' }, { status: 403 });
    }
    if (!state.committeeMembers) state.committeeMembers = [];
    const id = String(body.id || '');
    const committeeType = body.committeeType === 'sub' ? 'sub' : 'core';
    const fullName = sanitizeText(String(body.fullName || ''), 120);
    const wingName = body.wingName ? sanitizeText(String(body.wingName), 120) : undefined;
    const subRole = body.subRole ? sanitizeText(String(body.subRole), 80) : undefined;
    const rawPosition = sanitizeText(String(body.position || body.designation || ''), 120);
    const position =
      rawPosition ||
      (committeeType === 'sub'
        ? wingName
          ? `${subRole || 'Convener'} — ${wingName}`
          : subRole || 'Convener'
        : '');
    const roleCategory = (
      sanitizeText(
        String(body.roleCategory || (committeeType === 'sub' ? wingName || 'Sub Committee' : 'Executive')),
        80
      ) || 'Executive'
    ) as CommitteeMember['roleCategory'];
    const department =
      committeeType === 'sub' && wingName
        ? wingName
        : sanitizeText(String(body.department || '11th Batch of DHBC'), 120);
    const batchInfo = sanitizeText(
      String(body.batchInfo || body.batch || (committeeType === 'sub' ? 'Sub Committee' : '11th Batch of DHBC')),
      80
    );
    const contactEmail = body.contactEmail ? sanitizeText(String(body.contactEmail), 120) : undefined;
    const contactPhone = body.contactPhone ? sanitizeText(String(body.contactPhone), 40) : undefined;
    const avatarUrl = sanitizeMediaUrl(body.avatarUrl, '/images/avatar_admin_portrait.jpg');
    const bio = body.bio ? sanitizeText(String(body.bio), 600) : undefined;
    const showOnHomepage = body.showOnHomepage !== undefined ? Boolean(body.showOnHomepage) : true;
    const status = body.status === 'draft' ? 'draft' : 'published';

    if (!fullName || (committeeType === 'sub' ? !wingName || !(subRole || position) : !position)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            committeeType === 'sub'
              ? 'Member name, wing name, and Chairman/Convener role are required for Sub Committee.'
              : 'Member full name and position are required for Core Committee.',
        },
        { status: 400 }
      );
    }

    const existingIdx = state.committeeMembers.findIndex((m) => m.id === id);
    if (existingIdx >= 0) {
      const prev = state.committeeMembers[existingIdx];
      state.committeeMembers[existingIdx] = {
        ...prev,
        committeeType,
        wingName: committeeType === 'sub' ? wingName : undefined,
        subRole: committeeType === 'sub' ? subRole || 'Convener' : undefined,
        fullName,
        position,
        designation: position,
        roleCategory,
        department,
        batchInfo,
        batch: batchInfo,
        contactEmail,
        contactPhone,
        avatarUrl,
        bio,
        showOnHomepage,
        status,
        order: body.order !== undefined ? Number(body.order) : prev.order,
        updatedAt: now,
      };
    } else {
      const newMember: CommitteeMember = {
        id: `com_${Date.now()}`,
        committeeType,
        wingName: committeeType === 'sub' ? wingName : undefined,
        subRole: committeeType === 'sub' ? subRole || 'Convener' : undefined,
        fullName,
        position,
        designation: position,
        roleCategory,
        department,
        batchInfo,
        batch: batchInfo,
        contactEmail,
        contactPhone,
        avatarUrl,
        bio,
        order: state.committeeMembers.length + 1,
        showOnHomepage,
        status,
        createdAt: now,
        updatedAt: now,
      };
      state.committeeMembers.push(newMember);
    }
    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_EDIT',
        details: `${existingIdx >= 0 ? 'Updated' : 'Added'} ${committeeType === 'sub' ? 'Sub Committee' : 'Core Committee'} member ${fullName} (${position})`,
        targetId: id || 'committee',
        createdAt: now,
      })
    );
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_COMMITTEE_MEMBER') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can remove committee members.' }, { status: 403 });
    }
    const memberId = String(body.memberId || body.id || '');
    if (!state.committeeMembers) state.committeeMembers = [];
    state.committeeMembers = state.committeeMembers.filter((m) => m.id !== memberId);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 25. FEEDBACK SYSTEM (Students submit, Admin reviews & responds)
  if (action === 'SUBMIT_FEEDBACK') {
    if (!state.feedback) state.feedback = [];
    const category = sanitizeText(String(body.category || 'Academic'), 80);
    const subject = sanitizeText(String(body.subject || ''), 160);
    const message = sanitizeText(String(body.message || ''), 2500);
    const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));

    if (subject.length < 3 || message.length < 5) {
      return NextResponse.json(
        { ok: false, error: 'Feedback subject and detailed message are required.' },
        { status: 400 }
      );
    }

    const fb: FeedbackRecord = {
      id: `fb_${Date.now()}`,
      studentUid: actor.uid,
      studentId: actor.studentId,
      studentName: actor.fullName,
      category,
      subject,
      message,
      rating,
      status: 'submitted',
      createdAt: now,
      updatedAt: now,
    };
    state.feedback.unshift(fb);

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_PUBLICATION',
        details: `Submitted member feedback "${subject}"`,
        targetId: fb.id,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  if (action === 'UPDATE_FEEDBACK_STATUS') {
    if (actor.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Only SUPER ADMIN can update feedback status.' }, { status: 403 });
    }
    if (!state.feedback) state.feedback = [];
    const feedbackId = String(body.feedbackId || body.id || '');
    const target = state.feedback.find((f) => f.id === feedbackId);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Feedback entry not found.' }, { status: 404 });
    }
    if (body.status === 'submitted' || body.status === 'reviewed' || body.status === 'resolved') {
      target.status = body.status;
    }
    if (body.adminResponse !== undefined) {
      target.adminResponse = sanitizeText(String(body.adminResponse), 1500);
    }
    target.updatedAt = now;
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_FEEDBACK') {
    const feedbackId = String(body.feedbackId || body.id || '');
    if (!state.feedback) state.feedback = [];
    const target = state.feedback.find((f) => f.id === feedbackId);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Feedback entry not found.' }, { status: 404 });
    }
    if (actor.role !== 'admin' && target.studentUid !== actor.uid) {
      return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 });
    }
    state.feedback = state.feedback.filter((f) => f.id !== feedbackId);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state: scopeStateForActor(state, actor) });
  }

  // 25B. APPOINTMENTS MANAGEMENT (Admin updates status / deletes appointments)
  if (action === 'UPDATE_APPOINTMENT_STATUS') {
    if (actor.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Only SUPER ADMIN can update appointment status.' },
        { status: 403 }
      );
    }
    if (!state.appointments) state.appointments = [];
    const appointmentId = String(body.appointmentId || body.id || '');
    const target = state.appointments.find((a) => a.id === appointmentId);
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Appointment booking not found.' }, { status: 404 });
    }
    if (
      body.status === 'pending' ||
      body.status === 'confirmed' ||
      body.status === 'completed' ||
      body.status === 'cancelled'
    ) {
      target.status = body.status;
    }
    if (body.adminNotes !== undefined) {
      target.adminNotes = sanitizeText(String(body.adminNotes), 1000);
    }
    target.updatedAt = now;

    state.activityLogs.unshift(
      createSanitizedActivityLog({
        id: `log_${Date.now()}`,
        actorId: actor.uid,
        actorName: actor.fullName,
        actionType: 'CONTENT_EDIT',
        details: `Updated appointment "${target.purpose}" for ${target.fullName} to ${target.status}`,
        targetId: target.id,
        createdAt: now,
      })
    );

    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  if (action === 'DELETE_APPOINTMENT') {
    if (actor.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Only SUPER ADMIN can delete appointment bookings.' },
        { status: 403 }
      );
    }
    if (!state.appointments) state.appointments = [];
    const appointmentId = String(body.appointmentId || body.id || '');
    state.appointments = state.appointments.filter((a) => a.id !== appointmentId);
    saveServerStore(store);
    return NextResponse.json({ ok: true, state });
  }

  // 26. COMPLETE APPLICATION DATA RESET WITH VERIFIED BACKUP & PASSWORD CONFIRMATION GATE
  if (action === 'RESET_APPLICATION_DATA') {
    if (actor.role !== 'admin' || actor.uid !== 'admin_super') {
      return NextResponse.json(
        { ok: false, error: 'Only SUPER ADMIN can reset application data.' },
        { status: 403 }
      );
    }
    const confirmationPhrase = String(body.confirmationPhrase || '');
    const adminPassword = String(body.adminPassword || body.password || '');

    if (confirmationPhrase !== 'CONFIRM_ALNIBRAS_RESET' || !adminPassword) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Security Gate: RESET_APPLICATION_DATA requires confirmationPhrase="CONFIRM_ALNIBRAS_RESET" and valid SUPER ADMIN password.',
        },
        { status: 403 }
      );
    }

    const verifyAdmin = await verifyAndMigratePassword({
      submittedPassword: adminPassword,
      scryptHash: store.scryptCredentials?.admin_super || null,
      legacyHash: store.credentials.admin_super || null,
    });

    if (!verifyAdmin.verified) {
      return NextResponse.json(
        { ok: false, error: 'SUPER ADMIN password verification failed for application reset.' },
        { status: 403 }
      );
    }

    const freshStore = performVerifiedResetPreservingSuperAdmin(store);
    return NextResponse.json({ ok: true, state: freshStore.state });
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}

