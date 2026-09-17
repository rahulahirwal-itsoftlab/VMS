import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { setActivationPassword, validateActivationToken } from "../../services/authService";
import { formatRoleLabel } from "../../utils/displayFormatters";

const passwordChecks = (value) => ({
  length: value.length >= 8,
  upper: /[A-Z]/.test(value),
  lower: /[a-z]/.test(value),
  number: /[0-9]/.test(value),
  special: /[^A-Za-z0-9]/.test(value),
});

const ActivateAccount = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState("loading");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const checks = useMemo(() => passwordChecks(password), [password]);
  const passwordValid = Object.values(checks).every(Boolean);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setState("error");
        setError("Activation link is missing.");
        return;
      }
      try {
        const data = await validateActivationToken(token);
        setProfile(data.user);
        setState("ready");
      } catch (err) {
        setState("error");
        setError(err?.response?.data?.message || "Activation link is invalid or expired.");
      }
    };
    run();
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!passwordValid) {
      setError("Password does not meet the security requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await setActivationPassword({ token, newPassword: password });
      setState("success");
      setTimeout(() => navigate("/login"), 1600);
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to activate account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Set Your Password</h1>
            <p className="text-sm text-slate-500">Complete your VMS account activation.</p>
          </div>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={16} />
            Checking activation link...
          </div>
        )}

        {state === "error" && (
          <div className="space-y-4">
            <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>
            <Link to="/login" className="inline-block text-sm font-semibold text-blue-700 hover:underline">Back to login</Link>
          </div>
        )}

        {state === "success" && (
          <p className="rounded-lg border border-green-100 bg-green-50 p-3 text-sm font-semibold text-green-700">
            Account activated. Redirecting to login...
          </p>
        )}

        {state === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">{profile?.firstName} {profile?.lastName}</p>
              <p>{profile?.employeeId} · {formatRoleLabel(profile?.role)}</p>
              <p>{profile?.email}</p>
            </div>

            <div>
              <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
              <input
                id="newPassword"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-slate-700">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-600"
                autoComplete="new-password"
              />
            </div>

            <ul className="grid grid-cols-1 gap-1 text-xs text-slate-500">
              <li className={checks.length ? "font-semibold text-green-700" : ""}>At least 8 characters</li>
              <li className={checks.upper ? "font-semibold text-green-700" : ""}>At least one uppercase letter</li>
              <li className={checks.lower ? "font-semibold text-green-700" : ""}>At least one lowercase letter</li>
              <li className={checks.number ? "font-semibold text-green-700" : ""}>At least one number</li>
              <li className={checks.special ? "font-semibold text-green-700" : ""}>At least one special character</li>
            </ul>

            {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Activate Account
            </button>
          </form>
        )}
      </section>
    </main>
  );
};

export default ActivateAccount;
