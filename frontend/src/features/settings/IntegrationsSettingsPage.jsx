import { useEffect, useState } from 'react';
import { normalizeApiError, useConfirm } from '../../shared/index.js';
import { settingsApi } from './settings.api.js';
import { SettingsFeedback } from './SettingsFeedback.jsx';

export function IntegrationsSettingsPage() {
  const confirm = useConfirm();
  const [integrations, setIntegrations] = useState([]);
  const [password, setPassword] = useState('');
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
    try {
      await settingsApi.removeGithubAuthorization(id, password);
      setMessage('Autorização pessoal removida.');
      await load();
    } catch (value) {
      setError(normalizeApiError(value).message);
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
        {!integrations.length && <p>Nenhuma autorização GitHub vinculada à sua conta.</p>}
        {integrations.map((item) => (
          <article className="integration-card" key={item.id}>
            <div>
              <strong>{item.installation.accountLogin}</strong>
              <small>
                {item.installation.accountType} · {item.installation.status}
              </small>
            </div>
            <p>
              {item.repositories.length} repositório(s) acessível(is) · {item.projects.length}{' '}
              projeto(s) conectado(s)
            </p>
            <a href={item.installation.manageUrl} target="_blank" rel="noreferrer">
              Gerenciar acesso no GitHub
            </a>
            <button type="button" onClick={() => void remove(item.id)}>
              Remover minha autorização
            </button>
          </article>
        ))}
        {integrations.length > 0 && (
          <label>
            Senha atual para remover autorização
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
      </section>
    </>
  );
}
