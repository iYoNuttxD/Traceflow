# S1-08 — Ciclo de dados para homologação

Em 2026-09-08, após autorização explícita, foram criados dados sintéticos
persistidos no banco local `traceflow` (localhost), no projeto 2,
TRACEFLOW QA GitHub 2026-08-10. Os títulos usam o prefixo `QA S1-08 ·`.
As mutações passaram pelos serviços de domínio; a conferência final leu o banco.

## Inventário

| Entidade | Quantidade | IDs |
| --- | ---: | --- |
| Requisitos | 2 | 3, 4 |
| Marcos | 2 | 3, 4 |
| Sprints | 2 | 14, 15 |
| Tarefas | 8 | 10–17 |
| Casos de teste | 4 | 2–5, versão 1 |
| Execuções | 7 | 2–8 |
| Defeitos | 4 | 1–4 |

As sprints permanecem planejadas: detecção/análise de 13 a 19 de setembro;
correção/validação de 20 a 26 de setembro. As tarefas de origem pertencem à
sprint 14 e as correções à sprint 15. Marcos e requisitos estão associados.
Todas as tarefas têm responsável e referência à PR local 44 (PR #8 já importada).
Essa referência serve ao cenário controlado: os resultados sintéticos não
constituem uma avaliação do código dessa PR. Não houve mutação no GitHub.

## Cenários disponíveis

| Defeito | Estado persistido | Caso / detecção | Origem | Correções |
| --- | --- | --- | --- | --- |
| DEF-1 | VALIDADO, ciclo 2 | TC-2 / EXEC-2 | TASK-10 | TASK-11 e TASK-12 concluídas |
| DEF-2 | ABERTO | TC-3 / EXEC-6 | TASK-13 | Nenhuma |
| DEF-3 | EM_CORRECAO | TC-4 / EXEC-7 | TASK-14 | TASK-15 em andamento |
| DEF-4 | AGUARDANDO_RETESTE | TC-5 / EXEC-8 | TASK-16 | TASK-17 concluída |

DEF-1 percorreu detecção FAIL, primeira correção, reteste BLOCKED (EXEC-3),
reteste FAIL (EXEC-4), reabertura no ciclo 2, segunda correção e reteste PASS
(EXEC-5). Possui 14 eventos persistidos de histórico e revisão 10. TASK-10
também foi concluída. DEF-4 ficou disponível para exercício manual de reteste.

## Evidência e limites

Leitura com assertions concluída às 21:43:42 UTC: contagens, estados, ciclos,
retestes, histórico e vínculos de tarefas confirmados. Evidência operacional
temporária: `/private/tmp/traceflow-s108-cycle/verified.json`; manifesto de criação:
`/private/tmp/traceflow-s108-cycle/records.json`.

No Chrome autenticado foram observados os quatro cards e indicadores, detalhes
de DEF-1 e DEF-4 e abertura do wizard de reteste de DEF-4 com TC-5 v1. Smoke
desktop Dark, sem submissão adicional do wizard. Isso remove o bloqueio por
ausência de dados, mas não substitui a matriz visual completa de viewports/temas.

O uso dos dados revelou classes inexistentes no cabeçalho dos cards e em botões
de navegação. Foram substituídas pelas classes canônicas já existentes.
Após os ajustes: 175 testes focados em Defects/TestCases aprovados, lint e build
aprovados. Não houve nova execução de CI remoto, commit, push ou migração.

Acesso: <http://localhost:5173/projects/2/defects>.
