# TRACEFLOW - Contexto, Arquitetura e Diretrizes de Desenvolvimento

> Documento de referência para desenvolvimento e revisão do TRACEFLOW.
>
> Este documento substitui a visão limitada ao MVP. O código produzido no MVP passa a ser tratado como base evolutiva de um produto real, sujeito a requisitos de segurança, qualidade, privacidade, testes, integração contínua e manutenção.

> Este documento contém contexto e diretrizes evolutivas, inclusive capacidades futuras. Para a
> arquitetura efetivamente implementada, use `docs/architecture/SYSTEM_ARCHITECTURE.md`; para
> contratos ativos, `docs/api/API_CONTRACTS.md`; e para a cobertura real dos requisitos,
> `docs/traceability/RF_TECHNICAL_MATRIX.md`. Uma diretriz futura descrita aqui não deve ser
> interpretada como funcionalidade já entregue.

---

## 1. Finalidade deste documento

Este arquivo estabelece o contexto funcional, as decisões arquiteturais e as regras obrigatórias para a continuidade do TRACEFLOW.

Seu objetivo é impedir que novas implementações sejam realizadas com base apenas em interpretações isoladas, documentos antigos ou limitações adotadas durante o MVP.

Toda alteração deve preservar a proposta central do produto, respeitar a arquitetura existente e produzir uma funcionalidade completa, integrada, testada e rastreável.

---

## 2. Visão do produto

O TRACEFLOW é uma plataforma web de apoio ao acompanhamento técnico e gerencial de projetos de software.

A plataforma integra informações de planejamento e desenvolvimento para relacionar:

```text
Requisito -> Tarefa -> Artefato técnico -> Teste/Defeito -> Indicadores
```

Os principais artefatos técnicos integrados inicialmente são provenientes do GitHub:

- commits;
- pull requests;
- issues;
- repositórios e branches relevantes ao projeto.

A proposta do TRACEFLOW é reduzir a fragmentação entre requisitos, planejamento, implementação, testes e defeitos. A plataforma deve consolidar evidências técnicas, manter vínculos de rastreabilidade e gerar indicadores sobre progresso, cobertura de implementação, produtividade, qualidade e evolução do desenvolvimento.

O produto não deve ser tratado apenas como um quadro de tarefas ou como um visualizador do GitHub. Seu diferencial é a construção e o uso de uma rede persistente de rastreabilidade entre os artefatos do projeto.

---

## 3. Fonte de verdade e precedência documental

Quando houver divergência entre fontes, utilizar a seguinte ordem de precedência:

1. **Documento oficial do TCC**, especialmente o Capítulo 3, seus requisitos funcionais, casos de uso e diagramas atualizados.
2. **Código e documentação da branch principal do repositório**, quando representarem decisões posteriores já implementadas e compatíveis com o documento oficial.
3. **Este documento**, como orientação arquitetural e operacional para a evolução do produto.
4. `Escopo_mvp.docx`, apenas como registro do recorte executado no MVP.
5. `arquitetura.docx`, `first_commit.md` e `separacao.docx`, apenas como histórico das decisões iniciais.

O escopo do MVP não redefine, renumera nem substitui os requisitos do documento oficial.

Antes de implementar uma funcionalidade, o responsável deve localizar o requisito correspondente no documento oficial e verificar seus relacionamentos com casos de uso, entidades e fluxos representados nos diagramas.

---

## 4. Estado atual da solução

O MVP estabeleceu a base funcional do produto e implementou a cadeia principal de rastreabilidade:

```text
Requisito -> Tarefa -> Commit / Pull Request / Issue
```

O estado atual inclui, entre outros recursos:

- cadastro e edição de projetos;
- integração de projetos com repositórios GitHub;
- sincronização e persistência de commits, pull requests e issues;
- cadastro e gerenciamento de requisitos;
- cadastro e gerenciamento de tarefas;
- quadro Kanban e histórico de movimentações;
- vínculos entre requisitos e tarefas;
- vínculos entre tarefas e artefatos GitHub;
- matriz e fluxograma de rastreabilidade;
- indicadores iniciais de cobertura;
- persistência do estado de sincronização do GitHub.

A implementação atual deve ser reutilizada e evoluída. Entretanto, código existente não deve ser considerado automaticamente correto, seguro ou definitivo. TODOs, duplicações de modelos, validações incompletas, decisões específicas do MVP e dívidas técnicas devem ser analisados antes da expansão de cada módulo.

---

## 5. Requisitos funcionais oficiais

A numeração oficial deve ser preservada em código, testes, issues, pull requests e documentação.

### 5.1 Projetos e integração GitHub

