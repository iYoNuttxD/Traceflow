# PR23-FIX-05 — Dashboard UX & Resilience

## 1. Baseline

- 06/10/2026, `/Users/daniel/Coding/Traceflow`, branch `daniel-dev`.
- HEAD: `dd3f78cbb00f2508591be033cbf7b34ed2a8fb4e`.
- Working tree inicialmente limpo; `git diff --check` e `git diff --stat` sem saída.
- Runtime inicial: Node 26.9.0 / npm 11.19.1; gates: **Node 22.23.3 / npm 10.9.9**.
- Sem commit, push, merge, rebase, reset, clean ou stash.

## 2. Review findings addressed

| Estado | Antes | Após a correção |
| --- | --- | --- |
| loading | Skeleton e guards de identidade | Preservados; período inválido não fica em loading infinito |
| success | Aggregate e toast de save | Preservados; confirmação transitória por 4 segundos |
| empty | Data State do aggregate | Sem alteração |
| partial | Widgets/Health e limitações | Sem alteração |
| error | Mensagem normalizada descartada pela view | Mensagem segura exibida com retry contextual |
| rateLimit | Retry imediato; Retry-After ignorado | Countdown, retry bloqueado e ação explícita após o prazo |
| confirmedSave | PUT confirmado fecha editor | Preservado, separado da leitura posterior |
| refreshFailure | Warning transitório seguido de botão órfão | Erro persistente junto ao retry, preservando confirmação do save |
| stale request | AbortController + generation/identity | Preservados, incluindo descarte de timers/contextos antigos |
| preferência legada | IDs crus no editor/CUSTOM | Presenter tolerante, interseção defensiva e default canônico |

Fontes revisadas: DashboardPanel, DashboardEditor, useDashboardPreference, FeedbackRegion,
http-client, normalizeApiError, useCountdown, ErrorBoundary global, catálogo/presenter/service/
repository/validation da preferência, API_CONTRACTS e Design System.

## 3. Dashboard error propagation

`DashboardRequestError` apresenta `normalizeApiError(...).message`. O mesmo caminho é usado
no aggregate, catálogo, preferência e recovery. A normalização existente continua recusando
mensagens técnicas e mensagens internas de 5xx; stack, Prisma e SQL não são publicados pela UI.
Erros sem texto seguro usam o fallback canônico por status/rede. O editor também preserva a
mensagem normalizada, acompanhada da confirmação de que o draft foi mantido.

O teste de 400 confirma a mensagem de período máximo; o teste de 500 com conteúdo técnico
confirma o fallback seguro. Não houve alteração do normalizador HTTP compartilhado.

## 4. Period validation

A regra existente em `dashboardQuerySchema` limita somente FLOW, TASK e CUSTOM a 366 dias
civis inclusivos. `dashboard-ux.js` centraliza a mesma compatibilidade na UI. O filtro automático
não aplica um draft acima desse limite; uma URL longa herdada de outra categoria permanece
editável e mostra orientação para ajustar/limpar o período, sem request inválida nem retry cego.
GENERAL, PLANNING, GITHUB, SPRINT, QUALITY e TRACEABILITY não receberam teto global novo.
As fórmulas, o fuso e os períodos enviados ao backend não foram modificados.

## 5. 429 / Retry-After

O feedback usa status 429 e `retryAfterSeconds` normalizados, inclusive o fallback canônico
quando a API não informa o prazo. O botão Tentar novamente fica desabilitado enquanto o
countdown é positivo. A ação de refresh da toolbar não contorna um erro 429 vigente; após o
prazo, o retry contextual fica disponível. Nenhuma request é disparada ao chegar a zero.
O editor também respeita o prazo antes de repetir PUT/DELETE e conserva o draft.

## 6. Countdown lifecycle

