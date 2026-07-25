import { useEffect, useState } from 'react';
import { normalizeApiError } from '../../shared/services/http-error.js';
import { membersApi } from './members.api.js';

const roles = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];

export function ProjectMembersPanel({ projectId, onCountChange, onMembershipLoaded }) {
  const [members, setMembers] = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [invite, setInvite] = useState({ email: '', role: 'MEMBER' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isOwner = currentMembership?.role === 'OWNER';

  async function load() {
    const data = await membersApi.list(projectId);
    setMembers(data.members || []);
    setCurrentMembership(data.currentMembership);
    onCountChange?.((data.members || []).filter((member) => member.isActive).length);
    onMembershipLoaded?.(data.currentMembership);
    if (data.currentMembership?.role === 'OWNER') setInvitations(await membersApi.invitations(projectId));
  }

  useEffect(() => { load().catch((requestError) => setError(normalizeApiError(requestError).message)); }, [projectId]);

  async function execute(action, successMessage) {
    setError('');
    try { await action(); await load(); setMessage(successMessage); } catch (requestError) { setError(normalizeApiError(requestError).message); }
  }

  async function submitInvitation(event) {
    event.preventDefault();
    await execute(async () => { await membersApi.invite(projectId, invite); setInvite({ email: '', role: 'MEMBER' }); }, 'Convite enviado com sucesso.');
  }

  async function leaveProject() {
    if (!window.confirm('Sair deste projeto?')) return;
    setError('');
    try {
      await membersApi.leave(projectId);
      setMembers([]);
      setCurrentMembership(null);
      onCountChange?.(0);
      onMembershipLoaded?.(null);
      setMessage('Você saiu do projeto.');
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    }
  }

  return (
    <section aria-label="Administração de membros">
      {error && <div className="message message-error">{error}</div>}
      {message && <div className="message message-success">{message}</div>}
      {members.length === 0 ? <p className="empty-state">Nenhum membro cadastrado.</p> : (
        <div className="member-list member-list-wide">
          {members.map((member) => (
            <article className="member-item" key={member.id}>
              <strong>{member.user.name}</strong>
              <span>{member.user.email || 'E-mail protegido'}</span>
              <span>{member.isActive ? 'Ativo' : 'Inativo'}</span>
              {isOwner ? (
                <>
                  <label>Perfil de {member.user.name}
                    <select value={member.role} onChange={(event) => execute(() => membersApi.updateRole(projectId, member.id, event.target.value), 'Papel atualizado com sucesso.')}>
                      {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  {member.isActive ? <button type="button" onClick={() => window.confirm('Desativar este membro?') && execute(() => membersApi.deactivate(projectId, member.id), 'Membro desativado.')}>Desativar</button> : <button type="button" onClick={() => execute(() => membersApi.reactivate(projectId, member.id), 'Membro reativado.')}>Reativar</button>}
                  {member.isActive && member.role !== 'OWNER' && <button type="button" onClick={() => window.confirm('Transferir a propriedade para este membro?') && execute(() => membersApi.transfer(projectId, member.id), 'Propriedade transferida.')}>Tornar proprietário</button>}
                </>
              ) : <span>{member.role}</span>}
            </article>
          ))}
        </div>
      )}
      <button type="button" onClick={leaveProject}>Sair do projeto</button>
      {isOwner && (
        <div>
          <h3>Convites</h3>
          <form onSubmit={submitInvitation}>
            <label>E-mail do convite<input type="email" required value={invite.email} onChange={(event) => setInvite((value) => ({ ...value, email: event.target.value }))} /></label>
            <label>Papel do convite<select value={invite.role} onChange={(event) => setInvite((value) => ({ ...value, role: event.target.value }))}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
            <button type="submit">Enviar convite</button>
          </form>
          {invitations.map((invitation) => <article key={invitation.id}><span>{invitation.email} — {invitation.role}</span>{!invitation.revokedAt && !invitation.acceptedAt && <button type="button" onClick={() => execute(() => membersApi.revokeInvitation(projectId, invitation.id), 'Convite revogado.')}>Revogar</button>}</article>)}
        </div>
      )}
    </section>
  );
}
