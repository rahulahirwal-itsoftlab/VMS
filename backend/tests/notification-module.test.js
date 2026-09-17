import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import notificationRepository from '../src/modules/notifications/notification.repository.js';
import notificationService, { NOTIFICATION_TYPES } from '../src/modules/notifications/notification.service.js';

const originalRepository = {
  countUnread: notificationRepository.countUnread,
  deleteForUser: notificationRepository.deleteForUser,
  findAll: notificationRepository.findAll,
  findByIdForUser: notificationRepository.findByIdForUser,
  markAllAsRead: notificationRepository.markAllAsRead,
  markAsRead: notificationRepository.markAsRead,
};
const originalCreateNotification = notificationService.createNotification;

const frontendSource = (...segments) =>
  fs.readFileSync(path.resolve('..', 'frontend', 'src', ...segments), 'utf8');

test.afterEach(() => {
  Object.assign(notificationRepository, originalRepository);
  notificationService.createNotification = originalCreateNotification;
});

test('notification list uses authenticated recipient, filters, pagination, and newest-first repository path', async () => {
  let receivedArgs;
  notificationRepository.findAll = async (args) => {
    receivedArgs = args;
    return {
      notifications: [
        {
          id: 'notification_1',
          user_id: args.userId,
          title: 'Title',
          message: 'Message',
          type: NOTIFICATION_TYPES.USER_CREATED,
          entity_type: 'user',
          entity_id: 'user_1',
          is_read: false,
          read_at: null,
          created_at: new Date('2026-07-16T10:00:00.000Z'),
        },
      ],
      total: 1,
      unreadCount: 1,
    };
  };

  const result = await notificationService.getMyNotifications('recipient_1', {
    page: '2',
    limit: '10',
    isRead: 'false',
    createdFrom: '2026-07-01',
    createdTo: '2026-07-16',
  });

  assert.equal(receivedArgs.userId, 'recipient_1');
  assert.equal(receivedArgs.isRead, false);
  assert.equal(receivedArgs.skip, 10);
  assert.equal(receivedArgs.take, 10);
  assert.ok(receivedArgs.createdFrom instanceof Date);
  assert.ok(receivedArgs.createdTo instanceof Date);
  assert.equal(result.notifications[0].user_id, 'recipient_1');
  assert.equal(result.unreadCount, 1);
});

test('user cannot read or mark another user notification', async () => {
  notificationRepository.findByIdForUser = async () => null;
  notificationRepository.markAsRead = async () => ({ count: 0 });

  await assert.rejects(
    () => notificationService.getById('notification_1', 'recipient_1'),
    { statusCode: 404 }
  );

  await assert.rejects(
    () => notificationService.markAsRead('notification_1', 'recipient_1'),
    { statusCode: 404 }
  );
});

test('unread count, mark-all, and delete are scoped to authenticated user', async () => {
  const calls = [];
  notificationRepository.countUnread = async (userId) => {
    calls.push(['countUnread', userId]);
    return 7;
  };
  notificationRepository.markAllAsRead = async (userId) => {
    calls.push(['markAllAsRead', userId]);
    return { count: 7 };
  };
  notificationRepository.deleteForUser = async (id, userId) => {
    calls.push(['deleteForUser', id, userId]);
    return { count: 1 };
  };

  assert.deepEqual(await notificationService.getUnreadCount('recipient_1'), { unreadCount: 7 });
  assert.equal((await notificationService.markAllAsRead('recipient_1')).updatedCount, 7);
  assert.equal((await notificationService.deleteNotification('notification_1', 'recipient_1')).message, 'Notification dismissed.');
  assert.deepEqual(calls, [
    ['countUnread', 'recipient_1'],
    ['markAllAsRead', 'recipient_1'],
    ['deleteForUser', 'notification_1', 'recipient_1'],
  ]);
});

test('credential notification helpers never store temporary passwords, tokens, or hashes', async () => {
  const created = [];
  notificationService.createNotification = async (...args) => {
    created.push(args);
  };
  const user = {
    id: 'user_1',
    email: 'employee@example.com',
    first_name: 'Employee',
  };

  await notificationService.notifyCredentialEmailSent('creator_1', user);
  await notificationService.notifyCredentialEmailFailed('creator_1', user);

  const serialized = JSON.stringify(created).toLowerCase();
  assert.match(serialized, /employee@example\.com/);
  assert.doesNotMatch(serialized, /temporary password/);
  assert.doesNotMatch(serialized, /token/);
  assert.doesNotMatch(serialized, /hash/);
  assert.doesNotMatch(serialized, /otp/);
});

test('frontend notification module uses real API, shared unread badge state, and no fake fallback records', () => {
  const service = frontendSource('services', 'notificationService.js');
  const context = frontendSource('context', 'NotificationContext.jsx');
  const sidebar = frontendSource('components', 'layout', 'Sidebar.jsx');
  const page = frontendSource('pages', 'Notifications', 'NotificationsList.jsx');
  const navbar = frontendSource('components', 'layout', 'Navbar.jsx');

  assert.match(service, /\/v1\/notifications\/unread-count/);
  assert.match(service, /api\.delete\(`\/v1\/notifications\/\$\{id\}`\)/);
  assert.match(context, /setInterval\(refreshUnreadCount, 60000\)/);
  assert.match(sidebar, /useNotifications/);
  assert.match(sidebar, /notificationBadge/);
  assert.match(page, /getNotifications\(queryParams\)/);
  assert.match(page, /markRead\(notification\.id\)/);
  assert.match(page, /deleteNotification\(notification\.id\)/);
  assert.doesNotMatch(page, /Open related|getRelatedPath|handleOpenRelated|useNavigate/);
  assert.match(navbar, /navigate\("\/notifications"\)/);
  assert.match(navbar, /useNotifications/);
  assert.match(navbar, /showNotificationBadge/);
  assert.doesNotMatch(navbar, /unreadCount\s*>\s*0\s*&&/);
  assert.doesNotMatch(page, /Math\.random/);
  assert.doesNotMatch(page, /const\s+notifications\s*=\s*\[/);
  assert.doesNotMatch(page, /fake|mock|sample|demo/i);
});

test('authenticated API responses disable conditional caching for live notification counts', () => {
  const appSource = fs.readFileSync(path.resolve('src', 'app.js'), 'utf8');

  assert.match(appSource, /app\.set\('etag', false\)/);
  assert.match(appSource, /app\.use\('\/api\/v1'/);
  assert.match(appSource, /Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'/);
});
