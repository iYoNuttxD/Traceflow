# Manutenção controlada de segurança — 04/11/2026

## Etapa 2 — resultado atual

**A implantação NÃO está tecnicamente pronta. Nenhuma correção foi aplicada à OCI.**
A homologação nativa do runtime e a resolução seletiva do DNF avançaram; a recuperação
integral continua bloqueada pela ausência de backup de boot e de ensaio de restauração.
O GitHub externo permanece sem prova por ausência de credenciais de homologação,
confirmada pelo operador.

Branch `security/20261104-controlled-maintenance`; base homologada
`716aad84ecbba6d8d58bab5ffc409884a7ccf38c`. Esta etapa acrescenta somente documentação
e evidências sanitizadas. Os patches `qs=6.16.2` e `follow-redirects=1.16.2` foram mantidos.
O checkout `daniel`, HEAD `d0645b457960b6830d6f8e87cb6e1a6fa461ebf6`, e os quatro
scripts locais não rastreados continuam preservados.

Procedimento proposto: [implantação e recuperação](../runbooks/OCI_SECURITY_MAINTENANCE_2026-11-04.md).
Evidência verificável: [resumo da etapa 2](evidence/security-20261104/stage2-validation.json),
[transações, versões e CVEs](evidence/security-20261104/stage2-dnf-plan.json).
O histórico integral da etapa 1 está abaixo, com suas conclusões datadas; esta seção
substitui os estados pendentes que foram efetivamente resolvidos.

| Pré-requisito                                   | Estado    | Evidência e limite                                                                                                          |
| ----------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Preservação do repositório e da produção        | APROVADO  | Configurações/permissões, estado CD e inventário de 808 RPMs idênticos; PIDs originais mantidos                             |
| Autenticidade do Node oficial ARM64             | APROVADO  | Assinatura válida da chave pinada, checksum do tar e hash do executável conferidos                                          |
| Compatibilidade Oracle Linux 9 ARM64            | APROVADO  | VM local Oracle Linux 9.8 aarch64; SELinux Enforcing; dependências ELF satisfeitas                                          |
| API, worker, jobs, Prisma e Argon2              | APROVADO  | Inicialização real em production, TLS MySQL estrito; também com dependências somente de produção                            |
| Testes adicionais ARM64                         | APROVADO  | 337 backend + 96 frontend, zero falhas/skips; 433 execuções adicionais, sem repetir toda a etapa 1                          |
| Frontend sem alteração de artefatos             | APROVADO  | Build Linux com os mesmos 71 caminhos e hashes do bundle já publicado                                                       |
| Seleção de runtime e rollback local             | APROVADO  | API/worker e candidato CD: 22.23.4 → RPM 22.23.2 → 22.23.4; arquivo do RPM intacto                                          |
| Release anterior recuperável como aplicação     | APROVADO  | Artefato ativo baixado, SHA conferido; 4.764 entradas verificadas; API/worker/candidato executados no laboratório           |
| Simulação DNF seletiva                          | APROVADO  | Cinco cenários resolvidos offline; nenhuma transação DNF executada; inventário original intacto                             |
| RPMs de ida e volta do grupo de 15              | APROVADO  | 30 artefatos com checksum e assinatura Oracle válidos; disponibilidade não equivale a restore do SO                         |
| Solução de downgrade dos 15 RPMs                | APROVADO  | Somente modelo de cabeçalhos: resolução exata e ida/volta do inventário; nenhum scriptlet instalado                         |
| Backup cifrado da aplicação ainda presente      | APROVADO  | GET do objeto existente: 892.449 bytes e SHA do recibo coincidem; não decriptado                                            |
| Acesso administrativo do operador à recuperação | APROVADO  | Console autenticado; grupo Administrators e política manage all-resources em tenancy observados; nenhuma permissão ampliada |
| Backup do volume de boot                        | BLOQUEADO | Nenhum item no escopo do volume; política None, replicação Off; não foi criado backup                                       |
| Restauração real de boot / RTO                  | PENDENTE  | Requer autorização para backup e recursos temporários isolados; capacidade, custo e boot precisam ser comprovados           |
| Restore atual de dados/configurações            | PENDENTE  | Não autorizado/executado; helper fixa MySQL 26.7.0, Mac e HeatWave observados em 26.10.0                                    |
| GitHub App e sincronização externa real         | BLOQUEADO | Operador informou que não há credenciais de homologação; testes simulados não substituem esse gate                          |
| Instalação/rollback real dos patches do SO      | PENDENTE  | Somente solver e artefatos; scriptlets, certificados e efeitos sobre daemons ainda exigem ensaio compatível                 |
| Release oficial assinada / CI no commit final   | PENDENTE  | Nenhum push, workflow remoto, release, merge ou deploy nesta etapa                                                          |
| Autorização produtiva específica                | PENDENTE  | Não solicitada como GO genérico; recuperação e demais gates devem ser resolvidos antes                                      |

## Recuperação comprovada e limites

O console passou a carregar depois da autenticação/MFA do operador. O bloqueio anterior
do console não foi reproduzido. A identidade da VM continuou recebendo
`NotAuthorizedOrNotFound` nas consultas Compute/Block; a região e o compartimento
foram conferidos. O operador humano tem acesso administrativo distinto dessa identidade.
Não ampliar o IAM da VM para contornar sua limitação.

