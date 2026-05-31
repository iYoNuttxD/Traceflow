// Pagina de rastreabilidade.
// TODO: Criar e consultar vinculos conforme RF09, RF11, RF12, RF48, RF49, RF52 e RF53.
import { TraceabilityList } from '../components/TraceabilityList.jsx';

export function TraceabilityPage() {
  return (
    <main>
      <h1>Rastreabilidade</h1>
      <p>Esta tela apresentara a cadeia entre requisitos, tarefas e artefatos GitHub.</p>
      <TraceabilityList />
    </main>
  );
}
