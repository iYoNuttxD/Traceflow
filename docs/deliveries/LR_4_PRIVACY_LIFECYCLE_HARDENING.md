# LR.4 — Privacidade, LGPD, exportação e lifecycle de conta

## Baseline

- branch: `daniel-dev`;
- SHA inicial: `5a8d86c5b656cbc9109ce57d3f026f8911532639`;
- estado inicial: working tree limpo;
- runtime dos gates finais: Node.js `v22.23.2`;
- baseline funcional: LR.1, LR.2, LR.2.1 e LR.3 preservadas;
- escopo: backend, frontend, migration incremental e documentação técnica; nenhum documento do TCC foi alterado.

## Decisões aplicadas

```text
DELETION_PENDING impedido
→ REJECTED + ACTIVE + sessões revogadas + auditoria

Exportação
→ dados próprios + conteúdo de projeto somente com autorização atual

GitHub-only
→ reautenticação GitHub recente na mesma sessão e identidade

ANONYMIZED
→ sem login, recuperação ou reassociação automática da identidade anterior
```

A senha local continua válida para confirmação sensível, mas não é pré-requisito artificial para
contas GitHub-only. O user access token GitHub permanece exclusivamente em memória durante OAuth e
nunca integra DTO, log ou persistência.

## Findings corrigidos

| ID | Problema | Correção | Teste |
|---|---|---|---|
| LR4-01 | membership histórica/inativa exportava conteúdo atual do projeto | todos os datasets colaborativos do ZIP exigem `ProjectMembership.isActive=true`; manifesto 2.0 declara o escopo | ZIP com projeto atual e projeto removido; somente projeto/requisito/tarefa atuais aparecem |
| LR4-02 | pedido vencido podia permanecer `PENDING` indefinidamente | worker faz claim/revalidação transacional e encerra impedimento como `REJECTED`, retornando a conta a `ACTIVE` | lifecycle sem impedimento e com último OWNER |
| LR4-03 | ownership podia impedir exclusão sem ciclo resolvível | último OWNER, projeto e membership são preservados; sessões revogadas e novo pedido necessário | projeto com OWNER único, auditoria dupla e zero pedidos pendentes |
| LR4-04 | operações sensíveis exigiam senha inexistente em conta GitHub-only | purpose canônico `REAUTH_SENSITIVE_ACTION`; state, sessão, status, identidade e GitHub ID são conferidos; timestamps recentes autorizam a ação | reauth ausente/divergente bloqueia; reauth recente permite exclusão/cancelamento sem senha |
| LR4-05 | anonimização removia a identidade, mas login GitHub podia recriar conta | tombstone deny-only com fingerprint HMAC-SHA256; login, link e criação consultam o bloqueio | callback de identidade tombstoned retorna `ACCOUNT_ANONYMIZED` e não cria conta |
| LR4-06 | PII histórica e autorizações LR.3 não eram tratadas de forma completa | remove tokens, states, requests de e-mail e autorizações pessoais; pseudonimiza convites, commits, PRs e issues conhecidos; preserva IDs e conteúdo técnico | anonimização MySQL verifica tabelas e artefatos antes/depois |
| LR4-07 | falha/bloqueio do worker não produzia trilha completa e segura | eventos de tentativa, bloqueio, retorno, conclusão e falha; códigos allowlisted, sem mensagem sensível | evento de falha usa `ANONYMIZATION_FAILED` e não contém o segredo artificial |

## Persistência e migration

A migration nova `20260820220000_lr4_privacy_lifecycle_hardening`:

- converte estados pendentes `REAUTH_SET_PASSWORD` para `REAUTH_SENSITIVE_ACTION` com expansão e
  contração segura do enum;
- cria `GitHubIdentityTombstone` sem FK para `User`, login ou GitHub user ID bruto;
- armazena somente fingerprint HMAC-SHA256 domain-separated de 64 caracteres;
- não edita nenhuma migration histórica e não executa reset, drop, truncate ou delete de domínio.

`PRIVACY_PSEUDONYMIZATION_KEY` é obrigatória em produção, possui mínimo de 32 bytes e deve ser
estável. A rotação exige migração coordenada dos fingerprints; perda/troca unilateral quebra a
comparação deny-only de identidades anteriormente anonimizadas.

