import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import vendorService from './vendor.service.js';
import { VENDOR_MESSAGES, VENDOR_STATUS } from './vendor.constants.js';

class VendorController {
  createVendor = asyncHandler(async (req, res) => {
    const vendor = await vendorService.createVendor(req.body, req.user);
    res.status(201).json({ success: true, message: VENDOR_MESSAGES.CREATED, data: vendor });
  });

  getVendors = asyncHandler(async (req, res) => {
    const result = await vendorService.listVendors(req.query, req.user);
    res.status(200).json({ success: true, ...result });
  });

  getVendorById = asyncHandler(async (req, res) => {
    const vendor = await vendorService.getVendorById(req.params.id, req.user);
    res.status(200).json({ success: true, data: vendor });
  });

  getVendorHistory = asyncHandler(async (req, res) => {
    const result = await vendorService.getVendorReviewHistory(req.params.id, req.user);
    res.status(200).json({ success: true, ...result });
  });

  updateVendor = asyncHandler(async (req, res) => {
    const vendor = await vendorService.updateVendor(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, message: VENDOR_MESSAGES.UPDATED, data: vendor });
  });

  listVendorDocuments = asyncHandler(async (req, res) => {
    const documents = await vendorService.listVendorDocuments(req.params.id, req.user);
    res.status(200).json({ success: true, documents });
  });

  uploadVendorDocument = asyncHandler(async (req, res) => {
    const result = await vendorService.uploadVendorDocument(req.params.id, req.body, req.file, req.user);
    res.status(201).json({ success: true, message: 'Vendor document uploaded.', data: result.document });
  });

  replaceVendorDocument = asyncHandler(async (req, res) => {
    const document = await vendorService.replaceVendorDocument(req.params.id, req.params.documentId, req.body, req.file, req.user);
    res.status(200).json({ success: true, message: 'Vendor document replaced.', data: document });
  });

  deleteVendorDocument = asyncHandler(async (req, res) => {
    await vendorService.deleteVendorDocument(req.params.id, req.params.documentId, req.user);
    res.status(200).json({ success: true, message: 'Vendor document deleted.' });
  });

  downloadVendorDocument = asyncHandler(async (req, res) => {
    const document = await vendorService.getVendorDocumentForDownload(req.params.id, req.params.documentId, req.user);
    res.download(document.storage_path, document.original_file_name);
  });

  approveVendor = asyncHandler(async (req, res) => {
    const vendor = await vendorService.changeVendorStatus(req.params.id, VENDOR_STATUS.APPROVED, req.user, req.body);
    res.status(200).json({ success: true, message: VENDOR_MESSAGES.APPROVED, data: vendor });
  });

  rejectVendor = asyncHandler(async (req, res) => {
    const vendor = await vendorService.changeVendorStatus(req.params.id, VENDOR_STATUS.REJECTED, req.user, req.body);
    res.status(200).json({ success: true, message: VENDOR_MESSAGES.REJECTED, data: vendor });
  });

  blockVendor = asyncHandler(async (req, res) => {
    const vendor = await vendorService.changeVendorStatus(req.params.id, VENDOR_STATUS.BLOCKED, req.user, {
      ...req.body,
      action: 'block',
    });
    res.status(200).json({ success: true, message: VENDOR_MESSAGES.BLOCKED, data: vendor });
  });

  holdVendor = asyncHandler(async (req, res) => {
    const vendor = await vendorService.changeVendorStatus(req.params.id, VENDOR_STATUS.BLOCKED, req.user, {
      ...req.body,
      action: 'hold',
    });
    res.status(200).json({ success: true, message: 'Vendor placed on hold.', data: vendor });
  });

  unblockVendor = asyncHandler(async (req, res) => {
    const vendor = await vendorService.unblockVendor(req.params.id, req.user, req.body?.remarks);
    res.status(200).json({ success: true, message: VENDOR_MESSAGES.UNBLOCKED, data: vendor });
  });

  returnVendorToPending = asyncHandler(async (req, res) => {
    const vendor = await vendorService.returnVendorToPending(req.params.id, req.user, req.body);
    res.status(200).json({ success: true, message: 'Vendor returned to pending review.', data: vendor });
  });
}

export default new VendorController();

