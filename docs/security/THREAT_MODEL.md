# Threat model inicial do TRACEFLOW

## Identidade e sessão

Username/e-mail compartilham mensagem genérica; rate limit reduz brute force/credential stuffing. Sessão persistente usa o mesmo token opaco, com TTL distinto persistido. Verificação, reset, convite e state usam valor aleatório, hash, expiração e uso único. SMTP falho não reverte a conta nem produz alegação de entrega aceita.

## GitHub OAuth e GitHub App

GitHub OAuth pertence à identidade; GitHub App é a autoridade técnica para Installation,
repositórios, artefatos, sync e webhooks. O callback da App liga state ao usuário, à sessão e à
intenção TraceFlow; quando a autorização de usuário durante a instalação está habilitada, descarta o
User Access Token depois de provar que o ator GitHub acessa a `installation_id`. A Installation
também é validada com App JWT, e o Installation Token temporário é a única autoridade para descobrir
repositórios e sincronizar. Nenhuma `GitHubIdentity` ou evidência pessoal `OWNER`/`ADMIN` participa
desse fluxo. Webhook exige HMAC SHA-256 constant-time e delivery ID. Foram considerados
callback/installation ID forjados, replay, instalação inacessível ao ator, BOLA/non-OWNER de projeto,
private key/client/webhook secret, token em log, suspensão/remoção e repositório removido. Permanecem
riscos operacionais de secret manager, permissões/configuração real, rate limit distribuído e
indisponibilidade externa.

## Provider GitHub histórico

O provider sistêmico é histórico e foi substituído pela GitHub App descrita acima. DTOs mínimos,
paginação e idempotência permanecem; exclusão mútua usa claim persistido de `GitHubSyncRun` com stale
detection.

## Identidade, autorização e e-mail

Identidade verificável, sessão opaca, CSRF, memberships e RBAC reduzem spoofing/BOLA. Navegador,
cookie, SMTP e endpoints públicos de autenticação formam trust boundaries. Adapter SMTP/capture,
administração canônica, proteção transacional do último OWNER e retenção operacional fazem parte dos
controles vigentes. A referência ao PAT é histórica; ele não pertence ao runtime.

Novas ameaças tratadas/testadas: credential stuffing, fixation/hijacking, CSRF, replay/substituição de reset e convite, enumeração de conta/projeto, privilege escalation, remoção do último OWNER e BOLA entre projetos.

## Escopo e método

Este threat model usa STRIDE como guia e não é certificação formal. Identidade, sessão, autorização,
auditoria e gates de supply chain existem, com as lacunas operacionais explicitadas abaixo.

## Migrations e reconciliação

Migrations e reconciliação formam uma boundary administrativa: scripts são dry-run por padrão, sanitizam o target, exigem confirmação para apply fora de banco de teste e não são importáveis pelo runtime. O contract final removeu três representações legadas somente após zero conflitos, órfãos, dados exclusivos, consumidores e dependências. Guards SQL impedem `DROP` com linha residual. Produção ainda exige dry-run em cópia representativa, backup, estimativa de lock e janela operacional.

## Ativos

- projetos, requisitos, tarefas, vínculos e histórico Kanban;
- metadados de repositórios, commits, pull requests e issues;
- nomes, e-mails, logins GitHub e autoria técnica;
- chave privada/client/webhook secret da GitHub App, `DATABASE_URL`, credencial SMTP e configuração operacional;
- códigos e links de convite;
- integridade do banco MySQL e disponibilidade da API;
- logs estruturados, request IDs, lockfiles e pipeline CI/CD.

## Atores

- visitante anônimo, limitado a health e autenticação pública;
- integrante autenticado de projeto, sujeito ao papel da membership;
- operador/desenvolvedor com acesso a ambiente e logs;
- GitHub/Octokit como dependência externa;
- ator malicioso remoto, pacote comprometido ou proxy mal configurado.

## Pontos de entrada

- SPA React e todas as rotas HTTP do Express;
- `POST /api/projects/join` e código de convite;
- criação/importação de projeto e URLs GitHub;
- autenticação, listagem e sincronização GitHub;
- params, queries e JSON validados na E4;
- variáveis de ambiente, stdout/stderr, lockfiles e workflows;
- headers encaminhados por reverse proxy.

## Trust boundaries e fluxos

```text
Internet/navegador
        |
        | HTTPS esperado, CORS e rate limit
        v
Reverse proxy / ingress  -- boundary de transporte e IP confiável
        |
        v
Backend Express  -- boundary HTTP, validação, logging e regras de domínio
   |          |
   |          +--> GitHub API/Octokit -- boundary externa, App/installation, timeout e retry
   v
Prisma/MySQL  -- boundary de persistência e dados pessoais

Backend Express --> servidor SMTP -- boundary externa para entrega; token existe no conteúdo em trânsito

CI/CD e operadores -- boundary administrativo para código, dependências e segredos
```

O backend não faz fetch genérico de URLs informadas pelo cliente. A integração usa base fixa `https://api.github.com`; URLs persistidas são limitadas a HTTPS e hosts GitHub oficiais.

## Ameaças e tratamento

