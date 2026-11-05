# Implantação de segurança OCI — plano de 04/11/2026

## Estado e escopo

**PROPOSTO; NÃO EXECUTADO; SEM GO PRODUTIVO.**
Este procedimento depende dos gates do
[relatório](../deliveries/SECURITY_MAINTENANCE_2026-11-04.md).
A etapa 3 autoriza somente um backup manual FULL se a franquia gratuita for comprovada.
Instalações, configuração, publicação, restarts, recursos temporários e reboot continuam sem autorização.

Escopo mínimo proposto: Node oficial 22.23.4 lado a lado e release backend com qs 6.16.2.
Manter follow-redirects 1.16.2 no lockfile frontend. Não modificar código funcional,
schema, migrations, dados, autenticação, Cloudflare, DNS, NSG, firewall ou SELinux.
Tratar patches do SO em lotes independentes. Não atualizar Nginx por número upstream.

## Etapa 3 — estado dos gates e roteiro fechado

**Documento preparado; não executar em produção sem o GO correspondente.**
A autorização vigente cobre somente um backup FULL se comprovadamente gratuito;
não cobre os comandos de escrita/ativação deste runbook.
As provas novas estão em
[stage3-validation.json](../deliveries/evidence/security-20261104/stage3-validation.json).
As seções posteriores conservam detalhes do protocolo; este roteiro incorpora os
resultados reais do laboratório e os bloqueios atuais.

| Gate                                                | Estado corrente                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| Node oficial/Prisma/Argon2/API/worker/jobs ARM64    | APROVADO                                                              |
| Instalação, downgrade e reaplicação dos dez RPMs    | APROVADO no laboratório, com limites de kernel/inventário registrados |
| Release candidata local e 97 regressões pós-patch   | APROVADO                                                              |
| Cinco leituras públicas GitHub                      | APROVADO para transporte/mapeamento, sem autenticação                 |
| Backup boot gratuito / recuperação da VM            | BLOQUEADO / PENDENTE                                                  |
| Restore da captura cifrada atual                    | PENDENTE                                                              |
| Sincronização GitHub App autenticada                | BLOQUEADO ou aceitação explícita do responsável                       |
| CI remoto/release assinada                          | PENDENTE                                                              |
| Recarga integral de bibliotecas dos processos do SO | PENDENTE                                                              |
| GO de implantação, instalação ou restart            | NÃO CONCEDIDO                                                         |

### 1. Backup e checkpoint pré-implantação

Consulta comprovada: boot 47 GB Available Always Free, OCID
`ocid1.bootvolume.oc1.sa-saopaulo-1.abtxeljrzjtjdrfaswr4ngc6ausrjdp6ehomnvcq3lxqe7cdg5tor3wxldya`,
AD JEpm:SA-SAOPAULO-1-AD-1, chave Oracle, política None e replicação Off.
Lista do volume vazia; lista global em loading no acesso automatizado.
**Não criado:** falta comprovar os slots combinados de backups e elegibilidade da
região principal antes de usar a autorização condicional.

Com CLI/API de operador já autenticado, fazer somente GET/list inicialmente:
identificar home region, compartimentos acessíveis ativos, listar boot/block backups
em cada compartimento da região principal com todas as páginas e estados, e consultar
limites/uso. Uma consulta root sem subcompartimentos não é inventário da tenancy.
Contar também operações em criação e recursos que ainda ocupem a franquia.
Não ampliar IAM nem criar API key, token ou Cloud Shell por conveniência: o primeiro
uso de Cloud Shell pode criar armazenamento persistente, fora da autorização atual.

Condição de criação: São Paulo confirmada como região principal elegível, boot
Always Free, no máximo quatro backups combinados ocupando a franquia e nenhum
aviso/campo de cobrança. Registrar evidências sem segredos. Se não puder comprovar
qualquer condição, parar antes de create, sem pedir novamente GO genérico.

Depois de confirmar a condição, criar **uma única** captura FULL com o serviço oficial
Boot Volume, nome `traceflow-security-prepatch-20261104`, mesma região/compartimento e
chave Oracle. Não mudar política, retenção com lock, replicação ou chave.
Se usar CLI, revisar estes parâmetros; gerar e preservar um único opc-retry-token
antes da chamada, reutilizando-o em repetição de transporte para impedir duplicatas:

