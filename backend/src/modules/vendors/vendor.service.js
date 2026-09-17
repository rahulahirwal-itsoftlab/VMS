import ApiError from '../../utils/ApiError.js';
import vendorRepository from './vendor.repository.js';
import approvalRepository from '../approvals/approval.repository.js';
import notificationService from '../notifications/notification.service.js';
import { ROLES } from '../../zodSchema/index.js';
import {
  VENDOR_MESSAGES,
  VENDOR_APPROVAL_STATUS,
  VENDOR_PENDING_CHANGE_STATUS,
  VENDOR_REQUIRED_APPROVAL_FIELDS,
  VENDOR_REQUIRED_DOCUMENT_TYPES,
  VENDOR_REVIEW_ACTION,
  VENDOR_STATUS,
  isVendorApprovedAndActive,
  normalizeVendorStatusFilter,
} from './vendor.constants.js';
import prisma from '../../config/prisma.js';
import { removeUploadedFile } from './vendor-document.upload.js';

const VENDOR_DOCUMENT_TYPES = {
  GST_CERTIFICATE: 'GST Certificate',
  PAN_CARD: 'PAN Card',
  VENDOR_AGREEMENT: 'Vendor Agreement',
  CANCELLED_CHEQUE: 'Cancelled Cheque',
  MSME_CERTIFICATE: 'MSME Certificate',
  BANK_PROOF: 'Bank Proof',
  ADDITIONAL_DOCUMENT: 'Additional Document',
};

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const accountNumberRegex = /^\d{9,18}$/;

const ensureVendorCodeSequence = async () => {
  await prisma.$executeRaw`
    CREATE SEQUENCE IF NOT EXISTS vendor_code_seq START WITH 1 INCREMENT BY 1
  `;

  await prisma.$executeRaw`
    DO $$
    DECLARE
      max_vendor_code bigint;
      sequence_last_value bigint;
    BEGIN
      SELECT COALESCE(MAX((regexp_match(vendor_code, '^VND-([0-9]+)$'))[1]::bigint), 0)
      INTO max_vendor_code
      FROM vendors
      WHERE vendor_code ~ '^VND-[0-9]+$';

      SELECT last_value
      INTO sequence_last_value
      FROM vendor_code_seq;

      IF max_vendor_code > sequence_last_value THEN
        PERFORM setval('vendor_code_seq', max_vendor_code, true);
      ELSIF sequence_last_value < 1 THEN
        PERFORM setval('vendor_code_seq', 1, false);
      END IF;
    END $$;
  `;
};

const generateVendorCode = async () => {
  try {
    const rows = await prisma.$queryRaw`SELECT nextval('vendor_code_seq')::bigint AS value`;
    const nextValue = Number(rows?.[0]?.value || 0);
    return `VND-${String(nextValue).padStart(6, '0')}`;
  } catch (error) {
    if (error?.code !== 'P2010' || !String(error?.message || '').includes('vendor_code_seq')) {
      throw error;
    }

    await ensureVendorCodeSequence();
  }

  const rows = await prisma.$queryRaw`SELECT nextval('vendor_code_seq')::bigint AS value`;
  const nextValue = Number(rows?.[0]?.value || 0);
  return `VND-${String(nextValue).padStart(6, '0')}`;
};

const mapVendorData = (data, userId, vendorCode) => ({
  name: data.name,
  vendor_code: vendorCode,
  email: data.email,
  phone: data.phone,
  alternate_phone: data.alternatePhone,
  address: data.address || data.addressLine1,
  address_line1: data.addressLine1 || data.address,
  address_line2: data.addressLine2,
  city: data.city,
  district: data.district,
  state: data.state,
  country: data.country,
  zip_code: data.zipCode,
  tax_id: data.taxId,
  gst_number: data.gstNumber || data.taxId,
  pan_number: data.panNumber,
  cin: data.cin,
  msme_number: data.msmeNumber,
  tax_type: data.taxType,
  category: data.category,
  vendor_type: data.vendorType,
  contact_person: data.contactPerson,
  contact_designation: data.contactDesignation,
  bank_name: data.bankName,
  account_holder: data.accountHolder,
  bank_account_no: data.bankAccountNo,
  ifsc_code: data.ifscCode,
  bank_branch: data.bankBranch,
  payment_terms: data.paymentTerms,
  status: VENDOR_STATUS.PENDING,
  approval_status: VENDOR_APPROVAL_STATUS.PENDING_APPROVAL,
  is_active: false,
  created_by_id: userId,
});

