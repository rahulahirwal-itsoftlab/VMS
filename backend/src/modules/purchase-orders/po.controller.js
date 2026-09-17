import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import purchaseOrderService from './po.service.js';
import { generatePurchaseOrderPdf } from './po.pdf.js';
import ApiError from '../../utils/ApiError.js';

class PurchaseOrderController {
  createPurchaseOrder = asyncHandler(async (req, res) => {
    const purchaseOrder = await purchaseOrderService.createPurchaseOrder(req.body, req.user);
    res.status(201).json({
      success: true,
      message: 'Purchase order created successfully.',
      data: purchaseOrder,
    });
  });

  calculatePurchaseOrderTax = asyncHandler(async (req, res) => {
    const tax = await purchaseOrderService.calculatePurchaseOrderTaxPreview(req.body, req.user);
    res.status(200).json({
      success: true,
      data: tax,
    });
  });

  getPurchaseOrders = asyncHandler(async (req, res) => {
    const result = await purchaseOrderService.listPurchaseOrders(req.query, req.user);
    res.status(200).json({ success: true, ...result });
  });

  getPurchaseOrderById = asyncHandler(async (req, res) => {
    const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(req.params.id, req.user);
    res.status(200).json({ success: true, data: purchaseOrder });
  });

  updatePurchaseOrder = asyncHandler(async (req, res) => {
    const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(req.params.id, req.body, req.user, req);
    res.status(200).json({
      success: true,
      message: 'Purchase order updated successfully.',
      data: purchaseOrder,
    });
  });

  deletePurchaseOrder = asyncHandler(async (req, res) => {
    const result = await purchaseOrderService.deletePurchaseOrder(req.params.id, req.user, req.body.deleteReason, req);
    res.status(200).json({ success: true, ...result });
  });

  /**
   * GET /:id/download
   * Generates and streams a real PDF binary with Content-Type: application/pdf.
   * RBAC is enforced by the `authorize(DOWNLOAD_ROLES)` middleware in po.routes.js.
   */
  downloadPurchaseOrderPdf = asyncHandler(async (req, res) => {
    // 1. Fetch the full PO record from the database (throws 404 if not found / 403 if unauthorized)
    const po = await purchaseOrderService.downloadPurchaseOrderPdf(req.params.id, req.user, req);

    if (!po) {
      throw new ApiError(404, 'Purchase Order not found.');
    }

    // 2. Generate the PDF buffer — all data comes from the live database record
    let pdfBuffer;
    try {
      pdfBuffer = await generatePurchaseOrderPdf(po);
    } catch (pdfError) {
      console.error('[PO PDF] Generation failed:', pdfError);
      throw new ApiError(500, 'PDF generation failed. Please try again.');
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new ApiError(500, 'PDF generation produced an empty document. Please contact support.');
    }

    // 3. Build a safe filename: PO_2026_000001.pdf
    const safeNumber = String(po.po_number || po.poNumber || 'PO').replace(/[/\\?%*:|"<>]/g, '_');
    const filename   = `${safeNumber}.pdf`;

    // 4. Stream the PDF binary to the client
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      pdfBuffer.length,
      'Cache-Control':       'no-cache, no-store, must-revalidate',
      'Pragma':              'no-cache',
      'Expires':             '0',
    });

    res.end(pdfBuffer);
  });
}

export default new PurchaseOrderController();
