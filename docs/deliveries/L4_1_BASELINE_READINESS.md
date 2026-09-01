# TRACEFLOW — L4.1 — Consolidação técnica e prontidão da baseline

Baseline avaliada: `daniel-dev` em `28cf788`
Escopo: S1-01, S1-02, S1-03 e contratos transversais necessários
Data da consolidação: 2026-08-15

## 1. Resumo executivo

**Status: READY COM RESSALVAS EXTERNAS.**

> **BASELINE PRONTA PARA HOMOLOGAÇÃO MANUAL COM RESSALVAS EXTERNAS**

A baseline possui contratos backend e frontend coerentes, autorização aplicada no servidor,
persistência válida, 33 migrations aplicadas nos bancos verificados, checks read-only sem violações e
todas as suites/gates executados em verde. Não foi encontrado bloqueador técnico HIGH ou CRITICAL
para iniciar o Work QA.

Esta entrega não constitui homologação manual. Browser real, SMTP real, GitHub OAuth, GitHub App e
webhook continuam dependências do Work QA e não recebem PASS neste relatório.

### Alteração necessária na L4.1

Foi encontrada uma divergência de documentação, `L4-DOC-001`, em
`docs/api/API_CONTRACTS.md`: o texto ainda descrevia a resposta síncrona antiga do sync GitHub,
rotatividade de CSRF e dois endpoints GitHub removidos. O contrato atual foi alinhado ao código e aos
testes: sync persistido com `POST 202` + status, CSRF estável derivado da sessão e rotas atuais da
GitHub App. Não houve alteração de comportamento de produção, schema ou migration.

## 2. Escopo auditado

### S1-01 — Cadastro, login e sessão

Cadastro e username, login local/GitHub, `rememberMe`, sessão server-side, CSRF, logout, multiaba,
`returnTo`, expiração/revogação, usuário restrito e indisponibilidade do backend foram mapeados. O
bootstrap permanece sequencial: `/auth/me` 401 resulta em visitante; rede/5xx resulta em
indisponibilidade; somente `/auth/me` 200 permite `/auth/csrf`.

### S1-02 — Recuperação e segurança

Verificação/reenvio de e-mail, recuperação/reset de senha, alteração e primeira senha, sessões,
reauth, alteração de e-mail/username, exportação e estados da conta possuem contratos e cobertura
automatizada. A entrega real de e-mail permanece dependente de SMTP no Work QA.

### S1-03 — Convites, membros e perfis

Criação, lista, detalhes, aceite, recusa, revogação e estados de convite; usuários cadastrados ou não;
duplicidade; membro existente; quatro perfis; último OWNER; concorrência; saída e isolamento entre
projetos foram validados tecnicamente. A entrega do convite por e-mail permanece dependente de SMTP.

### Transversal

Foram incluídos AuthContext, cliente HTTP, GenericErrorPage, ErrorBoundary, FeedbackRegion,
PasswordField, autorização, auditoria, rate limiting, privacy/account state, GitHubIdentity, GitHub App
e Projects. Sprint, cronograma, marcos, comentários, esforço, prioridade, PR #12 e outras branches
ficaram fora do escopo.

## 3. Matriz de prontidão por domínio

| Domínio                             | Backend                                        | Frontend                             | Testes                     | Docs               | Status                                |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------ | -------------------------- | ------------------ | ------------------------------------- |
| Cadastro, login local e sessão      | Contratos completos                            | Fluxos e bootstrap coerentes         | Unit/integration/UI verdes | Coerentes          | READY                                 |
| CSRF, logout, expiração e revogação | Proteções server-side                          | Interceptor e AuthContext coerentes  | Regressões críticas verdes | Coerentes          | READY                                 |
| Verificação e recuperação           | Contratos e tokens completos                   | Feedback e formulários cobertos      | Automação verde            | Coerentes          | READY COM RESSALVA — SMTP real        |
| Settings e segurança da conta       | Reauth e estados completos                     | Páginas/formulários cobertos         | Automação verde            | Coerentes          | READY                                 |
| GitHub Identity                     | Identidade externa separada por `githubUserId` | Login/vínculo/desvínculo cobertos    | Automação verde            | Coerentes          | READY COM RESSALVA — OAuth real       |
| GitHub App e projeto                | Instalação, seleção, vínculo e sync estáveis   | Integração e acompanhamento cobertos | Automação verde            | Corrigidos na L4.1 | READY COM RESSALVA — App/API real     |
| Convites                            | Contratos e estados completos                  | Criação/resposta cobertas            | Unit/integration/UI verdes | Coerentes          | READY COM RESSALVA — entrega SMTP     |
| Membros e perfis                    | Matriz server-side e invariantes OWNER         | Painel e ações cobertos              | Unit/integration/UI verdes | Coerentes          | READY                                 |
| Privacy/account states              | Estados e restrições completos                 | Rotas/feedback cobertos              | Automação verde            | Coerentes          | READY                                 |
| Error handling                      | Erros sanitizados                              | Base visual/contextual compartilhada | UI e rotas verdes          | Coerentes          | READY COM RESSALVA — validação visual |
| BOLA/IDOR e autorização             | Escopo por projeto no backend                  | UI não substitui autorização         | Regressões verdes          | Matriz coerente    | READY                                 |

