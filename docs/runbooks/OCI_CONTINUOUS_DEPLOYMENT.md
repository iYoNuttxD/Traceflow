# CD da instalação limpa OCI

Escopo exclusivo: `traceflow_live`, `traceflow-live-api`, `traceflow-live-worker`,
`/etc/traceflow-live`, storage `/var/lib/traceflow-live/test-evidence`.
Não usa controladores antigos, recoveryProof ou ledger legado.

## Promover

1. Escolher o SHA completo aprovado. O workflow vem da `main`, mas o código da
   aplicação vem **somente do SHA informado**. Não usar a branch como identidade.
2. Actions → **OCI Controlled CD** → Run workflow (`main`), `app_sha` completo.
   A PR dos componentes CD já executa build/homologação da baseline sem acesso à produção. `promote=false` também valida sem publicar. Para uma promoção aprovada,
   executar com `promote=true` e revisar o candidato antes de aprovar `production`.
3. A revisão de segurança autorizada `b9c1beb9f6ded49ce9257d346c086a8893f700c9`
   deriva de 9bc3dad: altera somente os lockfiles (Vite também no toolchain de testes backend, follow-redirects e
   transitivas do build) e o gatilho de CI da branch isolada. Fonte backend/frontend,
   schema e migrations são byte-idênticos. A cobertura usa um worker para evitar
   disputa de CPU, sem alterar timeout, asserções ou thresholds. Ela exige CI push
   no SHA exato.
   A revisão funcional anteriormente publicada `9bc3dad199566afc6fa43d67abba400665d843ea`
   conserva sua homologação anterior e recebe agora lint, auditoria, testes de
   runtime e homologação descartável no código exato. Ela não tinha checks antigos
   no GitHub. Outros SHAs precisam também do CI completo existente, em execução
   push concluída e aprovada na revisão exata; nomes de checks sozinhos não bastam.
4. Build em Oracle Linux 9 ARM64, Node 22.23.2/Prisma do lockfile; imagem resolvida
   por digest e registrada. Duas instalações/builds independentes devem produzir
   o mesmo tar.gz. Manifesto inclui versões, source SHA, schema/migrations e todos
   os arquivos/links/checksums. Frontend usa `/api`, sem segredos VITE.
5. Homologação roda em runner hospedado descartável: MySQL `traceflow_cd_test`,
   credenciais sintéticas, storage temporário e nenhum segredo/projeto produtivo.
   Aplica migrations ao banco vazio, inicia API/worker, verifica readiness,
   heartbeat e recusa anônima. Ensaio de falhas da transação não toca a OCI.
6. A aprovação de `production` libera GITHUB_TOKEN efêmero e assinatura GitHub
   OIDC. Publica apenas código e request assinado no prerelease `oci-cd-RUN-ATTEMPT`.
   Não há chave SSH, credencial Oracle ou senha MySQL nos secrets da CD.
7. VM consulta por HTTPS a cada cinco minutos, verifica atestação (repo/workflow/
   ref/source digest exatos, runner hospedado), prazo e hash do pacote. Só aceita
   revisões fixadas ou que conservem exatamente todos os arquivos da autoridade CD
   aprovada (workflow e scripts), verificados no commit autenticado da main;
   política imutável em `/etc/traceflow-live/cd.json` root 0600; estado da release em `/var/lib/traceflow-live-cd/current.json`, também root 0600. O serviço não tem escrita no diretório dos segredos.
8. Receiver mantém lock de deploy e de backup, além de marcador exclusivo antes de instalar. Falha fica terminal
   e preservada; não se repete automaticamente a promoção da mesma autorização.
9. Instala em `/opt/traceflow-live/releases/` e frontend em
   `/var/www/traceflow-live-releases/`, preservando releases anteriores. API candidata
   em loopback 3002 é verificada antes do cutover. Nginx recebe a candidata durante
   a troca da API oficial; worker anterior é encerrado antes do novo. Drop-ins
   alteram somente WorkingDirectory/ExecStart; configurações e sandbox existentes
   continuam sob custódia root. Porta 3002 recebe só o tipo SELinux restrito da API;
   não é aberta no firewall público. Não há runner GitHub na VM.
