import { BrowserRouter } from 'react-router';
import { AppRoutes } from './app/routes/AppRoutes.jsx';
import { ThemeProvider } from './app/theme/ThemeProvider.jsx';
import { AuthProvider } from './features/auth/index.js';
import { ConfirmProvider, ErrorBoundary } from './shared/index.js';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <AuthProvider>
            <ConfirmProvider>
              <AppRoutes />
            </ConfirmProvider>
          </AuthProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  );
}