## 4. Matriz técnica dos fluxos críticos

Legenda: `A` = automatizado; `M` = destinado ao Work QA; `A+M` = cobertura automatizada com
confirmação manual ainda planejada.

| Cenário                    | Backend                            | Frontend                                   | Banco                           | Autorização                       | Teste | Documentação      | Pronto para QA?                     |
| -------------------------- | ---------------------------------- | ------------------------------------------ | ------------------------------- | --------------------------------- | ----- | ----------------- | ----------------------------------- |
| Cadastro/username          | Contrato ativo                     | Formulário integrado                       | User/uniqueness                 | Público com proteção antiabuso    | A+M   | Atual             | READY                               |
| Login local/rememberMe     | Sessão server-side                 | Fluxo integrado                            | Session/TTL                     | Credenciais validadas no servidor | A+M   | Atual             | READY                               |
| Bootstrap visitante        | `/me` 401 canônico                 | Visitante sem `/csrf` ou loop              | Sem escrita                     | Probe trata o próprio 401         | A+M   | Atual             | READY                               |
| Bootstrap autenticado      | `/me` antes de `/csrf`             | Estado não fica parcial                    | Session válida                  | Probe isolado do evento global    | A+M   | Atual             | READY                               |
| Backend indisponível       | 5xx/rede distinguíveis             | Feedback e retry explícito                 | Sem escrita parcial             | Sem inferir sessão                | A+M   | Plano J01/B03     | READY                               |
| Logout/expiração/revogação | Revogação server-side              | AuthContext limpa apenas códigos de sessão | Session revogada                | Dono da sessão                    | A+M   | Atual             | READY                               |
| CSRF/multiaba              | Token derivado da sessão           | Cliente mantém escopo correto              | Session                         | Token cruzado rejeitado           | A+M   | Atual             | READY                               |
| ReturnTo                   | Destino externo rejeitado          | Path/query/hash preservados                | N/A                             | Só rota autorizada                | A+M   | Plano A08/E07     | READY                               |
| Verificação/reenvio        | Token e rate limit                 | Banner/feedback atualizam contexto         | Tokens/estado User              | Titular da solicitação            | A+M   | Atual             | READY COM RESSALVA — SMTP           |
| Recuperação/reset          | Resposta pública e consumo único   | Formulários integrados                     | Token e sessões                 | Sem enumeração                    | A+M   | Atual             | READY COM RESSALVA — SMTP           |
| Alterar/criar senha        | Reauth e revogação                 | PasswordField/feedback                     | `passwordHash` nullable         | Próprio usuário                   | A+M   | Atual             | READY                               |
| Alterar e-mail/username    | Tokens/cooldown/reauth             | Settings integradas                        | User/tokens                     | Próprio usuário                   | A+M   | Atual             | READY COM RESSALVA — SMTP no e-mail |
| Estados da conta           | ACTIVE/restritos coerentes         | Rotas e ações permitidas                   | Flags/estado consistentes       | Middleware server-side            | A+M   | Atual             | READY                               |
| Login GitHub               | Resolve por ID externo             | Callback integrado                         | GitHubIdentity única            | State/replay protegidos           | A+M   | Atual             | READY COM RESSALVA — OAuth          |
| Conta GitHub-only          | `passwordHash=null` suportado      | Primeira senha disponível após reauth      | User/Identity consistentes      | Reauth GitHub                     | A+M   | Atual             | READY COM RESSALVA — OAuth          |
| GitHub App                 | Instalação/repo comprovados        | Seletores e integração                     | AppInstallation/Project         | Acesso revalidado no backend      | A+M   | Atual             | READY COM RESSALVA — App real       |
| Sync GitHub                | POST 202 + run persistido/status   | Poll moderado e reload recuperável         | GitHubSyncRun                   | Membro autorizado                 | A+M   | Corrigida na L4.1 | READY COM RESSALVA — API real       |
| Criar/listar convite       | Contratos finais                   | Painel integrado                           | Invitation                      | OWNER-only                        | A+M   | Atual             | READY                               |
| Aceitar/recusar/revogar    | Consumo/estado atômicos            | Página e ações integradas                  | Invitation/Membership           | Destinatário ou OWNER             | A+M   | Atual             | READY                               |
| Duplicado/membro existente | 409 canônico                       | Feedback sem sobrescrita                   | Constraints/transaction         | OWNER-only                        | A+M   | Atual             | READY                               |
| Perfis                     | Matriz OWNER/MANAGER/MEMBER/VIEWER | Ações conforme papel                       | Membership                      | Backend é autoridade              | A+M   | Atual             | READY                               |
| Último OWNER/concorrência  | Invariante transacional            | Feedback da operação                       | Pelo menos um OWNER             | OWNER-only                        | A+M   | Atual             | READY                               |
| Saída/lifecycle            | Regras de último OWNER             | Ações integradas                           | Membership preservada/reativada | Próprio membro/OWNER              | A+M   | Atual             | READY                               |
| BOLA/IDOR                  | Escopo por projeto                 | Sem confiança em IDs da UI                 | FKs/escopo                      | 404/403 seguros                   | A+M   | Atual             | READY                               |
| Error page/404             | Erros sanitizados                  | Componente contextual compartilhado        | N/A                             | Contexto da rota                  | A+M   | Plano Jxx         | READY                               |
| PasswordField              | N/A                                | Required/toggle acessíveis                 | N/A                             | N/A                               | A+M   | Plano C12         | READY                               |

