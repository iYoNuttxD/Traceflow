---
category: Layout
---

Panel that groups related content on a page. The optional `title` renders as an
`<h2>`; everything else is `children`. Cards are the default container for a
section of a Traceflow page — lists, forms and metric panels all sit inside one.

```jsx
<Card title="Sprint 4">
  <p>12 tarefas concluídas de 18.</p>
</Card>
```

Omit `title` when the surrounding page already has a heading. Cards do not
scroll or constrain height themselves — wrap the content if you need that.
