# TRACEFLOW — Plano de homologação manual da baseline L4.1

Baseline: `daniel-dev` em `28cf788`
Escopo: S1-01, S1-02, S1-03 e contratos transversais necessários
Natureza: roteiro para um Work QA independente; este documento não registra execução manual

## 1. Protocolo de execução

Para cada cenário, registrar:

- ID, data/hora, commit, ambiente, navegador e viewport;
- pré-condição realmente usada;
- passos executados;
- resultado esperado e resultado obtido;
- `PASS`, `FAIL` ou `BLOCKED`;
- screenshot e request ID quando úteis, sem capturar senha, cookie, token OAuth, token de convite ou
  segredo SMTP.

Quando falhar, criar DEF separado com severidade, passos mínimos, evidência sanitizada e cenário de
origem. `BLOCKED` deve informar a dependência externa ou ação humana exata que faltou.

## 2. Ambiente e dados artificiais

Pré-condições gerais:

1. usar ambiente de homologação isolado, nunca produção;
2. aplicar as 33 migrations sem resetar banco existente;
3. subir backend e frontend com configurações válidas de CORS/cookie;
4. confirmar `/health/live` e `/health/ready` antes dos cenários;
5. usar somente contas, projetos e endereços de e-mail artificiais controlados pela equipe;
6. não reutilizar contas pessoais para desativação, exclusão, anonimização ou troca de identidade;
7. preparar projetos artificiais A e B e as personas abaixo;
8. preservar logs do período usando request ID, sem payloads ou credenciais.

Personas sugeridas:

| Persona            | Estado inicial                                             |
| ------------------ | ---------------------------------------------------------- |
| `owner_a`          | ACTIVE, e-mail verificado, OWNER do projeto A              |
| `owner_a2`         | ACTIVE, segundo OWNER do projeto A quando o cenário exigir |
| `manager_a`        | ACTIVE, MANAGER do projeto A                               |
| `member_a`         | ACTIVE, MEMBER do projeto A                                |
| `viewer_a`         | ACTIVE, VIEWER do projeto A                                |
| `owner_b`          | ACTIVE, OWNER apenas do projeto B                          |
| `outsider`         | ACTIVE, sem membership no projeto A                        |
| `invitee_existing` | ACTIVE, cadastrado e ainda sem membership no projeto A     |
| `invitee_new`      | endereço artificial sem User cadastrado                    |
| `github_only`      | conta artificial criada por GitHub, sem senha local        |
| `restricted_user`  | conta artificial usada para DEACTIVATED/DELETION_PENDING   |

As senhas devem ser definidas pelo executor no cofre/ambiente apropriado e nunca copiadas para este
arquivo ou para evidências.

## 3. Cadastro e login — Axx

