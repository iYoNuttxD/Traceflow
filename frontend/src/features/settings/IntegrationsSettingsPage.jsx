import { useEffect, useState } from 'react';
import { normalizeApiError, useConfirm } from '../../shared/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';

export function IntegrationsSettingsPage() {
  const confirm = useConfirm();
  const [integrations, setIntegrations] = useState([]);
  const [passwords, setPasswords] = useState({});
  const [authorizing, setAuthorizing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() {
    setIntegrations(await settingsApi.github());
  }
  useEffect(() => {
    load().catch((value) => setError(normalizeApiError(value).message));
  }, []);
  async function remove(id) {
    if (
      !(await confirm({
        title: 'Remover autorização pessoal',
        description:
          'A instalação e os projetos da equipe serão preservados. Somente seu acesso pessoal será removido.',
        confirmLabel: 'Remover autorização'
      }))
    )
      return;
    setError('');
    try {
      await settingsApi.removeGithubAuthorization(id, passwords[id] || '');
      setMessage('Autorização pessoal removida.');
      setPasswords((current) => ({ ...current, [id]: '' }));
      await load();
    } catch (value) {
      setError(normalizeApiError(value).message);
    }
  }
  async function authorize() {
    if (authorizing) return;
    setAuthorizing(true);
    setError('');
    try {
      const response = await settingsApi.startGithubInstallation();
      window.location.assign(response.data.url);
    } catch (value) {
      setError(normalizeApiError(value).message);
      setAuthorizing(false);
    }
  }
  return (
    <>
      <SettingsFeedback error={error} message={message} />
      <section className="settings-card">
        <h2>GitHub App</h2>
        <p>
          As autorizações abaixo são pessoais. Removê-las não desinstala a GitHub App nem exclui
          projetos.
        </p>
        <button
          className="button button-secondary"
          type="button"
          disabled={authorizing}
          aria-busy={authorizing}
          onClick={() => void authorize()}
        >
          {authorizing
            ? 'Abrindo GitHub...'
            : integrations.length > 0
              ? 'Adicionar ou atualizar acesso'
              : 'Instalar ou autorizar GitHub App'}
        </button>
        {!integrations.length && <p>Nenhuma autorização GitHub vinculada à sua conta.</p>}
        {integrations.map((item) => {
          const projectCount = item.projects.length;
          return (
            <div className="integration-entry" key={item.id}>
              <article className="integration-card">
                <div>
                  <strong>{item.installation.accountLogin}</strong>
                  <small>
                    {item.installation.accountType} · {item.installation.status}
                  </small>
                </div>
                <p>
                  {item.repositories.length} repositório(s) acessível(is) · {projectCount}{' '}
                  projeto(s) conectado(s)
                </p>
                <a
                  className="text-link"
                  href={item.installation.manageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Gerenciar acesso no GitHub
                </a>
              </article>
              <section
                className="github-authorization-danger danger-zone"
                aria-labelledby={`github-danger-${item.id}`}
              >
                <h3 id={`github-danger-${item.id}`}>Zona de risco</h3>
                <strong>Remover autorização pessoal</strong>
                <p>
                  Sua autorização será removida do TraceFlow. A GitHub App não será desinstalada e
                  projetos e artefatos não serão excluídos.
                </p>
                {projectCount > 0 && (
                  <p className="danger-impact" role="status">
                    Esta autorização está relacionada a {projectCount}{' '}
                    {projectCount === 1 ? 'projeto' : 'projetos'}.
                  </p>
                )}
                <label>
                  Senha atual
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={passwords[item.id] || ''}
                    onChange={(event) =>
                      setPasswords((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                </label>
                <div className="danger-zone-actions">
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={!passwords[item.id]}
                    onClick={() => void remove(item.id)}
                  >
                    Remover minha autorização
                  </button>
                </div>
              </section>
            </div>
          );
        })}
      </section>
    </>
  );
}
