# Integração de main em max-dev — 21/10/2026

## Estado integrado

- PR #25: max-dev para main, aberta em draft.
- Primeiro pai: `d0da3c85a08b14a8884622aa214cc0dcf66ecade` (max-dev).
- Segundo pai: `a828bb3ccda8d842a9f75909f29f3dc45d3476f5` (main, merge da PR #27).
- Clone isolado; nenhuma alteração local preexistente foi usada ou descartada.
- Merge normal, preservando os dois históricos; publicação sem force push.

## Conflitos e resolução

| Arquivo | Resolução |
| --- | --- |
| backend/package-lock.json | Lock de main: preserva PDF e Vite 8.3.4, posterior à correção de segurança de max-dev. |
| frontend/package-lock.json | Lock de main: Vite 8.3.4, Rolldown 1.2.14 e follow-redirects 1.16.1. |
| docs/api/API_CONTRACTS.md | Mantidos contratos standalone, painel, serverNow e relatórios/PDF; explicitada a retenção da reserva após timeout. |
| docs/design/UI_SURFACE_INVENTORY.md | Mantidas surfaces de painel fixado e relatórios; censo recalculado: 254 surfaces. Evidência histórica de inspeção não promovida. |
| docs/design/validation/VISUAL_VALIDATION_LOG.md | Mantidos os históricos de ambas as branches e suas limitações de inspeção. |

As mesclagens automáticas do schema, das três fixtures históricas S2-03, da matriz de
autorização e do teste da navegação foram revisadas. O schema mantém lifecycleBasis e
ProjectReport/ProjectReportPerson. A navegação inclui Relatórios e mantém o mock da
preferência do painel. As fixtures continuam declarando cobertura histórica.

O módulo de relatórios e sua regressão de cancelamento permanecem idênticos a main:
a carência apenas registra aviso; heartbeat, reserva e slot ficam ocupados até a
consulta terminar realmente. Os recursos de max-dev permanecem: execução sem GitHub,
painel fixado, responsividade, isolamento/otimização de testes, relógio baseado em
serverNow/âncora monotônica e remoção dos dois textos vazios de defeitos.

## Validação local antes de publicar

Node 22.23.3; MySQL local descartável 26.7.0 na porta 33306. A CI usa MySQL 8.4.8,
portanto a execução local não substitui essa validação remota.

- Instalações limpas com npm ci nos dois pacotes, schema Prisma válido e Client gerado.
- Backend unitário: **1.684 testes / 141 arquivos aprovados**, sem skips (30,12 s).
- Frontend completo: **1.842 testes / 148 arquivos aprovados**, sem skips (46,72 s).
- Backend afetado com MySQL: **222 testes / 7 arquivos aprovados**, sem skips (47,52 s).
  Arquivos: API reports, projects-without-github, indicators-p9; integração reports,
  s203-bateria, s203-correcoes, s203-github-event-dispatch.
- 90 testes dos scripts de inventário, workflow e política de audit aprovados, sem skips.
- Lint e formatação dos dois pacotes, arquitetura, secret scan, inventário, diff check
  e build frontend aprovados. Build mantém avisos de bundle/diretivas/importação dinâmica.
- Política de audit backend/frontend aprovada: zero high/critical, sem novas exceções.

A primeira tentativa de testes usou Node 26 e variáveis incompletas, resultando em
falhas de ambiente; foi substituída pelas execuções completas acima com Node 22 e
configuração de testes. A primeira inicialização MySQL no sandbox falhou; a instância
isolada fora dessa restrição inicializou e executou os 222 testes.

## CI e limites

A CI do commit publicado deve ser consultada na PR:
https://github.com/iYoNuttxD/Traceflow/pull/25/checks

Este registro documenta a validação local anterior ao push. A suíte completa backend,
a cobertura e os validadores históricos com MySQL 8.4.8 dependem da CI remota; nenhum
teste pulado ou indisponível é considerado aprovado. Nenhuma inspeção visual nova foi
realizada. A PR permanece draft; não houve merge em main, deploy ou mudança de proteções.