O boot volume `traceflow-app (Boot Volume)` tem 47 GB, está Available e anexado como
boot, leitura/escrita paravirtualizada, à instância esperada em São Paulo AD-1.
Criptografia Oracle, sem volume group, política de backup None e replicação Off.
A aba de backups desse volume não contém itens. Nenhum volume de dados adicional foi
listado no compartimento raiz; o inventário local confirma o disco de boot e LVM.
Isto não é uma busca global em outros compartimentos.

O MySQL gerenciado é um recurso separado: `traceflow-mysql`, Active, versão 26.10.0
observada no console, armazenamento 50 GiB, crash recovery e delete protection Enabled.
Backup automático ativo `mysqlbackup20261104212932`, criado às 21:29:32 UTC, 1 GiB,
retenção de um dia, expiração prevista em 05/11 às 21:29:32 UTC. PITR, HA e cópia
entre regiões estão desabilitados. Nenhuma dessas configurações foi alterada.
Restaurar o boot não restaura o HeatWave e pode reconectar uma cópia antiga ao banco
atual: o ensaio proposto exige isolamento antes do primeiro boot.

O backup da aplicação de 04/11 às 06:00 UTC conserva recibo SUCCESS e readback externo.
Foi feita uma nova leitura do cifrado existente, sem baixar dados em claro nem obter
a chave: SHA `777ac6853570ef25236dec3dd63e5a3172362c18ca2adf47fff5051b09f9a847`.
Foi uma requisição GET adicional; o contador produtivo não foi escrito
(80 registrados, limite 1.000; contabilizar essa leitura externa no controle operacional).
O erro de delimitador do comando ocorreu depois da emissão da prova; o GET não foi
repetido. O histórico de restore sintético de 84 migrations não comprova a restauração
da captura atual de 86 migrations. O helper e o runbook de restore têm pins/contagens
históricos: não remover suas guardas para obter um PASS.

A release ativa foi preservada localmente com SHA
`142ded2d52952f8a70198a6ccf86b4cc58565d2422dd2d3144b5e3a82688698c`.
O manifest foi verificado integralmente e o schema coincide com a candidata, sem DDL.
A release no GitHub retorna `immutable=false`: a disponibilidade atual não garante
retenção futura. Guardar o artefato verificado fora da VM; não depender apenas da URL.

## Homologação do Node e da candidata

Laboratório local Lima/VZ, 4 vCPUs, 6 GiB, disco 30 GiB, Oracle Linux 9.8 aarch64;
sem mounts do host, encaminhamento de agente SSH ou portas da aplicação. Não foi
criado recurso OCI. MySQL 8.4.11 local, duas bases novas com sufixo `_test`, TLS
estrito e credenciais sintéticas. Este servidor não é uma réplica do HeatWave 26.10.0.

O tar oficial `node-v22.23.4-linux-arm64.tar.xz` tem SHA
`6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b`.
A chave de releases foi pinada no commit `481637f813e912c4aa3622d7964ab426c97b8e8d`;
assinatura válida de `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`.
O aviso de lock do keybox foi resolvido exportando a mesma chave pública em formato
OpenPGP e repetindo a verificação. Executável SHA
`7e48183361053f039294fbbc3ba586722fe756bf296d6cb8195356d10819cd16`,
Node 22.23.4 / OpenSSL embutido 3.5.9. Requer glibc até GLIBC_2.28; o laboratório
tem glibc 2.34. Não carrega libnode/libssl/libbrotli do RPM. Prisma mantém sua própria
dependência nativa de OpenSSL; client 6.12.0 e conexão TLS foram exercitados.

Estratégia homologada: árvore versionada root em `/opt/traceflow-live/runtimes`,
seletor atômico `selected` e uma diretiva `BindReadOnlyPaths` nas bases systemd de
API, worker e retenção. O ExecStart existente continua `/usr/bin/node`; o bind
somente no namespace da unit projeta o binário selecionado sobre `/usr/bin/node-22`.
Isso preserva arquivos DNF, drop-ins de release e a fábrica de candidato CD.
A fábrica real, sem alteração, foi exercitada. Não é prova de execução integral
da pipeline/CD produtiva com suas credenciais e assinatura.

Foram verificados API ready 200, anônimo 401, um worker com heartbeat, quatro leases,
retenção dry-run com serviços reais em base sintética e recusa do alvo não produtivo
pelo guard original. Prisma com CA confiável passou e sem a CA foi recusado.
HTTPS público de GitHub e TraceFlow passou com TLS 1.3. Argon2 ARM64 fez hash/verify.
`npm ci` e `npm prune --omit=dev` passaram; auditorias produtivas de ambas as árvores
retornaram zero. As moderadas exclusivas de ESLint/minimatch da etapa 1 continuam
fora deste patch, sem upgrade major.

Os 337 testes backend cobrem auth/sessão, projetos locais/GitHub, concorrência de sync,
jobs, relatórios/PDF e lifecycle; os 96 frontend cobrem auth, rotas, projetos e relatórios.
A cobertura integral dos demais fluxos continua sustentada pelos 5.380 testes da etapa 1,
sem atribuir a eles execução Linux nesta etapa. Não houve sincronização externa real.

A primeira preparação do MySQL foi recusada por datadir ainda não inicializado.
Duas tentativas de inicialização da API foram recusadas por configuração sintética
incompleta: connection_limit ausente e storage com modo 0755 em vez de 0700.
Foram corrigidos apenas esses dados do laboratório. Não houve mudança em código,
assertions, retries de testes ou timeouts para mascarar falhas; os logs iniciais
foram preservados. A execução final com as guardas originais passou.

