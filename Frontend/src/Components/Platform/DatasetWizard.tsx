import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DatasetRecord, TrainingConfig, TrainingRun } from '../../types/platform';
import { startTraining, useResource } from '../../services/platformApi';
import { getApiErrorMessage } from '../../services/api';
import { useSessionDraft } from '../../services/useSessionDraft';
import { DatasetHealthCard, ErrorNotice, Loading, MetricCard } from './Common';
import TrainingProgress from './TrainingProgress';
import TaskProgress from './TaskProgress';
import DataCleaningNotice from './DataCleaningNotice';
import { usePublishWorkflow } from '../../services/workflow';

type Draft = {
  step: number; target: string; positive: string; operator: 'ge' | 'le'; cutoff: number | null;
  identifier: string; sensitive: string[]; name: string; strategy: TrainingConfig['strategy'];
  calibrate: boolean; cv: number; threshold: number; low: number; medium: number;
  features: string[] | null; reviewed: string[]; allowSensitive: boolean; references: Record<string, string>;
  runId: string | null; runStatus: TrainingRun['status'] | null; resultId: string | null; changed: boolean;
  algorithms: NonNullable<TrainingConfig['algorithms']>;
};
const roleNames: Record<string, string> = { IDENTIFIER: 'Identificação', TARGET: 'Resultado conhecido', SENSITIVE: 'Comparação entre grupos', DEMOGRAPHIC: 'Perfil', ACADEMIC_PERFORMANCE: 'Desempenho', ATTENDANCE: 'Frequência', ENGAGEMENT: 'Participação', FINANCIAL: 'Informação financeira', TEMPORAL: 'Data ou período', GENERAL_FEATURE: 'Informação para previsão', IGNORE: 'Sem variação útil', UNKNOWN: 'Requer revisão' };

