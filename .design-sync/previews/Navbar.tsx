import { Navbar } from 'traceflow';

// Only the signed-out variant can be rendered here: Navbar reads the session
// from a context whose provider performs network calls on mount and whose
// context object is module-private, so no session can be injected. See
// Navbar.md for the signed-in variant.
export const SignedOut = () => <Navbar />;

export const AbovePageContent = () => (
  <>
    <Navbar />
    <main className="page-container">
      <header className="page-header">
        <h1>Projetos</h1>
      </header>
    </main>
  </>
);