`DashboardRequestError` reutiliza `useCountdown`. Sua montagem é vinculada à identidade da
request; mudança de view/filtros/projeto desmonta o feedback anterior e cancela seu timer.
Catálogo continua sendo contexto compartilhado do projeto, independentemente da categoria.
Os guards de geração/abort impedem respostas antigas de criar erro/countdown no contexto novo.
O recovery tem owner próprio invalidado ao trocar projeto/view ou desmontar.

O teste do countdown usa relógio falso explicitamente controlado. A primeira tentativa na
suíte completa revelou dependência de avanço por tempo real no teste; isso foi removido,
sem retry, aumento de timeout ou alteração da regra de produto para fazê-lo passar.

## 7. FeedbackRegion semantics

- `transient` permite auto-dismiss somente de success/info, com 4 segundos canônicos.
- Error, warning vigente e rate-limit permanecem enquanto o owner mantém a condição.
- Os containers polite/assertive permanecem montados entre mensagens; o toast de save também
  possui região persistente desde a montagem do painel.
- Success usa status/polite; erros urgentes usam alert. Não há mudança automática de foco.
- O prazo inicial fica acessível; as mudanças por segundo são visuais (`aria-hidden`), evitando
  reanúncio contínuo de todo o alert.
- Pointer events são permitidos; conteúdo interativo não fica inacessível.
- Layout principal, charts, cards e navegação não foram redesenhados.

## 8. Save vs refresh separation

PUT/DELETE confirmado continua atualizando a preferência e fechando o editor imediatamente.
A falha de GET posterior não vira “Falha ao salvar”, não restaura draft antigo e não desfaz
persistência confirmada. Success sem falha posterior continua sendo toast transitório.

## 9. Persistent refresh errors

O erro de refresh permanece no corpo do painel, junto de Tentar novamente, com o prefixo
“Painel salvo. Não foi possível atualizar os dados agora.” e a mensagem normalizada da falha.
O toast de sucesso deixa de competir com esse feedback. Nova leitura bem-sucedida ou mudança
de contexto remove o erro. Teste e runtime verificaram permanência além dos quatro segundos.

## 10. Catalog evolution

Elegibilidade continua pertencendo a `isCustomizable` no catálogo backend. IDs removidos,
desconhecidos ou não aprovados para personalização são ignorados na apresentação da preferência.
A ordem relativa dos válidos é mantida; duplicatas/excesso acima de 12 também são normalizados.
Não houve renomeação, alteração de fórmula nem criação de registry de indicadores no frontend.

## 11. Backend preference sanitization

`dashboard-preference.presenter.js` é puro. GET não escreve nem migra a row. Quando ajusta
uma seleção, publica `configurationAdjusted: true`; updatedAt permanece a data da última
escrita real. Se todos os IDs forem inválidos, apresenta `defaultDashboardPreference()`.
PUT e query CUSTOM continuam estritos: IDs inválidos/duplicados, shape inválido e versões não
aceitas continuam retornando 400.

`configurationVersion` é versão de formato, sem migração automática. Configuração utilizável
conserva a versão armazenada; fallback utiliza a versão do default. Save/reset explícito é o
único caminho de alteração da preferência nesta entrega.

## 12. Frontend defensive handling

Antes de pedir CUSTOM, a UI espera preferência + catálogo e intersecta os IDs com os elegíveis.
Usa apenas o default recebido na policy quando nenhum ID válido resta. Um aviso discreto informa
que a visualização foi ajustada. Não há retry automático de CUSTOM com IDs rejeitados.
O editor faz sua própria filtragem defensiva, inclusive se o catálogo mudar enquanto estiver
aberto; `titleOf` tolera metadata ausente e não lança TypeError.

## 13. Default recovery

O default permanece o canônico do catálogo, sem seleção nova inventada na UI. Restaurar padrão
continua acessível no editor. Mesmo quando todos os IDs legados já estão sendo apresentados
como default, o usuário pode confirmar um reset explícito; `configurationAdjusted` mantém essa
ação salvável. Se nem a interseção/default do catálogo permitir renderizar CUSTOM, há recovery
fora do editor, sem depender de um modal que não consegue apresentar a seleção.

