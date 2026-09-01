---
category: Feedback
---

Class error boundary that catches render errors in its subtree and swaps in a
full-page fallback offering a retry and a link back to the project list.

```jsx
<ErrorBoundary>
  <AppRoutes />
</ErrorBoundary>
```

This is a crash net for unexpected render errors, not a way to show handled API
failures — use `RequestState` or `FeedbackRegion` for those. Retry re-mounts the
subtree, so it only helps for transient failures.
