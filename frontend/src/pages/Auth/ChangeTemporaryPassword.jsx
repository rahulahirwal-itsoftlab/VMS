import { useMemo, useState } from "react";
import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "../../context/AuthContext";

const passwordRules = [
  { label: "At least 8 characters", test: (value) => value.length >= 8 },
  { label: "One uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { label: "One lowercase letter", test: (value) => /[a-z]/.test(value) },
  { label: "One number", test: (value) => /[0-9]/.test(value) },
  { label: "One special character", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const ChangeTemporaryPassword = () => {
  const navigate = useNavigate();
  const { completeRequiredPasswordChange } = useAuth();
  const [formData, setFormData] = useState({ newPassword: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const ruleResults = useMemo(
    () => passwordRules.map((rule) => ({ ...rule, valid: rule.test(formData.newPassword) })),
    [formData.newPassword]
  );

  const validate = () => {
    const errors = {};
    if (!ruleResults.every((rule) => rule.valid)) {
      errors.newPassword = "Password does not meet all requirements.";
    }
    if (formData.newPassword !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      const result = await completeRequiredPasswordChange(formData);
      if (!result.success) {
        toast.error(result.message || "Password change failed.");
        return;
      }
      setFormData({ newPassword: "", confirmPassword: "" });
      toast.success("Password changed successfully.");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const errors = error?.response?.data?.errors;
      if (errors) setFieldErrors(errors);
      toast.error(error?.response?.data?.message || "Password change failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <ShieldCheck size={26} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Change temporary password</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Create a new password before accessing VMS. Your temporary password cannot be reused.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="newPassword">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 pl-12 pr-12 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                id="newPassword"
                name="newPassword"
                onChange={(event) => setFormData((prev) => ({ ...prev, newPassword: event.target.value }))}
                type={showPassword ? "text" : "password"}
                value={formData.newPassword}
              />
              <button
                aria-label="Toggle password visibility"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.newPassword && (
              <p className="mt-1.5 text-xs font-semibold text-red-600">{fieldErrors.newPassword}</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="confirmPassword">
              Confirm new password
            </label>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              id="confirmPassword"
              name="confirmPassword"
              onChange={(event) => setFormData((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              type={showPassword ? "text" : "password"}
              value={formData.confirmPassword}
            />
            {fieldErrors.confirmPassword && (
              <p className="mt-1.5 text-xs font-semibold text-red-600">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Password requirements</p>
            <ul className="mt-3 space-y-2 text-sm">
              {ruleResults.map((rule) => (
                <li className={rule.valid ? "text-green-700" : "text-slate-500"} key={rule.label}>
                  {rule.valid ? "✓" : "•"} {rule.label}
                </li>
              ))}
            </ul>
          </div>

          <button
            className="h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Changing password..." : "Change password and continue"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangeTemporaryPassword;
