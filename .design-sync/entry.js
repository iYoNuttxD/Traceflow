// Design-system entry for /design-sync — NOT application code.
// Re-exports the reusable Traceflow kit (the shared components plus the app
// shell) so the converter bundles exactly that surface instead of the whole
// Vite app. Kept out of frontend/src on purpose: it is a sync input, not a
// module the app ever imports.

export { Card } from '../frontend/src/shared/components/Card.jsx';
export {
  LoadingState,
  EmptyState,
  ErrorState,
  ForbiddenState,
  RequestState
} from '../frontend/src/shared/components/AsyncState.jsx';
export { ConfirmProvider, useConfirm } from '../frontend/src/shared/components/ConfirmDialog.jsx';
export { ErrorBoundary } from '../frontend/src/shared/components/ErrorBoundary.jsx';
export { FeedbackRegion } from '../frontend/src/shared/components/FeedbackRegion.jsx';
export { FormInput } from '../frontend/src/shared/components/FormInput.jsx';
export { Layout } from '../frontend/src/components/Layout.jsx';
export { Navbar } from '../frontend/src/components/Navbar.jsx';

// Preview/runtime context only: Navbar (and Layout, which renders it) uses
// react-router <Link>, so previews need a router above them.
export { MemoryRouter } from 'react-router';
