import { useEffect, useState } from 'react';
import { FeedbackRegion, normalizeApiError, useConfirm } from '../../../shared/index.js';
import { projectsApi } from '../api/projects.api.js';
import './ProjectAccessCodePanel.css';

const roleLabels = Object.freeze({ MEMBER: 'Membro', VIEWER: 'Visualizador' });

function EyeIcon({ hidden }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
      {hidden ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 0-2.05 4.95" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1" />
    </svg>
  );
}

export function ProjectAccessCodePanel({ projectId, isOwner }) {
  const confirm = useConfirm();
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
    <section className="overview-summary-card overview-access-code project-access-code-card">
      <h3>Acesso ao projeto</h3>
      <FeedbackRegion error={error} success={success} />
      {!configuration ? (
        <span>Carregando configuração...</span>
      ) : (
        <div className="access-code-control">
          <div className="access-code-value-row">
            <code>{visible ? configuration.accessCode : '••••••••••••••••'}</code>
            <div className="access-code-actions">
              <button
                className="button button-secondary access-code-icon-button"
                type="button"
                title={visible ? 'Ocultar código' : 'Mostrar código'}
                aria-label={visible ? 'Ocultar código' : 'Mostrar código'}
                onClick={() => setVisible((value) => !value)}
              >
                <EyeIcon hidden={visible} />
              </button>
              <button
                className="button button-secondary access-code-icon-button"
                type="button"
                title="Regenerar código"
                disabled={Boolean(busy)}
                aria-label="Regenerar código"
                onClick={() => void regenerate()}
              >
                <RefreshIcon />
              </button>
              <button
                className="button button-secondary access-code-icon-button"
                type="button"
                title="Copiar link"
                disabled={Boolean(busy)}
                aria-label="Copiar link"
                onClick={() => void copyLink()}
              >
                <CopyIcon />
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
