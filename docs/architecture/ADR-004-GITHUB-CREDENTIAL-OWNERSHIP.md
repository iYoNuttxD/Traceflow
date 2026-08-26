# ADR-004 — Titularidade da credencial GitHub

- **Estado:** histórica; substituída operacionalmente pelo ADR-009 na L1
- **Data:** 24/07/2026

> Esta decisão registra a transição E6. O runtime vigente não usa PAT: a separação entre GitHub OAuth de identidade e GitHub App técnica está no [ADR-012](ADR-012-GITHUB-OAUTH-APP-DECOUPLING.md).

## Decisão histórica

Na E6, o `GITHUB_TOKEN` global permaneceu temporariamente como credencial técnica do sistema. Ele não representava o usuário autenticado, não concedia papel de projeto e não era exposto ao frontend, banco, respostas ou logs.

OAuth/GitHub App por usuário/instalação não foi introduzido naquela etapa. A evolução prevista foi concluída na L1/LR.3: GitHub App por instalação, tokens efêmeros e trilha de auditoria.

## Estado vigente

Não existe fallback `GITHUB_TOKEN`. A GitHub App e seu Installation Token definem os repositórios concedidos e executam a sincronização. GitHub OAuth identifica apenas a conta para autenticação e não participa da descoberta. User e Installation Tokens não são persistidos. Secret manager, rotação e homologação externa permanecem responsabilidades operacionais.
