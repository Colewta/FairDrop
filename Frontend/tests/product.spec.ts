import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { metricChange } from '../src/services/metricChanges';
import { learningMetrics } from '../src/services/metricEducation';
import type { ModelCard } from '../src/types/platform';
import { percent } from '../src/services/format';

const api='http://127.0.0.1:8017';
function csv() {
  const rows=['matricula,frequencia,nota,sexo,curso,situacao'];
  for(let i=0;i<240;i++)rows.push(`PROD${i},${30+i*17%70},${3+(i*13%70)/10},${i%2?'M':'F'},${['A','B','C'][i%3]},${(i*17%70)+(i*7%50)<60?'Evadido':'Ativo'}`);
  return rows.join('\n');
}

test('changes preserve metric direction, units and undefined values',()=>{
  expect(metricChange(-.4,-.1,'difference')).toMatchObject({delta:'+30,00 p.p.',direction:'nearer'});
  expect(metricChange(.2,-.3,'difference').direction).toBe('farther');
  expect(metricChange(1.5,1.2,'ratio').direction).toBe('nearer');
  expect(metricChange(.9,.5,'ratio').direction).toBe('farther');
  expect(metricChange(.2,.1,'loss').direction).toBe('nearer');
  expect(metricChange(.6,.7,'rate').delta).toBe('+10,00 p.p.');
  expect(metricChange(null,0,'ratio').direction).toBe('unknown');
  expect(metricChange(Number.NaN,.5,'index').delta).toBe('Indisponível');
});