const VENDOR_TRANSITIONS = {
  [VENDOR_STATUS.PENDING]: [VENDOR_STATUS.ACTIVE, VENDOR_STATUS.INACTIVE, VENDOR_STATUS.BLOCKED],
  [VENDOR_STATUS.BLOCKED]: [VENDOR_STATUS.PENDING, VENDOR_STATUS.INACTIVE],
  [VENDOR_STATUS.INACTIVE]: [VENDOR_STATUS.PENDING],
  [VENDOR_STATUS.APPROVED]: [VENDOR_STATUS.BLOCKED],
};

const canonicalVendorStatus = (status) => normalizeVendorStatusFilter(status)?.status || status;

export const canTransitionVendorStatus = (currentStatus, nextStatus) => {
  const current = canonicalVendorStatus(currentStatus);
  const next = canonicalVendorStatus(nextStatus);
  return (VENDOR_TRANSITIONS[current] || []).includes(next);
};

export const canTransitionVendorReviewStatus = canTransitionVendorStatus;

const buildReviewRemarks = (body = {}) =>
  [body.reason, body.correctiveAction, body.remarks]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' | ');

const getReviewActionForStatus = (status, body = {}) => {
  const canonicalStatus = canonicalVendorStatus(status);
  if (canonicalStatus === VENDOR_STATUS.ACTIVE) return VENDOR_REVIEW_ACTION.APPROVE;
  if (canonicalStatus === VENDOR_STATUS.INACTIVE) return VENDOR_REVIEW_ACTION.REJECT;
  if (canonicalStatus === VENDOR_STATUS.BLOCKED) {
    return body.action === VENDOR_REVIEW_ACTION.BLOCK ? VENDOR_REVIEW_ACTION.BLOCK : VENDOR_REVIEW_ACTION.HOLD;
  }
  if (canonicalStatus === VENDOR_STATUS.PENDING) return VENDOR_REVIEW_ACTION.RETURN_TO_PENDING;
  return `vendor_${status}`;
};

const buildVendorStatusFilter = (status) => {
  const filter = normalizeVendorStatusFilter(status);
  if (!filter) return {};
  return filter;
};

const buildVendorStatusData = (status, userId, now, remarks = null) => {
  const canonicalStatus = canonicalVendorStatus(status);
  const isApproved = canonicalStatus === VENDOR_STATUS.ACTIVE;
  const isRejected = canonicalStatus === VENDOR_STATUS.INACTIVE;
  const isBlocked = canonicalStatus === VENDOR_STATUS.BLOCKED;
  const isPending = canonicalStatus === VENDOR_STATUS.PENDING;

  return {
    status: canonicalStatus,
    approval_status: isApproved
      ? VENDOR_APPROVAL_STATUS.APPROVED
      : isRejected
        ? VENDOR_APPROVAL_STATUS.REJECTED
        : isBlocked
          ? VENDOR_APPROVAL_STATUS.BLOCKED
          : VENDOR_APPROVAL_STATUS.PENDING_APPROVAL,
    approval_remarks: remarks || null,
    is_active: isApproved,
    approved_by_id: isApproved ? userId : null,
    approved_at: isApproved ? now : null,
    activated_at: isApproved ? now : null,
    rejected_at: isRejected ? now : null,
    blocked_at: isBlocked ? now : null,
    ...(isPending && { activated_at: null }),
  };
};

const getEffectiveVendorForReview = (vendor) => ({
  ...vendor,
  ...(vendor?.pending_changes || {}),
});

const getVendorApprovalReadiness = (vendor) => {
  const effectiveVendor = getEffectiveVendorForReview(vendor);
  const missing = [];
  const invalid = [];
  for (const field of VENDOR_REQUIRED_APPROVAL_FIELDS) {
    if (field.key === 'tax') {
      if (!effectiveVendor.tax_id && !effectiveVendor.gst_number) missing.push(field.label);
    } else if (!effectiveVendor[field.key]) {
      missing.push(field.label);
    }
  }
  const documents = Array.isArray(vendor.documents) ? vendor.documents : [];
  const activeDocumentTypes = new Set(
    documents
      .filter((document) => !document.deleted_at && document.status === 'ACTIVE')
      .map((document) => document.document_type),
  );
  const missingDocuments = VENDOR_REQUIRED_DOCUMENT_TYPES
    .filter((document) => !activeDocumentTypes.has(document.type))
    .map((document) => document.label);

  const gst = effectiveVendor.tax_id || effectiveVendor.gst_number;
  if (gst && !gstRegex.test(String(gst).toUpperCase())) invalid.push('GST Number Invalid');
  if (effectiveVendor.pan_number && !panRegex.test(String(effectiveVendor.pan_number).toUpperCase())) invalid.push('PAN Number Invalid');
  if (effectiveVendor.ifsc_code && !ifscRegex.test(String(effectiveVendor.ifsc_code).toUpperCase())) invalid.push('IFSC Invalid');
  if (effectiveVendor.bank_account_no && !accountNumberRegex.test(String(effectiveVendor.bank_account_no))) invalid.push('Account Number Invalid');

  const reasons = [
    ...missing.map((field) => `Missing ${field}`),
    ...missingDocuments.map((document) => `Missing ${document}`),
    ...invalid,
  ];

  return {
    ready: reasons.length === 0,
    missing,
    missingDocuments,
    invalid,
    reasons,
    documents: {
      supported: true,
      uploaded: documents.length,
      required: VENDOR_REQUIRED_DOCUMENT_TYPES.map((document) => document.type),
    },
    bankVerification: {
      supported: false,
      status: effectiveVendor.bank_account_no && effectiveVendor.ifsc_code ? 'bank_details_present' : 'missing_bank_details',
    },
  };
};