```sh
oci bv boot-volume-backup create \
  --region sa-saopaulo-1 \
  --boot-volume-id ocid1.bootvolume.oc1.sa-saopaulo-1.abtxeljrzjtjdrfaswr4ngc6ausrjdp6ehomnvcq3lxqe7cdg5tor3wxldya \
  --type FULL \
  --display-name traceflow-security-prepatch-20261104 \
  --opc-retry-token "$backup_retry_token"
```

Consultar o OCID retornado até AVAILABLE e registrar tipo, volume de origem,
tamanho lógico/efetivo, criação, estado, região, criptografia e condição de gratuidade.
Resposta incerta não autoriza criar outra captura; primeiro consultar a operação.
Não parar serviços para obter o backup. A captura online é crash-consistent e não
contém o HeatWave externo. AVAILABLE não prova restauração.

Preparar ensaio específico, ainda **não autorizado**:

| Recurso temporário máximo proposto                   | Finalidade / condição                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1 VM ARM64 1 OCPU/6 GiB                              | Helper novo, sem credenciais/IAM de produção; disponibilidade/custo ainda não comprovados                                    |
| 1 boot limpo de 47 GB + 1 volume restaurado de 47 GB | Helper e cópia; volume original não é tocado; 94 GB adicionais dependem do uso total/quotas                                  |
| Rede temporária isolada                              | Sem peering, NAT ou acesso a HeatWave/GitHub/SMTP/Vault/bucket; console operacional próprio e regras exclusivamente de teste |
| Prazo de até 4 horas, sem retenção automática        | Registrar custos estimados e limite financeiro antes de solicitar autorização; descarte também deverá ser autorizado         |

A franquia atual não prova disponibilidade Ampere nem gratuidade da VM temporária.
Não usar a capacidade da VM produtiva. Antes de criar, apresentar orçamento real,
quotas/uso, AD/shape e acesso por console, com operador responsável. Após autorização,
restaurar a cópia, anexá-la somente ao helper e inspecionar em montagem segura.
Validar hashes/permissões/configs/releases. Modificar apenas a cópia offline para
mascarar serviços/timers/autostarts e remover a possibilidade de usar credenciais
copiadas; não inicializar a cópia antes de comprovar isolamento e ausência de grants
IAM herdados por regras amplas. Preservar o backup original recuperável intacto.

Depois, parar apenas o helper e trocar **seu** boot temporário pela cópia preparada,
mantendo a rede isolada. Verificar boot, console/SSH, SELinux/systemd e aplicação com
configuração sintética e banco separado. Isso requer compatibilidade da troca de boot
e permissões verificadas antes de agendar. Se houver impedimento técnico, apresentar
variante com segunda VM para autorização, sem criar recursos além do limite aprovado.
Medir RTO/RPO. Restore de arquivos sem boot não fecha o gate de recuperação integral.

O restore da aplicação deve usar ambiente independente compatível com o helper
MySQL 26.7.0, chave age sob custódia do operador e destino/UUID distintos. Não retirar
o pin para acomodar MySQL 26.10.0 sem validação específica. Conferir manifest atual,
74 tabelas, 86 migrations, 145 FKs, hashes de dados/configs/storage e funcionalidade
com integrações externas bloqueadas. Não restaurar nem escrever no HeatWave produtivo.

### 2. Correção de runtime e preparação da release

Somente após os gates de recuperação e autorização exata:
capturar baseline contemporâneo (release/CD, 27 fingerprints protegidos com owners,
modos/ACLs/contextos, PIDs/executáveis, estado dos serviços, métricas, disco/memória,
locks e logs recentes). Preservar tudo em custódia root e fora do boot afetado.
Conservar o artefato ativo verificado e os 184 assets históricos.

Extrair o tar oficial autenticado no caminho exclusivo descrito na seção de runtime;
validar ELF/GLIBC, OpenSSL e hash. Preparar seletor atômico e a única diretiva de bind
nas bases API/worker/retention. Preservar bytes anteriores e revisar fingerprints
da trust policy; não tocar ExecStart, env, certificados ou conta. daemon-reload é uma
mudança produtiva e depende do GO. Não reiniciar API/worker nesta preparação.

Candidato local aprovado:
`2ed99fe7c51c4d343e6f18cd82c40eb4742f1595`,
SHA `9609a448680cd950fb5775f022bb59b9cba283ef5da69d2282b877d781c63bf3`.
Ele não é release oficial assinada. Seguir
[PR/CI preparado](../deliveries/SECURITY_PR_2026-11-04.md):
autorizar push/PR em rascunho para os checks, revisar HEAD/base exatos e dois builds.
Não executar workflow_dispatch/promote=true nem criar oci-cd-* durante homologação.
A publicação assinada é acoplada à ativação pelo receiver.

