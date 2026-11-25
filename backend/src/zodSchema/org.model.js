import { z } from 'zod';

export const ORG_TABLE = 'orgs';

export const ORG_COLUMNS = {
  ID: 'id',
  NAME: 'name',
  CODE: 'code',
  DESCRIPTION: 'description',
  IS_ACTIVE: 'is_active',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  DELETED_AT: 'deleted_at',
};

export const OrgEntity = {
  table: ORG_TABLE,
  columns: ORG_COLUMNS,
};

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(255),
  code: z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain letters, numbers, underscores and hyphens').optional(),
  description: z.string().trim().max(1000).optional(),
  is_active: z.boolean().optional().default(true),
});

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  code: z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
  description: z.string().trim().max(1000).optional(),
  is_active: z.boolean().optional(),
});
