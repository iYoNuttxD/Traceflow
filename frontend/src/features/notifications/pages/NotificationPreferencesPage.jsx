import { NotificationPreferencesForm } from '../components/NotificationPreferencesForm.jsx';

export function NotificationPreferencesPage() {
  return (
    <div className="settings-stack">
      <article className="settings-surface">
        <section className="settings-section" aria-labelledby="notification-preferences-title">
          <div className="settings-section-heading">
            <div>
              <h2 id="notification-preferences-title">Notificações</h2>
              <p>
                Escolha quais avisos você quer receber. As notificações aparecem só aqui no
                TRACEFLOW, na central de notificações; não há envio por e-mail.
              </p>
            </div>
          </div>
          <NotificationPreferencesForm />
        </section>
      </article>
    </div>
  );
}
