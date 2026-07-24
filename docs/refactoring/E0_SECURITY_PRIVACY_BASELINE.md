# E0 — Baseline de segurança e privacidade

Levantamento técnico do estado atual. Este documento não declara conformidade com OWASP ASVS nem adequação jurídica à LGPD.

## Controles atuais

| Item | Evidência atual | Classificação | Risco observado |
|---|---|---|---|
| CORS | `app.use(cors())`; health respondeu `Access-Control-Allow-Origin: *` | PARCIAL | Qualquer origem pode ler endpoints públicos; não há allowlist por ambiente |
| Limite de body | `express.json()` sem opção | PARCIAL | Usa default da biblioteca, não limite definido pelo produto/rota |
| Headers de segurança | `X-Powered-By: Express`; nenhuma configuração dedicada | AUSENTE | Fingerprint e ausência de políticas como CSP/HSTS no app |
| Autenticação | Nenhum middleware/model/session/login | AUSENTE | Acesso anônimo a todos os dados e mutações |
| Autorização | Services validam pertencimento somente em alguns vínculos | AUSENTE | BOLA/IDOR por projeto/recurso; qualquer cliente escolhe IDs |
| Proteção entre projetos | Vínculos task↔artifact/requirement validam projectId | PARCIAL | Consultas/CRUD não verificam participação/identidade; não há deny-by-default |
| Credencial GitHub | `GITHUB_TOKEN` em env, usada somente no backend | PARCIAL | Token global compartilhado; fallback direto a `process.env`; sem ownership/rotação/escopo auditado |
| Configuração/segredos | `.env` ignorado; `.env.example` sem valor real; valores não foram documentados | PARCIAL | Startup não valida env; `.env` local existe; não há secret manager/política de rotação |
| Validação de entrada | Regras manuais nos services; Prisma parametrizado | PARCIAL | Sem schemas centralizados, limites de comprimento/cardinalidade ou normalização uniforme |
| SQL/injeção | Apenas APIs Prisma; nenhum SQL raw encontrado | IMPLEMENTADO | Reduz SQL injection, mas não cobre XSS/abuso/validação de domínio |
| Erros HTTP | Mensagens genéricas em vários 500; statusCode local | PARCIAL | Sem handler central/request ID; algumas mensagens internas do service são expostas |
| Logging | `console.log/error`, sem corpos explícitos | PARCIAL | Objetos de erro Octokit podem incluir headers/PII; sem redaction/auditoria |
| Convites | Código `TRC-` com seis caracteres via `Math.random`; unique no DB | PARCIAL | Previsibilidade/força insuficiente, sem hash, expiração, revogação, limite de uso ou rate limit |
| Rate limiting | Não encontrado | AUSENTE | Abuso de CRUD, join e GitHub API; brute force de convite |
| Timeout externo | Não configurado no Octokit/Axios | AUSENTE | Requests podem ocupar recursos indefinidamente conforme defaults |
| Paginação | GitHub usa `per_page:100`; API local retorna listas completas | PARCIAL | Sync truncado; DoS por coleções grandes/respostas pesadas |
| Rate limit GitHub | Mensagem normalizada para 429/403 | PARCIAL | Sem leitura preventiva, backoff, retry/jitter ou checkpoint |
| Idempotência | Unique keys; commits `createMany skipDuplicates`; PR/issues upsert | PARCIAL | Sync não é transacional e não pagina; falha parcial mantém dados |
| Transporte/TLS | Não configurado no app; HTTP local documentado | NÃO_CONFIRMADO | Produção depende de proxy/deploy não presente no repositório |
| CSRF | Sem cookie/sessão atualmente | NÃO_CONFIRMADO | Ao introduzir sessão por cookie, controle será necessário |
| XSS/output | React escapa texto; links externos usam `rel=noreferrer` | PARCIAL | Conteúdo GitHub é exibido; não há CSP; URLs dependem dos dados persistidos |
| Auditoria | TaskMovement registra mudança Kanban | PARCIAL | Não há AuditEvent nem logs de auth, membros, vínculos, sync, exportação/exclusão |
| Dependências | Lockfiles e `npm ci`; CI usa actions majors | PARCIAL | Não há audit/dependency review/secret scan; auditoria de vulnerabilidades não foi executada nesta E0 |
| Disponibilidade | Workflow tem timeout de 10 min | PARCIAL | Backend sem graceful shutdown, health readiness ou limites por request |

## Configurações e segredos

