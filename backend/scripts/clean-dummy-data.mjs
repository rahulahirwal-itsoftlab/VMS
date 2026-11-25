import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { prisma } = await import('../src/config/prisma.js');
const { withDatabaseRetry } = await import('../src/utils/dbRetry.js');

async function cleanDatabase() {
  console.log('--- STARTING DATABASE DUMMY DATA CLEANUP ---');

  await withDatabaseRetry('cleanDatabase dummy entities', async () => {
    // 1. Payment Approvals & History
    if (prisma.paymentApprovalHistory) {
      const deletedHist = await prisma.paymentApprovalHistory.deleteMany({});
      console.log(`Deleted ${deletedHist.count} paymentApprovalHistory records`);
    }
    if (prisma.paymentApproval) {
      const deletedAppr = await prisma.paymentApproval.deleteMany({});
      console.log(`Deleted ${deletedAppr.count} paymentApproval records`);
    }

    // 2. Payments
    if (prisma.paymentOld) {
      const deletedOld = await prisma.paymentOld.deleteMany({});
      console.log(`Deleted ${deletedOld.count} paymentOld records`);
    }
    if (prisma.payment) {
      const deletedPay = await prisma.payment.deleteMany({});
      console.log(`Deleted ${deletedPay.count} payment records`);
    }

    // 3. Three-Way Matches
    if (prisma.threeWayMatch) {
      const deletedTwm = await prisma.threeWayMatch.deleteMany({});
      console.log(`Deleted ${deletedTwm.count} threeWayMatch records`);
    }

    // 4. Invoices and related OCR / attachments
    if (prisma.invoiceAttachment) {
      const deletedAtt = await prisma.invoiceAttachment.deleteMany({});
      console.log(`Deleted ${deletedAtt.count} invoiceAttachment records`);
    }
    if (prisma.oCRInvoiceDraft) {
      const deletedOcrDraft = await prisma.oCRInvoiceDraft.deleteMany({});
      console.log(`Deleted ${deletedOcrDraft.count} oCRInvoiceDraft records`);
    }
    if (prisma.oCRExtractionItem) {
      const deletedOcrItems = await prisma.oCRExtractionItem.deleteMany({});
      console.log(`Deleted ${deletedOcrItems.count} oCRExtractionItem records`);
    }
    if (prisma.oCRExtraction) {
      const deletedOcrExt = await prisma.oCRExtraction.deleteMany({});
      console.log(`Deleted ${deletedOcrExt.count} oCRExtraction records`);
    }
    if (prisma.oCRDocument) {
      const deletedOcrDoc = await prisma.oCRDocument.deleteMany({});
      console.log(`Deleted ${deletedOcrDoc.count} oCRDocument records`);
    }
    if (prisma.invoiceItem) {
      const deletedInvItems = await prisma.invoiceItem.deleteMany({});
      console.log(`Deleted ${deletedInvItems.count} invoiceItem records`);
    }
    if (prisma.invoice) {
      const deletedInv = await prisma.invoice.deleteMany({});
      console.log(`Deleted ${deletedInv.count} invoice records`);
    }

    // 5. Goods Receipt Notes & Delivery Challans
    if (prisma.goodsReceiptItem) {
      const deletedGrnItems = await prisma.goodsReceiptItem.deleteMany({});
      console.log(`Deleted ${deletedGrnItems.count} goodsReceiptItem records`);
    }
    if (prisma.goodsReceiptNoteItem) {
      const deletedGrnItems = await prisma.goodsReceiptNoteItem.deleteMany({});
      console.log(`Deleted ${deletedGrnItems.count} goodsReceiptNoteItem records`);
    }
    if (prisma.goodsReceiptNote) {
      const deletedGrn = await prisma.goodsReceiptNote.deleteMany({});
      console.log(`Deleted ${deletedGrn.count} goodsReceiptNote records`);
    }

    if (prisma.deliveryChallanItem) {
      const deletedDcItems = await prisma.deliveryChallanItem.deleteMany({});
      console.log(`Deleted ${deletedDcItems.count} deliveryChallanItem records`);
    }
    if (prisma.deliveryChallan) {
      const deletedDc = await prisma.deliveryChallan.deleteMany({});
      console.log(`Deleted ${deletedDc.count} deliveryChallan records`);
    }

    // 6. Purchase Orders, Items, Installments
    if (prisma.installment) {
      const deletedInst = await prisma.installment.deleteMany({});
      console.log(`Deleted ${deletedInst.count} installment records`);
    }
    if (prisma.purchaseOrderItem) {
      const deletedPoItems = await prisma.purchaseOrderItem.deleteMany({});
      console.log(`Deleted ${deletedPoItems.count} purchaseOrderItem records`);
    }
    if (prisma.purchaseOrder) {
      const deletedPo = await prisma.purchaseOrder.deleteMany({});
      console.log(`Deleted ${deletedPo.count} purchaseOrder records`);
    }

    // 7. Vendors and related
    if (prisma.vendorDocument) {
      const deletedVDoc = await prisma.vendorDocument.deleteMany({});
      console.log(`Deleted ${deletedVDoc.count} vendorDocument records`);
    }
    if (prisma.vendorBank) {
      const deletedVBank = await prisma.vendorBank.deleteMany({});
      console.log(`Deleted ${deletedVBank.count} vendorBank records`);
    }
    if (prisma.vendor) {
      const deletedVendors = await prisma.vendor.deleteMany({});
      console.log(`Deleted ${deletedVendors.count} vendor records`);
    }

    // 8. Notifications & Logs
    if (prisma.notification) {
      const deletedNotif = await prisma.notification.deleteMany({});
      console.log(`Deleted ${deletedNotif.count} notification records`);
    }
    if (prisma.auditLog) {
      const deletedAudit = await prisma.auditLog.deleteMany({});
      console.log(`Deleted ${deletedAudit.count} auditLog records`);
    }
    if (prisma.approvalLog) {
      const deletedApprovalLogs = await prisma.approvalLog.deleteMany({});
      console.log(`Deleted ${deletedApprovalLogs.count} approvalLog records`);
    }

    // 9. Remove any soft-deleted test users
    if (prisma.user) {
      const deletedUsers = await prisma.user.deleteMany({
        where: {
          email: {
            contains: '_deleted_'
          }
        }
      });
      console.log(`Deleted ${deletedUsers.count} soft-deleted user records`);
    }
  }, { retries: 5, minDelayMs: 2000 });

  // 10. Reset PostgreSQL Sequences
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    const { Client } = pg;
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      const resetSequences = [
        "ALTER SEQUENCE IF EXISTS vendor_code_seq RESTART WITH 1;",
        "ALTER SEQUENCE IF EXISTS po_number_seq RESTART WITH 1;",
        "ALTER SEQUENCE IF EXISTS invoice_number_seq RESTART WITH 1;",
        "ALTER SEQUENCE IF EXISTS grn_number_seq RESTART WITH 1;",
        "ALTER SEQUENCE IF EXISTS dc_number_seq RESTART WITH 1;",
        "ALTER SEQUENCE IF EXISTS payment_number_seq RESTART WITH 1;",
      ];
      for (const sql of resetSequences) {
        await client.query(sql);
      }
      console.log('PostgreSQL sequences successfully restarted to 1.');
    } catch (seqErr) {
      console.error('Failed to reset sequences:', seqErr.message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  // 11. Final Count Verification
  console.log('\n--- VERIFYING FINAL RECORD COUNTS ---');
  const models = [
    'vendor',
    'vendorDocument',
    'purchaseOrder',
    'deliveryChallan',
    'goodsReceiptNote',
    'invoice',
    'threeWayMatch',
    'payment',
    'paymentApproval',
    'notification',
    'auditLog',
    'user'
  ];
  for (const m of models) {
    if (prisma[m]) {
      const count = await prisma[m].count();
      console.log(`${m}: ${count}`);
    }
  }

  console.log('--- DATABASE CLEANUP COMPLETED SUCCESSFULLY ---');
}

cleanDatabase()
  .catch((err) => {
    console.error('Database cleanup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
