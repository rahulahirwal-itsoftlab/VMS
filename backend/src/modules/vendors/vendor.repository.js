import prisma from '../../config/prisma.js';

const vendorInclude = {
  created_by: {
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
  },
  approved_by: {
    select: { id: true, email: true, first_name: true, last_name: true, role: true },
  },
  documents: {
    where: { deleted_at: null, status: 'ACTIVE' },
    orderBy: { uploaded_at: 'desc' },
    include: {
      uploaded_by: {
        select: { id: true, email: true, first_name: true, last_name: true, role: true },
      },
    },
  },
};

class VendorRepository {
  async create(data) {
    return prisma.vendor.create({ data, include: vendorInclude });
  }

  async findAll({ where, skip, take, orderBy = { created_at: 'desc' } }) {
    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        skip,
        take,
        orderBy,
        include: vendorInclude,
      }),
      prisma.vendor.count({ where }),
    ]);

    return { vendors, total };
  }

  async findById(id) {
    return prisma.vendor.findFirst({
      where: { id, deleted_at: null },
      include: vendorInclude,
    });
  }

  async update(id, data) {
    return prisma.vendor.update({
      where: { id },
      data,
      include: vendorInclude,
    });
  }

  async softDelete(id) {
    return prisma.vendor.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
      include: vendorInclude,
    });
  }

  async transaction(callback) {
    return prisma.$transaction(callback);
  }
}

export default new VendorRepository();