O rollback local para o RPM utilizou `22.23.2-2.0.1`, que o laboratório instalou
para reproduzir a família Oracle; produção conserva `22.23.2-2`. Portanto a prova
não representa igualdade binária com o RPM produtivo anterior.
O Node fora dos namespaces das units continua gerenciado pelo DNF e não recebe
automaticamente todas as correções oficiais. CLI administrativos e migradores
futuros precisam de seleção explícita homologada; não executar migrations nesta manutenção.

O conjunto padrão de CAs passou de 145 no RPM observado para 116 no oficial, de
acordo com a atualização upstream NSS 3.131.1. Não adicionar CAs nem desabilitar TLS
para esconder incompatibilidade. GitHub público, TraceFlow e MySQL de teste passaram;
SMTP específico e integrações autenticadas externas ainda não foram exercitados.

## Simulação Oracle Linux e impacto

O espelho regional da OCI não respondeu no laboratório. Foram copiados somente os
metadados públicos já presentes na VM e os cabeçalhos RPM, sem rodar DNF ou renovar
cache produtivo. A importação reproduziu exatamente os 808 pacotes, hash
`15f323a2ca047d3233ba47efdc207de448352450b79104a70e5f322e3e264c60`.
Os hashes de repomd/arquivos foram conferidos. BaseOS/AppStream são de 04/11;
UEKR8/OCI included de 03/11; addons de 30/10; Ksplice de 28/10.
Esta simulação precisa ser revalidada antes de uma futura instalação.

| Cenário                         |         Pacotes de entrada |          Download | Resultado                                         |
| ------------------------------- | -------------------------: | ----------------: | ------------------------------------------------- |
| ca-certificates isolado         |                  1 upgrade |     994.716 bytes | Resolvido, sem dependências adicionais            |
| SO ativo sem Node RPM           |                10 upgrades |  97.143.397 bytes | Resolvido; lote operacional separado              |
| Grupo com backport Oracle Node  |                15 upgrades | 145.141.492 bytes | Resolvido; backport não cobre todo o Node oficial |
| Críticos/altos sem kernel/Nginx | 52 upgrades + 1 instalação | 202.610.521 bytes | Apenas análise; não recomendar em bloco           |
| Kernel UEK                      |    8 instalações paralelas | 204.761.919 bytes | Plano de boot/reboot próprio; nada instalado      |

A transação ampla acrescenta `perl-Unicode-Normalize` e traz glibc, openssh, política
SELinux e outras dependências por acoplamento. Não é atualização geral recomendada.
Os 15 RPMs anteriores e 15 novos foram obtidos e autenticados, inclusive os dois
OCI SDK acessíveis somente pelo espelho regional (leitura HTTP sem gravar na VM).
O solver de downgrade fechou exatamente os 15 nomes/NEVRAs no modelo de cabeçalhos.
Scriptlets e arquivos reais não foram executados por esse ensaio.

`ca-certificates` contém manipulação de .rpmsave e regeneração de confiança;
`pcre2` contém rebuild de política SELinux com semodule. Seus efeitos não podem ser
ignorados por a transação ser seletiva. O JSON relaciona todos os pacotes anteriores,
propostos, avisos e CVEs, incluindo os adicionais.

Leitura de /proc confirmou pcre2 no Nginx, processos systemd e numerosos daemons; expat/Python
em firewalld, polkit, tuned e serviços de sistema; Brotli em Node e NetworkManager.
Um reload do Nginx não comprova recarga da biblioteca pelo master. Não reiniciar
NetworkManager, firewalld, sshd, PID 1 ou demais daemons em cadeia nesta janela.
Processos com bibliotecas antigas exigem plano separado; pode ser necessário reboot
controlado. Kernel novo somente fica efetivo após boot aprovado.
WebKit/libsoup/X11/librsvg não apareceram mapeados no instante observado; continuam
pacotes afetados, sem exposição de serviço demonstrada. Cockpit.socket estava inativo;
rpcbind.socket ativo. Não remover pacotes nem alterar rede por essa observação.

Nginx permanece `1.20.1-28.0.1.el9_8.6`, com os backports da etapa 1. Nenhuma troca
de stream ou RPM Nginx é proposta. Correções de pcre2 podem exigir seu reinício posterior,
o que é uma intervenção diferente de atualizar Nginx.

## Produção ao encerrar a auditoria

Às 23:13:58 UTC (20:13:58 America/Sao_Paulo), API PID 998649 e worker PID 998659
continuavam ativos, zero NRestarts, Node 22.23.2. RPMs, estado CD e fingerprints de
27 configurações/owners/modos coincidiram com a etapa 1; kernel preservado, SELinux
Enforcing, firewalld ativo e nginx -t válido.

Monitor às 23:14:42 UTC: API/HTTPS 200, MySQL true, um worker, heartbeat de 2 s,
quatro leases dentro dos limites do monitor, zero jobs GitHub falhos, zero eventos
de jobs falhos, zero HTTP 5xx e failures vazio; disco 78,75%, memória disponível 86,97%.
O GET com curl usado pelo receiver e o GET do monitor devolveram o HTML esperado,
SHA igual ao index publicado. urllib/Python recebeu 403 do Cloudflare; a causa
exata desse tratamento por cliente não foi demonstrada. O diagnóstico foi preservado,
sem alterar Cloudflare, User-Agent das ferramentas produtivas ou regras de segurança.

**Serviços produtivos reiniciados: nenhum. Pacotes produtivos instalados: nenhum.
Backups/volumes/instâncias criados na OCI: nenhum. Push/merge/deploy/reboot: nenhum.**
Os serviços e bancos sintéticos pertencem exclusivamente ao laboratório local.
A VM local foi encerrada em 04/11 às 20:22:57 America/Sao_Paulo; disco e evidências
foram preservados. Esse encerramento não afetou a OCI.