## 14. Feature ErrorBoundary decision

Não foi adicionado um segundo ErrorBoundary. O boundary global existente foi auditado como
último recurso para falhas inesperadas. Os quatro achados são condições conhecidas de request,
feedback e dados legados, agora tratados antes do render. Um novo boundary não substituiria
esses guards e ampliaria a superfície de recuperação sem necessidade demonstrada nesta rodada.
Erros de API permanecem dentro de Indicadores, mantendo a navegação do projeto utilizável.

## 15. Database isolation

- TEST_DATABASE_URL obrigatório; nenhuma alteração afrouxou as proteções do FIX-04.
- Reutilizado somente o schema isolado `traceflow_pr23_fix04_test_20261006`.
- Credencial MySQL exclusiva desse schema; leitura real de `traceflow.Project` recusada antes
  dos testes e novamente ao final. DATABASE_URL implícita recebeu a credencial restrita e um
  schema inexistente, sem fallback nem credencial de desenvolvimento nos processos de teste.
- A suíte usa a conferência do banco efetivo na mesma transação da limpeza canônica.
- O runtime criou Project/usuário artificiais próprios por UUID; o cleanup validou conexão,
  IDs e ownership na mesma transação, removendo somente fixtures daquela execução.
- Backups/logs/credenciais ficaram privados e ignorados em `backend/.local/pr23-fix05-validation/`.
- Comparação final: nenhuma linha apagada e 56 das 58 tabelas idênticas. As únicas diferenças
  foram `Session.lastSeenAt` em uma sessão e um evento novo `PROJECT_MEMBERS_VIEWED` em
  AuditEvent (4.890 → 4.891), além do contador autoincrement dessa tabela. Todos os dados de
  domínio dos projetos permaneceram iguais. Não se afirma igualdade integral dos dumps:
  esses registros de atividade mudaram enquanto a aplicação de desenvolvimento estava aberta.
  Os testes/runtime não tinham permissão para ler ou escrever nesse banco.
- SHA-256 do snapshot anterior: `7c8226e3f9e8fbf0677ac472db9a3f98dc9803a2a7d69608c201f43529449632`;
  posterior: `848368c1633b1f64afb2c170ec27fb994febe5828bad83dbaa9abadef3d5091d`.
  A comparação por tabela/campo foi feita offline nos dumps privados, sem publicar dados pessoais.

## 16. Focused backend tests

**77 testes / 5 suítes PASS**: catálogo e validação, presenter, API P9, cliente Prisma seguro e
conferência da conexão. Persistência isolada cobre `[I03,I01] → [I01]`, todos inválidos → default,
GET sem escrita, CUSTOM utilizável e PUT inválido ainda rejeitado. Unit cobre ordem, duplicates,
limite, shape legado e ausência de suposta migração de versão.

## 17. Focused frontend tests

**127 testes / 5 suítes PASS**: DashboardPanel, PersonalizedDashboard/Editor, FeedbackRegion,
normalização HTTP e http-client. Cobrem API message/fallback, 429/countdown/contexto, período
compatível por view, sucesso transitório, warnings/erros persistentes, save/refresh/draft,
respostas antigas, IDs órfãos, catálogo mudando no editor e reset após fallback de legado.

## 18. Runtime validation

Inspeção automatizada direta em Chrome/CDP, com frontend Vite real e Express/API real no schema
isolado. Nenhuma screenshot, imagem ou pasta de evidência visual foi criada. Não se trata de
homologação visual humana: foram inspecionados DOM renderizado, controles, semântica, estilos
computados e limites geométricos da viewport.

18 verificações passaram: Meu Painel normal; mensagem específica de 400; 429 bloqueia retry,
libera após o prazo e não dispara request sozinho; save com refresh bem-sucedido e toast
expirando; save confirmado com refresh falho persistente; preferência ainda salva; ID órfão
ignorado sem escrita no GET; todos inválidos usam default; reset explícito remove a row;
zero exceções de renderização não capturadas.

