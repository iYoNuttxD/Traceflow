# PR23-FIX-02 — evidência visual própria

Capturas originais realizadas em **05/10/2026**, Chrome autenticado, aplicação e API
locais reais (`localhost:5173` / `localhost:3001`). Baseline `daniel-dev` @
`3cc88159339008fc5cdfc0dfe19e5b01b6b60d85`; UI com a correção desta rodada no working
tree. Não são imagens da P8.4 nem reconstrução de sua aprovação histórica.

Project 2 existente de homologação; período 01–30/09/2026, America/Sao_Paulo,
Sprint ativa automática. Project 13 existente foi somente consultado para NO_DATA.
Sem seed, alteração de domínio ou sincronização externa. Sidebar recolhida nas
capturas; tema Escuro, sidebar expandida e viewport original restaurados ao final.

## Matriz da ajuda expandida

| Ajuda | 1440 Light | 1440 Dark | 390 Light | 390 Dark |
| --- | --- | --- | --- | --- |
| Geral / Progresso | [imagem](general-1440-light-expanded.jpg) | [imagem](general-1440-dark-expanded.jpg) | [imagem](general-390-light-expanded.jpg) | [imagem](general-390-dark-expanded.jpg) |
| GitHub / Commits | [imagem](github-1440-light-expanded.jpg) | [imagem](github-1440-dark-expanded.jpg) | [imagem](github-390-light-expanded.jpg) | [imagem](github-390-dark-expanded.jpg) |
| Fluxo / Cycle Time | [imagem](flow-1440-light-expanded.jpg) | [imagem](flow-1440-dark-expanded.jpg) | [imagem](flow-390-light-expanded.jpg) | [imagem](flow-390-dark-expanded.jpg) |
| Sprint / Burndown | [imagem](sprint-1440-light-expanded.jpg) | [imagem](sprint-1440-dark-expanded.jpg) | [imagem](sprint-390-light-expanded.jpg) | [imagem](sprint-390-dark-expanded.jpg) |
| Qualidade / Sucesso | [imagem](quality-1440-light-expanded.jpg) | [imagem](quality-1440-dark-expanded.jpg) | [imagem](quality-390-light-expanded.jpg) | [imagem](quality-390-dark-expanded.jpg) |
| Rastreabilidade / Implementação | [imagem](traceability-1440-light-expanded.jpg) | [imagem](traceability-1440-dark-expanded.jpg) | [imagem](traceability-390-light-expanded.jpg) | [imagem](traceability-390-dark-expanded.jpg) |

Alturas de viewport: 900px desktop, 844px mobile. O help possui rolagem interna;
capturas expandidas mostram o corte/frescor após rolar, podendo não mostrar seu
cabeçalho simultaneamente. Capturas fechadas registram a camada comercial inicial:
[1440 Light](general-1440-light-closed.jpg), [1440 Dark](general-1440-dark-closed.jpg),
[390 Light](general-390-light-closed.jpg), [390 Dark](general-390-dark-closed.jpg).

## Tablet e estados

768×1024 Light: [GitHub](github-768-light-expanded.jpg),
[Fluxo](flow-768-light-expanded.jpg),
[NO_DATA / Project 13](no-data-project13-768-light.jpg),
[UNAVAILABLE / GitHub sem período](unavailable-period-768-light.jpg).
PARTIAL foi observado em Cycle Time e Burndown. STALE foi coberto por teste;
não havia fonte desatualizada no recorte real e não se fabricou esse estado.

[matrix.json](matrix.json) registra textos e geometria observados durante a inspeção;
horários locais podem diferir entre visitas/capturas porque a consulta recalcula
`asOf`. A imagem é autoridade do frame capturado; a matriz complementa essa prova.
[console.json](console.json) registra zero warnings/errors capturados na sessão.

## Escopo e limites

Validação da ajuda RF55: camadas comercial/auditável, fontes e clocks legíveis,
disclosure fechado por padrão, target 44px, teclado e limites do viewport.
Não homologa toda a aplicação, touch físico, leitor de tela, outros browsers ou CI
remota. Nenhuma imagem foi fabricada ou atribuída retroativamente à P8.4.

Arquivos entregues no working tree para revisão/versionamento; sem commit/push.
Autoridade do resultado e limites: [Visual Validation Log](../../VISUAL_VALIDATION_LOG.md)
e [relatório FIX-02](../../../../deliveries/PR23_FIX_02_RF55_TRANSPARENCY_EVIDENCE_ALIGNMENT_REPORT.md).