## Próximas autorizações e riscos residuais

1. Aprovar separadamente o plano de backup/restore de boot e recursos temporários,
   com isolamento antes de qualquer boot, custódia, capacidade, custo máximo e descarte.
2. Aprovar o ensaio de restauração da captura de aplicação em destino novo e cifrado;
   resolver o pin MySQL 26.7.0 e validar o contrato atual de 86 migrations sem relaxar guardas.
3. Disponibilizar GitHub App/repositório exclusivos de homologação ou registrar
   aceitação humana explícita da lacuna; esta entrega mantém o gate bloqueado.
4. Concluir o empacotamento oficial e as provas finais no commit aprovado, com revisão
   dos hashes da autoridade CD e das três bases systemd. Não reinstalar o receiver.
5. Só então solicitar um plano produtivo específico para runtime/release e, separadamente,
   cada lote SO. Reboot e patches do kernel exigem autorização própria.

Node e qs permanecem vulneráveis na produção atual. A aplicação em funcionamento foi
preservada. A correção preparada no repositório e validada localmente não encerra
a manutenção de segurança.

## Etapa 1 — registro histórico preservado

As seções seguintes descrevem exclusivamente a primeira etapa, antes da homologação
nativa e das novas consultas de recuperação acima.

### Estado da entrega

**Preparação local; nenhuma correção aplicada à OCI.** A produção permanece na release
`d0645b457960b6830d6f8e87cb6e1a6fa461ebf6-142ded2d5295`.
Instalação de pacotes, troca de runtime, publicação, reinícios e reboot exigem um plano
específico aprovado depois das provas de recuperação e compatibilidade.

Checkout original: branch `daniel`, HEAD `d0645b457960b6830d6f8e87cb6e1a6fa461ebf6`.
Os quatro scripts não rastreados do operador foram preservados.
Branch isolada: `security/20261104-controlled-maintenance`.
Nenhuma lógica de negócio, fonte de frontend/backend, schema, migration, autenticação,
integração ou regra de rede foi alterada.

### Baseline real da produção

- Oracle Linux 9.8, aarch64; kernel em execução `6.12.0-207.111.5.1.el9uek.aarch64`.
- API PID 998649 e worker PID 998659: executável `/usr/bin/node-22`, Node 22.23.2,
  OpenSSL compartilhado 3.5.8. ExecStart efetivo usa `/usr/bin/node`.
  Os inodes das bibliotecas mapeadas de libnode, Brotli e TLS coincidem com os arquivos
  consultados no RPM; não havia biblioteca marcada como removida nesses processos.
- RPM Node `1:22.23.2-2.module+el9.8.0+91062+a7d6b802.aarch64`.
  Retenção executa o mesmo `/usr/bin/node`; os quatro jobs pertencem ao worker.
- Nginx `2:1.20.1-28.0.1.el9_8.6.aarch64`; `nginx -t` passou.
  O changelog instalado registra os backports examinados, inclusive CVE-2026-42533,
  CVE-2026-56434, CVE-2026-60005, CVE-2026-42055 e CVE-2026-42945.
  O repositório oficial atual não oferece RPM não modular posterior da mesma linha.
  Avisos de Nginx 1.26 modular não justificam trocar o stream instalado.
- Readiness e HTTPS 200; MySQL saudável; um worker, heartbeat recente; quatro jobs
  com leases recentes; zero jobs GitHub falhos em 15 minutos e zero 5xx em 5 minutos.
  Journals recentes foram reduzidos a contagens/eventos; nenhum log bruto foi publicado.
- SELinux Enforcing; firewalld ativo; zero reinícios dos dois serviços.
  Raiz com aproximadamente 6,3 GiB livres e 9,3 GiB de memória disponível.
- Backup diário: SUCCESS em 04/11/2026 às 03:00:10 America/Sao_Paulo,
  `externalReadback=true`. A chave externa não foi solicitada, lida ou copiada.
  Esse recibo não comprova restore desta captura nem recuperação integral do SO.
- Os 71 arquivos do bundle local antes/depois do patch são idênticos e estão presentes
  com os mesmos hashes na publicação ativa. Há 184 assets históricos adicionais
  preservados pelo mecanismo existente; não foram removidos.

### Vulnerabilidades e decisão mínima