10. Smoke automático: HTTPS/front index exato, readiness/MySQL, heartbeat e unidades
    backup/monitor/retenção. Resultado root em `/var/lib/traceflow-live-cd/` e recibo
    técnico sem segredos em `/deploy-status/RUN.json`; Actions arquiva o resultado e o conserva como asset da release no GitHub, junto
    ao pacote e request assinado. O código/agenda de backup da S2-10 não são alterados.

## Migrations e rollback — comportamento da primeira versão

O contrato V1 original recusa **antes do cutover** qualquer mudança de schema ou cadeia/checksum de
migrations. Esta promoção da versão existente não executa SQL de escrita nem
migrations. A cadeia de 68 também é confrontada por SELECT com o banco real.

Essa recusa é deliberada: o backup atual possui contratos vinculados ao schema
publicado. Uma futura alteração funcional com migrations exige plano explícito,
compatibilidade expand/contract, backup compatível e migrador sob custódia aprovada
antes de habilitar `prisma migrate deploy` na produção. A primeira entrega demonstrou esse
comando somente no MySQL isolado. A evolução preparada abaixo ainda depende da promoção e
da prova produtiva para ser declarada operacional. Nunca desbloquear conta ou mudar contratos de backup
apenas para obter PASS; não publicar automaticamente funcionalidades da main.

Falha de candidata: serviços/ingress anteriores permanecem. A transação marca
as tentativas antes de cada efeito: escrita do ingress, reload, drop-ins, restart
de cada serviço e publicação do estado. Se nginx -t recusar antes do primeiro
reload, restaura/valida somente os arquivos de ingress; não reinicia API/worker,
não executa reload e não regrava o estado. Reload tentado é tratado como resultado
incerto: restaura e recarrega o ingress anterior. Restaura os drop-ins alterados e
reinicia somente os serviços cujo restart foi tentado; após troca real valida a
readiness anterior. Recibo inclui recuperação complete/incomplete e códigos
sanitizados, preservando a causa original quando a recuperação falha. Não reverte schema nem restaura banco. Qualquer
falha no rollback exige intervenção e preservação da transação. SIGKILL/perda de
VM pode interromper a transação: consultar os arquivos antes de ações manuais,
sem iniciar novo deploy por tentativa. Não usar ferramentas antigas de ativação.

## Custódia e atualização do mecanismo

- `production`: aprovação humana por responsável; branch de workflow permitida
  `main`, sem gatilho push; concorrência global não cancela deploy em andamento.
- Actions oficiais fixadas por SHA. GITHUB_TOKEN mínimo por job; id-token e
  attestations write somente no job de produção aprovado. Artefatos não contêm env.
- Alterar workflow/receiver exige revisão operacional, testes e atualização explícita
  dos hashes da autoridade na trust policy root. Commits funcionais/documentais
  que não alterem nenhum desses arquivos não exigem reinstalar o receptor. Aprovação de código funcional não autoriza
  substituir o receptor ou editar permissões/segredos.
- Código, certificados e registros anteriores preservados; retenção de releases
  requer avaliação posterior de clientes/rollback, sem limpeza automática aqui.
- Recuperação da configuração CD: os backups existentes protegem os segredos,
  CA/TLS e ingress; os artefatos, requests e resultados de promoção ficam também
  na release GitHub permanente. Reconstruir o receiver a partir do workflowSha
  auditado e os drop-ins a partir do appSha/packageSHA verificados; não presumir
  que o snapshot anterior já continha o estado local da CD. A trust policy nova
  deve rejeitar autorizações emitidas antes da reinstalação. Nunca reaproveitar
  a fila antiga ou fabricar marcadores. Nenhuma rotina de backup é substituída.