| ID  | Domínio               | Pré-condição                                          | Passos                                                                                                            | Resultado esperado                                                                              | Severidade se falhar | Dependência externa                          |
| --- | --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------- |
| A01 | Cadastro local        | E-mail e username artificiais inéditos                | Abrir `/register`; preencher todos os campos; criar conta                                                         | Conta e sessão criadas; usuário entra autenticado; nenhum segredo aparece na resposta/UI        | HIGH                 | Browser; SMTP somente para entrega posterior |
| A02 | Validação de cadastro | Visitante                                             | Enviar formulário vazio; depois e-mail inválido, senha fora da política e confirmação divergente                  | Campos recebem mensagens acessíveis; nenhuma criação parcial; submit volta a habilitar          | MEDIUM               | Browser                                      |
| A03 | Unicidade             | Conta artificial existente                            | Tentar cadastrar o mesmo e-mail e, separadamente, o mesmo username                                                | Conflito sanitizado; conta original preservada; nenhuma enumeração além do contrato             | HIGH                 | Browser                                      |
| A04 | Login local           | Conta ACTIVE com senha                                | Entrar primeiro por username e depois por e-mail em nova sessão                                                   | Ambos autenticam a mesma conta e abrem o destino autorizado                                     | HIGH                 | Browser                                      |
| A05 | Credencial inválida   | Conta existente                                       | Informar senha incorreta e identificador inexistente                                                              | Mesmo feedback genérico; sem sessão; sem revelar qual campo existe                              | HIGH                 | Browser                                      |
| A06 | Remember me           | Conta ACTIVE                                          | Comparar login com “Manter sessão ativa” desligado e ligado; inspecionar apenas validade do cookie, não seu valor | Sessão persistente possui TTL maior; cookie continua HttpOnly/SameSite/Secure conforme ambiente | HIGH                 | Browser/DevTools                             |
| A07 | Logout                | Conta autenticada                                     | Clicar Sair; tentar voltar à rota protegida e atualizar a página                                                  | Sessão revogada; conteúdo privado não reaparece; redirecionamento ao login                      | HIGH                 | Browser                                      |
| A08 | ReturnTo local        | Visitante abre `/projects/{A}/tasks?status=open#item` | Ser redirecionado ao login; autenticar                                                                            | Pathname, query e hash originais são restaurados; destino externo é rejeitado                   | MEDIUM               | Browser                                      |
| A09 | Conta desativada      | `restricted_user` DEACTIVATED                         | Tentar login local e abrir rota protegida com sessão restrita existente                                           | Login normal é bloqueado; somente modo restrito/reativação permitido                            | HIGH                 | Browser                                      |

## 4. Sessões e CSRF — Bxx

| ID  | Domínio               | Pré-condição                                | Passos                                                                       | Resultado esperado                                                                                             | Severidade se falhar | Dependência externa             |
| --- | --------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
| B01 | Bootstrap visitante   | Sem cookie de sessão                        | Abrir `/login`; observar Network por 20 s                                    | Uma tentativa inicial de `/auth/me` por montagem; 401 é visitante normal; `/auth/csrf` não é chamado; sem loop | HIGH                 | Browser/DevTools                |
| B02 | Bootstrap autenticado | Cookie válido                               | Recarregar rota protegida                                                    | `/auth/me` 200 seguido de `/auth/csrf` 200; conteúdo privado somente após conclusão                            | HIGH                 | Browser/DevTools                |
| B03 | Backend indisponível  | Backend desligado e sem sessão confirmada   | Abrir `/login`; aguardar 20 s; ligar backend sem clicar; depois clicar retry | Login fica montado; feedback coerente; nenhuma repetição automática; nova tentativa ocorre somente após clique | HIGH                 | Browser; controle do backend    |
| B04 | CSRF multiaba         | Mesma sessão em três abas                   | Abrir três abas autenticadas; realizar leituras e uma mutação válida em cada | Token permanece coerente para a sessão; nenhuma aba invalida as outras indevidamente                           | HIGH                 | Browser com múltiplas abas      |
| B05 | CSRF cruzado          | Duas sessões artificiais diferentes         | Tentar mutação da sessão B com token da sessão A e depois token aleatório    | `403 CSRF_INVALID`; nenhuma mutação; sessões não são confundidas                                               | CRITICAL             | Browser/cliente HTTP controlado |
| B06 | Logout multiaba       | Mesma conta em duas abas                    | Efetuar logout na aba A; tentar mutação/recarregar na B                      | Sessão revogada e B retorna ao fluxo de login; sem conteúdo privado residual                                   | HIGH                 | Browser com múltiplas abas      |
| B07 | Revogação de sessão   | Conta com duas sessões                      | Em Settings, revogar a outra sessão; tentar usá-la                           | Apenas sessão escolhida perde acesso; sessão atual permanece válida                                            | HIGH                 | Dois navegadores/perfis         |
| B08 | Expiração             | Sessão artificial com expiração controlável | Expirar/revogar pelo ambiente; abrir rota protegida                          | Código canônico de sessão limpa AuthContext e direciona ao login                                               | HIGH                 | Acesso controlado ao ambiente   |
| B09 | Senha atual inválida  | Sessão autenticada                          | Tentar troca de senha/e-mail/desativação com senha incorreta; navegar depois | `CURRENT_PASSWORD_INVALID` fica inline; AuthContext e sessão permanecem ativos                                 | HIGH                 | Browser                         |

