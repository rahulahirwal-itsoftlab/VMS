import prisma from '../../config/prisma.js';
import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import { ROLES } from '../../zodSchema/index.js';
import { USER_ACCOUNT_STATUS } from '../users/user-status.constants.js';
import { VENDOR_APPROVAL_STATUS, VENDOR_STATUS } from '../vendors/vendor.constants.js';
import { COMPANY_CONFIG } from '../../config/company.js';
import { ROLE_HIERARCHY } from '../users/user-role-hierarchy.constants.js';

const formatRoleLabel = (role) =>
  String(role || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const canRequesterAssignRole = (requesterRole, targetRole) => {
  if (requesterRole === ROLES.SUPER_ADMIN) return true;
  const requesterRank = ROLE_HIERARCHY[requesterRole] || 0;
  const targetRank = ROLE_HIERARCHY[targetRole] || 0;
  return targetRole !== ROLES.SUPER_ADMIN && targetRank > 0 && targetRank < requesterRank;
};

class LookupController {
  /**
   * GET /api/v1/lookups/roles
   * Returns list of system roles with descriptions.
   */
  getRoles = asyncHandler(async (req, res) => {
    const requesterRole = req.user?.role;
    const roleList = Object.values(ROLES)
      .filter((role) => canRequesterAssignRole(requesterRole, role))
      .map((role) => ({
      id: role,
      name: formatRoleLabel(role),
      value: role,
    }));
    
    res.status(200).json({
      success: true,
      data: roleList,
    });
  });

  /**
   * GET /api/v1/lookups/vendors
   * Returns approved, active vendors with search support.
   */
  getVendors = asyncHandler(async (req, res) => {
    const { search } = req.query;

    const where = {
      status: VENDOR_STATUS.ACTIVE,
      approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
      is_active: true,
      deleted_at: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { vendor_code: { contains: search, mode: 'insensitive' } },
          { tax_id: { contains: search, mode: 'insensitive' } },
          { gst_number: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const vendors = await prisma.vendor.findMany({
      where,
      select: {
        id: true,
        name: true,
        vendor_code: true,
        tax_id: true,
        gst_number: true,
        category: true,
        vendor_type: true,
        tax_type: true,
        address: true,
        address_line1: true,
        address_line2: true,
        city: true,
        district: true,
        state: true,
        country: true,
        zip_code: true,
        contact_person: true,
        contact_designation: true,
        email: true,
        phone: true,
        alternate_phone: true,
        bank_name: true,
        account_holder: true,
        bank_account_no: true,
        ifsc_code: true,
        bank_branch: true,
      },
      orderBy: { name: 'asc' },
      take: 50, // Cap lookup list
    });

    const formatted = vendors.map(v => {
      const gstVal = v.tax_id || v.gst_number || null;
      const addrVal = [v.address_line1 || v.address, v.address_line2, v.city, v.district, v.state, v.zip_code, v.country].filter(Boolean).join(', ') || null;
      return {
        id: v.id,
        name: `${v.vendor_code} - ${v.name}${gstVal ? ` | GST: ${gstVal}` : ''}${v.category ? ` | ${v.category}` : ''}`,
        vendorCode: v.vendor_code,
        vendorName: v.name,
        companyName: v.name,
        gst: gstVal,
        gstNumber: gstVal,
        vendorGst: gstVal,
        taxId: v.tax_id,
        category: v.category || null,
        vendorCategory: v.category || null,
        vendorType: v.vendor_type || null,
        taxType: v.tax_type || null,
        vendorTaxType: v.tax_type || null,
        address: addrVal,
        vendorAddress: addrVal,
        addressLine1: v.address_line1 || v.address || null,
        addressLine2: v.address_line2 || null,
        district: v.district || null,
        country: v.country || null,
        contactPerson: v.contact_person || null,
        vendorContactPerson: v.contact_person || null,
        contactDesignation: v.contact_designation || null,
        email: v.email || null,
        vendorEmail: v.email || null,
        phone: v.phone || null,
        vendorPhone: v.phone || null,
        alternatePhone: v.alternate_phone || null,
        state: v.state || null,
        vendorState: v.state || null,
        bankName: v.bank_name || null,
        vendorBankName: v.bank_name || null,
        accountHolder: v.account_holder || null,
        vendorAccountHolder: v.account_holder || null,
        bankAccountNo: v.bank_account_no || null,
        vendorBankAccountNo: v.bank_account_no || null,
        ifscCode: v.ifsc_code || null,
        vendorIfscCode: v.ifsc_code || null,
        bankBranch: v.bank_branch || null,
        vendorBankBranch: v.bank_branch || null,
        value: v.id,
      };
    });

    res.status(200).json({
      success: true,
      data: formatted,
    });
  });

  /**
   * GET /api/v1/lookups/managers
   * Returns active manager-role users for generic filters and audit screens.
   */
  getManagers = asyncHandler(async (req, res) => {
    const { search } = req.query;

    const where = {
      status: USER_ACCOUNT_STATUS.ACTIVE,
      deleted_at: null,
      role: { in: [ROLES.MANAGER, ROLES.FINANCE_HEAD] },
      ...(search && {
        OR: [
          { first_name: { contains: search, mode: 'insensitive' } },
          { last_name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { employee_id: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        employee_id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        status: true,
      },
      orderBy: [{ role: 'asc' }, { first_name: 'asc' }, { email: 'asc' }],
    });

    const formatted = users.map(u => ({
      id: u.id,
      name: `${u.first_name || ''} ${u.last_name || ''} (${u.role})`.trim(),
      email: u.email,
      role: u.role,
      status: u.status,
      employeeId: u.employee_id,
      value: u.id,
    }));

    res.status(200).json({
      success: true,
      data: formatted,
    });
  });

  /**
   * GET /api/v1/lookups/teams
   */
  getTeams = asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      data: [],
    });
  });

  /**
   * GET /api/v1/lookups/branches
   */
  getBranches = asyncHandler(async (req, res) => {
    const branches = await prisma.user.findMany({
      where: { deleted_at: null, branch: { not: null } },
      distinct: ['branch'],
      select: { branch: true },
      orderBy: { branch: 'asc' },
    });
    res.status(200).json({
      success: true,
      data: branches
        .filter((item) => item.branch)
        .map((item) => ({ id: item.branch, name: item.branch, value: item.branch })),
    });
  });

  /**
   * GET /api/v1/lookups/regions
   */
  getRegions = asyncHandler(async (req, res) => {
    const regions = await prisma.user.findMany({
      where: { deleted_at: null, region: { not: null } },
      distinct: ['region'],
      select: { region: true },
      orderBy: { region: 'asc' },
    });
    res.status(200).json({
      success: true,
      data: regions
        .filter((item) => item.region)
        .map((item) => ({ id: item.region, name: item.region, value: item.region })),
    });
  });

  /**
   * GET /api/v1/lookups/designations
   */
  getDesignations = asyncHandler(async (req, res) => {
    const designations = await prisma.user.findMany({
      where: { deleted_at: null, designation: { not: null } },
      distinct: ['designation'],
      select: { designation: true },
      orderBy: { designation: 'asc' },
    });
    res.status(200).json({
      success: true,
      data: designations
        .filter((item) => item.designation)
        .map((item) => ({ id: item.designation, name: item.designation, value: item.designation })),
    });
  });

  /**
   * GET /api/v1/lookups/company
   * Returns enterprise company master information.
   */
  getCompanyInfo = asyncHandler(async (req, res) => {
    res.status(200).json({
      success: true,
      data: COMPANY_CONFIG,
    });
  });
}

export default new LookupController();

