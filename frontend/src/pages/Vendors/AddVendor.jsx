import {
  ArrowLeft,
  Building2,
  User,
  Landmark,
} from "lucide-react";

import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { RequiredLabel, ValidationSummary } from "../../components/common/FormValidation";
import VendorDocumentsPanel from "../../components/vendors/VendorDocumentsPanel";
import { createVendor, getVendorById, updateVendor } from "../../services/vendorService";
import { fieldErrorClass, focusValidationField, validateRequiredFields } from "../../utils/validationMatrix";
import { getErrorMessage, notify } from "../../utils/feedback";
const input =
  "w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-3 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-blue-600 dark:focus:border-blue-500";

const FieldError = ({ message }) => (
  message ? <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1"><span>⚠</span> {message}</p> : null
);

const initialVendorForm = {
  companyName: "",
  vendorCategory: "Manufacturer",
  vendorType: "",
  taxType: "Regular",
  cin: "",
  msmeNumber: "",
  gst: "",
  pan: "",
  contactPerson: "",
  designation: "",
  email: "",
  phone: "",
  alternatePhone: "",
  website: "",
  department: "",
  country: "",
  state: "",
  district: "",
  city: "",
  postalCode: "",
  addressLine1: "",
  addressLine2: "",
  address: "",
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  ifscCode: "",
  bankBranch: "",
  paymentTerms: "",
  currency: "",
  status: "pending",
  notes: "",
};

