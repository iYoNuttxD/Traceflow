# OCI-DEPLOY-05 — Immutable Releases, Migrations & Rollback

Data: 2026-10-14. Escopo: implementação e validação local, sem deploy OCI.
Evidências: [qualidade](evidence/oci-deploy-05/quality-gates.json),
[Linux ARM64](evidence/oci-deploy-05/linux-runtime.json),
[artefato](evidence/oci-deploy-05/artifact.json) e
[preservação/fontes](evidence/oci-deploy-05/source-sha256.json).
Runbooks: [releases](../runbooks/OCI_RELEASE_DEPLOYMENT.md) e
[migrations](../runbooks/OCI_MIGRATIONS.md).

## 1. Resumo executivo

Implementados empacotamento ARM64 determinístico, par runtime/admin, manifestos, checksums,
staging, ativação supervisionada, smoke, migration job separado, recuperação, rollback e prune.
Dois builds independentes do candidato final produziram descritor, arquivos tar e manifestos
com SHA-256 idênticos. O mesmo candidato foi extraído, ativado e revertido em Oracle Linux
9.8 aarch64 com Nginx, systemd, SELinux Enforcing e MySQL 8.4.8 descartável.

API, worker, frontend e storage foram exercitados de verdade no laboratório. A classificação
local não homologa HeatWave gerenciado nem autoriza produção. O artefato é explicitamente
candidate porque as receitas desta entrega não foram commitadas, conforme a restrição do usuário.

## 2. Baseline

Branch daniel-dev; HEAD completo `3e52d69c4ac5abf17881d185284fe1b1afb83398`.
O HEAD real já inclui a OCI-04; difere do HEAD histórico 19922ae informado na solicitação.
Working tree inicialmente limpo, confirmado antes da implementação. Os 1388 arquivos rastreados
foram inventariados; somente README.md recebe cinco linhas adicionais. Backend, frontend,
lockfiles, schema, 67 migrations, CI, OCI-02/03/04 e documentação acadêmica permanecem intactos.
Nenhum arquivo preexistente foi descartado. Sem commit, push, merge, reset, clean, stash ou PR.

## 3. Arquivos implementados

