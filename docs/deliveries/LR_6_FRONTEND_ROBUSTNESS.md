# LR.6 — Frontend robustness, error handling e integração cliente/API

## Baseline

- branch: `daniel-dev`;
- SHA inicial: `3e32e85e0d458004b45b28cb2ba7f3afed5a761e`;
- working tree inicial: limpa;
- runtime de validação: Node.js `v22.23.2`;
- escopo alterado: frontend e esta documentação técnica;
- backend, Prisma, migrations, TCC, commit, push, merge, rebase, reset, stash e PR não foram
  alterados.

### Retomada pós-LR.3.1

- branch: `daniel-dev`;
- SHA inicial da retomada: `6e912d439e4be69918d1a13eba8e5af5c4e45649`;
- working tree inicial da retomada: limpa;
- objetivo adicional: validar a UX de `AUTHORIZED`/`REAUTH_REQUIRED` e a corrida entre descoberta
  e mutação sem enfraquecer a autorização da LR.3;
- escopo mantido: frontend, testes frontend e esta documentação técnica; backend e Prisma não
  foram alterados.

## Decisões preservadas

```text
Frontend não é autoridade de segurança.
Backend continua sendo a fonte de verdade.
Erros técnicos não são exibidos.
E2E externo continua pendente quando não há ambiente ou integração real disponível.
```

O cliente aceita somente caminhos internos em `returnTo`, mantém query e hash válidos e rejeita
URLs absolutas, protocol-relative e esquemas executáveis. Tokens, cookies, hashes, segredos,
stacks e mensagens de infraestrutura não são exibidos nem persistidos pelo tratamento de erro.

## Findings tratados

| ID | Problema | Correção | Teste |
|---|---|---|---|
| LR6-01 | páginas interpretavam erros com fallbacks diferentes | normalização central de `400`, `401`, `403`, `404`, `409`, `429`, `5xx`, timeout e falha de rede; `requestId` e campos são sanitizados | tabela de status, conteúdo técnico, headers, field errors, timeout e offline |
| LR6-02 | bootstrap não sincronizava mudança de sessão entre abas | evento local sem PII sincroniza login/logout e exige revalidação da sessão HttpOnly; visitante `401` continua estado esperado e offline oferece retry | visitante, autenticado, sessão expirada, offline, retry e eventos entre abas |
| LR6-03 | fallbacks de página não distinguiam rate limit e indisponibilidade | `GenericErrorPage`, `ContextualErrorPage` e `ErrorBoundary` usam classificação segura, ação recuperável, foco e cooldown | `404`, `429`, `500`, chunk dinâmico, erro de renderização e backend indisponível |
| LR6-04 | fluxos públicos podiam perder contexto ou feedback útil | verificação, reset, convite e ingresso mostram estados seguros para token/código inválido, expirado, usado ou revogado | cenários públicos e recuperação exercitados em testes de página |
| LR6-05 | cooldown era aplicado de modo desigual | `Retry-After` passou a alimentar countdown compartilhado e desabilitar novas ações até o prazo seguro | header numérico/data, ausência de header e novo sync após cooldown |
| LR6-06 | o estado React isolado não impedia todo duplo clique rápido | locks síncronos protegem login, cadastro, reset, convites, join, sync, settings e privacy; botões expõem busy state | requests não idempotentes permanecem únicas sob submits consecutivos |
| LR6-07 | erros inline e estados assíncronos não eram anunciados de forma uniforme | regiões de feedback usam live region, campos inválidos recebem foco e controles expõem `aria-busy`/labels durante espera | foco no primeiro erro, mensagens e estados disabled verificados por DOM |
| LR6-08 | textos longos e controles estreitos podiam provocar overflow | regras responsivas defensivas para grids, navegação, settings, sessões, nomes e ações; breakpoints existentes preservados | build e inspeção estática `PASS`; homologação visual por viewport `BLOCKED` |
| LR6-09 | normalizadores ainda aceitavam campos GitHub crus e progresso escalar histórico | removidos fallbacks `full_name`, `html_url`, `default_branch`, `owner.login` e `progressPercentage`; somente DTOs atuais são consumidos | fixtures canônicas de projetos, GitHub e traceability |
| LR6-10 | falhas iniciais em páginas de domínio podiam deixar conteúdo parcial | projetos, repositório, requisitos, tarefas, kanban e rastreabilidade separam erro fatal de erro operacional e oferecem retry explícito | páginas críticas cobrem não encontrado, erro interno e indisponibilidade |
| LR6-11 | a evidência pessoal podia expirar entre `GET /github/app/repositories` e a criação/reconexão, deixando a tela apenas com um `409` | `GITHUB_USER_REAUTH_REQUIRED` migra imediatamente a tela para `REAUTH_REQUIRED`, limpa somente a seleção vencida, preserva os dados digitados e desabilita ações dependentes até a renovação | criação e reconexão cobertas com resposta `409`, CTA, campos preservados e seleção/ações bloqueadas |

