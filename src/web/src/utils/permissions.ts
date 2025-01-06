import { UserRole } from '../types/user';

/**
 * Role hierarchy mapping for permission level comparison
 * Higher number indicates higher permission level
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.ANONYMOUS]: 0,
  [UserRole.FREE_USER]: 1,
  [UserRole.PREMIUM]: 2,
  [UserRole.ADMIN]: 3,
};

/**
 * Error message templates for permission-related errors
 */
const ERROR_MESSAGES = {
  INSUFFICIENT_PERMISSIONS: 'Insufficient permissions. Required role: {0}, Current role: {1}',
  INVALID_ROLE: 'Invalid role provided: {0}',
};

/**
 * Custom error class for handling permission-related exceptions
 * Provides detailed context about the permission error including required and actual roles
 */
export class PermissionError extends Error {
  public readonly name: string = 'PermissionError';
  public readonly code: string;
  public readonly requiredRole: UserRole;
  public readonly actualRole: UserRole;

  constructor(message: string, requiredRole: UserRole, actualRole: UserRole) {
    super(message);
    this.code = 'PERMISSION_DENIED';
    this.requiredRole = requiredRole;
    this.actualRole = actualRole;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PermissionError.prototype);

    // Freeze the error object to prevent modifications
    Object.freeze(this);
  }
}

/**
 * Validates if a role value is a valid UserRole enum member
 * @param role - Role value to validate
 * @throws Error if role is invalid
 */
const validateRole = (role: UserRole): void => {
  if (!Object.values(UserRole).includes(role)) {
    throw new Error(ERROR_MESSAGES.INVALID_ROLE.replace('{0}', String(role)));
  }
};

/**
 * Core permission validation function that checks if user's role meets or exceeds required role level
 * @param userRole - Current user's role
 * @param requiredRole - Minimum role level required for access
 * @returns true if user has sufficient permissions
 * @throws PermissionError if access is denied
 */
export const checkPermission = (userRole: UserRole, requiredRole: UserRole): boolean => {
  validateRole(userRole);
  validateRole(requiredRole);

  const userLevel = ROLE_HIERARCHY[userRole];
  const requiredLevel = ROLE_HIERARCHY[requiredRole];

  if (userLevel < requiredLevel) {
    throw new PermissionError(
      ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS
        .replace('{0}', requiredRole)
        .replace('{1}', userRole),
      requiredRole,
      userRole
    );
  }

  return true;
};

/**
 * Validates if user has permission to upload artwork
 * Requires FREE_USER role or higher
 * @param userRole - Current user's role
 * @returns true if user can upload artwork
 * @throws PermissionError if access is denied
 */
export const canUploadArtwork = (userRole: UserRole): boolean => {
  return checkPermission(userRole, UserRole.FREE_USER);
};

/**
 * Validates if user has permission to export graph data
 * Requires PREMIUM role or higher
 * @param userRole - Current user's role
 * @returns true if user can export graphs
 * @throws PermissionError if access is denied
 */
export const canExportGraph = (userRole: UserRole): boolean => {
  return checkPermission(userRole, UserRole.PREMIUM);
};

/**
 * Validates if user has administrative access privileges
 * Requires ADMIN role
 * @param userRole - Current user's role
 * @returns true if user has admin access
 * @throws PermissionError if access is denied
 */
export const canAccessAdminFeatures = (userRole: UserRole): boolean => {
  return checkPermission(userRole, UserRole.ADMIN);
};