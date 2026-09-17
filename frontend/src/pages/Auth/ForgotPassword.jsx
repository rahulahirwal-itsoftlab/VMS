import React, { useState } from "react";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { forgotPassword } from "../../services/authService";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successNotice, setSuccessNotice] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError("");
    setSuccessNotice("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email address is required.");
      return;
    }

    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await forgotPassword({ email: trimmedEmail });

      if (result.success) {
        const msg = result.message || "If an account exists for this email address, password reset instructions have been sent.";
        setSuccessNotice(msg);
        toast.success(msg);

        setTimeout(() => {
          navigate("/reset-password", { state: { email: trimmedEmail } });
        }, 1500);
      } else {
        const errMsg = result.message || "Unable to process request. Please try again.";
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (err) {
      console.error("[ForgotPassword] Unexpected Error:", err);
      const fallbackMsg = err?.message || "Unable to process your request. Please try again shortly.";
      setError(fallbackMsg);
      toast.error(fallbackMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-20 -top-20 h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute -right-20 -bottom-20 h-[600px] w-[600px] rounded-full bg-sky-500/15 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-slate-800/80 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-2xl">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition mb-6"
        >
          <ArrowLeft size={16} /> Back to Sign In
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg overflow-hidden">
            <img src="/logo.png" className="h-8 w-8 object-contain" alt="Logo" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-heading">Reset Credentials</h1>
            <p className="text-xs text-slate-400">Enter registered email for OTP link</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-bold text-red-400">
            {error}
          </div>
        )}

        {successNotice && (
          <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-400">
            {successNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Work Email <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                required
                disabled={isSubmitting}
                placeholder="you@company.com"
                className="w-full h-12 rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            <span>{isSubmitting ? "Sending reset instructions..." : "Send Reset Code"}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
          <p className="text-xs text-slate-400">
            Already received OTP code?{" "}
            <Link to="/reset-password" className="font-bold text-blue-400 hover:underline">
              Enter Reset Code
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
