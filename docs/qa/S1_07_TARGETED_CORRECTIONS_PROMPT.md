# TRACEFLOW — S1-07 TARGETED CORRECTIONS

Corrigir somente o finding reproduzido **QA-S107-001** de
[S1_07_FINAL_INTEGRATED_QA.md](S1_07_FINAL_INTEGRATED_QA.md).

## Contexto e resultado reproduzido

Baseline da QA: branch `daniel-dev`, HEAD
`13582d644b7df68caa1f945d2a557d5bc974563d`.

Sem `TEST_EVIDENCE_STORAGE_DIR`, a suíte focada backend teve **114 PASS / 6 FAIL**.
O runtime de teste usou o fallback `backend/.data/test-evidence`, mas a suíte de
API passou a variável indefinida para `realpath`/`readdir` no cleanup/verificação.
Os erros foram `TypeError ... Received undefined`. Dois lotes iniciais deixaram
54 arquivos artificiais no diretório de desenvolvimento; a QA recolheu somente
esses arquivos e preservou as duas evidências preexistentes por hash.

Com variável definida apenas no processo de QA para um diretório temporário
exclusivo, os 120 testes focados, 434 testes de integração e cinco rodadas de
coverage (1068 PASS + 5 skips legados cada) passaram. Isso não corrige o bootstrap
canônico. CI remoto não foi executado nesta QA.

## Escopo autorizado para a correção

Tornar o armazenamento de evidências das suites backend **seguro, isolado e
consistente antes dos imports** da aplicação/storage/Prisma. O fluxo canônico
local e o job de CI devem usar a mesma política explícita de teste, sem depender
de configuração manual não estabelecida pelo repositório.

Escolher a menor alteração compatível com a arquitetura atual. Examinar primeiro
o bootstrap/helper/configuração de testes e o cleanup da suíte de API. Caso seja
necessário tocar o fluxo de configuração do storage, limitar a mudança à separação
do ambiente de teste; não alterar silenciosamente o contrato de produção.

Pontos de partida:

- `backend/test/api/test-cases-s1-07.test.js`, especialmente linhas 143, 177, 231 e 289
  no baseline.
- Helpers de ambiente/bootstrap de testes e configuração Vitest.
- `backend/src/modules/testCases/storage/local-test-evidence.storage.js` para
  entender a resolução do root/fallback.
- `.github/workflows/ci.yml` para verificar a configuração efetiva do job backend.

## Critérios de aceite

1. Sem diretório configurado manualmente, o fluxo canônico de testes estabelece
   um root exclusivo de teste antes de qualquer upload/import dependente. Não
   grava evidências no fallback de desenvolvimento.
2. Aplicação sob teste, assertions e cleanup resolvem o mesmo root validado.
   Variável ausente não chega indefinida às APIs de filesystem.
3. Cleanup opera apenas em arquivos/diretórios pertencentes àquela execução de
   testes. Preserva dados preexistentes e não aceita apontar uma limpeza ampla
   para storage de desenvolvimento/produção ou para diretório arbitrário.
4. A regressão exercita a configuração ausente e a preservação de arquivos
   sentinela fora do root pertencente à execução. Não reproduzir a falha contra
   evidências reais para provar isolamento.
5. Manter compensação de arquivos em falha de DB/upload e comportamento das
   quotas. Nenhuma assertion pode ser relaxada ou trocada por skip.
6. Demonstrar suíte focada backend, integração e coverage repetível no fluxo
   canônico corrigido. Registrar quantidades, skips, storage isolado e runtime.
   Usar TEST DB exclusivo distinto do desenvolvimento. Conferir lint/format e
   gates exigidos pelas instruções atuais do repositório para os arquivos tocados.
7. Conferir a configuração de CI; reportar CI remoto separadamente de execução
   local. Não anunciar MySQL 8.4.8 validado com teste executado apenas em 9.7.1.

## Limites

Antes de editar, capturar branch, HEAD, working tree e diff; preservar alterações
locais e revalidar o finding se o HEAD mudou. Não tratar este prompt como autorização
para commit, push, merge, rebase, reset, clean ou edição de DB real.

Não alterar schema/migrations, regras de TestCase/TestExecution, versionamento,
resultados, autorização, histórico, API pública, CSS, layout ou frontend. Não
iniciar S1-08/S1-09. Não criar um trabalho geral de refatoração ou Code Review.

Não transformar OBS-01 (falha inicial de timing frontend, não reproduzida na
execução serial) em correção de produto sem evidência nova. Não adicionar retry,
timeout arbitrário ou workaround de UI para essa observação.

Entregar diff mínimo, explicação da causa, evidência de isolamento/preservação e
resultados dos gates. Preservar o relatório de QA original; documentar a correção
e sua validação em registro separado. Encerramento do S1-07 depende da validação
da correção, não da existência deste prompt.