## 5. E-mail e senha — Cxx

| ID  | Domínio                          | Pré-condição                                                              | Passos                                                                                              | Resultado esperado                                                                             | Severidade se falhar | Dependência externa                     |
| --- | -------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------- |
| C01 | Verificação de e-mail            | Conta não verificada e link válido                                        | Abrir link; concluir verificação; voltar à aplicação                                                | Sucesso do backend; AuthContext atualizado; banner desaparece                                  | HIGH                 | SMTP real                               |
| C02 | Token de verificação inválido    | Conta artificial                                                          | Abrir link adulterado ou incompleto                                                                 | Feedback seguro; conta continua não verificada; sem stack                                      | MEDIUM               | Browser                                 |
| C03 | Token de verificação expirado    | Token expirado controlado                                                 | Abrir link                                                                                          | Expiração distinguida; token não é consumido como válido                                       | MEDIUM               | SMTP/fixture controlada                 |
| C04 | Token de verificação reutilizado | Token já consumido                                                        | Abrir novamente o mesmo link                                                                        | Reuso rejeitado; estado verificado não é revertido                                             | HIGH                 | SMTP real                               |
| C05 | Reenvio de verificação           | Conta não verificada                                                      | Solicitar reenvio; aguardar retorno; abrir novo link                                                | Estado de entrega exibido sem falso sucesso; novo token funciona                               | MEDIUM               | SMTP real                               |
| C06 | Rate limit de e-mail             | Conta não verificada                                                      | Solicitar reenvios até atingir quota                                                                | `429`, `Retry-After` e cooldown acessível; sem disparos extras durante cooldown                | MEDIUM               | SMTP real/ambiente com quota controlada |
| C07 | Solicitação de recuperação       | Endereço existente e inexistente                                          | Solicitar recuperação para ambos                                                                    | Resposta pública uniforme; e-mail enviado somente quando aplicável                             | HIGH                 | SMTP real                               |
| C08 | Reset válido                     | Link de reset válido                                                      | Definir e confirmar nova senha; tentar senha antiga e nova                                          | Token consumido; antiga falha; nova autentica; sessões anteriores revogadas conforme contrato  | CRITICAL             | SMTP real                               |
| C09 | Reset inválido/expirado/usado    | Três tokens artificiais nesses estados                                    | Tentar reset com cada token                                                                         | Cada tentativa falha com feedback seguro; nenhuma senha é alterada                             | HIGH                 | SMTP/fixture controlada                 |
| C10 | Alteração de senha               | Conta local com duas sessões                                              | Alterar senha na sessão A; testar A, B, senha antiga e nova                                         | Sessão atual segue política do endpoint; outras são revogadas; senha antiga deixa de funcionar | CRITICAL             | Dois navegadores/perfis                 |
| C11 | Primeira senha GitHub-only       | `github_only`, reautenticada recentemente no GitHub                       | Abrir Settings Security; criar primeira senha; sair; entrar localmente                              | `passwordHash` deixa de ser nulo somente após confirmação; login local passa a funcionar       | HIGH                 | GitHub OAuth real                       |
| C12 | PasswordField                    | Login, cadastro, reset, primeira senha, Settings e confirmações sensíveis | Conferir obrigatório opcional, asterisco inline, Mostrar/Ocultar, erro e disabled em desktop/mobile | `required=true` mostra `*`; opcional não mostra; toggle alinhado e acessível; sem overflow     | LOW                  | Browser desktop/mobile                  |

## 6. Conta e segurança — Dxx

