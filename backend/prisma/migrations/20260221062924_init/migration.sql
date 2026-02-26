-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProficiencyLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "BenefitCategory" AS ENUM ('INSURANCE', 'EQUITY', 'LEARNING', 'LEAVE', 'RECOGNITION', 'WELLNESS');

-- CreateEnum
CREATE TYPE "BenefitStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "RsuStatus" AS ENUM ('ACTIVE', 'FULLY_VESTED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "CommissionPlanType" AS ENUM ('SALES', 'PERFORMANCE', 'HYBRID');

-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'APPLIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAY_ANOMALY', 'BUDGET_ALERT', 'NEW_HIRE_PARITY', 'RSU_VESTING', 'GENERAL');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_families" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobAreaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bands" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "isEligibleForRSU" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "gradeCode" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobFamilyId" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "gradeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "premiumMultiplier" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_skills" (
    "employeeId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "proficiencyLevel" "ProficiencyLevel" NOT NULL DEFAULT 'INTERMEDIATE',
    "certificationName" TEXT,
    "certifiedAt" TIMESTAMP(3),

    CONSTRAINT "employee_skills_pkey" PRIMARY KEY ("employeeId","skillId")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nickName" TEXT,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "reportingManagerId" TEXT,
    "dateOfJoining" TIMESTAMP(3) NOT NULL,
    "dateOfExit" TIMESTAMP(3),
    "grade" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "jobCodeId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "gender" "Gender" NOT NULL,
    "workLocation" TEXT,
    "workMode" "WorkMode" NOT NULL DEFAULT 'HYBRID',
    "costCenter" TEXT,
    "annualFixed" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "variablePay" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "specialAllowance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "hra" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pfYearly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "basicAnnual" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "retentionBonus" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "annualCtc" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "joiningBonus" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "lta" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "flexiTotalYearly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "subTotalA" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "incentives" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "hraMonthly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pfMonthly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "basicMonthly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "ltaMonthly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "monthlyGrossSalary" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "flexiTotalMonthly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "subTotalAMonthly" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "monthlySpecialAllowance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "april2023" DECIMAL(15,2),
    "july2023" DECIMAL(15,2),
    "april2024" DECIMAL(15,2),
    "july2024" DECIMAL(15,2),
    "lastIncrementDate" TIMESTAMP(3),
    "lastIncrementPercent" DECIMAL(5,2),
    "compaRatio" DECIMAL(8,2),
    "payRangePenetration" DECIMAL(8,2),
    "attritionRiskScore" DECIMAL(5,2),
    "timeInCurrentGrade" INTEGER,
    "refNo" TEXT,
    "remarks" TEXT,
    "addedBy" TEXT,
    "compensationDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_bands" (
    "id" TEXT NOT NULL,
    "bandId" TEXT NOT NULL,
    "jobAreaId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "minSalary" DECIMAL(15,2) NOT NULL,
    "midSalary" DECIMAL(15,2) NOT NULL,
    "maxSalary" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_benchmarks" (
    "id" TEXT NOT NULL,
    "bandId" TEXT,
    "jobCodeId" TEXT,
    "jobAreaId" TEXT,
    "location" TEXT,
    "p25" DECIMAL(15,2) NOT NULL,
    "p50" DECIMAL(15,2) NOT NULL,
    "p75" DECIMAL(15,2) NOT NULL,
    "p90" DECIMAL(15,2) NOT NULL,
    "source" TEXT,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_ratings" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "rating" DECIMAL(4,2) NOT NULL,
    "ratingLabel" TEXT,
    "comments" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefits_catalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "BenefitCategory" NOT NULL,
    "description" TEXT,
    "annualValue" DECIMAL(15,2),
    "eligibilityCriteria" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefits_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_benefits" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "utilizationPercent" DECIMAL(5,2),
    "utilizedValue" DECIMAL(15,2),
    "status" "BenefitStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsu_grants" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "grantDate" TIMESTAMP(3) NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "vestedUnits" INTEGER NOT NULL DEFAULT 0,
    "vestingScheduleMonths" INTEGER NOT NULL DEFAULT 48,
    "cliffMonths" INTEGER NOT NULL DEFAULT 12,
    "vestingPercent" DECIMAL(5,2) NOT NULL DEFAULT 25,
    "priceAtGrant" DECIMAL(10,2),
    "currentPrice" DECIMAL(10,2),
    "status" "RsuStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rsu_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsu_vesting_events" (
    "id" TEXT NOT NULL,
    "rsuGrantId" TEXT NOT NULL,
    "vestingDate" TIMESTAMP(3) NOT NULL,
    "unitsVesting" INTEGER NOT NULL,
    "isVested" BOOLEAN NOT NULL DEFAULT false,
    "vestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsu_vesting_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetVariablePercent" DECIMAL(5,2) NOT NULL,
    "acceleratorTiers" JSONB NOT NULL,
    "planType" "CommissionPlanType" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_achievements" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "targetAmount" DECIMAL(15,2) NOT NULL,
    "achievedAmount" DECIMAL(15,2) NOT NULL,
    "achievementPercent" DECIMAL(8,2) NOT NULL,
    "payoutAmount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCostImpact" DECIMAL(15,2),
    "affectedEmployeeCount" INTEGER,
    "snapshotData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "filters" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "job_areas_name_key" ON "job_areas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "job_families_name_jobAreaId_key" ON "job_families"("name", "jobAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "bands_code_key" ON "bands"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bands_level_key" ON "bands"("level");

-- CreateIndex
CREATE UNIQUE INDEX "grades_bandId_gradeCode_key" ON "grades"("bandId", "gradeCode");

-- CreateIndex
CREATE UNIQUE INDEX "job_codes_code_key" ON "job_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeId_key" ON "employees"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_band_idx" ON "employees"("band");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_employmentStatus_idx" ON "employees"("employmentStatus");

-- CreateIndex
CREATE INDEX "employees_gender_idx" ON "employees"("gender");

-- CreateIndex
CREATE INDEX "employees_band_department_idx" ON "employees"("band", "department");

-- CreateIndex
CREATE UNIQUE INDEX "performance_ratings_employeeId_cycle_key" ON "performance_ratings"("employeeId", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "benefits_catalog_name_key" ON "benefits_catalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_benefits_employeeId_benefitId_key" ON "employee_benefits"("employeeId", "benefitId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE INDEX "notifications_severity_idx" ON "notifications"("severity");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "ai_insights_insightType_idx" ON "ai_insights"("insightType");

-- CreateIndex
CREATE INDEX "ai_insights_expiresAt_idx" ON "ai_insights"("expiresAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_families" ADD CONSTRAINT "job_families_jobAreaId_fkey" FOREIGN KEY ("jobAreaId") REFERENCES "job_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_codes" ADD CONSTRAINT "job_codes_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "job_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_codes" ADD CONSTRAINT "job_codes_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_codes" ADD CONSTRAINT "job_codes_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_skills" ADD CONSTRAINT "employee_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_jobCodeId_fkey" FOREIGN KEY ("jobCodeId") REFERENCES "job_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_bands" ADD CONSTRAINT "salary_bands_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_bands" ADD CONSTRAINT "salary_bands_jobAreaId_fkey" FOREIGN KEY ("jobAreaId") REFERENCES "job_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_benchmarks" ADD CONSTRAINT "market_benchmarks_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "bands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_benchmarks" ADD CONSTRAINT "market_benchmarks_jobCodeId_fkey" FOREIGN KEY ("jobCodeId") REFERENCES "job_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_benchmarks" ADD CONSTRAINT "market_benchmarks_jobAreaId_fkey" FOREIGN KEY ("jobAreaId") REFERENCES "job_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_ratings" ADD CONSTRAINT "performance_ratings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefits" ADD CONSTRAINT "employee_benefits_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "benefits_catalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsu_grants" ADD CONSTRAINT "rsu_grants_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsu_vesting_events" ADD CONSTRAINT "rsu_vesting_events_rsuGrantId_fkey" FOREIGN KEY ("rsuGrantId") REFERENCES "rsu_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_achievements" ADD CONSTRAINT "commission_achievements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_achievements" ADD CONSTRAINT "commission_achievements_planId_fkey" FOREIGN KEY ("planId") REFERENCES "commission_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
