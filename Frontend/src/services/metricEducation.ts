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
  const missing = 'Faltam exemplos para interpretar este número. Confira a quantidade de registros e se há casos com e sem a situação acompanhada.';
  const bothClasses = !c || (c.positives > 0 && c.negatives > 0);
  const result: MetricExplanation[] = [
    { key: 'recall', title: 'Casos de risco encontrados', technical: 'Recall · sensibilidade', value: value(metrics.recall, !c || c.positives > 0),
      meaning: 'Mostra quantos dos casos que aconteceram no histórico o sistema conseguiu encontrar. Se houve uma evasão e nenhum aviso foi emitido, esse caso ficou de fora desta contagem de acertos.',
      reading: c && c.positives > 0 ? `Dos ${c.positives} registros com o resultado de risco, ${c.tp} receberam alerta e ${c.fn} ficaram sem alerta (${percent(metrics.recall)} identificados).` : missing,
      importance: 'Se esse número for baixo, muitos casos passam sem aviso. Esses alunos podem ficar sem acompanhamento se a escola depender só da lista de alertas.',
      action: 'Mantenha uma forma de o aluno pedir ajuda mesmo sem alerta. Confira os casos que passaram sem aviso e veja se isso acontece mais com algum grupo.',
      limit: 'Encontrar mais casos pode aumentar os falsos alertas. Leia junto com a precisão. O histórico não revela o futuro de cada aluno.',
      calculation: 'Casos com resultado de risco e alerta ÷ todos os casos com resultado de risco.' },
    { key: 'precision', title: 'Alertas confirmados', technical: 'Precisão · precision', value: value(metrics.precision, !c || c.alerts > 0),
      meaning: 'Olha para os avisos emitidos: quantos deles coincidiram com a situação registrada no histórico? Os demais foram falsos alertas. É uma pergunta diferente de saber quantos casos o sistema conseguiu encontrar.',
      reading: c && c.alerts > 0 ? `Dos ${c.alerts} alertas, ${c.tp} coincidiram com o resultado de risco e ${c.fp} foram falsos alertas (${percent(metrics.precision)} se confirmaram).` : c ? 'Nenhum alerta foi emitido no teste. Sem alertas, não é possível avaliar a precisão; isso não significa que o modelo acertou tudo.' : missing,
      importance: 'Se muitos avisos são falsos, a equipe pode gastar tempo em contatos desnecessários e preocupar alunos sem motivo. Isso ajuda a planejar o atendimento sem tratar cada alerta como uma certeza.',
      action: 'Antes de fazer um encaminhamento, confira a planilha e converse com o aluno. Um alerta que não se confirma também pode indicar um erro de registro.',
      limit: 'Precisão alta pode coexistir com muitos casos não detectados. Confira o recall e a quantidade de alertas.',
      calculation: 'Alertas em casos com resultado de risco ÷ todos os alertas.' },
    { key: 'accuracy', title: 'Acertos no total', technical: 'Acurácia · accuracy', value: value(metrics.accuracy, !c || c.total > 0),
      meaning: 'É a proporção de previsões certas no total. Conta tanto os avisos que estavam certos quanto os registros que ficaram corretamente sem aviso.',
      reading: c && c.total > 0 ? `Foram ${c.tp + c.tn} acertos e ${c.fp + c.fn} erros em ${c.total} registros (${percent(metrics.accuracy)} de acertos). Prever sempre a situação mais comum acertaria ${percent(Math.max(c.positives, c.negatives) / c.total)} nesta amostra.` : missing,
      importance: 'É um primeiro resumo, mas merece cuidado quando uma situação é muito mais comum. O sistema pode acertar bastante só por repetir a situação mais frequente e deixar de encontrar os casos de interesse.',
      action: 'Confira quantos casos passaram sem aviso na medida de casos encontrados (recall). Depois, veja se os erros estão concentrados em algum grupo.',
      limit: 'Exemplo fictício: se 95 de 100 alunos não evadiram, dizer que ninguém evadiu acerta 95%, mas não encontra nenhum dos 5 casos de evasão.',
      calculation: 'Acertos com e sem resultado de risco ÷ total de registros avaliados.' },
    { key: 'f1', title: 'Equilíbrio entre detecção e precisão', technical: 'F1-score', value: value(metrics.f1, !c || c.positives + c.alerts > 0),
      meaning: 'Resume duas coisas: quantos casos o sistema encontra e quantos dos alertas estavam certos. Vai de 0 a 1, exibido aqui em porcentagem. Fica baixo quando uma dessas duas partes vai mal.',
      reading: `O F1 é ${value(metrics.f1, !c || c.positives + c.alerts > 0)}. Para entendê-lo, leia juntos os alertas confirmados (${value(metrics.precision, !c || c.alerts > 0)}) e os casos encontrados (${value(metrics.recall, !c || c.positives > 0)}).`,
      importance: 'Ajuda na comparação quando você quer evitar tanto casos sem aviso quanto contatos desnecessários. Para saber qual problema precisa de atenção, olhe as duas medidas separadamente.',
      action: 'Se esse resumo piorou, confira se o sistema deixou passar mais casos, emitiu mais avisos errados ou fez as duas coisas.',
      limit: 'Não é a porcentagem de alunos previstos corretamente e não mede justiça entre grupos. Desconsidera os acertos sem resultado de risco.',
      calculation: '2 × precisão × recall ÷ (precisão + recall). Equivale a 2 × acertos com alerta ÷ (2 × acertos com alerta + falsos alertas + casos perdidos).' },
    { key: 'roc_auc', title: 'Ordenação dos casos por risco', technical: 'ROC-AUC', value: bothClasses ? decimal(metrics.roc_auc) : 'Indisponível',
      meaning: 'Avalia a ordem de prioridade criada pelo sistema. Os casos em que a situação aconteceu costumam aparecer com chances maiores que os demais? O número vai de 0 a 1. Isso avalia a ordenação, não a porcentagem de avisos certos.',
      reading: finite(metrics.roc_auc) && bothClasses ? `ROC-AUC de ${decimal(metrics.roc_auc)}: 0,5 corresponde à ordenação ao acaso; 1 corresponde à separação perfeita nesta avaliação. Abaixo de 0,5, a ordenação está pior que o acaso.` : 'É preciso ter exemplos com e sem o resultado de risco para calcular a ROC-AUC.',
      importance: 'É útil para comparar a capacidade de colocar os casos de interesse no começo da fila, antes de escolher a marca que vai gerar um alerta.',
      action: 'Uma boa ordem não basta. Confira quantos avisos estavam certos na marca de alerta usada e se algum grupo fica mais vezes no lugar errado dessa fila.',
      limit: 'Não é a chance de evasão de um aluno nem a porcentagem de acertos. Pode parecer alta mesmo com muitos falsos alertas quando o resultado de risco é raro.',
      calculation: 'Área sob a curva que compara detecção de casos reais e falsos alertas ao variar o limite. Empates na ordenação contam pela metade.' },
  ];
  if ('pr_auc' in metrics) result.push(
    { key: 'pr_auc', title: 'Precisão ao ampliar a detecção', technical: 'PR-AUC · precisão média (AP)', value: bothClasses ? decimal(metrics.pr_auc) : 'Indisponível',
      meaning: 'Mostra como os avisos vão se confirmando à medida que tentamos encontrar mais casos. Em geral, ampliar a busca também pode trazer avisos errados. Esta medida resume essa relação para vários limites de alerta.',
      reading: finite(metrics.pr_auc) && bothClasses ? `Precisão média: ${decimal(metrics.pr_auc)}. ${c && c.total ? `A proporção de casos de risco no teste é ${percent(c.positives / c.total)}, uma referência para uma ordenação sem informação.` : ''}` : 'Sem exemplos das duas situações, esta comparação não está disponível.',
      importance: 'Ajuda especialmente quando há poucos casos da situação acompanhada. Nessa condição, olhar só a taxa total de acertos pode esconder que o sistema quase não encontra esses casos.',
      action: 'Compare opções avaliadas com os mesmos registros. Depois, confira quantos casos foram encontrados e quantos avisos estavam certos no limite que você vai usar.',
      limit: 'O FairDrop calcula average precision (AP), um resumo da curva precisão–recall, e usa o nome PR-AUC. Não é integração trapezoidal nem precisão em um único limite; depende da proporção de casos na base.',
      calculation: 'Média das precisões ao variar o limite, ponderada pelo aumento de recall a cada passo.' },
    { key: 'specificity', title: 'Acertos entre os casos sem o resultado', technical: 'Especificidade · specificity', value: value(metrics.specificity, !c || c.negatives > 0),
      meaning: 'Olha para quem não teve a situação acompanhada no histórico. Mostra quantos desses registros ficaram corretamente sem aviso.',
      reading: c && c.negatives > 0 ? `Dos ${c.negatives} registros sem o resultado de risco, ${c.tn} ficaram corretamente sem alerta e ${c.fp} receberam um falso alerta. Especificidade: ${percent(metrics.specificity)}.` : missing,
      importance: 'Um valor baixo indica muitos avisos para casos que não tiveram a situação. Isso pode gerar preocupações e contatos desnecessários.',
      action: 'Confira se os falsos alertas estão concentrados em um grupo e se os registros desse grupo precisam de correção.',
      limit: 'Um modelo que nunca alerta pode ter especificidade de 100% e perder todos os casos de risco.',
      calculation: 'Registros sem resultado de risco e sem alerta ÷ todos os registros sem resultado de risco.' },
    { key: 'balanced_accuracy', title: 'Acertos nas duas situações', technical: 'Acurácia balanceada', value: value(metrics.balanced_accuracy, bothClasses),
      meaning: 'Faz uma média dos acertos nas duas situações: encontrar quem teve o resultado e deixar sem alerta quem não o teve. Cada situação conta pela metade, mesmo que uma apareça muito mais na planilha.',
      reading: bothClasses ? `Média entre recall (${value(metrics.recall)}) e especificidade (${value(metrics.specificity)}): ${value(metrics.balanced_accuracy)}.` : 'Falta uma das duas situações no teste. A média entre as duas não pode ser interpretada aqui.',
      importance: 'Ajuda a perceber se o sistema só vai bem na situação mais comum. Se ele acertar tudo de um lado e nada do outro, esta média será de 50%.',
      action: 'Veja qual situação tem mais erros e depois investigue sua distribuição entre os grupos de alunos.',
      limit: 'Equilibrar as duas situações de resultado não significa equilibrar gênero, renda ou outros grupos sociais.',
      calculation: '(Recall + especificidade) ÷ 2, quando as duas classes estão presentes.' },
    { key: 'brier_score', title: 'Erro das probabilidades', technical: 'Brier score', value: decimal(metrics.brier_score),
      meaning: 'Confere as porcentagens previstas, não só os alertas. Estimar uma chance muito alta para algo que não aconteceu pesa mais no erro do que fazer uma previsão menos confiante. Nesta medida, quanto menor o número, melhor.',
      reading: finite(metrics.brier_score) ? `Brier de ${decimal(metrics.brier_score)} numa escala de 0 a 1; menor indica menos erro nesta avaliação.${c && c.total ? ` Prever a mesma taxa histórica para todos teria erro ${decimal((c.positives / c.total) * (1 - c.positives / c.total))} neste teste (referência descritiva).` : ''}` : missing,
      importance: 'Ajuda a conferir se a confiança dos números faz sentido. Uma previsão muito segura, como 99%, merece atenção quando erra.',
      action: 'Se as porcentagens parecem exageradas, peça à equipe técnica que confira a calibração, que ajusta essa escala. Veja também se ela erra mais para algum grupo.',
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
      meaning: 'Compara a proporção de alertas nos dois grupos. O ponto de equilíbrio é 1: os grupos receberam avisos na mesma proporção. Abaixo de 1, o grupo analisado recebeu proporcionalmente menos; acima de 1, mais. Aqui o que se conta é o alerta, não a oferta de apoio.',
      reading: `${ratioReading}${finite(rates?.alert_rate) && finite(referenceRates?.alert_rate) ? ` Taxas observadas: ${group}, ${percent(rates!.alert_rate)}; ${reference}, ${percent(referenceRates!.alert_rate)}.` : ''}`,
      importance: 'Mostra se os avisos estão mais concentrados em um grupo. Isso pode significar mais chances de contato, mas também mais avisos errados. Receber menos avisos também pode deixar necessidades sem identificação.',
      action: 'Antes de decidir o que mudar, confira os avisos errados e os casos que ficaram sem aviso. Veja se a planilha registra os grupos da mesma forma e se todos têm acesso ao apoio.',
      limit: '1 significa taxas iguais; abaixo de 1, menos alertas no grupo analisado; acima de 1, mais. Exemplo fictício: 20% ÷ 40% = 0,50, ou metade da taxa. Calcular DI não altera a base nem corrige o viés.',
      calculation: 'Taxa de alertas do grupo analisado ÷ taxa de alertas da referência. Com referência igual a zero, a razão é indisponível.' },
    { key: 'statistical_parity_difference', title: 'Diferença nas taxas de alerta', technical: 'Statistical Parity Difference · SPD', value: diffValue('statistical_parity_difference'),
      meaning: 'Mostra a distância entre as proporções de alertas. Se um grupo teve 20% e o outro 40%, a distância foi de 20 pontos percentuais. O sinal diz de que lado está a diferença: negativo é abaixo da referência; positivo é acima.',
      reading: difference('statistical_parity_difference', 'alertas'),
      importance: 'Ajuda a ver o tamanho da diferença sem precisar dividir as taxas. Use essa distância para investigar por que um grupo está recebendo mais ou menos avisos.',
      action: 'Veja se a diferença acompanha erros de registro, amostras pouco representativas ou necessidades distintas. Compare também a detecção dos casos reais.',
      limit: 'Exemplo fictício: de 40% para 20% são −20 pontos percentuais, mas 50% menos em termos relativos. Taxas de alerta iguais não garantem erros iguais.',
      calculation: 'Taxa de alertas do grupo analisado − taxa de alertas da referência. Zero significa taxas iguais.' },
    { key: 'equal_opportunity_difference', title: 'Diferença na detecção dos casos', technical: 'Equal Opportunity Difference · EOD', value: diffValue('equal_opportunity_difference'),
      meaning: 'Entre quem teve a situação acompanhada, compara quanto cada grupo foi identificado. Por exemplo: o sistema pode encontrar a maioria dos casos no diurno, mas deixar passar muitos no noturno. Aqui se mede essa diferença.',
      reading: `${difference('equal_opportunity_difference', 'detecção dos casos reais')}${finite(rates?.recall) && finite(referenceRates?.recall) ? ` Detecção: ${group}, ${percent(rates!.recall)}; ${reference}, ${percent(referenceRates!.recall)}.` : ''}`,
      importance: 'Se o apoio começa pelo alerta, um grupo com mais casos sem aviso pode receber menos atenção. Esta medida ajuda a encontrar esse problema.',
      action: 'Abra casos que ficaram sem alerta e confira os dados. Veja se havia exemplos suficientes de cada grupo no aprendizado e mantenha outras formas de procurar a tutoria.',
      limit: 'Zero significa a mesma taxa de detecção, não detecção perfeita. Sem casos reais de risco em um dos grupos, esta comparação é indisponível.',
      calculation: 'Recall do grupo analisado − recall da referência. Valor negativo significa menor detecção no grupo analisado.' },
    { key: 'average_odds_difference', title: 'Diferenças de detecção e falsos alertas', technical: 'Average Odds Difference · AOD', value: diffValue('average_odds_difference'),
      meaning: 'Junta duas comparações: os casos encontrados e os avisos errados de cada grupo. Faz uma média das diferenças entre os grupos. Leia as duas partes: uma pode subir e a outra cair, fazendo a média parecer boa.',
      reading: finite(m.average_odds_difference) ? `A média das duas diferenças com sinal é ${diffValue('average_odds_difference')}. Leia cada diferença separadamente: valores opostos podem se cancelar e produzir uma média próxima de zero.` : 'É preciso observar as duas situações de resultado em ambos os grupos. Sem elas, esta média não pode ser calculada.',
      importance: 'Ajuda a olhar os dois lados do erro, mas não conta a história toda. Grupos com problemas diferentes podem terminar com uma média parecida.',
      action: 'Compare separadamente os casos encontrados e os falsos alertas na tabela dos grupos. Não escolha uma técnica só porque a média ficou mais próxima de zero.',
      limit: 'Exemplo fictício: +20 pontos na detecção e −20 nos falsos alertas resultam em média zero, apesar das diferenças. Não use esta média sozinha para declarar equidade.',
      calculation: '[(Falsos alertas do grupo − da referência) + (Recall do grupo − da referência)] ÷ 2. Os sinais são preservados antes da média.' },
    { key: 'fairness_score', title: 'Índice de equidade', technical: 'Fairness score · índice interno', value: decimal(m.fairness_score),
      meaning: 'É um resumo criado pelo FairDrop para ajudar a comparar opções. Vai de 0 a 1; valores maiores indicam diferenças menores nas medidas que puderam ser calculadas. Ele não mostra a porcentagem de justiça da análise.',
      reading: finite(m.fairness_score) ? `Índice deste par de grupos: ${decimal(m.fairness_score)}. Não significa ${percent(m.fairness_score)} de alunos tratados com justiça.` : 'Não há índice calculável para este par. Mesmo sem o resumo, é necessário investigar a cobertura dos dados.',
      importance: 'Serve para uma primeira comparação. Dois modelos com uma nota parecida ainda podem errar de maneiras diferentes e afetar grupos diferentes.',
      action: 'Abra as quatro medidas anteriores para entender de onde veio o resumo. Se uma técnica melhorou a nota, confira também qual grupo teve menos erros e se outro piorou.',
      limit: 'É um critério interno do FairDrop, não uma certificação de justiça. Medidas indisponíveis ficam fora da média; comparações com cobertura diferente exigem cuidado.',
      calculation: 'Média de max(0, 1 − |diferença|) para SPD, EOD e AOD e max(0, 1 − |1 − DI|), apenas para medidas disponíveis.' },
  ];
}
