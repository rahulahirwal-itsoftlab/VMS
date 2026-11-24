import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";

const SidebarItem = ({
  activePaths = [],
  badge,
  disabled = false,
  icon: Icon,
  onNavigate,
  path,
  title,
}) => {
  const { collapsed, mobileOpen } = useSidebar();
  const location = useLocation();
  const compact = collapsed && !mobileOpen;
  const hasBadge = badge !== undefined && badge !== null && String(badge) !== "";

  const isPathActive = (isActive) => {
    if (isActive) return true;
    return activePaths.some(
      (activePath) =>
        location.pathname === activePath ||
        location.pathname.startsWith(`${activePath}/`)
    );
  };

  const getItemClasses = (isActive) => {
    const active = isPathActive(isActive);

    return `
      group relative flex h-11 w-full items-center ${
        compact ? "justify-center px-0" : "gap-3 px-3.5"
      } rounded-xl text-left text-sm transition-colors duration-150 select-none cursor-pointer
      ${
        disabled
          ? "cursor-not-allowed text-slate-400 opacity-50"
          : active
          ? "bg-gradient-to-r from-[#0090B8] to-sky-500 text-white font-extrabold shadow-md shadow-sky-500/25"
          : "text-slate-700 dark:text-slate-200 font-bold hover:bg-white/80 dark:hover:bg-white/10 hover:text-[#0090B8] dark:hover:text-white hover:shadow-xs"
      }
    `;
  };

  return (
    <NavLink
      to={disabled ? "#" : path}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onNavigate?.();
      }}
      className={({ isActive }) => getItemClasses(isActive)}
      title={compact ? title : undefined}
    >
      {({ isActive }) => {
        const active = isPathActive(isActive);

        return (
          <>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              <Icon
                size={20}
                className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
                  active
                    ? "text-white"
                    : "text-[#0090B8] dark:text-[#00E5FF] group-hover:text-[#007799] dark:group-hover:text-white"
                }`}
              />
            </span>

            {!compact && (
              <span className="truncate font-bold tracking-wide leading-none flex-1">
                {title}
              </span>
            )}

            {hasBadge && (
              <span
                className={`ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold ${
                  active
                    ? "bg-white text-[#0090B8]"
                    : "bg-[#0090B8] text-white shadow-xs"
                }`}
              >
                {badge}
              </span>
            )}
          </>
        );
      }}
    </NavLink>
  );
};

export default SidebarItem;
