import { ArrowLeft, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { createUser } from "../../services/userService";
import {
  getRolesLookup,
  getBranchesLookup,
  getDesignationsLookup,
  getRegionsLookup,
} from "../../services/lookupService";
import { getErrorMessage, notify } from "../../utils/feedback";
import { formatRoleLabel } from "../../utils/displayFormatters";
import { inputClass as sharedInputClass } from "../../utils/formStyles";
import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/permissions";
import FilterSelect from "../../components/common/FilterSelect";

const inputClass = `${sharedInputClass} h-12 w-full px-4`;
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2";
const ROLE_RANK = {
  [ROLES.SUPER_ADMIN]: 5,
  [ROLES.FINANCE_HEAD]: 4,
  [ROLES.MANAGER]: 3,
  [ROLES.TEAM_LEAD]: 2,
  [ROLES.CASE_MANAGER]: 1,
};
const passwordRules = [
  { label: "At least 8 characters", test: (value) => value.length >= 8 },
  { label: "One uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "One lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "One number", test: (value) => /[0-9]/.test(value) },
  { label: "One special character", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const UserCreate = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  
  // ── Form Values State ──────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    designation: "",
    branch: "",
    region: "",
    role: "",
    password: "",
    confirmPassword: "",
    superAdminConfirmed: false,
  });

  // ── Validation and Loading States ──────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const visibleRoles = roles.filter((role) => {
    if (currentUser?.role === ROLES.SUPER_ADMIN) return true;
    const requesterRank = ROLE_RANK[currentUser?.role] || 0;
    const targetRank = ROLE_RANK[role.value] || 0;
    return role.value !== ROLES.SUPER_ADMIN && targetRank > 0 && targetRank < requesterRank;
  });

  // ── Password Rules Check ───────────────────────────────────────────────────
  // ── Load Lookups from APIs ─────────────────────────────────────────────────
  useEffect(() => {
    const loadLookups = async () => {
      try {
        setLoadingLookups(true);
        const [rData, bData, desData, regionData] = await Promise.all([
          getRolesLookup(),
          getBranchesLookup(),
          getDesignationsLookup(),
          getRegionsLookup(),
        ]);
        setRoles(rData);
        setBranches(bData);
        setDesignations(desData);
        setRegions(regionData);
      } catch (err) {
        console.error(err);
        notify.error(getErrorMessage(err, "Failed to load lookup configurations. Some selectors may be empty."));
      } finally {
        setLoadingLookups(false);
      }
    };
    loadLookups();
  }, []);

  // ── Clear context fields on role change ─────────────────────────────────────
  const handleRoleChange = (selectedRole) => {
    setFormData((prev) => ({
      ...prev,
      role: selectedRole,
      superAdminConfirmed: false,
    }));
    setFieldErrors((prev) => ({
      ...prev,
      role: null,
      superAdminConfirmed: null,
    }));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let finalValue = type === "checkbox" ? checked : value;
    if (name === "phone" || name === "alternatePhone") {
      finalValue = value.replace(/\D/g, "");
    }
    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
    // Clear field-specific error as user types
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // ── Client-side Validation ─────────────────────────────────────────────────
  const validateForm = () => {
    const errors = {};

    if (!formData.firstName.trim()) {
      errors.firstName = "First name is required";
    }
    if (!formData.lastName.trim()) {
      errors.lastName = "Last name is required";
    }
    if (!formData.email.trim()) {
      errors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Invalid email format";
    }
    const phonePattern = /^\d{10}$/;
    const phone = formData.phone.trim();
    const alternatePhone = formData.alternatePhone.trim();
    if (phone && !phonePattern.test(phone)) {
      errors.phone = "Phone number must contain exactly 10 digits.";
    }
    if (alternatePhone && !phonePattern.test(alternatePhone)) {
      errors.alternatePhone = "Phone number must contain exactly 10 digits.";
    }
    if (phone && alternatePhone && phone === alternatePhone) {
      errors.alternatePhone = "Alternate phone must be different from phone";
    }

    if (!formData.role) {
      errors.role = "Please select a system role";
    }

    const failedPasswordRule = passwordRules.find((rule) => !rule.test(formData.password));
    if (failedPasswordRule) {
      errors.password = "Password does not meet all requirements";
    }
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    // Super Admin confirmation guard
    if (formData.role === "SUPER_ADMIN" && !formData.superAdminConfirmed) {
      errors.superAdminConfirmed = "You must confirm explicit administrative scoping";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Form Submit handler ────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      notify.error("Please correct the validation issues before submitting.");
      return;
    }

    setSubmitting(true);

    // Build only database-supported fields payload (exclude irrelevant context fields)
    const payload = {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone.trim(),
      alternatePhone: formData.alternatePhone.trim(),
      designation: formData.designation.trim(),
      branch: formData.branch.trim(),
      region: formData.region.trim(),
      role: formData.role,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
    };

    try {
      await createUser(payload);
      notify.success("User created successfully.");
      
      // Reset form credentials
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        alternatePhone: "",
        designation: "",
        branch: "",
        region: "",
        role: "",
        password: "",
        confirmPassword: "",
        superAdminConfirmed: false,
      });

      navigate("/users");
    } catch (err) {
      console.error("[UserCreate] Submit error:", err);
      const status = err?.response?.status;
      if (status === 409) {
        setFieldErrors((prev) => ({ ...prev, email: "An account with this email address already exists." }));
        notify.error("An account with this email address already exists.");
      } else if (status === 403) {
        notify.error("You do not have permission to create a user with this role.");
      } else if (status === 400 && err?.response?.data?.errors) {
        const formattedErrors = {};
        Object.entries(err.response.data.errors).forEach(([field, msgs]) => {
          formattedErrors[field] = Array.isArray(msgs) ? msgs.join(", ") : msgs;
        });
        setFieldErrors(formattedErrors);
        notify.error("Validation failed. Please correct the highlighted fields.");
      } else {
        notify.error(getErrorMessage(err, "Failed to create user account."));
      }
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center gap-3">
        <Link to="/users">
          <button className="rounded-lg p-2 hover:bg-slate-100 transition" aria-label="Back to User directory">
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Add New User</h1>
          <p className="mt-1 text-slate-500">Create a new system user profile and credentials</p>
        </div>
      </div>

      {/* Main Form container */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 lg:p-8 shadow-sm dark:shadow-slate-950/40">
        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          
          {/* Profile Details */}
          <div>
            <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">
              Personal Information
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="firstName" className={labelClass}>First Name *</label>
                <input
                  id="firstName"
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="Enter first name"
                  className={`${inputClass} ${fieldErrors.firstName ? 'border-red-500' : ''}`}
                  disabled={submitting}
                  required
                />
                {fieldErrors.firstName && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className={labelClass}>Last Name *</label>
                <input
                  id="lastName"
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Enter last name"
                  className={`${inputClass} ${fieldErrors.lastName ? 'border-red-500' : ''}`}
                  disabled={submitting}
                  required
                />
                {fieldErrors.lastName && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.lastName}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className={labelClass}>Email Address *</label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="user@company.com"
                  className={`${inputClass} ${fieldErrors.email ? 'border-red-500' : ''}`}
                  disabled={submitting}
                  required
                />
                {fieldErrors.email && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor="phone" className={labelClass}>Phone</label>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="9876543210"
                  inputMode="numeric"
                  maxLength={10}
                  className={`${inputClass} ${fieldErrors.phone ? 'border-red-500' : ''}`}
                  disabled={submitting}
                />
                {fieldErrors.phone && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label htmlFor="alternatePhone" className={labelClass}>Alternate Phone</label>
                <input
                  id="alternatePhone"
                  type="tel"
                  name="alternatePhone"
                  value={formData.alternatePhone}
                  onChange={handleChange}
                  placeholder="9876543211"
                  inputMode="numeric"
                  maxLength={10}
                  className={`${inputClass} ${fieldErrors.alternatePhone ? 'border-red-500' : ''}`}
                  disabled={submitting}
                />
                {fieldErrors.alternatePhone && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.alternatePhone}</p>
                )}
              </div>

              <div>
                <label htmlFor="designation" className={labelClass}>Designation</label>
                <input
                  id="designation"
                  type="text"
                  name="designation"
                  value={formData.designation}
                  onChange={handleChange}
                  list="designation-options"
                  placeholder="Enter designation"
                  className={inputClass}
                  disabled={submitting}
                />
                <datalist id="designation-options">
                  {designations.map((item) => (
                    <option key={item.value} value={item.value} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="branch" className={labelClass}>Branch</label>
                <input
                  id="branch"
                  type="text"
                  name="branch"
                  value={formData.branch}
                  onChange={handleChange}
                  list="branch-options"
                  placeholder="Enter branch"
                  className={inputClass}
                  disabled={submitting}
                />
                <datalist id="branch-options">
                  {branches.map((item) => (
                    <option key={item.value} value={item.value} />
                  ))}
                </datalist>
              </div>

              <div>
                <label htmlFor="region" className={labelClass}>Region</label>
                <input
                  id="region"
                  type="text"
                  name="region"
                  value={formData.region}
                  onChange={handleChange}
                  list="region-options"
                  placeholder="Enter region"
                  className={inputClass}
                  disabled={submitting}
                />
                <datalist id="region-options">
                  {regions.map((item) => (
                    <option key={item.value} value={item.value} />
                  ))}
                </datalist>
              </div>

              {/* Role Permission Guard (Loaded dynamically) */}
              <div>
                <label htmlFor="role" className={labelClass}>Role Permission Guard *</label>
                <FilterSelect
                  ariaLabel="Role Permission Guard"
                  value={formData.role}
                  onChange={handleRoleChange}
                  options={visibleRoles.map((r) => ({
                    value: r.value,
                    label: formatRoleLabel(r.value || r.name),
                  }))}
                  placeholder="Select system role"
                  className={fieldErrors.role ? "rounded-xl ring-2 ring-red-500/20" : ""}
                  disabled={submitting || loadingLookups}
                />
                {loadingLookups && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-500 shrink-0" />
                    Loading roles list...
                  </p>
                )}
                {fieldErrors.role && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.role}</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-6 border-b border-slate-100 dark:border-slate-800 pb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Login Credentials
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="password" className={labelClass}>Temporary Password *</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create temporary password"
                    className={`${inputClass} pr-12 ${fieldErrors.password ? 'border-red-500' : ''}`}
                    disabled={submitting}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    aria-label="Toggle password visibility"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.password}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className={labelClass}>Confirm Temporary Password *</label>
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm temporary password"
                  className={`${inputClass} ${fieldErrors.confirmPassword ? 'border-red-500' : ''}`}
                  disabled={submitting}
                  autoComplete="new-password"
                  required
                />
                {fieldErrors.confirmPassword && (
                  <p className="mt-1.5 text-xs font-medium text-red-600">{fieldErrors.confirmPassword}</p>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <p className="font-semibold">Password requirements</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {passwordRules.map((rule) => {
                  const valid = rule.test(formData.password);
                  return (
                    <li key={rule.label} className={valid ? "text-green-700" : "text-blue-800"}>
                      {valid ? "✓" : "•"} {rule.label}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3">
                The employee will receive this temporary password by email and must change it after first login.
              </p>
            </div>
          </div>

          {/* Dynamic Role-Based Capabilities */}
          {formData.role === "SUPER_ADMIN" && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 space-y-6">
              
              {/* SUPER_ADMIN high-privilege warnings & confirmation */}
              <div className="space-y-4">
                  <div className="flex gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
                    <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-semibold">⚠️ High Privilege Warning</p>
                      <p className="mt-1 leading-relaxed text-red-700">
                        Assigning the <strong>Super Admin</strong> role grants full management capabilities across the entire platform, including user provisioning, payment systems, audits, and platform configuration.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      name="superAdminConfirmed"
                      checked={formData.superAdminConfirmed}
                      onChange={handleChange}
                      className="mt-1 rounded border-slate-300 text-red-600 focus:ring-red-500"
                      disabled={submitting}
                    />
                    <span className="text-sm font-medium text-slate-700">
                      I explicitly confirm that this user requires full Super Administrative access and system privileges.
                    </span>
                  </label>
                  {fieldErrors.superAdminConfirmed && (
                    <p className="text-xs font-semibold text-red-600 mt-1">{fieldErrors.superAdminConfirmed}</p>
                  )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-6 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => navigate("/users")}
              disabled={submitting}
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 py-3.5 text-center font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating User...
                </>
              ) : (
                "Create User Account"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserCreate;
export { UserCreate };

