-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('C1', 'C2', 'C3', 'C4');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN "criticality" "Criticality";