- **RF01** - Cadastrar projeto de software.
- **RF02** - Integrar repositório GitHub.
- **RF03** - Importar commits.
- **RF04** - Importar pull requests.
- **RF05** - Importar issues.
- **RF06** - Exibir informações do repositório.
- **RF21** - Atualizar sincronização com GitHub.
- **RF22** - Editar projeto.
- **RF50** - Sincronizar pull requests da branch principal.

### 5.2 Planejamento, tarefas e acompanhamento

- **RF07** - Cadastrar tarefas do projeto.
- **RF08** - Organizar tarefas em quadro ágil.
- **RF10** - Definir cronograma do projeto.
- **RF32** - Definir prioridade visual por cor.
- **RF33** - Registrar estimativa de esforço.
- **RF34** - Comparar esforço estimado e realizado.
- **RF35** - Exibir evolução por sprint.
- **RF38** - Registrar histórico de alterações das tarefas.
- **RF51** - Definir responsáveis por tarefas.

### 5.3 Rastreabilidade

- **RF09** - Relacionar tarefas a pull requests.
- **RF11** - Relacionar tarefas a commits.
- **RF12** - Relacionar tarefas a issues.
- **RF41** - Associar commits automaticamente a tarefas.
- **RF43** - Relacionar casos de teste a tarefas.
- **RF44** - Consultar rastreabilidade de casos de teste.
- **RF46** - Relacionar defeitos a tarefas.
- **RF48** - Relacionar requisitos a tarefas.
- **RF49** - Consultar rastreabilidade de requisitos.
- **RF52** - Consultar rastreabilidade de uma tarefa.
- **RF53** - Consultar rastreabilidade de um artefato técnico.
- **RF62** - Relacionar requisitos a casos de teste.
- **RF63** - Relacionar requisitos a defeitos.
- **RF64** - Relacionar defeitos a casos de teste.

### 5.4 Testes e defeitos

- **RF42** - Cadastrar casos de teste.
- **RF45** - Cadastrar defeitos.

### 5.5 Indicadores e painéis

- **RF15** - Gerar indicadores de progresso do projeto.
- **RF16** - Gerar indicadores de produtividade por commits.
- **RF17** - Gerar indicador de produtividade por tarefas concluídas.
- **RF18** - Gerar indicador de retrabalho em pull requests.
- **RF36** - Exibir métricas de produtividade por responsável.
- **RF54** - Gerar indicadores de qualidade do desenvolvimento.
- **RF55** - Exibir painel consolidado do projeto.
- **RF56** - Filtrar indicadores por período.

### 5.6 Alertas e notificações

- **RF13** - Emitir alerta de tarefa concluída sem commit vinculado.
- **RF30** - Notificar mudança de status de tarefa.
- **RF39** - Emitir alerta de pull request mesclada sem tarefa vinculada.
- **RF40** - Emitir alerta de issue fechada sem tarefa vinculada.
- **RF58** - Identificar tarefas sem vínculo técnico.
- **RF59** - Notificar vencimento de prazo.
- **RF60** - Notificar eventos de issue.
- **RF61** - Notificar eventos de pull request.

### 5.7 Relatórios

- **RF37** - Emitir relatórios do projeto.
- **RF57** - Exportar relatórios em PDF.

### 5.8 Comentários e colaboração

- **RF29** - Registrar comentários em tarefas.
- **RF31** - Consultar histórico de comentários das tarefas.

### 5.9 Usuários e controle de acesso

- **RF23** - Cadastrar usuários.
- **RF24** - Vincular usuários ao projeto.
- **RF25** - Definir perfil de acesso.
- **RF26** - Consultar equipe do projeto.
- **RF27** - Autenticar usuários.
- **RF28** - Recuperar senha.

---

## 6. Princípios obrigatórios de desenvolvimento

### 6.1 Implementação completa

Cada requisito deve ser entregue como um fluxo funcional fechado, incluindo, quando aplicável:

- modelo e migração de banco de dados;
- repository;
- service;
- controller;
- rota;
- validações;
- tratamento de erros;
- interface de usuário;
- integração frontend/backend;
- autorização;
- testes;
- documentação;
- atualização da rastreabilidade.

Não considerar um requisito concluído quando apenas uma camada estiver implementada.

### 6.2 Proibição de mocks no produto

Não criar dados, endpoints, respostas, serviços ou integrações mockadas no código de produção, salvo solicitação expressa e documentada.

Mocks são permitidos exclusivamente em testes automatizados ou ambientes isolados de demonstração claramente identificados.

Quando um requisito depender de outro ainda não implementado:

1. definir o contrato real esperado;
2. preparar a integração sem simular a funcionalidade ausente;
3. registrar explicitamente a dependência;
4. não marcar o requisito dependente como concluído.

