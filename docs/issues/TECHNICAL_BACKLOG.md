# Pendências técnicas posteriores à LR.2

Este backlog substitui TODOs soltos. Não representa implementação iniciada nem issue remota criada; a equipe deve transferir cada item para seu sistema oficial quando priorizado.

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| E15-F01 | Decidir exclusão de projeto e substituir o `501` | retenção, cascatas, auditoria, recovery | ALTA | decisão de produto/jurídica, ADR, backup e migration/testes |
| E15-F02 | Decidir eventual retirada do ingresso por `accessCode` | capability adicional ao TCC | BAIXA | decisão de produto; hoje o fluxo é canônico, limitado a MEMBER/VIEWER e sem `ProjectMember` |
| E15-F06 | Adotar GitHub App/secret manager | blast radius, rotação e quota | RESOLVIDA NA L1 / PARCIAL OPERACIONAL | GitHub App por instalação implementada; secret manager e rotação gerenciada continuam dependentes do ambiente |
| E15-F07 | Store distribuído para rate limit e lock de sync | produção horizontal/disponibilidade | MÉDIA | arquitetura de implantação e datastore aprovados |
| E15-F08 | Automatizar backup, restore e retenção de logs | continuidade/LGPD | ALTA | infraestrutura, criptografia, owner e prazos aprovados |
| E15-F09 | SBOM, provenance, action por SHA e gate de licenças | supply chain | MÉDIA | ferramenta/política aprovadas sem duplicar E14 |
| E15-F10 | Testes E2E reais de navegador | login, projetos e jornadas críticas | MÉDIA | ambiente isolado, fixtures não runtime e gate de CI definido |
| E15-F11 | Validação jurídica final de LGPD | base legal, controlador, DPO, fornecedores e transferência | ALTA | responsáveis jurídicos/operacionais definidos |
| E15-F12 | Observabilidade, alertas e SLOs | incidentes e disponibilidade | MÉDIA | plataforma de logs/métricas e política de acesso/retenção |
| E15-F13 | Funcionalidades oficiais ainda fora do produto | RF10, RF13, RF15–RF18, RF29–RF37, RF39–RF40, RF42–RF46, RF54–RF64 | PRODUTO | priorização funcional e incrementos próprios; não são cleanup E15 |
| L1-F01 | Configurar e homologar SMTP real | entrega de verificação, recuperação e convite | ALTA | credenciais e ambiente de homologação aprovados; validar falha temporária/permanente sem expor dados |
| L1-F02 | Configurar GitHub App real e validar permissões/webhooks | RF02–RF06, RF21, RF50 | ALTA | App instalada com permissões mínimas, callback e webhook HTTPS; executar smoke test externo |
| L1-F03 | Testes E2E reais da jornada de identidade e instalação | RF23, RF27, RF28 e GitHub App | MÉDIA | ambiente isolado com SMTP/GitHub controlados e gate de CI definido |
| L1-F04 | MFA para perfis administrativos | ASVS/contas privilegiadas | MÉDIA | decisão de produto e modelo de recuperação aprovados |

## Fechadas pela LR.2

- E15-F03: a base auditada atual não contém Task com responsabilidade textual pendente;
- E15-F04: `ProjectMember` e `TaskMovement.projectMemberId` foram contraídos com guards;
- E15-F05: aliases GitHub foram reconciliados em `ProjectGitHubIntegration` e removidos;
- o POST legado de membro, que fazia parte de E15-F02, foi removido; `accessCode` foi
  reclassificado como capability canônica vigente.