## 5. Cenários bloqueadores

Nenhum bloqueador técnico foi identificado. Não há teste crítico vermelho, build quebrado, migration
pendente, divergência conhecida de autorização ou problema de integridade que impeça iniciar a
homologação manual.

## 6. Ressalvas

### Infraestrutura

- SMTP real não foi exercitado; afeta entrega de verificação, recuperação, alteração de e-mail,
  reativação e convite.
- GitHub OAuth, GitHub App/API, callbacks e webhook reais não foram exercitados nesta consolidação.

### Homologação manual

- Não houve certificação visual em browser real, viewport pequeno ou múltiplas abas.
- Os 88 cenários do plano são cenários preparados, não executados.

### Decisão de produto

- D01 permanece pendente e não bloqueante: o OWNER pode criar convite para destinatário
  `DEACTIVATED` ou `DELETION_PENDING`, mas esse destinatário não consulta, aceita ou recusa enquanto
  não voltar a `ACTIVE`.

### Dívida técnica compatível

- Aliases e legados já classificados pela L3.1, incluindo `Commit.branch`, `ProjectMember`,
  `accessCode` e endpoints mantidos por compatibilidade, não foram removidos. Nenhum deles quebrou os
  fluxos ou gates atuais.

## 7. Banco e integridade

- Prisma format, validate e generate: PASS, Prisma 6.19.3.
- Banco de desenvolvimento `traceflow`: 33 migrations, todas aplicadas.
- Banco de teste `traceflow_test`: 33 migrations, todas aplicadas.
- Nenhuma migration foi criada ou alterada na L4.1; o schema permaneceu sem diff.
- Auditoria read-only de desenvolvimento: 5 Users, 2 Projects, 2 Memberships, 0 Invitations, 44
  Sessions e 2 GitHubIdentities.
- Resultado zero para memberships/invitations/sessions/identidades órfãs, memberships duplicadas,
  projetos sem OWNER ativo, convites pendentes duplicados, estados terminais conflitantes,
  GitHubIdentity duplicada e inconsistência entre account state e flags.
- Auditoria E8 read-only executada contra `traceflow_test`: PASS, sem escrita e sem conflito.
- Nenhum dado foi removido, reescrito ou resetado.

## 8. Arquitetura