### 6.3 Preservação da rastreabilidade

Toda funcionalidade deve manter rastreabilidade entre:

```text
Requisito oficial
  -> issue ou item de trabalho
    -> branch
      -> commits
        -> pull request
          -> testes
            -> documentação alterada
```

Commits e pull requests devem mencionar os RFs relacionados sempre que possível. Commits seguem
Conventional Commits e podem incluir o `[TASK-<ID>]` quando houver uma Task real relacionada, conforme
`CONTRIBUTING.md`; o identificador é opcional e não concede autorização nem cria vínculo definitivo
sozinho.

### 6.4 Alterações incrementais e compatíveis

- Não reestruturar módulos não relacionados sem justificativa.
- Não remover comportamentos existentes sem análise de impacto.
- Não alterar contratos de API silenciosamente.
- Não modificar o schema sem migration versionada.
- Não duplicar entidades para contornar uma decisão de modelagem.
- Não introduzir uma segunda biblioteca para resolver um problema já atendido pela stack existente sem justificativa arquitetural.

---

## 7. Stack oficial

### 7.1 Frontend

- React;
- Vite;
- JavaScript;
- React Router DOM;
- Axios;
- React Flow (`@xyflow/react`) para visualizações de rastreabilidade;
- CSS organizado por componentes, páginas e estilos compartilhados.

### 7.2 Backend

- Node.js;
- Express;
- JavaScript com ES Modules;
- Prisma ORM;
- MySQL;
- Octokit para integração com GitHub;
- Dotenv para configuração local;
- CORS configurado de forma restritiva por ambiente.

### 7.3 Ferramentas de engenharia

A evolução do projeto deve incluir:

- framework de testes do backend;
- framework de testes do frontend;
- testes de integração da API;
- lint e formatação padronizados;
- GitHub Actions;
- análise de dependências e vulnerabilidades;
- geração de cobertura de testes.

A escolha das ferramentas adicionais deve ser registrada em decisão arquitetural ou pull request, evitando dependências redundantes.

---

## 8. Arquitetura geral

O TRACEFLOW mantém uma arquitetura web cliente-servidor com API REST.

```text
[React SPA]
    |
    | HTTPS / JSON
    v
[Express API]
    |
    +--> Routes
    |      |
    |      v
    +--> Controllers
    |      |
    |      v
    +--> Services
    |      |
    |      +--> Repositories --> Prisma --> MySQL
    |      |
    |      +--> Clients externos --> Octokit --> GitHub API
    |
    +--> Middlewares transversais
           - autenticação
           - autorização
           - validação
           - tratamento de erros
           - logging e auditoria
           - segurança HTTP
```

### 8.1 Estilo arquitetural do backend

O backend segue a separação:

```text
Routes -> Controller -> Service -> Repository -> Database
```

Essa estrutura deve continuar simples e modular. Não migrar para uma Clean Architecture complexa sem necessidade comprovada.

#### Routes

- definem método, caminho e middlewares;
- não contêm regra de negócio;
- não acessam Prisma;
- não acessam diretamente serviços externos.

#### Controllers

- recebem e normalizam a requisição HTTP;
- extraem parâmetros já validados;
- chamam um service;
- convertem o resultado em resposta HTTP;
- não contêm regra de negócio significativa;
- não acessam Prisma ou Octokit diretamente.

#### Services

- concentram regras de negócio;
- validam invariantes do domínio;
- coordenam repositories e clients externos;
- controlam transações quando necessário;
- aplicam regras de autorização contextual;
- retornam dados independentes do protocolo HTTP.

#### Repositories

- concentram acesso ao Prisma e consultas persistentes;
- não recebem objetos `req` ou `res`;
- não contêm regras de apresentação;
- devem oferecer operações coesas e reutilizáveis;
- devem evitar consultas N+1 e carregamentos excessivos.

#### Clients externos

- encapsulam Octokit e futuras integrações;
- implementam paginação, timeout, rate limit e normalização de erros;
- não persistem dados diretamente;
- não expõem tokens ou respostas externas brutas ao frontend.

#### Middlewares

Devem concentrar preocupações transversais, especialmente:

- autenticação;
- autorização;
- validação de entrada;
- correlação de requisições;
- logging seguro;
- tratamento centralizado de erros;
- limites de payload e rate limiting.

---

## 9. Organização por domínio

A organização em `backend/src/modules/` deve ser mantida e expandida por domínio funcional.

Estrutura esperada:

