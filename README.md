# TRACEFLOW

TRACEFLOW é uma plataforma de rastreabilidade para projetos de software. A solução conecta requisitos, tarefas e artefatos técnicos do GitHub para tornar o progresso e as evidências de implementação verificáveis.

> Este repositório evolui como produto, não como demonstração de MVP. Decisões de implementação devem considerar segurança, privacidade, qualidade, operação e manutenção. Consulte [Contexto e arquitetura](TRACEFLOW_CONTEXTO_ARQUITETURA.md) antes de contribuir.

## Objetivo

O TRACEFLOW apoia equipes no acompanhamento do desenvolvimento de software por meio da cadeia:

```txt
Requisito -> Tarefa -> Issue / Pull Request / Commit
```

Essa cadeia permite relacionar necessidades do produto, unidades de planejamento e evidências técnicas de entrega.

## Capacidades atuais

- Cadastro, edição, membros e convites de projetos.
- Integração com repositórios GitHub por Octokit.
- Importação persistente de commits, pull requests e issues.
- Cadastro, edição e exclusão segura de requisitos e tarefas.
- Vínculos entre requisitos, tarefas e artefatos GitHub.
- Quadro Kanban com histórico de movimentações.
- Indicadores e matriz de cobertura de rastreabilidade.
- Fluxograma interativo da cadeia de rastreabilidade.
- Persistência do estado e de falhas de sincronização com o GitHub.

## Arquitetura

```txt
React/Vite -> API REST -> Routes -> Controller -> Service -> Repository -> Prisma -> MySQL
                                  |
                                  +-> Octokit -> GitHub API
```

As responsabilidades das camadas e as regras obrigatórias de evolução estão detalhadas em [TRACEFLOW_CONTEXTO_ARQUITETURA.md](TRACEFLOW_CONTEXTO_ARQUITETURA.md).

## Tecnologias

| Área | Tecnologias |
|---|---|
| Frontend | React, Vite, JavaScript, CSS, React Router, Axios, React Flow |
| Backend | Node.js, Express, Prisma ORM, MySQL, Octokit |
| Engenharia | npm, Git, GitHub Actions |

## Estrutura do repositório

```txt
Traceflow/
├── .github/workflows/       # integração contínua
├── backend/
│   ├── prisma/              # schema e migrações
│   └── src/modules/         # módulos em camadas MVC
├── frontend/src/            # interface React
├── TRACEFLOW_CONTEXTO_ARQUITETURA.md
└── README.md
```

## Como executar

Requisitos: Node.js compatível com as dependências do projeto, npm e MySQL.

```bash
npm run install:all
cp backend/.env.example backend/.env
cd backend
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Em outro terminal:

```bash
cd frontend
npm run dev
```

- API: `http://localhost:3001`
- interface: `http://localhost:5173`

Configure `backend/.env` sem versionar segredos:

```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/traceflow"
GITHUB_TOKEN="token_do_github"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

## Qualidade, segurança e privacidade

Toda mudança deve observar:

- OWASP ASVS 5.0, com Level 2 como referência inicial de verificação;
- LGPD e minimização de dados pessoais;
- testes automatizados proporcionais ao risco da alteração;
- validação pela integração contínua no GitHub Actions;
- ausência de segredos, tokens ou dados pessoais em código e logs;
- proibição de mocks, dados falsos e respostas estáticas no código de produção;
- Definition of Done definida no documento de arquitetura.

Mocks são permitidos somente em testes automatizados ou quando solicitados explicitamente e isolados do runtime de produção.

## Documentação por componente

- [Contexto, arquitetura e padrões](TRACEFLOW_CONTEXTO_ARQUITETURA.md)
- [Backend](backend/README.md)
- [Frontend](frontend/README.md)

## Rastreabilidade

```txt
Requisito
   ↓
Tarefa
   ├── Issue
   ├── Pull Request
   └── Commit
```

Requisitos representam necessidades; tarefas organizam a execução; issues registram demandas, bugs ou melhorias; pull requests agrupam entregas; commits registram alterações pontuais. A matriz e o fluxograma permitem avaliar cobertura, progresso e evidências sem substituir a validação funcional da entrega.
