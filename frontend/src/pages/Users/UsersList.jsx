import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Lock,
  Unlock,
  Trash2,
  RefreshCw,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Eye,
  Edit2,
  Key,
  X,
  ShieldAlert,
  Clock,
  Loader2,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import ViewDetailsButton from "../../components/common/ViewDetailsButton";
import Pagination from "../../components/common/Pagination";
import { useAuth } from "../../context/AuthContext";
import {
  hasPermission,
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
} from "../../config/permissions";
import {
  getUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  adminResetPassword,
} from "../../services/userService";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import {
  getBranchesLookup,
  getDesignationsLookup,
  getRegionsLookup,
  getRolesLookup,
} from "../../services/lookupService";
import StatusBadge from "../../components/common/StatusBadge";
import {
  USER_ACCOUNT_STATUS,
  USER_ACCOUNT_STATUS_OPTIONS,
} from "../../constants/userAccountStatus";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import { getErrorMessage, notify } from "../../utils/feedback";
import { formatRoleLabel } from "../../utils/displayFormatters";
import { inputClass as sharedInputClass } from "../../utils/formStyles";
import FilterSelect from "../../components/common/FilterSelect";

const ROLE_RANK = {
  SUPER_ADMIN: 5,
  FINANCE_HEAD: 4,
  MANAGER: 3,
  TEAM_LEAD: 2,
  CASE_MANAGER: 1,
};

// ── SortHeader Component ─────────────────────────────────────────────────────
const SortHeader = ({ label, field, sortField, sortOrder, onSort }) => {
  const isCurrent = sortField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="flex items-center gap-1 hover:text-slate-900 font-semibold transition"
    >
      {label}
      {isCurrent ? (
        sortOrder === "asc" ? (
          <ChevronUp size={14} className="text-blue-600" />
        ) : (
          <ChevronDown size={14} className="text-blue-600" />
        )
      ) : (
        <ArrowUpDown size={12} className="text-slate-400" />
      )}
    </button>
  );
};

