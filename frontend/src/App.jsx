import { BrowserRouter } from 'react-router';
import { AppRoutes } from './app/routes/AppRoutes.jsx';
import { Layout } from './components/Layout.jsx';
import { AuthProvider } from './features/auth/index.js';
import { ConfirmProvider, ErrorBoundary } from './shared/index.js';

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <ConfirmProvider>
            <Layout>
              <AppRoutes />
            </Layout>
          </ConfirmProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
