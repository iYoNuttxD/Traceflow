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
    return (await httpClient.post(`/projects/${projectId}/invitations`, data)).data.invitation;
  },
  revokeInvitation(projectId, invitationId) {
    return httpClient.delete(`/projects/${projectId}/invitations/${invitationId}`);
  },
  listProjectMembers(projectId, options = {}) {
    return httpClient.get(`/projects/${projectId}/members`, options);
  },
  joinProject(data) {
    return httpClient.post('/projects/join', data);
  }
};

export const projectMembersApi = membersApi;
