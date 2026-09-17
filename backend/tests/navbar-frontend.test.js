import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');

test('navbar uses centralized compact layout values and has no settings shortcut', () => {
  const navbar = frontendSource('components', 'layout', 'Navbar.jsx');

  assert.match(navbar, /const NAVBAR_STYLES/);
  assert.match(navbar, /height:\s*"h-16 md:h-20"/);
  assert.match(navbar, /padding:\s*"px-4 md:px-8"/);
  assert.match(navbar, /sectionGap:\s*"gap-2 sm:gap-3"/);
  assert.match(navbar, /h-10 w-10/);
  assert.doesNotMatch(navbar, /Settings|\/settings|VIEW_SYSTEM_SETTINGS|MANAGE_SETTINGS/);
});

test('navbar notification button navigates with router and uses real unread count state', () => {
  const navbar = frontendSource('components', 'layout', 'Navbar.jsx');
  const notificationContext = frontendSource('context', 'NotificationContext.jsx');
  const notificationService = frontendSource('services', 'notificationService.js');

  assert.match(navbar, /aria-label="Open notifications"/);
  assert.match(navbar, /onClick=\{\(\) => navigate\("\/notifications"\)\}/);
  assert.match(navbar, /aria-current=\{isNotificationsActive \? "page" : undefined\}/);
  assert.match(navbar, /showNotificationBadge/);
  assert.match(navbar, /Number\.isFinite\(unreadCount\) && unreadCount > 0/);
  assert.match(navbar, /unreadCount > 99 \? "99\+" : unreadCount/);
  assert.doesNotMatch(navbar, /badge:\s*\d+|Math\.random|const\s+notifications\s*=\s*\[/);
  assert.match(notificationContext, /getUnreadCount\(\)/);
  assert.match(notificationContext, /setUnreadCount\(null\)/);
  assert.match(notificationContext, /countError/);
  assert.match(notificationService, /\/v1\/notifications\/unread-count/);
});

test('navbar logo routes to dashboard and mobile menu remains accessible', () => {
  const navbar = frontendSource('components', 'layout', 'Navbar.jsx');

  assert.match(navbar, /aria-label="Go to dashboard"/);
  assert.match(navbar, /onClick=\{\(\) => navigate\("\/dashboard"\)\}/);
  assert.match(navbar, /aria-label="Open navigation menu"/);
  assert.match(navbar, /openMobileSidebar/);
});

test('navbar has one notification control and no browser-navigation links', () => {
  const navbar = frontendSource('components', 'layout', 'Navbar.jsx');

  const notificationLabels = [...navbar.matchAll(/aria-label="Open notifications"/g)];
  assert.equal(notificationLabels.length, 1);
  assert.doesNotMatch(navbar, /href=|window\.location|location\.href/);
});