Em futura publicação aprovada, usar app_sha final, workflow_sha revisado,
baseline_sha da release efetiva (observada d0645b457960b6830d6f8e87cb6e1a6fa461ebf6),
transition_sha256 vazio. O baseline padrão b9c1beb9... do workflow é histórico.
Recusar qualquer divergência de schema/86 migrations/autoridade ou novo conteúdo
frontend. Não modificar workflow/main para contornar o gate.

### 3. Publicação das dependências e ativação do runtime

Um único ciclo do protocolo atual deve carregar Node oficial e qs corrigido:
candidato 3002 → readiness/smokes → tráfego temporário → API/worker oficiais →
tráfego de volta e encerramento do candidato. Aplicar somente drops-ins de release
produzidos pelo receiver. Não executar migração/seeder/limpeza.

Confirmar em cada processo principal `/proc/PID/exe --version`, SHA oficial,
caminho, libnode/OpenSSL/Brotli mapeados e dependência Prisma. Confirmar qs 6.16.2
no WorkingDirectory da release efetiva. Frontend: mesmos 71 hashes e 184 assets
históricos preservados; follow-redirects 1.16.2 no lock, fora do bundle browser.

Reiniciar apenas API e worker no ciclo CD aprovado. Jobs acompanham o worker;
retention recebe o runtime no próximo disparo legítimo, sem forçar apply.
O laboratório encontrou StartLimitBurst=3/300s intacto: conferir partidas recentes
antes da janela e reservar margem para rollback. Não resetar failed nem aumentar
limites para forçar repetidas partidas.

### 4. Patches selecionados do Oracle Linux

Lote fechado: os dez pares antigo/novo, SHA-256, URLs Oracle e nove advisories estão
em [stage3-os-transaction.json](../deliveries/evidence/security-20261104/stage3-os-transaction.json).
Não instalar os pacotes de bootstrap do laboratório. Não incluir Node RPM,
Nginx, kernel, glibc, OpenSSH ou política SELinux neste lote.

Custodiar os vinte artefatos (dez antigos/dez novos), verificar checksums e assinatura
com chaves Oracle confiáveis. Um RPM com NOKEY, digest diferente ou NEVRA fora da lista
interrompe o lote. Revalidar estado instalado e simulação contra inventário aprovado;
metadados/repositórios novos não autorizam aumentar o escopo.

Simular com os nomes/exatos artefatos locais, repositórios desabilitados e
localpkg_gpgcheck/gpgcheck ativos. Inspecionar o conjunto instalado/removido:
primeiro CA (um upgrade + um pacote substituído), depois os nove restantes
(nove upgrades + nove substituídos). Nenhuma instalação adicional ou erase de
outro nome é aceitável. Exemplos de formato, com cada argumento vindo do JSON fechado:

```sh
sudo dnf --disablerepo='*' --setopt=gpgcheck=True \
  --setopt=localpkg_gpgcheck=True --assumeno upgrade /root/checkpoint/rpms-new/ca-certificates-2026.2.92_v9.0.319-90.3.el9_8.noarch.rpm
```

O segundo comando deve enumerar os nove arquivos restantes do manifesto fechado,
sem wildcard, allowerasing ou upgrade geral. Remover assumeno somente depois da
aprovação da transação concreta, usando as mesmas entradas. A instalação foi
ensaiada localmente com DNF/RPM/scriptlets; a simulação produtiva ainda será gate
antes de qualquer escrita.

Após CA: conferir anchors preservados, trust store regenerado, TLS verificado dos
destinos contratados e rejeição de CA não confiável. Parar se houver regressão.
Após os nove: conferir NEVRAs, logs/recursos e mapas de bibliotecas dos consumidores.

**PCRE2:** restart controlado do Nginx é necessário; reload da CD não basta.
Rodar nginx -t antes e depois, preservar configuração/certificados, registrar
master/workers e inodes carregados. Esse restart requer autorização e pode causar
interrupção breve; não prometer impacto zero.

O Node oficial embute suas bibliotecas corrigidas, mas Prisma pode usar OpenSSL
do SO, e daemons do sistema mantêm DSOs antigas. API/worker não precisam de novos
restarts apenas por conveniência após a promoção já concluída. PID1, NetworkManager,
firewalld e consumidores Python requerem plano específico; não reexecutar PID1,
reiniciar rede/firewall ou fazer reboot como continuação implícita deste lote.
Se for necessária recarga que não possa ser feita com segurança na janela, manter
o gate pendente e preparar janela separada com recuperação comprovada.

