import { httpClient } from '../../api/http-client.js';

export const settingsApi = {
  async account(options = {}) {
    return (await httpClient.get('/settings/account', options)).data.account;
  },
  async updateProfile(name) {
    return (await httpClient.patch('/settings/account/profile', { name })).data.account;
  },
  async updateUsername(username) {
    return (await httpClient.patch('/settings/account/username', { username })).data.account;
  },
  async requestEmailChange(newEmail, currentPassword) {
    return (await httpClient.post('/settings/account/email-change', { newEmail, currentPassword }))
      .data.request;
  },
  cancelEmailChange() {
    return httpClient.delete('/settings/account/email-change');
  },
  async changePassword(data) {
    return (await httpClient.post('/settings/security/password', data)).data;
  },
  async sessions(options = {}) {
    return (await httpClient.get('/settings/security/sessions', options)).data.sessions;
  },
  revokeSession(sessionId) {
    return httpClient.delete(`/settings/security/sessions/${encodeURIComponent(sessionId)}`);
  },
  async revokeOtherSessions() {
    return (await httpClient.post('/settings/security/sessions/revoke-others')).data.revoked;
  },
  async deactivate(currentPassword) {
    return (
      await httpClient.post('/settings/account/deactivate', {
        currentPassword,
        confirmation: true
      })
    ).data.account;
  },
  startReactivation() {
    return httpClient.post('/account/reactivation/start', {});
  },
  async deletion(options = {}) {
    return (await httpClient.get('/settings/privacy/deletion', options)).data.request;
  },
  async requestDeletion(currentPassword) {
    return (
      await httpClient.post('/settings/privacy/deletion', {
        currentPassword,
        confirmation: true
      })
    ).data.request;
  },
  cancelDeletion(currentPassword) {
    return httpClient.delete('/settings/privacy/deletion', {
      data: { currentPassword, confirmation: true }
    });
  },
  async exportData() {
    return (await httpClient.post('/settings/privacy/export', {}, { responseType: 'blob' })).data;
  },
  async github(options = {}) {
    return (await httpClient.get('/settings/integrations/github', options)).data.integrations;
  },
  startGithubInstallation() {
    return httpClient.post('/github/app/installations/start', {
      intendedAction: 'CREATE_PROJECT'
    });
  },
  removeGithubAuthorization(authorizationId, currentPassword) {
    return httpClient.delete(`/settings/integrations/github/authorizations/${authorizationId}`, {
      data: { currentPassword, confirmation: true }
    });
  },
  confirmEmail(token) {
    return httpClient.get('/settings/account/email-change/confirm', { params: { token } });
  },
  confirmReactivation(token) {
    return httpClient.get('/account/reactivation/confirm', { params: { token } });
  }
};
