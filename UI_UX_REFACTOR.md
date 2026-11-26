# FairDrop — interface e experiência de uso

Relatório da refatoração de 26/11/2026.

## Resultado

O FairDrop mantém React/TypeScript, Vite, Recharts, FastAPI, SQLAlchemy/SQLite e os artefatos Joblib existentes. Não houve troca de framework, adição de dependências, migração destrutiva, alteração do Docker ou publicação externa.

A navegação continua dividida em Visão geral, Bases de dados, Análises e Alunos e riscos. Dentro de uma análise, permanecem as seis abas. A configuração continua em três passos, com rascunhos separados por base e análise de origem.

## Diagnóstico

- A interface já preservava resultados e tinha explicações acessíveis, mas dependia de seletores individuais para comparar métricas.
- Bases, modelos e avaliações usavam cards grandes. O catálogo não tinha busca, ordenação, renomeação nem identificação por conteúdo.
- A prévia mostrava somente cinco registros, sem paginação.
- O início destacava duas entradas grandes e não distinguia adequadamente o primeiro acesso do trabalho com dados próprios.
- A visão geral de uma análise enfatizava desempenho e não resumia os pares de equidade.
- A mitigação repetia seis descrições e disponibilidades em cards, mesmo quando só uma técnica estava selecionada.
- O menu mostrava uma orientação estática, sem vínculo com a análise aberta. O botão de modo podia ser interpretado como estado atual ou destino.
- A remoção de uma base podia deixar uma análise sem o histórico necessário para novos experimentos.
- Modelos derivados de bases demonstrativas não herdavam explicitamente essa procedência.

O pipeline foi inspecionado: separação estratificada entre alunos, aproximadamente 60/20/20; pré-processamento e grupos ajustados no treino; escolha dos candidatos na validação; avaliação da versão escolhida no teste. O fluxo não foi substituído.

## Alterações por área

| Área | Comportamento implementado |
| --- | --- |
| Estrutura | Cabeçalho de 64 px no desktop, menu expandido de 232 px e recolhido de 64 px, densidade maior e abas de resultados visíveis durante a rolagem. |
| Preferências | Seletor explícito Simples/Técnico. Modo e expansão do menu persistem no `localStorage`; rascunhos continuam no armazenamento da sessão. |
| Progresso | Etapas vinculadas à base, ao modelo salvo, à execução e à aba aberta. Sem análise ativa, a orientação pode ser expandida. Não há porcentagens fictícias. |
| Visão geral | Importação principal e demonstração secundária. Sem dados próprios, os exemplos ficam recolhidos. Com dados, há contagens, bases e análises recentes, resumo da última análise própria e última avaliação de alunos. Lotes não são somados como pessoas únicas. |
| Bases | Tabela paginada, pesquisa por nome amigável ou original, busca sem distinção de acentos/maiúsculas, filtro de origem e ordenação global por nome, importação, registros e colunas. |
| Gerenciamento | Renomeação com manutenção do nome original; consulta de metadados e vínculos; exportação de uma cópia tratada; exclusão confirmada e bloqueada enquanto houver modelos ou treinamentos dependentes. |
| Importação | Nome amigável opcional e comparação por SHA-256 dos bytes. Arquivo idêntico oferece usar a base existente, criar nova versão ou cancelar. Nome igual, sozinho, não indica duplicidade. |
| Configuração | Prévia paginada, escolha dos algoritmos já suportados, resumo da identificação, grupos e divisão dos dados, configurações avançadas preservadas e ação de execução consistente. |
| Desempenho | Métricas simultâneas, matriz de confusão visual em quantidades ou percentuais por classe real, consulta das explicações e curvas sob demanda. |
| Equidade | Seleção de atributo e par efetivamente analisados, referência explícita, amostras, contagens de positivos/negativos, taxas por grupo, métricas simultâneas e gráficos com escalas adequadas. |
| Mitigação | Lista por pré-processamento/durante o treinamento e painel da técnica selecionada. Incompatibilidades podem ser consultadas; a execução exige elegibilidade real da API. Técnicas próprias experimentais continuam identificadas. |
| Comparação | Tabelas de desempenho e equidade com antes, depois, variação e interpretação por medida. Gráfico comparativo e matrizes lado a lado sob demanda. Preparar outro experimento fica recolhido em resultados já concluídos. |
| Alunos | Avaliações em tabela, pesquisa e filtros existentes, ordenação dos alunos no servidor, barras compactas dos escores, contexto dos limiares e modelo na revisão individual. Revisões e simulações permanecem disponíveis. |
| Ficha | Exportação JSON de parâmetros, resultados agregados e metadados disponíveis, sem linhas de estudantes. Novos treinamentos registram seed, versões, classe e parâmetros serializáveis do estimador e etapas do pré-processamento. |

