---
category: Layout
---

Global navigation bar: the TRACEFLOW brand, a link to Projetos, and — once a
session exists — Privacidade, the signed-in user's name and a Sair button.

```jsx
<Navbar />
```

Takes no props. It reads the session from the auth context and renders the
signed-out variant when there is none, so it is safe to render either way.
Because it uses react-router `<Link>`, it must be inside a router. This is the
global bar only; per-project section navigation is a separate feature component.
