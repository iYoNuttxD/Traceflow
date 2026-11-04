# Implantação de segurança OCI — plano de 04/11/2026

## Estado e escopo

**PROPOSTO; NÃO EXECUTADO; SEM GO PRODUTIVO.**
Este procedimento depende dos gates do
[relatório](../deliveries/SECURITY_MAINTENANCE_2026-11-04.md).
Nenhuma instrução de escrita abaixo está autorizada pela etapa 2.

Escopo mínimo proposto: Node oficial 22.23.4 lado a lado e release backend com qs 6.16.2.
Manter follow-redirects 1.16.2 no lockfile frontend. Não modificar código funcional,
schema, migrations, dados, autenticação, Cloudflare, DNS, NSG, firewall ou SELinux.
Tratar patches do SO em lotes independentes. Não atualizar Nginx por número upstream.

## Gates antes de agendar

| Gate           | Condição exigida                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Identidade     | Mesma instância/boot volume/AD dos registros protegidos, release ativa e checkout exatos                                            |
| Saúde          | API/HTTPS 200, MySQL acessível, um worker, heartbeat e quatro jobs dentro dos limites; logs comparados ao baseline                  |
| Recuperação    | Backup de boot AVAILABLE e ensaio recuperável; captura atual de aplicação com restore comprovado; artefato anterior externo íntegro |
| Recursos       | Espaço para release nova + anterior + runtime + staging + RPMs/rollback, sem apagar dados; memória e margem de operação             |
| Concorrência   | Nenhum CD, backup, restore, migração ou retenção em execução; usar locks existentes, não remover lock para prosseguir               |
| GitHub externo | Credenciais/repositório de teste e resultado, ou decisão humana explícita sobre a lacuna registrada                                 |
| Autoridade     | Revisão exata de hashes de builder e bases systemd; trust policy aprovada, sem ampliar trustedWorkflowShas indiscriminadamente      |
| Artefato       | CI/gates da pipeline oficial no commit aprovado; assinatura e digest conferidos; schema e migrations idênticos                      |
| Autorização    | Lista exata de pacotes/arquivos/serviços, janela, interrupção esperada e plano de rollback aprovados                                |

Se um gate falhar, interromper a intervenção correspondente e preservar a aplicação.
Não interpretar disponibilidade de backup ou acesso administrativo como prova de restore.

## Recuperação — autorização separada

### Ensaio de boot proposto

Nenhum backup de boot existia no escopo consultado em 04/11. Antes de intervenção
em runtime/SO, solicitar autorização específica para:

1. Criar um backup completo do boot de 47 GB, sem parar a VM, preservando o volume
   original. Aguardar AVAILABLE e registrar identidade, timestamp, estado, tamanho
   e chave Oracle. É uma captura crash-consistent; não inclui o HeatWave externo.
2. Restaurar para um volume temporário no AD compatível. Definir previamente capacidade,
   quotas, disponibilidade Ampere, prazo de retenção e limite financeiro aprovado.
   Não prometer custo zero nem capacidade apenas por ser Always Free.
3. Preparar helper/rede temporários exclusivos. Montar a cópia antes de tentar boot;
   nunca anexar ou modificar o volume original. Conferir hashes, owners, modos,
   certificados/configurações e releases em montagem de leitura segura
   (filesystem/journal compatível; não executar fsck reparador sobre o original).
4. **Antes do primeiro boot da cópia**, impedir offline o início das units/timers
   API, worker, CD, retenção, backup, monitor e alertas e revisar todos os demais
   autostarts. Aplicar somente à cópia restaurada. Impedir egress da cópia para
   banco produtivo, GitHub, SMTP, bucket/Vault e outros destinos de produção.
   Validar também que a identidade da cópia não recebe acesso por regra IAM ampla.
5. Somente depois do isolamento comprovado, bootar a cópia com configuração
   sintética e banco separado. Verificar boot, SSH/console, systemd, SELinux Enforcing,
   arquivos/permissões e aplicação. Não conectar as credenciais copiadas a serviços reais.
6. Medir tempos de restauração e boot, conferir critérios de sucesso e registrar RTO/RPO.
   Restaurar volume sem testar boot comprova recuperação de arquivos, não recuperabilidade
   integral da instância. Preservar a prova e combinar descarte/retenção dos recursos.