const requireVendorApprovalReadiness = (vendor) => {
  const readiness = getVendorApprovalReadiness(vendor);
  if (!readiness.ready) {
    throw new ApiError(400, `Vendor cannot be approved until required information is complete: ${readiness.reasons.join(', ')}.`);
  }
};

const requireVendorReviewInputs = (reviewAction, body = {}) => {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const correctiveAction = typeof body.correctiveAction === 'string' ? body.correctiveAction.trim() : '';
  const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';

  if (reviewAction === VENDOR_REVIEW_ACTION.REJECT && !reason) {
    throw new ApiError(400, 'Rejection reason is required.');
  }

  if (reviewAction === VENDOR_REVIEW_ACTION.HOLD) {
    if (!reason) {
      throw new ApiError(400, 'Hold reason is required.');
    }
    if (!correctiveAction) {
      throw new ApiError(400, 'Corrective action is required before placing a vendor on hold.');
    }
  }

  if (reviewAction === VENDOR_REVIEW_ACTION.BLOCK && !reason) {
    throw new ApiError(400, 'Block reason is required.');
  }

  if (reviewAction === VENDOR_REVIEW_ACTION.RETURN_TO_PENDING && !reason && !remarks) {
    throw new ApiError(400, 'Reason is required to return a vendor to pending review.');
  }
};

const buildPendingChangePayload = (payload) => {
  const updateData = {};
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.email !== undefined) updateData.email = payload.email;
  if (payload.phone !== undefined) updateData.phone = payload.phone;
  if (payload.address !== undefined) updateData.address = payload.address;
  if (payload.addressLine1 !== undefined) updateData.address_line1 = payload.addressLine1;
  if (payload.addressLine2 !== undefined) updateData.address_line2 = payload.addressLine2;
  if (payload.city !== undefined) updateData.city = payload.city;
  if (payload.district !== undefined) updateData.district = payload.district;
  if (payload.state !== undefined) updateData.state = payload.state;
  if (payload.country !== undefined) updateData.country = payload.country;
  if (payload.zipCode !== undefined) updateData.zip_code = payload.zipCode;
  if (payload.taxId !== undefined) updateData.tax_id = payload.taxId;
  if (payload.gstNumber !== undefined) updateData.gst_number = payload.gstNumber || payload.taxId;
  if (payload.panNumber !== undefined) updateData.pan_number = payload.panNumber;
  if (payload.cin !== undefined) updateData.cin = payload.cin;
  if (payload.msmeNumber !== undefined) updateData.msme_number = payload.msmeNumber;
  if (payload.taxType !== undefined) updateData.tax_type = payload.taxType;
  if (payload.category !== undefined) updateData.category = payload.category;
  if (payload.vendorType !== undefined) updateData.vendor_type = payload.vendorType;
  if (payload.contactPerson !== undefined) updateData.contact_person = payload.contactPerson;
  if (payload.contactDesignation !== undefined) updateData.contact_designation = payload.contactDesignation;
  if (payload.alternatePhone !== undefined) updateData.alternate_phone = payload.alternatePhone;
  if (payload.bankName !== undefined) updateData.bank_name = payload.bankName;
  if (payload.accountHolder !== undefined) updateData.account_holder = payload.accountHolder;
  if (payload.bankAccountNo !== undefined) updateData.bank_account_no = payload.bankAccountNo;
  if (payload.ifscCode !== undefined) updateData.ifsc_code = payload.ifscCode;
  if (payload.bankBranch !== undefined) updateData.bank_branch = payload.bankBranch;
  if (payload.paymentTerms !== undefined) updateData.payment_terms = payload.paymentTerms;
  return updateData; 
};

const buildCreatedAtRange = (query) => {
  if (!query.startDate && !query.endDate) return {};
  return {
    created_at: {
      ...(query.startDate && { gte: new Date(query.startDate) }),
      ...(query.endDate && { lte: new Date(query.endDate) }),
    },
  };
};

