import { expect, test } from '@playwright/test';

function historicalCsv() {
  const lines = ['matricula,frequencia,nota,curso,sexo,situacao'];
  for (let i = 0; i < 240; i++) {
    const attendance = 30 + ((i * 17) % 70);
    const grade = 3 + ((i * 13) % 70) / 10;
    const risk = attendance + ((i * 7) % 50) - 25 < 65;
    lines.push(`RA${String(i).padStart(4, '0')},${attendance},${grade},${i % 3 ? 'A' : 'B'},${i % 2 ? 'M' : 'F'},${risk ? 'Evadido' : 'Ativo'}`);
  }
  return lines.join('\n');
}

test('historical upload, training, current students, explanation and dashboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acompanhamento dos alunos' })).toBeVisible();
  await page.getByRole('link', { name: 'Importar minha base' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'historico.csv', mimeType: 'text/csv', buffer: Buffer.from(historicalCsv()) });
  await page.getByRole('button', { name: 'Importar arquivo' }).click();
  await expect(page.getByRole('heading', { name: 'historico.csv', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Evadido' }).click();
  await page.getByRole('button', { name: 'Confirmar resultado' }).click();
  await page.getByRole('button', { name: 'Treinar e analisar', exact: true }).click();
  await page.waitForURL(/\/models\/[a-f0-9]+$/, { timeout: 150000 });
  await expect(page.getByRole('heading', { name: 'Ficha do modelo' })).toBeVisible();
  await page.screenshot({ path: 'test-results/model-card.png', fullPage: true });
  await page.getByRole('link', { name: 'Avaliar alunos atuais' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'atuais.csv', mimeType: 'text/csv', buffer: Buffer.from('matricula,curso,nota,frequencia\nRA0001,Novo,4.2,40\nRA0002,A,9.1,98\nRA0003,B,6.5,72') });
  await page.getByRole('button', { name: 'Gerar avaliação' }).click();
  await page.waitForURL(/\/predictions\/[a-f0-9]+$/);
  await expect(page.getByRole('heading', { name: 'atuais.csv', exact: true })).toBeVisible();
  await page.getByLabel('Filtrar por curso ou turma').selectOption('curso');
  await page.getByRole('combobox', { name: 'Grupo', exact: true }).selectOption('A');
  await expect(page.getByRole('cell', { name: 'RA0002', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'RA0001', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Grupo', exact: true }).selectOption('');
  await page.getByRole('link', { name: 'Revisar aluno' }).first().click();
  await expect(page.getByRole('heading', { name: 'Fatores que contribuíram para a previsão' })).toBeVisible();
  await expect(page.locator('.factor-list li')).not.toHaveCount(0, { timeout: 30000 });
  await expect(page.getByText('Comparação com o histórico').first()).toBeVisible();
  await page.getByRole('button', { name: 'Simular outro valor' }).first().click();
  await page.getByRole('spinbutton').fill('60');
  await page.getByRole('button', { name: 'Simular cenário', exact: true }).click();
  await expect(page.getByText('Previsão original:', { exact: false })).toBeVisible();
  await page.getByLabel('Conferi os dados do aluno.').check();
  await page.getByLabel('Conclusão da revisão').selectOption('data_issue');
  await page.getByRole('button', { name: 'Salvar revisão do tutor' }).click();
  await expect(page.getByText('Revisão salva.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Conferi os dados do aluno.')).toBeChecked();
  await page.screenshot({ path: 'test-results/student.png', fullPage: true });
  await page.getByRole('link', { name: 'Visão geral', exact: true }).click();
  await expect(page.getByText('Faixas de risco da última avaliação')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Baixo risco', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('link', { name: 'Baixo: 2 alunos' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-dashboard.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('a continuous result can be configured through the guided interface', async ({ page }) => {
  const lines = ['matricula,idade,renda,frequencia'];
  for (let i = 0; i < 160; i++) lines.push(`RA${i},${18 + i % 40},${1500 + ((i * 19) % 160) * 120},${30 + i % 60}`);
  await page.goto('/datasets/new');
  await page.locator('input[type=file]').setInputFiles({ name: 'renda.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
  await page.getByRole('button', { name: 'Importar arquivo' }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByLabel('Coluna com o resultado').selectOption('renda');
  await page.getByLabel('Situação a identificar').selectOption('le');
  await page.getByLabel('Valor de referência').fill('10000');
  await page.getByRole('button', { name: 'Confirmar resultado' }).click();
  await expect(page.getByText('renda ≤ 10000', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Treinar e analisar', exact: true }).click();
  await page.waitForURL(/\/models\/[a-f0-9]+$/, { timeout: 150000 });
  await expect(page.getByRole('heading', { name: 'Ficha do modelo' })).toBeVisible();
});

test('a first-time user can explore saved models without uploading a file', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir avaliação de exemplo' }).click();
  await page.waitForURL(/\/predictions\/[a-f0-9]+$/);
  await expect(page.getByRole('heading', { name: 'Demonstração · 30 alunos fictícios' })).toBeVisible();
  await page.getByRole('link', { name: 'Revisar aluno' }).first().click();
  await expect(page.locator('.factor-list li')).not.toHaveCount(0, { timeout: 30000 });
  await page.getByRole('link', { name: 'Modelos', exact: true }).click();
  await expect(page.getByText('Exemplo com dados fictícios')).toHaveCount(2);
});

test('a tutor can compare original and reweighed models', async ({ page }) => {
  await page.goto('/models');
  await page.getByRole('link', { name: /Exemplo pronto · acompanhamento acadêmico/ }).click();
  await page.getByRole('button', { name: 'Comparar com reponderação' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado do experimento' })).toBeVisible({ timeout: 150000 });
  await expect(page.getByRole('columnheader', { name: 'Após reponderação' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mudanças na avaliação' })).toBeVisible();
  await expect(page.getByText('Versão selecionada:', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mitigation.png', fullPage: true });
});