```text
backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── config/
│   ├── database/
│   ├── middlewares/
│   ├── shared/
│   │   ├── errors/
│   │   ├── validators/
│   │   ├── logging/
│   │   ├── security/
│   │   └── utils/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── projects/
│   │   ├── requirements/
│   │   ├── tasks/
│   │   ├── sprints/
│   │   ├── github/
│   │   ├── traceability/
│   │   ├── testCases/
│   │   ├── defects/
│   │   ├── indicators/
│   │   ├── alerts/
│   │   ├── notifications/
│   │   ├── comments/
│   │   └── reports/
│   ├── routes/
│   ├── app.js
│   └── server.js
└── tests/
```

Cada módulo deve conter apenas os arquivos necessários. Como padrão:

```text
<domain>.routes.js
<domain>.controller.js
<domain>.service.js
<domain>.repository.js
<domain>.validation.js
<domain>.mapper.js        # quando houver conversão relevante
<domain>.client.js        # somente para integração externa
```

O frontend deve seguir organização equivalente por domínio ou feature, evitando concentrar toda a lógica em `pages`.

```text
frontend/src/
├── api/
├── components/
├── features/
├── hooks/
├── pages/
├── routes/
├── services/
├── styles/
├── utils/
└── tests/
```

---

## 10. Domínios principais

### 10.1 Projetos

`Project` é a entidade agregadora central. Requisitos, tarefas, membros, artefatos, testes, defeitos, indicadores e vínculos devem possuir contexto de projeto.

Operações devem validar que todo recurso consultado ou alterado pertence ao projeto informado e que o usuário possui acesso ao projeto.

### 10.2 GitHub

A integração deve:

- utilizar Octokit somente no backend;
- proteger credenciais e tokens;
- suportar paginação;
- respeitar rate limits;
- persistir o estado da última sincronização;
- executar sincronizações idempotentes;
- evitar duplicação por identificadores externos e chaves únicas;
- atualizar artefatos existentes quando houver mudança no GitHub;
- registrar falhas sem expor segredos;
- diferenciar erro temporário, autorização insuficiente, repositório inexistente e limite de API.

A sincronização não deve depender da interface permanecer aberta. Em evolução futura, operações longas devem ser preparadas para execução assíncrona por jobs, preservando status e resultado.

### 10.3 Rastreabilidade

A rastreabilidade é parte do domínio, não apenas uma visualização.

Cada vínculo deve possuir, conforme aplicável:

- projeto;
- origem;
- destino;
- tipo do vínculo;
- forma de criação: manual ou automática;
- autor ou processo responsável;
- data de criação;
- status de validade;
- evidência ou justificativa;
- data de última verificação.

A aplicação deve suportar navegação direta e reversa. Por exemplo:

- requisito -> tarefas -> commits/PRs/issues -> testes/defeitos;
- commit/PR/issue -> tarefas -> requisito;
- caso de teste -> tarefa/requisito/defeito;
- defeito -> teste/tarefa/requisito.

Vínculos automáticos não devem ser silenciosos ou irreversíveis. O sistema deve permitir identificar sua origem e, quando necessário, revisar ou remover a associação.

### 10.4 Casos de teste e defeitos

Casos de teste e defeitos devem ser entidades reais e persistidas, com relacionamentos explícitos. Não utilizar strings genéricas em `TraceLink` para substituir indefinidamente relações que exigem integridade referencial.

### 10.5 Indicadores

Indicadores devem ser derivados de dados persistidos e regras documentadas. Cada indicador deve definir:

- objetivo;
- fórmula;
- dados de origem;
- período considerado;
- filtros;
- interpretação;
- limitações;
- forma de atualização.

Não apresentar métricas inventadas ou calculadas a partir de dados mockados.

---

## 11. Banco de dados e Prisma

### 11.1 Regras gerais

- MySQL é o banco oficial.
- Prisma é a camada oficial de persistência.
- Toda mudança de schema exige migration versionada.
- Nunca utilizar `db push` como substituto de migrations em ambientes compartilhados ou de produção.
- Seeds devem conter apenas dados de desenvolvimento explicitamente identificados.
- Dados sensíveis não podem ser incluídos em seeds, fixtures ou repositório.
- Relações devem utilizar chaves estrangeiras e políticas de exclusão conscientes.
- Campos que representam estados limitados devem utilizar enums no Prisma ou validação centralizada consistente.
- Criar índices para filtros e relacionamentos utilizados com frequência.
- Operações compostas devem utilizar transações.

### 11.2 Evolução do schema atual

O schema atual contém estruturas do MVP que precisam de revisão controlada, incluindo:

- coexistência de `GithubArtifact` genérico com `Commit`, `PullRequest` e `Issue` específicos;
- coexistência de `TraceLink` genérico com relações tipadas, como `TaskCommit` e `TaskIssue`;
- relacionamentos diretos que podem limitar cardinalidade, como tarefa associada a apenas uma pull request;
- estados e perfis representados como strings livres;
- entidades ainda ausentes: usuário, sessão, sprint, caso de teste, defeito, alerta, notificação, comentário, relatório e indicador persistido.

