# ADR-004 — Titularidade da credencial GitHub

- **Estado:** histórica; substituída operacionalmente pelo ADR-009 na L1
- **Data:** 24/07/2026

> Esta decisão registra a transição E6. O runtime vigente não usa PAT: a GitHub App e a separação entre autorização pessoal e acesso técnico estão no [ADR-009](ADR-009-GITHUB-APP-INSTALLATION-AUTH.md).

## Decisão histórica

Na E6, o `GITHUB_TOKEN` global permaneceu temporariamente como credencial técnica do sistema. Ele não representava o usuário autenticado, não concedia papel de projeto e não era exposto ao frontend, banco, respostas ou logs.

OAuth/GitHub App por usuário/instalação não foi introduzido naquela etapa. A evolução prevista foi concluída na L1/LR.3: GitHub App por instalação, tokens efêmeros e trilha de auditoria.

## Estado vigente

Não existe fallback `GITHUB_TOKEN`. A autorização pessoal `OWNER`/`ADMIN` define quais repositórios o usuário pode selecionar; a GitHub App fornece o Installation Token técnico para descoberta cruzada e sincronização. User e Installation Tokens não são persistidos. Secret manager, rotação e homologação externa permanecem responsabilidades operacionais.
