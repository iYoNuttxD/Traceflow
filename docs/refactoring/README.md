# Refatoração do TRACEFLOW

## Objetivo

Esta área registra a evolução incremental do MVP para uma arquitetura mais segura, testável e sustentável. A E0 congelou um baseline verificável; a E1 adicionou a rede inicial de testes que protege os contratos e comportamentos atuais.

## Estado da E0

**Concluída documentalmente em 24/07/2026**, com baseline executável, inventários e riscos registrados. A análise foi realizada na branch `daniel-dev`, no commit inicial `75f8921f719d87e9d6c27e05ac0016285c07ea5c`.

## Estado da E1

**Concluída em 24/07/2026**, com runners backend/frontend, banco MySQL isolado, testes HTTP e de interface, dublês da fronteira GitHub e cobertura inicial. A execução foi realizada na branch `daniel-dev`, a partir do commit `4cdcb941452dc1da0a97d24b1b3ca3f1e07aaacd`.

## Estado da E2

**Concluída em 24/07/2026**, com convenções e verificação automática, módulos Projects, Requirements, Tasks e Traceability divididos por responsabilidade, fronteira GitHub auditada, feature frontend Projects organizada e compatibilidades temporárias avaliadas. A continuação final partiu do commit `28da221fd7ba6900c62a4a5d3e6237df47572d8d`.

## Estado da E3

**Concluída em 24/07/2026**, com configuração validada no startup, erros e logging estruturado compartilhados, redaction, request ID, middlewares 404/erro, health/liveness/readiness, shutdown controlado e normalização mínima de erros no frontend. A execução partiu do commit `2ac8421c98a83fcc39e45cb8e62ba27cc3322d52`.

## Estado da E4

**Concluída em 24/07/2026**, com validação centralizada de params, query e body, coerções explícitas, bodies estritos, erros seguros, schemas por módulo e catálogo dos contratos HTTP. A execução partiu do commit `7b0c25b1f3e7d3bb67947a82bc1fa93e16597812`.

## Estado da E5

**Concluída em 24/07/2026**, com threat model, CORS allowlist, limite de body, headers, trust proxy, rate limiting, timeout/retry GitHub, proteção SSRF, política/scanner de segredos, registro de dependências e baseline ASVS com evidências e lacunas. A execução partiu do commit `ade0ff2d7324eed12e271bac218a0faddd0d3ba0`.

## Estado da E6

**Concluída em 24/07/2026**, com identidade, sessão opaca, CSRF, RBAC por projeto, e-mail transacional configurável, administração canônica de memberships, proteção do último OWNER, limpeza operacional, backfill seguro e matriz de autorização. A continuação partiu do commit `77aeec998308c843ce6891c6a1d6e03e646e9d63`.

## Estado da E7

**Concluída em 24/07/2026**, com models/migration aditivos, auditoria persistente, direitos do titular, retenção, anonimização controlada, frontend e documentação de privacidade. A execução partiu do commit `4a02b67fe471a05405644dcd7fa66536cb8a1ade`.

## Estado da E8

**Concluída definitivamente em 25/07/2026**, com cardinalidade Task 0..1 PullRequest confirmada, `Task.pullRequestId` canônico, reconciliação protegida e contract separado de `TaskPullRequest`, `GithubArtifact` e `TraceLink`. A continuação definitiva partiu do commit `def9c89284c55c4ab892c653b9082d9fb824db25`.

## Estado da E9

**Concluída tecnicamente em 25/07/2026, com smoke externo pendente**, com provider de credencial GitHub, DTOs, paginação, sincronização idempotente e auditável, persistência por lotes, proteção de concorrência e fluxos frontend de Projetos/Artifacts protegidos. A execução partiu do commit `ce87c5547ccb6ce0b1d9b658aa0cfb44105fca6d`.

## Estado da E10

**Concluída definitivamente em 25/07/2026**, com fórmulas canônicas, vínculos atômicos, matriz/grafos project-scoped e RF41 implementado por sugestões persistidas `[TASK-<ID>]`, revisão humana e integração idempotente com o sync. O fechamento do RF41 partiu do commit `2143e07`.

## Documentos produzidos

