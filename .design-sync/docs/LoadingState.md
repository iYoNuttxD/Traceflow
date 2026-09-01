---
category: Feedback
---

Spinner plus message shown while a request is in flight. Announced politely via
`role="status"`.

```jsx
<LoadingState message="Carregando sprints..." />
```

Defaults to "Carregando...". Prefer `RequestState` when you are switching
between loading, error and empty for the same request — reach for
`LoadingState` directly only for a standalone spinner.
