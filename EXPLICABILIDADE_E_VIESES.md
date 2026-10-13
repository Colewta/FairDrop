# Da explicação à mitigação de vieses

## Caminho para o tutor

1. Abra uma avaliação, escolha **Revisar aluno** e leia **Por que o modelo apresentou este risco?**.
2. Cada fator apresenta contribuição SHAP, valor do registro, mediana ou categoria histórica e, quando há amostra suficiente, frequência do resultado nessa faixa e nos demais registros.
3. Abra **Como investigar e apoiar este aluno**. São perguntas e possibilidades de apoio, não afirmações sobre a vida do aluno.
4. **Explorar este indicador** simula outra frequência, nota ou participação. A aplicação preserva o registro original e mantém as demais informações fixas. Não é estimativa causal de uma intervenção.
5. Registre o **Plano de revisão do tutor**, incluindo eventuais erros de dados e discordância do alerta. O registro é persistente e vinculado à previsão; não modifica o modelo automaticamente.
6. Entre na ficha do modelo e em **Mitigação de vieses**. Compare falsos alertas e casos não detectados por grupo. Escolha um atributo e clique **Comparar antes e depois da mitigação**.
7. Examine tanto as diferenças entre grupos quanto a identificação de casos e o erro das probabilidades. Uma melhora em um indicador pode coexistir com piora em outro.

## Três perguntas diferentes

| Pergunta | Evidência apresentada | Limite |
| --- | --- | --- |
| Por que o modelo deu este número? | SHAP: contribuição das informações para a previsão em relação a uma referência | Atribuição do modelo, não causa da evasão |
| Que padrões aparecem no histórico? | Comparações agregadas de faixas/categorias no treino | Associações podem refletir fatores não observados e desigualdades históricas |
| Como reduzir danos e diferenças? | Revisão humana, correção de dados, apoio acessível e experimento com reponderação | Nenhuma técnica ou limiar certifica ausência de viés |

Um efeito de +12 pontos percentuais não significa que a informação sozinha cause 12% de chance de evasão. As contribuições de **todas** as variáveis, somadas ao valor de referência SHAP, recompõem aproximadamente a previsão. O modo simples mostra os cinco maiores impactos; os demais continuam no cálculo.

## Entender as métricas sem formação em computação

Em **Modelos → abrir um modelo**, o modo simples oferece três etapas navegáveis:

1. **Entender acertos e erros:** contagens reais do teste e um seletor de medidas de ML. Cada medida explica o significado, o resultado dessa avaliação, a importância para a escola, uma ação possível e os limites da interpretação.
2. **Conferir diferenças entre grupos:** escolha o par de grupos e a medida de equidade. A leitura identifica o grupo analisado, a referência, o sentido da diferença e as taxas observadas. A referência é descritiva, não uma afirmação de privilégio social.
3. **Escolher como agir:** o guia de mitigação explica quando considerar cada ação, traz um exemplo fictício identificado, separa responsabilidades do tutor e da equipe técnica e mostra como conferir se ajudou.

O **resultado de risco** é a classe confirmada ao configurar a base, não necessariamente evasão em todos os projetos. “Positivo” nas métricas de equidade significa **alerta para esse resultado**. Emitir alertas pode ampliar oportunidades de apoio, mas também produzir abordagens indevidas; emitir menos pode deixar necessidades invisíveis.

| Medida | Pergunta em linguagem simples | Cuidado principal |
| --- | --- | --- |
| Recall | Dos casos reais, quantos receberam alerta? | Confira quantos ficaram sem identificação. |
| Precisão | Dos alertas, quantos se confirmaram no histórico? | Não diz quantos casos reais ficaram sem alerta. |
| Acurácia | Quantas previsões acertaram, no total? | Uma situação muito comum pode esconder erros na outra. A tela compara com sempre prever a situação mais comum. |
| F1 | Precisão e recall estão equilibrados? | É um índice, não a porcentagem de alunos previstos corretamente. |
| ROC-AUC | Casos reais tendem a receber maior pontuação? | Mede ordenação; não é a chance de evasão de um aluno. |
| PR-AUC / AP | Como fica a precisão ao tentar encontrar mais casos? | O cálculo usado é average precision, não integração trapezoidal. Depende da proporção de casos reais. |
| Especificidade | Quem não teve o resultado ficou corretamente sem alerta? | Pode ser alta mesmo quando todos os casos reais passam despercebidos. |
| Acurácia balanceada | O modelo acerta nas duas situações de resultado? | Equilibrar classes de resultado não é equilibrar grupos sociais. |
| Brier | Quanto as probabilidades erraram em relação aos resultados? | Menor é melhor na mesma avaliação. Não mede apenas calibração nem comprova equidade. |
| Disparate Impact (DI) | Um grupo recebe proporcionalmente mais alertas? | É uma razão: 1 indica taxas iguais; abaixo de 1, menos alertas no grupo analisado; acima de 1, mais. |
| Statistical Parity Difference (SPD) | Qual a distância entre as taxas de alerta? | É grupo menos referência, exibida em pontos percentuais. |
| Equal Opportunity Difference (EOD) | A detecção dos casos reais difere entre grupos? | Valor negativo significa menor detecção no grupo analisado. |
| Average Odds Difference (AOD) | Como diferem detecção e falsos alertas em conjunto? | A média preserva os sinais; diferenças opostas podem se cancelar. |
| Fairness score | Como resumir as distâncias entre os grupos? | Índice interno, não porcentagem de justiça. A ficha usa o pior par entre os avaliados. |

