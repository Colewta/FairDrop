import { useState } from 'react';
import type { DatasetRecord } from '../../types/platform';
import { startTraining, useResource } from '../../services/platformApi';
import { getApiErrorMessage } from '../../services/api';
import { DatasetHealthCard, ErrorNotice, Loading } from './Common';
import TrainingProgress from './TrainingProgress';
import DataCleaningNotice from './DataCleaningNotice';

const roleNames: Record<string, string> = { IDENTIFIER: 'Identificação', TARGET: 'Resultado conhecido', SENSITIVE: 'Comparação entre grupos', DEMOGRAPHIC: 'Perfil', ACADEMIC_PERFORMANCE: 'Desempenho', ATTENDANCE: 'Frequência', ENGAGEMENT: 'Participação', FINANCIAL: 'Informação financeira', TEMPORAL: 'Data ou período', GENERAL_FEATURE: 'Informação para previsão', IGNORE: 'Sem variação útil', UNKNOWN: 'Requer revisão' };

export default function DatasetWizard({ record }: { record: DatasetRecord }) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(record.profile.selected_target ?? '');
  const [positiveChoice, setPositive] = useState('');
  const [cutoffChoice, setCutoff] = useState<number | null>(null);
  const [operator, setOperator] = useState<'ge' | 'le'>('ge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const preview = useResource<{ columns: string[]; rows: Record<string, string | null>[]; masked_columns: string[] }>(`/datasets/${record.id}/preview`);
  const values = useResource<{ values: { value: string; count: number }[]; numeric?: { min: number; max: number; suggested_cut: number } }>(target ? `/datasets/${record.id}/values?column=${encodeURIComponent(target)}` : null);
  const updated = useResource<DatasetRecord>(target ? `/datasets/${record.id}?target=${encodeURIComponent(target)}` : null);
  const profile = updated.data?.profile ?? record.profile;
  const suggested = values.data?.values.find(v => /^(evadido|evasão|evasao|dropout|sim|yes|1|inadimplente)$/i.test(v.value))?.value ?? '';
  const cutoff = cutoffChoice ?? values.data?.numeric?.suggested_cut ?? 0;
  const positive = values.data?.numeric ? `${target} ${operator === 'ge' ? '≥' : '≤'} ${cutoff}` : positiveChoice || suggested;
  const usefulFeatures = profile.prediction_features;
  const identifiers = record.profile.potential_ids;
  async function train() { setBusy(true); setError(null);
    try {
      const run = await startTraining({ dataset_id: record.id, target, positive_class: positive, name: `Análise de ${record.name}`.slice(0, 160),
        ...(values.data?.numeric ? { target_rule: { operator, value: cutoff } } : {}),
        sensitive_features: profile.fairness_features, identifier_column: identifiers[0] ?? null,
        strategy: 'best_balanced', threshold: .5, low_risk_max: .3, medium_risk_max: .7, calibrate: false, cv_folds: 0, balance_classes: true });
      setRunId(run.id);
    } catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); } }
  if (runId) return <TrainingProgress id={runId} />;
  return <section className="page-stack guided-workspace"><div className="page-heading"><div><span className="section-kicker">Arquivo importado</span><h1>{record.name}</h1><p>Primeiro, confira se a planilha foi lida corretamente. Depois, escolha o que você quer acompanhar. O FairDrop vai usar esse histórico para aprender e comparar formas de fazer a previsão.</p></div></div>
    <ol className="wizard-steps" aria-label="Etapas da análise">{['Conferir a base', 'Escolher o resultado', 'Treinar e analisar'].map((label, index) => <li key={label} className={step === index ? 'current' : step > index ? 'complete' : ''}><button disabled={index > step} onClick={() => setStep(index)}><span>{step > index ? '✓' : index + 1}</span>{label}</button></li>)}</ol>
    <ErrorNotice message={error} />
    <DataCleaningNotice report={profile.cleaning_report} />
    {step === 0 && <><article className="summary-card"><div className="import-success"><span aria-hidden="true">✓</span><div><h2>Leitura do arquivo concluída</h2><p><strong>{profile.rows.toLocaleString('pt-BR')}</strong> registros e <strong>{profile.columns}</strong> informações por registro.</p></div></div>
      <p>Formato reconhecido: <strong>{profile.import_info?.format ?? 'tabular'}</strong>{profile.import_info?.sheet ? ` · Aba: ${profile.import_info.sheet}` : ''}{profile.import_info?.delimiter ? ` · Separador: ${profile.import_info.delimiter}` : ''}.</p>
      {profile.import_warnings?.map((warning, i) => <p className="notice" key={i}>{warning}</p>)}
      <h3>Prévia dos registros</h3><p>Cada linha representa um registro da planilha; cada coluna guarda uma informação, como frequência ou situação. Confira se os dados apareceram nos lugares certos. Matrículas e outros identificadores ficam ocultos nesta prévia.</p><ErrorNotice message={preview.error} />{preview.loading && <Loading />}{preview.data && <div className="table-scroll"><table className="data-table"><thead><tr>{preview.data.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{preview.data.rows.map((row, i) => <tr key={i}>{preview.data?.columns.map(c => <td key={c}>{row[c] ?? <em>Não informado</em>}</td>)}</tr>)}</tbody></table></div>}
      <div className="wizard-actions"><p>Continue depois de conferir os registros.</p><button className="primary-button" onClick={() => setStep(1)}>Continuar</button></div></article>
      <details className="summary-card"><summary>Descrição das colunas</summary><div className="column-role-grid">{profile.column_profiles.map(c => <article className="column-role" key={c.name}><strong>{c.name}</strong><span>{roleNames[c.role_suggestion] ?? c.role_suggestion}</span><small>{c.unique_values} valores diferentes · {c.missing_percentage.toFixed(1)}% não informados</small></article>)}</div></details></>}
    {step === 1 && <article className="summary-card wizard-question"><span className="section-kicker">Resultado da análise</span><h2>Escolher o resultado</h2><p>Qual coluna conta o que aconteceu com o aluno? Se a planilha tem “situação”, com valores como “Ativo” e “Evadido”, essa pode ser a coluna. O sistema precisa conhecer os resultados do passado para aprender a estimá-los em novos casos.</p>
      {record.profile.selected_target && <p className="notice">Coluna sugerida: <strong>{record.profile.selected_target}</strong>. {record.profile.target_candidates[0]?.reason}</p>}
      <label className="field-group">Coluna com o resultado<select value={target} onChange={e => { setTarget(e.target.value); setPositive(''); setCutoff(null); }}><option value="">Escolher coluna</option>{record.profile.column_profiles.filter(c => !c.tags.includes('IDENTIFIER')).map(c => <option key={c.name}>{c.name}</option>)}</select></label>
      {values.loading && <Loading />}<ErrorNotice message={values.error} />{values.data && <><h3>Selecione a situação a acompanhar</h3><div className="outcome-options">{values.data.values.map(option => <button key={option.value} className={positive === option.value ? 'selected' : ''} aria-pressed={positive === option.value} onClick={() => setPositive(option.value)}><strong>{option.value}</strong><span>{option.count.toLocaleString('pt-BR')} registros</span>{positive === option.value && <small>Situação selecionada</small>}</button>)}</div></>}
      {values.data?.numeric && <div className="numeric-target"><p>Esta coluna contém valores entre {values.data.numeric.min} e {values.data.numeric.max}. Defina uma faixa para identificar. O valor sugerido divide os números ao meio, mas pode não ser o limite que interessa à escola. Por exemplo, para acompanhar notas abaixo de 5, escolha “Menor ou igual a” e informe 5.</p><div className="field-grid"><label className="field-group">Situação a identificar<select value={operator} onChange={e => setOperator(e.target.value as 'ge' | 'le')}><option value="ge">Maior ou igual a</option><option value="le">Menor ou igual a</option></select></label><label className="field-group">Valor de referência<input type="number" step="any" value={cutoff} onChange={e => setCutoff(Number(e.target.value))} /></label></div></div>}
      <p>O modelo vai estimar a probabilidade de <strong>{positive || 'ocorrência da situação selecionada'}</strong> em uma nova base.</p><div className="wizard-actions"><button onClick={() => setStep(0)}>Voltar</button><button className="primary-button" disabled={!positive || values.loading || !!values.error} onClick={() => setStep(2)}>Confirmar resultado</button></div></article>}
    {step === 2 && <><article className="summary-card"><span className="section-kicker">Revisão da configuração</span><h2>Conferir antes de treinar</h2><div className="review-checks"><p>Resultado selecionado: <strong>{positive}</strong>, registrado na coluna <strong>{target}</strong>.</p><p>Serão usadas <strong>{usefulFeatures.length} informações</strong> no treinamento.</p><p>{identifiers.length ? 'A identificação será usada para localizar os alunos.' : 'Não foi encontrada uma coluna de identificação. Os registros podem ser avaliados, mas não ligados a outros períodos.'}</p><p>{profile.fairness_features.length ? `Grupos que serão comparados: ${profile.fairness_features.join(', ')}.` : 'Não encontramos uma coluna sugerida para comparar grupos, como gênero ou faixa de idade. A previsão pode ser feita, mas essa comparação fica sem resultado. Depois, você pode escolher outra coluna na parte de mitigação.'}</p><p>Ao clicar no botão, o sistema vai aprender com uma parte do histórico, comparar as opções em outra e avaliar a escolhida em uma terceira parte. O modelo salvo é o que será usado depois com os alunos atuais.</p></div>
      {profile.leakage_alerts.length > 0 && <p className="notice">Algumas colunas podem já contar o que aconteceu, como a data de trancamento. Usá-las seria como olhar a resposta antes de fazer a previsão. As de alto risco ficam fora do aprendizado automaticamente. Você pode conferir a seleção no modo técnico.</p>}
      <details><summary>Ver informações incluídas e excluídas</summary><p><strong>Incluídas:</strong> {usefulFeatures.join(', ') || 'Nenhuma'}</p><p><strong>Excluídas:</strong> {profile.excluded_features.join(', ')}</p></details>
      <ErrorNotice message={updated.error} /><div className="wizard-actions"><button onClick={() => setStep(1)}>Voltar</button><button className="primary-button" disabled={busy || updated.loading || !usefulFeatures.length} onClick={() => void train()}>{busy ? 'Iniciando…' : 'Treinar e analisar'}</button></div></article>
      <details className="summary-card"><summary>Pendências e qualidade dos dados</summary><DatasetHealthCard profile={profile} /></details></>}
  </section>;
}