Chaves identificadas, sem registrar seus valores:

| Chave | Uso | Exposição atual | Risco |
|---|---|---|---|
| `DATABASE_URL` | Prisma/MySQL | Backend env; `.env` ignorado | Credencial completa em uma string; sem validação/rotação documentada |
| `GITHUB_TOKEN` | Octokit | Backend env; nunca enviado explicitamente à SPA | Token pessoal/global; possível vazamento por error logging; sem titular/escopo por projeto |
| `PORT` | bind do Express | Backend env, default 3001 | Baixo; tipo não validado |
| `FRONTEND_URL` | criação de inviteLink | Backend env, default localhost | Link persistido pode apontar para origem incorreta; sem allowlist |
| `VITE_API_URL` | base pública Axios | Build/frontend, default localhost | Tudo em VITE é público; não deve receber segredo |

`backend/.env` existe localmente e está ignorado. `git ls-files` confirmou apenas `.env.example` como rastreado. Nenhum valor real foi incluído nestes documentos.

## Dados pessoais e correlatos

| Dado | Origem | Model/arquivo | Finalidade aparente | Exibição | Persistência | Acesso aparente | Retenção definida | Risco |
|---|---|---|---|---|---|---|---|---|
| Nome de membro | formulário/join | ProjectMember | Identificar participante e ator | Details, Tasks, Kanban | MySQL | Qualquer cliente/usuário anônimo | Não | Exposição e homônimos; sem titular User |
| E-mail de membro | formulário/join | ProjectMember.email | Contato/deduplicação aparente | ProjectDetails | MySQL | Qualquer cliente da API | Não | Campo opcional mas exposto em lista; sem finalidade/validação robusta |
| Papel/participação | formulário | ProjectMember.role/isActive/datas | Equipe e seleção | Details/Kanban | MySQL | Anônimo | Não | Não é autorização real; inferência organizacional |
| Responsável por tarefa | UI | Task.responsible | Atribuição de trabalho | Tasks/Kanban/Traceability | MySQL | Anônimo | Não | Texto duplicado; métricas/atividade individual |
| Histórico de movimentação | UI/body + membro | TaskMovement | Histórico RF38 | Kanban | MySQL | Anônimo | Não | Atividade individual; autoria pode ser forjada |
| Login GitHub | GitHub API | Commit/PR/Issue | Autoria técnica | Repository/Tasks/Traceability | MySQL | Anônimo | Não | Perfil e atividade pública/privada agregados |
| Nome de autor de commit | GitHub API | Commit.authorName | Evidência técnica | Repository/Tasks/Traceability | MySQL | Anônimo | Não | Dado pessoal derivado do Git |
| E-mail de commit | GitHub API | Commit.authorEmail | Evidência/autoria | TraceabilityFlow (via API de detalhe) | MySQL | Anônimo | Não | Maior risco de exposição; não é necessário em todas as telas |
| Assignee de issue | GitHub API | Issue.assigneeUsername | Responsabilidade técnica | Traceability | MySQL | Anônimo | Não | Atividade individual |
| Conteúdo de commit/PR/issue | GitHub API | message/title/description/labels | Evidência e contexto | Várias telas (descrições nem sempre exibidas) | MySQL | Anônimo | Não | Pode conter PII, segredos acidentais ou conteúdo confidencial |
| Repositório privado/metadados | GitHub API/form | Project e artefatos | Integração | Details/Repository | MySQL | Anônimo | Não | Revela existência, nomes, branches e URLs privadas |
| Código/link de convite | geração local | Project.accessCode/inviteLink | Entrada no projeto | ProjectDetails/URL/clipboard | MySQL | Anônimo em GET Project | Não | Credencial de acesso reutilizável e exposta |
| Erro de sincronização | integração | Project.githubLastSyncError | Diagnóstico | ProjectDetails | MySQL | Anônimo | Não | Normalizado, mas ainda dado operacional; política ausente |
| Logs técnicos | runtime | stdout/stderr | Operação/diagnóstico | Servidor/CI conforme ambiente | Não confirmado | Operadores não definidos | Não | Objetos de erro podem carregar PII/headers |
| Token GitHub | configuração | `.env`, memória do processo | Chamar GitHub | Não deve ser exibido | Arquivo local/env; não no schema | Processo/operadores | Não | Segredo de alto impacto; global |

Não foram encontrados comentários persistidos por usuários, IPs, cookies, sessões ou senhas no runtime/model atual. A ausência pode mudar em etapas futuras.

