# E8 — Registro final de contract

| Candidato | Condição verificada | Migration | Aplicação | Consumidores | Evidência de teste | Resultado | Rollback |
|---|---|---|---|---|---|---|---|
| TaskPullRequest | zero dado exclusivo, conflito, órfão e linha residual | `20260725130000_e8_contract_remove_task_pull_request` criada | aplicada em `traceflow_test`, banco vazio e upgrade artificial | dual-write/read removidos | singular, múltipla PR, divergência, idempotência e preservação | CONCLUÍDO | roll-forward e restauração de backup; `Task.pullRequestId` preservado |
| GithubArtifact | zero dado exclusivo, ambiguidade, órfão, relação e consumer | `20260725131000_e8_contract_remove_github_artifact` criada | aplicada em `traceflow_test`, banco vazio e upgrade artificial | repository vazio, autorização e page placeholder removidos | vazio, correspondente, convertível, ambíguo e preservação | CONCLUÍDO | roll-forward/restauração; models específicos preservados |
| TraceLink | zero tipo desconhecido, dado exclusivo, conflito, órfão e consumer | `20260725132000_e8_contract_remove_trace_link` criada | aplicada em `traceflow_test`, banco vazio e upgrade artificial | autorização removida; endpoints 501 preservados | vazio, reconhecido, desconhecido, bloqueio e preservação | CONCLUÍDO | roll-forward/restauração; relações tipadas preservadas |

Cada migration contém guard de tabela vazia. `e8:contract:dry-run` mede contagens, consumidores e dependências; `e8:contract` somente limpa origens já reconciliadas e aplica migrations quando os três gates estão aprovados. Apply em desenvolvimento/produção exige confirmação específica.

Permanecem fora deste contract: `ProjectMember`, campos textuais de responsável/ator e aliases GitHub. Nenhuma decisão da E9 foi iniciada.
