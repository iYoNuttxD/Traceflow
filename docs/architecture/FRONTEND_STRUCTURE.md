# Estrutura frontend do TRACEFLOW

## Direção permitida

```text
app/routes → pages → features/<domain> → shared + api/http-client
```

- `app/routes` declara rotas e providers de composição.
- `pages` é um adaptador fino entre a rota e uma ou mais features.
- `features/<domain>/pages` coordena seções do fluxo daquele domínio.
- `features/<domain>/api` descreve contratos HTTP do domínio.
- `features/<domain>/hooks` controla consultas, mutações e estados do fluxo.
- `features/<domain>/components` contém apresentação específica do domínio.
- `shared` contém componentes, hooks e utilitários independentes.
- `api/http-client.js` é a única infraestrutura Axios, CSRF, timeout e 401.

`shared` não importa feature ou page. Uma feature não importa internals de outra; integrações usam o `index.js` público ou são coordenadas pela page. Pages não importam Axios ou o cliente HTTP. O verificador arquitetural comprova essas regras.

## Estrutura vigente

```text
src/
├── app/routes/AppRoutes.jsx
├── api/
│   └── http-client.js
├── pages/                     # adaptadores finos de rota
├── features/
│   ├── auth/
│   ├── github/
│   ├── members/
│   ├── privacy/
│   ├── projects/
│   ├── requirements/
│   ├── tasks/
│   └── traceability/
└── shared/
    ├── components/
    ├── hooks/
    └── services/
```

Somente pastas com implementação real devem existir.

## Cliente HTTP

Toda API de domínio usa `httpClient`. Queries recebem `params` e, quando obsoletas, `signal`. A UI consome erros normalizados com `status`, `code`, `message`, `fieldErrors` e `requestId`. 401 encerra a sessão local; 403 mantém a sessão e é apresentado como acesso restrito.

## Estado e acessibilidade

- `LoadingState`, `EmptyState`, `ErrorState` e `ForbiddenState` são mutuamente exclusivos.
- `FeedbackRegion` anuncia mensagens por semântica, não apenas por cor.
- `ConfirmProvider` substitui confirmação nativa e gerencia foco/Escape.
- `ErrorBoundary` trata falhas de renderização, não erros HTTP.
- Formulários associam label/controle/erro e focam o primeiro campo inválido.
- Links externos em nova aba usam `noopener noreferrer`.

## Compatibilidade

Reexports legados podem permanecer apenas como adaptadores sem regra, desde que não sejam consumers de runtime. Sua remoção deve ocorrer após busca completa e regressão verde. Não se usa `TODO(E2.9)` como justificativa permanente.
