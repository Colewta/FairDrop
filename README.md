# FairDrop

Plataforma local de previsão, explicação e avaliação de equidade. Envie um histórico,
confirme o resultado que quer identificar e aplique o modelo salvo a uma base atual.

## Quero experimentar agora

No Windows, abra **`Iniciar FairDrop.cmd`** nesta pasta. O iniciador prepara as
dependências quando necessário e abre a aplicação em **http://localhost:5173**.
Pré-requisitos: Python 3.12 e Node.js 22. O primeiro preparo precisa de internet;
as análises e previsões funcionam localmente.

Na página inicial, clique **Experimentar com dados de exemplo**. Dois modelos
pré-treinados e uma turma fictícia de 30 alunos já acompanham o projeto.
Abra **Revisar aluno** para ver a probabilidade e os fatores associados.
Os modelos demonstrativos servem para conhecer a aplicação, não para decisões reais.

## Quero usar minha base

1. Na página inicial, escolha **Começar com minha base**.
2. Selecione ou arraste um CSV, XLSX, XLS, TXT ou TSV e clique **Importar e conferir**.
3. Confira a prévia e as correções de formato/cabeçalho informadas na tela.
4. Confirme a coluna com o resultado conhecido e a situação que merece atenção.
   Se o resultado for um número contínuo, escolha uma faixa (por exemplo, renda ≥ 50000).
5. Clique **Criar minha análise**. O FairDrop prepara os dados, compara os quatro
   algoritmos e salva o modelo recomendado automaticamente.
6. Na ficha do modelo, clique **Continuar com uma base atual**. Envie os mesmos
   campos de informação; a coluna do resultado não é necessária.
7. Filtre os casos por risco, curso ou turma e abra cada aluno para revisão. Enviar novos lotes
   com o mesmo identificador acrescenta observações ao histórico.

O **Modo técnico** abre detalhes de features, grupos, limiares, calibração,
validação cruzada e métricas. O modo simples usa configurações documentadas abaixo.

## Explicar resultados e mitigar vieses

Na revisão do aluno, os fatores agora incluem contexto histórico, perguntas para
investigação, simulação de indicadores acadêmicos e um plano de revisão que pode
ser salvo pelo tutor. Na ficha do modelo, **Mitigação de vieses** compara erros por
grupo e permite executar reponderação AIF360, mostrando antes/depois no teste.
O original é preservado e uma piora não é apresentada como melhoria.

Veja o [guia de explicabilidade e vieses](EXPLICABILIDADE_E_VIESES.md) para o passo a
passo, metodologia, limites e referências para o trabalho acadêmico.

## Execução manual

Backend, na pasta `Backend`:

```powershell
py -3.12 -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Frontend, em outro terminal, na pasta `Frontend`:

```powershell
npm install
npm run dev
```

## Docker

O arquivo **`docker-compose.yml` na raiz** sobe o backend e o frontend juntos:

```powershell
docker compose up --build -d
```

- Frontend: **http://localhost:5173**.
- API: **http://localhost:8000**; documentação em **http://localhost:8000/docs**.

O backend continua usando `Backend/Dockerfile`, com as mesmas dependências,
comando de inicialização e armazenamento persistente. O frontend usa a imagem
Node.js 22 e executa `npm install`, seguido de `npm run dev`. Os argumentos
`--host 0.0.0.0 --port 5173 --strictPort` permitem acessar o Vite pelo navegador
e mantêm a porta interna fixa. Não é necessário construir uma imagem própria
para o frontend nem instalar Node.js ou Python no computador para esta execução.

A pasta `Frontend` fica montada no contêiner. As dependências são instaladas em
um volume separado, sem reutilizar o `node_modules` do Windows. O frontend
aguarda o backend ficar saudável antes de iniciar. Esta configuração usa o
servidor de desenvolvimento solicitado; os arquivos de Nginx e o Dockerfile do
frontend permanecem disponíveis para a configuração anterior.

Para acompanhar a inicialização: `docker compose logs -f`. Para parar:
`docker compose down`. O banco, os modelos e as dependências permanecem nos
volumes. Para subir apenas o backend: `docker compose up --build -d backend`.

Se as portas estiverem ocupadas, defina `FAIRDROP_FRONTEND_PORT` e
`FAIRDROP_BACKEND_PORT` em um `.env` na raiz. Por exemplo:

```dotenv
FAIRDROP_FRONTEND_PORT=5175
FAIRDROP_BACKEND_PORT=8015
```

Nesse caso, abra http://localhost:5175. A URL da API e as origens permitidas são
ajustadas pelo Compose. A instalação antiga em `Backend/docker-compose.yml`
permanece disponível e mantém seus volumes; o arquivo da raiz não migra
automaticamente os dados dessa instalação.

No repositório unificado, mantenha a estrutura `Backend/`, `Frontend/` e
`docker-compose.yml` na raiz. As duas pastas precisam conter os arquivos do
projeto, não apenas referências aos repositórios antigos.

O backend usa Python 3.12, AIF360 sem extras `[all]`, OpenMP para XGBoost e não
instala rpy2, R, TensorFlow ou outros extras do AIF360. O usuário do container não
é root. Uma única instância de backend atende cada instalação.

## Configuração

Copie `Backend/.env.example` para `Backend/.env` na execução local. No compose da
raiz, use variáveis de ambiente ou um `.env` na raiz.

| Variável | Uso / padrão |
| --- | --- |
| `FAIRDROP_INSTITUTION_ID` | Identificador da instituição; `local` |
| `FAIRDROP_STORAGE_DIR` | Pasta de banco/artefatos; `Backend/data/platform` |
| `FAIRDROP_API_TOKEN` | Proteção opcional da API; mantenha vazia para usar a interface atual, sem formulário de chave |
| `FAIRDROP_DEMO_ENABLED` | `true`; instala exemplos na primeira inicialização |
| `FAIRDROP_MAX_UPLOAD_BYTES` | 100 MiB |
| `FAIRDROP_MAX_ROWS` | 500000 |
| `FAIRDROP_MAX_COLUMNS` | 500 |
| `FRONTEND_ORIGINS` | Origens adicionais permitidas no CORS |
| `VITE_API_URL` | URL da API no frontend; localhost:8000 no desenvolvimento, `/api` no build |
| `FAIRDROP_FRONTEND_PORT` | Porta do frontend no Compose da raiz; `5173` |
| `FAIRDROP_BACKEND_PORT` | Porta da API no Compose da raiz; `8000` |

Esta versão é uma instalação por instituição, sem contas individuais ou RBAC.
Antes de expor em rede, configure a chave, HTTPS no proxy e restrições de acesso.
Dados ficam no disco local; o sistema não os envia a LLMs ou serviços de análise.
Proteja o volume e seus backups. APIs de exclusão permitem remover bases, modelos
e lotes; excluir um modelo mantém previsões anteriores e sua auditoria.

## Arquitetura e metodologia

```text
React → FastAPI → leitura por conteúdo → profiler/semântica/leakage/qualidade
                         ↓
  escolha da classe/faixa → split estratificado 60/20/20
                         ↓
  Pipeline(schema → ColumnTransformer → imputação/encoding/escala → algoritmo)
                         ↓
  seleção na validação → avaliação final no teste → AIF360 → SHAP
                         ↓
  SQLAlchemy/SQLite + joblib → inferência em lotes → histórico por aluno
