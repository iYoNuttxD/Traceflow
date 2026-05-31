# TRACEFLOW

TRACEFLOW e uma plataforma de apoio a rastreabilidade e acompanhamento da evolucao de projetos de software.

O MVP tem como foco integrar requisitos, tarefas e artefatos tecnicos importados do GitHub.

## Cadeia principal do MVP

```txt
Requisito -> Tarefa -> Artefato GitHub
```

## Artefatos GitHub considerados

- Commit
- Pull Request
- Issue

## Stack

- React
- Vite
- Node.js
- Express
- MySQL
- Prisma
- Octokit

## Arquitetura backend

```txt
Routes -> Controller -> Service -> Repository -> Database
```

## Fluxo principal do MVP

1. Cadastrar projeto.
2. Vincular repositorio GitHub.
3. Sincronizar commits, pull requests e issues.
4. Cadastrar requisitos.
5. Cadastrar tarefas.
6. Relacionar requisitos a tarefas.
7. Relacionar tarefas a artefatos GitHub.
8. Consultar rastreabilidade.

## Status do projeto

Este commit prepara apenas a estrutura inicial do projeto. As funcionalidades serao implementadas posteriormente.

> TODO: Atualizar este README conforme o desenvolvimento incremental do MVP.
