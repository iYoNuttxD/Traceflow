import { httpClient } from '../../../api/http-client.js';

export const authApi = {
  register(data) { return httpClient.post('/auth/register', data); },
  login(data) { return httpClient.post('/auth/login', data); },
  me(options = {}) { return httpClient.get('/auth/me', options); },
  csrf(options = {}) { return httpClient.get('/auth/csrf', options); },
  logout() { return httpClient.post('/auth/logout'); },
  forgotPassword(email) { return httpClient.post('/auth/forgot-password', { email }); },
  resetPassword(token, password) { return httpClient.post('/auth/reset-password', { token, password }); },
  changePassword(currentPassword, password) { return httpClient.post('/auth/change-password', { currentPassword, password }); },
  acceptInvitation(token) { return httpClient.post('/projects/invitations/accept', { token }); }
};
