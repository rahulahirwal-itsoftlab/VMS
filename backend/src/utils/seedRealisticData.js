import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { ROLES, UserEntity } from '../zodSchema/index.js';
import { USER_ACCOUNT_STATUS } from '../modules/users/user-status.constants.js';

const DEFAULT_PASSWORD = process.env.DEV_SEED_PASSWORD || process.env.SUPER_ADMIN_PASSWORD || 'Admin@123';

export const seedRealisticData = async () => {
  console.log('[SEED] Starting database seeding with realistic data...');

  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const now = new Date();
  const pastDays = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 1. SEED USERS
  const usersToSeed = [
    {
      email: process.env.SUPER_ADMIN_EMAIL || 'admin@vms.com',
      role: ROLES.SUPER_ADMIN,
      firstName: 'System',
      lastName: 'Admin',
      designation: 'Chief Administrator',
    },
    {
      email: 'finance@vms.com',
      role: ROLES.FINANCE_HEAD,
      firstName: 'Finance',
      lastName: 'Head',
      designation: 'Head of Finance & Accounts',
    },
    {
      email: 'teamlead@vms.com',
      role: ROLES.TEAM_LEAD,
      firstName: 'Team',
      lastName: 'Lead',
      designation: 'Procurement Team Lead',
    },
    {
      email: 'l1@vms.com',
      role: ROLES.TEAM_LEAD,
      firstName: 'L1',
      lastName: 'Team Lead',
      designation: 'Senior Lead Specialist',
    },
    {
      email: 'manager@vms.com',
      role: ROLES.MANAGER,
      firstName: 'Account',
      lastName: 'Manager',
      designation: 'Accounts Manager',
    },
    {
      email: 'l2@vms.com',
      role: ROLES.MANAGER,
      firstName: 'L2',
      lastName: 'Account Manager',
      designation: 'Finance & Operations Manager',
    },
    {
      email: 'casemanager@vms.com',
      role: ROLES.CASE_MANAGER,
      firstName: 'Case',
      lastName: 'Manager',
      designation: 'Vendor Case Specialist',
    },
    {
      email: 'l3@vms.com',
      role: ROLES.FINANCE_HEAD,
      firstName: 'L3',
      lastName: 'Senior Approver',
      designation: 'Senior Director of Finance',
    },
  ];

  const userMap = {};

  for (const u of usersToSeed) {
    let existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      existing = await prisma.user.create({
        data: {
          email: u.email,
          password: hashedPassword,
          role: u.role,
          first_name: u.firstName,
          last_name: u.lastName,
          designation: u.designation,
          status: USER_ACCOUNT_STATUS.ACTIVE,
          activated_at: pastDays(30),
          password_set_at: pastDays(30),
        },
      });
      console.log(`[SEED] Created user: ${u.email} (${u.role})`);
    } else {
      console.log(`[SEED] Existing user verified: ${u.email}`);
    }
    userMap[u.role] = existing;
    userMap[u.email] = existing;
  }

  const superAdmin = userMap[ROLES.SUPER_ADMIN] || userMap['admin@vms.com'];
  const caseManager = userMap[ROLES.CASE_MANAGER] || userMap['casemanager@vms.com'];
  const teamLead = userMap[ROLES.TEAM_LEAD] || userMap['teamlead@vms.com'];
  const manager = userMap[ROLES.MANAGER] || userMap['manager@vms.com'];
  const financeHead = userMap[ROLES.FINANCE_HEAD] || userMap['finance@vms.com'];

  // 2. SEED VENDORS
  const vendorsToSeed = [
    {
      vendor_code: 'VND-000001',
      name: 'Acme Industrial Solutions Pvt Ltd',
      email: 'contact@acmeindustrial.com',
      phone: '9876543210',
      address: 'Plot 42, Sector 18, Industrial Area',
      address_line1: 'Plot 42, Sector 18',
      address_line2: 'Industrial Area Phase 2',
      city: 'Indore',
      state: 'Madhya Pradesh',
      country: 'India',
      zip_code: '452001',
      tax_id: '23AAAAA1234A1Z5',
      gst_number: '23AAAAA1234A1Z5',
      pan_number: 'AAAAA1234A',
      category: 'Manufacturer',
      vendor_type: 'Domestic',
      tax_type: 'Regular',
      contact_person: 'Rajesh Sharma',
      contact_designation: 'Sales Director',
      bank_name: 'HDFC Bank',
      account_holder: 'Acme Industrial Solutions Pvt Ltd',
      bank_account_no: '50200012345678',
      ifsc_code: 'HDFC0001234',
      bank_branch: 'MG Road Branch, Indore',
      payment_terms: 'Net 30',
      status: 'ACTIVE',
      approval_status: 'APPROVED',
      is_active: true,
      created_by_id: caseManager.id,
      approved_by_id: financeHead.id,
      approved_at: pastDays(25),
      activated_at: pastDays(25),
    },
    {
      vendor_code: 'VND-000002',
      name: 'Apex Global Logistics Ltd',
      email: 'info@apexlogistics.com',
      phone: '9812345678',
      address: 'Suite 302, Cargo Complex, Airport Road',
      address_line1: 'Suite 302, Cargo Complex',
      address_line2: 'Airport Road Extension',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      zip_code: '400099',
      tax_id: '27BBBBB5678B1Z2',
      gst_number: '27BBBBB5678B1Z2',
      pan_number: 'BBBBB5678B',
      category: 'Supplier',
      vendor_type: 'Domestic',
      tax_type: 'Regular',
      contact_person: 'Ananya Verma',
      contact_designation: 'Key Account Manager',
      bank_name: 'ICICI Bank',
      account_holder: 'Apex Global Logistics Ltd',
      bank_account_no: '00040501298765',
      ifsc_code: 'ICIC0000004',
      bank_branch: 'BKC Branch, Mumbai',
      payment_terms: 'Net 30',
      status: 'ACTIVE',
      approval_status: 'APPROVED',
      is_active: true,
      created_by_id: caseManager.id,
      approved_by_id: financeHead.id,
      approved_at: pastDays(20),
      activated_at: pastDays(20),
    },
    {
      vendor_code: 'VND-000003',
      name: 'TechSource Hardware Systems',
      email: 'sales@techsource.co.in',
      phone: '9765432109',
      address: 'Building 7, Electronic City Phase 1',
      address_line1: 'Building 7',
      address_line2: 'Electronic City Phase 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      zip_code: '560100',
      tax_id: '29CCCCC9012C1Z8',
      gst_number: '29CCCCC9012C1Z8',
      pan_number: 'CCCCC9012C',
      category: 'Distributor',
      vendor_type: 'Domestic',
      tax_type: 'Regular',
      contact_person: 'Vikram Mehta',
      contact_designation: 'Regional Head',
      bank_name: 'State Bank of India',
      account_holder: 'TechSource Hardware Systems',
      bank_account_no: '309876543210',
      ifsc_code: 'SBIN0008765',
      bank_branch: 'Electronic City Branch, Bengaluru',
      payment_terms: 'Net 45',
      status: 'ACTIVE',
      approval_status: 'APPROVED',
      is_active: true,
      created_by_id: caseManager.id,
      approved_by_id: financeHead.id,
      approved_at: pastDays(15),
      activated_at: pastDays(15),
    },
    {
      vendor_code: 'VND-000004',
      name: 'Zenith IT Enterprise Services',
      email: 'support@zenithit.com',
      phone: '9654321098',
      address: 'Tower B, Cyber Tech Park',
      address_line1: 'Tower B, Cyber Tech Park',
      address_line2: 'Sector 62',
      city: 'Noida',
      state: 'Uttar Pradesh',
      country: 'India',
      zip_code: '201309',
      tax_id: '09DDDDD3456D1Z4',
      gst_number: '09DDDDD3456D1Z4',
      pan_number: 'DDDDD3456D',
      category: 'Service Provider',
      vendor_type: 'Domestic',
      tax_type: 'Regular',
      contact_person: 'Pooja Hegde',
      contact_designation: 'Client Relationship Manager',
      bank_name: 'Axis Bank',
      account_holder: 'Zenith IT Enterprise Services',
      bank_account_no: '918020034567890',
      ifsc_code: 'UTIB0000123',
      bank_branch: 'Sector 62 Branch, Noida',
      payment_terms: 'Net 15',
      status: 'PENDING',
      approval_status: 'PENDING_APPROVAL',
      is_active: false,
      created_by_id: caseManager.id,
    },
    {
      vendor_code: 'VND-000005',
      name: 'Velocity Freight Movers Ltd',
      email: 'ops@velocityfreight.in',
      phone: '9543210987',
      address: 'Plot 104, Transport Nagar',
      address_line1: 'Plot 104, Transport Nagar',
      address_line2: 'NH-8 Bypass',
      city: 'Jaipur',
      state: 'Rajasthan',
      country: 'India',
      zip_code: '302013',
      tax_id: '08EEEEE7890E1Z1',
      gst_number: '08EEEEE7890E1Z1',
      pan_number: 'EEEEE7890E',
      category: 'Supplier',
      vendor_type: 'Domestic',
      tax_type: 'Regular',
      contact_person: 'Amitabh Choudhary',
      contact_designation: 'Operations Director',
      bank_name: 'Kotak Mahindra Bank',
      account_holder: 'Velocity Freight Movers Ltd',
      bank_account_no: '7811234567',
      ifsc_code: 'KKBK0000456',
      bank_branch: 'MI Road Branch, Jaipur',
      payment_terms: 'Net 30',
      status: 'BLOCKED',
      approval_status: 'BLOCKED',
      is_active: false,
      blocked_at: pastDays(5),
      created_by_id: caseManager.id,
    },
  ];

  const vendorMap = {};

  for (const v of vendorsToSeed) {
    let existing = await prisma.vendor.findFirst({
      where: {
        OR: [{ vendor_code: v.vendor_code }, { email: v.email }, { tax_id: v.tax_id }],
      },
    });

    if (!existing) {
      existing = await prisma.vendor.create({ data: v });
      console.log(`[SEED] Created vendor: ${v.name} (${v.vendor_code})`);
    } else {
      console.log(`[SEED] Existing vendor verified: ${existing.name} (${existing.vendor_code})`);
    }
    vendorMap[v.vendor_code] = existing;
  }

  const v1 = vendorMap['VND-000001'];
  const v2 = vendorMap['VND-000002'];
  const v3 = vendorMap['VND-000003'];

  // 3. SEED VENDOR DOCUMENTS
  const documentsToSeed = [
    {
      vendor_id: v1.id,
      document_name: 'GST Registration Certificate',
      original_file_name: 'Acme_GST_Certificate_2026.pdf',
      file_url: '/documents/Acme_GST_Certificate.pdf',
      storage_path: 'uploads/vendors/Acme_GST_Certificate.pdf',
      document_type: 'GST_CERTIFICATE',
      mime_type: 'application/pdf',
      file_size: 245000,
      status: 'ACTIVE',
      uploaded_by_id: caseManager.id,
    },
    {
      vendor_id: v1.id,
      document_name: 'PAN Card Copy',
      original_file_name: 'Acme_PAN_Card.pdf',
      file_url: '/documents/Acme_PAN_Card.pdf',
      storage_path: 'uploads/vendors/Acme_PAN_Card.pdf',
      document_type: 'PAN_CARD',
      mime_type: 'application/pdf',
      file_size: 180000,
      status: 'ACTIVE',
      uploaded_by_id: caseManager.id,
    },
    {
      vendor_id: v1.id,
      document_name: 'Cancelled Cheque',
      original_file_name: 'Acme_Bank_Proof.pdf',
      file_url: '/documents/Acme_Bank_Proof.pdf',
      storage_path: 'uploads/vendors/Acme_Bank_Proof.pdf',
      document_type: 'CANCELLED_CHEQUE',
      mime_type: 'application/pdf',
      file_size: 195000,
      status: 'ACTIVE',
      uploaded_by_id: caseManager.id,
    },
    {
      vendor_id: v2.id,
      document_name: 'GST Registration Certificate',
      original_file_name: 'Apex_GST_Certificate.pdf',
      file_url: '/documents/Apex_GST_Certificate.pdf',
      storage_path: 'uploads/vendors/Apex_GST_Certificate.pdf',
      document_type: 'GST_CERTIFICATE',
      mime_type: 'application/pdf',
      file_size: 260000,
      status: 'ACTIVE',
      uploaded_by_id: caseManager.id,
    },
  ];

  for (const doc of documentsToSeed) {
    const exists = await prisma.vendorDocument.findFirst({
      where: { vendor_id: doc.vendor_id, document_type: doc.document_type },
    });
    if (!exists) {
      await prisma.vendorDocument.create({ data: doc });
      console.log(`[SEED] Added vendor document: ${doc.document_name}`);
    }
  }

  // 4. SEED PURCHASE ORDERS
  const po1Items = [
    {
      itemCode: 'ITM-MOT-010',
      itemName: 'Industrial Motor 10HP Three Phase',
      description: 'Heavy duty 3-phase induction motor for manufacturing line',
      quantity: 10,
      unitPrice: 12000,
      rate: 12000,
      gstRate: 18,
      gstAmount: 21600,
      lineTotal: 120000,
      totalAmount: 141600,
    },
  ];

  const po2Items = [
    {
      itemCode: 'ITM-PAL-500',
      itemName: 'Heavy Duty Wooden Cargo Pallets',
      description: 'ISPM-15 treated heat treated wooden pallets for export cargo',
      quantity: 50,
      unitPrice: 4800,
      rate: 4800,
      gstRate: 18,
      gstAmount: 43200,
      lineTotal: 240000,
      totalAmount: 283200,
    },
  ];

  const po3Items = [
    {
      itemCode: 'ITM-RCK-042',
      itemName: 'Server Rack Enclosure 42U',
      description: 'Standard 19-inch 42U server rack with PDU and cooling fans',
      quantity: 15,
      unitPrice: 24000,
      rate: 24000,
      gstRate: 18,
      gstAmount: 64800,
      lineTotal: 360000,
      totalAmount: 424800,
    },
  ];

  const purchaseOrdersToSeed = [
    {
      po_number: 'PO-2026-0001',
      vendor_id: v1.id,
      amount: 141600.00,
      status: 'approved',
      order_date: pastDays(20),
      expected_delivery_date: pastDays(10),
      currency: 'INR',
      created_by_id: caseManager.id,
      payment_terms: 'Net 30',
      billing_address: v1.address,
      delivery_address: 'Central Warehouse, Gate 4, Industrial Hub, Indore, MP - 452001',
      buyer: 'Procurement Dept',
      department: 'Manufacturing',
      requester: 'Plant Director',
      po_type: 'STANDARD',
      payment_type: 'ONE_TIME',
      line_items: po1Items,
      tax_summary: { subtotal: 120000, totalTax: 21600, grandTotal: 141600 },
    },
    {
      po_number: 'PO-2026-0002',
      vendor_id: v2.id,
      amount: 283200.00,
      status: 'delivered',
      order_date: pastDays(15),
      expected_delivery_date: pastDays(5),
      currency: 'INR',
      created_by_id: caseManager.id,
      payment_terms: 'Net 30',
      billing_address: v2.address,
      delivery_address: 'Logistics Depot 2, Cargo Complex, Mumbai, MH - 400099',
      buyer: 'Supply Chain Operations',
      department: 'Logistics',
      requester: 'Logistics Head',
      po_type: 'STANDARD',
      payment_type: 'ONE_TIME',
      line_items: po2Items,
      tax_summary: { subtotal: 240000, totalTax: 43200, grandTotal: 283200 },
    },
    {
      po_number: 'PO-2026-0003',
      vendor_id: v3.id,
      amount: 424800.00,
      status: 'partially_delivered',
      order_date: pastDays(12),
      expected_delivery_date: pastDays(2),
      currency: 'INR',
      created_by_id: caseManager.id,
      payment_terms: 'Net 45',
      billing_address: v3.address,
      delivery_address: 'IT Data Center Tower 1, Electronic City, Bengaluru, KA - 560100',
      buyer: 'IT Infrastructure Dept',
      department: 'Information Technology',
      requester: 'CTO Office',
      po_type: 'STANDARD',
      payment_type: 'ONE_TIME',
      line_items: po3Items,
      tax_summary: { subtotal: 360000, totalTax: 64800, grandTotal: 424800 },
    },
  ];

  const poMap = {};

  for (const po of purchaseOrdersToSeed) {
    let existing = await prisma.purchaseOrder.findUnique({ where: { po_number: po.po_number } });
    if (!existing) {
      existing = await prisma.purchaseOrder.create({ data: po });
      console.log(`[SEED] Created Purchase Order: ${po.po_number}`);
    } else {
      console.log(`[SEED] Verified Purchase Order: ${existing.po_number}`);
    }
    poMap[po.po_number] = existing;
  }

  const po1 = poMap['PO-2026-0001'];
  const po2 = poMap['PO-2026-0002'];
  const po3 = poMap['PO-2026-0003'];

  // 5. SEED DELIVERY CHALLANS & GOODS RECEIPT NOTES (GRN)
  const dc1 = await prisma.deliveryChallan.upsert({
    where: { delivery_challan_number: 'DC-2026-0001' },
    update: {},
    create: {
      delivery_challan_number: 'DC-2026-0001',
      vendor_id: v1.id,
      purchase_order_id: po1.id,
      created_by_id: caseManager.id,
      status: 'delivered',
      vendor_name: v1.name,
      vendor_code: v1.vendor_code,
      gst_number: v1.gst_number,
      delivery_date: pastDays(8),
      transporter: 'VRL Logistics',
      vehicle_number: 'MP-09-HH-5678',
      driver_name: 'Ramesh Verma',
      currency: 'INR',
      subtotal: 120000.00,
      gst_amount: 21600.00,
      total_amount: 141600.00,
      delivery_address: po1.delivery_address,
      line_items: po1Items,
    },
  });

  const dc2 = await prisma.deliveryChallan.upsert({
    where: { delivery_challan_number: 'DC-2026-0002' },
    update: {},
    create: {
      delivery_challan_number: 'DC-2026-0002',
      vendor_id: v2.id,
      purchase_order_id: po2.id,
      created_by_id: caseManager.id,
      status: 'delivered',
      vendor_name: v2.name,
      vendor_code: v2.vendor_code,
      gst_number: v2.gst_number,
      delivery_date: pastDays(4),
      transporter: 'GATI Freight',
      vehicle_number: 'MH-04-AB-9876',
      driver_name: 'Suresh Patil',
      currency: 'INR',
      subtotal: 240000.00,
      gst_amount: 43200.00,
      total_amount: 283200.00,
      delivery_address: po2.delivery_address,
      line_items: po2Items,
    },
  });

  const grn1 = await prisma.goodsReceiptNote.upsert({
    where: { grn_number: 'GRN-2026-0001' },
    update: {},
    create: {
      grn_number: 'GRN-2026-0001',
      vendor_id: v1.id,
      purchase_order_id: po1.id,
      delivery_challan_id: dc1.id,
      created_by_id: caseManager.id,
      status: 'completed',
      vendor_name: v1.name,
      vendor_code: v1.vendor_code,
      gst_number: v1.gst_number,
      receipt_date: pastDays(7),
      delivery_date: pastDays(8),
      delivery_challan_no: dc1.delivery_challan_number,
      receiver_name: 'Mahesh Gupta (Warehouse Manager)',
      received_by: 'Mahesh Gupta',
      currency: 'INR',
      subtotal: 120000.00,
      gst_amount: 21600.00,
      total_amount: 141600.00,
      line_items: po1Items,
      remarks: 'All 10 units of Industrial Motor inspected and verified cleanly.',
    },
  });

  const grn2 = await prisma.goodsReceiptNote.upsert({
    where: { grn_number: 'GRN-2026-0002' },
    update: {},
    create: {
      grn_number: 'GRN-2026-0002',
      vendor_id: v2.id,
      purchase_order_id: po2.id,
      delivery_challan_id: dc2.id,
      created_by_id: caseManager.id,
      status: 'completed',
      vendor_name: v2.name,
      vendor_code: v2.vendor_code,
      gst_number: v2.gst_number,
      receipt_date: pastDays(3),
      delivery_date: pastDays(4),
      delivery_challan_no: dc2.delivery_challan_number,
      receiver_name: 'Sunil Pawar (Dock Specialist)',
      received_by: 'Sunil Pawar',
      currency: 'INR',
      subtotal: 240000.00,
      gst_amount: 43200.00,
      total_amount: 283200.00,
      line_items: po2Items,
      remarks: '50 wooden pallets received in good condition.',
    },
  });

  console.log('[SEED] GRNs and Delivery Challans created.');

  // 6. SEED INVOICES
  const invoicesToSeed = [
    {
      invoice_number: 'INV-2026-0001',
      vendor_id: v1.id,
      purchase_order_id: po1.id,
      created_by_id: caseManager.id,
      invoice_date: pastDays(6),
      due_date: new Date(now.getTime() + 24 * 24 * 60 * 60 * 1000),
      amount: 141600.00,
      invoice_total: 141600.00,
      currency: 'INR',
      status: 'APPROVED',
      required_approval_role: 'FINANCE_HEAD',
      payment_status: 'PAID',
      paid_amount: 141600.00,
      remaining_amount: 0.00,
      three_way_match_status: 'MATCHED',
      three_way_match_percentage: 100.00,
      team_lead_approver_id: teamLead.id,
      team_lead_approved_at: pastDays(5),
      manager_approver_id: manager.id,
      manager_approved_at: pastDays(4),
      finance_head_approver_id: financeHead.id,
      finance_head_approved_at: pastDays(3),
      final_approved_at: pastDays(3),
      line_items: po1Items,
      tax_summary: { subtotal: 120000, totalTax: 21600, grandTotal: 141600 },
      description: 'Tax Invoice for 10 Units Industrial Motor 10HP',
      invoice_creation_method: 'MANUAL',
    },
    {
      invoice_number: 'INV-2026-0002',
      vendor_id: v2.id,
      purchase_order_id: po2.id,
      created_by_id: caseManager.id,
      invoice_date: pastDays(3),
      due_date: new Date(now.getTime() + 27 * 24 * 60 * 60 * 1000),
      amount: 283200.00,
      invoice_total: 283200.00,
      currency: 'INR',
      status: 'PENDING_FINANCE_HEAD',
      required_approval_role: 'FINANCE_HEAD',
      payment_status: 'UNPAID',
      paid_amount: 0.00,
      remaining_amount: 283200.00,
      three_way_match_status: 'MATCHED',
      three_way_match_percentage: 100.00,
      team_lead_approver_id: teamLead.id,
      team_lead_approved_at: pastDays(2),
      manager_approver_id: manager.id,
      manager_approved_at: pastDays(1),
      line_items: po2Items,
      tax_summary: { subtotal: 240000, totalTax: 43200, grandTotal: 283200 },
      description: 'Freight & Pallet Supply Invoice',
      invoice_creation_method: 'MANUAL',
    },
    {
      invoice_number: 'INV-2026-0003',
      vendor_id: v3.id,
      purchase_order_id: po3.id,
      created_by_id: caseManager.id,
      invoice_date: pastDays(1),
      due_date: new Date(now.getTime() + 44 * 24 * 60 * 60 * 1000),
      amount: 424800.00,
      invoice_total: 424800.00,
      currency: 'INR',
      status: 'PENDING_MANAGER',
      required_approval_role: 'MANAGER',
      payment_status: 'UNPAID',
      paid_amount: 0.00,
      remaining_amount: 424800.00,
      three_way_match_status: 'MATCHED',
      three_way_match_percentage: 100.00,
      team_lead_approver_id: teamLead.id,
      team_lead_approved_at: pastDays(1),
      line_items: po3Items,
      tax_summary: { subtotal: 360000, totalTax: 64800, grandTotal: 424800 },
      description: 'Server Rack Hardware Supply Invoice',
      invoice_creation_method: 'MANUAL',
    },
  ];

  const invoiceMap = {};

  for (const inv of invoicesToSeed) {
    let existing = await prisma.invoice.findUnique({ where: { invoice_number: inv.invoice_number } });
    if (!existing) {
      existing = await prisma.invoice.create({ data: inv });
      console.log(`[SEED] Created Invoice: ${inv.invoice_number}`);
    } else {
      console.log(`[SEED] Verified Invoice: ${existing.invoice_number}`);
    }
    invoiceMap[inv.invoice_number] = existing;
  }

  const inv1 = invoiceMap['INV-2026-0001'];
  const inv2 = invoiceMap['INV-2026-0002'];
  const inv3 = invoiceMap['INV-2026-0003'];

  // 7. SEED THREE WAY MATCHES
  const twm1 = await prisma.threeWayMatch.upsert({
    where: { id: `twm-${inv1.id}` },
    update: {},
    create: {
      id: `twm-${inv1.id}`,
      invoice_id: inv1.id,
      purchase_order_id: po1.id,
      grn_id: grn1.id,
      delivery_challan_id: dc1.id,
      status: 'COMPLETED',
      match_percentage: 100.00,
      matched_fields_count: 8,
      total_fields_count: 8,
      matched_fields: ['po_number', 'vendor_code', 'subtotal', 'tax_amount', 'total_amount', 'line_item_count', 'item_prices', 'quantities'],
      approval_recommendation: 'RECOMMENDED_FOR_APPROVAL',
      completed_by_id: caseManager.id,
      completed_at: pastDays(5),
      remarks: 'Automated matching passed with 100% precision.',
      item_match: true,
      po_match: true,
      price_match: true,
      quantity_match: true,
      tax_match: true,
      total_match: true,
      vendor_match: true,
    },
  });

  const twm2 = await prisma.threeWayMatch.upsert({
    where: { id: `twm-${inv2.id}` },
    update: {},
    create: {
      id: `twm-${inv2.id}`,
      invoice_id: inv2.id,
      purchase_order_id: po2.id,
      grn_id: grn2.id,
      delivery_challan_id: dc2.id,
      status: 'COMPLETED',
      match_percentage: 100.00,
      matched_fields_count: 8,
      total_fields_count: 8,
      matched_fields: ['po_number', 'vendor_code', 'subtotal', 'tax_amount', 'total_amount', 'line_item_count', 'item_prices', 'quantities'],
      approval_recommendation: 'RECOMMENDED_FOR_APPROVAL',
      completed_by_id: caseManager.id,
      completed_at: pastDays(2),
      remarks: 'Automated matching verified cleanly.',
      item_match: true,
      po_match: true,
      price_match: true,
      quantity_match: true,
      tax_match: true,
      total_match: true,
      vendor_match: true,
    },
  });

  console.log('[SEED] Three-Way Matches created.');

  // 8. SEED PAYMENTS & PAYMENT APPROVALS
  const pay1 = await prisma.payment.upsert({
    where: { payment_number: 'PAY-2026-0001' },
    update: {},
    create: {
      payment_number: 'PAY-2026-0001',
      invoice_id: inv1.id,
      purchase_order_id: po1.id,
      vendor_id: v1.id,
      three_way_match_id: twm1.id,
      amount: 141600.00,
      currency: 'INR',
      payment_method: 'NEFT',
      payment_provider: 'MANUAL',
      payment_type: 'FULL',
      status: 'PROCESSED',
      approval_status: 'APPROVED',
      provider_transaction_id: 'UTR202610050011',
      payment_date: pastDays(2),
      approved_by_id: financeHead.id,
      approved_at: pastDays(2),
      processed_by_id: financeHead.id,
      created_by_id: caseManager.id,
      remarks: 'Full payment dispatched via HDFC Corporate NEFT.',
    },
  });

  const pay2 = await prisma.payment.upsert({
    where: { payment_number: 'PAY-2026-0002' },
    update: {},
    create: {
      payment_number: 'PAY-2026-0002',
      invoice_id: inv2.id,
      purchase_order_id: po2.id,
      vendor_id: v2.id,
      three_way_match_id: twm2.id,
      amount: 283200.00,
      currency: 'INR',
      payment_method: 'RTGS',
      payment_provider: 'MANUAL',
      payment_type: 'FULL',
      status: 'PENDING_APPROVAL',
      approval_status: 'PENDING',
      created_by_id: caseManager.id,
      remarks: 'Payment request initiated for Apex Global Logistics.',
    },
  });

  // Create PaymentApproval entries
  await prisma.paymentApproval.upsert({
    where: { id: `pa-${inv2.id}` },
    update: {},
    create: {
      id: `pa-${inv2.id}`,
      payment_id: pay2.id,
      invoice_id: inv2.id,
      purchase_order_id: po2.id,
      vendor_id: v2.id,
      three_way_match_id: twm2.id,
      amount: 283200.00,
      currency: 'INR',
      approval_level: 1,
      required_role: ROLES.FINANCE_HEAD,
      approver_id: financeHead.id,
      status: 'PENDING',
      requested_by_id: caseManager.id,
      requested_at: pastDays(1),
    },
  });

  console.log('[SEED] Payments and Payment Approvals created.');

  // 9. SEED AUDIT LOGS & NOTIFICATIONS
  const notificationsToSeed = [
    {
      user_id: financeHead.id,
      title: 'New Invoice Awaiting Approval',
      message: `Invoice INV-2026-0002 for ₹2,83,200.00 from Apex Global Logistics requires your approval.`,
      type: 'INVOICE_APPROVAL_REQUIRED',
      entity_type: 'invoice',
      entity_id: inv2.id,
      role: ROLES.FINANCE_HEAD,
    },
    {
      user_id: manager.id,
      title: 'Invoice Review Assigned',
      message: `Invoice INV-2026-0003 for ₹4,24,800.00 from TechSource Hardware requires Manager review.`,
      type: 'INVOICE_APPROVAL_REQUIRED',
      entity_type: 'invoice',
      entity_id: inv3.id,
      role: ROLES.MANAGER,
    },
    {
      user_id: caseManager.id,
      title: 'Payment Processed',
      message: `Payment PAY-2026-0001 for ₹1,41,600.00 to Acme Industrial Solutions has been processed successfully (UTR: UTR202610050011).`,
      type: 'PAYMENT_PROCESSED',
      entity_type: 'payment',
      entity_id: pay1.id,
      role: ROLES.CASE_MANAGER,
    },
  ];

  for (const n of notificationsToSeed) {
    const exists = await prisma.notification.findFirst({
      where: { user_id: n.user_id, title: n.title },
    });
    if (!exists) {
      await prisma.notification.create({ data: n });
    }
  }

  console.log('[SEED] Database seeding completed successfully!');
};

export default seedRealisticData;