| ID  | Domínio                           | Pré-condição                                             | Passos                                                                    | Resultado esperado                                                                                      | Severidade se falhar | Dependência externa     |
| --- | --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------- |
| D01 | Username                          | Conta ACTIVE                                             | Alterar para valor válido e depois entrar com o novo username             | Alteração persistida; novo login funciona; antigo não identifica a conta                                | HIGH                 | Browser                 |
| D02 | Cooldown/duplicidade de username  | Username recém-alterado e outro já ocupado               | Tentar nova alteração antes do prazo e usar username ocupado              | Códigos/feedback específicos; identidade existente não é sobrescrita                                    | HIGH                 | Browser                 |
| D03 | Alteração de e-mail               | Conta local e novo e-mail artificial                     | Solicitar com senha; confirmar pelo link; tentar login anterior/novo      | E-mail muda somente após token; todas as sessões são revogadas; novo identificador funciona             | CRITICAL             | SMTP real               |
| D04 | Token de e-mail inválido/expirado | Solicitações artificiais                                 | Abrir tokens inválido, expirado e já usado                                | Alteração rejeitada; e-mail atual preservado; sem enumeração técnica                                    | HIGH                 | SMTP/fixture controlada |
| D05 | Gestão de sessões                 | Conta com duas sessões                                   | Listar sessões; identificar a atual; revogar uma; revogar todas as outras | DTO sem hashes/tokens; ações atingem apenas sessões próprias pretendidas                                | HIGH                 | Dois navegadores/perfis |
| D06 | Desativação e único OWNER         | `restricted_user` como único OWNER de projeto artificial | Tentar desativar; adicionar outro OWNER; repetir                          | Primeiro `SOLE_PROJECT_OWNER`; depois desativação atômica, sessões revogadas e modo restrito            | CRITICAL             | Browser                 |
| D07 | Reativação                        | Conta artificial DEACTIVATED                             | Solicitar reativação; abrir link válido                                   | Conta retorna a ACTIVE; nova sessão pode ser estabelecida; token é de uso único                         | HIGH                 | SMTP real               |
| D08 | Exclusão com carência             | Conta artificial sem bloqueio de OWNER                   | Solicitar exclusão; testar restrições; cancelar com senha                 | DELETION_PENDING imediato; somente operações permitidas; cancelamento restaura estado conforme contrato | CRITICAL             | Browser                 |
| D09 | Exportação                        | Conta ACTIVE e depois DELETION_PENDING                   | Baixar ZIP nos dois estados; inspecionar manifesto/JSON                   | ZIP válido e versionado, sem passwordHash, token, cookie, secret ou dados indevidos de terceiros        | HIGH                 | Browser/ferramenta ZIP  |

## 7. GitHub Identity — Exx

| ID  | Domínio                  | Pré-condição                                                | Passos                                                               | Resultado esperado                                                                                  | Severidade se falhar | Dependência externa                  |
| --- | ------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------ |
| E01 | Login GitHub vinculado   | User com GitHubIdentity                                     | Entrar com GitHub                                                    | Resolve exclusivamente pelo `githubUserId`; restaura o User correto                                 | CRITICAL             | GitHub OAuth real                    |
| E02 | Criação GitHub-only      | Conta GitHub artificial nunca vinculada e e-mail verificado | Entrar com GitHub                                                    | Novo User + GitHubIdentity; `passwordHash=null`; sessão e username seguro criados                   | HIGH                 | GitHub OAuth real                    |
| E03 | Colisão de e-mail        | Conta local e GitHub não vinculado com mesmo e-mail         | Tentar login GitHub                                                  | Conflito bloqueado; não vincula, autentica ou duplica User automaticamente                          | CRITICAL             | GitHub OAuth real                    |
| E04 | Vínculo explícito        | Conta local autenticada com senha                           | Iniciar vínculo; concluir OAuth                                      | Identity vinculada ao User atual; GitHub App permanece conceito separado                            | HIGH                 | GitHub OAuth real                    |
| E05 | Desvínculo               | Conta com senha local e Identity                            | Confirmar senha e desvincular                                        | Identity removida; sessão/instalações/projetos preservados; login local funciona                    | HIGH                 | GitHub OAuth previamente configurado |
| E06 | Proteção GitHub-only     | Conta sem senha local                                       | Tentar desvincular antes de criar senha                              | UI/backend bloqueiam perda do único método de autenticação                                          | CRITICAL             | Browser                              |
| E07 | State, returnTo e replay | Fluxo OAuth iniciado de settings/convite/rota protegida     | Concluir uma vez; conferir destino; tentar reutilizar callback/state | Path/query/hash seguros preservados; state usado/expirado é rejeitado; destino externo não é aceito | CRITICAL             | GitHub OAuth real e logs sanitizados |

