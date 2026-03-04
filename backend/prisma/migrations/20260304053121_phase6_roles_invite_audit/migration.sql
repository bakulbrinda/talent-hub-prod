-- AlterEnum: Add HR_MANAGER value outside of a transaction
-- (PostgreSQL requires ALTER TYPE ADD VALUE to be committed before use)
ALTER TYPE "UserRole" ADD VALUE 'HR_MANAGER';