| Camada      | Resultado          | Evidência/ressalva                                                          |
| ----------- | ------------------ | --------------------------------------------------------------------------- |
| Backend     | PASS               | Architecture check sem violações; contratos críticos e autorização cobertos |
| Frontend    | PASS               | Build, lint, testes e bootstrap/error handling verdes                       |
| Banco       | PASS               | Schema válido, 33 migrations aplicadas e checks read-only íntegros          |
| Integrações | PASS COM RESSALVAS | Contratos automatizados verdes; SMTP/GitHub/webhook reais seguem para QA    |

## 9. Segurança

**Resultado: PASS COM RESSALVAS EXTERNAS.**

- Regressões de autenticação, CSRF, reauth, autorização por projeto, último OWNER e BOLA/IDOR: verdes.
- Política de `npm audit`: 5/5 testes verdes; backend e frontend aprovados, sem exceção aplicada.
- `npm audit --audit-level=low`: 0 vulnerabilidades em backend e frontend.
- Scanner de segredos: PASS em 297 arquivos.
- Respostas e UI não expõem stack ou dados técnicos nos testes automatizados; sanitização de ambiente
  real continua no plano K06.

## 10. Testes e gates

Todos foram executados com Node 22.23.2 quando aplicável.

### Smoke focado L4.1

- Backend: 10 arquivos, 84/84 testes PASS.
- Frontend: 13 arquivos, 87/87 testes PASS.

### Backend completo

- Total: 47 arquivos, 330/330 testes PASS.
- Unit: 34 arquivos, 192/192 testes PASS.
- Integration/API: 13 arquivos, 138/138 testes PASS.
- Coverage: 47 arquivos, 330/330 testes PASS.
- Cobertura: statements 87,47% (3792/4335), branches 73,76% (2024/2744), functions 90,12%
  (1013/1124), lines 89,78% (3541/3944).
- Lint, format check, architecture check, Prisma e secret scan: PASS.

### Frontend completo

- Total: 32 arquivos, 174/174 testes PASS.
- Coverage: 32 arquivos, 174/174 testes PASS.
- Cobertura: statements 58,69% (1704/2903), branches 57,50% (1280/2226), functions 49,35%
  (462/936), lines 60,05% (1601/2666).
- Lint, format check e build Vite (373 módulos): PASS.

### Flakiness

Nenhuma falha transitória foi observada nesta execução. Não houve teste ignorado, repetido para obter
verde ou threshold reduzido.

## 11. Plano para o Work QA

O roteiro reproduzível está em
[`docs/qa/L4_1_MANUAL_HOMOLOGATION_PLAN.md`](../qa/L4_1_MANUAL_HOMOLOGATION_PLAN.md).

Ele contém 88 cenários A01–K06, incluindo os casos históricos H01–H09 da L2.1, pré-condição, passos,
resultado esperado, severidade e dependência externa. O executor deve registrar obtido e
`PASS`/`FAIL`/`BLOCKED`; este relatório não antecipa esses resultados.

| Dependência    | Cenários afetados                                                   |
| -------------- | ------------------------------------------------------------------- |
| Browser real   | fluxos UI, responsividade, foco, multiaba e recuperação visual      |
| SMTP real      | verificação, recuperação, alteração de e-mail, reativação e convite |
| GitHub OAuth   | login, criação/vínculo/desvínculo, primeira senha e returnTo OAuth  |
| GitHub App/API | autorização, repositórios, conexão e sync                           |
| Webhook HTTPS  | assinatura, idempotência e callback público                         |

## 12. Git

Saída de `git status --short` ao encerrar a consolidação:

```text
 M docs/api/API_CONTRACTS.md
?? "BES_TCC_Proposta de Desenvolvimento de Ferramenta_v2023 Somativa 2.pdf"
?? OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf
?? docs/deliveries/L4_1_BASELINE_READINESS.md
?? docs/qa/
```

Os dois PDFs já estavam não rastreados antes da L4.1 e foram preservados sem alteração. Nenhum
commit, push, PR, troca de branch ou operação destrutiva de banco foi executado.

## 13. Decisão e próximo passo

> **BASELINE PRONTA PARA HOMOLOGAÇÃO MANUAL COM RESSALVAS EXTERNAS**

Próximo passo: criar Work QA independente, executar os 88 cenários, registrar
`PASS`/`FAIL`/`BLOCKED` com evidência e gerar DEFs. Se surgir defeito relevante, abrir L4.2 e executar
reteste focado mais regressões relacionadas; caso contrário, encerrar Login, Identidade e Acesso.

Mensagem de commit sugerida:

```text
test: consolidate identity access baseline for QA
```
