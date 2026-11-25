import prisma from '../../config/prisma.js';

class OrgRepository {
  async create(data) {
    return prisma.org.create({ data });
  }

  async findAll({ where = {}, skip, take, orderBy = { created_at: 'desc' } } = {}) {
    const finalWhere = { deleted_at: null, ...where };
    const [orgs, total] = await Promise.all([
      prisma.org.findMany({
        where: finalWhere,
        skip,
        take,
        orderBy,
      }),
      prisma.org.count({ where: finalWhere }),
    ]);

    return { orgs, total };
  }

  async findById(id) {
    return prisma.org.findFirst({
      where: { id, deleted_at: null },
    });
  }

  async findByCode(code) {
    if (!code) return null;
    return prisma.org.findFirst({
      where: { code, deleted_at: null },
    });
  }

  async update(id, data) {
    return prisma.org.update({
      where: { id },
      data,
    });
  }

  async softDelete(id) {
    return prisma.org.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });
  }

  async count(where = {}) {
    return prisma.org.count({ where: { deleted_at: null, ...where } });
  }
}

export default new OrgRepository();
