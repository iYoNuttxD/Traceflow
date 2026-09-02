import { httpClient } from '../../api/http-client.js';

export const membersApi = {
  async list(projectId, options = {}) {
    return (await httpClient.get(`/projects/${projectId}/members`, options)).data;
  },
  async updateRole(projectId, membershipId, role) {
    return (await httpClient.patch(`/projects/${projectId}/members/${membershipId}`, { role }))
      .data;
  },
  deactivate(projectId, membershipId) {
    return httpClient.delete(`/projects/${projectId}/members/${membershipId}`);
  },
  async reactivate(projectId, membershipId) {
    return (await httpClient.post(`/projects/${projectId}/members/${membershipId}/reactivate`, {}))
      .data;
  },
  leave(projectId) {
    return httpClient.delete(`/projects/${projectId}/members/me`);
  },
  async transfer(projectId, membershipId) {
    return (await httpClient.post(`/projects/${projectId}/ownership/transfer`, { membershipId }))
      .data;
  },
  async invitations(projectId, options = {}) {
    return (await httpClient.get(`/projects/${projectId}/invitations`, options)).data.invitations;
  },
  async invite(projectId, data) {
    return (await httpClient.post(`/projects/${projectId}/invitations`, data)).data;
  },
  revokeInvitation(projectId, invitationId) {
    return httpClient.delete(`/projects/${projectId}/invitations/${invitationId}`);
  },
  async invitationDetails(token) {
    return (await httpClient.post('/projects/invitations/details', { token })).data.invitation;
  },
  async acceptInvitation(token) {
    return (await httpClient.post('/projects/invitations/accept', { token })).data;
  },
  declineInvitation(token) {
    return httpClient.post('/projects/invitations/decline', { token });
  },
  async joinProject(data) {
    return (await httpClient.post('/projects/join', data)).data;
  },
  async joinDetails(accessCode) {
    return (
      await httpClient.get('/projects/join/details', {
        params: { accessCode }
      })
    ).data.details;
  }
};