IAM observado: operador no grupo Administrators e política
`ALLOW GROUP Administrators to manage all-resources IN TENANCY`.
A identidade da VM não tem essa capacidade; não ampliar seu IAM por conveniência.
O acesso atual não prova quotas, disponibilidade de instância ou operação de restore.

Em recuperação real, preferir reparo/troca do boot da instância existente quando
tecnicamente possível, mantendo endpoint e identidades sob revisão. Uma instância
nova pode mudar IP público, VNIC, acesso a Vault/bucket e regras ligadas ao instance OCID.
Não alterar DNS/Cloudflare/rede ou reanexar um boot restaurado sem plano específico.
Nunca iniciar uma cópia antiga com worker/CD ativos contra o MySQL atual.

### Ensaio de aplicação proposto

Usar somente o objeto atual SUCCESS no prefixo `production-live-v1/`. Conferir
recibo, tamanho, SHA e readback externo, sem criar captura na etapa 2.
O GET de 04/11 validou o cifrado, não a chave nem o conteúdo restaurado.

Preparar destino novo, cifrado, sem egress para produção. A chave age permanece na
custódia do operador e entra somente em TTY protegido; nunca em chat, log ou argumentos.
O helper atual exige MySQL 26.7.0 e o Mac/HeatWave observados têm 26.10.0:
preparar e testar um ambiente pinado compatível ou revisão explícita desse pin,
com provas sintéticas antes do restore autorizado. Não retirar a guarda de versão,
alterar contagens para obter PASS nem trocar o MySQL corrente do operador.

Conferir todas as 74 tabelas, 86 migrations, 145 FKs, hashes de dados/DDL, referências
de storage e configurações da captura efetiva. Os números não substituem o manifest.
Medir restauração, verificar destino/UUID distintos e encerrar processos do ensaio.
O backup atual não arquiva todo o SO nem o novo runtime em /opt; custodiar os
artefatos assinados e sua reconstrução fora da VM, além do backup de boot.

## Preparação do runtime — somente após GO específico

Artefato aprovado: `node-v22.23.4-linux-arm64.tar.xz`.
SHA tar: `6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b`.
SHA binário: `7e48183361053f039294fbbc3ba586722fe756bf296d6cb8195356d10819cd16`.
Chave Node: `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`;
keyring pin `481637f813e912c4aa3622d7964ab426c97b8e8d`.
Revalidar o aviso oficial e a versão 22 disponível na data de execução; não trocar
o artefato homologado silenciosamente.

1. Conferir novamente saúde, identidade, recursos e recuperação. Preservar bytes,
   ownership, modos, ACLs e contextos dos arquivos afetados em custódia root,
   inclusive as três bases systemd, drop-ins atuais, configuração CD/trust policy,
   proxy/Nginx e o alvo anterior do seletor. Não incluir segredos em evidência pública.
2. Transferir tar e SHASUMS assinado para staging root. Validar assinatura com keyring
   pinado, fingerprint e checksum antes de executar. Recusar links/membros inesperados.
3. Extrair em caminho novo e exclusivo
   `/opt/traceflow-live/runtimes/node-v22.23.4-linux-arm64`, root:root,
   diretórios 0755, binário 0755, sem escrita por conta da aplicação.
   Preservar links internos legítimos do tar; conferir cadeia de diretórios e SELinux.
   Usar restorecon conforme política existente; não desabilitar SELinux nem adicionar
   regras permissivas. O laboratório executou com os contextos existentes.
4. Conferir versão, hash, dependências ELF, biblioteca Prisma e HTTPS/TLS.
   Não instalar sobre `/usr`, `/usr/local` ou usar alternatives/nvm para sobrescrever
   o mecanismo RPM. Não alterar certificados ou variáveis de autenticação.
5. Criar/selecionar o link root `selected` por rename atômico no mesmo filesystem.
   Preservar o alvo anterior. A mera troca do link não atualiza processos em execução.
6. Nas bases `/etc/systemd/system/traceflow-live-{api,worker,retention}.service`,
   acrescentar apenas esta diretiva na seção Service, após comparar o arquivo
   completo ao fingerprint aprovado:

```ini
BindReadOnlyPaths=/opt/traceflow-live/runtimes/selected/bin/node:/usr/bin/node-22
```

O destino deve continuar sendo o arquivo regular para o qual `/usr/bin/node` aponta.
Conferir isso na VM; se o RPM mudar esse contrato, interromper e homologar novamente.
Não prefixar a origem com `-`: a ausência do runtime deve impedir inicialização,
sem fallback silencioso vulnerável. Não limpar listas de sandbox existentes.

Essa posição na unit base é necessária porque a fábrica CD lê a base para criar
o candidato e reescreve ExecStart nos drop-ins. Um override isolado em 40-*.conf
não alcança necessariamente o candidato. Não pinçar o caminho da aplicação em
um override que impeça releases futuras.

7. Validar as units e seu diff; atualizar somente os fingerprints revistos em
   `protectedFiles` e os dois hashes do builder em `authorityFiles` da trust policy.
   Preservar o documento anterior. O valor novo deve resultar da comparação humana
   do conteúdo exato, não de recalcular toda a política cegamente.
   Não executar o instalador do receiver, não alterar credenciais/trustedWorkflowShas
   por conveniência e não dar acesso adicional à conta da aplicação.
8. Executar daemon-reload somente na janela autorizada. A API/worker ainda ativos
   conservam o runtime anterior até reinício. Não declarar correção efetiva nessa fase.

A seleção vale somente para as units que recebem o bind. O Node de shells e
migradores transitórios independentes continua RPM. Esta release não executa DDL.
Antes de qualquer migração futura, homologar sua seleção explícita de runtime;
não supor herança da namespace da API ou do receiver.

DNF continua responsável por seus próprios pacotes. O runtime oficial exige acompanhar
avisos Node, verificar novos artefatos e homologar cada seleção futura. Não usar
`dnf update nodejs` como prova de atualização do runtime oficial selecionado.

## Release e ativação controlada

`qs` requer uma release backend imutável. Nenhum fonte funcional/schema/migration mudou.
O frontend ARM64 validado é byte a byte igual aos 71 arquivos publicados.

Usar a pipeline oficial e seus gates/assinatura/aprovação humana no commit final.
O protocolo existente empacota e copia frontend junto; não criar um deployer
backend-only para esta manutenção. A aprovação deve explicitar essa cópia protocolar
de conteúdo idêntico. Comparar os 71 hashes antes de promover; preservar também os
184 assets históricos que o receiver copia. Não publicar alteração visual/conteúdo,
não fazer um deploy frontend separado e não remover assets antigos.

O build de homologação local não é uma release oficial assinada. Nenhum push,
workflow remoto ou release foi criado na etapa 2. Após autorização para essa etapa,
conferir exato app SHA/workflow SHA, todos os checks e os dois builds reprodutíveis
exigidos pela pipeline. Se hash, schema, migrations, authority ou artefatos diferirem
do aprovado, interromper.

Sequência prevista, reutilizando o protocolo atual:

1. Revalidar os gates e ausência de operação concorrente. Documentar interrupção
   possível e responsáveis pelo retorno. Não prometer indisponibilidade zero.
2. Preparar o runtime/base units/fingerprints aprovados, conservando processos ativos.
3. Pipeline produz e assina o pacote; validar digest, provenance, auditorias e frontend
   idêntico. A aprovação humana libera apenas essa promoção concreta.
4. Receiver valida preservação, schema idêntico, captura atual e release anterior.
   Nenhum migrador/seed/limpeza deve executar. Recusar transição de schema.
5. Candidato temporário na porta local 3002 deve executar Node 22.23.4 + qs 6.16.2,
   responder readiness e passar smoke antes de receber tráfego.
6. Receiver usa seu proxy temporário e promove API/worker com os drop-ins existentes,
   reiniciando somente esses serviços de aplicação. Jobs acompanham o worker.
   Retenção usa o runtime selecionado no próximo disparo; não forçar apply manual.
   Recarregamento de Nginx/proxy da CD é necessário ao protocolo, sem upgrade do Nginx.
