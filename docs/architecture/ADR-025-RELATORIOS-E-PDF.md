# ADR-025 — Relatórios do projeto e exportação em PDF

- **Status:** aceito para S2-06 (RF37) e S2-07 (RF57).
- **Data:** 15/10/2026.
- **Responsáveis:** equipe TraceFlow (decisão de biblioteca discutida com Daniel).

## Contexto

O RF37 pede relatórios do projeto com planejamento, rastreabilidade e indicadores, e o RF57
pede a exportação desse relatório em PDF. Os critérios das tasks exigem que os números coincidam
com as APIs e o painel para o mesmo recorte, que falhas nunca resultem em relatório marcado como
pronto, que o processamento seja seguro para projetos grandes e que o PDF identifique projeto,
período, geração e página, sem cortar tabelas ou gráficos. O TraceFlow será hospedado numa VM
da OCI de capacidade limitada.

## Alternativas consideradas

| Tema | Alternativa | Por que não |
| --- | --- | --- |
| Conteúdo | Recalcular os números num módulo próprio de relatórios | Duas fórmulas para o mesmo indicador divergem com o tempo |
| Conteúdo | Guardar só o recorte e montar o relatório a cada leitura | O relatório mudaria a cada alteração do projeto; não seria um retrato |
| Geração | Gerar na própria requisição HTTP | Oito visões do painel, a agenda e toda a rastreabilidade podem passar do tempo de uma requisição |
| Pessoas | Guardar nomes dentro do snapshot | Anonimização exigiria reescrever JSONs; nome atual ou antigo ficaria espalhado |
| Pessoas | Guardar só IDs e mostrar o nome atual | Trocar o nome da conta mudaria relatórios antigos, abrindo espaço para atribuição indevida |
| PDF | Navegador embutido (Playwright/Chromium) | Mais fiel à tela, mas pesado para a VM da OCI, com binário grande para manter |
| PDF | Gerar e armazenar o arquivo junto do relatório | Duplica dados pessoais em arquivo, exige retenção e limpeza próprias |

## Decisão

**Snapshot a partir dos services de origem (S2-06).** A geração chama os mesmos services usados
pelas abas: `dashboardService.read` para cada visão pública do painel, `sprintService.getSchedule`
e `getSprintProgress` para o planejamento e `requirementProjectionService.list` (todas as páginas)
para a rastreabilidade. O resultado vira um JSON versionado (`schemaVersion: 1`) em
`ProjectReport.snapshot`. Aviso `SOURCE_UNAVAILABLE` em qualquer visão faz a geração inteira
falhar (`REPORT_SOURCE_UNAVAILABLE`): no painel isso é um estado da tela, mas num retrato
congelado seria um relatório incompleto marcado como pronto.

**Segundo plano com reserva por projeto.** Mesmo modelo da sincronização manual do GitHub
(ADR-017): `activeProjectId` único, `setImmediate`, claim `QUEUED → RUNNING`, heartbeat de 30 s,
lease de 5 min e prazo de montagem de 4 min. Prazo vencido ou lease perdida cancelam a composição:
nenhuma consulta nova começa e a reserva só é liberada quando a consulta em andamento termina
(carência de 30 s). No máximo duas gerações executam por processo. A conclusão confere a lease e
grava snapshot, pessoas e liberação da reserva na mesma transação. Tetos explícitos (100 Sprints, 2.000
requisitos, 16 MiB de snapshot) fazem a geração falhar com código próprio em vez de recortar.

**Nomes congelados à parte.** O snapshot passa por `stripPeople`: onde há `userId`, nome, username,
e-mail e avatar são removidos. `ProjectReportPerson` guarda nome e username de cada pessoa no
momento da geração. A apresentação (tela e PDF) recoloca esses nomes. A anonimização (LGPD) é a
única operação que altera esse registro, trocando-o pelos valores neutros da conta anonimizada.
Os nomes são lidos com a linha de `User` travada na mesma transação que os grava, para uma
anonimização concorrente nunca deixar para trás um nome anterior.

**PDF sob demanda com pdfmake (S2-07).** O PDF é montado a partir do snapshot persistido a cada
download, sem arquivo armazenado. pdfmake usa layout declarativo (tabelas com cabeçalho
repetido, linhas indivisíveis, SVG, cabeçalho e rodapé por página, sumário) e fontes Roboto com
acentuação. O vocabulário do PDF é uma cópia dos rótulos do frontend, protegida por um teste de
paridade que importa os módulos do frontend. Como o layout do pdfmake é síncrono (cerca de 1,2 s
de CPU no teto de volume), a montagem roda numa worker thread com heap de 512 MB, prazo de 30 s e
no máximo duas simultâneas por processo (`503 REPORT_PDF_BUSY` acima disso). Políticas do pdfmake
negam qualquer URL e só permitem ler as quatro fontes do próprio pacote. O pdfmake descarta sem
erro o que passa da primeira página de um bloco indivisível; por isso cada linha indivisível tem
altura estimada abaixo de meia página, e texto maior segue em linhas de continuação.

## Consequências positivas

- Os números do relatório são os do painel por construção, e os testes de API comparam cada
  indicador, a rastreabilidade e a evolução da Sprint com as APIs de origem.
- O relatório é reproduzível: o mesmo relatório sempre gera o mesmo conteúdo, inclusive no PDF.
- Nenhum PDF fica guardado: não há retenção nem limpeza de arquivos, e a anonimização vale também
  para todo PDF baixado depois dela.
- A API continua respondendo durante a montagem de PDFs grandes.

## Consequências negativas e limites

- O snapshot ocupa espaço no MySQL (até 16 MiB por relatório) durante o ciclo do projeto.
- Rótulos novos no frontend precisam ser copiados para `report-pdf.labels.js`; o teste de
  paridade falha até isso acontecer.
- A execução em `setImmediate` vive no processo da API: um restart durante a geração deixa o
  registro RUNNING até a lease expirar, quando a próxima leitura o encerra como FAILED.
- O limite de duas montagens simultâneas é por processo; várias réplicas somam capacidade.
- PDFs já baixados ficam fora do controle do sistema, inclusive depois de uma anonimização.

## Impactos de segurança e privacidade

Gerar exige MEMBER+; ler e baixar, qualquer membro ativo (inclusive VIEWER). Projeto excluído,
não membro e relatório de outro projeto recebem o mesmo 404 opaco. Pedido, conclusão e download
são auditados (`REPORT_REQUESTED`, `REPORT_GENERATED`, `REPORT_PDF_EXPORTED`); sem o registro do
download, o arquivo não é entregue. Gerações FAILED são removidas após 180 dias pelo
`privacy:retention`. Detalhes em [API_CONTRACTS](../api/API_CONTRACTS.md),
[AUTHORIZATION_MATRIX](../security/AUTHORIZATION_MATRIX.md),
[DATA_RETENTION_POLICY](../privacy/DATA_RETENTION_POLICY.md) e
[DEPENDENCY_RISK_REGISTER](../security/DEPENDENCY_RISK_REGISTER.md).

## Numeração

Os números ADR-015 a ADR-024 já existem no `main`; este registro usa o próximo número livre.
