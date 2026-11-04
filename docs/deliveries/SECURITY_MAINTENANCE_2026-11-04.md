# Manutenção controlada de segurança — 04/11/2026

## Estado da entrega

**Preparação local; nenhuma correção aplicada à OCI.** A produção permanece na release
`d0645b457960b6830d6f8e87cb6e1a6fa461ebf6-142ded2d5295`.
Instalação de pacotes, troca de runtime, publicação, reinícios e reboot exigem um plano
específico aprovado depois das provas de recuperação e compatibilidade.

Checkout original: branch `daniel`, HEAD `d0645b457960b6830d6f8e87cb6e1a6fa461ebf6`.
Os quatro scripts não rastreados do operador foram preservados.
Branch isolada: `security/20261104-controlled-maintenance`.
Nenhuma lógica de negócio, fonte de frontend/backend, schema, migration, autenticação,
integração ou regra de rede foi alterada.

## Baseline real da produção

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

## Vulnerabilidades e decisão mínima

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

## Validação isolada

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

## Situação da recuperação do sistema

A consulta de boot volumes com a identidade operacional retornou
NotAuthorizedOrNotFound. O operador autenticou o console OCI; a página inicial
mostrou a instância Running, mas a consulta de detalhes não carregou e a navegação
subsequente apresentou erro de rede. Nenhum snapshot foi criado e a existência
de backup de boot recuperável não foi confirmada. Não ampliar IAM para contornar
a limitação. A intervenção no SO/runtime permanece bloqueada por essa prova.

## Recuperação, implantação e autorização

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

## Arquivos e evidências

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

## Referências oficiais

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

## Inventário seletivo Oracle Linux

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
