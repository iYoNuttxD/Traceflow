---
category: Feedback
---

Failed-request state with an optional retry action, announced via `role="alert"`.

```jsx
<ErrorState message="Não foi possível carregar as tarefas." onRetry={reload} />
```

The "Tentar novamente" button only renders when `onRetry` is passed — omit it
for errors retrying cannot fix.
