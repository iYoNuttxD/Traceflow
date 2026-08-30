import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FeedbackRegion,
  TraceFlowIcon,
  normalizeApiError,
  useConfirm,
  useCountdown
} from '../../shared/index.js';
import { membersApi } from './members.api.js';
import '../../shared/styles/form-layouts.css';
import './ProjectMembersPanel.css';

const roles = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];
const roleLabels = Object.freeze({
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  MEMBER: 'Membro',
  VIEWER: 'Visualizador'
});
const invitationStatusLabels = Object.freeze({
  PENDING: 'Pendente',
  ACCEPTED: 'Aceito',
  DECLINED: 'Recusado',
  REVOKED: 'Revogado',
  EXPIRED: 'Expirado'
});

function formatDateTime(value) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value)
      )
    : 'Não informado';
}

function invitationSuccess(result) {
  if (result.emailDelivery?.status === 'accepted')
    return 'Convite criado. E-mail enviado com sucesso.';
  return 'Convite criado. O e-mail não pôde ser entregue agora; revogue-o antes de gerar um novo link.';
}

export function ProjectMembersPanel({
  projectId,
  activeView = 'team',
  onCountChange,
  onMembershipLoaded
}) {
  const confirm = useConfirm();
  const [members, setMembers] = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [invite, setInvite] = useState({ email: '', role: 'MEMBER' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const invitationLock = useRef(false);
  const isOwner = currentMembership?.role === 'OWNER';
  const activeOwnerCount = useMemo(
    () => members.filter((member) => member.isActive && member.role === 'OWNER').length,
    [members]
  );
  const filteredMembers = useMemo(() => {
    const normalizedQuery = memberQuery.trim().toLocaleLowerCase('pt-BR');
    return members.filter((member) => {
      const name = member.user.name?.toLocaleLowerCase('pt-BR') || '';
      const username = member.user.username?.toLocaleLowerCase('pt-BR') || '';
      const matchesQuery =
        !normalizedQuery || name.includes(normalizedQuery) || username.includes(normalizedQuery);
      const matchesRole = roleFilter === 'ALL' || member.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [memberQuery, members, roleFilter]);
  const pendingInvitations = invitations.filter((invitation) => invitation.status === 'PENDING');
  const resolvedInvitations = invitations.filter((invitation) => invitation.status !== 'PENDING');

  function clearFeedback() {
    setError('');
    setMessage('');
    setWarning('');
    setRetryAfterSeconds(0);
  }

  function showError(requestError) {
    const normalized = normalizeApiError(requestError);
    setError(normalized.message);
    setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
  }

  async function load() {
    const data = await membersApi.list(projectId);
    setMembers(data.members || []);
    setCurrentMembership(data.currentMembership);
    onCountChange?.((data.members || []).filter((member) => member.isActive).length);
    onMembershipLoaded?.(data.currentMembership);
    setInvitations(
      data.currentMembership?.role === 'OWNER' ? await membersApi.invitations(projectId) : []
    );
  }

  useEffect(() => {
    setLoading(true);
    clearFeedback();
    load()
      .catch(showError)
      .finally(() => setLoading(false));
    // A carga acompanha somente a troca do projeto; callbacks de composição não disparam reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function execute(key, action, successMessage) {
    clearFeedback();
    setBusy(key);
    try {
      await action();
      await load();
      setMessage(successMessage);
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  async function submitInvitation(event) {
    event.preventDefault();
    if (invitationLock.current || cooldown > 0) return;
    invitationLock.current = true;
    clearFeedback();
    setBusy('invite');
    try {
      const result = await membersApi.invite(projectId, invite);
      setInvite({ email: '', role: 'MEMBER' });
      await load();
      const feedback = invitationSuccess(result);
      if (result.emailDelivery?.status === 'accepted') setMessage(feedback);
      else setWarning(feedback);
    } catch (requestError) {
      showError(requestError);
    } finally {
      invitationLock.current = false;
      setBusy('');
    }
  }

  async function leaveProject() {
    if (
      !(await confirm({
        title: 'Sair do projeto',
        description: 'Você perderá o acesso a este projeto.',
        confirmLabel: 'Sair'
      }))
    )
      return;
    clearFeedback();
    setBusy('leave');
    try {
      await membersApi.leave(projectId);
      setMembers([]);
      setCurrentMembership(null);
      setInvitations([]);
      onCountChange?.(0);
      onMembershipLoaded?.(null);
      setMessage('Você saiu do projeto.');
    } catch (requestError) {
      showError(requestError);
    } finally {
      setBusy('');
    }
  }

  async function deactivateMember(member) {
    if (
      !(await confirm({
        title: 'Desativar membro',
        description: 'O membro perderá o acesso ativo ao projeto.',
        confirmLabel: 'Desativar'
      }))
    )
      return;
    await execute(
      `deactivate-${member.id}`,
      () => membersApi.deactivate(projectId, member.id),
      'Membro desativado.'
    );
  }

  async function transferOwnership(member) {
    if (
      !(await confirm({
        title: 'Adicionar proprietário',
        description: 'Este membro também passará a ser proprietário do projeto.',
        confirmLabel: 'Adicionar proprietário'
      }))
    )
      return;
    await execute(
      `owner-${member.id}`,
      () => membersApi.transfer(projectId, member.id),
      'Novo proprietário adicionado.'
    );
  }

  function renderInvitation(invitation) {
    return (
      <article className="invitation-item" key={invitation.id}>
        <div>
          <strong>{invitation.email}</strong>
          <span>{roleLabels[invitation.role] || invitation.role}</span>
        </div>
        <dl className="invitation-dates">
          <div>
            <dt>Criado</dt>
            <dd>{formatDateTime(invitation.createdAt)}</dd>
          </div>
          <div>
            <dt>Expira</dt>
            <dd>{formatDateTime(invitation.expiresAt)}</dd>
          </div>
        </dl>
        <span className="status-chip">
          {invitationStatusLabels[invitation.status] || invitation.status}
        </span>
        {invitation.status === 'PENDING' && (
          <button
            className="button button-danger button-compact"
            type="button"
            disabled={Boolean(busy)}
            onClick={() =>
              void execute(
                `revoke-${invitation.id}`,
                () => membersApi.revokeInvitation(projectId, invitation.id),
                'Convite revogado.'
              )
            }
          >
            Revogar
          </button>
        )}
      </article>
    );
  }

  return (
    <section className="team-panel" aria-label="Administração de membros" aria-busy={loading}>
      <FeedbackRegion
        error={cooldown ? undefined : error}
        rateLimit={cooldown ? error : undefined}
        retryAfterSeconds={retryAfterSeconds}
        warning={warning}
        success={message}
      />

      {activeView === 'team' ? (
        <>
          {!loading && members.length > 0 && (
            <div className="member-filter-bar" aria-label="Filtros de membros">
              <label className="field member-search-field">
                <span>Buscar membro</span>
                <span className="member-search-control">
                  <TraceFlowIcon name="search" />
                  <input
                    type="search"
                    value={memberQuery}
                    placeholder="Buscar por nome ou username"
                    onChange={(event) => setMemberQuery(event.target.value)}
                  />
                </span>
              </label>
              <label className="field">
                <span>Perfil</span>
                <select
                  aria-label="Filtrar por perfil"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                >
                  <option value="ALL">Todos os perfis</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {loading ? (
            <p className="empty-state">Carregando equipe...</p>
          ) : members.length === 0 ? (
            <p className="empty-state">Nenhum membro cadastrado.</p>
          ) : filteredMembers.length === 0 ? (
            <p className="empty-state">Nenhum membro encontrado.</p>
          ) : (
            <div className="member-list">
              {filteredMembers.map((member) => {
                const isLastActiveOwner =
                  member.isActive && member.role === 'OWNER' && activeOwnerCount === 1;
                return (
                  <article className="member-item" key={member.id}>
                    <div className="member-item-header">
                      <div className="member-identity">
                        <strong>
                          {member.user.name}
                          {member.id === currentMembership?.id ? ' — você' : ''}
                        </strong>
                        {member.user.username && <span>@{member.user.username}</span>}
                        <span>{member.user.email || 'E-mail protegido'}</span>
                      </div>
                      <div className="member-item-summary">
                        <span className="member-role-label">
                          {roleLabels[member.role] || member.role}
                        </span>
                        <span className={`status-chip ${member.isActive ? 'status-active' : ''}`}>
                          {member.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                    <span className="member-joined-at">
                      Entrou em {formatDateTime(member.joinedAt)}
                    </span>
                    {isOwner && (
                      <div className="member-actions">
                        <label className="field member-role-field">
                          <span>Perfil</span>
                          <select
                            aria-label={`Perfil de ${member.user.name}`}
                            value={member.role}
                            disabled={Boolean(busy) || isLastActiveOwner}
                            aria-describedby={
                              isLastActiveOwner ? `last-owner-${member.id}` : undefined
                            }
                            onChange={(event) => {
                              const nextRole = event.target.value;
                              void execute(
                                `role-${member.id}`,
                                () => membersApi.updateRole(projectId, member.id, nextRole),
                                'Perfil atualizado com sucesso.'
                              );
                            }}
                          >
                            {roles.map((role) => (
                              <option key={role} value={role}>
                                {roleLabels[role]}
                              </option>
                            ))}
                          </select>
                        </label>
                        {isLastActiveOwner && (
                          <small id={`last-owner-${member.id}`}>
                            Adicione outro proprietário antes de alterar este perfil ou sair.
                          </small>
                        )}
                        <div className="member-action-buttons">
                          {member.isActive ? (
                            <button
                              className="button button-danger button-compact"
                              type="button"
                              disabled={Boolean(busy) || isLastActiveOwner}
                              onClick={() => void deactivateMember(member)}
                            >
                              Desativar
                            </button>
                          ) : (
                            <button
                              className="button button-secondary button-compact"
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                void execute(
                                  `reactivate-${member.id}`,
                                  () => membersApi.reactivate(projectId, member.id),
                                  'Membro reativado.'
                                )
                              }
                            >
                              Reativar
                            </button>
                          )}
                          {member.isActive && member.role !== 'OWNER' && (
                            <button
                              className="button button-secondary button-compact"
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() => void transferOwnership(member)}
                            >
                              Adicionar como proprietário
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {currentMembership && (
            <section className="membership-self-service" aria-labelledby="membership-self-title">
              <div>
                <h3 id="membership-self-title">Sua participação</h3>
                <p>
                  Você pode sair deste projeto a qualquer momento, respeitando a regra do último
                  proprietário.
                </p>
              </div>
              <button
                className="button button-danger button-compact"
                type="button"
                disabled={Boolean(busy) || loading || (isOwner && activeOwnerCount === 1)}
                onClick={() => void leaveProject()}
              >
                Sair do projeto
              </button>
            </section>
          )}
        </>
      ) : isOwner ? (
        <div className="invitation-management">
          <section aria-labelledby="new-invitation-title">
            <h3 id="new-invitation-title">Convidar membro</h3>
            <form className="member-form invitation-form" onSubmit={submitInvitation}>
              <label className="field">
                <span>E-mail</span>
                <input
                  type="email"
                  required
                  disabled={Boolean(busy)}
                  value={invite.email}
                  onChange={(event) =>
                    setInvite((value) => ({ ...value, email: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Perfil</span>
                <select
                  aria-label="Perfil do convite"
                  disabled={Boolean(busy)}
                  value={invite.role}
                  onChange={(event) =>
                    setInvite((value) => ({ ...value, role: event.target.value }))
                  }
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-primary"
                type="submit"
                disabled={Boolean(busy) || cooldown > 0}
                aria-busy={busy === 'invite'}
              >
                {busy === 'invite'
                  ? 'Enviando...'
                  : cooldown > 0
                    ? `Enviar convite em ${cooldown}s`
                    : 'Enviar convite'}
              </button>
            </form>
          </section>

          <section className="invitation-section" aria-labelledby="pending-invitations-title">
            <h3 id="pending-invitations-title">Convites pendentes</h3>
            {pendingInvitations.length === 0 ? (
              <p className="empty-state">Nenhum convite pendente.</p>
            ) : (
              <div className="invitation-list">{pendingInvitations.map(renderInvitation)}</div>
            )}
          </section>

          {resolvedInvitations.length > 0 && (
            <section className="invitation-section" aria-labelledby="invitation-history-title">
              <h3 id="invitation-history-title">Histórico de convites</h3>
              <div className="invitation-list">{resolvedInvitations.map(renderInvitation)}</div>
            </section>
          )}
        </div>
      ) : null}
    </section>
  );
}
