import './HistoryEventRow.css';

export function HistoryEventRow({ date, title, author, children }) {
  return (
    <article className="history-event-row">
      <time dateTime={date}>{new Date(date).toLocaleString('pt-BR')}</time>
      <strong>{title}</strong>
      <div className="history-event-row__change">{children}</div>
      <small>{author || 'Autor indisponível'}</small>
    </article>
  );
}