## 8. GitHub App — Fxx

| ID  | Domínio                    | Pré-condição                                           | Passos                                                                 | Resultado esperado                                                                                            | Severidade se falhar | Dependência externa             |
| --- | -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
| F01 | Autorização da App         | Conta verificada e GitHub App configurada              | Iniciar autorização; instalar/autorizar; retornar pelo callback        | Instalação e autorização pessoal registradas; token temporário não persistido/exposto                         | CRITICAL             | GitHub App/callback real        |
| F02 | Instalações/repositórios   | Uma ou mais instalações autorizadas                    | Abrir Settings/novo projeto; listar agregado e por instalação          | Apenas instalações comprovadas; paginação completa; zero/um/vários repositórios tratados                      | HIGH                 | GitHub App real                 |
| F03 | Conexão de projeto         | OWNER do projeto A e repo livre                        | Conectar repositório                                                   | Integração ACTIVE e metadados revalidados no backend; não confia no navegador                                 | HIGH                 | GitHub App real                 |
| F04 | Repositório ocupado        | Repo já conectado ao projeto A                         | Abrir seletor no projeto B; tentar selecionar/conectar                 | Repo continua visível como ocupado/não selecionável; backend mantém conflito/constraint                       | HIGH                 | GitHub App real                 |
| F05 | Projeto a partir do GitHub | Conta verificada e repo autorizado livre               | Criar projeto selecionando instalação/repositório                      | Projeto criado, solicitante OWNER e integração consistente                                                    | HIGH                 | GitHub App real                 |
| F06 | Sync assíncrono            | Projeto integrado                                      | Iniciar sync e acompanhar Network por mais de 15 s                     | POST responde 202 rapidamente; UI faz polling moderado; não há falso timeout; status termina SUCCEEDED/FAILED | HIGH                 | GitHub API real                 |
| F07 | Reload durante sync        | Run QUEUED/RUNNING                                     | Recarregar página durante execução                                     | Último run ativo é restaurado; um único loop de polling; para no estado final                                 | HIGH                 | GitHub API real                 |
| F08 | Falha/reconexão            | Instalação suspensa/removida ou erro GitHub controlado | Abrir integração e tentar sync                                         | Feedback sanitizado e contextual; artifacts históricos preservados; solicita reconexão quando aplicável       | HIGH                 | GitHub App/API real             |
| F09 | Webhook                    | Secret e endpoint públicos configurados                | Enviar delivery assinado; repetir delivery; enviar assinatura inválida | Novo delivery 202; duplicado idempotente 200; assinatura inválida rejeitada; nenhum secret logado             | CRITICAL             | GitHub webhook real/túnel HTTPS |

## 9. Convites adicionais — Gxx

