# Diagnóstico e evolução incremental

> As seções abaixo registram o diagnóstico anterior à evolução. O estado atual
> e os critérios implementados estão no [README](README.md). As Fases 2–5 foram
> integradas: pipeline persistente, AIF360 reutilizado, AutoML com teste separado,
> SHAP, SQLAlchemy, modelos demonstrativos, interface guiada e Docker completo.
> O treinamento atual aplica as exclusões da análise e não usa a imputação legada.

## Arquitetura atual

Backend FastAPI: `Backend/app/main.py` registra `/health` e o router
`routes/train.py` (`/analyze`, `/train`, `/simulate`). `services/preprocess.py`
concentra leitura, limpeza, inferência de tipos, sugestões, binarização, imputação,
encoding e split. `services/models.py` treina Logistic Regression, Random Forest,
KNN e XGBoost com o mesmo split e tolera falhas por algoritmo.
`services/fairness.py` usa BinaryLabelDataset e ClassificationMetric do AIF360
no teste. `utils/file_handler.py` persiste uploads no disco.

Frontend React/TypeScript/Vite: `App.tsx` controla análise e treinamento;
`pages/Home.tsx` e `Components/Upload/UploadCSV.tsx` apresentam upload e escolhas.
`services/api.ts` usa Axios e VITE_API_URL (localhost:8000 em desenvolvimento).
`types/model.ts` define contratos. `pages/Dashboard.tsx` reúne comparação,
métricas, matriz de confusão, fairness e importância das features. Os componentes
e estilos existentes são reutilizáveis. Não há roteamento de páginas efetivo,
persistência de modelos ou banco. `hooks/usePrediction.ts` duplica parte do
estado de treinamento do App e não participa do fluxo principal.

## Fluxo atual

CSV → /analyze → seleção manual de target/sensitive → /train → limpeza e
binarização → imputação e get_dummies → split estratificado 70/30 → scaler
ajustado no treino → quatro modelos → métricas e AIF360 no teste → dashboard.
O modelo principal fica em variáveis globais; /simulate recebe features codificadas.

## Problemas e dívida técnica

- Imputação e descoberta de categorias antes do split contaminam a avaliação.
- Scaler e encoder não são preservados: /simulate não reproduz o treinamento.
- IDs, atributos sensíveis e informações posteriores ao evento entram nas features.
- Sugestões atuais aceitam praticamente qualquer coluna e usam substrings
  (por exemplo `cor` pode coincidir com palavras não relacionadas a raça).
- Leitura usa substituição de caracteres e descarta linhas inválidas silenciosamente.
- Conversão numérica remove letras; pode transformar IDs em números.
- Binarização e grupos privilegiados são inferidos sem confirmação explícita.
- Seleção balanceada usa média de accuracy e fairness sem configuração central.
- Estado global mistura usuários, desaparece no restart e não funciona entre workers.
- Upload sem limites/retenção; mensagens de exceção expõem detalhes internos.
- `Series.view` usado nas datas é incompatível com pandas 3 declarado no requirements.
- Não há testes próprios; tests dentro de data/ pertencem ao projeto folktables.
- O lint inicial do frontend acusa sincronização de estado dentro de useEffect
  no formulário de upload; corrigido nesta etapa com escolhas derivadas da análise.
- Docker é apenas do backend; AIF360 já está sem `[all]`, sem rpy2/R explícito.

## Proposta e etapas

1. Adicionar /analyze-dataset tipado e serviços independentes de leitura,
   semântica local extensível, profiling, leakage e qualidade. Preservar os endpoints
   legados: a migração de consumidores será explícita, sem mudar seus contratos.
2. Reutilizar modelos/AIF360, mover transformações para Pipeline/ColumnTransformer
   ajustados somente no treino, separar prediction_features/fairness_features,
   implementar seleção configurável e persistir pipeline completo.
3. Registro de modelos, inferência em lote e SHAP limitado por amostragem.
4. Integrar diagnóstico e confirmação de papéis à UI existente e evoluir páginas.
5. Robustez, auditoria, documentação operacional e deploy.

A Fase 1 não altera o treinamento legado. `prediction_features` é uma proposta
de configuração, excluindo IDs, sensíveis, constantes e leakage HIGH; aplicá-la
ao treinamento exige a Fase 2. IDs continuam na base original. As heurísticas
não comprovam ausência de vazamento, causalidade nem adequação dos dados.