- [E0_BASELINE.md](E0_BASELINE.md) — execução, arquitetura, páginas, fluxos, divergências e bloqueios.
- [E0_ENDPOINTS.md](E0_ENDPOINTS.md) — rotas, contratos atuais, consumidores e estados.
- [E0_TRACEABILITY_MATRIX.md](E0_TRACEABILITY_MATRIX.md) — matriz RF → rota → controller → service → repository → model → tela.
- [E0_PRISMA_INVENTORY.md](E0_PRISMA_INVENTORY.md) — models, relações, migrations, uso e riscos.
- [E0_TECHNICAL_DEBT.md](E0_TECHNICAL_DEBT.md) — TODOs, placeholders, duplicações, candidatos a legado e prioridades.
- [E0_SECURITY_PRIVACY_BASELINE.md](E0_SECURITY_PRIVACY_BASELINE.md) — controles atuais, lacunas, dados pessoais e relação preliminar com ASVS.
- [E1_TEST_HARNESS.md](E1_TEST_HARNESS.md) — harness, isolamento do banco, testes de caracterização, resultados e cobertura inicial.
- [E2_ARCHITECTURAL_BOUNDARIES.md](E2_ARCHITECTURAL_BOUNDARIES.md) — convenções, verificador, módulos migrados, cobertura e pendências.
- [E3_SHARED_INFRASTRUCTURE.md](E3_SHARED_INFRASTRUCTURE.md) — configuração, erros, logging, redaction, request ID, health e shutdown.
- [E4_INPUT_VALIDATION.md](E4_INPUT_VALIDATION.md) — validação HTTP, coerções, schemas, testes, cobertura e limitações.
- [E5_SECURITY_BASELINE.md](E5_SECURITY_BASELINE.md) — controles transversais E5, testes, audits, cobertura e riscos residuais.
- [E6_IDENTITY_AUTHORIZATION.md](E6_IDENTITY_AUTHORIZATION.md) — identidade, sessão, CSRF, RBAC, convites, migration e lacunas.
- [E7_PRIVACY_AUDIT_GOVERNANCE.md](E7_PRIVACY_AUDIT_GOVERNANCE.md) — auditoria, direitos do titular, retenção, anonimização e lacunas.
- [E8_PRISMA_SCHEMA_MIGRATION.md](E8_PRISMA_SCHEMA_MIGRATION.md) — modelo canônico, reconciliação, migrations contract e fechamento definitivo.
- [E9_PROJECTS_GITHUB.md](E9_PROJECTS_GITHUB.md) — cadastro de projetos, fronteira GitHub, paginação, sincronização, testes e riscos residuais.
- [E10_REQUIREMENTS_TRACEABILITY.md](E10_REQUIREMENTS_TRACEABILITY.md) — requisitos, fórmulas, vínculos atômicos, matriz e grafos canônicos.
- [THREAT_MODEL.md](../security/THREAT_MODEL.md) — ativos, boundaries, ameaças e decisões de risco.
- [SECRETS_POLICY.md](../security/SECRETS_POLICY.md) — ciclo de vida, acesso, rotação e resposta a vazamento.
- [DEPENDENCY_RISK_REGISTER.md](../security/DEPENDENCY_RISK_REGISTER.md) — advisories, aplicabilidade e decisões.
- [ASVS_BASELINE.md](../security/ASVS_BASELINE.md) — evidências e lacunas aplicáveis do ASVS 5.0, sem declaração de conformidade.
- [AUTHORIZATION_MATRIX.md](../security/AUTHORIZATION_MATRIX.md) — acesso por papel para todos os grupos de endpoints.
- [API_CONTRACTS.md](../api/API_CONTRACTS.md) — catálogo executável de rotas, entradas, respostas e erros atuais.
- [MODULE_CONVENTIONS.md](../architecture/MODULE_CONVENTIONS.md) — responsabilidades e dependências permitidas no backend.
- [FRONTEND_STRUCTURE.md](../architecture/FRONTEND_STRUCTURE.md) — direção pages → features → shared e organização frontend.

## Próxima etapa

E0–E8 estão concluídas definitivamente. A E9 está concluída tecnicamente, com smoke externo ainda pendente. A E10 está concluída definitivamente, incluindo RF41 implementado e homologado. Próxima etapa: **E11**, que não foi iniciada nesta execução.

Nenhum código funcional foi refatorado durante a E0 ou a E1. A E2 reorganizou fronteiras internas, a E3 introduziu infraestrutura transversal, a E4 protegeu os contratos de entrada e a E5 estabeleceu controles transversais de segurança, sem alterar regras de negócio ou respostas de sucesso.