| ID  | Domínio                | Pré-condição                                                 | Passos                                                                     | Resultado esperado                                                                                      | Severidade se falhar | Dependência externa             |
| --- | ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
| G01 | Lista e minimização    | OWNER e não OWNER no projeto A; convites em vários estados   | Abrir equipe/convites com cada perfil                                      | OWNER vê lista autorizada; demais recebem 403 e não obtêm e-mails/tokens                                | HIGH                 | Browser                         |
| G02 | Recusa                 | Convite PENDING para usuário correto                         | Abrir link; clicar Recusar; reabrir e tentar aceitar                       | Estado DECLINED com ator/data; nenhuma membership; token não reutilizável                               | HIGH                 | SMTP real para entrega original |
| G03 | Destinatário incorreto | Convite destinado a A; sessão B                              | Abrir link e tentar details/accept/decline                                 | Resposta genérica segura; nenhuma associação ou mudança terminal                                        | CRITICAL             | Browser                         |
| G04 | Convite já utilizado   | Convite aceito                                               | Abrir e tentar aceitar novamente                                           | `INVITATION_ALREADY_USED`; membership única e inalterada                                                | HIGH                 | Browser                         |
| G05 | D01 conta especial     | Convite para conta DEACTIVATED e outro para DELETION_PENDING | Criar como OWNER; entrar como destinatário e tentar details/accept/decline | Criação atual é permitida; resposta fica bloqueada até ACTIVE; registrar como decisão pendente, não DEF | MEDIUM               | Browser; contas artificiais     |

## 10. Homologação L2.1 preservada — H01–H09

| ID  | Domínio                        | Pré-condição                                  | Passos                                                                                              | Resultado esperado                                                                                                                    | Severidade se falhar | Dependência externa             |
| --- | ------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------- |
| H01 | Convite para usuário existente | `owner_a` e `invitee_existing` sem membership | OWNER cria convite; destinatário entra pelo link; aceita; OWNER recarrega membros                   | Convite ACCEPTED; membership ativa com papel escolhido; usuário aparece uma única vez                                                 | HIGH                 | SMTP real                       |
| H02 | Usuário não cadastrado         | E-mail `invitee_new`                          | Criar convite; abrir link; cadastrar; confirmar retorno ao convite; aceitar                         | `returnTo` preservado; novo User aceita após autenticação/verificação exigida; membership correta                                     | HIGH                 | SMTP real                       |
| H03 | Duplicado                      | Convite PENDING para mesmo projeto/e-mail     | Criar segundo convite com outro papel                                                               | `409 INVITATION_ALREADY_PENDING`; convite/token original continua válido                                                              | HIGH                 | Browser                         |
| H04 | Já membro                      | Membership ativa existente                    | OWNER tenta convidar o mesmo e-mail e alterar perfil pelo convite                                   | `PROJECT_MEMBER_ALREADY_EXISTS`; membership/papel não muda                                                                            | CRITICAL             | Browser                         |
| H05 | Expirado                       | Convite artificial expirado                   | Abrir link e tentar aceitar/recusar                                                                 | Estado EXPIRED e feedback específico; nenhuma membership                                                                              | HIGH                 | Fixture controlada/SMTP         |
| H06 | Revogado                       | Convite PENDING                               | OWNER revoga; destinatário tenta usar o link                                                        | Estado REVOKED; aceite/recusa falham; histórico preservado                                                                            | HIGH                 | SMTP real                       |
| H07 | Perfis                         | OWNER, MANAGER, MEMBER e VIEWER ativos        | Com cada papel, listar equipe, ver e-mail, listar/criar convite e tentar alterar/desativar terceiro | Matriz efetiva aplicada: todos listam; só OWNER vê e-mail completo e administra                                                       | CRITICAL             | Quatro sessões/navegadores      |
| H08 | Último OWNER                   | Projeto com exatamente um OWNER               | Tentar rebaixar, desativar e sair; adicionar segundo OWNER e repetir ação válida                    | Todas as operações que produziriam zero OWNER retornam `LAST_PROJECT_OWNER`; com dois OWNERs, operação permitida mantém pelo menos um | CRITICAL             | Browser                         |
| H09 | Cross-project                  | User A no projeto A e User B no projeto B     | Alterar manualmente projectId, membershipId e invitationId em requests cruzados                     | 404 seguro quando sem membership/recurso cruzado; 403 para papel insuficiente; nenhuma mudança no outro projeto                       | CRITICAL             | Browser/cliente HTTP controlado |

