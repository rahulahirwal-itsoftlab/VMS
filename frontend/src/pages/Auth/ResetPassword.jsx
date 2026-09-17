import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, RefreshCw } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { forgotPassword, resetPassword } from "../../services/authService";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const otpRegex = /^\d{6}$/;

const validatePasswordRules = (password) => {
  if (!password || password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character.";
  return null;
};

const ResetPassword = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [formData, setFormData] = useState({
    email: location.state?.email || "",
    otp: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  };

  const handleResendOtp = async () => {
    const trimmedEmail = formData.email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address to resend OTP.");
      return;
    }
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    setIsResending(true);
    setError("");
    try {
      const res = await forgotPassword({ email: trimmedEmail });
      if (res.success) {
        toast.success(res.message || "A new OTP has been sent to your email.");
      } else {
        const errMsg = res.message || "Unable to resend OTP. Please try again.";
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (err) {
      setError("Unable to send OTP right now. Please try again shortly.");
      toast.error("Resend OTP failed.");
    } finally {
      setIsResending(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError("");

    const trimmedEmail = formData.email.trim();
    const trimmedOtp = formData.otp.trim();

    if (!trimmedEmail) {
      setError("Email address is required.");
      return;
    }

    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!trimmedOtp) {
      setError("6-digit OTP code is required.");
      return;
    }

    if (!otpRegex.test(trimmedOtp)) {
      setError("OTP must be exactly 6 digits.");
      return;
    }

    const passwordRuleError = validatePasswordRules(formData.newPassword);
    if (passwordRuleError) {
      setError(passwordRuleError);
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError("Passwords do not match. Please re-enter your new password.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await resetPassword({
        email: trimmedEmail,
        otp: trimmedOtp,
        newPassword: formData.newPassword,
      });

      if (result.success) {
        toast.success("Password reset successfully. You can now login with your new password.");
        navigate("/login", { replace: true });
      } else {
        const errMsg = result.message || "Failed to reset password. Please verify your OTP.";
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (err) {
      console.error("[ResetPassword] Error:", err);
      setError("Server is temporarily unavailable. Please try again later.");
      toast.error("Unable to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900"
      style={{
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div className="relative isolate min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(15,23,42,0.08),_transparent_24%),linear-gradient(135deg,_#f8fafc_0%,_#eef4ff_100%)] flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-slate-900/10 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
          <Link
            to="/forgot-password"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition mb-6"
          >
            <ArrowLeft size={16} /> Request New OTP
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md overflow-hidden">
              <img src="/logo.png" className="h-8 w-8 object-contain" alt="Logo" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950">Reset Password</h1>
              <p className="text-xs text-slate-500">Enter OTP sent to your email and set a new password</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  6-Digit Reset OTP <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResending}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 transition"
                >
                  <RefreshCw size={12} className={isResending ? "animate-spin" : ""} />
                  {isResending ? "Resending..." : "Resend OTP"}
                </button>
              </div>
              <div className="relative">
                <KeyRound
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  name="otp"
                  maxLength={6}
                  value={formData.otp}
                  onChange={handleChange}
                  required
                  placeholder="123456"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-mono tracking-widest text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>


            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  required
                  placeholder="At least 8 chars, 1 uppercase, 1 special char"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-11 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  placeholder="Re-enter your new password"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-11 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? "Resetting password..." : "Reset Password"}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <Link to="/login" className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