400/429/503 foram respostas controladas no transporte local, diante da aplicação Express, para
exercitar falhas determinísticas. Preferência, catálogo, aggregate e mutations bem-sucedidas
usaram implementação e persistência reais. Não se provocou rate limit no servidor de desenvolvimento.
As primeiras tentativas do harness selecionaram um target de extensão e depois tentaram serializar
um elemento DOM; o harness foi corrigido para selecionar a aba de página e consultar booleanos.
Nenhuma dessas falhas de instrumentação foi tratada como aprovação da aplicação.

Amostra de feedback rate-limit em 1440 Light/Dark e 390 Light/Dark: sem overflow horizontal,
texto/controles dentro da viewport. As cores computadas usam os tokens canônicos:
Light `rgb(139,77,9)` sobre `rgb(255,243,220)`; Dark `rgb(242,189,107)` sobre `rgb(58,43,24)`.
Save/reset também foram exercitados no viewport mobile. Não houve redesenho dos componentes.

## 19. Full gates

| Gate — Node 22 | Resultado |
| --- | --- |
| Backend focused | 77 testes / 5 suítes PASS |
| Backend full | 1.692 testes PASS; 145 suítes PASS, 2 suítes / 5 skips legados |
| Backend coverage | PASS — statements 92,42%; branches 86,62%; functions 95,59%; lines 94,72% |
| Backend lint / format | PASS |
| Frontend focused | 127 testes / 5 suítes PASS |
| Frontend full | 1.423 testes / 116 suítes PASS |
| Frontend coverage | PASS — statements 85,81%; branches 80,46%; functions 81,68%; lines 88,28% |
| Frontend lint / format / build | PASS |
| Prisma validate / generate 6.12.0 | PASS; sem schema change ou migration nova |
| Architecture | PASS |
| Local CI validation | validateRepositoryCi=true; 83 testes de workflow/audit policy PASS |
| Security secrets | PASS |
| Canonical dependency/security audit | PASS backend/frontend; 0 HIGH, 0 CRITICAL, nenhuma exceção utilizada |
| Runtime real isolado | 18 verificações PASS; cleanup restrito concluído; nenhuma captura |
| Banco de desenvolvimento | Acesso dos testes negado; nenhuma exclusão; dados de domínio preservados |
| git diff --check | PASS |

A última suíte frontend inclui o ajuste de reset após fallback de legado. Thresholds, skips e
asserts de produto não foram relaxados. O build mantém o aviso preexistente sobre o chunk ELK;
nenhum módulo de grafo foi alterado. Local CI significa gates locais e validação da configuração,
não execução de GitHub Actions. Lockfiles e dependências não mudaram nesta rodada.

## 20. Remaining limitations

- Não há migração automática de configurações ou persistência silenciosa de sanitização.
- O limite de período da UI espelha a validação backend para as três views; mudanças futuras
  desse contrato precisam atualizar essa compatibilidade centralizada.
- O ErrorBoundary global permanece como último recurso; não foi criada recuperação geral de
  qualquer bug de renderização.
- Cenários de falha HTTP foram controlados localmente; não se declara ensaio de outage real.
- A inspeção runtime não produziu capturas e não equivale a revisão visual humana de toda a UI.
- Sem mudança em fórmulas, Data States, pesos/thresholds, Sprint, I04/I28, freshness, layout,
  performance do aggregate ou isolamento backend. Nenhuma feature de conexão GitHub foi iniciada.
- **No migration required.** Schema/migrations não mudaram.

## 21. Final verdict

**PR23-FIX-05 DASHBOARD UX & RESILIENCE — PASS LOCAL**

Erros seguros, Retry-After, feedback persistente e compatibilidade de preferências foram
validados com testes completos e runtime real isolado. Sem mudança de semântica dos indicadores,
Health, Data States, schema ou layout principal. Nenhuma captura, commit ou push foi feito.
Não iniciar PR23-FIX-06.

Sugestão de commit: `fix: harden dashboard error handling and personalization recovery`.
