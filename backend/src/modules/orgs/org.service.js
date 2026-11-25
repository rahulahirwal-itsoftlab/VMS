import orgRepository from './org.repository.js';
import ApiError from '../../utils/ApiError.js';
import { ROLES } from '../../zodSchema/index.js';

class OrgService {
  async createOrg(payload, currentUser) {
    if (currentUser?.role !== ROLES.SUPER_ADMIN) {
      throw new ApiError(403, 'Only Super Admin can create new organizations.');
    }

    if (payload.code) {
      const existing = await orgRepository.findByCode(payload.code);
      if (existing) {
        throw new ApiError(400, `An organization with code '${payload.code}' already exists.`);
      }
    }

    const org = await orgRepository.create({
      name: payload.name.trim(),
      code: payload.code ? payload.code.trim().toUpperCase() : null,
      description: payload.description ? payload.description.trim() : null,
      is_active: payload.is_active ?? true,
    });

    return {
      ...org,
      OrgID: org.id,
      org_id: org.id,
    };
  }

  async listOrgs(query = {}, currentUser) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};

    // Non-Super Admin can only see their own organization
    if (currentUser?.role !== ROLES.SUPER_ADMIN) {
      const userOrgId = currentUser?.org_id || currentUser?.OrgID;
      if (!userOrgId) {
        return { orgs: [], total: 0, page, limit, totalPages: 0 };
      }
      where.id = userOrgId;
    } else if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.status === 'active') where.is_active = true;
    if (query.status === 'inactive') where.is_active = false;

    const { orgs, total } = await orgRepository.findAll({
      where,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    });

    const mappedOrgs = orgs.map((org) => ({
      ...org,
      OrgID: org.id,
      org_id: org.id,
    }));

    return {
      orgs: mappedOrgs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOrgById(id, currentUser) {
    if (currentUser?.role !== ROLES.SUPER_ADMIN) {
      const userOrgId = currentUser?.org_id || currentUser?.OrgID;
      if (userOrgId !== id) {
        throw new ApiError(403, 'Access denied. You can only view your own organization.');
      }
    }

    const org = await orgRepository.findById(id);
    if (!org) {
      throw new ApiError(404, 'Organization not found.');
    }

    return {
      ...org,
      OrgID: org.id,
      org_id: org.id,
    };
  }

  async getCurrentOrg(currentUser) {
    const orgId = currentUser?.org_id || currentUser?.OrgID;
    if (!orgId) {
      // Fallback: fetch first active org
      const { orgs } = await orgRepository.findAll({ take: 1, orderBy: { created_at: 'asc' } });
      if (orgs.length > 0) {
        return { ...orgs[0], OrgID: orgs[0].id, org_id: orgs[0].id };
      }
      throw new ApiError(404, 'No organization associated with this session.');
    }

    const org = await orgRepository.findById(orgId);
    if (!org) {
      throw new ApiError(404, 'User organization not found.');
    }

    return {
      ...org,
      OrgID: org.id,
      org_id: org.id,
    };
  }

  async updateOrg(id, payload, currentUser) {
    if (currentUser?.role !== ROLES.SUPER_ADMIN) {
      const userOrgId = currentUser?.org_id || currentUser?.OrgID;
      if (userOrgId !== id) {
        throw new ApiError(403, 'Access denied. You can only update your own organization.');
      }
    }

    const existing = await orgRepository.findById(id);
    if (!existing) {
      throw new ApiError(404, 'Organization not found.');
    }

    if (payload.code && payload.code !== existing.code) {
      const conflict = await orgRepository.findByCode(payload.code);
      if (conflict && conflict.id !== id) {
        throw new ApiError(400, `Organization code '${payload.code}' is already taken.`);
      }
    }

    const updated = await orgRepository.update(id, {
      ...(payload.name ? { name: payload.name.trim() } : {}),
      ...(payload.code ? { code: payload.code.trim().toUpperCase() } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.is_active !== undefined ? { is_active: payload.is_active } : {}),
    });

    return {
      ...updated,
      OrgID: updated.id,
      org_id: updated.id,
    };
  }

  async deleteOrg(id, currentUser) {
    if (currentUser?.role !== ROLES.SUPER_ADMIN) {
      throw new ApiError(403, 'Only Super Admin can delete organizations.');
    }

    const existing = await orgRepository.findById(id);
    if (!existing) {
      throw new ApiError(404, 'Organization not found.');
    }

    await orgRepository.softDelete(id);
    return { success: true, message: 'Organization deleted successfully.' };
  }
}

export default new OrgService();
