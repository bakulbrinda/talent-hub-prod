# Talent Hub — Database Reference

Source of truth: `backend/prisma/schema.prisma`
Engine: PostgreSQL (Neon) via Prisma ORM
Total models: 25 (+ 13 enums)

This document describes every table, its role in the platform, the schema (fields/types/relations), and how it feeds data into the rest of the system.

---

## Table of Contents

1. [Auth & Access](#1-auth--access)
   - users, refresh_tokens, user_invites, audit_logs
2. [Job Architecture](#2-job-architecture)
   - job_areas, job_families, bands, grades, job_codes
3. [Skills](#3-skills)
   - skills, employee_skills
4. [Employees](#4-employees) — employees
5. [Compensation Bands & Benchmarks](#5-compensation-bands--benchmarks)
   - salary_bands, market_benchmarks
6. [Performance](#6-performance) — performance_ratings
7. [Benefits](#7-benefits)
   - benefits_catalog, employee_benefits
8. [RSU / Equity](#8-rsu--equity)
   - rsu_grants, rsu_vesting_events
9. [Variable Pay](#9-variable-pay)
   - commission_plans, commission_achievements
10. [Scenarios](#10-scenarios) — scenarios
11. [Notifications](#11-notifications) — notifications
12. [AI Insights Cache](#12-ai-insights-cache) — ai_insights
13. [Mail Log](#13-mail-log) — mail_logs
14. [Org Config](#14-org-config) — org_config
15. [Enums](#15-enums)

---

## 1. Auth & Access

### `users`
**Role:** Platform user accounts. Drives all authentication, RBAC, audit attribution, and ownership of scenarios/mail logs.

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| email | String UNIQUE | Lower-cased on login lookup |
| password | String | bcrypt hash |
| name | String | |
| role | UserRole | ADMIN / HR_MANAGER / HR_STAFF / VIEWER (default ADMIN) |
| permissions | String[] | Per-feature flags assigned at invite time |
| isActive | Boolean | Soft disable |
| lastLoginAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

**Relations:** has many → `refresh_tokens`, `scenarios`, `audit_logs`, `mail_logs`.
**Feeds:** auth middleware (`req.user`), `requireRole` RBAC, scenario authorship, audit trail, email send history.

### `refresh_tokens`
**Role:** JWT refresh-token rotation store.

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| token | String UNIQUE | 7-day refresh token |
| userId | FK → users | onDelete: Cascade |
| expiresAt | DateTime | |
| createdAt | DateTime | |

**Feeds:** Axios silent-refresh interceptor on 401 → re-issues a 15-min access token.

### `user_invites`
**Role:** Token-based admin invite flow. Admin creates row → recipient hits public `/api/users/invite/:token` → password set on `accept-invite`.

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| email | String UNIQUE | |
| role | UserRole | Default HR_STAFF |
| permissions | String[] | Pre-configured at invite time |
| token | String UNIQUE | Indexed |
| invitedById | String | (no FK constraint) |
| expiresAt | DateTime | 7-day expiry |
| usedAt | DateTime? | Set on acceptance |
| createdAt | DateTime | |

### `audit_logs`
**Role:** Append-only trail of sensitive actions (employee writes, scenario apply, role changes).

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| userId | FK → users | Cascade |
| action | String | e.g. `EMPLOYEE_UPDATED`, `SCENARIO_APPLIED` |
| entityType | String? | e.g. `Employee`, `Scenario` |
| entityId | String? | |
| metadata | Json? | Diff/payload snapshot |
| ip | String? | |
| createdAt | DateTime | Indexed |

**Indexes:** `userId`, `action`, `createdAt`. **Feeds:** Audit Log page in Settings.

---

## 2. Job Architecture

A 5-level hierarchy: JobArea → JobFamily → JobCode (with Band+Grade attached).

### `job_areas`
Top-level grouping (Engineering, Sales, …). UNIQUE `name`. Parent of `job_families`, `salary_bands`, `market_benchmarks`.

### `job_families`
Mid-level (Software, Hardware, …) under a JobArea. Composite UNIQUE `(name, jobAreaId)`.

### `bands`
**Role:** The 10 compensation levels — `A1, A2, P1, P2, P3, M1, M2, D0, D1, D2`. Single source of truth; **never hardcode band arrays** elsewhere.

| Field | Type | Notes |
|---|---|---|
| id | UUID PK | |
| code | String UNIQUE | e.g. `P2` |
| label | String | Human-readable |
| level | Int UNIQUE | Numeric ordering |
| isEligibleForRSU | Boolean | True for P1+ |

**Feeds:** salary band ranges, market benchmarks, job codes, RSU eligibility checks.

### `grades`
Sub-levels within a Band. Composite UNIQUE `(bandId, gradeCode)`.

### `job_codes`
**Role:** Specific role codes (e.g. `SWE-001`) — links a JobFamily + Band + optional Grade and stores the role's textual JD.

Key fields: `code` UNIQUE, `title`, `jobFamilyId`, `bandId`, `gradeId?`, plus `jobFunction`, `reportsTo`, `roleSummary`, `roleResponsibilities`, `managerResponsibility`, `educationExperience`, `skillsRequired`. **Feeds:** `employees.jobCodeId`, market benchmark lookups.

---

## 3. Skills

### `skills`
Skill catalog. UNIQUE `name`, optional `category`, `premiumMultiplier` (Decimal 5,2) for skill-based pay premiums.

### `employee_skills`
Pivot: `(employeeId, skillId)` composite PK, `proficiencyLevel` (BEGINNER/INTERMEDIATE/ADVANCED/EXPERT), `certificationName`, `certifiedAt`. Cascades on either side. **Feeds:** skill-premium analyses, employee detail pages.

---

## 4. Employees

### `employees`
**Role:** Core entity — every comp calculation, dashboard chart, AI scan, scenario, and equity check derives from this table. ~50 columns covering identity, employment, full annual + monthly comp breakdown, revision history, and computed analytics fields.

#### Identity / Employment
`id`, `employeeId` UNIQUE, `firstName`, `lastName`, `nickName?`, `email` UNIQUE, `department`, `designation`, `reportingManagerId?` (self-relation `ReportsTo`), `dateOfJoining`, `dateOfExit?`, `grade`, `band` (string copy of Band.code for fast filter), `jobCodeId?`, `employmentType` (FULL_TIME/PART_TIME/CONTRACT/INTERN), `employmentStatus` (ACTIVE/INACTIVE/ON_LEAVE/TERMINATED), `gender`, `workLocation?`, `workMode` (REMOTE/HYBRID/ONSITE), `costCenter?`.

#### Annual Compensation (Decimal 15,2)
`annualFixed`, `variablePay`, `specialAllowance`, `hra`, `pfYearly`, `basicAnnual`, `retentionBonus`, `annualCtc`, `joiningBonus`, `lta`, `flexiTotalYearly`, `subTotalA`, `incentives`.

#### Monthly Compensation
`hraMonthly`, `pfMonthly`, `basicMonthly`, `ltaMonthly`, `monthlyGrossSalary`, `flexiTotalMonthly`, `subTotalAMonthly`, `monthlySpecialAllowance`.

#### Revision History
`april2023`, `july2023`, `april2024`, `july2024`, `lastIncrementDate`, `lastIncrementPercent`.

#### Computed (background-job updated)
`compaRatio`, `payRangePenetration`, `attritionRiskScore`, `criticality` (C1–C4), `timeInCurrentGrade`.

#### Meta
`refNo?`, `remarks?`, `addedBy?`, `compensationDocument?`, `createdAt`, `updatedAt`.

**Indexes:** `band`, `department`, `employmentStatus`, `gender`, `(band, department)`.
**Relations:** has many `EmployeeSkill`, `PerformanceRating`, `EmployeeBenefit`, `RsuGrant`, `CommissionAchievement`; self-relation reporting hierarchy.
**Feeds:** dashboard KPIs, pay-equity analyzer, salary-band compliance, scenario projections, AI chat tools, anomaly scan, exports/imports, Variable Pay page (CSV-derived from `variablePay`).

---

## 5. Compensation Bands & Benchmarks

### `salary_bands`
**Role:** Defines internal min/mid/max salary range per Band × JobArea, time-stamped with `effectiveDate`. Drives compa-ratio and band-compliance calculations.

Fields: `bandId` FK, `jobAreaId?` FK, `effectiveDate`, `minSalary`, `midSalary`, `maxSalary`, `currency` (default INR). **Feeds:** `salaryBand.service.ts` (computed compaRatio per employee on update — fires `SALARY_BAND_UPDATED` socket event for batch recalc).

### `market_benchmarks`
**Role:** External market data per band/jobCode/jobArea/location with `p25/p50/p75/p90` percentiles. Used by AI insights and pay-equity comparisons.

Fields: optional `bandId`, `jobCodeId`, `jobAreaId`, `location`; required `p25, p50, p75, p90` (Decimal 15,2), `source?`, `asOfDate`.

---

## 6. Performance

### `performance_ratings`
**Role:** Annual cycle ratings used for low-performer alerts and increment scenarios.

Fields: `employeeId` FK Cascade, `cycle` (string e.g. "FY24"), `rating` (Decimal 4,2), `ratingLabel?`, `comments?`, `reviewedBy?`. UNIQUE `(employeeId, cycle)`.
**Feeds:** `email/low-performer-alert`, scenario rules referencing rating thresholds.

---

## 7. Benefits

### `benefits_catalog`
**Role:** Catalog of benefits offered (insurance, equity, learning, leave, recognition, wellness).

Fields: `name` UNIQUE, `category` (BenefitCategory enum), `description?`, `annualValue?`, `eligibilityCriteria` (Json — flexible rules), `isActive`.

### `employee_benefits`
**Role:** Per-employee enrollment record. Composite UNIQUE `(employeeId, benefitId)`.

Fields: `enrolledAt`, `expiresAt?`, `utilizationPercent`, `utilizedValue`, `status` (ACTIVE/EXPIRED/CLAIMED).
**Special:** EQUITY-category rows surface as the "RSU Grants" tab in Benefits Management; `utilizationPercent` = vesting %, `utilizedValue` = vested ₹.

---

## 8. RSU / Equity

> Legacy tables — RSU UI is now driven by EQUITY rows in `employee_benefits`. These remain for vesting-event detail.

### `rsu_grants`
Fields: `employeeId` Cascade, `grantDate`, `totalUnits`, `vestedUnits`, `vestingScheduleMonths` (default 48), `cliffMonths` (default 12), `vestingPercent` (default 25), `priceAtGrant?`, `currentPrice?`, `status` (ACTIVE/FULLY_VESTED/FORFEITED).

### `rsu_vesting_events`
Per-milestone event: `rsuGrantId` Cascade, `vestingDate`, `unitsVesting`, `isVested`, `vestedAt?`. **Feeds:** RSU vesting reminder emails (30-day window from `OrgConfig.rsuReminderDays`).

---

## 9. Variable Pay

> Backend-only — the Variable Pay UI now reads `employee.variablePay` directly. These tables persist plan/achievement detail.

### `commission_plans`
Fields: `name`, `targetVariablePercent`, `acceleratorTiers` (Json — tier ladder), `planType` (SALES/PERFORMANCE/HYBRID), `effectiveFrom`, `effectiveTo?`.

### `commission_achievements`
Fields: `employeeId` Cascade, `planId` FK, `period` (e.g. "Q3-FY24"), `targetAmount`, `achievedAmount`, `achievementPercent`, `payoutAmount`.

---

## 10. Scenarios

### `scenarios`
**Role:** What-if salary-modeling rule sets. Authored by a User, simulated against current employee data, optionally applied to mutate live comp.

Fields: `name`, `description?`, `createdById` FK → users, `rules` (Json — DSL of conditions+adjustments), `status` (DRAFT/APPLIED/ARCHIVED), `totalCostImpact`, `affectedEmployeeCount`, `snapshotData` (Json — pre-apply state for rollback).
**RBAC:** run/delete = ADMIN+HR_MANAGER; apply = ADMIN.
**Feeds:** AI scenario suggester creates DRAFTs; Apply rewrites `employees` rows + writes `audit_logs`.

---

## 11. Notifications

### `notifications`
**Role:** User-facing alerts pushed via Socket.io and persisted for the bell-icon list.

Fields: `type` (PAY_ANOMALY / BUDGET_ALERT / NEW_HIRE_PARITY / RSU_VESTING / GENERAL), `title`, `message`, `severity` (INFO/WARNING/CRITICAL), `isRead`, `relatedEntityType?`, `relatedEntityId?`, `metadata` (Json), `createdAt`.
**Indexes:** `isRead`, `severity`, `type`.
**Feeds:** AI proactive scan (24h dedupe by title), hourly cron, manual `/api/notifications/trigger-scan`.

---

## 12. AI Insights Cache

### `ai_insights`
**Role:** Persisted cache of Claude API outputs (narrative + structured `data`) keyed by insight type + filter hash. Backstops Redis cache for long-lived insights.

Fields: `insightType`, `filtersHash` (default "default"), `title`, `narrative` (Text), `data` (Json), `filters` (Json?), `generatedAt`, `expiresAt?`, `model` (default `claude-sonnet-4-6`), `promptTokens?`, `completionTokens?`.
**Indexes:** `(insightType, filtersHash)`, `expiresAt`.
**TTL:** 2–24 hours depending on insight type.

---

## 13. Mail Log

### `mail_logs`
**Role:** History of every email the platform sends, attributed to the User who triggered it.

Fields: `sentById` FK Cascade, `recipientEmail`, `subject`, `body` (Text), `useCase` (e.g. `LOW_PERFORMER_ALERT`, `RSU_REMINDER`, `PAY_ANOMALY_ALERT`), `sentAt`.
**Indexes:** `sentById`, `sentAt`.

---

## 14. Org Config

### `org_config`
**Role:** Singleton row (`id = "singleton"`) holding tenant-wide platform settings editable from the Platform Settings page.

Fields: `orgName` (default "Talent Hub"), `fiscalYearStartMonth` (default 4), `currencySymbol` (default ₹), `hrAlertEmails` (String[]), `aiScanEnabled`, `aiScanFrequencyMins` (default 60), `anomalyCompaThreshold` (default 75.0), `rsuReminderDays` (default 30).
**Feeds:** AI proactive scan scheduler, anomaly thresholds, RSU reminder window, dashboard currency/fiscal-year display.

---

## 15. Enums

| Enum | Values |
|---|---|
| **UserRole** | ADMIN, HR_MANAGER, HR_STAFF, VIEWER |
| **ProficiencyLevel** | BEGINNER, INTERMEDIATE, ADVANCED, EXPERT |
| **EmploymentType** | FULL_TIME, PART_TIME, CONTRACT, INTERN |
| **EmploymentStatus** | ACTIVE, INACTIVE, ON_LEAVE, TERMINATED |
| **Gender** | MALE, FEMALE, NON_BINARY, PREFER_NOT_TO_SAY |
| **WorkMode** | REMOTE, HYBRID, ONSITE |
| **Criticality** | C1 (Critical+Irreplaceable), C2 (Non-Critical+Irreplaceable), C3 (Critical+Replaceable), C4 (Non-Critical+Replaceable) |
| **BenefitCategory** | INSURANCE, EQUITY, LEARNING, LEAVE, RECOGNITION, WELLNESS |
| **BenefitStatus** | ACTIVE, EXPIRED, CLAIMED |
| **RsuStatus** | ACTIVE, FULLY_VESTED, FORFEITED |
| **CommissionPlanType** | SALES, PERFORMANCE, HYBRID |
| **ScenarioStatus** | DRAFT, APPLIED, ARCHIVED |
| **NotificationType** | PAY_ANOMALY, BUDGET_ALERT, NEW_HIRE_PARITY, RSU_VESTING, GENERAL |
| **NotificationSeverity** | INFO, WARNING, CRITICAL |

---

## Data-Flow Cheat Sheet

```
employees ──┬─► dashboard KPIs (cached: dashboard:*)
            ├─► pay-equity score (uses salary_bands + market_benchmarks)
            ├─► AI chat tools (read-only Prisma queries)
            ├─► AI proactive scan ──► notifications (Socket.io)
            ├─► scenarios.snapshotData (pre-apply state)
            └─► exports / imports

salary_bands ──► employee.compaRatio (recompute on update, broadcast SALARY_BAND_UPDATED)
performance_ratings ──► email alerts + scenario rules
employee_benefits (EQUITY) ──► RSU UI (replaces rsu_grants in UI)
rsu_vesting_events ──► 30-day reminder emails
ai_insights ──► narrative + data on insight pages (Redis is L1, this table is L2)
audit_logs / mail_logs ──► Settings → Audit / Mail History
org_config ──► thresholds for scan + reminders
```