const AddVendor = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState(initialVendorForm);
  const [generatedVendorCode, setGeneratedVendorCode] = useState("");
  const [createdVendorId, setCreatedVendorId] = useState("");
  const [vendorDocuments, setVendorDocuments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingVendor, setLoadingVendor] = useState(isEditMode);
  const [validationErrors, setValidationErrors] = useState([]);
  const validationPanelRef = useRef(null);
  const activeVendorId = isEditMode ? id : createdVendorId;
  const isPersistedVendor = Boolean(activeVendorId);
  const errorsByField = validationErrors.reduce((acc, error) => ({ ...acc, [error.field]: error.message }), {});

  useEffect(() => {
    if (!isEditMode) return;
    const loadVendor = async () => {
      try {
        setLoadingVendor(true);
        const vendor = await getVendorById(id);
        setFormData({
          ...initialVendorForm,
          companyName: vendor.companyName || "",
          vendorCategory: vendor.category || "",
          vendorType: vendor.vendorType || "",
          taxType: vendor.taxType || "Regular",
          gst: vendor.gst || "",
          pan: vendor.pan || "",
          cin: vendor.cin || "",
          msmeNumber: vendor.msmeNumber || "",
          contactPerson: vendor.contactPerson || "",
          designation: vendor.contactDesignation || "",
          email: vendor.email || "",
          phone: vendor.phone || "",
          alternatePhone: vendor.alternatePhone || "",
          country: vendor.country || "",
          state: vendor.state || "",
          district: vendor.district || "",
          city: vendor.city || "",
          postalCode: vendor.postalCode || "",
          addressLine1: vendor.addressLine1 || vendor.address || "",
          addressLine2: vendor.addressLine2 || "",
          address: vendor.address || "",
          bankName: vendor.bankName || "",
          accountHolder: vendor.accountHolder || "",
          accountNumber: vendor.bankAccountNo || "",
          ifscCode: vendor.ifscCode || "",
          bankBranch: vendor.bankBranch || "",
          paymentTerms: vendor.paymentTerms || "",
          status: vendor.status || "pending",
        });
        setGeneratedVendorCode(vendor.vendorCode || "");
        setVendorDocuments(vendor.documents || []);
      } catch (error) {
        notify.error(getErrorMessage(error, "Vendor could not be loaded."));
      } finally {
        setLoadingVendor(false);
      }
    };
    loadVendor();
  }, [id, isEditMode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let finalValue = value;
    if (name === "phone" || name === "alternatePhone" || name === "postalCode" || name === "accountNumber") {
      finalValue = value.replace(/\D/g, "");
    }
    if (name === "pan" || name === "gst" || name === "ifscCode") {
      finalValue = value.toUpperCase();
    }
    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const errors = validateRequiredFields("vendor", formData);
    setValidationErrors(errors);
    if (errors.length) {
      notify.error("Cannot save Vendor. Please complete the highlighted fields.");
      window.setTimeout(() => focusValidationField(errors[0].field, {}, validationPanelRef), 0);
      return;
    }
    try {
      setSubmitting(true);
      const vendor = isPersistedVendor ? await updateVendor(activeVendorId, formData) : await createVendor(formData);
      const code = vendor?.vendor_code || vendor?.vendorCode || "";
      setGeneratedVendorCode(code);
      setCreatedVendorId(vendor?.id || id || "");
      setVendorDocuments(vendor?.documents || []);
      notify.success(isPersistedVendor ? "Vendor updated successfully." : code ? `Vendor created successfully. Code: ${code}` : "Vendor created successfully.");
    } catch (error) {
      const data = error?.response?.data;
      const status = error?.response?.status;
      if (status === 409 && data?.errors && typeof data.errors === "object") {
        const fieldErrors = [];
        const labelMap = {
          companyName: "Company Name",
          name: "Company Name",
          email: "Email",
          gst: "GST Number",
          gstNumber: "GST Number",
          taxId: "GST Number",
          pan: "PAN Number",
          panNumber: "PAN Number",
          vendorCode: "Vendor Code",
        };
        const fieldMap = {
          email: "email",
          gstNumber: "gst",
          gst: "gst",
          taxId: "gst",
          panNumber: "pan",
          pan: "pan",
          companyName: "companyName",
          name: "companyName",
          vendorCode: "companyName",
        };
        Object.entries(data.errors).forEach(([field, msg]) => {
          const formField = fieldMap[field] || field;
          const labelText = labelMap[field] || formField;
          const messageText = Array.isArray(msg) ? msg[0] : String(msg);
          if (!fieldErrors.some((e) => e.field === formField)) {
            fieldErrors.push({ field: formField, label: labelText, message: messageText });
          }
        });
        setValidationErrors(fieldErrors);
        const mainMsg = data.message || "Vendor already exists with duplicate details.";
        notify.error(mainMsg);
        if (fieldErrors.length) {
          window.setTimeout(() => focusValidationField(fieldErrors[0].field, {}, validationPanelRef), 0);
        }
      } else {
        notify.error(getErrorMessage(error, isPersistedVendor ? "Vendor could not be updated." : "Vendor could not be created."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingVendor) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">Loading vendor...</div>;
  }

  return (
    <div className="space-y-8">
      {validationErrors.length > 0 && (
        <div ref={validationPanelRef}>
          <ValidationSummary
            title={isPersistedVendor ? "Cannot update Vendor." : "Cannot save Vendor."}
            errors={validationErrors}
            onSelect={(field) => focusValidationField(field, {}, validationPanelRef)}
          />
        </div>
      )}

      {/* Header */}

      <div className="flex items-center justify-between">

        <div>
          <Link
            to="/vendors"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600"
          >
            <ArrowLeft size={18} />
            Back to Vendors
          </Link>

          <h1 className="mt-4 text-4xl font-bold">
            {isEditMode ? "Edit Vendor" : "Add New Vendor"}
          </h1>

          <p className="mt-2 text-slate-500">
            {isEditMode ? "Update vendor information, banking details, and compliance documents." : "Create and register a new supplier in ProcureFlow ERP."}
          </p>
        </div>

      </div>

      {/* COMPANY INFORMATION */}

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">

        <div className="flex items-center gap-3 border-b p-6">

          <Building2 className="text-blue-600" />

          <h2 className="text-xl font-semibold">
            Company Information
          </h2>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6">

          <div>
            <RequiredLabel helper="Legal vendor name used across PO, invoice, matching, and payment.">Company Name</RequiredLabel>

            <input
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              className={`${input} ${fieldErrorClass(errorsByField.companyName)}`}
              placeholder="ABC Industries Pvt Ltd"
            />
            <FieldError message={errorsByField.companyName} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Vendor Code
            </label>

            <input
              readOnly
              value={generatedVendorCode || "Generated automatically after creation"}
              className={`${input} bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400`}
            />
          </div>

          <div>
            <RequiredLabel>Vendor Category</RequiredLabel>

            <select
              className={`${input} ${fieldErrorClass(errorsByField.vendorCategory)}`}
              name="vendorCategory"
              value={formData.vendorCategory}
              onChange={handleChange}
            >
              <option value="">Select Category</option>
              <option value="Manufacturer">Manufacturer</option>
              <option value="Supplier">Supplier</option>
              <option value="Distributor">Distributor</option>
              <option value="Service Provider">Service Provider</option>
            </select>
          </div>

          <div>
            <RequiredLabel>Vendor Type</RequiredLabel>

            <select className={`${input} ${fieldErrorClass(errorsByField.vendorType)}`} name="vendorType" value={formData.vendorType} onChange={handleChange}>
              <option value="">Select Type</option>
              <option value="Domestic">Domestic</option>
              <option value="International">International</option>
            </select>
          </div>

          <div>
            <RequiredLabel helper="Required for tax calculation in PO, invoice, and matching.">GST Number</RequiredLabel>

            <input
              type="text"
              name="gst"
              value={formData.gst}
              onChange={handleChange}
              placeholder="Enter GST Number"
              className={`${input} ${fieldErrorClass(errorsByField.gst)}`}
            />
            <FieldError message={errorsByField.gst} />
          </div>

          <div>
            <RequiredLabel>PAN Number</RequiredLabel>

            <input
              className={`${input} ${fieldErrorClass(errorsByField.pan)}`}
              name="pan"
              value={formData.pan}
              onChange={handleChange}
              placeholder="ABCDE1234F"
            />
            <FieldError message={errorsByField.pan} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">CIN (Optional)</label>
            <input className={input} name="cin" value={formData.cin} onChange={handleChange} placeholder="U12345MP2026PTC000001" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">MSME Number (Optional)</label>
            <input className={input} name="msmeNumber" value={formData.msmeNumber} onChange={handleChange} placeholder="UDYAM-MP-00-0000000" />
          </div>

          <div>
            <RequiredLabel>Tax Type</RequiredLabel>
            <select className={`${input} ${fieldErrorClass(errorsByField.taxType)}`} name="taxType" value={formData.taxType} onChange={handleChange}>
              <option value="Regular">Regular</option>
              <option value="Composition">Composition</option>
              <option value="Exempt">Exempt</option>
            </select>
          </div>

        </div>

      </div>

      {/* PRIMARY CONTACT */}

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">

        <div className="flex items-center gap-3 border-b p-6">

          <User className="text-blue-600" />

          <h2 className="text-xl font-semibold">
            Primary Contact
          </h2>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6">

          <div>
            <RequiredLabel>Contact Person</RequiredLabel>

            <input
              type="text"
              name="contactPerson"
              value={formData.contactPerson}
              onChange={handleChange}
              placeholder="Enter Contact Person"
              className={`${input} ${fieldErrorClass(errorsByField.contactPerson)}`}
            />
          </div>

          <div>
            <RequiredLabel>Designation</RequiredLabel>

            <input
              className={`${input} ${fieldErrorClass(errorsByField.designation)}`}
              placeholder="Sales Manager"
              name="designation"
              value={formData.designation}
              onChange={handleChange}
            />
          </div>

          <div>
            <RequiredLabel>Email</RequiredLabel>

            <input
              className={`${input} ${fieldErrorClass(errorsByField.email)}`}
              placeholder="john@company.com"
              name="email"
              value={formData.email}
              onChange={handleChange}
            />
            <FieldError message={errorsByField.email} />
          </div>

          <div>
            <RequiredLabel>Phone Number</RequiredLabel>

            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={`${input} ${fieldErrorClass(errorsByField.phone)}`}
              placeholder="9876543210"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Alternate Phone (Optional)</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={input}
              placeholder="9876543211"
              name="alternatePhone"
              value={formData.alternatePhone}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Website
            </label>

            <input
              className={input}
              placeholder="www.company.com"
              name="website"
              value={formData.website}
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Department
            </label>

            <input
              className={input}
              placeholder="Procurement"
              name="department"
              value={formData.department}
              onChange={handleChange}
            />
          </div>

        </div>

      </div>

      {/* BUSINESS ADDRESS */}

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">

        <div className="flex items-center gap-3 border-b p-6">

          <Landmark className="text-blue-600" />

          <h2 className="text-xl font-semibold">
            Business Address
          </h2>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6">

          <div>
            <RequiredLabel>Country</RequiredLabel>

            <select className={`${input} ${fieldErrorClass(errorsByField.country)}`} name="country" value={formData.country} onChange={handleChange}>
              <option value="">Select Country</option>
              <option value="India">India</option>
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
            </select>
          </div>

          <div>
            <RequiredLabel>State</RequiredLabel>

            <input className={`${input} ${fieldErrorClass(errorsByField.state)}`} placeholder="Madhya Pradesh" name="state" value={formData.state} onChange={handleChange} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              District
            </label>

            <input className={input} placeholder="Indore" name="district" value={formData.district} onChange={handleChange} />
          </div>

          <div>
            <RequiredLabel>City</RequiredLabel>

            <input className={`${input} ${fieldErrorClass(errorsByField.city)}`} placeholder="Indore" name="city" value={formData.city} onChange={handleChange} />
          </div>

          <div>
            <RequiredLabel>Postal Code</RequiredLabel>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              className={`${input} ${fieldErrorClass(errorsByField.postalCode)}`}
              placeholder="452001"
              name="postalCode"
              value={formData.postalCode}
              onChange={handleChange}
            />
          </div>

          <div>
            <RequiredLabel>Address Line 1</RequiredLabel>
            <input className={`${input} ${fieldErrorClass(errorsByField.addressLine1)}`} placeholder="Plot 42, Industrial Area" name="addressLine1" value={formData.addressLine1} onChange={handleChange} />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Address Line 2 (Optional)</label>
            <input className={input} placeholder="Near Logistics Park" name="addressLine2" value={formData.addressLine2} onChange={handleChange} />
          </div>

          <div className="col-span-1 sm:col-span-2">
            <label className="mb-2 block text-sm font-medium">
              Full Address
            </label>

            <textarea
              rows={4}
              className={input}
              placeholder="Enter complete business address"
              name="address"
              value={formData.address || [formData.addressLine1, formData.addressLine2, formData.city, formData.state, formData.postalCode, formData.country].filter(Boolean).join(", ")}
              onChange={handleChange}
            />
          </div>

        </div>

      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">

        <div className="border-b p-6">

          <h2 className="text-xl font-semibold">
            Financial Information
          </h2>

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6">

          <input className={`${input} ${fieldErrorClass(errorsByField.bankName)}`} placeholder="Bank Name *" name="bankName" value={formData.bankName} onChange={handleChange} />

          <input className={`${input} ${fieldErrorClass(errorsByField.accountHolder)}`} placeholder="Account Holder *" name="accountHolder" value={formData.accountHolder} onChange={handleChange} />

          <input
            type="text"
            inputMode="numeric"
            maxLength={18}
            className={`${input} ${fieldErrorClass(errorsByField.accountNumber)}`}
            placeholder="Account Number *"
            name="accountNumber"
            value={formData.accountNumber}
            onChange={handleChange}
          />

          <input className={`${input} ${fieldErrorClass(errorsByField.ifscCode)}`} placeholder="IFSC Code *" name="ifscCode" value={formData.ifscCode} onChange={handleChange} />

          <input className={`${input} ${fieldErrorClass(errorsByField.bankBranch)}`} placeholder="Branch *" name="bankBranch" value={formData.bankBranch} onChange={handleChange} />

          <select className={input} name="paymentTerms" value={formData.paymentTerms} onChange={handleChange}>
            <option>Net 15</option>
            <option>Net 30</option>
            <option>Net 45</option>
            <option>Net 60</option>
          </select>

          <select className={input} name="currency" value={formData.currency} onChange={handleChange}>
            <option>INR</option>
            <option>USD</option>
            <option>EUR</option>
          </select>

          <select className={input} name="status" value={formData.status} onChange={handleChange} disabled={!isEditMode}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="blocked">Blocked</option>
          </select>

        </div>

      </div>

      <VendorDocumentsPanel vendorId={activeVendorId} initialDocuments={vendorDocuments} />

      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-950/40">

        <div className="border-b p-6">

          <h2 className="text-xl font-semibold">
            Additional Notes
          </h2>

        </div>

        <div className="p-6">

          <textarea
            rows={5}
            className={input}
            placeholder="Enter additional notes..."
            name="additionalNotes"
            value={formData.additionalNotes}
            onChange={handleChange}
          />

        </div>

      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4">

        <button className="rounded-xl border border-slate-300 dark:border-slate-800 px-6 py-3 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900">
          Cancel
        </button>

        <button className="rounded-xl bg-slate-800 dark:bg-slate-700 px-6 py-3 font-medium text-white hover:bg-slate-900 dark:hover:bg-slate-650">
          Save Draft
        </button>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
        >
          {submitting ? (isPersistedVendor ? "Saving..." : "Creating...") : isPersistedVendor ? "Save Changes" : "Create Vendor"}
        </button>

      </div>

    </div>
  );
};

export default AddVendor;