- RPO alvo 24h/RTO planejado 4h continuam os da S2-10; RTO integral não medido.
  Não criar backup redundante para o deploy desta mesma versão.

## Sandbox Nginx e atualização restrita

A unidade versionada está em `deploy/cd/traceflow-live-cd.service`. Mantém
`ProtectSystem=strict` e todos os controles anteriores, acrescentando somente
`/run/nginx.pid`, `/var/log/nginx/error.log` (log padrão aberto pelo binário) e
`/var/log/nginx/traceflow-access.log` (log configurado) a `ReadWritePaths`.
Os arquivos devem existir com propriedade/modo/contexto da política instalada;
a ausência deve recusar a unidade, sem liberação de diretórios inteiros.

Para atualizar uma instalação existente, preservar os três arquivos anteriores
(unidade, receiver e contract), conferir SHA/custódia, segurar os locks de CD e
backup e recusar operação em curso. Substituir somente os arquivos revisados e
executar daemon-reload; não executar novamente `install.py`, não reiniciar a
aplicação e não reenviar requests consumidos. Conferir propriedades efetivas.

Antes de nova promoção, testar nginx -t em unidades transitórias com as mesmas
restrições efetivas, inclusive credencial, limite de memória e caminhos. Para
validar a candidata sem alterar roteamento, usar BindReadOnlyPaths de cópias das
duas configurações exclusivamente no namespace do teste, sem iniciar Nginx.
Testar também a configuração restaurada e o reload da configuração ativa sem
trocar release, comparando hashes do ingress/estado e PIDs da API/worker.
SELinux deve permanecer Enforcing. Preservar provas e journal sanitizados.

Extrações/frontend recusados só podem ser renomeados para nomes exclusivos após
conferir inventário, hashes, recibo terminal e ausência de referências de serviços,
processos e ingress. Preservar inode, arquivos, dono, modos e contexto; nunca
apagar/reescrever histórico para permitir uma nova extração.

## Variáveis e segredos (sem valores)

| Item | Custódia/uso |
| --- | --- |
| `app_sha`, `promote` | Inputs não sensíveis do workflow |
| `GITHUB_TOKEN`, OIDC | Efêmeros emitidos pelo GitHub após gates, sem cópia à VM |
| `trustedWorkflowShas`, hashes do ingress | Configuração root do receiver |
| DB API/worker, GitHub OAuth/App/HMAC, SMTP, chave de pseudonimização | Env existentes root 0600; não copiados para runners |
| Backup SELECT-only | Encrypted credential systemd já existente; leitura de migrations |
| Chave privada de recuperação | Custódia externa do operador; não usada pela CD |
| SSH administrativo | Custódia atual, não adicionado ao GitHub |

