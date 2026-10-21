# OCI — inventário protegido e modelo reproduzível

OpenTofu 1.13.2 / provider `oracle/oci` 9.10.0 fixado. Terraform compatível com
required_version também pode ser utilizado. Não há backend/state compartilhado
ou segredo incorporado. Executar em diretório privado (0700), umask 077, disco
cifrado; nunca commitar state, plano, tfvars real, tokens ou logs detalhados.

## Validação sem provisionamento

```
tofu init -backend=false
tofu fmt -check -recursive
tofu validate
tofu plan -var-file=/CAMINHO/PRIVADO/production.tfvars
```

`manage_resources=false` é o padrão e consulta exclusivamente os recursos
identificados. O plano não cria, altera ou apaga infraestrutura. Autenticar por
sessão OCI já autorizada/Cloud Shell; não exportar a credencial para o repositório
ou runners. O provider valida a identidade/assinatura da OCI normalmente.

O modelo gerenciado em `resources.tf` é parametrizado para reprodução planejada;
todos os recursos duráveis possuem prevent_destroy. Ele **não é uma importação
já concluída** nem prova de igualdade integral com as defaults da infraestrutura
criada manualmente. Antes de adotar gerenciamento:

1. Preservar inventário/configuração/state privados e identificar todos os IDs.
2. Revisar defaults de DNS, listas/rotas de segurança, imagem/volumes, identidade,
   backup policy e campos ForceNew contra a infraestrutura real.
3. Importar um recurso por vez no workspace privado (`tofu import` só associa
   state; não deve atualizar recurso). Não importar recursos legados fora do escopo.
4. Exigir plano sem criação, substituição, destruição ou alteração antes de apply.
   Se divergente, corrigir o modelo; jamais aplicar para forçar correspondência.
5. Não foi autorizado apply nesta entrega. Criação paga exige autorização adicional.

Rebuild de banco: o modelo permite `source BACKUP` com backup OCI existente para
não colocar senha administrativa no state compartilhado. Um banco vazio novo
exige bootstrap de segredo administrativo fora desse state, revisão de custos e
aprovação própria; não omitir essa limitação. Não restaurar sobre a origem ativa.
O backup age externo da aplicação tem runbook de recuperação separado.

`cloud-init.yaml` instala somente dependências/UID/diretórios, sem segredos ou
aplicação ativa. Os serviços, firewall Cloudflare, CA, TLS/credenciais e CD usam os
runbooks da instalação limpa e templates operacionais preservados. Terraform não
substitui custódia de chaves nem publica a aplicação como efeito colateral.

Homologação gratuita e descartável: workflow CD, MySQL `traceflow_cd_test`, storage
privado temporário. `traceflow_live`, storage ativo e segredos produtivos são proibidos.

O relatório consolidado indicará separadamente validação sintática, plano de
inventário real e eventual gestão/importação não executada. Não usar plano
mockado como prova de associação dos recursos existentes.
