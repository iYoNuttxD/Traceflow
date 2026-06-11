# RF06 Frontend - Informações do Repositório

## Objetivo

Implementar a interface do RF06 para exibir, no contexto de um projeto, os artefatos GitHub importados pelo backend:

- commits
- pull requests
- issues

## Rota frontend

```txt
/projects/:projectId/repository
```

A tela é acessível a partir da página de detalhes do projeto pelo botão:

```txt
Informações do Repositório
```

## Endpoint consumido

```http
GET /api/projects/:projectId/artifacts
```

## Filtros disponíveis

```txt
type=commit | pull_request | issue
startDate=YYYY-MM-DD
endDate=YYYY-MM-DD
```

O frontend não envia query params vazios.

## Campos exibidos

A tela exibe:

- cards de resumo com total, commits, pull requests, issues e completude;
- tabela unificada com tipo, título, autor, data, estado/número e link GitHub;
- estados de carregamento, erro e vazio.

## Validações executadas

```txt
npm run build
git diff --check
```

## Limitações conhecidas

Esta etapa não implementa dashboard, gráficos, relatórios, edição de artefatos ou vínculo entre tarefas e artefatos. O frontend apenas consome e exibe os dados normalizados pelo backend do RF06.

## Ajustes complementares de fluxo

- Botão de sincronização manual GitHub adicionado à página de detalhes do projeto.
- A página de detalhes do projeto passou a destacar uma visão geral antes do formulário de edição.
- O aviso de ausência de membros no Kanban foi reduzido para uma mensagem curta, sem exibir código de acesso ou link de convite.
- A tela de Informações do Repositório limpa dados antigos quando uma consulta de artefatos falha.
