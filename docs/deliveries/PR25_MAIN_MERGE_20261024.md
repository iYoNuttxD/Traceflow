# PR #25 — integração de main e ajustes de texto (24/10/2026)

Merge normal de main `6de5ece5` em max-dev, preservando os dois históricos.
O commit anterior `9ded8886` remove apenas o painel de vazio sem filtros abaixo de
Gerar relatório e troca o título do filtro de Repositório por Buscar e filtrar.
Resumo, criação/permissões, erros e o vazio por filtros continuam disponíveis.

## Conflitos resolvidos

- `docs/api/API_CONTRACTS.md`: preservadas as seções de projetos locais/mistos de max-dev e o protocolo de evidências retomáveis de main.
- `frontend/src/features/testCases/TestCasesScreen.jsx`: mantido o bloqueio quando a integração invalida uma referência manual e o tratamento retomável de resposta incerta de main.
- `frontend/src/features/testCases/components/TestExecutionWizard.jsx`: versão manual e validação local combinadas com progresso/retomada de upload, estado por caso/versão e proteção contra envio duplicado.

Lockfiles, infraestrutura/CD e workflow de CD coincidem com main. Migrations de main
e as migrations locais históricas de max-dev foram preservadas, assim como sidebar,
notificações, responsividade, cronômetro e recursos de relatórios de max-dev.
Não foram executados deploy, migrações de produção ou mudanças em proteções.

## Validação local

- Frontend: 228 testes focados e 1.882 testes totais em 152 arquivos, com cobertura aprovada; lint, formatação e build aprovados.
- Backend: 1.884 testes unitários em 152 arquivos, com URLs explícitas em porta sem servidor; lint, formatação, Prisma validate/generate, arquitetura e scanner de segredos aprovados.
- CD: 93 testes isolados aprovados; políticas de CI, auditoria de dependências e inventário aprovadas nos testes de scripts. Não é validação nativa de systemd/SELinux no Mac.
- Adicionadas regressões de referência manual com arquivo e retomada na UI e de confirmação/replay via API retomável. A regressão de API requer MySQL real e será validada na CI, junto à suíte backend completa e às migrations; não é contada como aprovada localmente.
- Dois PNGs do usuário materializados pela Library e inspecionados. Estado vazio reproduzido em componentes com dados sintéticos nos testes; controle do Chrome indisponível nesta execução. Sem nova aprovação visual ou homologação da aplicação real.

O resultado da CI do commit final será informado na entrega; resultados anteriores
não substituem a validação desta integração.
