import { expect, test } from '@playwright/test';
import { fairnessMetrics, learningMetrics, testCounts, type FairnessComparison } from '../src/services/metricEducation';
import type { Metrics } from '../src/types/platform';

const metrics: Metrics = {
  accuracy: 0.85, precision: 0.6, recall: 0.75, f1: 2 / 3, roc_auc: 0.8,
  confusion_matrix: [[70, 10], [5, 15]], pr_auc: 0.7, specificity: 0.875,
  balanced_accuracy: 0.8125, brier_score: 0.15, calibration_curve: [],
};
const pair: FairnessComparison = {
  feature: 'turno', group: 'Noturno', reference: 'Diurno', group_count: 50, reference_count: 100,
  group_rates: { alert_rate: 0.2, recall: 0.6, false_positive_rate: 0.1 },
  reference_rates: { alert_rate: 0.4, recall: 0.8, false_positive_rate: 0.3 },
  metrics: { disparate_impact: 0.5, statistical_parity_difference: -0.2,
    equal_opportunity_difference: -0.2, average_odds_difference: -0.2, fairness_score: 0.725 },
  status: 'relevant_disparity', explanation: '',
};

test('performance narratives use real denominators and distinguish the types of error', () => {
  expect(testCounts(metrics)).toEqual({ tn: 70, fp: 10, fn: 5, tp: 15, total: 100, positives: 20, negatives: 80, alerts: 25 });
  const lessons = Object.fromEntries(learningMetrics(metrics).map(item => [item.key, item]));
  expect(lessons.recall.reading).toContain('Dos 20 registros');
  expect(lessons.recall.reading).toContain('15 receberam alerta e 5 ficaram sem alerta');
  expect(lessons.precision.reading).toContain('Dos 25 alertas, 15');
  expect(lessons.precision.reading).toContain('10 foram falsos alertas');
  expect(lessons.accuracy.reading).toContain('85 acertos e 15 erros em 100 registros');
  expect(lessons.accuracy.reading).toContain('80,0%');
  expect(lessons.pr_auc.reading).toContain('20,0%');
  expect(lessons.brier_score.reading).toContain('0,160');
  expect(lessons.roc_auc.value).toBe('0,800');
  expect(lessons.roc_auc.limit).toContain('Não é a chance de evasão');
});

test('empty alert/class denominators never become claims of measured zero performance', () => {
  const lessons = Object.fromEntries(learningMetrics({ ...metrics, confusion_matrix: [[20, 0], [0, 0]], precision: 0, recall: 0, f1: 0, roc_auc: null, pr_auc: null }).map(item => [item.key, item]));
  for (const key of ['precision', 'recall', 'f1', 'roc_auc', 'pr_auc', 'balanced_accuracy']) expect(lessons[key].value).toBe('Indisponível');
  expect(lessons.precision.reading).toContain('Nenhum alerta');
  const empty = learningMetrics({ ...metrics, confusion_matrix: [[0, 0], [0, 0]] });
  expect(empty.find(item => item.key === 'accuracy')?.value).toBe('Indisponível');
  expect(testCounts({ ...metrics, confusion_matrix: [[1]] })).toBeNull();
});

test('DI relative ratios are distinct from percentage point differences and retain group direction', () => {
  const lessons = fairnessMetrics(pair);
  expect(lessons[0].reading).toContain('“Noturno” teve uma taxa de alertas de 0,50 vezes a de “Diurno”: 50,0% menos');
  expect(lessons[0].reading).toContain('20,0%');
  expect(lessons[1].reading).toContain('20,0 pontos percentuais abaixo');
  expect(lessons[1].value).toBe('-20,0 p.p.');
  const reverse = fairnessMetrics({ ...pair, group: 'Diurno', reference: 'Noturno',
    group_rates: pair.reference_rates, reference_rates: pair.group_rates,
    metrics: { ...pair.metrics, disparate_impact: 2, statistical_parity_difference: 0.2 } });
  expect(reverse[0].reading).toContain('100,0% mais');
  expect(reverse[1].reading).toContain('“Diurno” ficou 20,0 pontos percentuais acima');
});

test('unavailable fairness is explained without implying equality or emitting NaN', () => {
  for (const unavailable of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    const lessons = fairnessMetrics({ ...pair, metrics: { disparate_impact: unavailable, equal_opportunity_difference: unavailable } });
    expect(lessons[0].value).toBe('Indisponível');
    expect(lessons[0].reading).toContain('Não é possível dividir');
    expect(lessons[2].value).toBe('Indisponível');
    expect(lessons[2].reading).toContain('ausência de medida não demonstra igualdade');
    expect(JSON.stringify(lessons)).not.toMatch(/NaN|Infinity|undefined/);
  }
  expect(fairnessMetrics().every(item => item.value === 'Indisponível')).toBeTruthy();
});