const ensureVendorIsUnique = async (payload, excludeId = null) => {
  const cleanName = payload.name ? String(payload.name).trim() : '';
  const cleanEmail = payload.email ? String(payload.email).trim() : '';
  const cleanTaxId = payload.taxId ? String(payload.taxId).trim() : (payload.gstNumber ? String(payload.gstNumber).trim() : '');
  const cleanGst = payload.gstNumber ? String(payload.gstNumber).trim() : (payload.taxId ? String(payload.taxId).trim() : '');
  const cleanPan = payload.panNumber ? String(payload.panNumber).trim() : '';

  const checks = [
    cleanName && { name: { equals: cleanName, mode: 'insensitive' } },
    cleanEmail && { email: { equals: cleanEmail, mode: 'insensitive' } },
    cleanTaxId && { tax_id: { equals: cleanTaxId, mode: 'insensitive' } },
    cleanGst && { gst_number: { equals: cleanGst, mode: 'insensitive' } },
    cleanPan && { pan_number: { equals: cleanPan, mode: 'insensitive' } },
  ].filter(Boolean);

  if (!checks.length) return;

  const existingVendors = await prisma.vendor.findMany({
    where: {
      deleted_at: null,
      OR: checks,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      tax_id: true,
      gst_number: true,
      pan_number: true,
    },
  });

  if (!existingVendors.length) return;

  const errors = {};
  const duplicateMessages = [];

  for (const vendor of existingVendors) {
    if (cleanEmail && vendor.email && vendor.email.toLowerCase() === cleanEmail.toLowerCase()) {
      errors.email = 'A vendor with this email already exists.';
      if (!duplicateMessages.includes('email')) duplicateMessages.push('email');
    }

    const vGst = (vendor.gst_number || vendor.tax_id || '').toUpperCase();
    const pGst = (cleanGst || cleanTaxId).toUpperCase();
    if (pGst && vGst && pGst === vGst) {
      const msg = 'A vendor with this GST number already exists.';
      errors.gstNumber = msg;
      errors.gst = msg;
      errors.taxId = msg;
      if (!duplicateMessages.includes('GST / Tax ID')) duplicateMessages.push('GST / Tax ID');
    }

    if (cleanPan && vendor.pan_number && vendor.pan_number.toUpperCase() === cleanPan.toUpperCase()) {
      const msg = 'A vendor with this PAN number already exists.';
      errors.panNumber = msg;
      errors.pan = msg;
      if (!duplicateMessages.includes('PAN')) duplicateMessages.push('PAN');
    }

    if (cleanName && vendor.name && vendor.name.toLowerCase() === cleanName.toLowerCase()) {
      const msg = 'A vendor with this company name already exists.';
      errors.companyName = msg;
      errors.name = msg;
      if (!duplicateMessages.includes('company name')) duplicateMessages.push('company name');
    }
  }

  const conflictDesc = duplicateMessages.length
    ? `Vendor with the same ${duplicateMessages.join(' and ')} already exists.`
    : VENDOR_MESSAGES.DUPLICATE;

  const apiError = new ApiError(409, conflictDesc);
  apiError.code = 'VENDOR_DUPLICATE';
  apiError.errors = Object.keys(errors).length ? errors : { vendor: VENDOR_MESSAGES.DUPLICATE };
  throw apiError;
};