| Entradas existentes preservadas | Arquivo novo | Justificativa/impacto | Risco controlado e aceite |
| --- | --- | --- | --- |
| backend/frontend package e lockfiles | scripts/package-release.mjs; scripts/package_release.py | Exportação de commit e build isolado | ARM64 obrigatório; dois builds idênticos; sem instalação no destino |
| schema/migrations e assets existentes | deploy/lib/release_contract.py | Contrato único de inventário, tar e locks | Travessia/links/extras/tampering recusados; testes negativos |
| Prisma Client/Argon2/entry points | deploy/scripts/artifact-smoke.mjs | Prova nativa do pacote extraído | Engine inválido falha; runtime sem Prisma CLI funciona |
| Client/schema históricos | deploy/scripts/release-database.mjs | Identidade, grants, lock, snapshot e CLI administrativa | Alvo incorreto/DDL insuficiente/drift/falha parcial recusados |
| Diretórios e unidades OCI-04 | deploy/scripts/release.py | Ciclo stage/activate/rollback/recover/migrate/smoke/prune | Journal, aprovação específica, smoke real e recuperação após reboot |
| Duas unidades OCI-04, sem alteração | deploy/systemd/traceflow-release-guard.conf | Drop-in de startup conservador | Reboot interrompido e pós-migration bloqueiam startup sem ativação |
| Contratos OCI-03/04 | deploy/tests/test_releases.py | 32 testes de filesystem/falhas | Sem serviço ou banco real; preservação e recusas verificadas |
| Fixtures/serviços OCI-04 | deploy/tests/run-release-linux.py | Harness exclusivo de VM descartável | Token/hostname/virtualização/ownership; 46 verificações registradas |
| Runbooks anteriores | OCI_RELEASE_DEPLOYMENT.md; OCI_MIGRATIONS.md | Procedimentos operacionais e limitações | 29 e 20 tópicos solicitados; comandos correspondem ao CLI |
| Evidências anteriores | Este relatório e evidence/oci-deploy-05/*.json | Rastreabilidade da entrega | Somente metadados sanitizados, sem credenciais/dumps |

README.md foi o único arquivo rastreado modificado, para links dos novos procedimentos.
São 16 arquivos novos: nove de implementação/testes, três documentos e quatro evidências JSON.
Arquivos tar grandes e node_modules ficam fora do repositório.

## 4. Processo de build

Exportação usa git show do commit completo e allowlist, mais receitas candidatas identificadas
por recipeSha256. A fonte é autenticada pelo digest aprovado de source.json.
Builder nativo: Node 22.23.2, npm 10.9.8, Python 3.9 e OpenSSL 3.5.8.
HOME/cache/config npm separados, sem herdar credenciais. npm ci nos dois componentes,
Prisma validate/generate, Vite build /api, bundle administrativo, prune omit=dev e smoke final.

Prisma embute caminhos absolutos de geração; a reproducibilidade usa workspace exclusivo
estável derivado do build ID, sem editar o client gerado. Tar/gzip normalizam ordem,
owners e timestamp. Epoch/build ID são inputs registrados. Repetir com os mesmos inputs
e toolchain produziu os mesmos bytes; não se promete igualdade entre toolchains diferentes.

## 5. Compatibilidade ARM64

Comprovados Linux aarch64, Oracle Linux 9.8, Node 22.23.2, Prisma Client/CLI 6.12.0,
engine linux-arm64-openssl-3.0.x e Argon2 glibc ARM64. O pacote extraído iniciou API e worker.
Dependências de outras plataformas do Argon2 foram removidas do runtime.
Engine propositalmente corrompido gerou falha explícita de smoke.

A VM era local VZ ARM64, 2 CPUs/8 GiB, sem mounts de host, agent forwarding ou Rosetta.
Imagem Oracle e Node conferidos por SHA-256; MySQL 8.4.8 também teve assinatura oficial
verificada. Identidades públicas estão na evidência do artefato. Não era a VM OCI existente.

## 6. Artefatos

Release ID:
`20261014T225322Z-3e52d69c4ac5abf17881d185284fe1b1afb83398-feafe1d76104`.

- runtime.tar.gz: 37.344.909 bytes; 2088 arquivos inventariados.
- admin.tar.gz: 85.816.920 bytes; 4053 arquivos inventariados.
- release.json: descritor externo com hashes dos dois tars e manifestos.
- sourceState: candidate; produção/staging recusam esse estado.
- Cópia local verificada: `/private/tmp/tf05-0o6wkvjh/artifacts/<releaseId>/`.

Os artefatos temporários são para revisão local e podem ser removidos pelo sistema no futuro.
A futura promoção exige receitas revisadas/commitadas, novo build aprovado e retenção durável.
Nenhum pacote foi publicado ou enviado à OCI.

## 7. Manifesto

Manifestos registram commit completo, build ID/UTC, toolchain, plataforma, sourceState,
sourceSha256, recipeSha256, contrato Vite, checks de build/smoke, cadeia SQL e arquivos
com tamanho, modo e hash. Um manifesto pertence ao runtime e outro ao admin.
Fonte final: `398a554baa4a3b49d4c84f5ecb00953e277946f2311768ca3e06e3d78ea7c0c1`.
Receita: `062811ac57f20bc8dc5377ed9fde7e34574e82ba0565a91f71de2efb466649fc`.

A identidade do commit descreve a aplicação exportada; o hash separado da receita deixa claro
que os scripts novos ainda são candidatos. Não há alegação de que foram commitados nesse HEAD.

## 8. Checksums

| Item | SHA-256 |
| --- | --- |
| release.json | 764d84fb22bc5fc9224a9fd651d20e8219044e9d56b6fdbc5477b94c5c8f903f |
| runtime.tar.gz | 39272c26dac9136b69c130362b5f73d5a4c4d2c308d8daa5f539ba0ddf884650 |
| admin.tar.gz | 270db19e2dbfb65ff1c8b44263c991df2900a97081c6812bb5107b7ae9eab6c7 |
| manifesto runtime | 7974d2421f02dc1e951e8168a56c1677f54d61f65a792e36d488ec9d01f7b683 |
| manifesto admin | 688a928c9c5e06d5cbcc49bffcc7b67a5e9941572c43d2720d3da50aeb3fa1dc |

A comparação dos dois builds e a cópia de volta ao host verificaram esses valores.
SHA-256 depende de um digest esperado recebido por canal confiável; não é assinatura
nem comprova, sozinho, a identidade do publicador.

## 9. Staging

Cópia privada, dupla verificação, extração validada, rename para diretórios imutáveis e recibo
de catálogo por último. Stage preserva current e serviços. Mesmo ID nunca é sobrescrito.
Traversal, links, duplicatas, tipos especiais, diretórios graváveis, conteúdo extra, manifesto
ausente, checksum divergente e envelope excessivo são recusados. SIGKILL real durante stage
deixou órfão não aprovado; nova preparação em workspace próprio funcionou.

## 10. Ativação

Autorização privada específica de operação/release/digest com validade menor que 24h.
Preflight verifica banco/schema, pausa API e worker, confirma escritores locais parados,
troca current da aplicação e da geração pública, sobe API/readiness e depois worker/heartbeat.
A aprovação ocorre depois do smoke completo. Cada link tem rename atômico, mas os dois links
e os serviços formam uma sequência com janela de manutenção, sem zero downtime.

## 11. Systemd

Os únicos serviços são traceflow-api e traceflow-github-worker da OCI-04.
Drop-in adicional consulta journal/boot ID/PID/fase antes da partida; não executa DDL.
Reboot real durante ativação bloqueou startup ambíguo. Recuperação explícita restaurou
API, worker, frontend e heartbeat. Após migration bem-sucedida, startup direto também foi
recusado; activate explícito da mesma release passou. Serviços reais da OCI não foram acessados.

## 12. Frontend

Build Vite relativo a /api, timeout 15000 ms, nenhum segredo público.
Nginx serviu index exato, rota profunda, assets com hash/cache immutable e recusou caminhos
privados/asset inexistente. A/B real com hashes distintos preservou chunks anteriores.
B usou atributo sintético só na fonte de laboratório; nenhum arquivo de UI do repo mudou.
Nenhuma screenshot ou validação visual foi produzida.

## 13. Migrations

Job transitório, bundle admin separado, CLI 6.12.0. Somente migrate deploy; sem seed/reset/import.
As 67 migrations oficiais foram aplicadas em schema vazio isolado e a reexecução foi idempotente.
Nova execução exige fingerprint atual e aprovação. Migração concluída deixa serviços parados
até ativação explícita. A operação não está em hooks npm, startup ou ExecStartPre.

## 14. Segurança do banco

TEST_DATABASE_URL obrigatório, separado de TEST_RUNTIME_DATABASE_URL, sem fallback DEV.
Target exige host/porta/schema/usuários distintos/UUID/versão/datadir/nonce de ownership.
Runtime sem DDL, migration restrita ao próprio schema, sem root/global/GRANT OPTION.
Os controles negaram host OCI antes de conexão, UUID incorreto, grants DDL insuficientes,
backup não aprovado e candidato em modo produção. O bridge não imprime URL/SQL/erro bruto.

## 15. Exclusão mútua

Flock de inode persistente serializa operação local; GET_LOCK MySQL fica na mesma conexão
Prisma e é conferido por IS_USED_LOCK. Duas ativações concorrentes e dois migration jobs foram
recusados conforme esperado. Monitoramento da sessão cerca a CLI administrativa.
São locks cooperativos; não impedem administrador externo privilegiado ou escritor remoto
não participante. Controle desses escritores continua pré-condição operacional.

## 16. Rollback

Rollback de aplicação foi executado com API+worker reais, Nginx, assets e storage.
Falhas de startup/readiness e worker compensaram para A somente após prova de schema.
Queda da API depois da ativação completa também permitiu rollback explícito compatível.
Nenhuma reversão automática de DDL ou restauração de banco foi executada.

## 17. Schema compatibility

Política exact-chain-and-live-drift-v1: hash do schema, nomes/checksums de toda a cadeia,
histórico aplicado, metadata física e fingerprint aprovado, além de migrate diff sem drift.
Não basta comparar quantidade. Drift físico e fingerprint diferente bloquearam operação.

Limitação deliberada: até mudança aditiva entre contratos impede promoção/rollback automático
com esta política. Um upgrade futuro que altere o schema necessita de compatibilidade e
recuperação especificamente homologadas. Não há override genérico nem edição assistida
do journal para transformar uma incompatibilidade em aprovação.

## 18. Prune

Default dry-run, mínimo 7 dias e 3 releases recentes. Protege current, previous, histórico
recente e uso por processos via /proc (cwd/exe/fds/maps). O teste Linux manteve release
referenciada por processo real e removeu apenas candidata antiga elegível; repetição idempotente.
Sem acesso confiável ao inventário, não apaga. Não toca storage/config/backup/órfãos.
Gerações públicas não são apagadas automaticamente: prever monitoramento de disco e retenção
assistida separada. Assets no current têm janela mínima de 7 dias; abas mais antigas devem recarregar.

## 19. Storage

Evidência privada sintética manteve bytes através de staging, A/B, rollback, falhas, reboot
e prune. Não foi embutida no artefato nem servida pelo Nginx. Configuração e dados persistentes
ficam fora de releases. Ao encerrar, a VM descartável e seu datadir sintético foram removidos;
essa limpeza não se confunde com prune de produção.

## 20. Smoke

Provas reais: live/ready 200, bind loopback, PID/cwd/usuário da release, schema/histórico,
exatamente um heartbeat recente, HTTPS, index/deep link, entry assets/cache e privacidade.
API sem sessão em /api/auth/me retorna JSON AUTHENTICATION_REQUIRED/401.
Readiness tem limite de 30s e heartbeat de 45s; não altera shutdown OCI-04.
SMTP/GitHub reais e funcionalidade visual permanecem fora desse smoke.

## 21. Testes de falha

| Caso | Evidência e resultado |
| --- | --- |
| R1 íntegra | Stage + verificação real — PASS |
| R2 checksum | Alteração de bytes/descritor bloqueada — PASS |
| R3 manifesto | Ausência bloqueia verificação/ativação — PASS |
| R4 arquitetura | Manifesto de plataforma incompatível recusado — PASS |
| R5 engine | Engine nativo corrompido falha explicitamente — PASS |
| R6 existente | ID existente não sobrescrito — PASS |
| R7 extração | Falha preserva versão ativa — PASS |
| R8 preflight | Links preservados — PASS |
| R9 ativação | Interrupção entre links exige recuperação explícita — PASS |
| R10 readiness | Startup falho compensado após prova de schema — PASS |
| R11 worker | Falha de partida detectada; compensação verificada — PASS |
| R12 API após ativação | SIGKILL real após sucesso; rollback compatível — PASS |
| R13 schema | Divergência bloqueia promoção/rollback — PASS |
| R14 migration | Falha parcial real com histórico falho e quarentena — PASS |
| R15 migration concorrente | Lock MySQL da segunda conexão recusa — PASS |
| R16 banco incorreto | Host protegido recusado antes de conectar; UUID errado recusado — PASS |
| R17 TEST URL | Ausência recusa execução persistente — PASS |
| R18 storage | Sentinel privado preservado — PASS |
| R19 reboot | Boot ID mudou, guard bloqueou, recover restaurou — PASS |
| R20 duas ativações | Segunda ativação recusada pelo flock — PASS |
| R21 prune | Processo real/current/previous/storage protegidos — PASS |
| R22 assets | Chunks A/B preservados após publicação e rollback — PASS |
| R23 interrupção abrupta | SIGKILL real no stage; parcial não aprovado — PASS |
| R24 permissões | Pais/diretórios inseguros recusados sem chmod amplo — PASS |

32 testes OCI-05 + 21 testes OCI-04 = 53 PASS. O laboratório registrou 46 verificações PASS
em oito execuções, incluindo cleanup. Os cenários de filesystem são simulados; os indicados
como reais usaram kernel, serviços e MySQL da VM.

Falhas intermediárias foram diagnosticadas sem relaxar controles: metadados AppleDouble/owner
na transferência, configuração npm duplicada, CLI retida como peer opcional, strings de exemplo
em documentação de dependências, nome histórico sem sufixo, ordenação de migrations sob collation,
coluna de peer no parser de ss e suposição incorreta de 404 em rota autenticada.
A revisão final também trocou a montagem de URLs sintéticas por urlunsplit, com teste de
round-trip de credenciais, sem alterar scanner, runtime ou bytes do artefato validado.
O schema já integralmente aplicado após a falha de ordenação foi reconhecido por recuperação
somente leitura, sem reset/resolve. A suite OCI-04 foi inicialmente chamada com Node 26 e
recusou NODE_MAJOR; o rerun correto com Node 22 passou. Não houve alteração de asserts existentes,
skips novos ou retries para esconder falha de produto.

## 22. Testes backend

160 arquivos, 1942 testes: 1937 aprovados, 5 skips existentes, zero falhas.
Cobertura completa e 12 provas de runtime de produção controlado aprovadas.
67 migrations e 14 validadores históricos passaram em outro mysqld 8.4.8 novo,
com TEST_DATABASE_URL próprio. Runner parou a instância e removeu seu diretório.
Não reutilizou servidor DEV ou servidores previamente existentes.

## 23. Testes frontend

120 arquivos, 1493 testes aprovados, zero falhas/skips. Coverage, lint, format e build passaram.
Execução em Node 22.23.3/npm 10.9.9 no workspace de QA isolado; o bundle final foi reconstruído
e comprovado no toolchain Linux ARM64 22.23.2/10.9.8. Nenhuma alteração de interface.

## 24. Gates

| Coverage | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| Backend | 92,51% | 87,27% | 95,35% | 94,81% |
| Frontend | 86,11% | 81,00% | 81,97% | 88,59% |

Lint/format backend e frontend, Prisma validate/generate, arquitetura, política CI local
(90 testes), validação de workflow e build aprovados. ESLint recommended/Node e Prettier dos
três MJS novos sem erros/avisos. Python validado por parser e suíte operacional.
Dependency audit: zero HIGH/CRITICAL, zero exceções nos dois componentes.
Secret scan canônico e extensão explícita aos novos Python/tests/docs/evidências, integridade
das receitas exportadas e git diff --check compõem a revisão final registrada no JSON de qualidade.
Não foi acionada CI remota.

## 25. Segurança

Sem acesso a segredos reais, .env operacional, contas cloud, SMTP ou GitHub App.
Fixtures de credenciais/chaves/TLS são geradas apenas no laboratório isolado.
Nginx 1.20.1 e systemd 252 reais, SELinux Enforcing e firewalld ativo no laboratório.
Nenhum serviço de teste chamou GitHub/SMTP externos; drop-ins de rede limitaram runtime ao loopback.
Manifestos e logs publicados contêm apenas metadados e códigos sanitizados.

Limitações: aprovação/backup são gates humanos com evidência externa, não certificação automática;
sem assinatura/SBOM/armazenamento remoto automatizados; locks não protegem contra root hostil;
retenção pública exige acompanhamento de disco; rollback cruzando schema é conservador.

## 26. Bancos protegidos

DEV e HeatWave não foram conectados nem alterados por esta entrega. Não houve migration,
reset, importação ou seed em banco persistente. Os únicos DDL ocorreram em instâncias novas
descartáveis com ownership comprovado. O teste de alvo OCI foi recusado antes de conexão.
Credenciais runtime e migration distintas foram exercitadas, inclusive DDL negado ao runtime.

## 27. Infraestrutura OCI

VM OCI, Nginx real, DNS, Cloudflare, TLS real, NSGs, banco, GitHub App e Terraform não foram
modificados nem acessados para implantação. A página temporária não foi substituída;
sua disponibilidade real não foi revalidada nesta execução.

Limpeza comprovada: API/worker/Nginx de laboratório inativos com MainPID=0; mysqld próprio
encerrado; unidades de teste desabilitadas; VM tf05 removida e LIMA_HOME exclusivo apagado.
Outras VMs/homes permaneceram intocados. Artefatos públicos locais e evidências sanitizadas
foram preservados para revisão.

## 28. Pendências

| Bloqueador | Decisão/prova pendente |
| --- | --- |
| B1 HeatWave gerenciado | Identidade/versão, TLS/CA, autenticação, grants, locks, fuso e migrations em homologação autorizada |
| B2 Backup/restore | Backup consistente, retenção, RPO/RTO e restauração real com storage |
| B3 Upload Cloudflare | Cap confirmado de 100 MB versus 100 MiB de arquivos + até 6 MiB de campos + multipart; preservar funcionalidade |
| B4 SMTP | Credenciais/certificados/entrega e comportamento operacional reais |
| B5 GitHub App | URLs, callback, webhook/permissões e sincronização reais |
| B6 CI/CD | Build/assinatura/retenção/promoção remotos em entrega própria |
| B7 Primeira implantação | Janela, responsáveis, gates resolvidos, aprovação humana e smoke real |

Resolver uploads em OCI-04.1, com desenho que preserve os limites funcionais; não reduzir
limites automaticamente. Nenhuma solução de upload foi implementada aqui.
As receitas candidatas ainda precisam de revisão e commit autorizado antes de um build
promovível. Esta execução não cria esse commit nem inicia a próxima entrega.

## 29. Próxima entrega

Ordem recomendada: revisão OCI-05 → OCI-04.1 (uploads compatíveis com Cloudflare) →
OCI-06 (HeatWave/TLS/permissões/backup/restore) → OCI-07 (deploy controlado após gates).
CI/CD definitivo e adoção Terraform dos recursos existentes ficam em entregas próprias.
Não reexecutar provisionamento manual ou recriar recursos existentes.

## 30. Final verdict

**OCI-DEPLOY-05 — IMMUTABLE RELEASES, MIGRATIONS & ROLLBACK — PASS LOCAL**

Empacotamento/reprodutibilidade, artefatos ARM64, staging/ativação, migration isolada,
rollback, falhas, reboot, storage e prune foram comprovados localmente.
A revisão final de qualidade/preservação está no arquivo de evidência correspondente.
Produção permanece bloqueada pelas pendências acima; nenhum deploy foi realizado.
Parar e aguardar autorização.