```

- Logistic Regression, Random Forest, KNN e XGBoost compartilham a mesma divisão,
  com `random_state=42`. Erros de um algoritmo não interrompem os restantes.
- Mediana, moda, categorias e scaler são ajustados somente no treino. Categorias
  novas são aceitas. Colunas extras são ignoradas; faltantes/tipos incompatíveis
  produzem uma mensagem com a coluna que precisa de correção.
- IDs, resultado, constantes, sensíveis e leakage HIGH ficam fora das features
  por padrão. No modo técnico, sensíveis e vazamentos revisados podem ser
  autorizados explicitamente; IDs e resultado nunca entram no modelo.
- A classe/faixa de atenção é confirmada pela pessoa. As outras classes formam
  o grupo negativo. Não há binarização silenciosa de resultados contínuos.
- Imputação/escala/encoding também ficam dentro dos folds da calibração sigmoide
  e da validação cruzada opcionais. CV roda só no treino e retorna média/desvio;
  métricas CV usam o limiar padrão do estimador (0,5). Seleção e teste usam o
  limiar configurado. O vencedor não é reajustado depois da avaliação final.
- Pesos de classe são usados em Logistic Regression, Random Forest e XGBoost.
  KNN não suporta esse ajuste. Não há SMOTE automático.
- Exige ao menos 30 registros e 8 de cada classe binária; IDs confirmados repetidos
  são rejeitados para impedir o mesmo aluno em divisões diferentes. Sem um ID
  confirmado não é possível garantir independência por aluno.

### Seleção dos modelos

Pesos explícitos em `Backend/app/core/config.py`:

| Estratégia | Recall | ROC-AUC | PR-AUC | Fairness | 1 − Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| `best_predictive` | .40 | .30 | .30 | 0 | 0 |
| `best_fairness` | .15 | 0 | .15 | .70 | 0 |
| `best_balanced` | .30 | .20 | .15 | .20 | .15 |

São preferências operacionais configuráveis, não pesos universais. Critérios
indisponíveis são retirados e os pesos restantes renormalizados. Os pesos efetivos,
componentes e falhas ficam registrados em cada comparação. A API também aceita
`selection_weights`. Calibração é avaliada por Brier e curva de calibração; as
probabilidades não são garantias individuais.

### Fairness

Reutiliza BinaryLabelDataset/ClassificationMetric do AIF360: SPD, DI, EOD e AOD.
Grupos são definidos no treino e avaliados na validação e no teste. Compara cada
grupo a uma referência descritiva; a referência automática é a mais frequente no
treino, sem afirmar privilégio social. Variáveis numéricas com muitos valores são
agrupadas pela mediana do treino; a regra é informada. Comparações com menos de
5 pessoas em um grupo são omitidas com aviso. Ausentes não removem pessoas da
avaliação preditiva. O score é o pior score de comparação disponível, reutilizando
a fórmula histórica documentada em `services/fairness.py`.

Diferenças absolutas >.10/.20 e DI fora de [.80,1.25]/[.65,1.50] produzem atenção/
disparidade relevante. Esses critérios não certificam justiça. Classe positiva
significa a situação de atenção escolhida, que pode ser adversa.

### Explicações e risco

SHAP por permutação usa o pipeline completo, inclusive quando calibrado. O fundo
tem até 12 exemplos; a explicação global usa até 16. São aproximações com uma
permutação, até 100 variáveis. Explicações individuais são calculadas ao abrir
o registro e armazenadas; tabelas não recalculam SHAP para milhares de pessoas.
`top_factors` começa vazio/pendente e é preenchido após essa consulta. A API
devolve status indisponível se SHAP não puder ser calculado, sem inventar fatores.
Importância nativa do algoritmo e SHAP aparecem separadamente.

Faixas padrão: baixo <.30, médio de .30 até <.70, alto ≥.70. Limiar de classificação
padrão .50. Faixas são operacionais. O modelo não determina causalidade nem faz
recomendações clínicas. Previsões são processadas em blocos de 2000; a tabela tem
paginação, busca e filtros. O dashboard mostra o lote mais recente, evitando
somar repetidamente o mesmo aluno entre datas.

## Endpoints

| Método / caminho | Uso |
| --- | --- |
| GET `/health`, `/docs` | Saúde e contrato OpenAPI |
| POST `/analyze-dataset` | Diagnóstico sem persistir |
| POST/GET `/datasets` | Importar/listar bases |
| GET/DELETE `/datasets/{id}` | Detalhar/reanalisar com `?target=` ou excluir |
| GET `/datasets/{id}/preview`, `/values?column=` | Prévia limitada e classes/faixa |
| POST `/training-runs` | Iniciar treino em segundo plano |
| GET `/training-runs/{id}` | Estado/erro/modelo gerado |
| POST `/train-automl` | Treino síncrono com configuração JSON |
| GET `/models`, GET/DELETE `/models/{id}` | Modelos e fichas |
| POST `/predict` | Multipart `file` + `model_id`; cria lote |
| GET `/predictions`, GET/DELETE `/predictions/{id}` | Lotes e auditoria |
| GET `/predictions/{id}/students` | `page`, `page_size`, `risk`, `q` |
| GET `/students/{id}` | Previsão, SHAP e até 100 observações históricas |
| GET `/dashboard` | Resumo do último lote |
| GET `/demo`, POST `/demo/predict` | Modelos prontos e experiência em um clique |
| GET `/demo/files/historical`, `/demo/files/current` | Arquivos fictícios |
| POST `/analyze`, `/train`, `/simulate` | Adaptadores dos contratos anteriores |

O histórico usa o ID da **previsão** na URL `/students/{id}`; o identificador do
aluno fica no conteúdo e é usado para ligar períodos. Compare históricos com
cuidado quando o modelo mudar. `/simulate` recebe valores brutos, aplica o
pipeline salvo e aceita `model_id`; sem ID usa o modelo salvo mais recente.
`/train` mantém as chaves em português, agora com treino persistente e metodologia
corrigida. Amostras de células pessoais não são devolvidas no contrato legado.

## Persistência e estrutura

```text
Backend/app/core/          configuração
Backend/app/schemas/       contratos Pydantic
Backend/app/routes/        endpoints atuais e adaptadores legados
Backend/app/services/      profiling, ML, fairness, SHAP, armazenamento e inferência
Backend/demo_assets/       dois modelos e duas bases fictícias distribuídos
Backend/tests/             testes de serviços, regressão e integração
Backend/data/platform/     SQLite e artefatos privados, fora do Git
Frontend/src/Components/   componentes existentes e componentes guiados
Frontend/src/pages/        bases, modelos, previsões, dashboard e aluno
Frontend/tests/            jornada real no navegador
```

Os artefatos usam pastas por instituição/UUID, `model.joblib` e `metadata.json`.
Joblib só carrega arquivos criados/distribuídos pelo servidor, nunca um modelo
enviado por upload. Modelos são compatíveis com as versões de dependências usadas
no treinamento; reavalie/recrie artefatos antes de migrar scikit-learn.
SQLAlchemy separa tabelas de instituições, datasets, execuções, modelos, lotes e
previsões. A camada de artefatos pode ser substituída por armazenamento em nuvem.

Treinamento usa BackgroundTasks e uma vaga por processo; não é uma fila distribuída.
Use **um worker**. Reinício marca execuções interrompidas como falhas, permitindo
reiniciá-las. Não há controle longitudinal causal, intervenção automática ou
promessa de validade fora dos dados de avaliação.

## Testes

```powershell
# Backend
.\venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\venv\Scripts\python.exe -m pytest tests -q
.\venv\Scripts\python.exe -m compileall -q app

# Frontend
npm run lint
npm run build
npm run test:e2e
```

Playwright inicia servidores isolados nas portas 8017/5177 e usa Edge headless
no Windows. Para outro navegador, ajuste `channel` em `playwright.config.ts`.
Testes usam pastas temporárias e dados fictícios. As bases reais incluídas em
`Backend/data` também têm testes de regressão de leitura quando presentes.

Para regenerar apenas os modelos fictícios com as dependências atuais:
`python -m scripts.build_demo` em `Backend`. Exemplos são instalados uma vez por
instituição; excluir um exemplo não o faz reaparecer em cada reinício.
