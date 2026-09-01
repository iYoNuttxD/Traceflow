---
category: Feedback
---

The state machine wrapper the pages actually use: give it the flags from a
request and it picks the right state component, falling through to `children`
on success.

```jsx
<RequestState
  loading={loading}
  error={error}
  forbidden={status === 403}
  empty={!tasks.length}
  onRetry={reload}
>
  <TaskList tasks={tasks} />
</RequestState>
```

Precedence is fixed: `loading` → `forbidden` → `error` → `empty` → `children`.
`error` is the message string, and it is also what `ForbiddenState` displays
when `forbidden` is set. Prefer this over hand-rolling the four branches.