**Exemplo fictício:** alertas para 20% de um grupo e 40% da referência produzem DI = 0,50 (metade da taxa, ou 50% menos) e SPD = −20 pontos percentuais. Esses números descrevem o comportamento do modelo; não alteram a base, não explicam sozinhos a causa da diferença e não demonstram discriminação individual.

As leituras de precisão, recall, especificidade e acurácia usam os denominadores da matriz de confusão. Sem alertas, a precisão fica **indisponível**, mesmo quando a biblioteca armazenou zero por convenção. Sem casos de uma classe, a respectiva medida não é interpretada como desempenho observado. Razões indefinidas e valores não finitos também são indisponíveis, não sinais de equidade.

O painel explica probabilidade, limite de alerta, calibração, treino, validação, teste e tamanho da amostra. A comparação de modelos explica a pontuação ponderada e a redistribuição dos pesos quando uma medida está indisponível. Não há um corte universal para declarar desempenho “bom”.

### Guia de mitigação para o tutor

- **Corrigir registros:** conferir a fonte e importar dados corrigidos; alterações no histórico de treino exigem novo treino.
- **Melhorar a representação:** buscar registros reais de grupos e períodos pouco presentes; duplicar linhas não cria evidência nova.
- **Reponderar:** testar pesos diferentes para combinações de grupo e resultado, sem alterar os valores originais. O experimento está disponível no próprio painel.
- **Revisar variáveis e proxies:** investigar pistas indiretas de desigualdade e comparar modelos com e sem elas. A seleção de informações fica na configuração técnica de treino.
- **Revisar o limite de alerta:** comparar o ganho de detecção e os falsos alertas. A aplicação permite um limite comum; não aplica automaticamente limites por grupo.
- **Calibrar:** testar se a escala das probabilidades se aproxima das frequências observadas. Essa opção de treino não garante equidade.
- **Ampliar o acesso ao apoio e acompanhar:** registrar a revisão individual, verificar barreiras de atendimento e reavaliar os erros quando houver resultados reais de novos períodos.

O resultado da reponderação inclui uma leitura textual das contagens antes e depois, da mudança em pontos percentuais e da distância de DI em relação a 1. Informa se a variante foi escolhida pela validação; as colunas da variante continuam sendo exibidas mesmo quando a versão original é mantida. Nenhuma melhora isolada é apresentada como eliminação do viés.

## Contexto histórico

Os resumos são calculados **somente no conjunto de treino** e salvos com o pipeline. Números usam faixas definidas pelos quartis 25% e 75%; a tela informa os limites, a mediana, o tamanho da amostra e as taxas do resultado confirmado. Categorias usam a categoria do registro e os demais valores não ausentes. Uma taxa só aparece quando tanto o grupo quanto a comparação possuem pelo menos dez registros. Esse limite evita exibir taxas muito frágeis; não representa garantia estatística ou anonimato formal.

Modelos antigos, que não têm esses resumos, continuam funcionando: a tela identifica a amostra de referência disponível e não inventa taxas de evasão sem rótulos. Para obter estatísticas do treino completo, faça um novo treinamento. SHAP continua aproximado, com amostragem limitada; seus exemplos de referência são distintos dos agregados de contexto.

Ausências, categorias sem referência e valores fora da faixa histórica geram explicações específicas. Um padrão agregado pode diferir do efeito individual por interações e correlações; a aplicação não transforma essa diferença em uma narrativa causal.

## Mitigação implementada: reponderação AIF360

Para cada combinação de grupo `g` e resultado `y`, a técnica atribui:

```text
peso(g, y) = N(g) × N(y) / [N × N(g, y)]
```

