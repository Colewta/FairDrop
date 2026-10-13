import type { ModelMetrics } from '../types/model';
import type { FairnessReport, Metrics } from '../types/platform';
import { percent } from './format';

export type MetricExplanation = {
  key: string; title: string; technical: string; value: string;
  meaning: string; reading: string; importance: string; action: string; limit: string; calculation: string;
};
export type FairnessComparison = FairnessReport['comparisons'][number];
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const decimal = (value: number | null | undefined, digits = 3) => finite(value)
  ? value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : 'Indisponível';
export const points = (value: number) => `${decimal(value * 100, 1)} pontos percentuais`;

export function testCounts(metrics: ModelMetrics) {
  const matrix = metrics.confusion_matrix;
  if (matrix?.length !== 2 || matrix.some(row => row.length !== 2 || row.some(n => !finite(n) || n < 0))) return null;
  const [[tn, fp], [fn, tp]] = matrix;
  return { tn, fp, fn, tp, total: tn + fp + fn + tp, positives: tp + fn, negatives: tn + fp, alerts: tp + fp };
}

// Narratives use the same test confusion matrix as the displayed scores. A zero
// denominator is not evidence of perfect/poor performance, even if sklearn stores 0.
export function learningMetrics(metrics: ModelMetrics & Partial<Metrics>): MetricExplanation[] {
  const c = testCounts(metrics);
  const value = (n: number | null | undefined, eligible = true) => eligible ? percent(n) : 'Indisponível';
  const missing = 'Não há contagens suficientes para interpretar esta medida nesta avaliação.';
  const bothClasses = !c || (c.positives > 0 && c.negatives > 0);
  const result: MetricExplanation[] = [
    { key: 'recall', title: 'Casos de risco encontrados', technical: 'Recall · sensibilidade', value: value(metrics.recall, !c || c.positives > 0),
      meaning: 'Entre quem realmente teve o resultado de risco no histórico, mostra a parte que recebeu um alerta.',
      reading: c && c.positives > 0 ? `Dos ${c.positives} registros com o resultado de risco, ${c.tp} receberam alerta e ${c.fn} ficaram sem alerta (${percent(metrics.recall)} identificados).` : missing,
      importance: 'Ajuda a perceber quantos alunos poderiam ficar sem uma oferta de apoio se a escola olhasse apenas os alertas.',
      action: 'Mantenha canais de procura espontânea e revisão dos casos sem alerta. Confira também se um grupo fica mais frequentemente sem identificação.',
      limit: 'Encontrar mais casos pode aumentar os falsos alertas. Leia junto com a precisão. O histórico não revela o futuro de cada aluno.',
      calculation: 'Casos com resultado de risco e alerta ÷ todos os casos com resultado de risco.' },
    { key: 'precision', title: 'Alertas confirmados', technical: 'Precisão · precision', value: value(metrics.precision, !c || c.alerts > 0),
      meaning: 'Entre os registros que receberam alerta, mostra quantos tinham o resultado de risco confirmado no histórico.',
      reading: c && c.alerts > 0 ? `Dos ${c.alerts} alertas, ${c.tp} coincidiram com o resultado de risco e ${c.fp} foram falsos alertas (${percent(metrics.precision)} se confirmaram).` : c ? 'Nenhum alerta foi emitido no teste. Sem alertas, não é possível avaliar a precisão; isso não significa que o modelo acertou tudo.' : missing,
      importance: 'Mostra quanto do esforço de contato pode recair sobre alunos sem o resultado de risco e ajuda a evitar rotulação indevida.',
      action: 'Use o alerta para abrir uma conversa e conferir os dados. Planeje a capacidade de atendimento sem presumir que todos os alertas se confirmarão.',
      limit: 'Precisão alta pode coexistir com muitos casos não detectados. Confira o recall e a quantidade de alertas.',
      calculation: 'Alertas em casos com resultado de risco ÷ todos os alertas.' },
    { key: 'accuracy', title: 'Acertos no total', technical: 'Acurácia · accuracy', value: value(metrics.accuracy, !c || c.total > 0),
      meaning: 'Conta os acertos em todas as situações: com e sem o resultado de risco.',
      reading: c && c.total > 0 ? `Foram ${c.tp + c.tn} acertos e ${c.fp + c.fn} erros em ${c.total} registros (${percent(metrics.accuracy)} de acertos). Prever sempre a situação mais comum acertaria ${percent(Math.max(c.positives, c.negatives) / c.total)} nesta amostra.` : missing,
      importance: 'Dá uma visão geral dos acertos, mas pode esconder dificuldade justamente nos casos que mais precisam de apoio.',
      action: 'Leia os casos perdidos no recall e compare erros por grupo, mesmo quando a acurácia parece alta.',
      limit: 'Exemplo fictício: se 95 de 100 alunos não evadiram, dizer que ninguém evadiu acerta 95%, mas não encontra nenhum dos 5 casos de evasão.',
      calculation: 'Acertos com e sem resultado de risco ÷ total de registros avaliados.' },
    { key: 'f1', title: 'Equilíbrio entre detecção e precisão', technical: 'F1-score', value: value(metrics.f1, !c || c.positives + c.alerts > 0),
      meaning: 'Reúne precisão e recall em um índice. Ele fica limitado quando uma dessas duas medidas é baixa.',
      reading: `O F1 é ${value(metrics.f1, !c || c.positives + c.alerts > 0)}. Para entendê-lo, leia juntos os alertas confirmados (${value(metrics.precision, !c || c.alerts > 0)}) e os casos encontrados (${value(metrics.recall, !c || c.positives > 0)}).`,
      importance: 'Ajuda a comparar modelos quando tanto perder casos quanto emitir alertas incorretos prejudica o atendimento.',
      action: 'Se o F1 mudar, veja qual das duas medidas mudou e qual tipo de erro passou a atingir os alunos.',
      limit: 'Não é a porcentagem de alunos previstos corretamente e não mede justiça entre grupos. Desconsidera os acertos sem resultado de risco.',
      calculation: '2 × precisão × recall ÷ (precisão + recall). Equivale a 2 × acertos com alerta ÷ (2 × acertos com alerta + falsos alertas + casos perdidos).' },
    { key: 'roc_auc', title: 'Ordenação dos casos por risco', technical: 'ROC-AUC', value: bothClasses ? decimal(metrics.roc_auc) : 'Indisponível',
      meaning: 'Avalia se os registros com resultado de risco tendem a receber uma pontuação maior que os registros sem esse resultado, considerando vários limites de alerta.',
      reading: finite(metrics.roc_auc) && bothClasses ? `ROC-AUC de ${decimal(metrics.roc_auc)}: 0,5 corresponde à ordenação ao acaso; 1 corresponde à separação perfeita nesta avaliação. Abaixo de 0,5, a ordenação está pior que o acaso.` : 'É preciso ter exemplos com e sem o resultado de risco para calcular a ROC-AUC.',
      importance: 'Ajuda a comparar a capacidade de priorizar casos antes de escolher a partir de qual pontuação emitir alertas.',
      action: 'Confira também quantos alertas se confirmam no limite adotado e se os erros estão concentrados em algum grupo.',
      limit: 'Não é a chance de evasão de um aluno nem a porcentagem de acertos. Pode parecer alta mesmo com muitos falsos alertas quando o resultado de risco é raro.',
      calculation: 'Área sob a curva que compara detecção de casos reais e falsos alertas ao variar o limite. Empates na ordenação contam pela metade.' },
  ];
  if ('pr_auc' in metrics) result.push(
    { key: 'pr_auc', title: 'Precisão ao ampliar a detecção', technical: 'PR-AUC · precisão média (AP)', value: bothClasses ? decimal(metrics.pr_auc) : 'Indisponível',
      meaning: 'Resume como a precisão dos alertas muda à medida que tentamos encontrar mais casos de risco.',
      reading: finite(metrics.pr_auc) && bothClasses ? `Precisão média: ${decimal(metrics.pr_auc)}. ${c && c.total ? `A proporção de casos de risco no teste é ${percent(c.positives / c.total)}, uma referência para uma ordenação sem informação.` : ''}` : 'Sem exemplos das duas situações, esta comparação não está disponível.',
      importance: 'É útil quando poucos alunos tiveram o resultado de risco; expõe dificuldades que uma acurácia alta pode esconder.',
      action: 'Compare modelos na mesma amostra e confira os números de precisão e recall no limite realmente usado.',
      limit: 'O FairDrop calcula average precision (AP), um resumo da curva precisão–recall, e usa o nome PR-AUC. Não é integração trapezoidal nem precisão em um único limite; depende da proporção de casos na base.',
      calculation: 'Média das precisões ao variar o limite, ponderada pelo aumento de recall a cada passo.' },
    { key: 'specificity', title: 'Acertos entre os casos sem o resultado', technical: 'Especificidade · specificity', value: value(metrics.specificity, !c || c.negatives > 0),
      meaning: 'Entre os registros sem o resultado de risco, mede quantos corretamente não receberam alerta.',
      reading: c && c.negatives > 0 ? `Dos ${c.negatives} registros sem o resultado de risco, ${c.tn} ficaram corretamente sem alerta e ${c.fp} receberam um falso alerta. Especificidade: ${percent(metrics.specificity)}.` : missing,
      importance: 'Ajuda a avaliar abordagens desnecessárias e o uso do tempo de tutoria.',
      action: 'Confira se os falsos alertas estão concentrados em um grupo e se os registros desse grupo precisam de correção.',
      limit: 'Um modelo que nunca alerta pode ter especificidade de 100% e perder todos os casos de risco.',
      calculation: 'Registros sem resultado de risco e sem alerta ÷ todos os registros sem resultado de risco.' },
    { key: 'balanced_accuracy', title: 'Acertos nas duas situações', technical: 'Acurácia balanceada', value: value(metrics.balanced_accuracy, bothClasses),
      meaning: 'Dá a mesma importância a encontrar os casos de risco e a reconhecer quem não teve esse resultado, mesmo que uma situação seja mais comum.',
      reading: bothClasses ? `Média entre recall (${value(metrics.recall)}) e especificidade (${value(metrics.specificity)}): ${value(metrics.balanced_accuracy)}.` : 'Falta uma das duas situações no teste. A média entre as duas não pode ser interpretada aqui.',
      importance: 'Evita que o grupo de resultados mais numeroso domine sozinho a leitura dos acertos.',
      action: 'Veja qual situação tem mais erros e depois investigue sua distribuição entre os grupos de alunos.',
      limit: 'Equilibrar as duas situações de resultado não significa equilibrar gênero, renda ou outros grupos sociais.',
      calculation: '(Recall + especificidade) ÷ 2, quando as duas classes estão presentes.' },
    { key: 'brier_score', title: 'Erro das probabilidades', technical: 'Brier score', value: decimal(metrics.brier_score),
      meaning: 'Mede o erro das probabilidades estimadas, comparando cada previsão com o que ocorreu no histórico. Erros muito confiantes pesam mais.',
      reading: finite(metrics.brier_score) ? `Brier de ${decimal(metrics.brier_score)} numa escala de 0 a 1; menor indica menos erro nesta avaliação.${c && c.total ? ` Prever a mesma taxa histórica para todos teria erro ${decimal((c.positives / c.total) * (1 - c.positives / c.total))} neste teste (referência descritiva).` : ''}` : missing,
      importance: 'Ajuda a identificar quando números como “80% de risco” representam mal os resultados observados.',
      action: 'Peça à equipe técnica que confira a curva de calibração e os erros por grupo antes de usar probabilidades para organizar atendimento.',
      limit: 'Não é uma porcentagem de erros, nem uma medida isolada de calibração ou de justiça. Também depende da capacidade de separar os casos e da composição da amostra.',
      calculation: 'Média de (probabilidade prevista − resultado observado)². O resultado é 1 quando ocorreu a situação de risco e 0 quando não ocorreu.' },
  );
  return result;
}

