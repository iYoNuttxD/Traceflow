---
category: Overlays
---

Provides the confirmation dialog to its subtree. Mount it once near the root;
descendants then call the `useConfirm()` hook, which returns a function that
opens a modal and resolves to `true` or `false`.

```jsx
// once, at the root
<ConfirmProvider>
  <AppRoutes />
</ConfirmProvider>

// anywhere below it
const confirm = useConfirm();

async function onDelete(task) {
  const ok = await confirm({
    title: 'Excluir tarefa',
    description: `"${task.title}" será removida permanentemente.`,
    confirmLabel: 'Excluir'
  });
  if (ok) await tasksApi.remove(task.id);
}
```

The dialog is destructive-styled by default — pass `destructive: false` for a
neutral confirmation. It traps focus, closes on Escape or a backdrop click
(both resolving `false`), and restores focus to the element that opened it.
There is no separate dialog component to render: `ConfirmProvider` plus
`useConfirm()` is the whole API.
