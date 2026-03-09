import { useAuthStore } from '../store/authStore';
import { HR_STAFF_DEFAULT_PERMISSIONS } from '@shared/constants/index';

/**
 * Returns true if the current user has access to the given feature key.
 * - ADMIN: always true (unrestricted).
 * - All other roles: checks user.permissions from JWT; falls back to
 *   HR_STAFF_DEFAULT_PERMISSIONS when permissions array is empty.
 */
export function useAccess(feature: string): boolean {
  const user = useAuthStore(s => s.user);
  if (!user) return false;
  if (user.role === 'ADMIN') return true;

  const perms =
    user.permissions && user.permissions.length > 0
      ? user.permissions
      : HR_STAFF_DEFAULT_PERMISSIONS;

  return perms.includes(feature);
}