export default function DatasetWizard({ record, technical = false, initialConfig, sourceModelId, onDelete }: { record: DatasetRecord; technical?: boolean; initialConfig?: TrainingConfig; sourceModelId?: string; onDelete: () => void }) {
  const [draft, setDraft] = useSessionDraft<Draft>(`dataset:${record.id}:${sourceModelId ?? 'new'}`, {
    step: initialConfig ? 2 : 0, target: initialConfig?.target ?? record.profile.selected_target ?? '', positive: initialConfig?.positive_class ?? '',
    operator: initialConfig?.target_rule?.operator ?? 'ge', cutoff: initialConfig?.target_rule?.value ?? null,
    identifier: initialConfig?.identifier_column ?? record.profile.potential_ids[0] ?? '',
    sensitive: initialConfig?.sensitive_features ?? record.profile.fairness_features,
    name: initialConfig?.name ?? `Análise de ${record.name}`.slice(0, 160), strategy: initialConfig?.strategy ?? 'best_balanced',
    calibrate: initialConfig?.calibrate ?? false, cv: initialConfig?.cv_folds ?? 0, threshold: initialConfig?.threshold ?? .5,
    low: initialConfig?.low_risk_max ?? .3, medium: initialConfig?.medium_risk_max ?? .7,
    features: initialConfig?.prediction_features ?? null, reviewed: initialConfig?.reviewed_leakage ?? [],
    allowSensitive: initialConfig?.allow_sensitive_features ?? false, references: initialConfig?.reference_groups ?? {},
    runId: null, runStatus: null, resultId: sourceModelId ?? null, changed: false,
    algorithms: initialConfig?.algorithms ?? ['logistic','rf','knn','xgboost'],
  });
  usePublishWorkflow({ kind:'configure', datasetId:record.id, modelId:draft.resultId ?? undefined, runStatus:draft.runStatus });
  const [previewPage, setPreviewPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [autoNavigate, setAutoNavigate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useResource<{ columns: string[]; rows: Record<string, string | null>[]; masked_columns: string[]; total: number }>(`/datasets/${record.id}/preview?limit=8&offset=${previewPage*8}`);
  const values = useResource<{ values: { value: string; count: number }[]; numeric?: { min: number; max: number; suggested_cut: number } }>(draft.target ? `/datasets/${record.id}/values?column=${encodeURIComponent(draft.target)}` : null);
  const updated = useResource<DatasetRecord>(draft.target ? `/datasets/${record.id}?target=${encodeURIComponent(draft.target)}` : null);
  const profile = updated.data?.profile ?? record.profile;
  const suggested = values.data?.values.find(v => /^(evadido|evasão|evasao|dropout|sim|yes|1|inadimplente)$/i.test(v.value))?.value ?? '';
  const cutoff = draft.cutoff ?? values.data?.numeric?.suggested_cut ?? 0;
  const positive = values.data?.numeric ? `${draft.target} ${draft.operator === 'ge' ? '≥' : '≤'} ${cutoff}` : draft.positive || suggested;
  const sensitive = draft.sensitive.filter(c => c !== draft.target && c !== draft.identifier);
  const sensitiveColumns = new Set([...profile.potential_sensitive_features, ...sensitive]);
  const features = (draft.features ?? profile.prediction_features).filter(c => c !== draft.target && c !== draft.identifier && (draft.allowSensitive || !sensitiveColumns.has(c)));
  const running = draft.runStatus === 'queued' || draft.runStatus === 'running';
  const configIssue = !draft.algorithms.length ? 'Selecione pelo menos um algoritmo nos ajustes de treinamento.' : !Number.isFinite(draft.threshold) || draft.threshold < .01 || draft.threshold > .99
    ? 'O limiar de classificação precisa estar entre 0,01 e 0,99.'
    : !Number.isFinite(draft.low) || !Number.isFinite(draft.medium) || draft.low < .01 || draft.medium > .99 || draft.low >= draft.medium
      ? 'O início do risco médio precisa ser menor que o início do risco alto, com valores entre 0,01 e 0,99.' : null;
  function patch(change: Partial<Draft>) { setError(null); setDraft(current => ({ ...current, ...change, changed: true })); }
  function trainingStatus(run: TrainingRun) { setDraft(current => current.runId !== run.id || current.runStatus === run.status ? current : { ...current, runStatus: run.status, resultId: run.model_id ?? current.resultId }); }
  async function train() {
    if (running || busy || configIssue || values.loading || !values.data || updated.loading || updated.error) return;
    setBusy(true); setError(null);
    try {
      const run = await startTraining({ ...initialConfig, dataset_id: record.id, target: draft.target, positive_class: positive, name: draft.name,
        target_rule: values.data?.numeric ? { operator: draft.operator, value: cutoff } : undefined,
        prediction_features: draft.features !== null ? features : undefined,
        identifier_column: draft.identifier || null, sensitive_features: sensitive, reference_groups: Object.fromEntries(Object.entries(draft.references).filter(([, v]) => v.trim())),
        reviewed_leakage: draft.reviewed, allow_sensitive_features: draft.allowSensitive,
        strategy: draft.strategy, threshold: draft.threshold, low_risk_max: draft.low, medium_risk_max: draft.medium,
        algorithms: draft.algorithms, calibrate: draft.calibrate, cv_folds: draft.cv, balance_classes: initialConfig?.balance_classes ?? true });
      setAutoNavigate(true); setDraft(current => ({ ...current, runId: run.id, runStatus: run.status, changed: false }));
    } catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  const columns = record.profile.column_profiles;
  return <section className="page-stack guided-workspace">
    <div className="page-heading"><div><div className="breadcrumbs"><Link to="/datasets">Bases de dados</Link><span aria-hidden="true">/</span><span>Configurar análise</span></div><h1>{record.name}</h1><p>Confira os dados, escolha o resultado e execute a análise.</p></div><span className="status-pill">Configuração salva nesta sessão</span></div>
    {draft.resultId && <p className={draft.changed ? 'notice' : 'context-note'}>{draft.changed ? 'A configuração foi alterada. Execute novamente para avaliar estas escolhas; os resultados anteriores continuam salvos.' : 'Você pode rever esta configuração sem alterar o resultado já salvo.'} <Link to={`/models/${draft.resultId}`}>Abrir resultado anterior →</Link></p>}
    {initialConfig?.mitigation && initialConfig.mitigation !== 'none' && <p className="notice">Esta configuração mantém a técnica de mitigação e os parâmetros do experimento de origem: <strong>{initialConfig.mitigation}</strong>. Para mudar a técnica, abra a aba Mitigação no resultado. <Link to={`/datasets/${record.id}`}>Configurar uma análise sem essa técnica →</Link></p>}
    <ol className="wizard-steps" aria-label="Etapas da análise">{['Conferir a base', 'Escolher o resultado', 'Revisar e executar'].map((label, index) => <li key={label} className={draft.step === index ? 'current' : draft.step > index ? 'complete' : ''}><button disabled={index > draft.step || running} aria-current={draft.step === index ? 'step' : undefined} onClick={() => setDraft(current => ({ ...current, step: index }))}><span>{draft.step > index ? '✓' : index + 1}</span>{label}</button></li>)}</ol>
    {draft.step !== 2 && <ErrorNotice message={error} />}<ErrorNotice message={updated.error} /><DataCleaningNotice report={profile.cleaning_report} />
    {draft.step === 0 && <>
      <div className="metric-grid four"><MetricCard label="Registros" value={profile.rows.toLocaleString('pt-BR')} /><MetricCard label="Colunas" value={profile.columns} /><MetricCard label="Campos ausentes" value={`${profile.missing_cells_percentage.toFixed(1)}%`} /><MetricCard label="Formato lido" value={profile.import_info?.format ?? 'Tabular'} /></div>
      <article className="summary-card"><div className="section-heading"><div><h2>Leitura do arquivo concluída</h2><p>Percorra os registros para conferir a leitura. Identificadores reconhecidos ficam ocultos.</p></div><span className="status-pill">Base importada</span></div>
        {profile.import_warnings?.map((warning, i) => <p className="notice" key={i}>{warning}</p>)}
        <h3>Prévia dos registros</h3><ErrorNotice message={preview.error} />{preview.loading && <Loading />}{preview.data && <div className="table-scroll"><table className="data-table"><thead><tr>{preview.data.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{preview.data.rows.map((row, i) => <tr key={i}>{preview.data?.columns.map(c => <td key={c}>{row[c] ?? <em>Não informado</em>}</td>)}</tr>)}</tbody></table></div>}
        {preview.data && <div className="pagination"><button disabled={previewPage===0 || preview.loading} onClick={()=>setPreviewPage(previewPage-1)}>Registros anteriores</button><span>{previewPage*8+1}–{Math.min((previewPage+1)*8,preview.data.total)} de {preview.data.total}</span><button disabled={(previewPage+1)*8>=preview.data.total || preview.loading} onClick={()=>setPreviewPage(previewPage+1)}>Próximos registros</button></div>}
        <div className="wizard-actions"><span>Os dados estão nas colunas corretas?</span><button className="primary-button" onClick={() => setDraft(current => ({ ...current, step: 1 }))}>Continuar</button></div>
      </article>
      <details className="summary-card"><summary>Qualidade dos dados e descrição das colunas</summary><p>Formato: {profile.import_info?.format ?? 'Tabular'}{profile.import_info?.sheet ? ` · Aba: ${profile.import_info.sheet}` : ''}{profile.import_info?.delimiter ? ` · Separador: ${profile.import_info.delimiter}` : ''}.</p><DatasetHealthCard profile={profile} /><div className="table-scroll"><table className="data-table"><thead><tr><th>Coluna</th><th>Papel sugerido</th><th>Valores distintos</th><th>Ausentes</th><th>Tipo</th>{technical && <th>Confiança da sugestão</th>}</tr></thead><tbody>{columns.map(c => <tr key={c.name}><th>{c.name}</th><td>{roleNames[c.role_suggestion] ?? c.role_suggestion}{technical && <small>{c.tags.join(', ')}</small>}</td><td>{c.unique_values}</td><td>{c.missing_percentage.toFixed(1)}%</td><td>{c.dtype}</td>{technical && <td>{Math.round(c.confidence * 100)}% · {c.reasons.join(' ')}</td>}</tr>)}</tbody></table></div></details>
      <details className="summary-card"><summary>Gerenciar esta base</summary><p>A exclusão só é permitida sem análises vinculadas ou treinamento ativo, para preservar os experimentos.</p><button className="danger-button" onClick={onDelete}>Excluir base</button></details>
    </>}
    {draft.step === 1 && <article className="summary-card wizard-question"><span className="section-kicker">Etapa 2 de 3</span><h2>Escolher o resultado</h2><p>Qual coluna informa o que aconteceu com o aluno, como a situação final?</p>
      <label className="field-group">Coluna com o resultado<select value={draft.target} disabled={running} onChange={e => patch({ target: e.target.value, positive: '', cutoff: null, features: null, reviewed: [] })}><option value="">Escolher coluna</option>{columns.filter(c => !c.tags.includes('IDENTIFIER')).map(c => <option key={c.name}>{c.name}</option>)}</select></label>
      {values.loading && <Loading />}<ErrorNotice message={values.error} />
      {values.data && !values.data.numeric && <><h3>Selecione a situação a acompanhar</h3><div className="outcome-options">{values.data.values.map(option => <button key={option.value} disabled={running} className={positive === option.value ? 'selected' : ''} aria-pressed={positive === option.value} onClick={() => patch({ positive: option.value })}><strong>{option.value}</strong><span>{option.count.toLocaleString('pt-BR')} registros</span>{positive === option.value && <small>Situação selecionada</small>}</button>)}</div></>}
      {values.data?.numeric && <div className="numeric-target"><p>Os valores vão de {values.data.numeric.min} a {values.data.numeric.max}. Escolha a faixa que quer identificar.</p><div className="field-grid"><label className="field-group">Situação a identificar<select value={draft.operator} onChange={e => patch({ operator: e.target.value as 'ge' | 'le' })}><option value="ge">Maior ou igual a</option><option value="le">Menor ou igual a</option></select></label><label className="field-group">Valor de referência<input type="number" step="any" value={cutoff} onChange={e => patch({ cutoff: Number(e.target.value) })} /></label></div></div>}
      <details className="context-help"><summary>Como escolher o resultado?</summary><p>Use a coluna com o resultado conhecido no passado. Ao escolher “Evadido”, por exemplo, o sistema aprende a comparar essa situação com todas as demais. Para uma coluna numérica, você define uma faixa, como notas menores ou iguais a 5.</p></details>
      <div className="wizard-actions"><button onClick={() => setDraft(current => ({ ...current, step: 0 }))}>Voltar</button><button className="primary-button" disabled={!positive || values.loading || !!values.error} onClick={() => setDraft(current => ({ ...current, step: 2 }))}>Confirmar resultado</button></div>
    </article>}
    {draft.step === 2 && <>
      <article className="summary-card"><div className="section-heading"><div><span className="section-kicker">Etapa 3 de 3</span><h2>Conferir antes de treinar</h2><p>Uma nova análise será salva com estas escolhas.</p></div></div>
        <dl className="analysis-context"><div><dt>Situação a acompanhar</dt><dd><span>{positive || 'Não selecionada'}</span><small>Coluna: {draft.target}</small></dd></div><div><dt>Informações para previsão</dt><dd>{features.length} {features.length === 1 ? 'coluna' : 'colunas'}</dd></div><div><dt>Grupos de comparação</dt><dd>{sensitive.join(', ') || 'Nenhum definido'}</dd></div></dl>
        <p className="compact-meta">Identificador excluído da previsão: <strong>{draft.identifier || 'Não definido'}</strong> · Divisão estratificada: aproximadamente 60% treino, 20% validação e 20% teste.</p><div className="field-grid"><label className="field-group">Nome da análise<input value={draft.name} maxLength={160} disabled={running} onChange={e => patch({ name: e.target.value })} /></label><label className="field-group">Prioridade<select value={draft.strategy} disabled={running} onChange={e => patch({ strategy: e.target.value as Draft['strategy'] })}><option value="best_balanced">Equilíbrio entre desempenho e equidade</option><option value="best_predictive">Capacidade de identificar risco</option><option value="best_fairness">Menores diferenças entre grupos</option></select></label></div>
        {!sensitive.length && <p className="notice">A previsão pode ser feita, mas não haverá comparação de equidade sem um grupo definido. Você pode escolher os grupos abaixo ou preparar essa comparação depois, na aba Mitigação.</p>}
        {!features.length && !updated.loading && <p className="notice">Não há informações disponíveis para fazer a previsão. Confira a seleção nos ajustes avançados. O histórico precisa ter dados anteriores ao resultado, além da identificação do aluno.</p>}
        {profile.leakage_alerts.length > 0 && <p className="notice">Há informações que podem revelar o resultado antes da previsão. As de alto risco ficam fora por padrão; confira a seleção nos ajustes avançados.</p>}
        <details className="config-section" open={technical}><summary>Grupos de comparação e identificação</summary><label className="field-group">Identificador dos alunos<select value={draft.identifier} disabled={running} onChange={e => patch({ identifier: e.target.value })}><option value="">Sem identificador</option>{columns.filter(c => c.name !== draft.target).map(c => <option key={c.name}>{c.name}</option>)}</select></label><fieldset className="check-fieldset"><legend>Avaliar diferenças entre grupos</legend><p>As seleções iniciais são sugestões automáticas. Confirme quais colunas fazem sentido para comparar os grupos, como turno ou gênero.</p>{columns.filter(c => c.name !== draft.target && c.name !== draft.identifier && !c.tags.includes('IDENTIFIER')).map(c => <label className="checkbox-label" key={c.name}><input type="checkbox" disabled={running} checked={sensitive.includes(c.name)} onChange={e => patch({ sensitive: e.target.checked ? [...sensitive, c.name] : sensitive.filter(v => v !== c.name) })} />{c.name}{c.tags.includes('SENSITIVE') ? ' · sugerida' : ''}</label>)}</fieldset></details>
        <details className="config-section" open={technical}><summary>Ajustes avançados do treinamento</summary><fieldset className="check-fieldset algorithm-options"><legend>Algoritmos comparados</legend>{([['logistic','Regressão Logística'],['rf','Random Forest'],['knn','KNN'],['xgboost','XGBoost']] as const).map(([value,label])=><label className="checkbox-label" key={value}><input type="checkbox" checked={draft.algorithms.includes(value)} disabled={running || !!initialConfig?.mitigation && ['adversarial','constraints','regularization'].includes(initialConfig.mitigation)} onChange={e=>patch({algorithms:e.target.checked?[...draft.algorithms,value]:draft.algorithms.filter(a=>a!==value)})}/>{label}</label>)}</fieldset><p>Os valores são mantidos ao alternar o modo de visualização. Alterá-los exige executar uma nova análise.</p><div className="field-grid">
          <label className="field-group">Limiar de classificação<input type="number" min="0.01" max="0.99" step="0.01" value={draft.threshold} disabled={running} onChange={e => patch({ threshold: Number(e.target.value) })} /><small>Probabilidade mínima para emitir alerta.</small></label>
          <label className="field-group">Validação cruzada<select value={draft.cv} disabled={running} onChange={e => patch({ cv: Number(e.target.value) })}><option value={0}>Desativada</option><option value={2}>2 divisões</option><option value={3}>3 divisões</option><option value={4}>4 divisões</option><option value={5}>5 divisões</option></select></label>
          <label className="field-group">Início de risco médio<input type="number" min="0.01" max="0.98" step="0.01" value={draft.low} disabled={running} onChange={e => patch({ low: Number(e.target.value) })} /></label>
          <label className="field-group">Início de risco alto<input type="number" min={draft.low + .01} max="0.99" step="0.01" value={draft.medium} disabled={running} onChange={e => patch({ medium: Number(e.target.value) })} /></label>
        </div><label className="checkbox-label"><input type="checkbox" checked={draft.calibrate} disabled={running} onChange={e => patch({ calibrate: e.target.checked })} />Calibração sigmoide — ajustar a escala das probabilidades</label><label className="checkbox-label"><input type="checkbox" checked={draft.allowSensitive} disabled={running} onChange={e => patch({ allowSensitive: e.target.checked })} />Permitir usar atributos sensíveis na previsão</label>
          {sensitive.map(column => <label className="field-group" key={column}>Referência para {column}<input value={draft.references[column] ?? ''} disabled={running} placeholder="Vazio = grupo mais frequente no treino" onChange={e => patch({ references: { ...draft.references, [column]: e.target.value } })} /></label>)}
          <fieldset className="check-fieldset"><legend>Informações utilizadas na previsão</legend>{columns.filter(c => c.name !== draft.target && c.name !== draft.identifier && !c.tags.includes('IDENTIFIER') && !c.tags.includes('IGNORE')).map(c => {
            const high = profile.leakage_alerts.some(a => a.column === c.name && a.risk === 'HIGH');
            return <div key={c.name}><label className="checkbox-label"><input type="checkbox" checked={features.includes(c.name)} disabled={running || (high && !draft.reviewed.includes(c.name)) || (!draft.allowSensitive && sensitiveColumns.has(c.name))} onChange={e => patch({ features: e.target.checked ? [...features, c.name] : features.filter(f => f !== c.name) })} />{c.name}</label>{high && <label className="checkbox-label critical-text"><input type="checkbox" checked={draft.reviewed.includes(c.name)} disabled={running} onChange={e => patch({ reviewed: e.target.checked ? [...draft.reviewed, c.name] : draft.reviewed.filter(f => f !== c.name), features: features.filter(f => f !== c.name) })} />Confirmei que esta informação já existia antes da situação prevista</label>}</div>;
          })}</fieldset>
        </details>
        <details className="context-help"><summary>O que acontece ao executar?</summary><p>O histórico é dividido em treino, validação e teste. O sistema aprende no treino, compara as opções na validação e confere a escolhida no teste. Ao terminar, você poderá consultar desempenho, equidade, interpretação e mitigação em abas separadas.</p></details>
        <ErrorNotice message={configIssue ?? error} /><div className="wizard-actions"><button disabled={busy || running} onClick={() => setDraft(current => ({ ...current, step: 1 }))}>Voltar</button><button className="primary-button" disabled={busy || running || updated.loading || !!updated.error || values.loading || !values.data || !features.length || !positive || !draft.name.trim() || !!values.error || !!configIssue} onClick={() => void train()}>{busy ? 'Iniciando…' : running ? 'Treinamento em andamento' : 'Treinar e analisar'}</button></div>
      </article>
    </>}
    {busy && <TaskProgress label="Progresso da análise" value={0} stage="Conferindo a configuração para iniciar o treinamento."/>}
    {!busy && draft.runId && <TrainingProgress key={draft.runId} id={draft.runId} autoNavigate={autoNavigate} onStatus={trainingStatus} />}
  </section>;
}
