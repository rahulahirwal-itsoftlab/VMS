import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Menu,
  Sun,
  Moon,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useSidebar } from "../../context/SidebarContext";
import { useTheme } from "../../context/ThemeContext";
import { useNavigate } from "react-router-dom";
import {
  getNotifications,
  markRead,
} from "../../services/notificationService";
import { formatRoleLabel } from "../../utils/displayFormatters";

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { refreshUnreadCount, unreadCount } = useNotifications();
  const { openMobileSidebar } = useSidebar();
  const navigate = useNavigate();

  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const [latestNotifications, setLatestNotifications] = useState([]);
  const [latestLoading, setLatestLoading] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);

  const displayName = user?.name || `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || user?.email || "User";
  const showNotificationBadge = Number.isFinite(unreadCount) && unreadCount > 0;
  const notificationBadge = unreadCount > 99 ? "99+" : unreadCount;

  const loadLatestNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLatestLoading(true);
      const data = await getNotifications({ page: 1, limit: 5 });
      setLatestNotifications(data.notifications);
    } catch {
      setLatestNotifications([]);
    } finally {
      setLatestLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!notifDropdownOpen) return undefined;
    loadLatestNotifications();
  }, [notifDropdownOpen, loadLatestNotifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifDropdownOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markNotificationRead = async (notification) => {
    if (notification.isRead) return;
    await markRead(notification.id);
    await Promise.all([loadLatestNotifications(), refreshUnreadCount()]);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 md:h-20 shrink-0 items-center justify-between border-b border-sky-200/60 dark:border-slate-800 animate-navbar-bg px-3 sm:px-6 md:px-8 backdrop-blur-xl shadow-xs transition-all">
      {/* Left section: Mobile menu button & Horizontal Navigation Pills */}
      <div className="flex items-center gap-3 sm:gap-4 lg:gap-6">
        <button
          aria-label="Open navigation menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 hover:bg-slate-50 md:hidden transition-transform active:scale-95 cursor-pointer"
          onClick={openMobileSidebar}
          type="button"
        >
          <Menu size={20} />
        </button>

        {/* Mobile Logo Title */}
        <div
          onClick={() => navigate("/dashboard")}
          className="flex md:hidden items-center gap-2 cursor-pointer"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm overflow-hidden">
            <img src="/logo.png" className="h-6 w-6 object-contain" alt="Logo" />
          </div>
          <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white font-heading truncate max-w-[120px] sm:max-w-none">
            VMS Portal
          </span>
        </div>

        {/* Brand Logo for Desktop Header */}
        <div
          onClick={() => navigate("/dashboard")}
          className="hidden md:flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-md group-hover:scale-105 transition-transform overflow-hidden">
            <img src="/logo.png" className="h-7 w-7 object-contain" alt="Logo" />
          </div>
          <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white font-heading">
            VMS Portal
          </span>
        </div>
      </div>

      {/* Right Controls — Theme, Notifications, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle Button with Rotation Animation */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle Dark Mode"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 transition-all duration-300 hover:rotate-45 cursor-pointer shadow-2xs"
        >
          {theme === "dark" ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-600" />}
        </button>

        {/* Notifications Popover */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 transition-all hover:scale-105 cursor-pointer shadow-2xs"
          >
            <Bell size={18} />
            {showNotificationBadge && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0090B8] px-1 text-[10px] font-bold text-white shadow-md animate-pulse">
                {notificationBadge}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 top-12 z-50 w-[calc(100vw-2rem)] max-w-sm sm:w-96 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3.5">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Notifications</p>
                <button
                  className="text-xs font-semibold text-[#0090B8] hover:underline"
                  onClick={() => {
                    setNotifDropdownOpen(false);
                    navigate("/notifications");
                  }}
                  type="button"
                >
                  View all
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto custom-scrollbar">
                {latestLoading ? (
                  <div className="p-6 text-center text-xs text-slate-400">Loading notifications...</div>
                ) : latestNotifications.length ? (
                  latestNotifications.map((n) => (
                    <div
                      key={n.id}
                      className={`border-b border-slate-100 dark:border-slate-800 p-4 transition ${n.isRead ? "bg-white dark:bg-slate-900" : "bg-sky-50/50 dark:bg-sky-950/30"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          className="text-left flex-1"
                          onClick={() => {
                            setNotifDropdownOpen(false);
                            navigate("/notifications");
                          }}
                        >
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{n.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                        </button>
                        {!n.isRead && (
                          <button
                            onClick={() => markNotificationRead(n)}
                            className="rounded-lg p-1 text-[#0090B8] hover:bg-sky-100 dark:hover:bg-sky-900/50"
                            aria-label="Mark read"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">No new notifications</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Pill & Dropdown with Soft Hover Animation */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2.5 rounded-full border border-sky-200/70 dark:border-slate-800 bg-white/90 dark:bg-slate-900 p-1 sm:pr-3.5 shadow-2xs transition-all hover:scale-105 hover:bg-sky-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-[#0090B8] to-sky-400 text-white font-extrabold text-xs shadow-sm shadow-sky-500/20">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">{displayName}</span>
              <span className="text-[10px] font-semibold text-[#0090B8] uppercase tracking-wider">{formatRoleLabel(user?.role)}</span>
            </div>
            <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 top-12 z-50 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-2xl animate-in fade-in duration-150">
              <div className="border-b border-slate-100 dark:border-slate-800 px-3 py-2.5">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{displayName}</p>
                <p className="text-[11px] text-slate-400">{user?.email}</p>
              </div>

              <button
                onClick={() => {
                  setProfileDropdownOpen(false);
                  logout();
                  navigate("/login");
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