7. Confirmar saúde e runtime depois de cada fase; voltar tráfego à API oficial,
   parar apenas o candidato e manter release/artefatos anteriores.
8. Monitorar por pelo menos 30 minutos com a infraestrutura existente: readiness,
   5xx/p95, memória, disco, reinícios, heartbeat, falhas e idade das quatro leases,
   logs comparados ao baseline. Não disparar retenção para demonstrar funcionamento.

Verificação do executável real, com privilégios de leitura adequados:

```sh
pid=$(systemctl show --value --property=MainPID traceflow-live-api)
test "$pid" -gt 0
sudo /proc/"$pid"/exe --version
sudo sha256sum /proc/"$pid"/exe
sudo readlink /proc/"$pid"/exe
```

Repetir para worker e candidato enquanto ativo; comparar o hash esperado, não apenas
readlink. Dentro do bind o caminho permanece `/usr/bin/node-22`.
Conferir a ausência de mapeamento do antigo libnode/Brotli/SSL pelo Node principal;
o engine nativo Prisma pode legitimamente carregar o OpenSSL do SO.
No próximo disparo de retenção, conferir versão/hash de seu processo/journal
sem expor ambiente. Um processo oneshot já encerrado exige evidência do disparo efetivo.

Smokes: readiness, anônimo 401, HTML esperado/71 hashes, MySQL, um worker, quatro jobs,
logs, Nginx/Cloudflare. Auth e integração com escrita usam contas/bases de teste.
Não criar login/projeto ou disparar sync de usuário real como teste destrutivo.
O cliente Python teve 403 enquanto curl do receiver/monitor teve sucesso;
usar o cliente contratado e preservar qualquer divergência sem mudar o WAF.

## Oracle Linux — lotes separados e sem reboot automático

Consultar [plano resolvido](../deliveries/evidence/security-20261104/stage2-dnf-plan.json).
Antes de instalar, refazer somente a simulação, comparar pacote a pacote com a lista
aprovada e rejeitar dependência nova. O modelo atual usa metadados de datas distintas;
não é autorização permanente para solver com repositórios futuros.

Exemplos de simulação para uma futura janela aprovada; **não rodados na produção nesta etapa**:

```sh
sudo dnf --assumeno --exclude='nginx*' upgrade-minimal --security ca-certificates
sudo dnf --assumeno --exclude='nginx*' upgrade-minimal --security ca-certificates libbrotli pcre2 pcre2-syntax python3 python3-libs python-unversioned-command python3-urllib3 python39-oci-sdk expat
```

Para execução futura, fixar os advisories/NEVRAs/digests aprovados, gpgcheck ativo,
RPMs novos/anteriores em custódia e transação sem mudanças surpresa. Não retirar
assumeno até haver autorização específica para aquele lote.

- Certificados: lote de um pacote, ELSA-2026-88459 e 500450; testar regeneração do
  trust store e TLS dos destinos reais. Preservar anchors e permissões. Seu downgrade
  pode reintroduzir confiança revogada: recuperação emergencial, sem declarar segurança corrigida.
- SO ativo: dez pacotes sem Node RPM. pcre2 está em Nginx, systemd e muitos daemons;
  expat/Python afetam serviços de sistema; Brotli está em NetworkManager. Revisar
  scriptlets, lock da política SELinux e plano de recarga de bibliotecas.
  Não reiniciar firewall ou rede automaticamente, nem presumir que reload do Nginx
  troca suas bibliotecas. Exige janela/recuperação própria.
- Node RPM: cinco pacotes adicionais levam a 22.23.2-2.0.1, somente cobertura
  comprovada de Brotli. Não substituem o runtime oficial completo nem são uma
  atualização major. Manter esse lote separado se necessário para consumidores do RPM.
- Grupo amplo: 52 upgrades + uma instalação traz glibc, openssh e política SELinux;
  não aplicar em bloco por conveniência. WebKit/libsoup e demais avisos continuam
  registrados, mesmo sem uso de serviço demonstrado.
- UEK: oito instalações paralelas de 6.12.0-208.112.5; preservar kernel anterior,
  confirmar /boot/EFI, espaço, console, boot target e drivers ARM64. Instalar não
  corrige kernel em execução. Qualquer reboot necessita plano e autorização próprios.
  Os pacotes auxiliares RHCK 5.14 do inventário também não foram incluídos no lote UEK.

