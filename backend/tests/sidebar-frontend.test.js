import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');

test('sidebar uses centralized compact menu item spacing', () => {
  const sidebar = frontendSource('components', 'layout', 'Sidebar.jsx');
  const item = frontendSource('components', 'layout', 'SidebarItem.jsx');

  assert.match(item, /itemHeight:\s*"h-11"/);
  assert.match(item, /itemGap:\s*"gap-3"/);
  assert.match(item, /itemPadding:\s*"px-3"/);
  assert.match(item, /iconSize:\s*20/);
  assert.match(item, /radius:\s*"rounded-xl"/);
  assert.match(sidebar, /<SidebarItem/);
  assert.match(sidebar, /space-y-4/);
  assert.match(sidebar, /space-y-1/);
  assert.doesNotMatch(sidebar, /space-y-2/);
  assert.doesNotMatch(sidebar, /space-y-5/);
  assert.doesNotMatch(sidebar, /space-y-6/);
  assert.doesNotMatch(sidebar, /rounded-2xl[\s\S]*NavLink/);
});

test('notifications are a normal permission-gated sidebar item without fake badge data', () => {
  const navigation = frontendSource('constants', 'navigation.js');
  const sidebar = frontendSource('components', 'layout', 'Sidebar.jsx');
  const routes = frontendSource('routes', 'AppRoutes.jsx');
  const permissions = frontendSource('config', 'permissions.js');

  assert.match(navigation, /title:\s*"Notifications"/);
  assert.match(navigation, /icon:\s*Bell/);
  assert.match(navigation, /path:\s*"\/notifications"/);
  assert.match(navigation, /permission:\s*PERMISSIONS\.VIEW_NOTIFICATIONS/);
  assert.doesNotMatch(navigation, /badge:\s*\d+/);
  assert.match(sidebar, /notificationBadge/);
  assert.match(sidebar, /item\.path === "\/notifications"/);
  assert.match(routes, /<Route path="\/notifications" element=\{<NotificationsList \/>\}/);
  assert.match(permissions, /"\/notifications":\s*PERMISSIONS\.VIEW_NOTIFICATIONS/);
});

test('sidebar supports expanded, collapsed, and mobile drawer accessibility states', () => {
  const sidebar = frontendSource('components', 'layout', 'Sidebar.jsx');
  const item = frontendSource('components', 'layout', 'SidebarItem.jsx');
  const context = frontendSource('context', 'SidebarContext.jsx');
  const navbar = frontendSource('components', 'layout', 'Navbar.jsx');
  const layout = frontendSource('layouts', 'DashboardLayout.jsx');

  assert.match(sidebar, /aria-label="Primary navigation"/);
  assert.match(sidebar, /aria-label="Sidebar menu"/);
  assert.match(sidebar, /fixed[\s\S]*md:relative/);
  assert.match(sidebar, /translate-x-0/);
  assert.match(sidebar, /-translate-x-full/);
  assert.match(sidebar, /<nav className="min-h-0 flex-1 overflow-hidden/);
  assert.match(item, /title=\{compact \? title : undefined\}/);
  assert.match(item, /group-hover:opacity-100/);
  assert.match(item, /focus-visible:outline/);
  assert.match(context, /event\.key === "Escape"/);
  assert.match(context, /document\.body\.style\.overflow = "hidden"/);
  assert.match(navbar, /aria-label="Open navigation menu"/);
  assert.match(layout, /overflow-hidden bg-slate-100/);
  assert.match(layout, /min-w-0 flex-1/);
  assert.match(layout, /overflow-x-hidden/);
});

test('navigation does not contain duplicate sidebar paths', () => {
  const navigation = frontendSource('constants', 'navigation.js');
  const paths = [...navigation.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
  const duplicates = paths.filter((pathValue, index) => paths.indexOf(pathValue) !== index);

  assert.deepEqual(duplicates, []);
});

test('settings is removed from sidebar, navbar, permissions, and routes', () => {
  const navigation = frontendSource('constants', 'navigation.js');
  const navbar = frontendSource('components', 'layout', 'Navbar.jsx');
  const routes = frontendSource('routes', 'AppRoutes.jsx');
  const permissions = frontendSource('config', 'permissions.js');

  assert.doesNotMatch(navigation, /Settings|\/settings|VIEW_SYSTEM_SETTINGS|MANAGE_SETTINGS/);
  assert.doesNotMatch(navbar, /Settings|\/settings|VIEW_SYSTEM_SETTINGS|MANAGE_SETTINGS/);
  assert.doesNotMatch(routes, /Settings|\/settings|VIEW_SYSTEM_SETTINGS|MANAGE_SETTINGS/);
  assert.doesNotMatch(permissions, /\/settings|VIEW_SYSTEM_SETTINGS|MANAGE_SETTINGS/);
});

test('finance head sidebar excludes all invoice module entries', () => {
  const navigation = frontendSource('constants', 'navigation.js');
  const sidebar = frontendSource('components', 'layout', 'Sidebar.jsx');

  assert.match(navigation, /title:\s*"Invoices"[\s\S]*excludedRoles:\s*\[ROLES\.FINANCE_HEAD\]/);
  assert.doesNotMatch(navigation, /Invoice Approvals|invoice-approvals/);
  assert.match(sidebar, /!item\.excludedRoles\?\.\includes\(user\?\.role\)/);
});

test('ticket module is removed from navigation, routes, and permissions', () => {
  const navigation = frontendSource('constants', 'navigation.js');
  const routes = frontendSource('routes', 'AppRoutes.jsx');
  const permissions = frontendSource('config', 'permissions.js');

  assert.doesNotMatch(navigation, /Tickets|LifeBuoy|\/tickets|VIEW_TICKETS/);
  assert.doesNotMatch(routes, /TicketList|\/tickets/);
  assert.doesNotMatch(permissions, /VIEW_TICKETS|\/tickets/);
});
