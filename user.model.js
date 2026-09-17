/**
 * User Management Model Definition
 * Describes the fields used for administrative user management.
 */ 

export const UserManagementEntity = {
  fields: {
    id: 'UUID',
    email: 'String',
    password: 'String (Hashed)',
    role: 'Enum (ROLES)',
    firstName: 'String',
    lastName: 'String',
    isActive: 'Boolean',
    deletedAt: 'DateTime (Nullable)',
    lastLoginAt: 'DateTime',
    refreshToken: 'String',
    passwordResetToken: 'String',
    passwordResetExpires: 'DateTime',
    createdAt: 'DateTime',
    updatedAt: 'DateTime',
  }
};

export default UserManagementEntity;