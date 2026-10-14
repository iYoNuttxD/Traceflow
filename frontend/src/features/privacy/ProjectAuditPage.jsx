import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { normalizeApiError } from '../../shared/services/http-error.js';
import { privacyApi } from './privacy.api.js';

export function ProjectAuditPage() {
  const { projectId } = useParams();
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setEvents([]);
    setError('');
    privacyApi
      .projectAudit(projectId)
      .then((page) => {
        if (active) setEvents(page.events || []);
      })
      .catch((value) => {
        if (active) setError(normalizeApiError(value).message);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  return (
    <main className="page-container">
      <Link to={`/projects/${projectId}`}>← Voltar para o projeto</Link>
      <h1>Auditoria do projeto</h1>
      {error && <div className="message message-error">{error}</div>}
      {events.length
        ? events.map((event) => (
            <article key={event.id}>
              {event.action} — {event.result}
            </article>
          ))
        : !error && <p>Nenhum evento registrado.</p>}
    </main>
  );
}
