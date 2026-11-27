import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:8017';

function csv() {
  return ['matricula,frequencia,nota,sexo,situacao', ...Array.from({ length: 240 }, (_, i) =>
    `RA${i},${30 + i * 17 % 70},${3 + (i * 13 % 70) / 10},${i % 2 ? 'M' : 'F'},${(30 + i * 17 % 70) + i * 7 % 50 - 25 < 65 ? 'Evadido' : 'Ativo'}`)].join('\n');
}

test('import, training and experiment show server progress without advancing on a timer', async ({ page, request }) => {
  const data = await (await request.post(`${api}/datasets`, { multipart: { file: { name: 'progresso.csv', mimeType: 'text/csv', buffer: Buffer.from(csv()) } } })).json();
  const modelResponse = await request.post(`${api}/train-automl`, { data: { dataset_id: data.id, target: 'situacao', positive_class: 'Evadido', identifier_column: 'matricula', sensitive_features: ['sexo'], algorithms: ['logistic'] } });
  expect(modelResponse.ok()).toBeTruthy();
  const model = await modelResponse.json();
  // Respostas controladas mantêm cada etapa visível. O resultado de destino é
  // real; os testes do backend verificam a execução e a persistência dos marcos.
  let importPercent = 10;
  const importId = '1'.repeat(32);
  await page.route(`${api}/datasets/check-duplicate`, route => route.fulfill({ json: { matches: [] } }));
  await page.route(`${api}/dataset-imports`, route => route.fulfill({ status: 202, json: { id: importId, status: 'queued', progress: 0 } }));
  await page.route(`${api}/dataset-imports/${importId}`, route => route.fulfill({ json: { id: importId, status: importPercent === 100 ? 'completed' : 'running', progress: importPercent, stage: 'Lendo as linhas do arquivo.', dataset_id: importPercent === 100 ? data.id : null } }));
  await page.goto('/datasets/new');
  await page.locator('input[type=file]').setInputFiles({ name: 'progresso.csv', mimeType: 'text/csv', buffer: Buffer.from(csv()) });
  await page.getByRole('button', { name: 'Importar arquivo', exact: true }).click();
  const importing = page.getByRole('progressbar', { name: 'Progresso da importação' });
  await expect(importing).toHaveAttribute('aria-valuenow', '41');
  await page.waitForTimeout(1300);
  await expect(importing).toHaveAttribute('aria-valuenow', '41');
  importPercent = 55;
  await expect(importing).toHaveAttribute('aria-valuenow', '70');
  await page.reload();
  await expect(importing).toHaveAttribute('aria-valuenow', '70');
  await expect.poll(() => importing.evaluate(track => Math.round(track.firstElementChild!.getBoundingClientRect().width / track.getBoundingClientRect().width * 100))).toBe(70);
  await page.screenshot({ path: 'test-results/progress-import-desktop.png', fullPage: true });
  importPercent = 100;
  await page.waitForURL(`**/datasets/${data.id}`);

  let trainingPercent = 20;
  const trainingId = '2'.repeat(32);
  await page.route(`${api}/training-runs`, route => route.fulfill({ status: 202, json: { id: trainingId, status: 'queued', progress: 0 } }));
  await page.route(`${api}/training-runs/${trainingId}`, route => route.fulfill({ json: { id: trainingId, status: trainingPercent === 100 ? 'completed' : 'running', progress: trainingPercent, stage: 'Treinando Regressão Logística.', model_id: trainingPercent === 100 ? model.id : null } }));
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Evadido' }).click();
  await page.getByRole('button', { name: 'Confirmar resultado', exact: true }).click();
  await page.getByRole('button', { name: 'Treinar e analisar', exact: true }).click();
  const training = page.getByRole('progressbar', { name: 'Progresso da análise' });
  await expect(training).toHaveAttribute('aria-valuenow', '20');
  trainingPercent = 88;
  await expect(training).toHaveAttribute('aria-valuenow', '88');
  await expect.poll(() => training.evaluate(track => Math.round(track.firstElementChild!.getBoundingClientRect().width / track.getBoundingClientRect().width * 100))).toBe(88);
  await page.screenshot({ path: 'test-results/progress-training-desktop.png', fullPage: true });
  trainingPercent = 100;
  await page.waitForURL(`**/models/${model.id}`);

  let experimentStatus = 'running';
  const experimentId = '3'.repeat(32);
  await page.route(`${api}/models/${model.id}/mitigate`, route => route.fulfill({ status: 202, json: { id: experimentId, status: 'queued', progress: 0 } }));
  await page.route(`${api}/training-runs/${experimentId}`, route => route.fulfill({ json: { id: experimentId, status: experimentStatus, progress: 63, stage: 'Calculando as diferenças entre grupos.', error: experimentStatus === 'failed' ? 'Falha de teste. Tente novamente.' : null } }));
  await page.getByRole('tab', { name: 'Mitigação', exact: true }).click();
  await page.getByRole('button', { name: 'Comparar com reponderação', exact: true }).click();
  const experiment = page.getByRole('progressbar', { name: 'Progresso do experimento' });
  await expect(experiment).toHaveAttribute('aria-valuenow', '63');
  await expect(page.getByText('Calculando as diferenças entre grupos.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await experiment.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/progress-experiment-mobile.png', fullPage: true });
  experimentStatus = 'failed';
  await expect(page.getByRole('heading', { name: 'Não foi possível concluir' })).toBeVisible();
  await expect(experiment).toHaveAttribute('aria-valuenow', '63');
  await expect(page.getByRole('button', { name: 'Preparar outro experimento', exact: true })).toBeEnabled();
});