Não remover ou consolidar essas estruturas sem:

1. mapear todos os usos no backend e frontend;
2. definir o modelo de destino;
3. criar migration segura para dados existentes;
4. atualizar os serviços e contratos de API;
5. adicionar testes de regressão;
6. documentar a decisão.

---

## 12. Contratos da API REST

### 12.1 Convenções

- Base sugerida: `/api/v1` para a evolução do produto.
- Recursos no plural.
- JSON como formato padrão.
- Datas em ISO 8601 e UTC.
- Paginação obrigatória em coleções potencialmente grandes.
- Filtros por query string.
- IDs e contexto do projeto validados no backend.
- Nunca confiar em `projectId`, `userId`, perfil ou ownership enviados pelo frontend.

### 12.2 Resposta de sucesso

Manter contratos consistentes e documentados. Exemplo:

```json
{
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

Para coleções:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "requestId": "..."
  }
}
```

### 12.3 Resposta de erro

Erros devem possuir código estável, mensagem segura e identificador de correlação.

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Tarefa não encontrada.",
    "details": [],
    "requestId": "..."
  }
}
```

Não retornar stack trace, query SQL, token, configuração interna ou resposta sensível de serviços externos.

### 12.4 Status HTTP

- `200` para consultas e atualizações bem-sucedidas;
- `201` para criação;
- `204` para exclusão sem corpo;
- `400` para requisição inválida;
- `401` para ausência ou falha de autenticação;
- `403` para acesso autenticado não autorizado;
- `404` para recurso inexistente no contexto permitido;
- `409` para conflito de estado ou duplicidade;
- `422` para regra de negócio inválida, quando adotado de forma consistente;
- `429` para limite de requisições;
- `500` para erro interno não previsto;
- `502` ou `503` para falhas de dependência externa, quando adequado.

---

## 13. Segurança da aplicação

Segurança deixa de ser uma melhoria futura e passa a ser requisito transversal de todas as entregas.

### 13.1 Referência de segurança

O projeto deve utilizar o **OWASP Application Security Verification Standard 5.0.0** como referência de requisitos verificáveis.

Adotar como meta inicial o **ASVS Level 2**, adequado a aplicações que processam dados sensíveis e exigem proteção além do nível básico. Requisitos de Level 3 devem ser avaliados para operações ou dados de maior risco.

A aplicação deve manter uma matriz própria contendo:

- identificador ASVS;
- aplicabilidade ao TRACEFLOW;
- implementação responsável;
- evidência de teste;
- status;
- justificativa para itens não aplicáveis.

### 13.2 Entrada, validação e injeção

- Validar toda entrada no servidor.
- Utilizar schemas centralizados por endpoint.
- Aplicar allowlist sempre que possível.
- Limitar tamanho, formato, faixa e cardinalidade.
- Utilizar Prisma com parâmetros seguros; não construir SQL por concatenação.
- Quando SQL bruto for inevitável, utilizar parâmetros e revisão específica.
- Escapar ou sanitizar dados conforme o contexto de saída, não de forma genérica.
- Proteger contra XSS, prototype pollution, path traversal, command injection e SSRF.
- Validar respostas e identificadores recebidos do GitHub antes de persistir ou exibir.

### 13.3 Autenticação

O produto final deve implementar RF23 a RF28 com segurança real.

- Senhas devem ser armazenadas somente por algoritmo de hashing apropriado e salt automático.
- Nunca armazenar ou registrar senha em texto puro.
- Implementar política de senha baseada em comprimento e prevenção de senhas comprometidas, evitando regras arbitrárias de composição.
- Recuperação de senha deve utilizar token aleatório, único, de curta duração e uso único.
- Mensagens de login e recuperação não devem permitir enumeração de usuários.
- Aplicar limitação de tentativas e proteção contra automação.
- Avaliar MFA para perfis administrativos e ambientes reais.

### 13.4 Sessão e tokens

A estratégia de sessão deve ser definida antes da implementação de autenticação.

- Tokens devem ter expiração curta e finalidade definida.
- Refresh tokens, quando usados, devem possuir rotação e revogação.
- Cookies de autenticação, quando usados, devem ser `HttpOnly`, `Secure` e possuir `SameSite` adequado.
- Logout deve invalidar a sessão no servidor quando aplicável.
- Não armazenar tokens sensíveis em locais acessíveis a scripts do navegador sem análise de risco.
- Identificadores de sessão não podem ser previsíveis.

### 13.5 Autorização

- Aplicar princípio do menor privilégio.
- Realizar autorização no backend em todas as operações.
- Implementar controle por projeto e perfil.
- Negar acesso por padrão.
- Verificar ownership e participação no projeto para cada recurso.
- Não confiar em ocultação de botões no frontend.
- Evitar IDOR/BOLA validando recurso e projeto em conjunto.
- Registrar alterações de privilégios e ações administrativas.

### 13.6 Proteção de credenciais GitHub

- Tokens do GitHub nunca devem ser enviados ao frontend.
- Tokens não podem aparecer em URL, log, erro, banco sem proteção ou repositório.
- Segredos devem ser obtidos por variáveis de ambiente ou serviço de secrets.
- A integração implementada usa GitHub App por instalação; token pessoal compartilhado e PAT por usuário/projeto não são suportados.
- Solicitar apenas permissões necessárias.
- Implementar rotação e revogação.
- Não persistir installation access tokens nem user access tokens; segredos estáticos da App pertencem ao ambiente/secret manager.

### 13.7 Comunicação segura

- Produção deve utilizar HTTPS exclusivamente.
- Redirecionar HTTP para HTTPS quando aplicável.
- Usar TLS atualizado.
- Validar certificados de serviços externos.
- Configurar CORS com origens explícitas por ambiente.
- Não utilizar `*` para origens em endpoints autenticados.
- Aplicar headers de segurança apropriados.

### 13.8 Configuração segura

- Separar configurações de desenvolvimento, teste e produção.
- Manter `.env` fora do versionamento.
- Fornecer `.env.example` sem segredos.
- Falhar na inicialização quando configuração obrigatória estiver ausente.
- Desativar modo debug e mensagens detalhadas em produção.
- Remover dependências e endpoints não utilizados.
- Manter dependências atualizadas e auditadas.
- Definir limites de payload e timeouts.

### 13.9 Logging e auditoria

Registrar eventos relevantes, como:

- login, logout e falhas repetidas;
- recuperação de senha;
- alteração de perfil e membros;
- criação, edição e exclusão de artefatos;
- criação e remoção de vínculos;
- sincronizações GitHub;
- falhas de autorização;
- alterações de configuração sensível;
- exportação de dados e relatórios.

Logs não podem conter:

- senhas;
- tokens;
- cookies de sessão;
- segredos de API;
- dados pessoais completos sem necessidade;
- corpos integrais de requisições sensíveis.

Utilizar `requestId` ou `correlationId` para rastrear operações.

### 13.10 Tratamento de erros

- Centralizar erros no backend.
- Separar erro operacional de erro de programação.
- Responder ao usuário com mensagem segura.
- Registrar detalhes técnicos apenas no servidor.
- Não ocultar falhas de sincronização ou persistência como sucesso parcial.
- Operações em lote devem informar itens criados, atualizados, ignorados e com erro.

---

## 14. LGPD e privacidade

O TRACEFLOW deve adotar privacidade desde a concepção e por padrão.

A adequação jurídica definitiva deve ser validada por responsável competente, mas o desenvolvimento deve observar, no mínimo:

### 14.1 Princípios

- finalidade;
- adequação;
- necessidade e minimização;
- livre acesso;
- qualidade dos dados;
- transparência;
- segurança;
- prevenção;
- não discriminação;
- responsabilização e prestação de contas.

### 14.2 Inventário de dados

Antes de cada módulo que trate dados pessoais, documentar:

- dado coletado;
- finalidade;
- origem;
- base legal aplicável a ser validada;
- local de armazenamento;
- prazo de retenção;
- perfis com acesso;
- compartilhamentos;
- forma de exclusão ou anonimização.

Possíveis dados pessoais no TRACEFLOW incluem:

- nome;
- e-mail;
- identificador e login do GitHub;
- autoria de commits;
- participação em projetos;
- produtividade e atividades atribuídas;
- comentários;
- histórico de alterações;
- logs e endereços de rede.

### 14.3 Regras de implementação

- Coletar apenas dados necessários para a funcionalidade.
- Não utilizar dados para finalidade incompatível sem análise.
- Exibir aviso de privacidade claro.
- Definir retenção e descarte.
- Permitir correção, exportação e exclusão quando aplicável.
- Preservar dados que devam ser mantidos por obrigação legítima apenas pelo período necessário.
- Anonimizar dados em métricas e ambientes de teste quando possível.
- Não copiar banco de produção para desenvolvimento sem anonimização.
- Restringir acesso administrativo.
- Registrar acesso e exportação de dados sensíveis.
- Documentar incidentes e fluxo de resposta.

Métricas individuais de produtividade devem ser tratadas com cautela, transparência e finalidade legítima. Não apresentar conclusões absolutas sobre desempenho humano com base isolada em quantidade de commits ou tarefas.

---

## 15. Estratégia de testes

Nenhum novo requisito deve ser concluído sem testes automatizados compatíveis com seu risco.

### 15.1 Backend

Implementar:

- **testes unitários** para services, validadores, regras de cálculo e mapeadores;
- **testes de integração** para repositories, Prisma e transações;
- **testes de API** para rotas, autenticação, autorização, validação e contratos;
- **testes de integração GitHub** com clients simulados apenas no ambiente de teste;
- **testes de segurança** para casos relevantes do OWASP ASVS;
- **testes de migração** quando houver transformação de dados.

Controllers devem ter pouca lógica. A maior parte dos testes unitários deve se concentrar nos services.

### 15.2 Frontend

Implementar:

- testes de componentes;
- testes de hooks e utilitários;
- testes de formulários e validações;
- testes de estados de carregamento, vazio e erro;
- testes de integração das páginas principais;
- testes end-to-end para fluxos críticos.

### 15.3 Fluxos críticos mínimos

- autenticação e recuperação de senha;
- autorização por projeto e perfil;
- criação e edição de projeto;
- integração e sincronização GitHub;
- cadastro de requisito e tarefa;
- vínculo e remoção de rastreabilidade;
- consulta direta e reversa;
- criação e execução de caso de teste;
- registro de defeito;
- geração de indicador e relatório;
- exclusões e preservação de integridade referencial.

### 15.4 Qualidade dos testes

- Testes devem ser determinísticos.
- Não depender de rede externa em testes unitários e de integração comuns.
- Cada teste deve controlar seus próprios dados.
- Fixtures não podem conter dados pessoais reais.
- Falhas corrigidas devem receber teste de regressão.
- Cobertura é um indicador, não substitui qualidade.
- A meta de cobertura deve ser definida progressivamente e aplicada no CI.

---

## 16. Integração contínua com GitHub Actions

Criar workflow executado em:

- pull requests direcionadas às branches protegidas;
- pushes nas branches principais;
- merges concluídos;
- execução manual quando necessária.

Pipeline mínima:

```text
Checkout
  -> Configurar Node
  -> Instalar dependências com npm ci
  -> Validar formatação/lint
  -> Gerar Prisma Client
  -> Executar migrations em banco de teste
  -> Executar testes do backend
  -> Executar testes do frontend
  -> Gerar cobertura
  -> Executar build do frontend
  -> Auditar dependências
  -> Publicar resultados e artefatos de teste
