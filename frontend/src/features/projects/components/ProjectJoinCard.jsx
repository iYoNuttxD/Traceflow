import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, FeedbackRegion } from '../../../shared/index.js';
import { parseProjectAccessInput } from '../services/project-access-input.js';

export function ProjectJoinCard() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function continueToJoin(event) {
    event.preventDefault();
    const accessCode = parseProjectAccessInput(value);
    if (!accessCode) {
      setError('Informe um código ou link de acesso válido do TRACEFLOW.');
      return;
    }
    setError('');
    navigate(`/join/${encodeURIComponent(accessCode)}`);
  }

  return (
    <Card title="Entrar em um projeto">
      <p className="card-description">Cole um código ou link de acesso compartilhado.</p>
      <FeedbackRegion error={error} />
      <form className="project-join-quick-form" onSubmit={continueToJoin}>
        <label className="field">
          <span>Código ou link de acesso</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="TRC-... ou https://.../join/TRC-..."
          />
        </label>
        <button className="button button-primary" type="submit">
          Continuar
        </button>
      </form>
    </Card>
  );
}
