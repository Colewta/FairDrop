# Experimentos de mitigação no FairDrop

Na ficha de um modelo, abra **Mitigação de vieses → Preparar um experimento**.
Escolha a coluna que define os grupos. A aplicação verifica a amostra de treino
após a limpeza e habilita as técnicas compatíveis. O grupo pode ser escolhido
mesmo se não havia atributos de fairness confirmados no treinamento anterior.
Isso inicia uma nova análise; não modifica o modelo anterior.

## Técnicas disponíveis

| Técnica | Etapa | Implementação | O que é ajustado |
|---|---|---|---|
| Reweighing | Pré-processamento | AIF360 | Pesos por combinação de grupo e resultado |
| Reamostragem | Pré-processamento | FairDrop, NumPy | Composição do treino por grupo e resultado |
| LFR | Pré-processamento | AIF360 | Representação dos atributos por protótipos |
| Adversarial debiasing | Durante o treinamento | FairDrop, NumPy/SciPy | Preditor logístico e adversário softmax |
| Restrições | Durante o treinamento | Fairlearn GridSearch | Busca de classificadores com momentos de paridade demográfica ou equalized odds |
| Regularização de fairness | Durante o treinamento | FairDrop, NumPy/SciPy | Função de perda logística acrescida de penalidade entre grupos |

Adversário e regularização são implementações próprias e experimentais. Não são
os algoritmos `AdversarialDebiasing`/`PrejudiceRemover` do AIF360, nem reproduções
exatas de seus artigos. Essa distinção consta na interface e no relatório exportado.
As quatro métricas de grupo continuam usando `ClassificationMetric` do AIF360.
O fairness score agregado é calculado pelo FairDrop, não é uma quinta métrica AIF360.

## Comparação e aplicação

Cada execução ajusta uma referência sem a técnica e uma variante mitigada.
Os registros, atributos de previsão, sementes, limiar e divisões 60/20/20 são os
mesmos. Os ajustes e a mitigação são aprendidos somente no treino. Na calibração
e validação cruzada, cada divisão ajusta seus próprios parâmetros sem acessar o
conjunto reservado para avaliação daquela divisão. O grupo escolhido é retirado
das entradas de previsão de ambas as versões. O balanceamento genérico de classes
é desativado nas duas versões no fluxo de experimento, para isolar a técnica.

Adversário, restrições e regularização usam regressão logística. A referência é
treinada novamente nessa família; seus números podem diferir do modelo anterior.
O algoritmo, a variante efetivamente salva e o algoritmo do par comparado ficam
registrados. As outras técnicas podem comparar os algoritmos configurados no modelo
de origem; KNN fica apenas na referência para métodos que exigem pesos.

Por padrão, a pontuação na validação escolhe a versão salva. A opção **Aplicar a
versão mitigada ao salvar** escolhe a melhor candidata mitigada na validação, mesmo
se a referência tiver pontuação maior. O relatório distingue essa escolha explícita
da seleção automática. Se a técnica falhar durante uma divisão interna, a referência
é preservada e o motivo aparece no relatório. O teste não escolhe os parâmetros.

O relatório apresenta acurácia, recall, precisão, Brier e DI/SPD/EOD/AOD antes/depois,
taxas e tamanhos por grupo, parâmetros, sementes, versões e ajustes do treino.
O botão de download gera JSON sem linhas individuais da base. O pipeline completo
é salvo e pode prever novos registros sem exigir a coluna sensível.

## Definições operacionais

**Reponderação:** usa a fórmula do AIF360 para aproximar independência entre grupo
e classe: `peso(g,y) = N(g) N(y) / (N N(g,y))`. Não preenche células sem exemplos.

**Reamostragem:** para cada célula `(g,y)`, calcula uma quantidade desejada como
mistura entre a quantidade observada e `N(g) N(y) / N`. A intensidade controla essa
mistura entre 0 e 1. Arredondamento por maiores restos preserva o total de registros.
Sorteia sem reposição quando reduz uma célula e com reposição quando a aumenta.
Preserva os rótulos originais; não é SMOTE nem geração de alunos sintéticos.