| Vulnerabilidade / aviso                             | Componente                         | Severidade                           | Versão anterior                               | Versão corrigida ou preparada                                                                                                        | Correção                                      | Validação                                                               | Produção                                                                        | Rollback                                                         |
| --------------------------------------------------- | ---------------------------------- | ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| CVE-2026-111497                                     | Node / libbrotli                   | Alta; Oracle Important               | Node 22.23.2 RPM -2; libbrotli 1.0.9-10.el9_8 | Builder 22.23.4 preparado. Oracle ELSA-2026-500517 oferece Node 22.23.2-2.0.1; ELSA-2026-500513 oferece libbrotli 1.0.9-10.0.1.el9_8 | Pin do builder; VM permanece sem correção     | Executável e inodes reais; aviso oficial; runtime isolado 22.23.4       | Pendente; nenhum RPM instalado                                                  | RPMs anteriores e boot/recovery ainda precisam de preparo/ensaio |
| CVE-2026-105482 / CVE-2026-106069                   | DNS / TLS Node                     | Alta                                 | 22.23.2 RPM -2                                | Corrigidas upstream em 22.23.4; nenhum RPM Oracle 22 com cobertura completa foi encontrado nos metadados atuais                      | Pin do builder; VM permanece sem correção     | Executável e inodes reais; aviso oficial; runtime isolado 22.23.4       | Bloqueado para correção integral preservando o mecanismo RPM                    | RPMs anteriores e boot/recovery ainda precisam de preparo/ensaio |
| CVE-2026-106072 / CVE-2026-105481 / CVE-2026-106074 | TLS / HTTP Agent / crypto Node     | Moderada no aviso detalhado upstream | 22.23.2 RPM -2                                | 22.23.4 no builder preparado; a errata Oracle 22 disponível comprova somente Brotli                                                  | Pin do builder; VM permanece sem correção     | Executável e inodes reais; aviso oficial; runtime isolado 22.23.4       | Pendente                                                                        | RPMs anteriores e boot/recovery ainda precisam de preparo/ensaio |
| CVE-2026-106073                                     | Modelo de permissões Node          | Baixa                                | 22.23.2                                       | Incluída em 22.23.4; uso do permission model não demonstrado no TraceFlow                                                            | Pin do builder; VM permanece sem correção     | Executável e inodes reais; aviso oficial; runtime isolado 22.23.4       | Pendente junto ao runtime                                                       | RPMs anteriores e boot/recovery ainda precisam de preparo/ensaio |
| CVE-2026-110816 / GHSA-6pq8-jhm2-2vcw               | qs / backend                       | Moderada                             | 6.16.0 no lockfile e na release ativa         | 6.16.2, patch compatível somente no lockfile                                                                                         | Patch transitivo de lockfile                  | PoC antes/depois; npm ci; 3.481 testes backend; auditoria produção zero | Corrigido localmente; publicação pendente                                       | Release imutável anterior preservada; não executado              |
| CVE-2026-116689 / GHSA-mrwp-f3q8-3g9p               | follow-redirects / árvore frontend | Alta no npm / GHSA                   | 1.16.1 no lockfile da revisão publicada       | 1.16.2, patch compatível somente no lockfile                                                                                         | Patch transitivo; preservar frontend idêntico | PoC redirect; npm ci; 1.899 testes; 71 hashes idênticos                 | Repositório preparado; não integra o bundle browser examinado                   | Reverter lockfile local; frontend produtivo não foi trocado      |
| CVE-2026-118764 / GHSA-g3hv-75wg-m249               | minimatch via ESLint               | Moderada                             | minimatch 10, somente desenvolvimento         | Correção publicada em 11.0.1, mudança major na transitiva; mantida fora deste patch mínimo                                           | Avaliado separadamente; sem upgrade major     | npm audit completo registra risco dev residual                          | Risco residual de desenvolvimento                                               | Não aplicável; nenhuma alteração                                 |
| CVE-2026-114406 / ELSA-2026-88459                   | ca-certificates                    | Crítica Oracle                       | 2025.2.80_v9.0.305-91.el9                     | 2026.2.92_v9.0.319-90.3.el9_8 disponível                                                                                             | Apenas inventário seletivo; sem instalação    | RPM instalado e errata Oracle; exposição/solver pendentes               | Pendente de recuperação, simulação da transação e validação TLS                 | Pacotes anteriores e recuperação SO; não comprovado              |
| ELSA-2026-84583 / ELSA-2026-91580                   | webkit2gtk3-jsc instalado          | Crítica / alta Oracle                | Consultar inventário NEVRA anexo              | 2.54.1-1.el9_8 / 2.54.2-0.el9_8.1 disponíveis                                                                                        | Apenas inventário seletivo; sem instalação    | RPM instalado e errata Oracle; exposição/solver pendentes               | Pacote afetado confirmado; exposição no serviço não demonstrada; não atualizado | Pacotes anteriores e recuperação SO; não comprovado              |
| ELSA-2026-500394 / 500399 / 500572                  | kernel UEK                         | Alta Oracle                          | 6.12.0-207.111.5.1                            | Patches seletivos disponíveis; 500572 chega a 6.12.0-208.112.5                                                                       | Apenas inventário; plano próprio necessário   | Kernel ativo + comparação EVR/erratas                                   | Fora de qualquer implantação sem plano próprio de boot/recovery; nenhum reboot  | Kernel anterior + console + backup boot; não comprovado          |
| Demais ELSAs do inventário anexo                    | Pacotes Oracle Linux instalados    | Alta / moderada                      | NEVRAs no anexo                               | Patches oficiais por aviso; não constitui uma transação DNF aprovada                                                                 | Apenas inventário seletivo; sem instalação    | RPM instalado e errata Oracle; exposição/solver pendentes               | Pendente de análise de dependências, uso e recuperação                          | Pacotes anteriores e recuperação SO; não comprovado              |

A classificação Alta de `follow-redirects` é a do advisory npm/GitHub, embora ele
também forneça um vetor CVSS 3.1 de 5,9. Não foi reclassificado silenciosamente.

A presença de `qs` afetado foi confirmada. Não foi encontrada chamada da aplicação
a `qs.stringify(..., {arrayFormat: 'comma'})`; a reprodução sintética demonstra o
defeito da biblioteca, sem afirmar que existe endpoint explorável em produção.
O Axios do frontend substitui o adapter HTTP Node pelo adapter browser; o módulo
`follow-redirects` não integra o bundle examinado. Sua correção elimina o alerta
na árvore e o risco em usos Node, sem exigir redistribuir o frontend idêntico.