class VendorService {
  async createVendor(payload, user) {
    try {
      await ensureVendorIsUnique(payload);
      const vendorCode = await generateVendorCode();
      const vendor = await vendorRepository.create(mapVendorData(payload, user.id, vendorCode));
      notificationService.notifyVendorApprovalRequested(vendor).catch(() => {});
      return vendor;
    } catch (error) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join('.') : String(error.meta?.target || '');
        const errors = {};
        if (target.includes('email')) errors.email = 'A vendor with this email already exists.';
        if (target.includes('gst_number') || target.includes('tax_id')) {
          const msg = 'A vendor with this GST number already exists.';
          errors.gstNumber = msg;
          errors.gst = msg;
          errors.taxId = msg;
        }
        if (target.includes('vendor_code')) errors.vendorCode = 'Vendor code already exists.';
        if (target.includes('pan_number')) {
          const msg = 'A vendor with this PAN number already exists.';
          errors.panNumber = msg;
          errors.pan = msg;
        }

        const apiError = new ApiError(409, 'Vendor already exists with duplicate details.');
        apiError.code = 'VENDOR_DUPLICATE';
        apiError.errors = Object.keys(errors).length ? errors : { vendor: VENDOR_MESSAGES.DUPLICATE };
        throw apiError;
      }
      throw error;
    }
  }

  async listVendors(query, user) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 10);
    const where = {
      deleted_at: null,
      ...buildCreatedAtRange(query),
      ...buildVendorStatusFilter(query.status),
      ...(query.category && { category: query.category }),
      ...(user.role === ROLES.CASE_MANAGER && { created_by_id: user.id }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { vendor_code: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { tax_id: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const result = await vendorRepository.findAll({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [query.sortField || 'created_at']: query.sortOrder || 'desc' },
    });

    const [pending, approved, rejected, blocked] = await Promise.all([
      prisma.vendor.count({ where: { deleted_at: null, status: VENDOR_STATUS.PENDING } }),
      prisma.vendor.count({
        where: {
          deleted_at: null,
          status: VENDOR_STATUS.ACTIVE,
          approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
          is_active: true,
        },
      }),
      prisma.vendor.count({
        where: {
          deleted_at: null,
          status: VENDOR_STATUS.INACTIVE,
          approval_status: VENDOR_APPROVAL_STATUS.REJECTED,
        },
      }),
      prisma.vendor.count({ where: { deleted_at: null, status: VENDOR_STATUS.BLOCKED } }),
    ]);

    return {
      ...result,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
      summary: { pending, approved, rejected, blocked, onHold: blocked },
    };
  }

  async getVendorById(id, user) {
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError(404, VENDOR_MESSAGES.NOT_FOUND);
    }

    if (user.role === ROLES.CASE_MANAGER && vendor.created_by_id !== user.id) {
      throw new ApiError(403, 'You can only access vendors created by you.');
    }

    return {
      ...vendor,
      approvalReadiness: getVendorApprovalReadiness(vendor),
      pendingChangeSummary: vendor.pending_changes || null,
    };
  }

  async updateVendor(id, payload, user) {
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError(404, VENDOR_MESSAGES.NOT_FOUND);
    }

    if (user.role === ROLES.CASE_MANAGER && vendor.created_by_id !== user.id) {
      throw new ApiError(403, 'You can only update vendors created by you.');
    }

    const updateData = buildPendingChangePayload(payload);
    if (payload.status !== undefined && user.role === ROLES.FINANCE_HEAD) {
      Object.assign(updateData, buildVendorStatusData(payload.status, user.id, new Date()));
    }

    try {
      await ensureVendorIsUnique(payload, id);
      if (isVendorApprovedAndActive(vendor) && user.role === ROLES.CASE_MANAGER) {
        const pendingChanges = {
          ...(vendor.pending_changes || {}),
          ...updateData,
        };

        const updatedVendor = await vendorRepository.transaction(async (tx) => {
          const updated = await tx.vendor.update({
            where: { id },
            data: {
              pending_changes: pendingChanges,
              pending_change_status: VENDOR_PENDING_CHANGE_STATUS.PENDING_APPROVAL,
              pending_change_requested_by_id: user.id,
              pending_change_requested_at: new Date(),
              approval_remarks: null,
            },
            include: {
              created_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
              approved_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
              documents: {
                where: { deleted_at: null, status: 'ACTIVE' },
                orderBy: { uploaded_at: 'desc' },
                include: { uploaded_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } } },
              },
            },
          });

          await tx.auditLog.create({
            data: {
              entity_type: 'vendor',
              entity_id: id,
              action: 'vendor_change_submitted',
              from_status: vendor.approval_status,
              to_status: VENDOR_PENDING_CHANGE_STATUS.PENDING_APPROVAL,
              performed_by_id: user.id,
              old_value: Object.fromEntries(Object.keys(updateData).map((key) => [key, vendor[key] ?? null])),
              new_value: pendingChanges,
            },
          });

          await tx.approvalLog.create({
            data: {
              entity_type: 'vendor',
              entity_id: id,
              action: 'submitted',
              from_status: vendor.approval_status,
              to_status: VENDOR_PENDING_CHANGE_STATUS.PENDING_APPROVAL,
              performed_by_id: user.id,
              remarks: 'Approved vendor changes submitted for Finance Head review.',
            },
          });

          return updated;
        });

        notificationService.notifyVendorApprovalRequested(updatedVendor).catch(() => {});
        return {
          ...updatedVendor,
          approvalReadiness: getVendorApprovalReadiness(updatedVendor),
          pendingChangeSummary: pendingChanges,
        };
      }

      const updatedVendor = await vendorRepository.transaction(async (tx) => {
        const updated = await tx.vendor.update({
          where: { id },
          data: updateData,
          include: {
            created_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
            approved_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
            documents: {
              where: { deleted_at: null, status: 'ACTIVE' },
              orderBy: { uploaded_at: 'desc' },
              include: { uploaded_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } } },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            entity_type: 'vendor',
            entity_id: id,
            action: 'vendor_updated',
            performed_by_id: user.id,
            old_value: Object.fromEntries(
              Object.keys(updateData).map((key) => [key, vendor[key] ?? null]),
            ),
            new_value: updateData,
          },
        });

        return updated;
      });
      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
      notificationService.notifyVendorUpdated(updatedVendor, actorName).catch(() => {});
      return updatedVendor;
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ApiError(409, VENDOR_MESSAGES.DUPLICATE);
      }
      throw error;
    }
  }

  async changeVendorStatus(id, status, user, body = {}) {
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError(404, VENDOR_MESSAGES.NOT_FOUND);
    }

    const nextStatus = canonicalVendorStatus(status);
    const currentStatus = canonicalVendorStatus(vendor.status);

    const isPendingChangeApproval = Boolean(vendor.pending_changes) && nextStatus === VENDOR_STATUS.ACTIVE;
    const isPendingChangeRejection = Boolean(vendor.pending_changes) && nextStatus === VENDOR_STATUS.INACTIVE;

    if (!isPendingChangeApproval && !isPendingChangeRejection && !canTransitionVendorReviewStatus(currentStatus, nextStatus)) {
      throw new ApiError(409, `Vendor cannot transition from ${vendor.status} to ${status}.`);
    }

    const reviewAction = getReviewActionForStatus(status, body);
    const remarks = buildReviewRemarks(body);
    requireVendorReviewInputs(reviewAction, body);

    const now = new Date();
    const statusData = isPendingChangeRejection
      ? {
          status: vendor.status,
          approval_status: vendor.approval_status,
          approval_remarks: remarks || null,
          is_active: vendor.is_active,
          approved_by_id: vendor.approved_by_id,
          approved_at: vendor.approved_at,
          activated_at: vendor.activated_at,
          rejected_at: vendor.rejected_at,
          blocked_at: vendor.blocked_at,
        }
      : buildVendorStatusData(nextStatus, user.id, now, remarks);

    if (nextStatus === VENDOR_STATUS.ACTIVE) {
      try {
        requireVendorApprovalReadiness(vendor);
      } catch (error) {
        const readiness = getVendorApprovalReadiness(vendor);
        await prisma.vendor.update({
          where: { id },
          data: {
            approval_status: VENDOR_APPROVAL_STATUS.PENDING_INFORMATION,
            approval_remarks: readiness.reasons.join(' | '),
            pending_change_status: vendor.pending_changes ? VENDOR_PENDING_CHANGE_STATUS.CHANGES_REQUESTED : vendor.pending_change_status,
          },
        });
        throw error;
      }
    }
    const pendingChangesToApply = nextStatus === VENDOR_STATUS.ACTIVE && vendor.pending_changes
      ? vendor.pending_changes
      : {};

    const updatedVendor = await vendorRepository.transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id },
        data: {
          ...pendingChangesToApply,
          ...statusData,
          pending_changes: isPendingChangeRejection ? null : null,
          pending_change_status: nextStatus === VENDOR_STATUS.ACTIVE
            ? null
            : isPendingChangeRejection
              ? VENDOR_PENDING_CHANGE_STATUS.REJECTED
              : statusData.pending_change_status,
          pending_change_requested_by_id: nextStatus === VENDOR_STATUS.ACTIVE
            ? null
            : isPendingChangeRejection
              ? null
              : vendor.pending_change_requested_by_id,
          pending_change_requested_at: nextStatus === VENDOR_STATUS.ACTIVE
            ? null
            : isPendingChangeRejection
              ? null
              : vendor.pending_change_requested_at,
        },
        include: {
          created_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
          approved_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'vendor',
          entity_id: id,
          action: reviewAction === VENDOR_REVIEW_ACTION.HOLD ? 'vendor_on_hold' : `vendor_${reviewAction}`,
          from_status: vendor.status,
          to_status: nextStatus,
          performed_by_id: user.id,
          remarks,
          old_value: {
            status: vendor.status,
            approval_status: vendor.approval_status || null,
            pending_changes: vendor.pending_changes || null,
          },
          new_value: {
            ...statusData,
            appliedChanges: pendingChangesToApply,
            action: reviewAction,
            reason: body.reason || null,
            correctiveAction: body.correctiveAction || null,
            blockCategory: body.blockCategory || null,
            followUpDate: body.followUpDate || null,
            remarks: body.remarks || null,
          },
        },
      });

      await tx.approvalLog.create({
        data: {
          entity_type: 'vendor',
          entity_id: id,
          action: reviewAction,
          from_status: vendor.status,
          to_status: nextStatus,
          performed_by_id: user.id,
          remarks,
        },
      });

      return updated;
    });

    const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
    notificationService.notifyVendorStatusChange(updatedVendor, nextStatus, actorName).catch(() => {});

    return updatedVendor;
  }

  async getVendorReviewHistory(id, user) {
    const vendor = await this.getVendorById(id, user);
    const [approvalLogs, auditLogs] = await Promise.all([
      approvalRepository.findByEntity('vendor', vendor.id),
      prisma.auditLog.findMany({
        where: { entity_type: 'vendor', entity_id: vendor.id },
        orderBy: { created_at: 'desc' },
        include: {
          performed_by: {
            select: { id: true, email: true, first_name: true, last_name: true, role: true },
          },
        },
      }),
    ]);

    const history = [...approvalLogs, ...auditLogs]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((entry) => ({
        id: entry.id,
        action: entry.action,
        from_status: entry.from_status,
        to_status: entry.to_status,
        remarks: entry.remarks,
        created_at: entry.created_at,
        performed_by: entry.performed_by,
      }));

    return { vendorId: vendor.id, history };
  }

  async listVendorDocuments(vendorId, user) {
    await this.getVendorById(vendorId, user);
    return prisma.vendorDocument.findMany({
      where: { vendor_id: vendorId, deleted_at: null, status: 'ACTIVE' },
      orderBy: { uploaded_at: 'desc' },
      include: {
        uploaded_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
      },
    });
  }

  async uploadVendorDocument(vendorId, payload, file, user) {
    if (!file) {
      throw new ApiError(400, 'Document file is required.');
    }

    const vendor = await this.getVendorById(vendorId, user);
    const documentType = payload.documentType;
    const documentName = payload.documentName || VENDOR_DOCUMENT_TYPES[documentType] || 'Vendor Document';
    const fileUrl = `/uploads/vendor-documents/${file.filename}`;

    try {
      return await vendorRepository.transaction(async (tx) => {
        if (documentType !== 'ADDITIONAL_DOCUMENT') {
          await tx.vendorDocument.updateMany({
            where: { vendor_id: vendorId, document_type: documentType, deleted_at: null, status: 'ACTIVE' },
            data: { status: 'REPLACED', deleted_at: new Date(), deleted_by_id: user.id },
          });
        }

        const document = await tx.vendorDocument.create({
          data: {
            vendor_id: vendorId,
            document_name: documentName,
            original_file_name: file.originalname,
            file_url: fileUrl,
            storage_path: file.path,
            document_type: documentType,
            mime_type: file.mimetype,
            file_size: file.size,
            uploaded_by_id: user.id,
          },
          include: {
            uploaded_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            entity_type: 'vendor',
            entity_id: vendorId,
            action: 'vendor_document_uploaded',
            performed_by_id: user.id,
            new_value: {
              documentId: document.id,
              documentType,
              documentName,
              originalFileName: file.originalname,
            },
          },
        });

        return { vendor, document };
      });
    } catch (error) {
      removeUploadedFile(file.path);
      throw error;
    }
  }

  async replaceVendorDocument(vendorId, documentId, payload, file, user) {
    if (!file) {
      throw new ApiError(400, 'Replacement document file is required.');
    }

    await this.getVendorById(vendorId, user);
    const existing = await prisma.vendorDocument.findFirst({
      where: { id: documentId, vendor_id: vendorId, deleted_at: null, status: 'ACTIVE' },
    });

    if (!existing) {
      removeUploadedFile(file.path);
      throw new ApiError(404, 'Vendor document not found.');
    }

    const documentName = payload.documentName || existing.document_name;
    const fileUrl = `/uploads/vendor-documents/${file.filename}`;

    try {
      return await vendorRepository.transaction(async (tx) => {
        const updated = await tx.vendorDocument.update({
          where: { id: documentId },
          data: {
            document_name: documentName,
            original_file_name: file.originalname,
            file_url: fileUrl,
            storage_path: file.path,
            mime_type: file.mimetype,
            file_size: file.size,
            uploaded_by_id: user.id,
            uploaded_at: new Date(),
          },
          include: {
            uploaded_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            entity_type: 'vendor',
            entity_id: vendorId,
            action: 'vendor_document_replaced',
            performed_by_id: user.id,
            old_value: {
              documentId,
              documentType: existing.document_type,
              originalFileName: existing.original_file_name,
            },
            new_value: {
              documentId,
              documentName,
              originalFileName: file.originalname,
            },
          },
        });

        removeUploadedFile(existing.storage_path);
        return updated;
      });
    } catch (error) {
      removeUploadedFile(file.path);
      throw error;
    }
  }

  async deleteVendorDocument(vendorId, documentId, user) {
    await this.getVendorById(vendorId, user);
    const existing = await prisma.vendorDocument.findFirst({
      where: { id: documentId, vendor_id: vendorId, deleted_at: null, status: 'ACTIVE' },
    });

    if (!existing) {
      throw new ApiError(404, 'Vendor document not found.');
    }

    return vendorRepository.transaction(async (tx) => {
      const deleted = await tx.vendorDocument.update({
        where: { id: documentId },
        data: { status: 'DELETED', deleted_at: new Date(), deleted_by_id: user.id },
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'vendor',
          entity_id: vendorId,
          action: 'vendor_document_deleted',
          performed_by_id: user.id,
          old_value: {
            documentId,
            documentType: existing.document_type,
            originalFileName: existing.original_file_name,
          },
        },
      });

      return deleted;
    });
  }

  async getVendorDocumentForDownload(vendorId, documentId, user) {
    await this.getVendorById(vendorId, user);
    const document = await prisma.vendorDocument.findFirst({
      where: { id: documentId, vendor_id: vendorId, deleted_at: null, status: 'ACTIVE' },
    });

    if (!document) {
      throw new ApiError(404, 'Vendor document not found.');
    }

    return document;
  }

  async unblockVendor(id, user, remarks) {
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError(404, VENDOR_MESSAGES.NOT_FOUND);
    }

    if (vendor.status !== VENDOR_STATUS.BLOCKED) {
      throw new ApiError(400, 'Only blocked vendors can be unblocked.');
    }

    const now = new Date();
    const updatedVendor = await vendorRepository.transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id },
        data: {
          ...buildVendorStatusData(VENDOR_STATUS.ACTIVE, user.id, now, remarks),
          blocked_at: null,
          rejected_at: null,
        },
        include: {
          created_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
          approved_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'vendor',
          entity_id: id,
          action: 'vendor_unblocked',
          from_status: VENDOR_STATUS.BLOCKED,
          to_status: VENDOR_STATUS.ACTIVE,
          performed_by_id: user.id,
          remarks,
          old_value: { status: VENDOR_STATUS.BLOCKED },
          new_value: {
            status: VENDOR_STATUS.ACTIVE,
            approval_status: VENDOR_APPROVAL_STATUS.APPROVED,
            is_active: true,
            reason: remarks || null,
          },
        },
      });

      await tx.approvalLog.create({
        data: {
          entity_type: 'vendor',
          entity_id: id,
          action: VENDOR_REVIEW_ACTION.UNBLOCK,
          from_status: VENDOR_STATUS.BLOCKED,
          to_status: VENDOR_STATUS.ACTIVE,
          performed_by_id: user.id,
          remarks,
        },
      });

      return updated;
    });

    const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
    notificationService.notifyVendorStatusChange(updatedVendor, VENDOR_STATUS.ACTIVE, actorName).catch(() => {});

    return updatedVendor;
  }

  async returnVendorToPending(id, user, body = {}) {
    const vendor = await vendorRepository.findById(id);
    if (!vendor) {
      throw new ApiError(404, VENDOR_MESSAGES.NOT_FOUND);
    }
    if (!canTransitionVendorReviewStatus(vendor.status, VENDOR_STATUS.PENDING)) {
      throw new ApiError(409, `Vendor cannot transition from ${vendor.status} to pending.`);
    }
    const remarks = buildReviewRemarks(body);
    requireVendorReviewInputs(VENDOR_REVIEW_ACTION.RETURN_TO_PENDING, body);

    const updatedVendor = await vendorRepository.transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id },
        data: {
          ...buildVendorStatusData(VENDOR_STATUS.PENDING, null, new Date(), remarks),
          rejected_at: null,
          blocked_at: null,
        },
        include: {
          created_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
          approved_by: { select: { id: true, email: true, first_name: true, last_name: true, role: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entity_type: 'vendor',
          entity_id: id,
          action: 'vendor_returned_to_pending',
          from_status: vendor.status,
          to_status: VENDOR_STATUS.PENDING,
          performed_by_id: user.id,
          remarks,
          old_value: { status: vendor.status, approval_status: vendor.approval_status || null },
          new_value: {
            status: VENDOR_STATUS.PENDING,
            approval_status: VENDOR_APPROVAL_STATUS.PENDING,
            is_active: false,
            reason: remarks || null,
          },
        },
      });

      await tx.approvalLog.create({
        data: {
          entity_type: 'vendor',
          entity_id: id,
          action: VENDOR_REVIEW_ACTION.RETURN_TO_PENDING,
          from_status: vendor.status,
          to_status: VENDOR_STATUS.PENDING,
          performed_by_id: user.id,
          remarks,
        },
      });

      return updated;
    });

    const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.role;
    notificationService.notifyVendorStatusChange(updatedVendor, VENDOR_STATUS.PENDING, actorName).catch(() => {});

    return updatedVendor;
  }
}

export default new VendorService();