O cálculo ocorre no treino de cada divisão, inclusive dentro da validação cruzada e da calibração. O pipeline e os pesos nunca são ajustados usando validação ou teste. Utiliza-se a API clássica `aif360.algorithms.preprocessing.Reweighing`, evitando o carregamento opcional de FairAdapt/R da API sklearn. Para vários grupos, cada chamada calcula grupo focal versus demais; apenas os pesos focais são combinados, preservando a fórmula acima em todas as células.

- A interface solicita um atributo por experimento. A API aceita interseções via `mitigation_features`; a avaliação continua mostrando todos os atributos confirmados.
- Variáveis numéricas com mais de 12 valores são agrupadas pela mediana de cada treino. Categóricas com mais de 12 grupos exigem preparação explícita.
- Cada grupo precisa de pelo menos cinco exemplos de cada resultado em cada divisão; valores sensíveis ausentes e mais de 32 interseções impedem essa variante. O motivo fica registrado, e a comparação original é mantida.
- Logistic Regression, Random Forest e XGBoost recebem os pesos. KNN permanece apenas como comparação original porque não aceita pesos por registro.
- O balanceamento de classes, quando configurado, é aplicado da mesma forma nas versões original e reponderada. Os novos pesos não substituem silenciosamente essa configuração.
- O mesmo split, features, algoritmo e limiar são usados em cada par. A seleção considera os critérios de validação configurados. O teste apresenta a auditoria final do melhor par reponderado escolhido na validação.
- O experimento pode selecionar a versão original. O relatório informa o que foi selecionado; não afirma que solicitar mitigação removeu o viés.
- Com calibração, o resumo de pesos apresentado corresponde à primeira divisão interna. Cada divisão recalcula seus pesos.

Reponderar o histórico busca reduzir a dependência entre grupo e resultado na distribuição de treinamento. Isso **não garante** igualdade de erros nas previsões, não corrige rótulos incorretos nem elimina desigualdades institucionais. Compare as medidas individualmente. A média de diferenças de acertos e falsos alertas pode esconder cancelamentos.

## Medidas úteis aos tutores

**Falsos alertas** são calculados entre os registros cujo resultado histórico não foi a classe de risco. **Casos não detectados** são calculados entre os registros que tiveram o resultado de risco. A tabela mostra os respectivos denominadores; ausência de exemplos de uma classe produz medida indisponível, nunca zero fictício.

Revise se um grupo recebe abordagens desnecessárias e se outro fica sem apoio. Verifique representatividade, critérios de nota, registro de presença, acesso a canais digitais e a qualidade do resultado usado como rótulo. Atributos sensíveis e identificadores não são permitidos no simulador; a identidade do aluno não é uma alavanca de intervenção.

O plano do tutor registra verificações e encaminhamentos administrativos. Ele não recomenda diagnósticos, punições ou retirada de oportunidades. Apoio não deve depender exclusivamente da classificação do modelo. Reavalie em novos períodos com resultados conhecidos; reutilizar repetidamente o mesmo teste para ajustar escolhas prejudica sua validade.

## API e persistência

- `POST /models/{id}/mitigate`: inicia um novo experimento, preservando o modelo original.
- `POST /students/{id}/scenario`: simulação transitória, com limites históricos e restrição de atributos.
- `GET` / `PUT /students/{id}/review`: revisão persistente do tutor, vinculada à previsão e isolada por instituição.
- `model.joblib` inclui os agregados de contexto; `metadata.json` registra configurações, comparação, pesos e avaliação de mitigação.
- Excluir um lote também exclui as revisões vinculadas a ele. Nenhum conteúdo é enviado a LLMs ou serviços externos.

## Referências metodológicas

- [scikit-learn: avaliação de modelos, average precision e Brier](https://scikit-learn.org/stable/modules/model_evaluation.html).
- [AIF360: definições de ClassificationMetric](https://aif360.readthedocs.io/en/stable/modules/generated/aif360.metrics.ClassificationMetric.html).
- [Fairlearn: interpretação e limitações das métricas de equidade](https://fairlearn.org/main/user_guide/assessment/common_fairness_metrics.html).
- [AIF360: Reweighing e referência a Kamiran & Calders (2012)](https://aif360.readthedocs.io/en/latest/modules/generated/aif360.algorithms.preprocessing.Reweighing.html).
- [SHAP: limites de interpretação causal de modelos preditivos](https://shap.readthedocs.io/en/latest/example_notebooks/overviews/Be%20careful%20when%20interpreting%20predictive%20models%20in%20search%20of%20causal%20insights.html).
- [Fairlearn: avaliação de diferenças e erros por grupo](https://fairlearn.org/main/user_guide/assessment/index.html).
