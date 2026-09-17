import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import matchingService from './matching.service.js';

class MatchingController {
  // ─── Three-Way Matching ────────────────────────────────────────────────────

  startMatching = asyncHandler(async (req, res) => {
    const { invoiceId, grnId, deliveryChallanId } = req.body;
    const result = await matchingService.startMatching(invoiceId, grnId, req.user, req, deliveryChallanId);
    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        match:      result.match,
        comparison: result.comparison,
      },
    });
  });

  getMatchReport = asyncHandler(async (req, res) => {
    const match = await matchingService.getMatchingReport(req.params.id);
    res.status(200).json({ success: true, data: match });
  });

  getMatchReportByInvoice = asyncHandler(async (req, res) => {
    const matches = await matchingService.getMatchingReportByInvoice(req.params.invoiceId);
    res.status(200).json({ success: true, data: matches });
  });

  listMatches = asyncHandler(async (req, res) => {
    const result = await matchingService.listMatches(req.query, req.user);
    res.status(200).json({ success: true, ...result });
  });

  adminApproveMatch = asyncHandler(async (req, res) => {
    const { remarks } = req.body || {};
    const result = await matchingService.adminApproveMatching(req.params.id, req.user, remarks, req);
    res.status(200).json({ success: true, ...result });
  });

  adminRejectMatch = asyncHandler(async (req, res) => {
    const { remarks } = req.body || {};
    const result = await matchingService.adminRejectMatching(req.params.id, req.user, remarks, req);
    res.status(200).json({ success: true, ...result });
  });

  returnMatchForCorrection = asyncHandler(async (req, res) => {
    const { remarks } = req.body || {};
    const result = await matchingService.returnMatchingForCorrection(req.params.id, req.user, remarks, req);
    res.status(200).json({ success: true, ...result });
  });

  // ─── GRN ──────────────────────────────────────────────────────────────────

  createGRN = asyncHandler(async (req, res) => {
    const grn = await matchingService.createGRN(req.body, req.user);
    res.status(201).json({ success: true, message: 'GRN created successfully.', data: grn });
  });

  updateGRN = asyncHandler(async (req, res) => {
    const grn = await matchingService.updateGRN(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, message: 'GRN updated successfully.', data: grn });
  });

  deleteGRN = asyncHandler(async (req, res) => {
    const grn = await matchingService.deleteGRN(req.params.id, req.user, req.body?.reason);
    res.status(200).json({ success: true, message: 'GRN deleted successfully.', data: grn });
  });

  getGRNById = asyncHandler(async (req, res) => {
    const grn = await matchingService.getGRNById(req.params.id);
    res.status(200).json({ success: true, data: grn });
  });

  getGRNsByPurchaseOrder = asyncHandler(async (req, res) => {
    const grns = await matchingService.getGRNsByPurchaseOrder(req.params.poId);
    res.status(200).json({ success: true, data: grns });
  });

  createDeliveryChallan = asyncHandler(async (req, res) => {
    const challan = await matchingService.createDeliveryChallan(req.body, req.user);
    res.status(201).json({ success: true, message: 'Delivery Challan created successfully.', data: challan });
  });

  updateDeliveryChallan = asyncHandler(async (req, res) => {
    const challan = await matchingService.updateDeliveryChallan(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, message: 'Delivery Challan updated successfully.', data: challan });
  });

  deleteDeliveryChallan = asyncHandler(async (req, res) => {
    const challan = await matchingService.deleteDeliveryChallan(req.params.id, req.user, req.body?.reason);
    res.status(200).json({ success: true, message: 'Delivery Challan deleted successfully.', data: challan });
  });

  getDeliveryChallanById = asyncHandler(async (req, res) => {
    const challan = await matchingService.getDeliveryChallanById(req.params.id);
    res.status(200).json({ success: true, data: challan });
  });

  getDeliveryChallansByPurchaseOrder = asyncHandler(async (req, res) => {
    const challans = await matchingService.getDeliveryChallansByPurchaseOrder(req.params.poId);
    res.status(200).json({ success: true, data: challans });
  });
}

export default new MatchingController();