## Design e componentes

As cores escuras e o destaque menta foram mantidos. Espaçamentos, dimensões da estrutura e cores dos gráficos estão centralizados em `Frontend/src/Workspace.css`. Azul diferencia séries comparadas; âmbar identifica erros/atenção. Rótulos e valores continuam transmitindo a informação sem depender apenas da cor.

Foram reutilizados `AppShell`, `WorkspaceTabs`, `MetricGrid`, `MetricExplorer`, `TrainingProgress`, `FilePicker`, tabelas de risco e componentes de explicação. Foram acrescentados:

- `DatasetCatalog` e `Dialog`: catálogo e gerenciamento com diálogo nativo, Escape e retorno de foco.
- `WorkspaceDashboard` e `WorkflowProvider`: visão de trabalho e contexto compartilhado das etapas.
- `ConfusionMatrix` e `EvaluationCharts`: matriz, ROC, precisão–recall, distribuição e calibração.
- `FairnessVisuals`: resumo, amostras e gráficos das comparações reais.
- `MitigationComparison` e `metricChanges`: comparação com unidades e direção específicas.
- Helpers de download, preferências e contexto do fluxo, sem outro gerenciador de estado ou biblioteca gráfica.

Há foco visível, campos rotulados, tabelas semânticas, nomes para gráficos, seleção por teclado, redução de movimento e menu adaptado ao celular. A aplicação não recebeu uma certificação formal WCAG: esses aspectos foram inspecionados e testados no escopo da mudança.

## API e persistência

| Endpoint | Alteração |
| --- | --- |
| `GET /dataset-catalog` | Novo. Pesquisa, filtro, ordenação e paginação no servidor, contagem total e metadados compactos dos registros da instituição configurada. |
| `POST /datasets/check-duplicate` | Novo. Compara arquivos idênticos com hash registrado, sem importar nem excluir dados. |
| `POST /datasets` | Campo opcional `name`; clientes anteriores continuam aceitos. Guarda nome original e hash. |
| `PATCH /datasets/{id}` | Novo. Altera somente o nome amigável. |
| `GET /datasets/{id}/dependencies` | Novo. Informa modelos e execuções que usam a base. |
| `GET /datasets/{id}/preview` | Aceita `offset` e `limit`; mantém os campos anteriores e acrescenta total/paginação. O padrão anterior de cinco linhas permanece. |
| `GET /datasets/{id}/export` | Novo. CSV tratado em blocos, com IDs reconhecidos ocultos e neutralização de fórmulas em textos. |
| `DELETE /datasets/{id}` | Passa a retornar 409 quando a remoção comprometer modelos ou execuções. Não exige excluir análises para simplesmente renomear ou reutilizar a base. |
| `GET /models/{id}` | Acrescenta disponibilidade para novas previsões, considerando artefato e o bloqueio metodológico já existente para atributos posteriores ao resultado. |
| `GET /predictions/{id}/students` | Ordenação opcional; padrão continua sendo maior risco primeiro. Filtros e paginação são aplicados ao conjunto inteiro, antes da seleção da página. |
| `GET /dashboard` | Mantém `latest_batch`/`message` e acrescenta contagens e registros recentes. |

Os dados continuam nas tabelas e nos artefatos existentes. Campos novos dos relatórios têm padrões compatíveis com registros antigos. Renomear uma base não reescreve o retrato do nome guardado em análises anteriores. Não houve reprocessamento automático de modelos antigos.

A proteção contra excluir uma base cobre execuções em fila e treinamento síncrono/assíncrono, usando os registros persistidos e um controle de uso da instância. A arquitetura suportada continua sendo uma única instância/processo de backend; isto não implementa coordenação distribuída.

Arquivos principais do backend: `routes/platform.py`, `schemas/platform.py`, `repository.py`, `dataset_catalog.py`, `dataset_usage.py`, `model_evaluator.py`, `model_registry.py`, `platform_training.py` e a reutilização da validação existente em `prediction.py`. No frontend, as quatro páginas, a estrutura, os componentes acima, tipos, serviços e testes foram atualizados.

## Integridade científica