Node 22.23.4 continua sendo a versão mais recente da linha 22 no endpoint oficial
consultado nesta data. O checksum ARM64 oficial foi fixado no Dockerfile:
`6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b`.
Apenas atualizar o RPM Oracle para 22.23.2-2.0.1 não satisfaz a correção integral
pedida: sua descrição enumera somente CVE-2026-111497. Não substituir o RPM por
tarball nem mudar para Node 24 sem decisão explícita do operador.

### Validação isolada

- Node local explícito: 22.23.4, npm 10.9.9; o Node 26 do shell padrão não foi usado
  nos gates de instalação, aplicação ou cobertura.
- `npm ci` dos dois projetos passou antes e depois das alterações.
  `npm ls --all`, lint, formatação, arquitetura, segredos e validação Prisma passaram.
  O npm tentou retirar metadados libc de pacotes opcionais; foram restaurados.
  Cada lockfile altera somente version/resolved/integrity do pacote alvo.
- Auditorias pós-patch de produção: zero vulnerabilidades em backend e frontend.
  Auditoria completa: quatro registros moderados em cada árvore, provenientes do
  mesmo advisory minimatch no ESLint. Zero altas/críticas, sem exceções novas.
  O script de política da CI passou para ambos.
- Prova sintética anterior: qs lançava TypeError e o redirect cross-realm vazava
  cabeçalho fictício. Depois: serialização sem exceção, credencial removida no
  redirect e cabeçalho público preservado. Entradas DNS com NUL e IP TLS não
  canônico foram recusadas no Node 22.23.4.
- Frontend: 154 arquivos de teste, 1.899 testes aprovados; cobertura passou.
  Dois builds de validação passaram, com os mesmos avisos já presentes no baseline.
- CD/rollback: 102 testes passaram. Operações: 25 testes passaram.
- Backend: nova execução completa aprovada, 270 arquivos de teste aprovados e dois
  inteiramente ignorados; 3.481 testes aprovados, cinco skips preexistentes. Cobertura:
  statements 93,92%, branches 88,98%, functions 96,27%, lines 95,79%.
- Inicialização real no Mac ARM64 com Node 22.23.4 / OpenSSL 3.5.9: API readiness
  200, autenticação anônima 401, um worker com heartbeat, quatro leases de jobs e
  86 migrations no terceiro schema local vazio. Nenhum projeto ou integração real;
  credenciais inteiramente sintéticas. API e worker encerrados após a prova.
- Pós-auditoria produtiva às 19:05 America/Sao_Paulo: PIDs originais preservados,
  Node 22.23.2 ainda efetivo, métricas sem falhas e backup SUCCESS.
- Todos os schemas criados nesta tarefa são novos, locais e exclusivos de teste.
  MySQL local 26.10.0; não equivale à homologação Oracle Linux ARM64 / MySQL 8.4.8
  da CI. A primeira execução utilizou nome de schema que continha test, mas não
  terminava em _test: duas assertions do contrato de CLI reprovaram o nome.
  Nenhum código/teste/timeout foi alterado; o resultado original foi preservado.
- Homologação nativa Oracle Linux ARM64, build duplo oficial, TLS real da combinação
  de RPMs proposta e teste do sandbox systemd produtivo continuam pendentes.
  Não foram instaladas ferramentas de virtualização nem usados serviços produtivos
  para executar testes com escrita.

A suíte existente cobre autenticação/sessões, projetos locais/GitHub, requisitos,
tarefas, quadros/Sprints, sincronização e rastreabilidade, casos/execuções/defeitos,
indicadores, notificações, PDF e jobs. Cobertura automatizada local não representa
QA manual de cada fluxo em produção nem sincronização externa real com GitHub.
Nenhuma conta, projeto ou dado de usuário real foi modificado.

### Situação da recuperação do sistema

A consulta de boot volumes com a identidade operacional retornou
NotAuthorizedOrNotFound. O operador autenticou o console OCI; a página inicial
mostrou a instância Running, mas a consulta de detalhes não carregou e a navegação
subsequente apresentou erro de rede. Nenhum snapshot foi criado e a existência
de backup de boot recuperável não foi confirmada. Não ampliar IAM para contornar
a limitação. A intervenção no SO/runtime permanece bloqueada por essa prova.

### Recuperação, implantação e autorização

1. Confirmar baseline saudável novamente e preservar a release ativa e todos os
   assets históricos. Conferir locks de CD/backup e ausência de operação concorrente.
2. Preparar recuperação verificável do sistema afetado: backup de boot disponível,
   acesso ao console, conjunto exato dos RPMs anteriores e novos com integridade,
   configurações/certificados/permissões protegidos e ensaio de recuperação.
   Não considerar o backup da aplicação equivalente a snapshot do SO.
3. Resolver a ausência de RPM Node 22 que cumpra toda a correção requerida.
   Manter o stream 22 e o método de instalação existente até decisão expressa.
4. Simular a transação seletiva com DNF e revisar dependências e scriptlets.
   Não executar upgrade geral; selecionar avisos/pacotes oficiais, usando
   `upgrade-minimal --security --advisory=...` quando aplicável.
   Metadados da VM foram apenas lidos; os metadados oficiais novos foram obtidos em
   memória ou no Mac. Nenhum `dnf upgrade`, `makecache` ou instalação foi executado.
5. Concluir homologação ARM64 e apresentar GO específico com pacote/hashes, serviços,
   interrupção esperada, smoke tests e comandos de rollback. Node/libnode/libbrotli
   requerem que API e worker carreguem as bibliotecas corrigidas; jobs internos
   acompanham o worker. Retenção usará o runtime selecionado no próximo disparo.
   Não disparar retenção manual nem reboot como parte dessa atualização.
