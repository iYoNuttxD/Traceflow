// Componente raiz do frontend TRACEFLOW.
// TODO: Adicionar providers globais apenas quando forem necessarios.
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './routes/AppRoutes.jsx';
import { Layout } from './components/Layout.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <AppRoutes />
      </Layout>
    </BrowserRouter>
  );
}
