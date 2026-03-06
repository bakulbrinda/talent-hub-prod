# Auth & Settings Redesign Plan
**Date:** 2026-03-05
**Context:** Post-stakeholder discussion — RBAC removed. Platform has 3–5 known internal users (HR team). No public signup.

---

## Decision: No RBAC

All authenticated users have full access. The role system (ADMIN / HR_MANAGER / VIEWER) is deprecated. The only distinction kept is one designated admin who can manage other users from Settings.

---

## 1. Auth Flow

### Model: Admin-Controlled Closed System

No self-signup. The HR admin creates all accounts from within the platform. The invite token mechanism (already built) is repurposed as a one-time password-setup link.

```
HR Admin → Settings → Users → "Add User"
         → enters name + email
         → system sends "Set your password" email (7-day token)
         → new user opens link, sets password, lands on dashboard
         → all authenticated users have full access
```

### Changes Required

**Backend**
- Remove `requireRole(...)` middleware from all protected routes — any authenticated user (`authenticate` middleware only) can access everything
- Keep `UserInvite` model and invite token flow; drop the `role` field from invite creation payload
- Add `POST /api/users/:id/reset-password` — admin generates a reset link for an existing user
- Add `PATCH /api/users/:id/deactivate` — soft-deactivate a user (set `isActive: false`, invalidate their refresh tokens)
- Add `GET /api/auth/sessions` — list active refresh tokens for the current user
- Add `DELETE /api/auth/sessions` — revoke all refresh tokens (logout all devices)

**Frontend**
- Remove role dropdown from the Add User / Invite modal
- Remove role badge from the Users table
- Update invite email template subject/body: "Set up your Talent Hub account" (not "You've been invited as HR_MANAGER")
- Add "Reset password" and "Deactivate" actions to each user row in Settings

### Invite Email Flow (updated)

| Step | Actor | Action |
|---|---|---|
| 1 | HR Admin | Settings → Users → Add User (name + email) |
| 2 | System | Sends email: "Set your password" with 7-day token link |
| 3 | New user | Opens link → enters new password → redirected to dashboard |
| 4 | Admin | Can reset password or deactivate from Settings at any time |

### Direct Credential Creation (no email)

If the new user has no email access, admin can also:
1. Add User → skip email (or enter a placeholder)
2. Manually set a temporary password via the reset-password API
3. Share credentials out-of-band

---

## 2. Settings Redesign

### User Settings (per-user, personal)

Accessible by every logged-in user from the top-right profile menu.

| Feature | Status | Notes |
|---|---|---|
| Change password | Add | Requires current password + new password (min 8 chars) |
| Edit display name | Add | Editable first + last name |
| Theme toggle (light/dark) | Keep | Already exists |
| Email notification preferences | Add | Toggles: pay anomaly alerts, RSU vesting reminders |
| Active sessions | Add | List of active refresh tokens with browser/IP, "Log out all devices" button |

---

### Platform Settings (admin-facing, org-wide)

Four tabs:

---

#### Tab 1: User Management

Replaces current RBAC-heavy user list. Clean table, no role column.

**Table columns:** Name / Email / Last Login / Status (Active / Inactive)

**Actions per row:**
- Send invite (if never accepted)
- Reset password (generates a fresh setup link, emails user)
- Deactivate / Reactivate

**Add User button:** opens modal with Name + Email fields only.

---

#### Tab 2: Organisation

| Setting | Type | Notes |
|---|---|---|
| Organisation name | Text | Used in PDF reports and email headers |
| Fiscal year start month | Dropdown (Jan–Dec) | Affects performance cycle calculations |
| Default currency | Dropdown | Currently hardcoded `₹`; make configurable |
| HR alert email recipients | Multi-email input | Currently env var `HR_ALERT_EMAIL`; move to DB |

---

#### Tab 3: Notifications & Alerts

| Setting | Type | Default |
|---|---|---|
| Proactive AI scan | Toggle on/off | On |
| Scan frequency | Dropdown (30min / 1hr / 2hr / 6hr) | 1hr |
| Pay anomaly compa-ratio threshold | Number input (%) | 75% |
| RSU vesting reminder lead time | Number input (days) | 30 days |
| Alert email recipients | Inherited from Org tab | — |

---

#### Tab 4: Data

| Action | Description |
|---|---|
| Export employees CSV | Downloads all active employee data |
| Trigger AI scan now | Manually fires the proactive anomaly scan |
| Clear AI insight cache | Busts Redis `ai:*` and `dashboard:*` keys — forces fresh Claude analysis |

---

## 3. Implementation Order

1. Remove `requireRole` from all routes (low risk, one-line changes per route)
2. Add deactivate + reset-password endpoints
3. Simplify Add User modal (drop role field)
4. Build User Settings page (change password + active sessions)
5. Build Platform Settings — User Management tab
6. Build Platform Settings — Organisation tab (store in a new `OrgConfig` key-value table or a single-row settings table)
7. Build Platform Settings — Notifications tab (move hardcoded thresholds to DB)
8. Build Platform Settings — Data tab (export + manual scan trigger)

---

## 4. Schema Changes Needed

```prisma
// New: single-row org config table
model OrgConfig {
  id                    String   @id @default("singleton")
  orgName               String   @default("Talent Hub")
  fiscalYearStartMonth  Int      @default(4)   // April
  currencySymbol        String   @default("₹")
  hrAlertEmails         String[] @default([])
  aiScanEnabled         Boolean  @default(true)
  aiScanFrequencyMins   Int      @default(60)
  anomalyCompaThreshold Float    @default(75.0)
  rsuReminderDays       Int      @default(30)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@map("org_config")
}

// Add to User model:
// isActive  Boolean  @default(true)
// lastLoginAt DateTime?
```

---

## 5. What to Skip

- Audit log UI (models exist in DB, not worth building a UI for 3–5 users)
- SSO / OAuth (overkill)
- API key management
- Webhook config
- Fine-grained per-feature permissions
