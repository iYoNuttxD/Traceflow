import { useEffect, useId, useState } from 'react';
import {
  FeedbackRegion,
  TraceFlowIcon,
  normalizeApiError,
  useConfirm
} from '../../../shared/index.js';
import { projectsApi } from '../api/projects.api.js';
import './ProjectAccessCodePanel.css';

const roleLabels = Object.freeze({ MEMBER: 'Membro', VIEWER: 'Visualizador' });

export function ProjectAccessCodePanel({ projectId, isOwner }) {
  const confirm = useConfirm();
  const headingId = useId();
  const [configuration, setConfiguration] = useState(null);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isOwner) {
      setConfiguration(null);
      return undefined;
    }
    let active = true;
    setError('');
    void projectsApi
      .getAccessCode(projectId)
      .then((response) => {
        if (active) setConfiguration(response.data.accessCode);
      })
      .catch((requestError) => {
        if (active)
          setError(normalizeApiError(requestError, 'Não foi possível carregar o código.').message);
      });
    return () => {
      active = false;
    };
  }, [isOwner, projectId]);

  if (!isOwner) return null;

  async function copyLink() {
    if (!configuration?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(configuration.inviteLink);
      setError('');
      setSuccess('Link de acesso copiado.');
    } catch {
      setSuccess('');
      setError('Não foi possível copiar o link de acesso.');
    }
  }

  async function regenerate() {
    if (
      !(await confirm({
        title: 'Regenerar código de acesso',
        description:
          'O código atual deixará de funcionar imediatamente. Deseja gerar um novo código?',
        confirmLabel: 'Regenerar'
      }))
    )
      return;
    setBusy('regenerate');
    setError('');
    setSuccess('');
    try {
      const response = await projectsApi.regenerateAccessCode(projectId);
      setConfiguration(response.data.accessCode);
      setVisible(true);
      setSuccess('Código de acesso regenerado com sucesso.');
    } catch (requestError) {
      setError(normalizeApiError(requestError, 'Não foi possível regenerar o código.').message);
    } finally {
      setBusy('');
    }
  }

  async function updateRole(role) {
    setBusy('role');
    setError('');
    setSuccess('');
    try {
      const response = await projectsApi.updateAccessCodeRole(projectId, role);
      setConfiguration(response.data.accessCode);
      setSuccess('Perfil de entrada atualizado com sucesso.');
    } catch (requestError) {
      setError(
        normalizeApiError(requestError, 'Não foi possível atualizar o perfil de entrada.').message
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="project-access-code-section" aria-labelledby={headingId}>
      <h3 id={headingId}>Acesso por código ou link</h3>
      <FeedbackRegion error={error} success={success} />
      {!configuration ? (
        <span>Carregando configuração...</span>
      ) : (
        <div className="access-code-control">
          <div className="access-code-value-row">
            <code>{visible ? configuration.accessCode : '••••••••••••••••'}</code>
            <div className="access-code-actions">
              <button
                className="access-code-icon-button"
                type="button"
                title={visible ? 'Ocultar código' : 'Mostrar código'}
                aria-label={visible ? 'Ocultar código' : 'Mostrar código'}
                onClick={() => setVisible((value) => !value)}
              >
                <TraceFlowIcon name={visible ? 'eyeOff' : 'eye'} />
              </button>
              <button
                className="access-code-icon-button"
                type="button"
                title="Regenerar código"
                disabled={Boolean(busy)}
                aria-label="Regenerar código"
                onClick={() => void regenerate()}
              >
                <TraceFlowIcon name="refresh" />
              </button>
              <button
                className="access-code-icon-button"
                type="button"
                title="Copiar link"
                disabled={Boolean(busy)}
                aria-label="Copiar link"
                onClick={() => void copyLink()}
              >
                <TraceFlowIcon name="copy" />
              </button>
            </div>
          </div>
          <label className="access-code-role">
            <span>Perfil de entrada</span>
            <select
              value={configuration.role}
              disabled={Boolean(busy)}
              onChange={(event) => void updateRole(event.target.value)}
            >
              {Object.entries(roleLabels).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
