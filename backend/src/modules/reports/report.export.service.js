import XLSX from 'xlsx';
import prisma from '../../config/prisma.js';
import {
  EXPORT_LIMIT,
  sanitizeExportValue,
  formatDateForExport,
  formatAmountForExport,
} from './report.constants.js';

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const buildDateRange = (field, startDate, endDate) => {
  if (!startDate && !endDate) return {};
  const clause = {};
  if (startDate) clause.gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);
    clause.lte = end;
  }
  return { [field]: clause };
};

/**
 * Write an audit log entry for a report export action.
 */
const writeExportAuditLog = async ({ userId, action, entityType, filters, recordCount, format, req }) => {
  try {
    await prisma.auditLog.create({
      data: {
        entity_type:     entityType,
        entity_id:       'report-export',
        action,
        performed_by_id: userId || null,
        remarks:         JSON.stringify({ filters, recordCount, format }),
        ip_address:      req?.ip || null,
        user_agent:      req?.headers?.['user-agent'] || null,
      },
    });
  } catch {
    // Non-fatal: never let audit log failure block an export
  }
};

/**
 * Build a generic filter summary string for inclusion in exported file header.
 */
const buildFilterSummary = (filters) => {
  const parts = [];
  if (filters.startDate) parts.push(`From: ${filters.startDate}`);
  if (filters.endDate)   parts.push(`To: ${filters.endDate}`);
  if (filters.status)    parts.push(`Status: ${filters.status}`);
  if (filters.search)    parts.push(`Search: ${filters.search}`);
  return parts.join(' | ') || 'No filters applied';
};

/**
 * Attach a summary header row block to an xlsx worksheet.
 * Returns offset row index after summary rows.
 */
const addSummaryHeader = (wb, ws, reportTitle, filterSummary, generatedAt) => {
  const headerRows = [
    [reportTitle],
    [`Generated: ${generatedAt}`],
    [`Filters: ${filterSummary}`],
    [],
  ];
  XLSX.utils.sheet_add_aoa(ws, headerRows, { origin: 'A1' });
  return 4; // data starts at row 5 (0-indexed: row 4)
};

/**
 * Convert array of row objects → XLSX Buffer.
 */
