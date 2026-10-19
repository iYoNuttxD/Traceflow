# max-dev — Integração da main e eficiência dos testes (19/10/2026)

## Base e preservação

A atualização incorpora `main@66a5dba7d650c9172c63df109d1c829978120a3c` ao
`max-dev@4e688a5ab03f4c42d87da4aeff5d0f104bff4daa`, com os dois pais preservados no
[merge de baseline](https://github.com/iYoNuttxD/Traceflow/commit/c426a70f6c716cf5f6132e4e09a1d711242fa573).
Os três conflitos documentais foram reconciliados mantendo os recursos das duas branches,
os contratos do painel fixado e os avisos de revalidação visual do layout largo.

A nova varredura de autorização da main foi compatibilizada com o PATCH pessoal do painel:
VIEWER pode alterar sua própria fixação; uma verificação positiva confirma persistência,
preservação dos widgets e isolamento da preferência de outra conta. As verificações de
não membro, CSRF e escritas não autorizadas continuam no conjunto completo.

## Retrabalho

- Backend em dois projetos Vitest: unitários em dois processos isolados e todas as suítes com
  banco estritamente sequenciais, depois dos unitários. A cobertura continua uma união completa,
  executada uma única vez. Cada projeto possui setup, teardown e diretórios de evidências próprios.
- Cinco regressões novas conferem descoberta completa e sem duplicação, isolamento, preservação
  dos thresholds, cache de migrations exclusivo do grupo serial e configuração separada de ensaios.
- Dois testes unitários de erro do job acessavam o lease real antes de atingir o serviço simulado.
  Agora injetam a fronteira de lease e verificam suas chamadas e o sinal de cancelamento, além de
  preservar as assertions originais de erro. A persistência do lease continua testada com MySQL.
- F33 usa timeouts públicos menores nos cenários repetidos de interrupção. Mantém a primeira
  interrupção com o timeout padrão, as janelas reais de sucesso de 4,6 s/14,6 s, todas as rodadas,
  rollback, descarte de conexão e sondas posteriores. Não usa relógio falso nem recovery simulado
  para substituir essas provas de integração.
- Onze suítes frontend puras deixam de inicializar jsdom; o setup de React/DOM só é importado
  no ambiente de navegador. Testes que usam CSSOM e calendário mantêm seus ambientes necessários.
- O teste de 300 notificações evita recalcular os nomes acessíveis de todos os outros controles
  ao procurar o botão de paginação. Mantém os 14 cliques reais, nome/papel/visibilidade/estado do
  botão, contagem acessível em cada página e auditoria final dos 300 artigos sem duplicação.

Não foram alterados código da aplicação, dependências, lockfiles, thresholds, exclusões de
cobertura ou skips. O workload real de 1.000 + 5.000 eventos e as provas longas de contenção entre
projetos permanecem. A limpeza transacional preserva as 61 exclusões ordenadas: pré-filtrar tabelas
vazias com leitura consistente poderia mudar a semântica diante de commits tardios.

## Medições locais comparáveis

Node 22.23.3, Linux x64, 9 CPUs disponíveis. Execuções sucessivas no mesmo checkout/dependências,
sem outro teste ou build concorrente. Os valores são tempo de parede; a soma de durações de
arquivos paralelos não é tratada como duração total.

| Verificação | Referência | Otimizado | Resultado |
| --- | ---: | ---: | --- |
| Backend unitário, mesmo código final | 53,40 s, serial | 27,99 s, 2 workers | 47,6% menor; 1.635 testes/133 arquivos em ambos |
| Frontend completo com cobertura | 91,88 s | 92,22 s | Sem ganho integral demonstrado; 1.784 testes/142 arquivos em ambos |
| Paginação de 300 notificações dentro da suíte completa | 17,540 s | 13,177 s | 24,9% menor; mesmos cliques e checks acessíveis |

A lista completa de casos frontend e os resultados de cobertura por arquivo são idênticos nas
duas execuções. Statements 86,93%, branches 81,77%, functions 82,94% e lines 89,21%.
Os unitários passaram sem servidor MySQL disponível. A primeira execução anterior ao retrabalho
teve 1.628 aprovados e os dois erros de dependência de lease descritos acima; ela não foi usada
como referência para a comparação serial/paralela.

[Resultados estruturados](evidence/test-efficiency-20261019/local-validation.json).
Comandos de comparação e regras de isolamento estão em [CONTRIBUTING](../../CONTRIBUTING.md).

## Gates locais

Lint e formatação dos dois projetos, Prisma validate/generate, arquitetura e scanner de segredos
aprovados. Os 90 testes das políticas de CI/audit e do inventário de UI passaram, assim como os
12 testes de proteção de limpeza executados no novo projeto `database` sem servidor disponível.
As políticas de dependências dos dois projetos passaram sem ocorrências high/critical.
O build frontend de produção passou e mantém os avisos existentes de ELK, importação dinâmica e chunks grandes.

## Limites de validação

A execução local não é equivalente à CI completa. O ambiente impediu abrir o listener local do
MySQL; nenhum banco de desenvolvimento ou produção foi utilizado. A suíte backend completa,
a cobertura agregada, F33 e as migrations/upgrades históricos precisam ser confirmados na CI
com MySQL 8.4.8. A [CI 155 do baseline](https://github.com/iYoNuttxD/Traceflow/actions/runs/39327595634)
está em andamento neste checkpoint; resultados posteriores devem identificar o SHA validado.
A medição frontend não sustenta promessa de redução do tempo total dessa suíte.
Não houve alteração de produção/OCI nem merge da PR na main.