```

### 16.1 Regras do pipeline

- O pipeline deve falhar quando testes, build, lint ou migrations falharem.
- Não ignorar erros com `continue-on-error` sem justificativa.
- Usar `npm ci`, não `npm install`, no CI.
- Não armazenar segredos no YAML.
- Utilizar GitHub Secrets e permissões mínimas do workflow.
- Fixar versões principais das actions e revisar atualizações.
- Utilizar banco MySQL isolado para testes.
- Não executar testes contra banco de produção.
- Não realizar deploy quando os gates de qualidade falharem.

### 16.2 Proteção de branches

Branches principais devem exigir:

- pull request;
- aprovação de revisão;
- checks obrigatórios do CI;
- resolução de comentários;
- proibição de push direto, salvo exceções administrativas controladas;
- histórico de alterações preservado.

---

## 17. Processo de desenvolvimento

### 17.1 Antes de desenvolver

1. Identificar RF e caso de uso oficial.
2. Verificar diagramas relacionados.
3. Mapear o código existente afetado.
4. Identificar dependências funcionais.
5. Avaliar impactos de segurança e LGPD.
6. Definir critérios de aceitação.
7. Definir testes necessários.
8. Registrar decisão arquitetural quando houver mudança estrutural.

### 17.2 Durante o desenvolvimento

- utilizar branch específica;
- manter commits pequenos e coerentes;
- preservar separação de camadas;
- validar entradas e autorização desde o início;
- criar migration quando necessário;
- escrever ou atualizar testes junto com o código;
- atualizar contratos e documentação;
- evitar mudanças oportunistas fora do escopo.

### 17.3 Pull request

Toda pull request deve informar:

- RFs atendidos;
- problema e solução;
- arquivos e módulos principais;
- migrations;
- mudanças de API;
- impactos de segurança;
- impactos de privacidade;
- documentação canônica atualizada ou `Documentação: N/A` quando não houver impacto real;
- testes executados;
- evidências visuais quando houver frontend;
- pendências ou limitações reais.

### 17.4 Definition of Done

Um item só está concluído quando:

- [ ] o requisito oficial foi atendido;
- [ ] o fluxo funciona sem mocks em produção;
- [ ] todas as camadas necessárias foram implementadas;
- [ ] entradas são validadas no backend;
- [ ] autenticação e autorização foram aplicadas quando necessárias;
- [ ] dados persistem corretamente;
- [ ] migrations foram criadas e testadas;
- [ ] estados de erro foram tratados;
- [ ] testes automatizados foram adicionados e aprovados;
- [ ] build e pipeline passaram;
- [ ] riscos ASVS foram avaliados;
- [ ] impactos LGPD foram avaliados;
- [ ] documentação canônica foi atualizada ou `Documentação: N/A` foi registrado sem edição
      cosmética;
- [ ] rastreabilidade entre RF, código, testes e PR foi registrada;
- [ ] não existem segredos, dados pessoais reais ou logs sensíveis no repositório.

---

## 18. Diretrizes de desenvolvimento e decisão técnica

Escolhas técnicas locais, reversíveis e inequívocas podem ser decididas durante a implementação
quando decorrem claramente dos padrões vigentes. Não se deve inventar regra de negócio, permissão,
cardinalidade, lifecycle, retenção, escopo, autorização ou decisão arquitetural relevante para
preencher uma lacuna. Quando alternativas válidas tiverem impacto relevante, a equipe deve registrar
a dúvida e decidir antes de implementar.

Uma arquitetura nova nasce em decisão/requisito, arquitetura/ADR/contrato, código/testes e
documentação afetada. As normas de contribuição e revisão apenas aplicam decisões já formalizadas.
Toda validação não executada ou externa permanece declarada sem overclaim.

---

## 19. Roadmap técnico recomendado

A evolução do MVP para produto deve ocorrer em etapas controladas.

### Etapa 1 - Fundação de qualidade e segurança

- configurar lint e formatação;
- implantar testes backend e frontend;
- criar pipeline GitHub Actions;
- padronizar erros e validação;
- configurar logging seguro;
- aplicar headers, limites e CORS por ambiente;
- criar matriz OWASP ASVS;
- mapear dados pessoais e retenção;
- revisar segredos e integração GitHub.

### Etapa 2 - Identidade e autorização

- RF23 a RF28;
- usuários, autenticação, sessão e recuperação;
- membros de projeto;
- perfis e autorização por projeto;
- trilha de auditoria.

### Etapa 3 - Consolidação do domínio

- revisar `GithubArtifact` e entidades específicas;
- revisar `TraceLink` e vínculos tipados;
- corrigir cardinalidades;
- introduzir enums;
- implementar sprints, cronograma, esforço e histórico completo.

### Etapa 4 - Ampliação da rastreabilidade

- casos de teste;
- defeitos;
- vínculos requisito-teste-defeito;
- associação automática auditável;
- consultas diretas e reversas completas.

### Etapa 5 - Indicadores, alertas e relatórios

- fórmulas documentadas;
- painel consolidado;
- filtros temporais;
- alertas e notificações;
- relatórios e exportação PDF.

Cada etapa deve manter compatibilidade com o que já está funcional e possuir critérios próprios de segurança, privacidade e testes.

---

## 20. Decisões que exigem registro arquitetural

Criar um ADR quando houver decisão relevante, como:

- estratégia de autenticação e sessão;
- alteração da estratégia vigente de GitHub App por instalação;
- consolidação dos modelos de artefato GitHub;
- estratégia de vínculos genéricos versus tipados;
- processamento assíncrono de sincronizações;
- estratégia de notificações;
- armazenamento de relatórios;
- biblioteca de validação;
- framework de testes;
- versão e contrato da API;
- estratégia de deploy e observabilidade.

Estrutura mínima de ADR:

```text
Título
Status
Contexto
Decisão
Alternativas consideradas
Consequências positivas
Consequências negativas
Impactos de segurança e privacidade
Data e responsáveis
```

---

## 21. Referências do projeto

- Documento oficial: `BES_TCC_Proposta de Desenvolvimento de Ferramenta_v2023 Somativa 2.pdf`.
- Repositório: `https://github.com/iYoNuttxD/Traceflow`.
- Arquitetura inicial: `arquitetura.docx`.
- Preparação inicial do repositório: `first_commit.md`.
- Separação inicial de responsabilidades: `separacao.docx`.
- Recorte executado no MVP: `Escopo_mvp.docx`.
- Segurança: `OWASP Application Security Verification Standard 5.0.0`.
- Privacidade: Lei Geral de Proteção de Dados Pessoais - LGPD.

---

## 22. Regra final

O TRACEFLOW deve evoluir como produto real de engenharia de software.

Velocidade de implementação não justifica perda de rastreabilidade, segurança, integridade dos dados ou qualidade. Toda entrega deve ser funcional, verificável, integrada ao restante do sistema e sustentável para os próximos desenvolvedores.
