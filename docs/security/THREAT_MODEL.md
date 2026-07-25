# Threat model inicial do TRACEFLOW

## Escopo e método

Este threat model cobre o MVP na conclusão da E5 e usa STRIDE como guia de descoberta. Ele é uma baseline de engenharia, não uma certificação ou avaliação formal completa. O sistema ainda não possui identidade, sessão ou autorização; essas lacunas dominam o risco residual e pertencem à E6.

## Ativos

- projetos, requisitos, tarefas, vínculos e histórico Kanban;
- metadados de repositórios, commits, pull requests e issues;
- nomes, e-mails, logins GitHub e autoria técnica;
- `GITHUB_TOKEN`, `DATABASE_URL` e configuração operacional;
- códigos e links de convite;
- integridade do banco MySQL e disponibilidade da API;
- logs estruturados, request IDs, lockfiles e pipeline CI/CD.

## Atores

- visitante anônimo, atualmente capaz de usar toda a API;
- integrante legítimo de projeto, ainda sem identidade verificável;
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

CI/CD e operadores -- boundary administrativo para código, dependências e segredos
```

O backend não faz fetch genérico de URLs informadas pelo cliente. A integração usa base fixa `https://api.github.com`; URLs persistidas são limitadas a HTTPS e hosts GitHub oficiais.

## Ameaças e tratamento

| Categoria | Ameaça | Impacto | Controles E5 | Risco residual |
|---|---|---|---|---|
| Spoofing | Cliente assume qualquer identidade textual/membro | CRÍTICO | Nenhum controle de identidade foi antecipado | E6: User, login, sessão e vínculo real com ProjectMember |
| Tampering | Alteração anônima por ID/BOLA | CRÍTICO | Validação de formato e algumas invariantes de mesmo projeto | E6: autorização deny-by-default por projeto/recurso |
| Repudiation | `movedBy` e ator textual forjáveis | ALTO | request ID, logs JSON e eventos de operações sensíveis | E6/E7: identidade e AuditEvent com retenção/acesso |
| Information disclosure | Token, banco, e-mail ou erro externo em resposta/log | ALTO | error handler seguro, redaction, scanner e política de segredos | Secret manager, acesso/retenção de logs e minimização E7 |
| Information disclosure | Enumeração de projetos/códigos | CRÍTICO | rate limit de join e log sanitizado | Resposta de join ainda distingue projeto inexistente; corrigir junto do convite E6 |
| Denial of service | JSON grande ou malformado | ALTO | limite explícito de 100kb, `413`, `400` e `415` seguros | Limites de proxy e coleções devem ser alinhados no deploy |
| Denial of service | Abuso geral/join/GitHub sync | ALTO | limiters geral/sensíveis, chave IP+projectId e trava concorrente por projeto | MemoryStore não é distribuído; IP não equivale a usuário |
| Denial of service | GitHub lento/indisponível | ALTO | timeout 15s, retry limitado, backoff/jitter e normalização 403/429 | Sem circuit breaker, fila, checkpoint ou scheduler |
| SSRF | URL externa aponta para localhost, rede privada ou metadata | ALTO | somente HTTPS e hosts `github.com`/`api.github.com`; base Octokit fixa | GitHub Enterprise não suportado; novas integrações exigem revisão |
| Supply chain | Dependência vulnerável ou segredo versionado | ALTO | lockfiles, `npm audit`, atualizações pontuais e scanner local | Scanner não está no CI até E14; React Router RSC mantém advisory não aplicável à SPA |
| Misconfiguration | CORS aberto, proxy irrestrito, segredo ausente | ALTO | configuração fail-fast, allowlist obrigatória em produção e `trust proxy` explícito | TLS/HSTS e headers do host da SPA dependem do ambiente de deploy |
| Clickjacking/XSS | Conteúdo incorporado ou interpretado no contexto errado | MÉDIO | CSP restritiva, `frame-ancestors`, `nosniff`, frameguard e referrer policy na API | CSP do servidor que hospeda a SPA ainda precisa ser configurada/validada |

## Decisões e riscos adiados

- CORS não é autenticação e requisições sem `Origin` continuam permitidas para clientes não navegador.
- O limiter em memória é aceito apenas para instância única; produção horizontal exige store distribuído.
- `Math.random()`, código reutilizável e ausência de expiração/revogação do convite permanecem risco crítico para E6.
- TLS termina no reverse proxy; Express não implementa TLS. HSTS é habilitado apenas quando `NODE_ENV=production`.
- O frontend é servido separadamente; CSP/HSTS do documento HTML precisam ser aplicados no host da SPA.
- Retenção, minimização, direitos do titular e auditoria de negócio ficam para E7.