O modelo de downgrade dos 15 pacotes validou somente solução e cabeçalhos. Antes de
uso real, ensaiar a transação/scriptlets em clone compatível e revalidar os RPMs
anteriores; `dnf history undo` isoladamente não garante recuperação.

## Rollback por etapa

Disparadores: candidato sem readiness, hash/version diferente, auth incompatível,
novos erros de banco/integração, worker ausente, falhas de jobs, 5xx ou degradação
relevante frente ao baseline. Parar etapas seguintes imediatamente.

| Etapa que falhou              | Retorno                                                                                                                | Prova exigida                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Preparação antes de reiniciar | Restaurar bytes das bases/política e seletor anterior; daemon-reload aprovado                                          | PIDs antigos ativos, fingerprints originais e saúde                          |
| Release                       | Usar restore_previous/recuperação do adaptador CD atual e releases/drop-ins/proxy preservados                          | Readiness da release anterior, worker/jobs, estado CD e frontend preservados |
| Runtime                       | Selecionar atomicamente alvo anterior; se não havia runtime externo, `/usr` reproduz o RPM; reiniciar somente afetados | /proc/PID/exe com hash/version anteriores, saúde e sandbox preservado        |
| RPMs                          | Transação inversa exata com RPMs assinados preservados, após ensaio; se falhar, plano de recuperação de boot           | NEVRAs, scriptlets/configs, bibliotecas dos processos e saúde                |
| Kernel/boot                   | Boot do kernel anterior ou recuperação de boot ensaiada pelo console                                                   | Sistema acessível e aplicação saudável sem regressão dos dados               |

A troca atômica do seletor não troca os processos já em execução. Não usar ln -sfn
como prova de atomicidade: criar symlink temporário no mesmo diretório e fazer rename.
O alvo `/usr` é fallback para o RPM existente, cujas vulnerabilidades reaparecem;
a prova local usou RPM -2.0.1 e a VM ainda tem -2. Preservar esses bytes/NEVRAs reais.

Se qs falhar, a release ativa anterior funcionou com Node 22.23.4 no laboratório:
pode-se retornar apenas a aplicação, conservando o runtime seguro se ele estiver saudável.
Se o runtime falhar, retornar também seu seletor/bases conforme o escopo atingido.
A recuperação da CD não restaura automaticamente a seleção global do runtime:
verificar os dois estados. Não executar rollback-to-maintenance como retorno funcional.

Não restaurar o banco para desfazer um patch de runtime/dependências sem DDL:
isso descartaria alterações legítimas de usuários. Restore do HeatWave exige
procedimento e autorização próprios. Nunca executar git reset --hard, limpeza de
dados, migrations inversas ou troca improvisada de DNS para recuperar esta manutenção.

## Encerramento e registro

Registrar commit, assinatura/digests, diferenças autorizadas, RPMs/NEVRAs, backup/restore,
horários, serviços efetivamente reiniciados, PIDs/hashes, schema preservado e monitoramento.
Não declarar CVE corrigida em produção pelo teste local, pela presença do tar ou pela
versão do shell SSH. Fechar somente após comprovar cada consumidor afetado e os gates.

## Fontes oficiais

- [Node 22.23.4 e artefato ARM64](https://nodejs.org/en/blog/release/v22.23.4)
- [Verificação das distribuições Node](https://github.com/nodejs/node/blob/v22.23.4/README.md#verifying-binaries)
- [Chaves de releases Node](https://github.com/nodejs/release-keys)
- [Plataformas e ABI Node](https://github.com/nodejs/node/blob/v22.23.4/BUILDING.md)
- [Namespaces de bind do systemd 252](https://www.freedesktop.org/software/systemd/man/252/systemd.exec.html#BindPaths=)
- [Restauração de boot Oracle](https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/create-restore-bv-boot-volume-backup.htm)
- [Permissões Core Services OCI](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/corepolicyreference.htm)
- [Atualização seletiva DNF Oracle](https://docs.oracle.com/en-us/iaas/oracle-linux/oci/security-updates-using-dnf.htm)
