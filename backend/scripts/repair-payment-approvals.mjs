/**
 * repair-payment-approvals.mjs
 * 
 * Audits and repairs inconsistent Payment and Notification data:
 * 1. Finds all PENDING or PENDING_APPROVAL payments that do not have a linked PaymentApproval record.
 * 2. Creates the missing PaymentApproval and PaymentApprovalHistory records.
 * 3. Assigns them to the first active user with the correct role (TEAM_LEAD, MANAGER, or FINANCE_HEAD).
 * 4. Links existing orphaned payment notifications to the newly created PaymentApproval records.
 * 
 * Run with: node scripts/repair-payment-approvals.mjs
 */

import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set. Cannot run repair script.');
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL });

// Dynamic role limits
const TEAM_LEAD_LIMIT = 10000;
const FINANCE_HEAD_LIMIT = 100000;

const getRequiredRole = (amount, currency = 'INR') => {
  if (String(currency || 'INR').toUpperCase() !== 'INR') {
    return 'FINANCE_HEAD';
  }
  const amt = Number(amount);
  if (amt <= TEAM_LEAD_LIMIT) return 'TEAM_LEAD';
  if (amt < FINANCE_HEAD_LIMIT) return 'MANAGER';
  return 'FINANCE_HEAD';
};

async function run() {
  try {
    await client.connect();
    console.log('🔌 Connected to PostgreSQL database.');

    // 1. Fetch all active users grouped by role to resolve approvers
    const userRes = await client.query(
      `SELECT id, email, role, first_name, last_name 
       FROM users 
       WHERE status = 'ACTIVE' AND deleted_at IS NULL 
       ORDER BY created_at ASC`
    );
    const users = userRes.rows;
    console.log(`👤 Found ${users.length} active users.`);

    const getApprover = (role) => {
      const match = users.find(u => u.role === role);
      if (match) return match;
      // Fallback to first FINANCE_HEAD
      const fallback = users.find(u => u.role === 'FINANCE_HEAD');
      return fallback || users[0]; // Worst fallback
    };

    // Begin transaction
    await client.query('BEGIN');

    // 2. Find payments in PENDING or PENDING_APPROVAL status with no PaymentApproval
    const paymentsRes = await client.query(
      `SELECT p.id, p.payment_number, p.amount, p.currency, p.invoice_id, p.vendor_id, p.purchase_order_id, p.created_by_id, p.three_way_match_id
       FROM payments p
       LEFT JOIN payment_approvals pa ON p.id = pa.payment_id
       WHERE p.status IN ('PENDING', 'PENDING_APPROVAL') AND pa.id IS NULL`
    );
    const orphanedPayments = paymentsRes.rows;
    console.log(`🚨 Found ${orphanedPayments.length} payments with missing PaymentApproval records.`);

    for (const payment of orphanedPayments) {
      const requiredRole = getRequiredRole(payment.amount, payment.currency);
      const approver = getApprover(requiredRole);

      if (!approver) {
        console.warn(`⚠️ Skipping payment ${payment.payment_number}: No active user available in the system!`);
        continue;
      }

      const approvalId = randomUUID();
      const now = new Date().toISOString();

      // Create PaymentApproval
      await client.query(
        `INSERT INTO payment_approvals (
          id, payment_id, invoice_id, purchase_order_id, vendor_id, three_way_match_id,
          amount, currency, approval_level, required_role, approver_id, status,
          requested_by_id, requested_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, 'PENDING', $11, $12, $13, $14)`,
        [
          approvalId, payment.id, payment.invoice_id, payment.purchase_order_id, payment.vendor_id, payment.three_way_match_id,
          payment.amount, payment.currency, requiredRole, approver.id, payment.created_by_id, now, now, now
        ]
      );

      // Create PaymentApprovalHistory
      await client.query(
        `INSERT INTO payment_approval_history (
          id, payment_approval_id, payment_id, invoice_id, action,
          previous_status, new_status, performed_by_id, remarks, created_at
        ) VALUES ($1, $2, $3, $4, 'REQUESTED', NULL, 'PENDING', $5, $6, $7)`,
        [
          randomUUID(), approvalId, payment.id, payment.invoice_id,
          payment.created_by_id, `Payment approval restored. Required role: ${requiredRole}. Assigned to: ${approver.email}.`, now
        ]
      );

      // Create assigned history entry
      await client.query(
        `INSERT INTO payment_approval_history (
          id, payment_approval_id, payment_id, invoice_id, action,
          previous_status, new_status, performed_by_id, remarks, created_at
        ) VALUES ($1, $2, $3, $4, 'ASSIGNED', NULL, 'PENDING', NULL, $5, $6)`,
        [
          randomUUID(), approvalId, payment.id, payment.invoice_id,
          `Restored assignment to ${approver.first_name || ''} ${approver.last_name || ''} (${approver.role}) — ${approver.email}`, now
        ]
      );

      // Also ensure Payment status is PENDING_APPROVAL and approval_status is PENDING
      await client.query(
        `UPDATE payments 
         SET status = 'PENDING_APPROVAL', approval_status = 'PENDING' 
         WHERE id = $1`,
        [payment.id]
      );

      // Link any notifications for this payment (legacy reference) to the new PaymentApproval
      const notifyUpdateRes = await client.query(
        `UPDATE notifications
         SET entity_type = 'payment_approval', entity_id = $1, reference_id = $1
         WHERE (entity_type = 'payment' OR entity_type = 'payment_approval') AND entity_id = $2`,
        [approvalId, payment.id]
      );

      console.log(`Repaired payment ${payment.payment_number} -> Created PaymentApproval ${approvalId} assigned to ${approver.email} (Linked ${notifyUpdateRes.rowCount} notifications).`);
    }

    // 3. Scan for PaymentApproval records with NULL approver_id (safety check)
    const nullApproversRes = await client.query(
      `SELECT id, amount, currency, required_role FROM payment_approvals WHERE approver_id IS NULL OR approver_id = ''`
    );
    const nullApprovers = nullApproversRes.rows;
    console.log(`🔍 Found ${nullApprovers.length} PaymentApprovals with missing approver_id.`);

    for (const pa of nullApprovers) {
      const requiredRole = pa.required_role || getRequiredRole(pa.amount, pa.currency);
      const approver = getApprover(requiredRole);
      if (approver) {
        await client.query(
          `UPDATE payment_approvals SET approver_id = $1, required_role = $2 WHERE id = $3`,
          [approver.id, requiredRole, pa.id]
        );
        console.log(`Reassigned PaymentApproval ${pa.id} to ${approver.email} (${requiredRole}).`);
      }
    }

    // 4. Link notification recipient to PaymentApproval.approver_id if they don't match
    const mismatchRes = await client.query(
      `SELECT n.id as notification_id, n.user_id as notification_user, pa.id as approval_id, pa.approver_id as approval_approver, u.email as correct_email
       FROM notifications n
       JOIN payment_approvals pa ON n.entity_id = pa.id
       JOIN users u ON pa.approver_id = u.id
       WHERE n.entity_type = 'payment_approval' AND n.user_id != pa.approver_id`
    );
    const mismatches = mismatchRes.rows;
    console.log(`🔍 Found ${mismatches.length} notifications where recipient doesn't match approval assignee.`);

    for (const m of mismatches) {
      await client.query(
        `UPDATE notifications SET user_id = $1 WHERE id = $2`,
        [m.approval_approver, m.notification_id]
      );
      console.log(`Re-routed notification ${m.notification_id} to correct approver: ${m.correct_email}.`);
    }

    await client.query('COMMIT');
    console.log('🎉 Database repair and audit completed successfully.');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Repair execution failed:', err);
  } finally {
    await client.end();
  }
}

run();
