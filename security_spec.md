# AL-NIBRAS Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default-Deny Catch-All**: All paths in `/databases/{database}/documents/{document=**}` are denied by default unless explicitly matched.
2. **Verified Authentication & Admin Trust**:
   - Standard write operations require `isSignedIn()` and `isVerified()` (`request.auth.token.email_verified == true`).
   - Admin privileges (`isAdmin()`) are granted ONLY when `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` is true, or when the authenticated user has verified email `masudalam220105@gmail.com`.
3. **PII Isolation (`/users/{userId}`)**:
   - Student and admin profiles contain `contactEmail` and `contactPhone` (PII).
   - `get` and `list` on `/users/{userId}` are strictly restricted to the document owner (`request.auth.uid == userId` / `resource.data.uid == request.auth.uid`) or `isAdmin()`. Blanket `isSignedIn()` reads on `/users` are strictly prohibited.
   - Students cannot self-assign `role: 'admin'` or change their `studentId`, `rollNumber`, or `status`. Students may only update permitted fields (`username`, `fullName`, `contactEmail`, `contactPhone`, `avatarUrl`, `updatedAt`) on their own profile.
4. **Publication Visibility Gate (`announcements`, `notices`, `events`, `gallery`, `resources`)**:
   - Non-admin users may only `get` or `list` documents where `resource.data.status == 'published'`.
   - Draft documents (`status == 'draft'`) are invisible to students and unauthenticated visitors.
   - Only `isAdmin()` may create, update, publish, unpublish, or delete official content in `announcements`, `notices`, `events`, `gallery`, `resources`, and `settings`.
5. **Temporal & Immutable Field Integrity**:
   - Every `create` operation requires `incoming().createdAt == request.time`.
   - Every `update` operation requires `incoming().updatedAt == request.time` and preserves `incoming().createdAt == existing().createdAt`.
   - `activityLogs` are append-only (`update` and `delete` are forbidden for non-admins, and `actorId` must match `request.auth.uid`).

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Privilege Escalation on User Profile Creation**:
   ```json
   {
     "uid": "student_1",
     "fullName": "Malicious Student",
     "username": "malicious",
     "studentId": "AN-999",
     "rollNumber": "99",
     "role": "admin",
     "status": "active",
     "contactEmail": "mal@example.com",
     "contactPhone": "1234567",
     "avatarUrl": "/images/avatar.jpg",
     "department": "Theology",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected Result*: `PERMISSION_DENIED` (non-admin cannot create user accounts or assign `role: "admin"`).

2. **Payload 2 — Shadow Field Injection on User Profile Update**:
   ```json
   {
     "username": "new_handle",
     "isSuperAdmin": true,
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected Result*: `PERMISSION_DENIED` (`hasOnly` and `affectedKeys().hasOnly(...)` reject undeclared shadow keys).

3. **Payload 3 — Student Attempting to Activate Own Deactivated Account**:
   ```json
   {
     "status": "active",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected Result*: `PERMISSION_DENIED` (students cannot modify `status` via `affectedKeys()`).

4. **Payload 4 — Horizontal PII Scraping on `/users/{otherUserId}`**:
   - Authenticated `student_1` performs `get` on `/users/student_2`.
   *Expected Result*: `PERMISSION_DENIED` (PII isolation enforces `userId == request.auth.uid || isAdmin()`).

5. **Payload 5 — Unfiltered `list` Query on `/users` by Non-Admin**:
   - Authenticated `student_1` runs `getDocs(collection(db, 'users'))` without `where('uid', '==', 'student_1')`.
   *Expected Result*: `PERMISSION_DENIED` (`allow list` requires `resource.data.uid == request.auth.uid || isAdmin()`).

6. **Payload 6 — Student Reading Draft Announcement**:
   - Authenticated `student_1` performs `get` on `/announcements/draft_ann_1` where `status == 'draft'`.
   *Expected Result*: `PERMISSION_DENIED` (`resource.data.status == 'published' || isAdmin()`).

7. **Payload 7 — Student Publishing an Announcement**:
   ```json
   {
     "title": "Fake Holiday",
     "content": "Classes are cancelled all week.",
     "category": "Academic",
     "status": "published",
     "priority": "urgent",
     "authorId": "student_1",
     "authorName": "Student",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   *Expected Result*: `PERMISSION_DENIED` (only `isAdmin()` can create announcements).

8. **Payload 8 — Email Spoofing Attack (Unverified Admin Email)**:
   - Token with `email: "masudalam220105@gmail.com"` and `email_verified: false` attempts to create a notice.
   *Expected Result*: `PERMISSION_DENIED` (`isVerified()` strictly requires `request.auth.token.email_verified == true`).

9. **Payload 9 — Resource Poisoning (Oversized Title String)**:
   - Admin sends `Announcement` with a 5,000-character `title` (exceeding `maxLength: 180`).
   *Expected Result*: `PERMISSION_DENIED` (`isValidAnnouncement` enforces `data.title.size() <= 180`).

10. **Payload 10 — ID Poisoning Attack**:
    - Attempt to create document with malformed ID containing spaces or special characters (`/notices/bad$id!`).
    *Expected Result*: `PERMISSION_DENIED` (`isValidId` enforces `^[a-zA-Z0-9_\-]+$`).

11. **Payload 11 — Forged Timestamp on Message Creation**:
    - Student creates `/messages/msg_1` with backdated `createdAt` instead of `request.time`.
    *Expected Result*: `PERMISSION_DENIED` (`incoming().createdAt == request.time`).

12. **Payload 12 — Cross-User Notification Tampering**:
    - `student_1` attempts to mark `student_2`'s notification as `read: true`.
    *Expected Result*: `PERMISSION_DENIED` (`existing().recipientId == request.auth.uid`).

---

## 3. Security Rules Test Runner (`firestore.rules.test.ts`)

A unit test suite (`lib/security-rules.test.ts`) verifies schema validators, RBAC guards, and all 12 Dirty Dozen invariants.