6. Para qs, produzir pacote backend imutável pela CD oficial, sem migrations/seeders.
   O frontend já é idêntico; preservar o frontend publicado e seus assets.
   O protocolo atual empacota ambos os componentes: a estratégia de manter o frontend
   deve ser revisada no plano, sem mudar o receiver por conveniência.
7. O patch do builder altera arquivos da autoridade CD: Dockerfile e build.sh.
   Sua futura instalação requer revisão explícita dos hashes da trust policy root.
   Não editar essa política, reinstalar o receiver ou contornar a aprovação humana.
8. Somente após autorização, instalar os patches exatos; reiniciar exclusivamente
   componentes afetados, validar após cada etapa e conferir executáveis/bibliotecas
   mapeados. Interromper e recuperar a etapa anterior se houver regressão.
9. Rollback de aplicação usa o mecanismo imutável vigente e a release preservada;
   não usar activate-first nem rollback-to-maintenance como retorno funcional.
   Rollback de RPM requer o conjunto anterior verificado, compatibilidade e ensaio;
   rollback de kernel exige boot anterior e console. Nenhum destes foi executado.

A autorização inicial permite auditoria, branch e testes; não autoriza a intervenção
produtiva acima. Como existem pré-requisitos pendentes, esta entrega não solicita
um GO genérico nem declara a atualização concluída.

### Arquivos e evidências

Arquivos preparados:

- backend/package-lock.json
- frontend/package-lock.json
- deploy/cd/Dockerfile
- deploy/cd/build.sh
- docs/runbooks/OCI_LIVE_OPERATIONS.md
- docs/runbooks/OCI_CONTINUOUS_DEPLOYMENT.md
- docs/deliveries/SECURITY_MAINTENANCE_2026-11-04.md
- docs/deliveries/evidence/security-20261104/oracle-pending-advisories.json

Commit: consultar o log da branch de manutenção; nenhum push/PR/merge criado.
Três schemas locais sintéticos foram criados para os testes e preservados para
diagnóstico. Seus nomes estão registrados nos logs privados; não são bancos produtivos.

Fontes da aplicação, schema/migrations e arquivos operacionais instalados permanecem
intactos. Nenhuma release publicada, serviço reiniciado, pacote instalado ou reboot.

Evidência local sanitizada e logs de testes:
`build/security-maintenance-20261104/`, no worktree isolado. Inclui baseline da VM,
fingerprints privados de configuração, metadados/checksums Oracle, auditorias JSON,
reprodução antes/depois, comparação integral dos bundles e resultados dos gates.
Não publicar os fingerprints ou logs protegidos indiscriminadamente.

GitHub: Dependabot retorna HTTP 403 informando que os alertas estão desabilitados;
Code Scanning retorna HTTP 404/no analysis found. Isto não significa ausência de
vulnerabilidades. Nenhuma configuração ou permissão GitHub foi alterada.

### Referências oficiais

