import { api } from '../../api/api.js';

export const membersApi = {
  async list(projectId) { return (await api.get(`/projects/${projectId}/members`)).data; },
  async updateRole(projectId, membershipId, role) { return (await api.patch(`/projects/${projectId}/members/${membershipId}`, { role })).data; },
  deactivate(projectId, membershipId) { return api.delete(`/projects/${projectId}/members/${membershipId}`); },
  async reactivate(projectId, membershipId) { return (await api.post(`/projects/${projectId}/members/${membershipId}/reactivate`, {})).data; },
  leave(projectId) { return api.delete(`/projects/${projectId}/members/me`); },
  async transfer(projectId, membershipId) { return (await api.post(`/projects/${projectId}/ownership/transfer`, { membershipId })).data; },
  async invitations(projectId) { return (await api.get(`/projects/${projectId}/invitations`)).data.invitations; },
  async invite(projectId, data) { return (await api.post(`/projects/${projectId}/invitations`, data)).data.invitation; },
  revokeInvitation(projectId, invitationId) { return api.delete(`/projects/${projectId}/invitations/${invitationId}`); }
};