export function fairnessMetrics(comparison?: FairnessComparison): MetricExplanation[] {
  const m = comparison?.metrics ?? {};
  const group = comparison ? `“${comparison.group}”` : 'o grupo analisado';
  const reference = comparison ? `“${comparison.reference}”` : 'o grupo de referência';
  const rates = comparison?.group_rates;
  const referenceRates = comparison?.reference_rates;
  const difference = (key: string, what: string) => {
    const v = m[key];
    if (!finite(v)) return 'Comparação indisponível. Faltam taxas calculáveis; ausência de medida não demonstra igualdade entre grupos.';
    if (v === 0) return `As taxas de ${what} são iguais nesta amostra (diferença de 0 pontos percentuais). Isso, sozinho, não comprova ausência de viés.`;
    return `A taxa de ${what} de ${group} ficou ${points(Math.abs(v))} ${v < 0 ? 'abaixo' : 'acima'} da taxa de ${reference}.`;
  };
  const diffValue = (key: string) => finite(m[key]) ? `${m[key]! > 0 ? '+' : ''}${decimal(m[key]! * 100, 1)} p.p.` : 'Indisponível';
  const di = m.disparate_impact;
  const ratioReading = !finite(di)
    ? 'Não é possível dividir as taxas: a referência pode não ter recebido nenhum alerta, ou faltam dados. Isso não significa ausência de diferença.'
    : di === 1 ? `Os dois grupos receberam alertas na mesma proporção nesta amostra (razão 1).`
      : `${group} teve uma taxa de alertas de ${decimal(di, 2)} vezes a de ${reference}: ${percent(Math.abs(1 - di))} ${di < 1 ? 'menos' : 'mais'} em termos relativos. Isso não é uma diferença em pontos percentuais.`;
  return [
    { key: 'disparate_impact', title: 'Proporção de alertas entre grupos', technical: 'Disparate Impact · DI', value: decimal(di),
      meaning: 'Divide a proporção de alertas de um grupo pela proporção de alertas do grupo usado como referência. Aqui, “positivo” significa alerta de risco, não um benefício garantido.',
      reading: `${ratioReading}${finite(rates?.alert_rate) && finite(referenceRates?.alert_rate) ? ` Taxas observadas: ${group}, ${percent(rates!.alert_rate)}; ${reference}, ${percent(referenceRates!.alert_rate)}.` : ''}`,
      importance: 'Ajuda a verificar se um grupo recebe proporcionalmente mais alertas. Isso pode trazer mais oportunidades de apoio e mais abordagens indevidas. Em um grupo com poucos alertas, algumas necessidades podem passar despercebidas.',
      action: 'Confira falsos alertas e casos não detectados antes de agir. Investigue diferenças nos registros e no acesso ao apoio; não conclua que um grupo tem menor capacidade.',
      limit: '1 significa taxas iguais; abaixo de 1, menos alertas no grupo analisado; acima de 1, mais. Exemplo fictício: 20% ÷ 40% = 0,50, ou metade da taxa. Calcular DI não altera a base nem corrige o viés.',
      calculation: 'Taxa de alertas do grupo analisado ÷ taxa de alertas da referência. Com referência igual a zero, a razão é indisponível.' },
    { key: 'statistical_parity_difference', title: 'Diferença nas taxas de alerta', technical: 'Statistical Parity Difference · SPD', value: diffValue('statistical_parity_difference'),
      meaning: 'Subtrai as proporções de alertas dos dois grupos. É outra forma de olhar a distribuição dos alertas, agora em pontos percentuais.',
      reading: difference('statistical_parity_difference', 'alertas'),
      importance: 'Permite comparar a frequência dos alertas e avaliar como isso pode afetar a oferta de apoio a cada grupo.',
      action: 'Veja se a diferença acompanha erros de registro, amostras pouco representativas ou necessidades distintas. Compare também a detecção dos casos reais.',
      limit: 'Exemplo fictício: de 40% para 20% são −20 pontos percentuais, mas 50% menos em termos relativos. Taxas de alerta iguais não garantem erros iguais.',
      calculation: 'Taxa de alertas do grupo analisado − taxa de alertas da referência. Zero significa taxas iguais.' },
    { key: 'equal_opportunity_difference', title: 'Diferença na detecção dos casos', technical: 'Equal Opportunity Difference · EOD', value: diffValue('equal_opportunity_difference'),
      meaning: 'Compara a detecção apenas entre os alunos que tiveram o resultado de risco no histórico. É a diferença de recall entre grupos.',
      reading: `${difference('equal_opportunity_difference', 'detecção dos casos reais')}${finite(rates?.recall) && finite(referenceRates?.recall) ? ` Detecção: ${group}, ${percent(rates!.recall)}; ${reference}, ${percent(referenceRates!.recall)}.` : ''}`,
      importance: 'Mostra se o modelo deixa passar mais casos reais de um grupo. Quando o apoio depende do alerta, esses alunos podem ter menos acesso ao acompanhamento.',
      action: 'Revise casos sem alerta, ofereça outros caminhos de acesso à tutoria e investigue se os exemplos de risco de cada grupo estão bem representados no treino.',
      limit: 'Zero significa a mesma taxa de detecção, não detecção perfeita. Sem casos reais de risco em um dos grupos, esta comparação é indisponível.',
      calculation: 'Recall do grupo analisado − recall da referência. Valor negativo significa menor detecção no grupo analisado.' },
    { key: 'average_odds_difference', title: 'Diferenças de detecção e falsos alertas', technical: 'Average Odds Difference · AOD', value: diffValue('average_odds_difference'),
      meaning: 'Faz a média de duas diferenças entre grupos: a detecção dos casos reais e os falsos alertas entre quem não teve o resultado de risco.',
      reading: finite(m.average_odds_difference) ? `A média das duas diferenças com sinal é ${diffValue('average_odds_difference')}. Leia cada diferença separadamente: valores opostos podem se cancelar e produzir uma média próxima de zero.` : 'É preciso observar as duas situações de resultado em ambos os grupos. Sem elas, esta média não pode ser calculada.',
      importance: 'Considera tanto os casos reais que o modelo encontra quanto os alertas emitidos para quem não teve o resultado de risco.',
      action: 'Compare a detecção e os falsos alertas por grupo. Uma melhora na média pode esconder piora em um desses dois aspectos.',
      limit: 'Exemplo fictício: +20 pontos na detecção e −20 nos falsos alertas resultam em média zero, apesar das diferenças. Não use esta média sozinha para declarar equidade.',
      calculation: '[(Falsos alertas do grupo − da referência) + (Recall do grupo − da referência)] ÷ 2. Os sinais são preservados antes da média.' },
    { key: 'fairness_score', title: 'Índice de equidade', technical: 'Fairness score · índice interno', value: decimal(m.fairness_score),
      meaning: 'Reúne a distância das métricas em relação a taxas iguais em um índice de 0 a 1. Quanto maior, menores as distâncias consideradas pelo resumo.',
      reading: finite(m.fairness_score) ? `Índice deste par de grupos: ${decimal(m.fairness_score)}. Não significa ${percent(m.fairness_score)} de alunos tratados com justiça.` : 'Não há índice calculável para este par. Mesmo sem o resumo, é necessário investigar a cobertura dos dados.',
      importance: 'Facilita a comparação inicial de modelos, mas precisa ser acompanhado das medidas e dos erros de cada grupo.',
      action: 'Abra as quatro medidas anteriores e veja qual mudou. Na ficha do modelo, o resumo geral usa o menor índice entre os pares avaliados.',
      limit: 'É um critério interno do FairDrop, não uma certificação de justiça. Medidas indisponíveis ficam fora da média; comparações com cobertura diferente exigem cuidado.',
      calculation: 'Média de max(0, 1 − |diferença|) para SPD, EOD e AOD e max(0, 1 − |1 − DI|), apenas para medidas disponíveis.' },
  ];
}
