import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { normalizeApiError } from '../../shared/services/http-error.js';
import { privacyApi } from './privacy.api.js';

export function ProjectAuditPage() {
  const { projectId } = useParams(); const [events, setEvents] = useState([]); const [error, setError] = useState('');
  useEffect(() => { privacyApi.projectAudit(projectId).then((page) => setEvents(page.events || [])).catch((value) => setError(normalizeApiError(value).message)); }, [projectId]);
  return <main className="page-container"><Link to={`/projects/${projectId}`}>← Voltar para o projeto</Link><h1>Auditoria do projeto</h1>{error && <div className="message message-error">{error}</div>}{events.length ? events.map((event) => <article key={event.id}>{event.action} — {event.result}</article>) : !error && <p>Nenhum evento registrado.</p>}</main>;
}