| Categoria | Ameaça | Impacto | Controles | Risco residual |
|---|---|---|---|---|
| Spoofing | Cliente assume identidade textual/membro | ALTO | User/sessão e ator canônico; `ProjectMember`/`projectMemberId` não pertencem ao runtime | manter regressões de identidade e autorização ao adicionar fluxos |
| Tampering | Alteração por ID/BOLA | MÉDIO | membership, resolução de recurso, deny-by-default e matriz de papéis | manter testes ao adicionar endpoints |
| Elevação de privilégio | MEMBER altera papel, desativa OWNER ou projeto fica sem OWNER | ALTO | OWNER-only, IDs do mesmo projeto, transação serializável e `LAST_PROJECT_OWNER` | concorrência deve continuar coberta em mudanças futuras |
| Information disclosure | Reset/convite exposto em resposta, log ou adapter | CRÍTICO | hash no banco, resposta apenas em teste, SMTP/capture explícito, redaction e templates escapados | proteger caixa postal e SMTP; rotação após incidente |
| Repudiation | autoria de mutação não comprovável | ALTO | ator da sessão, `AuditEvent`, `TaskHistoryEntry`, request ID e metadata allowlist; snapshots anteriores à identidade não são associados artificialmente | garantir retenção e acesso aos logs no ambiente real |
| Information disclosure | Token, banco, e-mail ou erro externo em resposta/log | ALTO | error handler seguro, redaction, scanner obrigatório na CI e minimização de DTOs | secret manager e governança dos logs externos |
| Information disclosure/BOLA | Exportação usa vínculo histórico para revelar conteúdo atual de projeto | CRÍTICO | `ProjectMembership.isActive=true` em todos os datasets de projeto e teste ZIP de regressão | texto livre autorizado ainda pode conter PII de terceiros |
| Spoofing | Identidade GitHub anonimizada recria/reassocia automaticamente uma conta | ALTO | tombstone deny-only com fingerprint HMAC, verificado antes de login, link ou criação | custódia/rotação da chave e GitHub real dependem da operação |
| Elevation of privilege/Integrity | Worker anonimiza último OWNER ou deixa `DELETION_PENDING` indefinido | CRÍTICO | revalidação transacional; solicitação `REJECTED`, conta `ACTIVE`, sessões revogadas e auditoria | job e alertas do scheduler são externos |
| Information disclosure | Enumeração de projetos/códigos | CRÍTICO | membership/BOLA, convite canônico, `accessCode` forte e rate limit/log de ingresso | capability continua sensível e exige monitoramento operacional |
| Denial of service | JSON grande ou malformado | ALTO | limite explícito de 100kb, `413`, `400` e `415` seguros | Limites de proxy e coleções devem ser alinhados no deploy |
| Denial of service | Abuso geral/join/GitHub sync | ALTO | limiters geral/sensíveis, chave IP+projectId, paginação e claim persistido único por projeto | MemoryStore do rate limit não é distribuído; IP não equivale a usuário |
| Denial of service | GitHub lento/indisponível | ALTO | timeout 15s, retry limitado, backoff/jitter e normalização 403/429 | Sem circuit breaker, fila, checkpoint ou scheduler |
| SSRF | URL externa aponta para localhost, rede privada ou metadata | ALTO | somente HTTPS e hosts `github.com`/`api.github.com`; base Octokit fixa | GitHub Enterprise não suportado; novas integrações exigem revisão |
| Supply chain | Dependência vulnerável ou segredo versionado | ALTO | lockfiles, política executável de audit, Dependency Review, scanner obrigatório e actions fixadas | SBOM, gate de licenças e revisão operacional contínua ainda necessários |
| Misconfiguration | CORS aberto, proxy irrestrito, segredo ausente | ALTO | configuração fail-fast, allowlist obrigatória em produção e `trust proxy` explícito | TLS/HSTS e headers do host da SPA dependem do ambiente de deploy |
| Clickjacking/XSS | Conteúdo incorporado ou interpretado no contexto errado | MÉDIO | CSP restritiva, `frame-ancestors`, `nosniff`, frameguard e referrer policy na API | CSP do servidor que hospeda a SPA ainda precisa ser configurada/validada |

## Decisões e riscos adiados

- CORS não é autenticação e requisições sem `Origin` continuam permitidas para clientes não navegador.
- O limiter em memória é aceito apenas para instância única; produção horizontal exige store distribuído.
- `accessCode` é capability canônica, gerada com entropia criptográfica, limitada a MEMBER/VIEWER e protegida por rate limit; convites pessoais usam token hashado, expiração, revogação e consumo único.
- TLS termina no reverse proxy; Express não implementa TLS. HSTS é habilitado apenas quando `NODE_ENV=production`.
- O frontend é servido separadamente; CSP/HSTS do documento HTML precisam ser aplicados no host da SPA.
- Exportação minimizada, auditoria crítica/operacional, retenção e anonimização seletiva usam
  autorização atual, tornam o impedimento de ownership resolvível e bloqueiam reassociação GitHub
  pós-anonimização. Jobs/logs/backups do deploy, confirmação de e-mail, secret manager e revisão
  jurídica permanecem riscos residuais.
