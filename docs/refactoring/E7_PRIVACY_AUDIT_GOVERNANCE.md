# E7 — Privacidade, LGPD, auditoria e governança

## Identificação e estado

- Branch: `daniel-dev`
- Commit inicial: `4a02b67fe471a05405644dcd7fa66536cb8a1ade`
- Data: 24/07/2026
- Estado inicial: árvore limpa, sincronizada e sem alterações preexistentes
- Estado: **CONCLUÍDA**. Migration, operações críticas, regressão, retenção, frontend e documentação foram validados em `traceflow_test`; a E8 não foi iniciada.

## Decisões e estrutura

Foi adotada anonimização seletiva, detalhada no ADR-005. A migration aditiva cria `AuditEvent`, `PrivacyRequest` e `PersonalDataExport`, seus enums, relações, índices e constraints. Nenhum model/campo legado foi removido.

```text
backend/src/modules/audit/      auditoria persistente, consulta e metadata allowlist
backend/src/modules/privacy/    direitos do titular, sessões, exportação e anonimização
backend/src/shared/maintenance/privacy-retention.js
frontend/src/features/privacy/  conta/privacidade e auditoria OWNER
docs/privacy/                   inventário, fluxos, retenção e aviso draft
```

## Auditoria

Eventos registram ator técnico, ação, recurso, projeto, resultado, request ID e retenção. Não armazenam body, headers, senha, token, e-mail ou conteúdo integral. Metadata aceita apenas `previousRole`, `newRole`, `scope`, `count`, `format` e `sessionId`.

Alteração de papel, desativação/reativação/saída de membro, transferência de OWNER, perfil, revogação de sessão, exportação, desativação, solicitação/cancelamento de exclusão e anonimização escrevem auditoria no mesmo callback transacional quando críticas. Falha controlada comprovou rollback de papel. Auth, projeto, convite, requisito, tarefa, movimento e sync persistem eventos operacionais com fallback explícito para o logger. Consulta de conta pertence ao titular; consulta de projeto é paginada e exclusiva do OWNER. `TRACE_LINK_*` não é emitido porque os handlers permanecem `501` por restrição do baseline.

## Direitos e ciclo de vida

- `GET /api/account/personal-data`: perfil, memberships, atribuições, movimentos e solicitações, sem hashes/terceiros.
- `PATCH /api/account/profile`: nome/e-mail com senha e unicidade; verificação de e-mail não existe ainda.
- sessões: lista minimizada e revogação própria/total.
- exportação: JSON sob demanda, titular, metadata com TTL 15 min, sem storage/URL pública.
- desativação: senha, proteção do último OWNER, memberships/sessões inativas e auditoria obrigatória.
- exclusão: solicitação/cancelamento, carência default de 7 dias e job manual.
- anonimização: UUID aleatório, credenciais invalidadas, textos vinculados neutralizados e história preservada.

## Retenção e configuração

Variáveis: `AUDIT_RETENTION_DAYS=365`, `DEACTIVATED_ACCOUNT_RETENTION_DAYS=30`, `EXPORT_FILE_TTL_MINUTES=15`, `PRIVACY_REQUEST_RETENTION_DAYS=365`, `ACCOUNT_DELETION_GRACE_DAYS=7`. Valores são validados e o objeto permanece imutável.

Scripts: `privacy:retention:dry-run`, `privacy:retention`, `privacy:deletions:dry-run` e `privacy:deletions`. Eles exibem somente contagens/alvo sanitizado, exigem confirmação para banco nomeado como produção, são idempotentes e não rodam no startup.

## Frontend e contratos

`/account/privacy` oferece perfil, sessões, exportação, exclusão/desativação e atividade. `/projects/:projectId/audit` é a interface administrativa mínima. O frontend não armazena segredo nem recebeu mudança de layout ampla. Novos contratos estão no catálogo; respostas existentes e sete `501` não mudaram.

## Testes, cobertura e validações

Adicionados/estendidos 5 testes unitários backend, 7 testes API/MySQL e 3 testes frontend. Eles cobrem minimização, config, retenção dry-run/apply, rollback obrigatório, anonimização real, ownership de export/sessão, último OWNER, auditoria e UI. Resultado: **141 backend** (78 unitários, 63 integração/API) e **25 frontend**, total **166 testes**.

Validações aprovadas: `npm ci`, Prisma format/validate/generate, aplicação das 17 migrations, `architecture:check`, scanner de 190 arquivos, suites completas, retenção dry-run/apply repetida, anonimização dry-run, audits e build. O primeiro acesso ao MySQL falhou no sandbox; a repetição autorizada aplicou a migration em `traceflow_test`. Uma execução agrupada foi deliberadamente bloqueada quando `DATABASE_URL` e `TEST_DATABASE_URL` ficaram iguais; a repetição correta comprovou a barreira e passou sem usar o banco de desenvolvimento.

| Cobertura | Antes (E6) | Depois (E7) |
|---|---:|---:|
| Backend statements / branches / functions / lines | 76,83 / 62,63 / 77,40 / 78,45 | 77,79 / 63,28 / 78,96 / 79,99 |
| Frontend statements / branches / functions / lines | 13,88 / 15,21 / 13,30 / 14,11 | 15,91 / 16,08 / 15,75 / 15,55 |

## Dependências, limitações e E8

Nenhuma dependência foi adicionada. Lacunas não bloqueantes para E8: confirmação de novo e-mail, console formal para operador, store distribuído, política real de backups/logs, legal hold e validação jurídica. Audit backend: zero vulnerabilidades. Audit frontend: duas altas do advisory React Router RSC já registrado, não aplicável à SPA atual e sem correção não-breaking.

Não há declaração de conformidade com LGPD ou ASVS. Nenhum commit, push ou pull request foi realizado.