## AuthContext e navegação

- uma chamada de bootstrap continua coalescida por execução;
- `GET /auth/me -> 401` não solicita CSRF e não abre página fatal;
- sessão válida carrega CSRF depois da identidade;
- falha de rede mantém estado consistente e disponibiliza retry explícito;
- logout e invalidação global são propagados entre abas sem transportar identidade ou credencial;
- autenticação percebida em outra aba provoca revalidação no backend, não confiança no evento local;
- a política de `returnTo` preserva caminhos internos, query e hash e rejeita redirecionamento
  externo.

## Contratos e legado

A varredura de `frontend/src` não encontrou consumo de `/api/account`, chamadas HTTP diretas em
componentes visuais ou wrappers legados. Os módulos de GitHub, Projects, Privacy, Account,
Membership e Traceability usam os nomes atuais dos contratos. O fallback do escalar histórico de
progresso foi removido em favor do objeto métrico canônico.

## GitHub Repository Authorization

| Cenário | Resultado automatizado | Evidência visual/externa |
|---|---|---|
| autorização pessoal válida com repositórios | `PASS`; lista DTO atual e permite seleção | `BLOCKED`; browser indisponível |
| autorização válida sem repositórios | `PASS`; apresenta ausência de OWNER/ADMIN | `BLOCKED`; browser indisponível |
| usuário pré-LR.3 ou evidência expirada na listagem | `PASS`; apresenta `REAUTH_REQUIRED` e CTA dedicado | `BLOCKED`; browser/GitHub real indisponíveis |
| evidência expira durante criação | `PASS`; trata `409`, preserva campos e exige renovação | `BLOCKED`; browser/GitHub real indisponíveis |
| evidência expira durante reconexão | `PASS`; trata `409`, limpa seleção e bloqueia reconexão | `BLOCKED`; browser/GitHub real indisponíveis |
| sincronização de projeto existente | não foi alterada pela LR.6; permanece contrato de Installation Token | não reclassificada sem GitHub real |

A tela de integrações descreve explicitamente a GitHub App como acesso técnico para sincronização.
A descoberta e a criação/reconexão continuam dependentes da autorização pessoal validada pelo
backend. O frontend não infere permissão pela Installation e não recebe, persiste ou exibe User
Access Token.

## Acessibilidade e responsividade

Foram preservados foco visível, navegação por teclado, labels associados e anúncios de erro. Os
estados de envio impedem repetição e informam ocupação. As regras CSS foram endurecidas contra
overflow e corte de ações em desktop, tablet e mobile sem alterar a identidade visual.

Na retomada pós-LR.3.1, o runtime Browser voltou a não expor navegador: a abertura do navegador
padrão retornou `No browser is available` e a listagem retornou `[]`. Portanto, a homologação
visual direta dos três viewports e do fluxo OAuth permanece `BLOCKED`; inspeção estática, testes
DOM e build não são registrados como substitutos de evidência visual/manual.

## Gates

Todos os comandos abaixo usaram Node.js `v22.23.2`.

| Gate | Resultado |
|---|---|
| `npm run lint` | `PASS` |
| `npm run format:check` | `PASS` |
| `npm test` | `PASS`; 34 arquivos, 243 testes |
| `npm run test:coverage` | `PASS`; 63,28% statements, 60,70% branches, 54,88% functions, 64,69% lines |
| `npm run build` | `PASS`; 382 módulos transformados |
| `npm audit` | `PASS`; zero vulnerabilidades |
| `git diff --check` | `PASS` |
| desktop/tablet/mobile em browser real | `BLOCKED`; runtime sem browser disponível |

## Pendências externas

- homologação visual direta em desktop, tablet e mobile;
- fluxos E2E com SMTP real;
- fluxos E2E com GitHub real e conta descartável.

Essas pendências não foram convertidas em `PASS` por testes automatizados. Enquanto a validação
responsiva direta exigida pela LR.6 estiver indisponível, a entrega permanece **LR.6 BLOQUEADA**.