test('catalog search, ordering, rename, protected export and deletion are functional',async({page,request})=>{
  const result=await request.post(`${api}/datasets`,{multipart:{file:{name:'produto-catalogo.csv',mimeType:'text/csv',buffer:Buffer.from(csv())},name:'Produto catálogo original'}});
  expect(result.ok()).toBeTruthy();const record=await result.json();
  await page.goto('/datasets');
  await page.getByLabel('Pesquisar bases').fill('Produto catálogo original');
  await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
  await expect(page.getByRole('link',{name:'Produto catálogo original',exact:true})).toBeVisible();
  await page.getByLabel('Ordenar por').selectOption('rows:desc');
  await expect(page).toHaveURL(/sort=rows/);
  await page.getByRole('button',{name:'Gerenciar Produto catálogo original',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Gerenciar Produto catálogo original',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'Gerenciar Produto catálogo original',exact:true}).click();
  await page.getByRole('textbox',{name:'Nome da base',exact:true}).fill('Produto catálogo revisado');
  await page.getByRole('button',{name:'Salvar nome'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const renamed=await(await request.get(`${api}/datasets/${record.id}`)).json();
  expect(renamed.name).toBe('Produto catálogo revisado');expect(renamed.original_name).toBe('produto-catalogo.csv');
  await page.getByLabel('Pesquisar bases').fill('Produto catálogo revisado');await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
  await page.getByRole('button',{name:'Gerenciar Produto catálogo revisado',exact:true}).click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar CSV com IDs ocultos'}).click();
  expect((await downloading).suggestedFilename()).toContain(record.id);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Excluir base',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await request.get(`${api}/datasets/${record.id}`)).status()).toBe(404);
});

test('repeated files require a choice and invalid spreadsheets show a recoverable error',async({page,request})=>{
  const initial=await(await request.post(`${api}/datasets`,{multipart:{file:{name:'produto-duplicado.csv',mimeType:'text/csv',buffer:Buffer.from(csv())},name:'Produto arquivo já importado'}})).json();
  await page.goto('/datasets/new');
  await page.locator('input[type=file]').setInputFiles({name:'arquivo-renomeado.csv',mimeType:'text/csv',buffer:Buffer.from(csv())});
  await page.getByRole('button',{name:'Importar arquivo',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Este arquivo já foi importado'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Produto arquivo já importado',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Importar como nova versão'}).click();
  await page.waitForURL(/\/datasets\/[a-f0-9]+$/);
  expect(page.url().split('/').pop()).not.toBe(initial.id);
  await expect(page.getByRole('heading',{name:'Leitura do arquivo concluída'})).toBeVisible();
  await expect(page.locator('.summary-card .data-table tbody tr').first()).toContainText('••••');
  await page.getByRole('button',{name:'Próximos registros'}).click();
  await expect(page.getByText('9–16 de 240',{exact:true})).toBeVisible();
  expect((await request.get(`${api}/datasets/${initial.id}`)).ok()).toBeTruthy();
  await page.goto('/datasets/new');
  await page.locator('input[type=file]').setInputFiles({name:'corrompida.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('nao e uma planilha')});
  await page.getByRole('button',{name:'Importar arquivo',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText(/inválida|corrompida/);
  await expect(page.getByRole('button',{name:'Importar arquivo',exact:true})).toBeEnabled();
});

test('real evaluation data powers metric grids, matrices, curves, group selectors and exports',async({page,request})=>{
  const dataset=await(await request.post(`${api}/datasets`,{multipart:{file:{name:'produto-analise.csv',mimeType:'text/csv',buffer:Buffer.from(csv())}}})).json();
  const trained=await request.post(`${api}/train-automl`,{data:{dataset_id:dataset.id,target:'situacao',positive_class:'Evadido',identifier_column:'matricula',sensitive_features:['sexo','curso'],algorithms:['logistic'],name:'Produto análise visual'}});
  expect(trained.ok()).toBeTruthy();const model:ModelCard=await trained.json();
  await page.goto(`/models/${model.id}`);
  await expect(page.getByRole('complementary',{name:'Menu lateral'}).getByRole('listitem').filter({hasText:'Conferir resultados'})).toHaveAttribute('data-state','Atual');
  await page.getByRole('tab',{name:'Desempenho',exact:true}).click();
  for(const item of learningMetrics(model.metrics).filter(m=>m.key!=='brier_score'))await expect(page.locator(`#entender-desempenho [data-metric="${item.key}"] > strong`)).toHaveText(item.value);
  const cells=page.locator('.confusion-grid tbody td > strong');
  await expect(cells).toHaveText(model.metrics.confusion_matrix.flat().map(n=>n.toLocaleString('pt-BR')));
  await page.getByRole('button',{name:'% da classe real',exact:true}).click();
  await expect(cells).toHaveText(model.metrics.confusion_matrix.flatMap(row=>row.map(n=>row.reduce((a,b)=>a+b,0)?percent(n/row.reduce((a,b)=>a+b,0)):'Indisponível')));
  await page.getByText('Curvas de avaliação, distribuição e calibração',{exact:true}).click();
  await expect(page.locator('.evaluation-charts .recharts-wrapper')).toHaveCount(4);
  await page.getByRole('tab',{name:'Equidade',exact:true}).click();await page.getByLabel('Atributo analisado').selectOption('curso');
  const pair=model.fairness.comparisons.find(p=>p.feature==='curso')!;
  await expect(page.locator('#entender-equidade .compact-meta')).toContainText(pair.reference);
  await expect(page.locator('#entender-equidade [data-metric="disparate_impact"] > strong')).not.toHaveText(/NaN|undefined/);
  await page.getByRole('tab',{name:'Mitigação',exact:true}).click();await page.getByLabel('Comparar quais grupos?').selectOption('curso');
  await page.getByRole('radio',{name:'Transformação de atributos (LFR)',exact:true}).check();
  await expect(page.getByRole('button',{name:'Executar experimento',exact:true})).toBeDisabled();
  await expect(page.getByRole('region',{name:'Técnica selecionada'})).toContainText(/dois grupos|2 grupos/);
  await page.getByRole('tab',{name:'Ficha da análise',exact:true}).click();const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Baixar ficha da análise'}).click();const file=await downloading;
  const exported=JSON.parse(await readFile((await file.path())!,'utf8'));
  expect(exported.metrics).toEqual(model.metrics);expect(exported).not.toHaveProperty('used_information');expect(exported).not.toHaveProperty('explanation');
  const unchanged=await(await request.get(`${api}/models/${model.id}`)).json();expect(unchanged.metrics).toEqual(model.metrics);
  await page.getByRole('button',{name:'Modo técnico',exact:true}).click();await page.reload();
  await expect(page.getByRole('button',{name:'Modo técnico',exact:true})).toHaveAttribute('aria-pressed','true');
});