test('equal rates and AOD cancellation do not certify fairness', () => {
  const lessons = fairnessMetrics({ ...pair, metrics: { ...pair.metrics, disparate_impact: 1, statistical_parity_difference: 0, average_odds_difference: 0 } });
  expect(lessons[0].reading).toContain('mesma proporção');
  expect(lessons[1].reading).toContain('não comprova ausência de viés');
  expect(lessons[3].reading).toContain('valores opostos podem se cancelar');
  expect(lessons[3].limit).toContain('+20 pontos');
  expect(lessons[4].reading).toContain('Não significa 72,5%');
});

test('a tutor explores metrics and mitigation in simple mode on desktop and mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/models');
  await page.getByRole('link', { name: /Exemplo pronto · acompanhamento acadêmico/ }).click();
  await expect(page.getByRole('navigation', { name: 'Caminho para entender a análise' })).toBeVisible();
  const performance = page.locator('#entender-desempenho');
  await expect(performance.getByText(/receberam alerta e .* ficaram sem alerta/)).toBeVisible();
  for (const key of ['precision', 'accuracy', 'f1', 'roc_auc', 'pr_auc', 'specificity', 'balanced_accuracy', 'brier_score']) {
    await page.getByLabel('Medida de desempenho').selectOption(key);
    await expect(performance.getByText('Nesta avaliação', { exact: true })).toBeVisible();
    await expect(performance.locator('.metric-lesson')).not.toContainText('undefined');
  }
  await page.getByLabel('Medida de desempenho').selectOption('recall');
  const fairness = page.locator('#entender-equidade');
  await page.getByRole('link', { name: '2. Equidade' }).click();
  await expect(fairness.getByText('Disparate Impact · DI', { exact: true })).toBeVisible();
  await expect(fairness.getByText(/Taxas observadas:/)).toBeVisible();
  const selector = page.getByLabel('Grupos de comparação');
  const groups = await selector.locator('option').count();
  for (let i = 0; i < groups; i++) {
    await selector.selectOption(String(i));
    await expect(fairness.getByText('Grupo analisado:', { exact: false })).toBeVisible();
  }
  for (const key of ['statistical_parity_difference', 'equal_opportunity_difference', 'average_odds_difference', 'fairness_score']) {
    await page.getByLabel('Medida de equidade').selectOption(key);
    await expect(fairness.getByText('Na revisão dos alunos')).toBeVisible();
  }
  await page.getByLabel('Medida de equidade').selectOption('disparate_impact');
  await page.getByRole('link', { name: 'Consultar opções de mitigação' }).click();
  await page.getByLabel('Ação a consultar').selectOption('reweighing');
  await expect(page.getByRole('heading', { name: 'Na revisão do aluno', exact: true })).toBeVisible();
  await expect(page.getByText(/Cada registro continua sendo o mesmo/)).toBeVisible();
  await page.getByLabel('Critério de escolha').selectOption('best_predictive');
  await expect(page.getByText(/não participam da pontuação de escolha/)).toBeVisible();
  await page.screenshot({ path: 'test-results/metric-education-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const key of ['data', 'representation', 'proxy', 'threshold', 'calibration', 'support']) {
    await page.getByLabel('Ação a consultar').selectOption(key);
    await expect(page.getByRole('heading', { name: 'Como avaliar o resultado' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole('link', { name: '2. Equidade' }).click();
  await page.screenshot({ path: 'test-results/metric-education-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('missing groups still explain concepts without fabricated results in the interface', async ({ page }) => {
  await page.route('**/models/*', async route => {
    const response = await route.fetch();
    const model = await response.json();
    if (!model.metrics) return route.fulfill({ response });
    model.fairness = { status: 'unavailable', score: null, warnings: [], semantics: '', comparisons: [] };
    model.metrics.confusion_matrix = [[10, 0], [0, 0]];
    model.metrics.precision = 0;
    model.metrics.recall = 0;
    await route.fulfill({ response, json: model });
  });
  await page.goto('/models');
  await page.getByRole('link', { name: /Exemplo pronto · acompanhamento acadêmico/ }).click();
  await expect(page.getByText(/Não há pares de grupos com dados suficientes/)).toBeVisible();
  await expect(page.locator('#entender-equidade .metric-lesson-heading > strong')).toHaveText('Indisponível');
  await page.getByLabel('Medida de desempenho').selectOption('precision');
  await expect(page.locator('#entender-desempenho .metric-lesson-heading > strong')).toHaveText('Indisponível');
  await expect(page.locator('#entender-desempenho .metric-reading')).toContainText('Nenhum alerta foi emitido');
});
