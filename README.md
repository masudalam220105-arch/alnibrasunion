# AL-NIBRAS – Official Class Union Management Portal

**AL-NIBRAS** is a full-stack Class Union Management Portal built with **Next.js (App Router)**, **React 19**, **Tailwind CSS**, **Chart.js**, **Firebase Authentication**, and **Cloud Firestore**.

---

## 1. Architecture & Technology Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Chart.js (`react-chartjs-2`).
- **Backend API**: Next.js REST API (`/app/api/portal/route.ts`) with cryptographic password hashing (`PBKDF2/FNV-1a` salted digest), server-side persistent storage, rate limiting, XSS sanitization, and Role-Based Access Control (RBAC).
- **Database & Cloud Security**:
  - **Cloud Firestore** (`firebase-applet-config.json`)
  - **Hardened Zero-Trust Firestore Security Rules** (`firestore.rules`) validated with `@firebase/eslint-plugin-security-rules`
  - **Database Blueprint** (`firebase-blueprint.json`) & **Security Specification** (`security_spec.md`)

---

## 2. Official Accounts

> **Security Note**: Login fields are never prefilled. Passwords are stored exclusively as salted cryptographic hashes and are never written to activity logs.

### Main Administrator Account
- **Display Name**: `SUPER ADMIN`
- **Username**: `alnibras@admin`
- **Password**: `AlNibras@2026`

### Sample Enrolled Student Accounts
- **Scholar 1**: `ahmed.mansoor` / `Student@2026` (Student ID: `AN-2026-101`, Roll `#01`)
- **Scholar 2**: `zaynab.rashid` / `Student@2026` (Student ID: `AN-2026-102`, Roll `#02`)
- **Scholar 3**: `omar.farooq` / `Student@2026` (Student ID: `AN-2026-103`, Roll `#03`)

---

## 3. Core Modules

1. **Public Home Page**:
   - Institutional Navy (`#0B192C`), Ivory (`#FAF9F5`), and Gold (`#C5A059`) aesthetic.
   - Live published announcements, circular notices, upcoming events, class union leadership charter, and validated Secretariat inquiry form.
2. **Admin Panel (`SUPER ADMIN`)**:
   - **Dashboard**: Live student & content KPIs, Chart.js analytics, recent audit trail, and quick actions.
   - **Student Management**: Create student accounts, edit profiles without deleting accounts, activate/deactivate credentials, search & filter.
   - **Content Management System (CMS)**: Create, edit, publish/unpublish (draft isolation), and delete Announcements, Circular Notices, Union Events, Class Information, Gallery photographs, and Study Resources.
   - **Messages & Activity Logs**: Reply to student inquiries and audit all logins, logouts, account creations, credential updates, and content mutations.
3. **Student Panel**:
   - Personal scholar dashboard, academic dossier (`My Profile`), published Announcements, Notices, Events, Class Gallery, Study Resources, Secretariat Messaging, Change Username, Change Password, and real-time Unread Notification alerts (`Mark as read` / `Mark all as read`).

---

## 4. Installation, Testing & Deployment

```bash
# 1. Install dependencies
npm install

# 2. Run logic & security unit tests
npx --yes tsx --test lib/portal-logic.test.ts

# 3. Validate Firestore security rules
npx eslint firestore.rules

# 4. Run development server on port 3000
npm run dev

# 5. Production build
npm run build
npm start
```