## 11. Privacidade e estados — Ixx

| ID  | Domínio                   | Pré-condição                                   | Passos                                                      | Resultado esperado                                                                            | Severidade se falhar | Dependência externa                        |
| --- | ------------------------- | ---------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------ |
| I01 | ACTIVE                    | Conta normal                                   | Navegar por projetos, Settings e convites conforme papel    | Matriz normal de autorização aplicada                                                         | HIGH                 | Browser                                    |
| I02 | DEACTIVATED               | Conta artificial desativada                    | Tentar projetos, convite, Settings comuns e reativação      | Somente conta/reativação disponíveis; demais protegidos                                       | CRITICAL             | Browser                                    |
| I03 | DELETION_PENDING          | Conta artificial em carência                   | Tentar projetos, convite, exportação, status e cancelamento | Somente status/cancelamento/exportação permitidos; nenhuma operação de projeto                | CRITICAL             | Browser                                    |
| I04 | ANONYMIZED                | Conta artificial processada em ambiente seguro | Tentar login local/GitHub e localizar credenciais antigas   | Não autentica; identidade GitHub/credenciais removidas; dados históricos não são reassociados | CRITICAL             | Job controlado; GitHub OAuth real opcional |
| I05 | Dados pessoais/exportação | Conta com memberships e auditoria              | Consultar dados e exportar; inspecionar respostas/ZIP       | Somente dados próprios/autorizados; ausência de hashes, tokens, cookies e secrets             | CRITICAL             | Browser/ferramenta ZIP                     |
| I06 | Auditoria                 | OWNER e MEMBER do projeto A                    | Consultar auditoria pessoal e de projeto                    | Titular vê eventos próprios; somente OWNER vê projeto; metadata/e-mail minimizados            | HIGH                 | Browser                                    |

## 12. Error handling — Jxx

| ID  | Domínio             | Pré-condição                                                          | Passos                                                | Resultado esperado                                                                                | Severidade se falhar | Dependência externa                        |
| --- | ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------ |
| J01 | Login offline       | Backend desligado                                                     | Abrir `/login`, esperar, ligar backend e clicar retry | Login continua visualmente utilizável; sem “Voltar aos projetos”; sem loop; recuperação explícita | HIGH                 | Browser; controle do backend               |
| J02 | Visitante 401       | Backend ligado, sem sessão                                            | Abrir login/register                                  | 401 de `/me` não vira página fatal ou feedback de falha                                           | HIGH                 | Browser                                    |
| J03 | Rota 404            | Usuário abre rota inexistente                                         | Navegar diretamente                                   | GenericErrorPage “Página não encontrada”; ação “Ir para o início”                                 | MEDIUM               | Browser                                    |
| J04 | Projeto inexistente | Usuário autenticado abre `/projects/{id-inexistente}`                 | Aguardar carga                                        | Mensagem contextual de recurso/projeto; ação para projetos; sem stack                             | MEDIUM               | Browser                                    |
| J05 | Erro fatal e retry  | Forçar 500 na carga essencial de uma Settings                         | Abrir tela; restaurar backend; clicar retry           | Página contextual, request ID quando disponível e recuperação; sem retry automático               | HIGH                 | Ambiente capaz de injetar falha controlada |
| J06 | Erros não fatais    | Produzir validação, senha incorreta, 429 e falha de sync              | Observar UI                                           | Permanecem em FeedbackRegion/inline; página utilizável; `Retry-After` respeitado                  | MEDIUM               | Browser                                    |
| J07 | ErrorBoundary       | Usar build/fixture de homologação que cause erro de render controlado | Abrir rota afetada e acionar retry                    | UI genérica contextual, foco no título, botões do design system; stack/mensagem interna ausentes  | HIGH                 | Fixture controlada/browser                 |