const UsersList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const canDeleteUsers =
    hasPermission(currentUser, PERMISSIONS.DELETE_USERS) ||
    hasPermission(currentUser, PERMISSIONS.MANAGE_USERS);

  // ── User Directory State ───────────────────────────────────────────────────
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({
    activeAccounts: 0,
    deactivatedAccounts: 0,
    totalAccounts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Filters & Search ───────────────────────────────────────────────────────
  const [filters, setFilters] = useState({
    search: searchParams.get("search") || "",
    role: searchParams.get("role") || "",
    status: searchParams.get("status") || "",
    page: Number(searchParams.get("page")) || 1,
    limit: Number(searchParams.get("limit")) || 10,
    sortField: searchParams.get("sortField") || "created_at",
    sortOrder: searchParams.get("sortOrder") || "desc",
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const searchTimer = useRef(null);

  // ── Detail & Drawer State ──────────────────────────────────────────────────
  const [selectedUser, setSelectedUser] = useState(null);
  const [drawerMode, setDrawerMode] = useState(null); // 'details' | 'edit' | null
  const [drawerLoading, setDrawerLoading] = useState(false);

  // ── Edit Form State ────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    alternatePhone: "",
    designation: "",
    branch: "",
    region: "",
    role: "",
    status: "",
    superAdminConfirmed: false,
  });
  const [editErrors, setEditErrors] = useState({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ── Reset Password Modal State ─────────────────────────────────────────────
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetErrors, setResetErrors] = useState([]);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationSubmitting, setConfirmationSubmitting] = useState(false);

  // ── Lookups cache ──────────────────────────────────────────────────────────
  const [lookupRoles, setLookupRoles] = useState([]);
  const [lookupBranches, setLookupBranches] = useState([]);
  const [lookupDesignations, setLookupDesignations] = useState([]);
  const [lookupRegions, setLookupRegions] = useState([]);
  const manageableRoles = lookupRoles.filter((role) => {
    if (currentUser?.role === "SUPER_ADMIN") return true;
    const requesterRank = ROLE_RANK[currentUser?.role] || 0;
    const targetRank = ROLE_RANK[role.value] || 0;
    return (
      role.value !== "SUPER_ADMIN" &&
      targetRank > 0 &&
      targetRank < requesterRank
    );
  });

  // ── Load User Directory ────────────────────────────────────────────────────
  const loadUsers = useCallback(async (params) => {
    try {
      setLoading(true);
      setError(null);
      const query = { ...params };
      if (!query.search.trim()) delete query.search;
      if (!query.role) delete query.role;
      if (!query.status) delete query.status;

      const res = await getUsers(query);
      setUsers(res.users || []);
      setTotal(res.pagination.totalRecords || 0);
      setTotalPages(res.pagination.totalPages || 1);
      setSummary(
        res.summary || {
          activeAccounts: 0,
          deactivatedAccounts: 0,
          totalAccounts: 0,
        },
      );
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.message || "Failed to load user directory.";
      setError(msg);
      notify.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = {};
    if (filters.search) params.search = filters.search;
    if (filters.role) params.role = filters.role;
    if (filters.status) params.status = filters.status;
    if (filters.page > 1) params.page = String(filters.page);
    if (filters.limit !== 10) params.limit = String(filters.limit);
    if (filters.sortField !== "created_at")
      params.sortField = filters.sortField;
    if (filters.sortOrder !== "desc") params.sortOrder = filters.sortOrder;

    setSearchParams(params, { replace: true });
    loadUsers(filters);
  }, [filters, loadUsers, setSearchParams]);

  // Load static role lookup lists once
  useEffect(() => {
    const fetchLookups = async () => {
      try {
        const [r, branches, designations, regions] = await Promise.all([
          getRolesLookup(),
          getBranchesLookup(),
          getDesignationsLookup(),
          getRegionsLookup(),
        ]);
        setLookupRoles(r);
        setLookupBranches(branches);
        setLookupDesignations(designations);
        setLookupRegions(regions);
      } catch (err) {
        console.error(err);
      }
    };
    fetchLookups();
  }, []);

  // ── Debounced Search Handler ───────────────────────────────────────────────
  const handleSearchChange = (val) => {
    setSearchDraft(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: val, page: 1 }));
    }, 400);
  };

  const handleFilterChange = (key, val) => {
    setFilters((prev) => ({ ...prev, [key]: val, page: 1 }));
  };

  const handleClearFilters = () => {
    setSearchDraft("");
    setFilters((prev) => ({
      ...prev,
      search: "",
      role: "",
      status: "",
      page: 1,
    }));
  };

  const handleSort = (field) => {
    const isAsc = filters.sortField === field && filters.sortOrder === "asc";
    setFilters((prev) => ({
      ...prev,
      sortField: field,
      sortOrder: isAsc ? "desc" : "asc",
      page: 1,
    }));
  };

  // ── Open Drawer ────────────────────────────────────────────────────────────
  const openDrawer = async (userId, mode = "details") => {
    try {
      setDrawerLoading(true);
      setDrawerMode(mode);
      const user = await getUserById(userId);
      setSelectedUser(user);

      // Populate edit fields
      setEditForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
        alternatePhone: user.alternatePhone || "",
        designation: user.designation || "",
        branch: user.branch || "",
        region: user.region || "",
        role: user.role || "",
        status: user.status || USER_ACCOUNT_STATUS.ACTIVE,
        superAdminConfirmed: user.role === "SUPER_ADMIN",
      });
      setEditErrors({});
    } catch (err) {
      console.error(err);
      notify.error(getErrorMessage(err, "Failed to load user detail profile."));
      setDrawerMode(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // ── Handle Edit Form Inputs ────────────────────────────────────────────────
  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    let finalValue = type === "checkbox" ? checked : value;
    if (name === "phone" || name === "alternatePhone") {
      finalValue = value.replace(/\D/g, "");
    }
    setEditForm((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
    if (editErrors[name]) {
      setEditErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleEditRoleChange = (role) => {
    setEditForm((prev) => ({
      ...prev,
      role,
      superAdminConfirmed:
        role === "SUPER_ADMIN" ? prev.superAdminConfirmed : false,
    }));
  };

  // ── Submit User Edits ──────────────────────────────────────────────────────
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) return;

    const errors = {};
    if (!editForm.firstName.trim()) errors.firstName = "First name is required";
    if (!editForm.lastName.trim()) errors.lastName = "Last name is required";
    if (!editForm.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) {
      errors.email = "Invalid email format";
    }
    if (editForm.role === "SUPER_ADMIN" && !editForm.superAdminConfirmed) {
      errors.superAdminConfirmed =
        "Confirmation required to assign Super Admin authority";
    }
    const phonePattern = /^\d{10}$/;
    const phone = editForm.phone.trim();
    const alternatePhone = editForm.alternatePhone.trim();
    if (phone && !phonePattern.test(phone)) {
      errors.phone = "Phone number must contain exactly 10 digits.";
    }
    if (alternatePhone && !phonePattern.test(alternatePhone)) {
      errors.alternatePhone = "Phone number must contain exactly 10 digits.";
    }
    if (phone && alternatePhone && phone === alternatePhone) {
      errors.alternatePhone = "Alternate phone must be different from phone";
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    try {
      setEditSubmitting(true);
      await updateUser(selectedUser.id, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim().toLowerCase(),
        phone: editForm.phone.trim(),
        alternatePhone: editForm.alternatePhone.trim(),
        designation: editForm.designation.trim(),
        branch: editForm.branch.trim(),
        region: editForm.region.trim(),
        role: editForm.role,
      });

      notify.success("User profile updated successfully.");
      setDrawerMode(null);
      setSelectedUser(null);
      await loadUsers(filters); // Refetch list
    } catch (err) {
      console.error(err);
      const status = err?.response?.status;
      if (status === 409) {
        setEditErrors((prev) => ({
          ...prev,
          email: "An account with this email already exists.",
        }));
        notify.error("An account with this email already exists.");
      } else if (
        err?.response?.data?.code === "VALIDATION_ERROR" &&
        err?.response?.data?.errors
      ) {
        const formattedErrors = {};
        Object.entries(err.response.data.errors).forEach(([field, msgs]) => {
          formattedErrors[field] = Array.isArray(msgs) ? msgs.join(", ") : msgs;
        });
        setEditErrors(formattedErrors);
      } else {
        notify.error(getErrorMessage(err, "Failed to save user updates."));
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Account Lifecycle actions (Part 10) ────────────────────────────────────
  const findUserForAction = (id) => {
    if (selectedUser?.id === id) return selectedUser;
    return users.find((user) => user.id === id) || null;
  };

  const openStatusConfirmation = (id, currentStatus) => {
    const nextStatus =
      currentStatus === USER_ACCOUNT_STATUS.ACTIVE
        ? USER_ACCOUNT_STATUS.DEACTIVATED
        : USER_ACCOUNT_STATUS.ACTIVE;
    const actionText =
      currentStatus === USER_ACCOUNT_STATUS.ACTIVE ? "deactivate" : "activate";

    setConfirmation({
      type: "status",
      id,
      user: findUserForAction(id),
      currentStatus,
      nextStatus,
      actionText,
    });
  };

  const openDeleteConfirmation = (id) => {
    setConfirmation({
      type: "delete",
      id,
      user: findUserForAction(id),
    });
  };

  const closeConfirmation = () => {
    if (confirmationSubmitting) return;
    setConfirmation(null);
  };

  const runStatusChange = async ({ id, nextStatus, actionText }) => {
    try {
      await toggleUserStatus(
        id,
        nextStatus,
        `Status updated by administrative control`,
      );
      notify.success(`User credentials ${actionText}d successfully.`);

      // Update drawer if matching active user
      if (selectedUser?.id === id) {
        const updated = await getUserById(id);
        setSelectedUser(updated);
      }
      await loadUsers(filters);
    } catch (err) {
      console.error(err);
      notify.error(
        getErrorMessage(err, `Failed to ${actionText} user account.`),
      );
      throw err;
    }
  };

  const handleDeactivateInDrawer = async () => {
    if (!selectedUser) return;
    openStatusConfirmation(selectedUser.id, selectedUser.status);
  };

  const runDelete = async ({ id }) => {
    try {
      const result = await deleteUser(id);
      notify.success(result?.message || "User account deleted successfully.");
      if (selectedUser?.id === id) {
        setDrawerMode(null);
        setSelectedUser(null);
      }
      if (users.length === 1 && filters.page > 1) {
        setFilters((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }));
      } else {
        await loadUsers(filters);
      }
    } catch (err) {
      console.error(err);
      notify.error(getErrorMessage(err, "Failed to delete user account."));
      throw err;
    }
  };

  // ── Password Reset (Part 10) ───────────────────────────────────────────────
  const handlePasswordResetSubmit = async (e) => {
    e.preventDefault();
    const errs = [];

    // Check complexity rules
    if (newPassword.length < 8)
      errs.push("Password must be at least 8 characters");
    if (!/[A-Z]/.test(newPassword))
      errs.push("Must contain an uppercase letter");
    if (!/[a-z]/.test(newPassword))
      errs.push("Must contain a lowercase letter");
    if (!/[0-9]/.test(newPassword)) errs.push("Must contain a number");
    if (!/[^A-Za-z0-9]/.test(newPassword))
      errs.push("Must contain a special character");
    if (newPassword !== confirmNewPassword) errs.push("Passwords do not match");

    if (errs.length > 0) {
      setResetErrors(errs);
      return;
    }

    try {
      setResetSubmitting(true);
      setResetErrors([]);
      const result = await adminResetPassword(selectedUser.id, newPassword);
      notify.success(
        result?.message || "Temporary password changed successfully.",
      );
      setResetModalOpen(false);
      setNewPassword("");
      setConfirmNewPassword("");

      // Update activity list
      const updated = await getUserById(selectedUser.id);
      setSelectedUser(updated);
    } catch (err) {
      console.error(err);
      notify.error(getErrorMessage(err, "Failed to reset password."));
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmation) return;

    try {
      setConfirmationSubmitting(true);
      if (confirmation.type === "status") {
        await runStatusChange(confirmation);
      } else if (confirmation.type === "delete") {
        await runDelete(confirmation);
      }
      setConfirmation(null);
    } finally {
      setConfirmationSubmitting(false);
    }
  };

  const confirmationUser = confirmation?.user;
  const confirmationUserName = confirmationUser?.name || "Selected user";
  const confirmationConfig = (() => {
    if (!confirmation) return null;

    if (confirmation.type === "delete") {
      return {
        title: "Delete user account?",
        description:
          "This will soft-delete the employee account, revoke stored refresh access, and prevent normal login for this user.",
        confirmLabel: "Delete user",
        variant: "destructive",
      };
    }

    return {
      title: `${confirmation.actionText === "activate" ? "Activate" : "Deactivate"} user account?`,
      description:
        confirmation.actionText === "activate"
          ? "This will restore the employee account status through the backend."
          : "This will deactivate the employee account and may affect login and platform access.",
      confirmLabel:
        confirmation.actionText === "activate"
          ? "Activate account"
          : "Deactivate account",
      variant: confirmation.actionText === "activate" ? "default" : "warning",
    };
  })();

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Users</h1>
          <p className="mt-2 text-slate-500">
            Manage internal team members and role-based permissions
          </p>
        </div>

        <Link
          to="/users/new"
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-white font-semibold transition hover:bg-blue-700 shadow-sm"
        >
          <Plus size={18} />
          Add User
        </Link>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="break-words text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Registers
          </p>
          <p className="mt-2 max-w-full break-words text-[clamp(1.25rem,2vw,1.5rem)] font-bold leading-tight text-slate-900 tabular-nums" style={{ overflowWrap: "anywhere" }} title={total.toLocaleString()}>
            {total.toLocaleString()}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="break-words text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Active Credentials
          </p>
          <p className="mt-2 max-w-full break-words text-[clamp(1.25rem,2vw,1.5rem)] font-bold leading-tight text-green-600 tabular-nums" style={{ overflowWrap: "anywhere" }} title={summary.activeAccounts.toLocaleString()}>
            {summary.activeAccounts.toLocaleString()}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="break-words text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Deactivated Accounts
          </p>
          <p className="mt-2 max-w-full break-words text-[clamp(1.25rem,2vw,1.5rem)] font-bold leading-tight text-slate-500 tabular-nums" style={{ overflowWrap: "anywhere" }} title={summary.deactivatedAccounts.toLocaleString()}>
            {summary.deactivatedAccounts.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or email address..."
            value={searchDraft}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`${sharedInputClass} w-full pl-10 pr-4`}
          />
        </div>

        {/* Role Select Filter */}
        <FilterSelect
          value={filters.role}
          onChange={(nextValue) => handleFilterChange("role", nextValue)}
          options={[
            { value: "", label: "All Roles" },
            { value: ROLES.SUPER_ADMIN, label: ROLE_LABELS[ROLES.SUPER_ADMIN] },
            {
              value: ROLES.FINANCE_HEAD,
              label: ROLE_LABELS[ROLES.FINANCE_HEAD],
            },
            { value: ROLES.MANAGER, label: ROLE_LABELS[ROLES.MANAGER] },
            { value: ROLES.TEAM_LEAD, label: ROLE_LABELS[ROLES.TEAM_LEAD] },
            {
              value: ROLES.CASE_MANAGER,
              label: ROLE_LABELS[ROLES.CASE_MANAGER],
            },
          ]}
          placeholder="All Roles"
          className="w-full sm:w-44"
        />

        {/* Status Select Filter */}
        <FilterSelect
          value={filters.status}
          onChange={(nextValue) => handleFilterChange("status", nextValue)}
          options={[
            { value: "", label: "All Statuses" },
            ...USER_ACCOUNT_STATUS_OPTIONS,
          ]}
          placeholder="All Statuses"
          className="w-full sm:w-44"
        />

        {(filters.search || filters.role || filters.status) && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
          >
            <X size={14} />
            Clear
          </button>
        )}

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => loadUsers(filters)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Error state alert */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table grid */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <LoadingSpinner size="lg" text="Loading User Directory..." />
          </div>
        ) : users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-175">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 select-none">
                <tr>
                  <th className="px-5 py-4 text-left">
                    <SortHeader
                      label="User details"
                      field="first_name"
                      sortField={filters.sortField}
                      sortOrder={filters.sortOrder}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-5 py-4 text-left">
                    <SortHeader
                      label="Employee ID"
                      field="employee_id"
                      sortField={filters.sortField}
                      sortOrder={filters.sortOrder}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-5 py-4 text-left">
                    <SortHeader
                      label="Role"
                      field="role"
                      sortField={filters.sortField}
                      sortOrder={filters.sortOrder}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-5 py-4 text-left">
                    <SortHeader
                      label="Registered Date"
                      field="created_at"
                      sortField={filters.sortField}
                      sortOrder={filters.sortOrder}
                      onSort={handleSort}
                    />
                  </th>
                  <th className="px-5 py-4 text-left">Last Login</th>
                  <th className="px-5 py-4 text-left">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {users.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition">
                    <td
                      className="px-5 py-4 cursor-pointer"
                      onClick={() => openDrawer(row.id, "details")}
                    >
                      <p className="font-semibold text-slate-900 hover:text-blue-600 transition">
                        {row.name}
                      </p>
                      <p className="text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {row.employeeId || "-"}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block rounded-full bg-blue-50 px-3 py-0.5 text-xs font-semibold text-blue-700">
                        {formatRoleLabel(row.role)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleDateString("en-IN")
                        : "-"}
                    </td>
                    <td className="px-5 py-4">
                      {row.lastLoginAt
                        ? new Date(row.lastLoginAt).toLocaleString("en-IN")
                        : "Never"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {/* View Details */}
                        <button
                          onClick={() => openDrawer(row.id, "details")}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                          title="View Details"
                          aria-label="View user profile details"
                        >
                          <Eye size={16} />
                        </button>
                        {/* Edit User */}
                        <button
                          onClick={() => openDrawer(row.id, "edit")}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition"
                          title="Edit User"
                          aria-label="Edit user details"
                        >
                          <Edit2 size={16} />
                        </button>
                        {/* Toggle Status */}
                        <button
                          onClick={() =>
                            openStatusConfirmation(row.id, row.status)
                          }
                          className={`rounded-lg p-2 transition ${
                            row.status === USER_ACCOUNT_STATUS.ACTIVE
                              ? "text-slate-500 hover:bg-slate-100 hover:text-amber-600"
                              : "text-slate-400 hover:bg-slate-100 hover:text-green-600"
                          }`}
                          title={
                            row.status === USER_ACCOUNT_STATUS.ACTIVE
                              ? "Deactivate User"
                              : "Activate User"
                          }
                          aria-label={
                            row.status === USER_ACCOUNT_STATUS.ACTIVE
                              ? "Deactivate credentials"
                              : "Activate credentials"
                          }
                        >
                          {row.status === USER_ACCOUNT_STATUS.ACTIVE ? (
                            <Lock size={16} />
                          ) : (
                            <Unlock size={16} />
                          )}
                        </button>
                        {canDeleteUsers && (
                          <button
                            onClick={() => openDeleteConfirmation(row.id)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete User"
                            aria-label="Delete user profile"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <p className="text-sm font-semibold">No Users Found</p>
            <p className="text-xs mt-1 text-slate-500">
              There are no records matching the filters.
            </p>
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {!loading && totalPages > 1 && (
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          totalItems={total}
          itemsPerPage={filters.limit}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          isLoading={loading}
          label="users"
        />
      )}

      {/* ── Slide-over Side Drawer (Details & Edit) ──────────────────────────── */}
      {drawerMode && (
        <div className="fixed inset-0 z-50 overflow-hidden select-none">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerMode(null)}
          />

          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-lg bg-white dark:bg-slate-900 shadow-xl flex flex-col border-l border-slate-200 dark:border-slate-800">
              {/* Drawer Header */}
              <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {drawerMode === "details"
                      ? "User Profile Details"
                      : "Modify User Profile"}
                  </h2>
                  {selectedUser && (
                    <p className="text-xs text-slate-500 mt-1">
                      ID: {selectedUser.id}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerMode(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                {drawerLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <LoadingSpinner
                      size="md"
                      text="Loading User Profile Data..."
                    />
                  </div>
                ) : selectedUser ? (
                  drawerMode === "details" ? (
                    /* Read-Only Details Panel */
                    <div className="space-y-8">
                      {/* Profile Card */}
                      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-5 flex items-start gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
                          {selectedUser.firstName?.[0] || ""}
                          {selectedUser.lastName?.[0] || ""}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 text-lg">
                            {selectedUser.name}
                          </h3>
                          <p className="text-xs font-semibold text-slate-500">
                            {selectedUser.employeeId || "Employee ID pending"}
                          </p>
                          <p className="text-sm text-slate-500">
                            {selectedUser.email}
                          </p>
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            <span className="inline-block rounded-full bg-blue-50 px-3 py-0.5 text-xs font-semibold text-blue-700">
                              {formatRoleLabel(selectedUser.role)}
                            </span>
                            <StatusBadge status={selectedUser.status} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-xl border border-slate-200 p-4 bg-white text-sm text-slate-600">
                        <h4 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                          Organization Profile
                        </h4>
                        <div className="grid grid-cols-1 gap-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-medium">Employee ID</span>
                            <span className="text-slate-950 font-semibold">
                              {selectedUser.employeeId || "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-medium">Phone</span>
                            <span className="text-slate-950 font-semibold">
                              {selectedUser.phone || "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-medium">Alternate Phone</span>
                            <span className="text-slate-950 font-semibold">
                              {selectedUser.alternatePhone || "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-medium">Designation</span>
                            <span className="text-slate-950 font-semibold">
                              {selectedUser.designation || "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-medium">Branch</span>
                            <span className="text-slate-950 font-semibold">
                              {selectedUser.branch || "-"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">Region</span>
                            <span className="text-slate-950 font-semibold">
                              {selectedUser.region || "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Permissions scope */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                          Access Scope Permissions
                        </h4>
                        {selectedUser.permissions?.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedUser.permissions.map((p) => (
                              <span
                                key={p}
                                className="inline-block rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 border border-slate-200"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            No explicit permission keys mapped to role
                          </p>
                        )}
                      </div>

                      {/* Account Timestamps */}
                      <div className="space-y-4 rounded-xl border border-slate-200 p-4 bg-white text-sm text-slate-600">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-medium">Registered Date</span>
                          <span className="text-slate-950 font-semibold">
                            {selectedUser.createdAt
                              ? new Date(
                                  selectedUser.createdAt,
                                ).toLocaleDateString("en-IN")
                              : "-"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-medium">
                            Last Modified Date
                          </span>
                          <span className="text-slate-950 font-semibold">
                            {selectedUser.updatedAt
                              ? new Date(
                                  selectedUser.updatedAt,
                                ).toLocaleDateString("en-IN")
                              : "-"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pb-1">
                          <span className="font-medium">
                            Last Login Session
                          </span>
                          <span className="text-slate-950 font-semibold">
                            {selectedUser.lastLoginAt
                              ? new Date(
                                  selectedUser.lastLoginAt,
                                ).toLocaleString("en-IN")
                              : "Never"}
                          </span>
                        </div>
                      </div>

                      {/* Audit History */}
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                          <Clock size={16} className="text-slate-500" />
                          Recent Audit Trail
                        </h4>

                        {selectedUser.auditHistory?.length > 0 ? (
                          <div className="relative border-l border-slate-200 ml-3.5 pl-6 space-y-6 text-sm">
                            {selectedUser.auditHistory.map((log) => (
                              <div key={log.id} className="relative">
                                {/* Bullet indicator */}
                                <div className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border border-blue-600 bg-white" />
                                <div>
                                  <p className="font-semibold text-slate-900">
                                    {log.remarks}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                    <span>
                                      By:{" "}
                                      {log.performed_by?.employee_id
                                        ? `${log.performed_by.employee_id} - `
                                        : ""}
                                      {log.performed_by?.email || "System"}
                                    </span>
                                    <span>•</span>
                                    <span>
                                      IP: {log.ip_address || "Internal"}
                                    </span>
                                    <span>•</span>
                                    <span>
                                      {new Date(log.created_at).toLocaleString(
                                        "en-IN",
                                      )}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 bg-slate-50 p-4 text-center rounded-xl border border-slate-100">
                            No operational audit logs found for this user
                            account.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Edit Form Panel */
                    <form
                      onSubmit={handleEditSubmit}
                      className="space-y-6"
                      noValidate
                    >
                      <div className="space-y-4">
                        <div>
                          <label
                            htmlFor="edit-firstName"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            First Name *
                          </label>
                          <input
                            id="edit-firstName"
                            type="text"
                            name="firstName"
                            value={editForm.firstName}
                            onChange={handleEditChange}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                            required
                          />
                          {editErrors.firstName && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              {editErrors.firstName}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="edit-lastName"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Last Name *
                          </label>
                          <input
                            id="edit-lastName"
                            type="text"
                            name="lastName"
                            value={editForm.lastName}
                            onChange={handleEditChange}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                            required
                          />
                          {editErrors.lastName && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              {editErrors.lastName}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="edit-email"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Email Address *
                          </label>
                          <input
                            id="edit-email"
                            type="email"
                            name="email"
                            value={editForm.email}
                            onChange={handleEditChange}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                            required
                          />
                          {editErrors.email && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              {editErrors.email}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="edit-employeeId"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Employee ID
                          </label>
                          <input
                            id="edit-employeeId"
                            type="text"
                            value={selectedUser.employeeId || ""}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-500 outline-none"
                            disabled
                            readOnly
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="edit-phone"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Phone
                          </label>
                          <input
                            id="edit-phone"
                            type="tel"
                            name="phone"
                            value={editForm.phone}
                            onChange={handleEditChange}
                            placeholder="9876543210"
                            inputMode="numeric"
                            maxLength={10}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                          />
                          {editErrors.phone && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              {editErrors.phone}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="edit-alternatePhone"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Alternate Phone
                          </label>
                          <input
                            id="edit-alternatePhone"
                            type="tel"
                            name="alternatePhone"
                            value={editForm.alternatePhone}
                            onChange={handleEditChange}
                            placeholder="9876543211"
                            inputMode="numeric"
                            maxLength={10}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                          />
                          {editErrors.alternatePhone && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              {editErrors.alternatePhone}
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="edit-designation"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Designation
                          </label>
                          <input
                            id="edit-designation"
                            type="text"
                            name="designation"
                            value={editForm.designation}
                            onChange={handleEditChange}
                            list="edit-designation-options"
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                          />
                          <datalist id="edit-designation-options">
                            {lookupDesignations.map((item) => (
                              <option key={item.value} value={item.value} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label
                            htmlFor="edit-branch"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Branch
                          </label>
                          <input
                            id="edit-branch"
                            type="text"
                            name="branch"
                            value={editForm.branch}
                            onChange={handleEditChange}
                            list="edit-branch-options"
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                          />
                          <datalist id="edit-branch-options">
                            {lookupBranches.map((item) => (
                              <option key={item.value} value={item.value} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label
                            htmlFor="edit-region"
                            className="block text-sm font-medium text-slate-700 mb-1.5"
                          >
                            Region
                          </label>
                          <input
                            id="edit-region"
                            type="text"
                            name="region"
                            value={editForm.region}
                            onChange={handleEditChange}
                            list="edit-region-options"
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none transition focus:border-blue-600"
                          />
                          <datalist id="edit-region-options">
                            {lookupRegions.map((item) => (
                              <option key={item.value} value={item.value} />
                            ))}
                          </datalist>
                        </div>

                        <div>
                          <label
                            htmlFor="edit-role"
                            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                          >
                            Role Permission Guard *
                          </label>
                          <FilterSelect
                            ariaLabel="Role Permission Guard"
                            value={editForm.role}
                            onChange={handleEditRoleChange}
                            options={manageableRoles.map((r) => ({
                              value: r.value,
                              label: formatRoleLabel(r.value || r.name),
                            }))}
                            placeholder="Select system role"
                          />
                          {editErrors.role && (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              {editErrors.role}
                            </p>
                          )}
                        </div>

                        {/* Super Admin warnings */}
                        {editForm.role === "SUPER_ADMIN" && (
                          <div className="space-y-4 rounded-xl border border-red-100 bg-red-50 p-4">
                            <div className="flex gap-2.5 text-sm text-red-800">
                              <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                              <div>
                                <p className="font-semibold">
                                  ⚠️ High Privilege Assignment
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-red-700">
                                  You are upgrading this account to Super Admin
                                  privileges.
                                </p>
                              </div>
                            </div>
                            <label className="flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                name="superAdminConfirmed"
                                checked={editForm.superAdminConfirmed}
                                onChange={handleEditChange}
                                className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                              />
                              <span className="text-xs font-semibold text-slate-700">
                                I confirm role upgrade authorization.
                              </span>
                            </label>
                            {editErrors.superAdminConfirmed && (
                              <p className="text-xs font-semibold text-red-600 mt-1">
                                {editErrors.superAdminConfirmed}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Lifecyle status and Reset controls */}
                      <div className="border-t border-slate-100 pt-6 space-y-4">
                        <h4 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                          Credentials Actions
                        </h4>

                        <div className="grid grid-cols-2 gap-3">
                          {/* Force Password Reset */}
                          <button
                            type="button"
                            onClick={() => setResetModalOpen(true)}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                          >
                            <Key size={14} />
                            Reset Password
                          </button>

                          {/* Toggle Status */}
                          <button
                            type="button"
                            onClick={handleDeactivateInDrawer}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition ${
                              selectedUser.status === USER_ACCOUNT_STATUS.ACTIVE
                                ? "border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100"
                                : "border-green-200 bg-green-50/50 text-green-700 hover:bg-green-100"
                            }`}
                          >
                            {selectedUser.status ===
                            USER_ACCOUNT_STATUS.ACTIVE ? (
                              <>
                                <Lock size={14} />
                                Deactivate Account
                              </>
                            ) : (
                              <>
                                <Unlock size={14} />
                                Activate Account
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-3 pt-6 border-t border-slate-200 mt-8">
                        <button
                          type="submit"
                          disabled={editSubmitting}
                          className="flex-1 inline-flex justify-center items-center gap-2 rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                        >
                          {editSubmitting ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Saving Changes...
                            </>
                          ) : (
                            "Save Changes"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDrawerMode(null)}
                          disabled={editSubmitting}
                          className="flex-1 rounded-xl border border-slate-300 py-3 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal overlay ──────────────────────────────────────── */}
      <ConfirmationModal
        open={!!confirmation}
        title={confirmationConfig?.title}
        description={confirmationConfig?.description}
        confirmLabel={confirmationConfig?.confirmLabel}
        variant={confirmationConfig?.variant}
        loading={confirmationSubmitting}
        disabled={!confirmation}
        onCancel={closeConfirmation}
        onConfirm={handleConfirmAction}
        ariaLabel={confirmationConfig?.title}
      >
        {confirmation && (
          <div className="space-y-4">
            <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Employee
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {confirmationUserName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Employee ID
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {confirmationUser?.employeeId || "-"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Email
                </dt>
                <dd className="mt-1 break-words font-semibold text-slate-900">
                  {confirmationUser?.email || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Role
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatRoleLabel(confirmationUser?.role) || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Current Status
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {confirmationUser?.status || "-"}
                </dd>
              </div>
            </dl>

            {confirmation.type === "delete" && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
                Deletion is processed by the backend as an account removal
                action. It may immediately affect login, access, active
                sessions, reporting, and audit visibility for this employee.
              </div>
            )}
          </div>
        )}
      </ConfirmationModal>

      {resetModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setResetModalOpen(false)}
          />

          <div className="relative max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden z-10 border border-slate-200/80 dark:border-slate-800 select-none">
            <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-950 dark:text-slate-100">
                Change Credentials Password
              </h3>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handlePasswordResetSubmit}
              className="p-6 space-y-4"
              noValidate
            >
              {resetErrors.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-100 p-3 space-y-1">
                  {resetErrors.map((err, idx) => (
                    <p key={idx} className="text-xs font-semibold text-red-700">
                      • {err}
                    </p>
                  ))}
                </div>
              )}

              <div>
                <label
                  htmlFor="modal-newPassword"
                  className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
                >
                  New Password *
                </label>
                <input
                  id="modal-newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter secure temporary password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none transition"
                  disabled={resetSubmitting}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="modal-confirmPassword"
                  className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wider"
                >
                  Confirm Password *
                </label>
                <input
                  id="modal-confirmPassword"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat temporary password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none transition"
                  disabled={resetSubmitting}
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="flex-1 inline-flex justify-center items-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {resetSubmitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    "Update Password"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  disabled={resetSubmitting}
                  className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersList;
export { UsersList };
