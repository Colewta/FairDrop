import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function WorkspaceTabs({ tabs, label = 'Seções da análise' }: { tabs: { id: string; label: string; content: ReactNode }[]; label?: string }) {
  const [params, setParams] = useSearchParams();
  const selected = tabs.some(t => t.id === params.get('section')) ? params.get('section')! : tabs[0].id;
  const [visited, setVisited] = useState<string[]>([selected]);
  if (!visited.includes(selected)) setVisited([...visited, selected]);
  const prefix = useId();
  const previous = useRef(selected);
  useEffect(() => {
    const active = document.getElementById(`${prefix}-tab-${selected}`);
    const list = active?.parentElement;
    if (active && list && list.scrollWidth > list.clientWidth) list.scrollLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
    if (previous.current !== selected) active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    previous.current = selected;
  }, [selected, prefix]);
  function choose(id: string) { setVisited(current => current.includes(id) ? current : [...current, id]); setParams(current => { current.set('section', id); return current; }); }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
    choose(tabs[next].id); document.getElementById(`${prefix}-tab-${tabs[next].id}`)?.focus();
  }
  return <div className="workspace-sections"><div className="workspace-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab.id} role="tab" id={`${prefix}-tab-${tab.id}`} aria-selected={selected === tab.id} aria-controls={`${prefix}-panel-${tab.id}`} tabIndex={selected === tab.id ? 0 : -1} onClick={() => choose(tab.id)} onKeyDown={e => keyboard(e, index)}>{tab.label}</button>)}
  </div>{tabs.map(tab => <section key={tab.id} id={`${prefix}-panel-${tab.id}`} role="tabpanel" aria-labelledby={`${prefix}-tab-${tab.id}`} hidden={selected !== tab.id} tabIndex={0} className="workspace-panel">{(visited.includes(tab.id) || selected === tab.id) && tab.content}</section>)}</div>;
}
