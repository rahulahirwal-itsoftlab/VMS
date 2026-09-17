import {
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

import { navigation } from "../../constants/navigation";
import { hasPermission } from "../../config/permissions";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useSidebar } from "../../context/SidebarContext";
import SidebarItem from "./SidebarItem";
import { formatRoleLabel } from "../../utils/displayFormatters";

const Sidebar = () => {
  const {
    closeMobileSidebar,
    collapsed,
    mobileOpen,
    toggleSidebar,
  } = useSidebar();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();

  const filteredNavigation = navigation
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.title === "Three-Way Matching" && user?.role === "SUPER_ADMIN") {
          return false;
        }
        return (
          hasPermission(user, item.permission) &&
          (!item.allowedRoles || item.allowedRoles.includes(user?.role)) &&
          !item.excludedRoles?.includes(user?.role)
        );
      }),
    }))
    .filter((section) => section.items.length > 0);

  const compact = collapsed && !mobileOpen;

  const profileName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || user?.name || user?.email || "User";
  const notificationBadge = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : undefined;

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm md:hidden animate-in fade-in duration-200"
          onClick={closeMobileSidebar}
          type="button"
        />
      )}

      {/* Animated Shimmering Sidebar Canvas */}
      <aside
        aria-label="Primary navigation"
        className={`
          fixed inset-y-0 left-0 z-50 flex h-full min-h-0 flex-col overflow-hidden animate-sidebar-bg
          text-slate-900 dark:text-white border-r border-sky-200/60 dark:border-slate-800/80 shadow-xl transition-all duration-300 ease-in-out
          md:relative md:z-auto md:h-full md:translate-x-0 md:shadow-none
          ${collapsed ? "md:w-20" : "md:w-64"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          w-72 max-w-[85vw] sm:w-64
        `}
      >
        {/* Brand Header with Glow Icon */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sky-200/60 dark:border-slate-800/80 px-4">
          <div
            className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${compact ? "md:w-0 md:opacity-0" : "opacity-100"
              }`}
          >
            <div className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-md transition-transform hover:scale-105 overflow-hidden">
              <img src="/logo.png" className="h-7 w-7 object-contain" alt="Logo" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900 animate-pulse" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold text-slate-900 dark:text-white font-heading tracking-wide">
                VMS Portal
              </h1>
              <p className="truncate text-[11px] font-bold text-[#0090B8] dark:text-[#00E5FF]">
                Enterprise Suite
              </p>
            </div>
          </div>

          <button
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 dark:bg-white/10 text-slate-700 dark:text-white transition-all hover:bg-sky-100 dark:hover:bg-white/20 hover:scale-105 md:flex cursor-pointer shadow-2xs"
            onClick={toggleSidebar}
            type="button"
          >
            {compact ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <button
            aria-label="Close navigation menu"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 dark:bg-white/10 text-slate-700 dark:text-white transition-all hover:bg-sky-100 dark:hover:bg-white/20 md:hidden cursor-pointer shadow-2xs"
            onClick={closeMobileSidebar}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {/* Animated Menu Navigation */}
        <nav className="min-h-0 flex-1 overflow-hidden overflow-y-auto custom-scrollbar px-3 py-4" aria-label="Sidebar menu">
          <div className="space-y-5">
            {filteredNavigation.map((section, index) => (
              <section key={section.section || `section-${index}`}>
                {section.section && !compact && (
                  <h2 className="mb-2.5 px-3 text-xs font-black uppercase tracking-[0.2em] text-[#0090B8] dark:text-[#00E5FF] font-heading drop-shadow-2xs">
                    {section.section}
                  </h2>
                )}

                <div className="space-y-1">
                  {section.items.map((item) => (
                    <SidebarItem
                      badge={item.path === "/notifications" ? notificationBadge : item.badge}
                      activePaths={item.activePaths}
                      icon={item.icon}
                      key={item.pathByRole?.[user?.role] || item.path}
                      onNavigate={closeMobileSidebar}
                      path={item.pathByRole?.[user?.role] || item.path}
                      title={item.titleByRole?.[user?.role] || item.title}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>

        {/* Animated Profile Footer with Soft Lift & Glass Card */}
        <div className="shrink-0 border-t border-sky-200/60 dark:border-slate-800/80 p-3 bg-sky-100/40 dark:bg-slate-900/60 backdrop-blur-md">
          {!compact && user && (
            <div className="group mb-2 flex items-center gap-3 rounded-2xl border border-sky-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-800/80 p-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#0090B8]/40">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#0090B8] to-sky-400 text-white font-extrabold text-sm shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
                {profileName.charAt(0).toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-slate-900" />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-xs font-extrabold text-slate-900 dark:text-white capitalize">
                  {profileName}
                </h3>
                <p className="truncate text-[10px] font-bold text-[#0090B8] dark:text-[#00E5FF] uppercase tracking-wider">
                  {formatRoleLabel(user.role)}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