Os bancos de desenvolvimento e teste ficaram atualizados com 37 migrations. A cadeia completa
também foi aplicada em banco temporário vazio, que terminou sem dados residuais.

## Dados auditados

| Tabela/categoria | Tratamento após anonimização | Justificativa |
|---|---|---|
| `User` | nome, username e e-mail pseudonimizados; senha/verificação removidas; `ANONYMIZED` | negar autenticação e reduzir PII preservando o ID histórico |
| `Session`, reset, verificação, OAuth state e reativação | removidos/inutilizados | credenciais e capabilities não têm finalidade posterior |
| `GitHubIdentity` | removida; fingerprint HMAC deny-only mantido no tombstone | impedir recuperação/reassociação sem guardar ID bruto |
| autorizações pessoais de instalação/repositório | removidas | não preservar autoridade pessoal após anonimização |
| `EmailChangeRequest` | removida | e-mails antigo/novo e token hashado deixam de ser necessários |
| convites | e-mail pseudonimizado; pendentes revogados; atores terminais preservados contra `User` pseudonimizado | reduzir reidentificação sem romper integridade histórica |
| memberships | desativadas, exceto quando o worker aborta por último OWNER | remover autorização sem criar projeto órfão |
| tarefas/movimentos | snapshots de nome neutralizados; referências técnicas preservadas | manter rastreabilidade funcional |
| commits, PRs e issues | e-mail/login de correspondência conhecida pseudonimizados | reduzir PII conhecida sem atribuir dados de terceiros por heurística ampla |
| `PrivacyRequest`, `PersonalDataExport`, `AuditEvent` e demais históricos técnicos | preservados com conta pseudonimizada e retenção própria | accountability, retry, rastreabilidade e governança |

## Gates e resultados reais

| Gate | Resultado |
|---|---|
| Node | `PASS`; `v22.23.2` em todos os gates finais |
| Prisma format/validate/generate/status | `PASS`; schema válido, client gerado e 37 migrations aplicadas |
| migrations do zero | `PASS`; banco temporário artificial, zero registros residuais |
| backend lint/format/architecture | `PASS`; nenhuma violação arquitetural |
| backend unit | `PASS`; 247/247 |
| backend integration/API | `PASS`; 163/163 executados, 5 skips externos/condicionais |
| backend full | `PASS`; 410/410 executados, 5 skips |
| backend coverage | `PASS`; statements 88,80%, branches 75,29%, functions 92,45%, lines 91,35% |
| frontend lint/format/test/build | `PASS`; 205/205 e build Vite |
| frontend coverage | `PASS`; statements 61,04%, branches 58,95%, functions 52,27%, lines 62,27% |
| npm audit backend/frontend | `PASS`; zero vulnerabilidades |
| secret scan | `PASS`; 309 arquivos verificados |

A primeira execução backend dentro do sandbox não pôde abrir sockets locais (`listen EPERM`). A
execução foi repetida fora dessa restrição com Node 22. Duas passagens intermediárias isoladas de
`test:integration` tiveram falhas transitórias de socket/estado de fixture em testes não alterados;
os cenários passaram isoladamente, o gate final passou integralmente e `npm test`/coverage também
passaram com todas as suítes.

## Pendências externas

- homologar OAuth/reautenticação com uma conta GitHub descartável real;
- comprovar scheduler do worker, alertas, backups e expurgo no ambiente implantado;
- validar com controlador/encarregado e apoio jurídico bases legais, prazos e texto final do aviso.

Essas pendências não são convertidas em evidência automatizada nem em declaração de conformidade
LGPD. Referências oficiais consultadas: [Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), [direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares) e [perguntas frequentes — ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/perguntas-frequentes).

## Parecer técnico

Os findings executáveis da LR.4 foram corrigidos sem reintroduzir legado, sem dual-write, sem
alterar o TCC e sem ampliar autorização de projeto. A evidência automatizada final está verde; as
pendências restantes dependem exclusivamente de ambiente/fornecedores/governança externa.

**LR.4 CONCLUÍDA — PRONTO PARA LR.5.**
