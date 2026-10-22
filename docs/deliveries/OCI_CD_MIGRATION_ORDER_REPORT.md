# CD OCI — comparação de migrations e promoção controlada

21/10/2026, 21h05 America/Sao_Paulo. **Resultado: BLOCKED para promoção; produção preservada.**

| Item | Resultado e evidência |
| --- | --- |
| Causa de LIVE_MIGRATION_CHAIN | **Confirmada: somente ordenação.** SELECT com a credencial existente de leitura/TLS VERIFY_IDENTITY encontrou 68 registros aplicados e únicos, zero incompletos/rollback, zero ausências, adicionais ou checksums diferentes. `utf8mb4_unicode_ci` inverte as posições 53/54 em relação ao Python: `20260910120000_s1_06_preserve_legacy_effort` e `20260910120000_s109_requirement_traceability` |
| Correção | **PASS.** Ordena ambas as listas pelo nome e mantém igualdade exata, cardinalidade e recusa explícita de duplicidades em ambos os lados. [PR #30](https://github.com/iYoNuttxD/Traceflow/pull/30), commit `65a6850825a7f6fdccef2334012ea7210e4e44ff`, merge `571d2fde635269b3ad3c9d145f1df338c26ae749`. Apenas receptor/testes; aplicação, SQL, schema, migrations e workflow não alterados |
| Testes | **PASS.** 26 testes direcionados de CD, incluindo os cinco casos solicitados; a observação real de 68 registros também passou no novo comparador. Oito testes do receptor em Oracle Linux 9.8/aarch64/Python 3.9.25 como opc, em memória/sem banco. [CI completo exigido pelo gate](https://github.com/iYoNuttxD/Traceflow/actions/runs/39694367889) e [validação ARM64](https://github.com/iYoNuttxD/Traceflow/actions/runs/39694367883) verdes. Nenhuma regressão geral disparada manualmente |
| Instalação | **PASS.** Somente receiver.py atualizado atomicamente, SHA-256 `1b682543bcbc357ea35f18d9b457c95dfceb4bb760ac2497e5b76aa6812c766e`; cópia anterior e extração recusada preservadas. Trust policy e 17 arquivos operacionais inalterados. Exceção de revisão independente explicitamente autorizada após checks verdes; aprovação humana de production mantida e registrada |
| Artefato | Mesmo candidato committed `b9c1beb9f6ded49ce9257d346c086a8893f700c9`, 3.228 arquivos/68 migrations, pacote `4a7dbc5f522331aa242ed9300cbdddc7a1d1f0903fb1a80d58fff40a2dafd02a`, manifesto `3ed3b0f04d68ba1ad5ae76731b436fd53f657de7d97324222148b685ecac9892`. Build duplo byte-idêntico; nenhuma funcionalidade nova da main incluída |
| Promoção única | **FAIL**, [execução 39695892172](https://github.com/iYoNuttxD/Traceflow/actions/runs/39695892172). O gate de migrations passou; a transação alcançou o teste de Nginx e terminou `COMMAND_NGINX` às 21h02min17s. Build/homologação: 178 s; job production: 301 s incluindo espera pelo timer. Nenhuma segunda promoção |

## Bloqueio comprovado e estado recuperado

`nginx -t` passa fora do sandbox, mas foi reproduzido com falha no contexto
`ProtectSystem=strict`: **Read-only file system** em `/var/log/nginx/error.log`
e `/run/nginx.pid`. Esses caminhos não estão em `ReadWritePaths` da unidade CD.
O diagnóstico usou unidade transitória somente leitura; não alterou configuração,
permissões, sandbox ou serviços de produção. A pendência concreta é compatibilizar
a validação Nginx com um contexto de permissões mínimas adequado, mantendo o isolamento.
Não foi implementada outra correção nem iniciada nova tentativa nesta execução.

O caminho oficial de recuperação restaurou configurações/drop-ins e reiniciou
API/worker na versão anterior. O mesmo teste Nginx bloqueia a conclusão formal
nesse sandbox; **não se declara rollback transacional completo ou CD operacional**.
As verificações independentes às 21h05min38s comprovaram:

- [HTTPS público](https://traceflow.dev) 200 com frontend anterior; API readiness200, MySQL=true, worker ativo/heartbeat14s, monitor sem falhas/zero5xx.
- Seleção efetiva **9bc3dad199566afc6fa43d67abba400665d843ea**; API PID550847, worker PID550856. Os 2.252 arquivos anteriores e 17 arquivos operacionais permanecem íntegros. Nginx/proxy restaurados e válidos fora do sandbox.
- Candidata e listener3002 removidos; credencial temporária systemd removida; SELinux Enforcing. Timers backup/monitor/retenção/CD ativos e habilitados; histórico preservado.
- Backup automático existente `20261021T060033Z-b97cffa3669b4a739e59c44759eb05b1` e readback preservados. Sem nova captura, restore, alteração de schema/migrations ou recurso OCI pago.

[Recibo permanente arquivado automaticamente](https://github.com/iYoNuttxD/Traceflow/releases/tag/oci-cd-39695892172-1): root/público SHA-256 `ba9e45b67728e2f6e305192ff168b47616aeebec940c4f7907bcec41d3c55296`; asset GitHub `14e6ab46560f2560255e440222d7b144ee6af0f4473dc70b6914661ad6fdea2a`. JSON idêntico; o workflow reformata a indentação, por isso os hashes diferem.

**Critérios:** S2-08 PARTIAL (adoção/reconstrução IaC não demonstradas); S2-09 PARTIAL (normalização corrigida, promoção bloqueada no sandbox Nginx; migrations novas em produção e rollback integrado ainda sem comprovação própria); S2-10 preservada. Não marcar capacidade de CD operacional até uma promoção efetivamente concluída.

Evidências sanitizadas locais: `build/oci-cd-migration-fix/MIGRATION_DIAGNOSIS.json`, `MINIMAL_DIFF_REVIEW.json`, `NATIVE_RECEIVER_TESTS.json`, `RECEIVER_UPDATE.json`, `TERMINAL_RESULT.json`, `NGINX_FAILURE_DIAGNOSIS.json` e `FINAL_VALIDATION.json`. Relatório de infraestrutura anterior preservado: [S2-08/S2-09](S2_08_S2_09_OCI_CD_REPORT.md).
