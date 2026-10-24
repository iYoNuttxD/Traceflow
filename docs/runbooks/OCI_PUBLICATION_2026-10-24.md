# Publicação OCI 84 → 86 — 24/10/2026

## Identidade e resultado

- Aplicação publicada: \`04f0653d699532a779f6db562fdf7e317a0921a5\`.
- Baseline substituída: \`706d917b87cb6b6e45a53248a56546a439e031fd\`.
- Correção P2022: PR #36. Preservação estruturada do receptor: PR #37,
  commit \`50b215f7fe818f41d27bd783a8807911b679b648\`.
- [Workflow oficial 40074306672](https://github.com/iYoNuttxD/Traceflow/actions/runs/40074306672):
  SUCCESS; aprovação humana de production realizada pelo operador.
- [Recibo oficial](https://traceflow.dev/deploy-status/40074306672.json):
  SUCCESS às 07:41:55.635823 UTC; SCHEMA_TRANSITION_COMPLETE.
- Plano instalado e consumido:
  \`84434c8896844a7977f999f0c8ce699deebc75f1a1553571d03111f9c1845aee\`.
- Pacote: \`cfd16040dc232f1329cdf975a535528368bed348ba4c95cecfec87c9a2227c24\`.
- Manifesto: \`abd4ac07eac82e2336a2c16fdc3d7bbea7d9217aeee6b349cac16d89b38b1c53\`.

## Migrations e preservação

| Migration adicionada | SHA-256 do SQL |
| --- | --- |
| 20261013170000_manual_test_execution_reference | 46c9e78df830d6138c70d041dfb1ff60269af2aa08849ed2e9253474fdb1d2a7 |
| 20261013171000_requirement_lifecycle_basis | 4b442367cae65529bf5f96b7ca33735155f6cc0add9158bf4d7e050457f4e758 |

A leitura independente após a publicação confirmou 86 migrations concluídas,
checksums iguais ao manifesto, nenhuma incompleta ou duplicada e conexão privada
com TLS. Nenhum SQL das 84 migrations históricas foi alterado.

O receptor preservou os dois requisitos produtivos e as 21 entradas históricas
existentes, verificando 145 chaves estrangeiras. Não havia requisito LOCAL nessa
base; nenhuma entrada histórica nova foi necessária. A reconciliação LOCAL real
foi demonstrada no laboratório populado, não inferida da produção vazia desse caso:
26 requisitos, 25 LOCAL, 25 entradas antigas preservadas e 22 novas esperadas.
As demais 70 tabelas tiveram dados preservados. A exceção permanece vinculada aos
hashes exatos da transição; outras transições continuam estritas.

## Qualidade e homologação

- CI exato [40073319155](https://github.com/iYoNuttxD/Traceflow/actions/runs/40073319155):
  Quality, Backend Tests, Frontend Tests e Supply Chain PASS.
- Dependency Review PASS na CI da PR #37, execução 40073183652;
  não aplicável ao evento push da main.
- Backend: 3.481 testes aprovados; frontend: 1.885. Skips históricos não ampliados.
- 102 testes do contrato CD aprovados, incluindo recusas de corrupção.
- Laboratório real do receptor: banco populado, vazio, falha parcial e falha após DDL;
  migrador com exatamente SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES;
  comparação canônica, histórico append-only, integridade referencial e drift zero.
- ARM64 nativo Oracle Linux 9.8: duas construções byte-idênticas, Node 22.23.2,
  Prisma 6.12.0, MySQL isolado 8.4.8, API e worker/quatro jobs operacionais.
- O ensaio MySQL isolado não é apresentado como execução antecipada no HeatWave.

## Backup, restauração e encerramento

Backup cifrado e readback externo verificados:
\`20261024T060032Z-60a8128155f14537a30728b849590083\`.

- Cipher SHA-256: \`e1dfe92eefaa514c5637812c3e470d0b337fae7021b3bf475fbe90e7c59b3638\`.
- Manifesto SHA-256: \`7ef5b7bfad8fccb3e283b45c751b9c599ec673aa5d4cf7277fa4f78f90d9a958\`.
- Restore do mesmo conjunto concluído às 06:12:05 UTC, em volume local cifrado:
  74 tabelas, 84 migrations, 145 FKs, hashes dos dados, arquivos persistentes e
  configurações iguais. Estruturas equivalentes; diferença literal de DDL limitada
  ao charset utf8mb4 comprovadamente redundante.
- Fonte MySQL 26.7.0-cloud; restore isolado 26.7.0. Destino descartável encerrado.
- Custódia encerrada às 08:16:32 UTC: conta migradora bloqueada, zero sessões,
  credencial temporária cifrada removida.
- Verificação às 08:16 UTC: API/HTTPS 200, Nginx ativo, worker único, quatro jobs,
  nenhum 5xx ou falha de monitoramento, timers de backup/monitoramento/retenção ativos,
  sem guard de schema ou unidade candidata. API e worker sem reinícios.

## Repositório e limites

As branches remotas foram reduzidas a main, daniel, joao, gt e max, com igualdade
exata de HEAD. Após incorporar este registro documental, as quatro branches de
desenvolvimento devem ser sincronizadas novamente com a main usando compare-and-swap.
A revisão documental posterior não altera o SHA da aplicação já publicada.

O bundle completo anterior à limpeza foi verificado e restaurado para conferência:
SHA-256 \`421757a83d5e3f9dbf9ccc5689cbcb2efaa575826e01c9f0fd91dd41bab468f9\`.
Arquivo externo: TraceFlowArchives/cd-preservation-20261024T065054Z/before-final-cleanup.bundle.
Manifesto preserva SHAs, commits exclusivos, PRs e releases. Tags/releases anteriores
e worktrees com alterações locais foram preservados.

O ruleset Protect main foi desativado externamente durante a revisão da PR #37.
Não foi reativado por esta operação, conforme instrução posterior do operador.
A aprovação humana de production e os controles OIDC/receptor foram mantidos.
Portanto, não se declara que a main esteja atualmente protegida por esse ruleset.

A validação produtiva combina saúde operacional e inspeção autenticada sem alterar
dados de negócio. Casos destrutivos, projetos LOCAL e novas execuções MANUAL foram
validados em laboratório/CI; não foram criados dados fictícios em produção para
simular cobertura. A Sprint 3 e a validação com participantes permanecem separadas.
