# TRACEFLOW

## Sobre o projeto

TRACEFLOW é uma plataforma de apoio ao acompanhamento de projetos de software por meio da rastreabilidade entre requisitos, tarefas e artefatos técnicos importados do GitHub.

O MVP permite acompanhar a cadeia:

```txt
Requisito -> Tarefa -> Issue / Pull Request / Commit
```

Com isso, o projeto consegue relacionar necessidades do produto, unidades de planejamento e evidências técnicas de implementação.

## Objetivo

O objetivo do TRACEFLOW é apoiar o acompanhamento do desenvolvimento de software por meio da integração entre requisitos, tarefas e artefatos técnicos do GitHub, permitindo visualizar evidências de implementação, progresso e rastreabilidade das entregas.

## Funcionalidades do MVP

- Cadastro e edição de projetos.
- Integração com repositório GitHub.
- Importação de commits.
- Importação de pull requests.
- Importação de issues.
- Exibição das informações do repositório.
- Cadastro, edição e exclusão segura de tarefas.
- Organização de tarefas em quadro Kanban.
- Histórico de movimentações do Kanban.
- Cadastro, edição e exclusão segura de requisitos.
- Vínculo entre requisitos e tarefas.
- Vínculo entre tarefas e pull requests.
- Vínculo entre tarefas e commits.
- Vínculo entre tarefas e issues.
- Indicadores de cobertura de rastreabilidade.
- Matriz de rastreabilidade de requisitos.
- Fluxograma interativo de rastreabilidade.
- Persistência do status de sincronização GitHub.

## Fluxo principal da solução

1. Usuário cadastra um projeto.
2. Usuário seleciona um repositório GitHub.
3. Sistema importa commits, pull requests e issues.
4. Usuário cadastra requisitos.
5. Usuário cadastra tarefas.
6. Usuário vincula requisitos a tarefas.
7. Usuário vincula tarefas a issues, pull requests e commits.
8. Sistema calcula indicadores de cobertura.
9. Sistema exibe matriz e fluxograma de rastreabilidade.

## Arquitetura geral

```txt
Frontend React
  -> API REST Node.js/Express
    -> Services
      -> Repositories
        -> Prisma ORM
          -> MySQL
```

A integração com GitHub é feita no backend com Octokit. O frontend consome a API REST e concentra a experiência visual nas telas de projetos, tarefas, requisitos, Kanban, repositório e rastreabilidade.

## Tecnologias utilizadas

Frontend:

- React
- Vite
- JavaScript
- CSS
- React Flow

Backend:

- Node.js
- Express
- Prisma ORM
- MySQL
- Octokit

Ferramentas:

- Git/GitHub
- VS Code
- npm

## Estrutura do repositório

```txt
Traceflow/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── config/
│   │   ├── database/
│   │   ├── modules/
│   │   ├── routes/
│   │   ├── app.js
│   │   └── server.js
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── routes/
│   │   └── styles/
│   └── README.md
├── rest.http
└── README.md
```

## Como executar o projeto

Backend:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Portas padrão:

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

## Variáveis de ambiente

Exemplo de `backend/.env`:

```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/traceflow"
GITHUB_TOKEN="token_do_github"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

## Rastreabilidade no TRACEFLOW

A rastreabilidade é organizada pela cadeia:

```txt
Requisito
   ↓
Tarefa
   ├── Issue
   ├── Pull Request
   └── Commit
```

- Requisitos representam necessidades do projeto.
- Tarefas representam unidades de planejamento e execução.
- Issues representam demandas, bugs ou melhorias registradas no GitHub.
- Pull requests representam entregas técnicas agrupadas.
- Commits representam alterações pontuais no código-fonte.

A matriz de rastreabilidade permite identificar progresso do requisito, tarefas vinculadas, evidências técnicas e situação da implementação. O fluxograma interativo permite explorar visualmente os vínculos entre requisito, tarefas e artefatos.