- [Node 22.23.4](https://nodejs.org/en/blog/release/v22.23.4)
- [Aviso Node de outubro](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Oracle Node 22: correção Brotli](https://linux.oracle.com/errata/ELSA-2026-500517.html)
- [Oracle libbrotli](https://linux.oracle.com/errata/ELSA-2026-500513.html)
- [Oracle certificados](https://linux.oracle.com/errata/ELSA-2026-88459.html)
- [Oracle kernel UEK](https://linux.oracle.com/errata/ELSA-2026-500572.html)
- [Oracle: DNF seletivo](https://docs.oracle.com/en-us/iaas/oracle-linux/oci/security-updates-using-dnf.htm)
- [qs](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw)
- [follow-redirects](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p)
- [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249)

### Inventário seletivo Oracle Linux

O [inventário completo](evidence/security-20261104/oracle-pending-advisories.json)
conserva todos os CVEs e NEVRAs anteriores/corrigidos por aviso. São 40 avisos
associados a 63 nomes de pacotes instalados, antes de resolver dependências DNF e exposição.
Não é autorização para instalar esse conjunto inteiro.

| Aviso                                                                     | Severidade Oracle | Pacotes encontrados                                                                                                                                                                           |
| ------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ELSA-2026-84583](https://linux.oracle.com/errata/ELSA-2026-84583.html)   | Critical          | webkit2gtk3-jsc                                                                                                                                                                               |
| [ELSA-2026-88459](https://linux.oracle.com/errata/ELSA-2026-88459.html)   | Critical          | ca-certificates                                                                                                                                                                               |
| [ELSA-2026-500394](https://linux.oracle.com/errata/ELSA-2026-500394.html) | Important         | kernel-uek, kernel-uek-core, kernel-uek-modules, kernel-uek-modules-core, kernel-uek-modules-desktop, kernel-uek-modules-extra-netfilter, kernel-uek-modules-usb, kernel-uek-modules-wireless |
| [ELSA-2026-500399](https://linux.oracle.com/errata/ELSA-2026-500399.html) | Important         | kernel-uek, kernel-uek-core, kernel-uek-modules, kernel-uek-modules-core, kernel-uek-modules-desktop, kernel-uek-modules-extra-netfilter, kernel-uek-modules-usb, kernel-uek-modules-wireless |
| [ELSA-2026-500450](https://linux.oracle.com/errata/ELSA-2026-500450.html) | Important         | ca-certificates                                                                                                                                                                               |
| [ELSA-2026-500513](https://linux.oracle.com/errata/ELSA-2026-500513.html) | Important         | libbrotli                                                                                                                                                                                     |
| [ELSA-2026-500517](https://linux.oracle.com/errata/ELSA-2026-500517.html) | Important         | nodejs, nodejs-docs, nodejs-full-i18n, nodejs-libs, npm                                                                                                                                       |
| [ELSA-2026-500572](https://linux.oracle.com/errata/ELSA-2026-500572.html) | Important         | kernel-uek, kernel-uek-core, kernel-uek-modules, kernel-uek-modules-core, kernel-uek-modules-desktop, kernel-uek-modules-extra-netfilter, kernel-uek-modules-usb, kernel-uek-modules-wireless |
| [ELSA-2026-604898](https://linux.oracle.com/errata/ELSA-2026-604898.html) | Important         | python39-oci-sdk                                                                                                                                                                              |
| [ELSA-2026-76739](https://linux.oracle.com/errata/ELSA-2026-76739.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-77689](https://linux.oracle.com/errata/ELSA-2026-77689.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-81532](https://linux.oracle.com/errata/ELSA-2026-81532.html)   | Important         | pcre2, pcre2-syntax                                                                                                                                                                           |
| [ELSA-2026-81552](https://linux.oracle.com/errata/ELSA-2026-81552.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-83156](https://linux.oracle.com/errata/ELSA-2026-83156.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-83384](https://linux.oracle.com/errata/ELSA-2026-83384.html)   | Important         | libsoup                                                                                                                                                                                       |
| [ELSA-2026-83562](https://linux.oracle.com/errata/ELSA-2026-83562.html)   | Important         | rpcbind                                                                                                                                                                                       |
| [ELSA-2026-85245](https://linux.oracle.com/errata/ELSA-2026-85245.html)   | Important         | emacs-filesystem                                                                                                                                                                              |
| [ELSA-2026-86033](https://linux.oracle.com/errata/ELSA-2026-86033.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-86921](https://linux.oracle.com/errata/ELSA-2026-86921.html)   | Important         | librsvg2, librsvg2-tools                                                                                                                                                                      |
| [ELSA-2026-87805](https://linux.oracle.com/errata/ELSA-2026-87805.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-88247](https://linux.oracle.com/errata/ELSA-2026-88247.html)   | Important         | expat                                                                                                                                                                                         |
| [ELSA-2026-89742](https://linux.oracle.com/errata/ELSA-2026-89742.html)   | Important         | python-unversioned-command, python3, python3-libs                                                                                                                                             |
| [ELSA-2026-90365](https://linux.oracle.com/errata/ELSA-2026-90365.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-90494](https://linux.oracle.com/errata/ELSA-2026-90494.html)   | Important         | python3-urllib3                                                                                                                                                                               |
| [ELSA-2026-90495](https://linux.oracle.com/errata/ELSA-2026-90495.html)   | Important         | libbrotli                                                                                                                                                                                     |
| [ELSA-2026-91057](https://linux.oracle.com/errata/ELSA-2026-91057.html)   | Important         | libXrender                                                                                                                                                                                    |
| [ELSA-2026-91365](https://linux.oracle.com/errata/ELSA-2026-91365.html)   | Important         | libX11, libX11-common                                                                                                                                                                         |
| [ELSA-2026-91580](https://linux.oracle.com/errata/ELSA-2026-91580.html)   | Important         | webkit2gtk3-jsc                                                                                                                                                                               |
| [ELSA-2026-93412](https://linux.oracle.com/errata/ELSA-2026-93412.html)   | Important         | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
| [ELSA-2026-93610](https://linux.oracle.com/errata/ELSA-2026-93610.html)   | Important         | bind-libs, bind-license, bind-utils                                                                                                                                                           |
| [ELSA-2026-94533](https://linux.oracle.com/errata/ELSA-2026-94533.html)   | Important         | cockpit, cockpit-bridge, cockpit-packagekit, cockpit-storaged, cockpit-system, cockpit-ws, cockpit-ws-selinux                                                                                 |
| [ELSA-2026-79281](https://linux.oracle.com/errata/ELSA-2026-79281.html)   | Moderate          | glibc, glibc-all-langpacks, glibc-common, glibc-devel, glibc-gconv-extra, glibc-langpack-en                                                                                                   |
| [ELSA-2026-80511](https://linux.oracle.com/errata/ELSA-2026-80511.html)   | Moderate          | curl, libcurl                                                                                                                                                                                 |
| [ELSA-2026-84588](https://linux.oracle.com/errata/ELSA-2026-84588.html)   | Moderate          | perl-URI                                                                                                                                                                                      |
| [ELSA-2026-84594](https://linux.oracle.com/errata/ELSA-2026-84594.html)   | Moderate          | environment-modules                                                                                                                                                                           |
| [ELSA-2026-85958](https://linux.oracle.com/errata/ELSA-2026-85958.html)   | Moderate          | openssh, openssh-clients, openssh-server                                                                                                                                                      |
| [ELSA-2026-89745](https://linux.oracle.com/errata/ELSA-2026-89745.html)   | Moderate          | bind-libs, bind-license, bind-utils                                                                                                                                                           |
| [ELSA-2026-89749](https://linux.oracle.com/errata/ELSA-2026-89749.html)   | Moderate          | xz, xz-devel, xz-libs                                                                                                                                                                         |
| [ELSA-2026-92907](https://linux.oracle.com/errata/ELSA-2026-92907.html)   | Moderate          | curl, libcurl                                                                                                                                                                                 |
| [ELSA-2026-93930](https://linux.oracle.com/errata/ELSA-2026-93930.html)   | Moderate          | kernel-headers, kernel-tools, kernel-tools-libs, perf, python3-perf                                                                                                                           |
