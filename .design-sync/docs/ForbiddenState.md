---
category: Feedback
---

Permission-denied state, headed "Acesso restrito". Use it when the request was
rejected because of the user's role, not because it failed.

```jsx
<ForbiddenState message="Apenas administradores do projeto podem editar o cronograma." />
```

Defaults to a generic permission message. A specific one — naming the role or
the action — is more useful.
