import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  ArrowRight,
  Mail,
  Lock,
  Sun,
  Moon,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { toast } from "sonner";
import { getDashboardPathForRole } from "../../config/roleDashboard";
import authBgLight from "../../assets/auth-bg-light.png";

// Generate static positions for background floating stars/particles
const generateStars = (count = 28) => {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 4 + 2, // 2px to 6px
      duration: Math.random() * 3 + 2, // 2s to 5s
      delay: Math.random() * 3,
      driftX: (Math.random() - 0.5) * 40,
      driftY: (Math.random() - 0.5) * 40,
    });
  }
  return stars;
};

const Login = () => {
  const navigate = useNavigate();
  const { login, user, isAuthenticated, bootstrapping } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const queryRedirect = new URLSearchParams(location.search).get("redirect");
  const queryFrom = new URLSearchParams(location.search).get("from");
  const preservedRoute = queryRedirect || queryFrom;
  const getSanitizedRoute = (rawRoute, role) => {
    const fallback = getDashboardPathForRole(role);
    if (!rawRoute || typeof rawRoute !== "string") return fallback;
    const trimmed = rawRoute.trim();
    if (
      trimmed.startsWith("/404") ||
      trimmed.startsWith("/403") ||
      trimmed.startsWith("/login") ||
      trimmed === "/" ||
      trimmed === ""
    ) {
      return fallback;
    }
    return trimmed;
  };

  useEffect(() => {
    if (!bootstrapping && isAuthenticated && user) {
      const targetRoute = getSanitizedRoute(preservedRoute, user.role);
      navigate(targetRoute, { replace: true });
    }
  }, [bootstrapping, isAuthenticated, navigate, preservedRoute, user]);

  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const stars = useMemo(() => generateStars(32), []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError("");
    setIsSubmitting(true);

    try {
      const result = await login(formData);

      if (result.success) {
        if (result.requiresPasswordChange) {
          toast.info("Please change your temporary password to continue.");
          navigate("/change-temporary-password", { replace: true });
          return;
        }
        const targetRoute = getSanitizedRoute(preservedRoute, result.user?.role);
        navigate(targetRoute, { replace: true });
      } else {
        setError(result.message);
        toast.error(result.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full font-sans bg-gradient-to-br from-slate-100 via-sky-50 to-blue-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 selection:bg-blue-600 selection:text-white relative overflow-hidden">
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-50 rounded-full border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-2.5 text-slate-600 dark:text-slate-300 shadow-md backdrop-blur-md transition hover:scale-105"
        title="Toggle Theme"
        aria-label="Toggle Theme"
      >
        {theme === "dark" ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-700" />}
      </button>

      {/* Dynamic Animated Background Floating Objects & Stars */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Animated Gradient Light Spheres */}
        <motion.div
          animate={{
            x: [0, 40, 0],
            y: [0, -30, 0],
            scale: [1, 1.25, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-sky-300/40 to-blue-400/30 dark:from-blue-900/20 dark:to-cyan-900/20 blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, -50, 0],
            y: [0, 40, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute -bottom-20 -right-20 w-[550px] h-[550px] rounded-full bg-gradient-to-br from-blue-300/35 to-indigo-300/30 dark:from-slate-700/20 dark:to-blue-900/20 blur-[130px]"
        />

        {/* Floating Twinkling Stars / Particles */}
        {stars.map((star) => (
          <motion.div
            key={star.id}
            initial={{ opacity: 0.2 }}
            animate={{
              opacity: [0.2, 0.9, 0.2],
              scale: [0.8, 1.4, 0.8],
              x: [0, star.driftX, 0],
              y: [0, star.driftY, 0],
            }}
            transition={{
              duration: star.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: star.delay,
            }}
            style={{
              position: "absolute",
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
            }}
            className="rounded-full bg-sky-400/80 dark:bg-cyan-300/50 shadow-[0_0_10px_#38bdf8]"
          />
        ))}

        {/* Shooting Light Streak Shimmer */}
        <motion.div
          animate={{
            x: ["-100%", "200%"],
            y: ["-100%", "200%"],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
            repeatDelay: 4,
          }}
          className="absolute top-0 left-0 w-72 h-0.5 bg-gradient-to-r from-transparent via-sky-400 dark:via-cyan-300/60 to-transparent transform -rotate-45"
        />
      </div>

      {/* Main Card Modal with Entrance Animation */}
      <motion.div
        initial={{ opacity: 0, y: 35, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-4xl overflow-hidden rounded-2xl sm:rounded-[28px] border border-white/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/95 shadow-2xl shadow-blue-900/10 dark:shadow-slate-950/60 backdrop-blur-xl grid grid-cols-1 lg:grid-cols-12 min-h-0 sm:min-h-[520px]"
      >
        {/* Left Side Presentation with Light Architectural Background Image */}
        <div
          className="lg:col-span-6 relative p-6 sm:p-8 lg:p-10 flex flex-col justify-between overflow-hidden bg-cover bg-center border-b lg:border-b-0 lg:border-r border-slate-200/80 dark:border-slate-800 min-h-[220px] sm:min-h-0"
          style={{ backgroundImage: `url(${authBgLight})` }}
        >
          {/* High-quality Animated Video Background on the left side */}
          {!videoError && (
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onError={() => setVideoError(true)}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
            >
              <source src="/MicrosoftTeams-video.mp4" type="video/mp4" />
            </video>
          )}

          {/* Subtle Light Gradient Overlay for crisp text contrast, positioned on top of video */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/35 to-slate-900/60 z-[1]" />

          {/* Top Brand Header */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative z-10 flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-slate-950 text-white shadow-md overflow-hidden">
              <img src="/logo.png" className="h-7 w-7 object-contain" alt="Logo" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-200 block">Enterprise SaaS</span>
              <h2 className="text-lg font-bold tracking-tight text-white font-heading leading-none" style={{ color: "#ffffff" }}>
                VMS Portal
              </h2>
            </div>
          </motion.div>

          {/* Bottom Hero Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative z-10 mt-8 sm:mt-12 space-y-2 sm:space-y-3"
          >
            <h1
              className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight leading-snug drop-shadow-md"
              style={{ color: "#ffffff" }}
            >
              Manage Smarter. <br />
              Approve Faster. <br />
              Work Anywhere.
            </h1>
            <p className="text-xs text-slate-100 leading-relaxed max-w-sm drop-shadow-sm font-medium hidden sm:block">
              Centralize vendor lifecycle, purchase orders, automated three-way matching, and multi-tier approval workflows in one unified dashboard.
            </p>

            {/* Animated Slider Indicator Dots */}
            <div className="flex items-center gap-2 pt-2">
              <motion.span
                animate={{ width: ["24px", "32px", "24px"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="h-1 bg-white rounded-full shadow-sm"
              />
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full"></span>
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full"></span>
              <span className="w-1.5 h-1.5 bg-white/60 rounded-full"></span>
            </div>
          </motion.div>
        </div>

        {/* Right Side - Light Form Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="lg:col-span-6 p-5 sm:p-8 lg:p-10 flex flex-col justify-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 relative"
        >
          <div className="relative z-10">
            {/* Header */}
            <div className="mb-6">
              <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 font-heading">
                Sign in to workspace
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                Enter your organizational credentials to continue
              </p>
            </div>

            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-300 flex items-center gap-2 shadow-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    placeholder="name@company.com"
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-slate-950 focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="••••••••••••"
                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 pl-10 pr-12 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-slate-950 focus:border-blue-600 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 dark:focus:ring-blue-500/20 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer transition-colors"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Keep me signed in Checkbox */}
              <div className="flex items-center justify-between py-1">
                <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    checked={formData.rememberMe}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
                  />
                  Keep me signed in
                </label>
              </div>

              {/* Animated Submit Button */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0090B8] hover:bg-[#007799] active:bg-[#006080] font-bold text-sm text-white shadow-lg shadow-[#0090B8]/25 transition-all disabled:opacity-60 cursor-pointer mt-2"
              >
                <span>{isSubmitting ? "Authenticating..." : "Sign in to Dashboard"}</span>
                <ArrowRight size={16} />
              </motion.button>
            </form>

            <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
              Powered by VMS Enterprise Engine v2.0
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;
