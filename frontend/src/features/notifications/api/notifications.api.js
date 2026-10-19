import { httpClient } from '../../../api/http-client.js';
import { compactParams } from '../../../shared/utils/compact-params.js';

async function data(request) {
  return (await request).data;
}

export function listNotifications(params = {}, options = {}) {
  return data(httpClient.get('/notifications', { ...options, params: compactParams(params) }));
}

export function getUnreadNotificationCount(options = {}) {
  return data(httpClient.get('/notifications/unread-count', options));
}

export function markNotification(notificationId, read) {
  return data(httpClient.patch(`/notifications/${notificationId}`, { read }));
}

export function markAllNotificationsRead() {
  return data(httpClient.post('/notifications/read-all', {}));
}

export function getNotificationPreferences(options = {}) {
  return data(httpClient.get('/settings/notifications', options));
}

export function saveNotificationPreferences(preferences) {
  return data(httpClient.put('/settings/notifications', { preferences }));
}