Dependências nativas: [atestação GitHub](https://cli.github.com/manual/gh_attestation_verify),
[workflow_dispatch/default branch](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[aprovação de ambientes](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).


## Transições de schema — integração dos Ciclos 1 e 2

Contrato: [ADR-026](../architecture/ADR-026-OCI-SCHEMA-TRANSITIONS.md). Uma promoção sem
mudança continua sem credencial migradora. Para adicionar migrations, preparar primeiro o
plano protegido e suas provas. Não preencher resultados antes de observá-los.

1. Registrar os SHAs de origem/alvo, os dois schemas e as listas completas de migrations.
   Conferir todos os registros de `_prisma_migrations`, inclusive falhas/rollbacks e
   duplicidades. Só migrations novas, com arquivos imutáveis, podem ser adicionadas.
2. Executar `backend/scripts/validate-integration-upgrade.js <SHA-publicado>` em um MySQL
   descartável vazio. A variável `TEST_DATABASE_URL` deve identificar esse alvo; `DATABASE_URL`
   deve apontar a outro destino. O ensaio aplica a cadeia anterior pelo Prisma, cria fatos
   sintéticos e aplica o candidato. Guardar JSON, engine, limites, FKs e resultados de runtime.
   Homologar também instalação vazia, a API anterior no schema alvo e os dois serviços do worker.
3. Verificar backup consistente da instalação limpa, cifragem, publicação externa/readback e
   restore isolado do **mesmo** backup. Não usar recibos do controlador abandonado. O restore
   confere todo o conjunto; a normalização DDL anterior continua restrita à grafia redundante
   `CHARACTER SET utf8mb4` já comprovada. Não descartar divergências para obter PASS.
4. Apresentar o resumo único e obter GO para os hashes finais, atualização da autoridade CD,
   custódia migradora e breve parada de API/worker. O migrador `tf_live_migrator@10.20.1.184`
   tem somente privilégios necessários ao SQL revisado em `traceflow_live`, TLS obrigatório e
   teto de duas conexões; o backup continua SELECT-only. Custódia: credential systemd cifrada,
   carregada somente na unidade transitória migradora, sem senha em argumentos ou logs.
5. Instalar os arquivos administrativos revisados com seus hashes, preservando suas versões
   anteriores. Atualizar a trust policy explicitamente, sem alterar identidade de requests
   antigos, histórico ou contadores. Não repetir o bootstrap exclusivo da CD.
6. Instalar `/etc/traceflow-live/cd-transitions/<digest>/{plan,upgrade,restore,runtime}.json`, root/0600
   e ancestrais root protegidos. `<digest>` é SHA-256 do JSON canônico do plano. Ele vincula
   `appSha`, `from`, `to`, `added`, `upgradeEvidenceSha256`, `restoreEvidenceSha256`,
   `runtimeEvidenceSha256`, `previousAppCompatibleWithTarget=true`, os três hashes/ID do backup e validade de até 24 h.
   A autorização executável continua sendo o request OIDC novo de até 20 min, após a aprovação
   humana do ambiente. O plano e o backup precisam cobrir toda essa janela.
7. Disparar uma única execução manual com `app_sha`, `baseline_sha` (SHA atualmente instalado), `promote=true` e `transition_sha256`.
   A CD usa seus locks e o advisory lock Prisma, para e drena worker/API, grava o início
   exclusivo, executa `prisma migrate deploy` uma vez pelo CLI 6.12.0 imutável e reconfere a
   cadeia inteira. Só então inicia a candidata e promove API, worker e frontend.
8. Conferir o recibo de transição, cadeia final, versão efetiva, HTTPS/readiness, heartbeat,
   os quatro jobs, logs e os timers. Conferir que o backup reconhece o novo contrato de schema.
   Não importar o dataset da banca durante esta operação.

Se DDL falhar ou for interrompido, os serviços permanecem parados para intervenção específica:
registrar o histórico observado e não repetir, resolver migrations, restaurar ou apagar dados.
Se a migração tiver concluído e uma etapa posterior falhar, o binário anterior só retorna com
compatibilidade aprovada para o schema alvo; o schema **não** é revertido. Não confundir esse
ensaio isolado com prova de recuperação integrada em produção.

Orçamento de conexões desta transição: API 5 + recuperação 1; candidata API 5 + recuperação 1;
worker 3 + recuperação 1; comando Prisma até 2; diagnóstico 1; reserva operacional 5: teto
planejado 24, abaixo das 200 conexões observadas no HeatWave. A API não inicia agenda: apenas
`github-worker.js` inicia scheduler e job runner. Configurar explicitamente `JOBS_ENABLED=false`
na API e `true` no worker. Não substituir a URL do comando pela URL de pool 3 do worker.

A CI de pull request faz checkout do head SHA explícito. A CD aceita CI de push ou PR somente
quando `head_sha`, workflow e os quatro checks pertencem à mesma execução exata da revisão
promovida. Não utiliza um check verde de outra revisão nem a árvore implícita de merge da PR.
