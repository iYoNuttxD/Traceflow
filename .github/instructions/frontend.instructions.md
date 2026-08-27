---
applyTo: "frontend/src/**/*.js,frontend/src/**/*.jsx,frontend/src/**/*.css,frontend/test/**/*.js,frontend/test/**/*.jsx,frontend/*.js,frontend/package.json"
---

# Frontend

- Preserve `app/routes → pages → features/<domain> → shared + api/http-client`.
- Pages adaptam rotas; features coordenam domínio; shared não importa pages/features; uma feature não
  importa internals de outra.
- Use somente `frontend/src/api/http-client.js` para HTTP. Não crie Axios/fetch paralelo.
- O backend é autoridade para identidade, autorização, regras, cálculos e persistência; restrição de
  botão é UX, não controle de acesso.
- Modele loading, vazio, forbidden e erro explicitamente. Preserve cancelamento, dedupe/coalescing e
  rollback visual; não colapse `401`, `403`, `404`, `409` e `429`.
- CSS novo ou alterado fica junto do componente, page, feature ou shared owner. `src/styles/` contém
  apenas tokens, base e regras realmente globais.
- Não acrescente `.project-*`, `.settings-*`, `.auth-*`, `.kanban-*` ou outro seletor específico de
  feature a `global.css`. Responsive rules ficam com seu owner; reutilização real vira shared
  component/token, não override cross-feature.
- Mantenha CSS convencional; não imponha CSS Modules ou nova biblioteca. Não faça separação mecânica
  do legado sem preservar cascade/especificidade/media queries e validar visualmente.
- Inline style só quando depende de valor calculado em runtime; estilo estático vai para o CSS do
  owner.
- Associe label, controle, erro e foco; anuncie feedback por semântica e teclado, não apenas por cor.
- Teste estados finais observáveis, não timing incidental. Rode ESLint, Prettier, testes/coverage
  afetados e build.