## Relação preliminar com áreas OWASP ASVS 5.0

Sem declarar atendimento e sem fixar IDs de controle específicos, para evitar uma matriz normativa sem evidência:

| Área ASVS aplicável | Evidência atual | Lacuna principal | Estado |
|---|---|---|---|
| Arquitetura, desenho e threat modeling | Documento de arquitetura e camadas | Sem threat model, trust boundaries ou inventário de controles testados | PARCIAL |
| Validação, sanitização e encoding | Validação manual + React escaping + Prisma | Sem schemas/limites centralizados, CSP e validação consistente de conteúdo externo | PARCIAL |
| Autenticação | Nenhuma | Identidade, credenciais, recuperação, MFA conforme risco | AUSENTE |
| Sessão | Nenhuma | Estratégia, expiração, revogação, cookies/tokens seguros | AUSENTE |
| Controle de acesso | Validação de mesmo projeto em alguns vínculos | Autorização por usuário/projeto/perfil em todas as rotas e BOLA tests | AUSENTE |
| Criptografia/segredos | Env e HTTPS da API GitHub | Gestão/rotação/escopo, criptografia de credencial persistida se houver | PARCIAL |
| Logging e tratamento de erro | Console e mensagens genéricas | Redaction, audit log, request ID, política de acesso/retenção | PARCIAL |
| Proteção de dados | Alguns selects limitam campos | Classificação/minimização/retention/rights e restrição de saída | PARCIAL |
| Comunicação | Octokit HTTPS por biblioteca | TLS/reverse proxy e headers de produção não documentados | NÃO_CONFIRMADO |
| Configuração | dotenv, exemplo e gitignore | Fail-fast, separação de ambientes, headers, trust proxy e debug | PARCIAL |
| API/web service | REST + JSON | Auth, rate limit, paginação, limites, erros estáveis, anti-automation | PARCIAL |
| Arquivos/upload | Nenhum upload encontrado | Registrar como fora de escopo enquanto permanecer ausente | NÃO_CONFIRMADO |
| Lógica de negócio | Algumas invariantes e transações | Concorrência, atomicidade multietapa, abuso de convite/sync e testes | PARCIAL |

## Encaminhamento por etapa futura

### E5 — Baseline de segurança

- Threat model, trust boundaries e checklist ASVS aplicável com evidência.
- CORS allowlist, limite explícito de body, headers, desativação de fingerprint, rate limiting e configuração por ambiente.
- Timeout/paginação/rate-limit/retry controlado do GitHub e Axios.
- Erro/logging sanitizados, correlation ID e política de segredos/rotação.
- Testes básicos de abuso, URL externa, payload excessivo e origem não autorizada.

### E6 — Identidade, sessão e autorização

- User e membership real; autenticação, sessão, logout e recuperação segura.
- Autorização por projeto/recurso/perfil em todas as rotas, negando por padrão.
- Substituir convite previsível por token criptograficamente seguro, hash, escopo, expiração, revogação e limite de uso.
- Vincular credencial GitHub ao titular/instalação autorizada; decidir GitHub App/OAuth/PAT por ADR.
- Substituir `responsible`/`movedBy` textuais por identidade com migração compatível.

### E7 — LGPD e auditoria

- Inventário formal com finalidade, base legal a validar, controlador/operador, compartilhamento e retenção.
- Avaliar minimização de `Commit.authorEmail`, descrições e logins; limitar visualização por perfil.
- Procedimentos de correção, exportação, exclusão/anonimização e tratamento de backups.
- AuditEvent separado de log técnico para ações sensíveis, com acesso restrito e sem segredos.
- Política de logs, resposta a incidentes e avaliação dos terceiros GitHub/e-mail/hosting.

## Riscos prioritários

1. **CRÍTICO:** acesso anônimo e sem isolamento autorizado entre projetos.
2. **CRÍTICO:** convite funciona como credencial previsível, reutilizável e sem expiração/rate limit.
3. **ALTO:** token GitHub global e potencial logging de erro externo.
4. **ALTO:** PII e conteúdo de repositório retornados sem DTO/autorização, incluindo e-mail de commit no grafo.
5. **ALTO:** sync parcial, sem paginação/timeout, pode induzir estado incompleto como baseline operacional.
6. **MÉDIO:** ausência de retenção/auditoria e autoria de movimento forjável.

Estas classificações são de engenharia e precisam de validação de risco, operação e privacidade nas etapas correspondentes.
