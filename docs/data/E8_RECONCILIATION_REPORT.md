# E8 — Relatório de reconciliação

## Execuções verificadas

Fonte: schema E7 (17 migrations) em `traceflow_test`. Destino: schema expandido E8 (20 migrations). O banco estava vazio no inventário inicial: todos os 21 models auditados tinham contagem zero; checksums dos conjuntos técnicos vazios eram `e3b0c442…b855`. Nenhum banco compartilhado/produção foi lido.

| Cenário controlado | Antes | Apply | Segunda execução |
|---|---:|---:|---:|
| Task com `pullRequestId`, sem TaskPullRequest | 1 pendente | 1 join criado | 0 pendente |
| Task com responsável textual único | 1 pendente | `responsibleUserId` preenchido | 0 pendente |
| Movement com ProjectMember reconciliável | 1 pendente | `movedByUserId` preenchido | 0 pendente |
| Project com aliases GitHub | 1 projeto | 3 campos canônicos preenchidos, aliases preservados | 0 pendente |
| TraceLink Task→Commit | 1 pendente | TaskCommit criado | 0 pendente |
| GithubArtifact→Commit | 1 correspondente | somente classificado | mesma origem preservada |

As fixtures também verificam que apagar Task remove `TaskPullRequest`, mas preserva PullRequest. Nenhum dado pessoal é emitido: relatórios contêm apenas contagens, checksums e IDs técnicos quando estritamente necessários pelo backfill E6.

## Conflitos, órfãos e não reconciliados

No banco de teste vazio: zero duplicidades, conflitos, órfãos e não reconciliados. Nos cenários artificiais: zero vínculo perdido e zero órfão criado. Em banco real, o comando deve classificar sem aplicar automaticamente: e-mail ausente/inválido, nome ambíguo, papel desconhecido, projeto sem OWNER, responsável/movedBy sem identidade, TraceLink com projeto divergente/tipo não suportado e GithubArtifact sem correspondente.

## Decisões

- `GithubArtifact` sem correspondência não cria artefato específico, pois pode faltar identidade externa/conteúdo confiável.
- TraceLink somente materializa pares Task–Commit/Issue/PR e Requirement–Task quando ambos existem no mesmo projeto e não há conflito.
- Origem legada nunca é apagada.
- Apply é transacional para campos/joins E8; backfill de memberships reutiliza a rotina idempotente E6.
- `--apply` exige banco marcado como teste ou confirmação explícita de desenvolvimento/produção.

## Critérios para contract

Dry-run após apply deve apresentar zero pendências; conflitos precisam de decisão manual; checksums e contagens dos vínculos devem ser equivalentes; runtime/testes não podem importar o model/campo removido; retenção/auditoria devem permanecer verdes. O plano detalhado está em `E8_CONTRACT_PLAN.md`.
