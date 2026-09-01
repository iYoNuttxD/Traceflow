import { httpClient } from '../../../api/http-client.js';

export const authApi = {
  register(data) {
    return httpClient.post('/auth/register', data);
  },
  login(data) {
    return httpClient.post('/auth/login', data);
  },
  async startGithubLogin(data) {
    return (await httpClient.post('/auth/github/start', data)).data;
  },
  async startGithubSensitiveReauthentication(returnTo) {
    return (await httpClient.post('/auth/github/reauth/start', { returnTo })).data;
  },
  me(options = {}) {
    return httpClient.get('/auth/me', options);
  },
  csrf(options = {}) {
    return httpClient.get('/auth/csrf', options);
  },
  logout() {
    return httpClient.post('/auth/logout');
  },
  forgotPassword(email) {
    return httpClient.post('/auth/forgot-password', { email });
  },
  resetPassword(token, password) {
    return httpClient.post('/auth/reset-password', { token, password });
  },
  resendEmailVerification() {
    return httpClient.post('/auth/email-verification/resend', {});
  },
  verifyEmail(token) {
    return httpClient.post('/auth/email-verification/verify', { token });
  },
  updateUsername(username) {
    return httpClient.patch('/auth/username', { username });
  },
  changePassword(currentPassword, password) {
    return httpClient.post('/auth/change-password', { currentPassword, password });
  }
};