- Foram preservadas as fórmulas das métricas, os pesos de seleção, a divisão dos dados e as implementações das seis técnicas. Nenhum pós-processamento inexistente foi incluído como opção executável.
- ROC e precisão–recall são calculadas com as previsões reais da avaliação, sem reconstruí-las a partir de AUC. O histograma usa contagens reais. Até 150 pontos observados por curva são usados para desenho; os escores originais usam o conjunto completo.
- O campo histórico `pr_auc` continua representando precisão média/AP, como antes. A interface distingue essa medida da área trapezoidal de uma curva desenhada.
- A matriz conserva a ordem `[[TN, FP], [FN, TP]]`. A normalização divide por classe real. Denominador zero produz indisponibilidade, não porcentagem zero artificial.
- DI usa referência em 1 e escala própria. SPD, EOD e AOD usam referência em 0, preservando sinais. AOD pode esconder cancelamentos. O resumo informa quando mostra somente o primeiro par e também apresenta o estado global retornado pelo backend.
- As variações não recebem interpretação uniforme: Brier deve diminuir, razões são comparadas pela distância de 1 e diferenças pela distância de 0. Valores ausentes e pares sem correspondência não viram zero.
- O modelo original é preservado. O “antes” de um experimento é a referência sem ajuste daquele experimento e pode usar algoritmo diferente da análise de origem. Essa distinção está visível.
- Avaliações repetidas no mesmo histórico são exploratórias. Validar em outra turma/período continua necessário antes de tratar a escolha como avaliação final independente.
- SHAP, importância nativa, simulações e associações não são apresentados como causas da situação do aluno. Escores não são garantias individuais nem autorização para decisões punitivas.

As convenções foram conferidas na documentação primária do [AIF360](https://aif360.readthedocs.io/en/stable/modules/generated/aif360.metrics.ClassificationMetric.html) e do [scikit-learn](https://scikit-learn.org/stable/modules/model_evaluation.html). A documentação de [precisão–recall](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_recall_curve.html) também orienta a apresentação das curvas.

## Validação

- Referência inicial: os 16 testes anteriores da interface passaram antes das alterações.
- Backend: suíte completa com 94 testes aprovados, cobrindo treinamento, limpeza, compatibilidade, isolamento da instituição configurada, explicação, fairness e seis técnicas de mitigação.
- Testes novos do backend: catálogo global/paginação, caracteres literais e acentos na busca, hash/versões, renomeação sem alterar a base, prévia, exportação protegida, vínculos e uso concorrente da base, metadados antigos e correspondência dos pontos das curvas com as previsões reais.
- Interface: 20 testes aprovados, incluindo os fluxos anteriores e novos testes de catálogo, duplicidade, arquivo inválido, exportação, matriz normalizada, curvas, grupos, elegibilidade, preservação da análise original, preferências, teclado e recuperação após erro da API.
- `npm run lint`, `npm run build` e `git diff --check` executados.
- Capturas antes/depois na pasta local ignorada `.run/product-before-*.png` e `.run/product-after-*.png`, sem publicação. Foram inspecionadas telas renderizadas, não apenas o código.
- Conferência de larguras em 1280×720, 1366×768, 1440×900, 1920×1080, 2560×1440, 390×844 e 320×760. O transbordamento encontrado na comparação de mitigação foi corrigido e a conferência incluiu conteúdo expandido.

Os testes usam armazenamento isolado. A prévia de revisão usa dados demonstrativos em `.run/product-preview-data`; não substitui o banco de trabalho do usuário. Permanecem avisos de bibliotecas de terceiros sobre APIs depreciadas e divisões indefinidas em casos-limite; não foram escondidos nem convertidos em conclusões de equidade.

## Limitações e decisões

- Registros antigos sem hash não permitem reconhecer bytes idênticos de um arquivo que não foi originalmente guardado. Não foi inferida duplicidade pelo nome.
- Análises antigas sem curvas/seed/versões mantêm esses dados ausentes. Para registrar as novas informações, é necessário executar uma nova análise; a anterior não é sobrescrita.
- Não foram adicionados intervalos de confiança, novas técnicas de mitigação, autenticação de múltiplos usuários ou coordenação entre múltiplos processos. A interface explicita a ausência de intervalos e respeita as capacidades atuais.
- O tema claro foi avaliado e adiado para preservar a prioridade da refatoração e validar corretamente as cores analíticas. O tema escuro continua padrão.
- A máscara de identificadores é automática e não garante anonimização completa. Exporte somente o necessário e confira outras informações pessoais antes de compartilhar. O CSV tratado exportado não substitui o original restrito para reprodução exata do treinamento.
- A exportação da ficha usa dados agregados e parâmetros; não inclui linhas de alunos. `localStorage` guarda apenas preferências de apresentação. Rascunhos ficam na sessão e arquivos ainda não importados somente em memória.
- O isolamento por instituição é uma configuração do backend, não um sistema completo de contas/perfis. A API pode exigir token, mas esta refatoração não acrescenta uma tela de credenciais. Não há declaração de conformidade integral com a LGPD.
- Docker e hospedagem não foram alterados nem publicados. Frontend e backend devem ser atualizados juntos. No Docker, execute `docker compose up --build -d` para carregar a nova API, preservando os volumes. Na execução manual, reinicie o backend e o frontend normalmente.
