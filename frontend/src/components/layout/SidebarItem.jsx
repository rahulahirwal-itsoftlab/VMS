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
      } rounded-xl text-left text-sm transition-all duration-200 ease-out cursor-pointer select-none
      ${
        disabled
          ? "cursor-not-allowed text-slate-400 opacity-50"
          : active
          ? "bg-gradient-to-r from-[#0090B8] to-sky-500 text-white font-extrabold shadow-md shadow-sky-500/25 scale-[1.02]"
          : "text-slate-700 dark:text-slate-200 font-bold hover:translate-x-1.5 hover:bg-white/80 dark:hover:bg-white/10 hover:text-[#0090B8] dark:hover:text-white hover:shadow-xs"
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
            <Icon
              size={19}
              className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                active
                  ? "text-white"
                  : "text-[#0090B8] dark:text-[#00E5FF] group-hover:text-[#007799] dark:group-hover:text-white"
              }`}
            />

            {!compact && (
              <span className="truncate font-bold tracking-wide">{title}</span>
            )}

            {hasBadge && (
              <span
                className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold transition-transform group-hover:scale-105 ${
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