## 13. Segurança cross-project — Kxx

| ID  | Domínio                | Pré-condição                                         | Passos                                                               | Resultado esperado                                                                                    | Severidade se falhar | Dependência externa                    |
| --- | ---------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------- |
| K01 | BOLA por projectId     | `outsider` e projeto A                               | Consultar detalhes, membros, convites e artifacts trocando projectId | 404 seguro; nenhum dado do projeto A                                                                  | CRITICAL             | Cliente HTTP controlado                |
| K02 | BOLA por recurso filho | Membership/convite pertencente ao projeto B          | Como OWNER A, enviar IDs de B nas rotas de A                         | 404/403 seguro; recurso B inalterado                                                                  | CRITICAL             | Cliente HTTP controlado                |
| K03 | Administração          | MANAGER/MEMBER/VIEWER                                | Chamar diretamente endpoints OWNER-only                              | 403; UI oculta ações, mas backend permanece autoridade                                                | CRITICAL             | Cliente HTTP controlado                |
| K04 | Minimização de e-mail  | OWNER e não OWNER                                    | Comparar DTO de membros/convites                                     | E-mail completo somente para OWNER onde contratado; nenhuma exposição em logs/auditoria               | HIGH                 | Browser/DevTools                       |
| K05 | Rate limit             | Quotas controladas                                   | Exceder login, leitura, mutação sensível, e-mail e sync              | 429 com scope público e `Retry-After`; outras contas não compartilham indevidamente quota autenticada | HIGH                 | Ambiente com limites reduzidos         |
| K06 | Sanitização            | Gerar 400, 401, 403, 404, 409, 429 e 500 controlados | Inspecionar UI, body e logs                                          | Sem stack, Prisma, config, token, cookie, senha ou e-mail desnecessário; request ID correlacionável   | CRITICAL             | Acesso autorizado aos logs sanitizados |

## 14. Dependências externas e ordem recomendada

| Dependência             | Cenários                                          | Condição para execução                                                                  |
| ----------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Browser real            | todos os cenários UI                              | navegador suportado, desktop e viewport pequeno; DevTools quando indicado               |
| SMTP real               | C01, C04–C09, D03–D04, D07, G02, H01–H02, H05–H06 | domínio/remetente e mailbox artificial controlados; nenhuma credencial em evidência     |
| GitHub OAuth real       | C11, E01–E05, E07                                 | OAuth App configurada e conta GitHub artificial autorizada                              |
| GitHub App/API real     | F01–F08                                           | App instalada em organização/conta de teste, repositórios artificiais e callback válido |
| Webhook/túnel HTTPS     | F09                                               | secret configurado, delivery ID controlado e endpoint alcançável                        |
| Falha/tempo controlados | B03, B08, C03, C09, F08, H05, J05, J07, K05–K06   | mecanismo de homologação que não altere dados reais nem exponha secrets                 |

Ordem sugerida:

1. A, B, J e K para provar sessão, recuperação e fronteiras de segurança;
2. C e D com SMTP artificial;
3. H e G com projetos/personas já preparados;
4. E e F com integrações externas;
5. I por último, usando exclusivamente contas destrutíveis artificiais.

## 15. Critério de encerramento do Work QA

O Work QA deve produzir a contagem total de `PASS`, `FAIL` e `BLOCKED`, registrar todos os DEFs e
separar dependência externa de defeito do produto.

- qualquer FAIL CRITICAL/HIGH em login, sessão, CSRF, recuperação, convite, membership, OWNER ou BOLA
  impede encerrar Login, Identidade e Acesso;
- BLOCKED por SMTP/GitHub/browser não deve ser convertido em PASS;
- D01 permanece decisão pendente não bloqueante enquanto o comportamento atual for exatamente o de
  G05;
- sem defeitos relevantes: encerrar Login, Identidade e Acesso;
- com defeitos: abrir L4.2, corrigir e executar reteste focado mais regressões relacionadas.
