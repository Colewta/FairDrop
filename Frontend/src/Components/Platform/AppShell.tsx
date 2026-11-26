import { useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePreference } from '../../services/useSessionDraft';
import { WorkflowContext } from '../../services/workflow';

function WorkflowProgress() {
  const { workflow } = useContext(WorkflowContext);
  const location = useLocation();
  if (!workflow || workflow.path !== location.pathname) return <details className="sidebar-guide"><summary>Como começar</summary><p>Importe um histórico, configure a análise e confira desempenho e equidade. Depois, compare uma técnica de mitigação.</p><Link to="/datasets/new">Importar histórico →</Link></details>;
  const current = { import: 0, configure: 1, result: 2, mitigation: 3 }[workflow.kind];
  const steps = [
    { label: 'Importar histórico', done: !!workflow.datasetId, to: workflow.datasetId ? `/datasets/${workflow.datasetId}` : '/datasets/new', available: true },
    { label: 'Configurar e executar', done: !!workflow.modelId && !['queued','running'].includes(workflow.runStatus ?? ''), to: `/datasets/${workflow.datasetId}${workflow.modelId?`?from_model=${workflow.modelId}`:''}`, available: !!workflow.datasetId },
    { label: 'Conferir resultados', done: !!workflow.modelId, to: `/models/${workflow.modelId}`, available: !!workflow.modelId },
    { label: 'Testar mitigação', done: !!workflow.hasExperiment, to: `/models/${workflow.modelId}?section=mitigation`, available: !!workflow.modelId },
  ];
  return <div className="sidebar-guide contextual-progress" aria-label="Progresso da análise"><span className="sidebar-caption">Análise em andamento</span><ol>{steps.map((s,i)=> {
    const state = i === current ? 'Atual' : s.done ? 'Concluída' : s.available ? 'Pendente' : 'Indisponível';
    return <li key={s.label} data-state={state} aria-current={i===current?'step':undefined}><span aria-hidden="true">{i === current ? '●' : s.done ? '✓' : '○'}</span>{s.available?<Link to={s.to}>{s.label}<small>{state}</small></Link>:<span>{s.label}<small>{state}</small></span>}</li>;
  })}</ol>{workflow.runStatus === 'running' && <p role="status">Treinamento em execução</p>}</div>;
}

function Icon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    data: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></>,
    chart: <><path d="M4 3v17h17M8 16v-5M13 16V6M18 16V9"/></>,
    people: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5"/></>,
    menu: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind] ?? paths.home}</svg>;
}

export default function AppShell({ children, technical, onMode }: { children: ReactNode; technical: boolean; onMode: () => void }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = usePreference('sidebar-collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const area = location.pathname.startsWith('/datasets') ? 'Bases de dados' : location.pathname.startsWith('/models') ? 'Análises' : /^\/(predictions|students)/.test(location.pathname) ? 'Alunos e riscos' : 'Visão geral';
  useEffect(() => { document.title = `${area} · FairDrop`; }, [area]);
  useEffect(() => { window.scrollTo(0,0); }, [location.pathname]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    function resize(event: MediaQueryListEvent) { setCompact(event.matches); setMobileOpen(false); }
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    document.querySelector<HTMLAnchorElement>('#workspace-sidebar nav a')?.focus();
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { setMobileOpen(false); document.querySelector<HTMLButtonElement>('.sidebar-toggle')?.focus(); } }
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [mobileOpen]);
  const links = [{ to: '/', name: 'Visão geral', icon: 'home' }, { to: '/datasets', name: 'Bases de dados', icon: 'data' }, { to: '/models', name: 'Análises', icon: 'chart' }, { to: '/predictions', name: 'Alunos e riscos', icon: 'people' }];
  return <div className={`platform-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-open' : ''}`} onClickCapture={event=>{if(compact&&event.target instanceof Element&&event.target.closest('a')){setMobileOpen(false);window.requestAnimationFrame(()=>document.getElementById('main-content')?.focus({preventScroll:true}));}}}>
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <header className="workspace-header"><div className="header-brand"><button className="sidebar-toggle" aria-label={mobileOpen ? 'Fechar menu' : 'Abrir ou recolher menu'} aria-expanded={compact ? mobileOpen : !collapsed} aria-controls="workspace-sidebar" onClick={() => { if (compact) setMobileOpen(!mobileOpen); else setCollapsed(!collapsed); }}><Icon kind="menu" /></button><Link to="/" className="platform-brand"><span>FD</span>FairDrop</Link></div>
      <div className="header-location"><span>Área de trabalho</span><strong>{area}</strong></div>
      <div className="header-actions"><div className="segmented mode-control" role="group" aria-label="Modo de visualização"><button aria-label="Modo simples" aria-pressed={!technical} onClick={() => { if (technical) onMode(); }}>Simples</button><button aria-label="Modo técnico" aria-pressed={technical} onClick={() => { if (!technical) onMode(); }}>Técnico</button></div><Link to="/datasets/new" className="primary-button" aria-label="Nova análise"><Icon kind="plus" /><span>Nova análise</span></Link></div>
    </header>
    {mobileOpen && <button className="sidebar-overlay" aria-label="Fechar menu lateral" onClick={() => setMobileOpen(false)} />}
    <aside className="workspace-sidebar" id="workspace-sidebar" aria-label="Menu lateral"><span className="sidebar-caption">Navegação</span><nav aria-label="Navegação principal">{links.map(item => { const active=item.to==='/'?['/','/dashboard'].includes(location.pathname):location.pathname.startsWith(item.to)||(item.to==='/predictions'&&location.pathname.startsWith('/students/'));return <Link key={item.to} to={item.to} className={active?'active':undefined} aria-current={active?'location':undefined} aria-label={item.name} title={collapsed ? item.name : undefined} onClick={() => setMobileOpen(false)}><Icon kind={item.icon} /><span>{item.name}</span></Link>;})}</nav>
      <WorkflowProgress />
      <div className="sidebar-foot"><span className="sidebar-mark">FD</span><div><strong>FairDrop</strong><small>Análise e mitigação de vieses</small></div></div>
    </aside>
    <main id="main-content" className="platform-content" tabIndex={-1}>{children}<footer className="platform-footer">FairDrop · Apoio à análise educacional. Confira cada caso antes de decidir um encaminhamento.</footer></main>
  </div>;
}
