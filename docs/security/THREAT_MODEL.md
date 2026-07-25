# Threat model inicial do TRACEFLOW

## Atualização E9

A credencial GitHub sistêmica passou a ser fornecida por provider único ao client externo, conforme ADR-007. DTOs mínimos reduzem a propagação de payloads externos, paginação limita memória, e persistência por projeto/identificador protege idempotência. Sync concorrente no mesmo projeto é bloqueado por instância; falha parcial preserva lotes e último sucesso, registra estado sanitizado e permite reprocessamento. Persistem o raio de impacto/quota do PAT, a ausência de lock distribuído e de checkpoint persistente entre páginas.

## Atualização E6

Identidade verificável, sessão opaca, CSRF, memberships e RBAC reduzem spoofing/BOLA. Navegador, cookie, SMTP e endpoints públicos de autenticação formam trust boundaries. A continuação da E6 adicionou adapter SMTP/capture, administração canônica, proteção transacional do último OWNER e retenção operacional. Persistem: PAT GitHub sistêmico, infraestrutura não distribuída, dependência operacional de SMTP e campos legados textuais.

Novas ameaças tratadas/testadas: credential stuffing, fixation/hijacking, CSRF, replay/substituição de reset e convite, enumeração de conta/projeto, privilege escalation, remoção do último OWNER e BOLA entre projetos.

## Escopo e método

Este threat model nasceu na E5 e foi atualizado na E6; usa STRIDE como guia e não é certificação formal. Identidade, sessão e autorização agora existem, com as lacunas operacionais explicitadas acima.

## Atualização E8

Migrations e reconciliação formam uma boundary administrativa: scripts são dry-run por padrão, sanitizam o target, exigem confirmação para apply fora de banco de teste e não são importáveis pelo runtime. O contract final removeu três representações legadas somente após zero conflitos, órfãos, dados exclusivos, consumidores e dependências. Guards SQL impedem `DROP` com linha residual. Produção ainda exige dry-run em cópia representativa, backup, estimativa de lock e janela operacional.

## Ativos

- projetos, requisitos, tarefas, vínculos e histórico Kanban;
- metadados de repositórios, commits, pull requests e issues;
- nomes, e-mails, logins GitHub e autoria técnica;
- `GITHUB_TOKEN`, `DATABASE_URL` e configuração operacional;
- códigos e links de convite;
- integridade do banco MySQL e disponibilidade da API;
- logs estruturados, request IDs, lockfiles e pipeline CI/CD.

## Atores

- visitante anônimo, limitado a health e autenticação pública;
- integrante autenticado de projeto, sujeito ao papel da membership;
- operador/desenvolvedor com acesso a ambiente e logs;
- GitHub/Octokit como dependência externa;
- agente malicioso remoto, pacote comprometido ou proxy mal configurado.

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
   |          +--> GitHub API/Octokit -- boundary externa, token, timeout e retry
   v
Prisma/MySQL  -- boundary de persistência e dados pessoais

Backend Express --> servidor SMTP -- boundary externa para entrega; token existe no conteúdo em trânsito

CI/CD e operadores -- boundary administrativo para código, dependências e segredos
```

O backend não faz fetch genérico de URLs informadas pelo cliente. A integração usa base fixa `https://api.github.com`; URLs persistidas são limitadas a HTTPS e hosts GitHub oficiais.

## Ameaças e tratamento

| Categoria | Ameaça | Impacto | Controles E5 | Risco residual |
|---|---|---|---|---|
| Spoofing | Cliente assume identidade textual/membro | ALTO | E6 usa User/sessão e ator canônico | concluir contract/backfill legado |
| Tampering | Alteração por ID/BOLA | MÉDIO | membership, resolução de recurso, deny-by-default e matriz de papéis | manter testes ao adicionar endpoints |
| Elevação de privilégio | MEMBER altera papel, desativa OWNER ou projeto fica sem OWNER | ALTO | OWNER-only, IDs do mesmo projeto, transação serializável e `LAST_PROJECT_OWNER` | concorrência deve continuar coberta em mudanças futuras |
| Information disclosure | Reset/convite exposto em resposta, log ou adapter | CRÍTICO | hash no banco, resposta apenas em teste, SMTP/capture explícito, redaction e templates escapados | proteger caixa postal e SMTP; rotação após incidente |
| Repudiation | `movedBy` e ator textual forjáveis | ALTO | request ID, logs JSON e eventos de operações sensíveis | E6/E7: identidade e AuditEvent com retenção/acesso |
| Information disclosure | Token, banco, e-mail ou erro externo em resposta/log | ALTO | error handler seguro, redaction, scanner e política de segredos | Secret manager, acesso/retenção de logs e minimização E7 |
| Information disclosure | Enumeração de projetos/códigos | CRÍTICO | membership/BOLA, convite canônico e rate limit/log do join legado | `accessCode` legado ainda distingue falha e deve ser descontinuado após migração |
| Denial of service | JSON grande ou malformado | ALTO | limite explícito de 100kb, `413`, `400` e `415` seguros | Limites de proxy e coleções devem ser alinhados no deploy |
| Denial of service | Abuso geral/join/GitHub sync | ALTO | limiters geral/sensíveis, chave IP+projectId, paginação e trava concorrente por projeto | MemoryStore e trava não são distribuídos; IP não equivale a usuário |
| Denial of service | GitHub lento/indisponível | ALTO | timeout 15s, retry limitado, backoff/jitter e normalização 403/429 | Sem circuit breaker, fila, checkpoint ou scheduler |
| SSRF | URL externa aponta para localhost, rede privada ou metadata | ALTO | somente HTTPS e hosts `github.com`/`api.github.com`; base Octokit fixa | GitHub Enterprise não suportado; novas integrações exigem revisão |
| Supply chain | Dependência vulnerável ou segredo versionado | ALTO | lockfiles, `npm audit`, atualizações pontuais e scanner local | Scanner não está no CI até E14; React Router RSC mantém advisory não aplicável à SPA |
| Misconfiguration | CORS aberto, proxy irrestrito, segredo ausente | ALTO | configuração fail-fast, allowlist obrigatória em produção e `trust proxy` explícito | TLS/HSTS e headers do host da SPA dependem do ambiente de deploy |
| Clickjacking/XSS | Conteúdo incorporado ou interpretado no contexto errado | MÉDIO | CSP restritiva, `frame-ancestors`, `nosniff`, frameguard e referrer policy na API | CSP do servidor que hospeda a SPA ainda precisa ser configurada/validada |

## Decisões e riscos adiados

- CORS não é autenticação e requisições sem `Origin` continuam permitidas para clientes não navegador.
- O limiter em memória é aceito apenas para instância única; produção horizontal exige store distribuído.
- `accessCode` legado com `Math.random()` permanece deprecado e com rate limit; convites canônicos usam token aleatório, hash, expiração, revogação e consumo único.
- TLS termina no reverse proxy; Express não implementa TLS. HSTS é habilitado apenas quando `NODE_ENV=production`.
- O frontend é servido separadamente; CSP/HSTS do documento HTML precisam ser aplicados no host da SPA.
- E7 adicionou minimização de exportação, auditoria persistente crítica/operacional, retenção manual e anonimização seletiva. Riscos residuais: jobs/logs/backups do deploy, fallback operacional do logger, confirmação de e-mail e revisão jurídica.
