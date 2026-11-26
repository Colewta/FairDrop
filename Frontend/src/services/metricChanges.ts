import { decimal, finite } from './metricEducation';

export type ChangeKind = 'rate' | 'index' | 'loss' | 'difference' | 'ratio';
export function metricChange(before: unknown, after: unknown, kind: ChangeKind) {
  if (!finite(before) || !finite(after)) return { delta: 'Indisponível', reading: 'Falta um valor calculável antes ou depois.', direction: 'unknown' };
  const delta=after-before;
  const display=Math.abs(delta)<1e-10?'Sem variação':`${delta>0?'+':''}${decimal(delta*(kind==='rate'||kind==='difference'?100:1),kind==='rate'||kind==='difference'?2:4)}${kind==='rate'||kind==='difference'?' p.p.':''}`;
  const ideal=kind==='ratio'?1:0;
  const distance=Math.abs(after-ideal)-Math.abs(before-ideal);
  if (kind==='difference'||kind==='ratio'||kind==='loss') return {delta:display,
    reading:Math.abs(distance)<1e-10?'Mesma distância da referência.':`${distance<0?'Mais perto':'Mais longe'} de ${ideal}${kind==='loss'?' (menor erro é preferível)':''}.`,
    direction:Math.abs(distance)<1e-10?'same':distance<0?'nearer':'farther'};
  return {delta:display,reading:Math.abs(delta)<1e-10?'Valor mantido.':`${delta>0?'Aumentou':'Diminuiu'} nesta medida; confira os outros erros.`,direction:Math.abs(delta)<1e-10?'same':delta>0?'higher':'lower'};
}