const buildXlsxBuffer = (reportTitle, filterSummary, rows, sheetName = 'Report') => {
  const wb = XLSX.utils.book_new();
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  // Metadata rows
  const metaRows = [
    [reportTitle],
    [`Generated: ${generatedAt}`],
    [`Filters: ${filterSummary}`],
    [`Total Records: ${rows.length}`],
    [],
  ];

  const ws = XLSX.utils.aoa_to_sheet(metaRows);
  if (rows.length > 0) {
    XLSX.utils.sheet_add_json(ws, rows, { origin: { r: 5, c: 0 } });
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Convert array of row objects → CSV string.
 */
const buildCsvBuffer = (rows) => {
  if (rows.length === 0) return Buffer.from('');
  const headers = Object.keys(rows[0]).join(',');
  const csvRows = rows.map((row) =>
    Object.values(row)
      .map((v) => {
        const sanitized = sanitizeExportValue(String(v ?? ''));
        return `"${String(sanitized).replace(/"/g, '""')}"`;
      })
      .join(',')
  );
  return Buffer.from([headers, ...csvRows].join('\n'), 'utf-8');
};

// ─── ExportService ────────────────────────────────────────────────────────────

class ReportExportService {
  // ── Vendor Export ─────────────────────────────────────────────────────────

  async exportVendorReport(query, user, req) {
    const where = {
      deleted_at: null,
      ...buildDateRange('created_at', query.startDate, query.endDate),
      ...(query.status      && { status:   query.status }),
      ...(query.category    && { category: query.category }),
      ...(query.createdById && { created_by_id: query.createdById }),
      ...(query.search && {
        OR: [
          { name:           { contains: query.search, mode: 'insensitive' } },
          { vendor_code:    { contains: query.search, mode: 'insensitive' } },
          { email:          { contains: query.search, mode: 'insensitive' } },
          { contact_person: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const vendors = await prisma.vendor.findMany({
      where,
      take: EXPORT_LIMIT,
      orderBy: { [query.sortField || 'created_at']: query.sortOrder || 'desc' },
      select: {
        vendor_code: true, name: true, email: true, phone: true,
        category: true, contact_person: true, tax_id: true, gst_number: true,
        status: true, city: true, state: true, created_at: true, approved_at: true,
        created_by: { select: { first_name: true, last_name: true, email: true } },
        approved_by: { select: { first_name: true, last_name: true } },
      },
    });

    const rows = vendors.map((v) => ({
      'Vendor Code':    sanitizeExportValue(v.vendor_code),
      'Vendor Name':    sanitizeExportValue(v.name),
      'Email':          sanitizeExportValue(v.email),
      'Phone':          sanitizeExportValue(v.phone),
      'Category':       sanitizeExportValue(v.category),
      'Contact Person': sanitizeExportValue(v.contact_person || ''),
      'Tax ID':         sanitizeExportValue(v.tax_id || ''),
      'GST Number':     sanitizeExportValue(v.gst_number || ''),
      'Status':         sanitizeExportValue(v.status),
      'City':           sanitizeExportValue(v.city || ''),
      'State':          sanitizeExportValue(v.state || ''),
      'Created By':     v.created_by ? sanitizeExportValue(`${v.created_by.first_name} ${v.created_by.last_name}`) : '',
      'Approved By':    v.approved_by ? sanitizeExportValue(`${v.approved_by.first_name} ${v.approved_by.last_name}`) : '',
      'Created Date':   formatDateForExport(v.created_at),
      'Approved Date':  formatDateForExport(v.approved_at),
    }));

    await writeExportAuditLog({
      userId: user.id,
      action: 'vendor_report_exported',
      entityType: 'vendor',
      filters: query,
      recordCount: rows.length,
      format: query.format || 'xlsx',
      req,
    });

    const filterSummary = buildFilterSummary(query);
    return query.format === 'csv'
      ? buildCsvBuffer(rows)
      : buildXlsxBuffer('Vendor Report', filterSummary, rows, 'Vendors');
  }

  // ── PO Export ─────────────────────────────────────────────────────────────

  async exportPOReport(query, user, req) {
    const where = {
      ...buildDateRange('order_date', query.startDate, query.endDate),
      ...(query.status   && { status:    query.status }),
      ...(query.vendorId && { vendor_id: query.vendorId }),
      ...(query.currency && { currency:  query.currency }),
    };
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const ac = {};
      if (query.minAmount !== undefined) ac.gte = query.minAmount;
      if (query.maxAmount !== undefined) ac.lte = query.maxAmount;
      where.amount = ac;
    }
    if (query.search) {
      where.OR = [
        { po_number:   { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { vendor:      { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const pos = await prisma.purchaseOrder.findMany({
      where,
      take: EXPORT_LIMIT,
      orderBy: { [query.sortField || 'order_date']: query.sortOrder || 'desc' },
      select: {
        po_number: true, amount: true, currency: true, status: true,
        description: true, order_date: true, expected_delivery_date: true,
        created_at: true,
        vendor: { select: { vendor_code: true, name: true } },
        created_by: { select: { first_name: true, last_name: true } },
      },
    });

    const rows = pos.map((p) => ({
      'PO Number':           sanitizeExportValue(p.po_number),
      'Vendor Code':         sanitizeExportValue(p.vendor?.vendor_code || ''),
      'Vendor Name':         sanitizeExportValue(p.vendor?.name || ''),
      'Description':         sanitizeExportValue(p.description || ''),
      'Amount':              formatAmountForExport(p.amount),
      'Currency':            p.currency,
      'Status':              sanitizeExportValue(p.status),
      'Order Date':          formatDateForExport(p.order_date),
      'Expected Delivery':   formatDateForExport(p.expected_delivery_date),
      'Created By':          p.created_by ? sanitizeExportValue(`${p.created_by.first_name} ${p.created_by.last_name}`) : '',
      'Created Date':        formatDateForExport(p.created_at),
    }));

    await writeExportAuditLog({ userId: user.id, action: 'po_report_exported', entityType: 'purchase_order', filters: query, recordCount: rows.length, format: query.format || 'xlsx', req });

    const filterSummary = buildFilterSummary(query);
    return query.format === 'csv'
      ? buildCsvBuffer(rows)
      : buildXlsxBuffer('Purchase Order Report', filterSummary, rows, 'Purchase Orders');
  }

  // ── Invoice Export ────────────────────────────────────────────────────────

  async exportInvoiceReport(query, user, req) {
    const now = new Date();
    const where = {
      deleted_at: null,
      ...buildDateRange('invoice_date', query.startDate, query.endDate),
      ...(query.status        && { status:         query.status }),
      ...(query.paymentStatus && { payment_status: query.paymentStatus }),
      ...(query.vendorId      && { vendor_id:       query.vendorId }),
      ...(query.poId          && { purchase_order_id: query.poId }),
      ...(query.overdueOnly   && { due_date: { lt: now }, payment_status: { not: 'PAID' } }),
    };
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const ac = {};
      if (query.minAmount !== undefined) ac.gte = query.minAmount;
      if (query.maxAmount !== undefined) ac.lte = query.maxAmount;
      where.invoice_total = ac;
    }
    if (query.search) {
      where.OR = [
        { invoice_number: { contains: query.search, mode: 'insensitive' } },
        { vendor:         { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where,
      take: EXPORT_LIMIT,
      orderBy: { [query.sortField || 'invoice_date']: query.sortOrder || 'desc' },
      select: {
        invoice_number: true, amount: true, currency: true, invoice_total: true,
        paid_amount: true, remaining_amount: true, status: true, payment_status: true,
        invoice_date: true, due_date: true, final_approved_at: true, created_at: true,
        vendor: { select: { vendor_code: true, name: true } },
        purchase_order: { select: { po_number: true } },
        created_by: { select: { first_name: true, last_name: true } },
        finance_head_approver: { select: { first_name: true, last_name: true } },
      },
    });

    const rows = invoices.map((inv) => ({
      'Invoice Number':   sanitizeExportValue(inv.invoice_number),
      'Vendor Code':      sanitizeExportValue(inv.vendor?.vendor_code || ''),
      'Vendor Name':      sanitizeExportValue(inv.vendor?.name || ''),
      'PO Number':        sanitizeExportValue(inv.purchase_order?.po_number || ''),
      'Currency':         inv.currency,
      'Amount':           formatAmountForExport(inv.amount),
      'Invoice Total':    formatAmountForExport(inv.invoice_total),
      'Paid Amount':      formatAmountForExport(inv.paid_amount),
      'Remaining Amount': formatAmountForExport(inv.remaining_amount),
      'Status':           sanitizeExportValue(inv.status),
      'Payment Status':   sanitizeExportValue(inv.payment_status),
      'Invoice Date':     formatDateForExport(inv.invoice_date),
      'Due Date':         formatDateForExport(inv.due_date),
      'Approved Date':    formatDateForExport(inv.final_approved_at),
      'Created By':       inv.created_by ? sanitizeExportValue(`${inv.created_by.first_name} ${inv.created_by.last_name}`) : '',
      'Approved By':      inv.finance_head_approver ? sanitizeExportValue(`${inv.finance_head_approver.first_name} ${inv.finance_head_approver.last_name}`) : '',
      'Created Date':     formatDateForExport(inv.created_at),
    }));

    await writeExportAuditLog({ userId: user.id, action: 'invoice_report_exported', entityType: 'invoice', filters: query, recordCount: rows.length, format: query.format || 'xlsx', req });

    const filterSummary = buildFilterSummary(query);
    return query.format === 'csv'
      ? buildCsvBuffer(rows)
      : buildXlsxBuffer('Invoice Report', filterSummary, rows, 'Invoices');
  }

  // ── Payment Export ────────────────────────────────────────────────────────

  async exportPaymentReport(query, user, req) {
    const where = {
      ...buildDateRange('payment_date', query.startDate, query.endDate),
      ...(query.status        && { status:          query.status }),
      ...(query.paymentMethod && { payment_method:  query.paymentMethod }),
      ...(query.vendorId      && { vendor_id:        query.vendorId }),
      ...(query.invoiceId     && { invoice_id:       query.invoiceId }),
      ...(query.currency      && { currency:         query.currency }),
    };
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      const ac = {};
      if (query.minAmount !== undefined) ac.gte = query.minAmount;
      if (query.maxAmount !== undefined) ac.lte = query.maxAmount;
      where.amount = ac;
    }
    if (query.search) {
      where.OR = [
        { payment_number:          { contains: query.search, mode: 'insensitive' } },
        { provider_transaction_id: { contains: query.search, mode: 'insensitive' } },
        { vendor: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const payments = await prisma.payment.findMany({
      where,
      take: EXPORT_LIMIT,
      orderBy: { [query.sortField || 'payment_date']: query.sortOrder || 'desc' },
      select: {
        payment_number: true, amount: true, currency: true, status: true,
        payment_method: true, payment_type: true, provider_transaction_id: true,
        gateway_reference: true, payment_date: true, due_date: true,
        remarks: true, created_at: true,
        vendor:   { select: { vendor_code: true, name: true } },
        invoice:  { select: { invoice_number: true } },
        purchase_order: { select: { po_number: true } },
        created_by:   { select: { first_name: true, last_name: true } },
        processed_by: { select: { first_name: true, last_name: true } },
      },
    });

    const rows = payments.map((p) => ({
      'Payment Number':     sanitizeExportValue(p.payment_number),
      'Vendor Code':        sanitizeExportValue(p.vendor?.vendor_code || ''),
      'Vendor Name':        sanitizeExportValue(p.vendor?.name || ''),
      'Invoice Number':     sanitizeExportValue(p.invoice?.invoice_number || ''),
      'PO Number':          sanitizeExportValue(p.purchase_order?.po_number || ''),
      'Amount':             formatAmountForExport(p.amount),
      'Currency':           p.currency,
      'Status':             sanitizeExportValue(p.status),
      'Payment Method':     sanitizeExportValue(p.payment_method || ''),
      'Payment Type':       sanitizeExportValue(p.payment_type || ''),
      'Transaction ID':     sanitizeExportValue(p.provider_transaction_id || ''),
      'Gateway Reference':  sanitizeExportValue(p.gateway_reference || ''),
      'Payment Date':       formatDateForExport(p.payment_date),
      'Due Date':           formatDateForExport(p.due_date),
      'Remarks':            sanitizeExportValue(p.remarks || ''),
      'Created By':         p.created_by ? sanitizeExportValue(`${p.created_by.first_name} ${p.created_by.last_name}`) : '',
      'Processed By':       p.processed_by ? sanitizeExportValue(`${p.processed_by.first_name} ${p.processed_by.last_name}`) : '',
      'Created Date':       formatDateForExport(p.created_at),
    }));

    await writeExportAuditLog({ userId: user.id, action: 'payment_report_exported', entityType: 'payment', filters: query, recordCount: rows.length, format: query.format || 'xlsx', req });

    const filterSummary = buildFilterSummary(query);
    return query.format === 'csv'
      ? buildCsvBuffer(rows)
      : buildXlsxBuffer('Payment Report', filterSummary, rows, 'Payments');
  }
}

export default new ReportExportService();