**LFR:** AIF360 com 4 protótipos, `Ax=.01`, `Ay=1`, `Az=50*intensidade`, limite de
60 iterações/600 avaliações. Usa até 1.000 exemplos de cada um dos dois grupos do
treino para ajustar os protótipos. O pré-processamento é aprendido no treino;
quando a matriz codificada tem mais de 16 dimensões, usa SVD para reduzi-la a 16,
seguido de MinMaxScaler com clipping. A transformação é aplicada ao treino inteiro
e reutilizada na inferência. Grupos ficam nos metadados AIF360, fora do vetor de
distâncias. As previsões usam os mesmos protótipos sem conhecer o grupo do novo aluno.
A otimização limitada e a redução de dimensão devem ser relatadas no artigo.

**Regularização:** minimiza BCE logística média + `.001/2 * ||w||²` +
`intensidade * média_{g,c}(média(p|g,c) - média(p|c))²`.
Para paridade demográfica, `c` representa a amostra inteira. Para equalized odds,
compara separadamente os exemplos de cada resultado real. Otimização L-BFGS-B,
até 300 iterações. A penalidade opera sobre probabilidades médias: não equivale
a garantir igualdade de TPR/FPR das decisões no limiar.

**Adversário:** preditor logístico e adversário softmax multigrupo. O adversário
recebe o logit (DP) ou `[logit, y, logit*y]` (EO). O preditor remove a projeção do
seu gradiente na direção do adversário e subtrai `10*intensidade` vezes o gradiente
adversário. Usa 300 passos, lotes de até 512 registros, Adam para o preditor (taxa
.02), três passos de gradiente do adversário por lote (taxa .05), L2 .001 e clipping
dos gradientes do preditor em [-5,5]. A semente é 42; a inicialização do adversário
usa 43 para preservar a sequência de lotes do preditor de referência. Não há prova
de convergência ou garantia de eliminar a informação do grupo.

**Restrições:** GridSearch com 9 candidatos, objetivo DemographicParity ou
EqualizedOdds e `constraint_weight=intensidade`. A referência usa a mesma família
logística e atributos. O modelo escolhido é determinístico e preserva sua saída de
probabilidade; a busca é finita e não garante satisfazer a restrição no teste.

## Requisitos e limites

- Grupos ausentes não são inventados. Grupos numéricos com mais de 12 valores
  são separados pela mediana aprendida no treino; categorias textuais precisam
  ter até 12 valores. A coluna deve definir pelo menos dois grupos utilizáveis.
- Reponderação e reamostragem exigem 5 exemplos de cada resultado por grupo no treino.
- O objetivo EO também exige 5 exemplos de cada resultado por grupo; DP não exige
  os dois resultados em cada grupo, mas continua exigindo tamanho mínimo de grupo.
- A implementação LFR requer exatamente dois grupos. Não junta automaticamente
  categorias acadêmicas ou demográficas, pois isso depende de justificativa substantiva.
- No teste, o avaliador omite pares com menos de 5 registros em um dos grupos.
  Denominadores nulos produzem medidas indisponíveis, nunca igualdade artificial.
- Limiares diferentes podem produzir disparidades diferentes. Resultados não se
  generalizam automaticamente para outra instituição, período ou população.
- Ao escolher entre várias técnicas com base no teste, o teste passa a fazer parte
  da exploração. A confirmação final exige outro conjunto/período independente.
- Se a classe positiva é risco, DI compara taxas de alerta, não concessão de benefício.
  Paridade de alertas pode conflitar com necessidades de apoio diferentes entre grupos.
  A mitigação não certifica justiça e não substitui revisão da coleta e dos rótulos.

## Fontes das implementações

- [AIF360 Reweighing](https://aif360.readthedocs.io/en/stable/modules/generated/aif360.algorithms.preprocessing.Reweighing.html)
- [Zemel et al., Learning Fair Representations, ICML 2013](https://proceedings.mlr.press/v28/zemel13.html)
- [AIF360 LFR](https://aif360.readthedocs.io/en/latest/modules/generated/aif360.algorithms.preprocessing.LFR.html)
- [Fairlearn GridSearch](https://fairlearn.org/v0.13/api_reference/generated/fairlearn.reductions.GridSearch.html)
- [Zhang, Lemoine e Mitchell, Mitigating Unwanted Biases with Adversarial Learning](https://arxiv.org/abs/1801.07593)

As fórmulas da reamostragem e da regularização acima definem as variantes do FairDrop;
não devem ser atribuídas como reprodução de algoritmos específicos desses artigos.
