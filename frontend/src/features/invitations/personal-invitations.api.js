import { httpClient } from '../../api/http-client.js';

export const personalInvitationsApi = {
  async list() {
    return (await httpClient.get('/projects/invitations/mine')).data.invitations;
  },
  async accept(invitationId) {
    return (await httpClient.post(`/projects/invitations/${invitationId}/accept`, {})).data;
  },
  decline(invitationId) {
    return httpClient.post(`/projects/invitations/${invitationId}/decline`, {});
  }
};
