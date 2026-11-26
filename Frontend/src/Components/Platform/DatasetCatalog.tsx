import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DatasetCatalog as Catalog, DatasetRecord, DatasetSummary } from '../../types/platform';
import { useResource } from '../../services/platformApi';
import { api, getApiErrorMessage } from '../../services/api';
import { date } from '../../services/format';
import { saveBlob } from '../../services/downloads';
import { Empty, ErrorNotice, Loading } from './Common';
import Dialog from './Dialog';

function DatasetManager({ item, onClose, onChanged }: { item: DatasetSummary; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const record = useResource<DatasetRecord>(`/datasets/${item.id}`);
  const dependencies = useResource<{ models: number; active_runs: number }>(`/datasets/${item.id}/dependencies`);
  async function rename() {
    setBusy(true); setError(null);
    try { await api.patch(`/datasets/${item.id}`, { name: name.trim() }); onChanged(); }
    catch (e) { setError(getApiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function exportData() {
    setBusy(true); setError(null);
    try { const response = await api.get(`/datasets/${item.id}/export`, { responseType: 'blob' }); saveBlob(response.data, `fairdrop-base-${item.id}.csv`); }
    catch (e) { setError(getApiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Excluir a base “${item.name}”? Esta ação remove o arquivo armazenado.`)) return;
    setBusy(true); setError(null);
    try { await api.delete(`/datasets/${item.id}`); onChanged(); }
    catch (e) { setError(getApiErrorMessage(e)); } finally { setBusy(false); }
  }
  const locked = !dependencies.data || dependencies.data.models > 0 || dependencies.data.active_runs > 0;
  return <Dialog title="Gerenciar base" onClose={onClose}><ErrorNotice message={error ?? record.error ?? dependencies.error}/>
    <dl className="compact-definitions"><div><dt>Arquivo original</dt><dd>{record.data?.original_name ?? item.original_name ?? item.name}</dd></div><div><dt>Importação</dt><dd>{date(item.created_at)}</dd></div><div><dt>Conteúdo</dt><dd>{item.rows.toLocaleString('pt-BR')} registros · {item.columns} colunas</dd></div><div><dt>Origem</dt><dd>{item.is_demo ? 'Exemplo fictício' : 'Arquivo importado'}</dd></div><div><dt>Vínculos</dt><dd>{dependencies.data ? `${dependencies.data.models} ${dependencies.data.models===1?'análise':'análises'} · ${dependencies.data.active_runs} ${dependencies.data.active_runs===1?'execução ativa':'execuções ativas'}` : 'Conferindo…'}</dd></div></dl>
    <form onSubmit={e=>{e.preventDefault();void rename();}}><label className="field-group">Nome da base<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label><button className="primary-button" disabled={busy || !name.trim() || name.trim()===item.name}>Salvar nome</button></form>
    <div className="dialog-actions"><Link className="quiet-button" to={`/datasets/${item.id}`}>Abrir e configurar</Link><button disabled={busy} onClick={()=>void exportData()}>Exportar CSV com IDs ocultos</button></div>
    <p className="muted">A exportação usa os dados tratados e oculta identificadores reconhecidos automaticamente. Confira outras informações pessoais antes de compartilhar; isso não garante anonimização completa.</p>
    <details><summary>Metadados disponíveis</summary><dl className="compact-definitions"><div><dt>Identificador da base</dt><dd>{item.id}</dd></div><div><dt>Hash do arquivo</dt><dd>{record.data?.sha256 ?? 'Não registrado nesta importação antiga'}</dd></div></dl></details>
    <div className="destructive-action"><button className="danger-button" disabled={busy || locked} onClick={()=>void remove()}>Excluir base</button><p className="muted">{locked ? 'A exclusão exige ausência de análises vinculadas e de execuções ativas.' : 'Nenhuma análise ou execução ativa depende desta base.'}</p></div>
  </Dialog>;
}

export default function DatasetCatalog() {
  const [params, setParams] = useSearchParams();
  const q=params.get('q')??'', sort=params.get('sort')??'created_at', direction=params.get('direction')??'desc', source=params.get('source')??'all';
  const page=Math.max(0,Number(params.get('page'))||0);
  const path=`/dataset-catalog?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&direction=${direction}&source=${source}&limit=20&offset=${page*20}`;
  const resource=useResource<Catalog>(path);
  const [managed,setManaged]=useState<DatasetSummary|null>(null);
  function update(values:Record<string,string>) { setParams(current=>{Object.entries(values).forEach(([key,value])=>value?current.set(key,value):current.delete(key));if(!('page' in values))current.delete('page');return current;}); }
  function order(key:string) { update({sort:key,direction:sort===key&&direction==='asc'?'desc':'asc'}); }
  const data=resource.data;
  return <section className="page-stack"><div className="page-heading"><div><h1>Bases de alunos</h1><p>{data ? `${data.total} ${data.total===1?'base':'bases'} ${q || source!=='all'?'nesta seleção':data.total===1?'cadastrada':'cadastradas'}` : 'Consultar arquivos importados e exemplos.'}</p></div><Link className="primary-button" to="/datasets/new">Nova base</Link></div>
    <div className="catalog-toolbar"><form className="search-form" onSubmit={e=>{e.preventDefault();update({q:String(new FormData(e.currentTarget).get('q')??'')});}}><label className="field-group">Pesquisar bases<input key={q} name="q" defaultValue={q} placeholder="Nome da base ou do arquivo"/></label><button type="submit">Pesquisar</button></form><label className="field-group">Origem<select value={source} onChange={e=>update({source:e.target.value})}><option value="all">Todas</option><option value="real">Arquivos importados</option><option value="demo">Exemplos fictícios</option></select></label><label className="field-group">Ordenar por<select value={`${sort}:${direction}`} onChange={e=>{const [field,dir]=e.target.value.split(':');update({sort:field,direction:dir});}}><option value="created_at:desc">Importação mais recente</option><option value="created_at:asc">Importação mais antiga</option><option value="name:asc">Nome A–Z</option><option value="name:desc">Nome Z–A</option><option value="rows:desc">Mais registros</option><option value="rows:asc">Menos registros</option><option value="columns:desc">Mais colunas</option><option value="columns:asc">Menos colunas</option></select></label>{(q||source!=='all')&&<button onClick={()=>setParams({})}>Limpar filtros</button>}</div>
    <ErrorNotice message={resource.error} onRetry={resource.reload}/>{resource.loading&&<Loading/>}
    {data?.items.length===0?<Empty>{q?'Nenhuma base corresponde à pesquisa.':'Nenhuma base nesta seleção. Importe um arquivo ou confira os filtros.'}</Empty>:<div className="table-scroll"><table className="data-table catalog-table"><caption className="sr-only">Bases de alunos armazenadas</caption><thead><tr>{[['name','Base'],['rows','Registros'],['columns','Colunas'],['created_at','Importação']].map(([key,label])=><th scope="col" key={key} aria-sort={sort===key?(direction==='asc'?'ascending':'descending'):'none'}><button onClick={()=>order(key)}>{label}{sort===key?(direction==='asc'?' ↑':' ↓'):''}</button></th>)}<th scope="col">Origem</th><th scope="col">Ações</th></tr></thead><tbody>{data?.items.map(item=><tr key={item.id}><th scope="row"><Link to={`/datasets/${item.id}`}>{item.name}</Link>{item.original_name&&item.original_name!==item.name&&<small>Arquivo: {item.original_name}</small>}<small>{item.model_count} {item.model_count===1?'análise vinculada':'análises vinculadas'} · {item.format??'Tabular'} · ID {item.id.slice(0,8)}</small></th><td>{item.rows.toLocaleString('pt-BR')}</td><td>{item.columns}</td><td>{date(item.created_at)}</td><td>{item.is_demo?'Exemplo fictício':'Importada'}</td><td><button aria-label={`Gerenciar ${item.name}`} onClick={()=>setManaged(item)}>Gerenciar</button></td></tr>)}</tbody></table></div>}
    {data&&<div className="pagination"><button disabled={page===0} onClick={()=>update({page:String(page-1)})}>Anterior</button><span>{data.total?`${page*20+1}–${Math.min((page+1)*20,data.total)} de ${data.total}`:'0 resultados'} · página {page+1}</span><button disabled={(page+1)*20>=data.total} onClick={()=>update({page:String(page+1)})}>Próxima</button></div>}
    {managed&&<DatasetManager key={managed.id} item={managed} onClose={()=>setManaged(null)} onChanged={()=>{setManaged(null);resource.reload();}}/>}
  </section>;
}
