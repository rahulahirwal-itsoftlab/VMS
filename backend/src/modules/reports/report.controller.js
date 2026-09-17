import asyncHandler from '../../middleware/asyncHandler.middleware.js';
import reportService from './report.service.js';
import reportExportService from './report.export.service.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Build a safe export filename.
 * vendor-report-2025-01-01-to-2025-12-31.xlsx
 */
const buildFilename = (prefix, query, ext) => {
  const start = (query.startDate || 'all').slice(0, 10);
  const end   = (query.endDate   || 'all').slice(0, 10);
  return `${prefix}-${start}-to-${end}.${ext}`;
};

class ReportController {
  // ──────────────────────────────────────────────────────────────────────────
  // VENDOR REPORT
  // ──────────────────────────────────────────────────────────────────────────
  getVendorReport = asyncHandler(async (req, res) => {
    const result = await reportService.getVendorReport(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getVendorReportSummary = asyncHandler(async (req, res) => {
    const summary = await reportService.getVendorReportSummary(req.query);
    res.status(200).json({ success: true, data: summary });
  });

  getVendorReportDetail = asyncHandler(async (req, res) => {
    const record = await reportService.getVendorReportDetail(req.params.id);
    if (!record) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json({ success: true, data: record });
  });

  exportVendorReport = asyncHandler(async (req, res) => {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const buffer = await reportExportService.exportVendorReport(req.query, req.user, req);
    const filename = buildFilename('vendor-report', req.query, format);

    const contentType = format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PURCHASE ORDER REPORT
  // ──────────────────────────────────────────────────────────────────────────
  getPOReport = asyncHandler(async (req, res) => {
    const result = await reportService.getPOReport(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getPOReportSummary = asyncHandler(async (req, res) => {
    const summary = await reportService.getPOReportSummary(req.query);
    res.status(200).json({ success: true, data: summary });
  });

  getPOReportDetail = asyncHandler(async (req, res) => {
    const record = await reportService.getPOReportDetail(req.params.id);
    if (!record) throw new ApiError(404, 'Purchase order not found.');
    res.status(200).json({ success: true, data: record });
  });

  exportPOReport = asyncHandler(async (req, res) => {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const buffer = await reportExportService.exportPOReport(req.query, req.user, req);
    const filename = buildFilename('purchase-order-report', req.query, format);

    const contentType = format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // INVOICE REPORT
  // ──────────────────────────────────────────────────────────────────────────
  getInvoiceReport = asyncHandler(async (req, res) => {
    const result = await reportService.getInvoiceReport(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getInvoiceReportSummary = asyncHandler(async (req, res) => {
    const summary = await reportService.getInvoiceReportSummary(req.query);
    res.status(200).json({ success: true, data: summary });
  });

  getInvoiceReportDetail = asyncHandler(async (req, res) => {
    const record = await reportService.getInvoiceReportDetail(req.params.id);
    if (!record) throw new ApiError(404, 'Invoice not found.');
    res.status(200).json({ success: true, data: record });
  });

  exportInvoiceReport = asyncHandler(async (req, res) => {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const buffer = await reportExportService.exportInvoiceReport(req.query, req.user, req);
    const filename = buildFilename('invoice-report', req.query, format);

    const contentType = format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PAYMENT REPORT
  // ──────────────────────────────────────────────────────────────────────────
  getPaymentReport = asyncHandler(async (req, res) => {
    const result = await reportService.getPaymentReport(req.query);
    res.status(200).json({ success: true, ...result });
  });

  getPaymentReportSummary = asyncHandler(async (req, res) => {
    const summary = await reportService.getPaymentReportSummary(req.query);
    res.status(200).json({ success: true, data: summary });
  });

  getPaymentReportDetail = asyncHandler(async (req, res) => {
    const record = await reportService.getPaymentReportDetail(req.params.id);
    if (!record) throw new ApiError(404, 'Payment not found.');
    res.status(200).json({ success: true, data: record });
  });

  exportPaymentReport = asyncHandler(async (req, res) => {
    const format = (req.query.format || 'xlsx').toLowerCase();
    const buffer = await reportExportService.exportPaymentReport(req.query, req.user, req);
    const filename = buildFilename('payment-report', req.query, format);

    const contentType = format === 'csv'
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  });
}

export default new ReportController();