Kernel/grupo amplo continuam fora desta execução: não declarar o SO sem altas/críticas
com base somente nestes dez pacotes. Caso Kernel/boot precise mudar, apresentar
plano de console, kernel anterior, espaço/EFI, ARM64/drivers e autorização próprios.

### 5. Saúde, testes de produção e monitoramento

Verificar após cada lote: readiness 200, HTTPS pelo cliente contratado 200,
auth anônimo 401, HTML/hashes esperados, conexão MySQL já aferida pelo readiness/monitor,
um worker com heartbeat <=90 s, quatro jobs sem novas falhas, zero reinícios inesperados,
nginx -t, SELinux Enforcing e firewalld ativo. Não exibir valores de env/tokens.

Autenticação com escrita somente com conta de teste autorizada; sem ela, registrar
limite da prova. Consultas de projetos/GitHub existentes só em leitura autorizada,
sem disparar reconciliação, reimportação ou hooks artificiais. Observar as execuções
agendadas legítimas e seus estados. Não usar conta de usuário real para teste de escrita.

Sem teste autenticado GitHub prévio, obter aceitação explícita antes do GO; se aceita,
o smoke pós-deploy pode observar heartbeat, backlog/erros e próxima sincronização
legítima sem modificar escopo/permissões ou forçar sync de projeto real.
Esses smokes não transformam em “testado” o OAuth/refresh/webhook que não foi exercido.

Monitorar pelo menos 30 min com métricas/logs atuais, anotando baseline e deltas de
readiness/5xx/latência/memória/restarts/worker/jobs. Relatório final deve distinguir
arquivo preparado, pacote instalado e processo efetivamente carregando a correção.

### 6. Critérios de interrupção e retorno

Interromper imediatamente próximas alterações por: hash/NEVRA/schema/autoridade fora
do aprovado; candidato sem readiness no timeout original; auth inesperada; erro
Prisma/TLS novo; workerCount diferente de 1 ou heartbeat >90s; nova falha de job;
reinício inesperado/StartLimit; erro de Nginx/HTTPS ou regressão confirmada atribuível.
Degradação sustentada de latência/5xx frente ao baseline também impede prosseguir.
Não aumentar timeout/limite/retry para obter PASS.

Antes de tráfego: parar candidato e restaurar preparação que falhou; processos antigos
devem permanecer ativos. Depois de tráfego: usar recuperação `restore_previous` do
adaptador atual e os bytes/drop-ins/proxy/release preservados. Conferir frontend,
estado CD, worker/jobs e versão real do Node. Se só a release falhar, pode manter
Node 22.23.4 já validado com a release anterior. Se o runtime falhar, restaurar
bases/fingerprints e selecionar alvo anterior atomicamente; conferir a margem
StartLimit antes de reiniciar somente unidades afetadas.

RPMs: simular e revisar downgrade exato para os artefatos antigos preservados,
com repositórios desabilitados e assinatura ativa. Somente após GO do plano de
recuperação executar a transação inversa fechada e recarregar consumidores aprovados.
Os dez downgrades reais passaram no laboratório; o resultado não garante rollback
após crash/scriptlet interrompido, corrupção ou perda de boot. Não depender de
dnf history undo nem presumir downgrade seguro universalmente. Se falhar ou perder
acesso ao SO, recorrer ao restore de boot ensaiado pelo console; esse gate continua
bloqueado, portanto ainda não há GO de produção.

Não restaurar MySQL, executar migration inversa, reset --hard, limpar dados ou trocar
DNS para desfazer este patch sem DDL. Backup do boot não inclui dados HeatWave.
A volta ao runtime/RPM vulnerável é recuperação emergencial e reabre o risco;
registrar isso e planejar nova correção após recuperar a saúde.

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

Nenhum backup de boot foi comprovado no escopo consultado em 04/11. A criação de
um único FULL já está autorizada somente se a franquia gratuita for comprovada.
Recursos temporários/restauração ainda exigem autorização específica. Antes de
intervenção em runtime/SO, completar:

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
workflow remoto ou release foi criado nas etapas 2 e 3. Após autorização para essa etapa,
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

O modelo inicial validou somente solução e cabeçalhos dos quinze RPMs. A etapa 3
instalou, desfez e reaplicou os dez do grupo sem Node RPM em laboratório compatível;
os cinco RPMs Node adicionais continuam somente no modelo. Antes de uso real,
revalidar todos os artefatos anteriores; `dnf history undo` isoladamente não garante
recuperação.

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
