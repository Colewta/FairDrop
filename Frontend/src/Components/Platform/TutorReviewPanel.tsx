import { useState } from 'react';
import type { FormEvent } from 'react';
import type { TutorReview } from '../../types/platform';
import { useResource } from '../../services/platformApi';
import { api, getApiErrorMessage } from '../../services/api';
import { date } from '../../services/format';
import { ErrorNotice, Loading } from './Common';

const actions = [
  ['data_checked', 'Conferi os dados do aluno.'],
  ['student_heard', 'Conversei com o aluno sobre sua situação.'],
  ['barriers_reviewed', 'Verifiquei dificuldades de acesso às atividades e ao apoio.'],
  ['support_offered', 'Ofereci apoio adequado à situação do aluno.'],
  ['follow_up_planned', 'Combinei o próximo acompanhamento.'],
];

function ReviewForm({ studentId, initial }: { studentId: string; initial: TutorReview }) {
  const [review, setReview] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function change(update: Partial<TutorReview>) { setReview({ ...review, ...update }); setSaved(false); }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { setReview((await api.put<TutorReview>(`/students/${studentId}/review`, review)).data); setSaved(true); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  return <form onSubmit={save}>{actions.map(([key, label]) => <label className="checkbox-label" key={key}><input type="checkbox" checked={review.checked_actions.includes(key)} onChange={e => change({ checked_actions: e.target.checked ? [...review.checked_actions, key] : review.checked_actions.filter(item => item !== key) })} />{label}</label>)}<label className="field-group">Conclusão da revisão<select value={review.conclusion} onChange={e => change({ conclusion: e.target.value as TutorReview['conclusion'] })}><option value="pending">Revisão pendente</option><option value="support">Oferecer apoio</option><option value="data_issue">Corrigir dados e reavaliar</option><option value="disagree">Discordo do alerta após a revisão</option><option value="monitor">Acompanhar sem novo encaminhamento</option></select></label><label className="field-group">Observações e próximos passos<textarea rows={3} maxLength={2000} value={review.note} onChange={e => change({ note: e.target.value })} placeholder="Anote o que foi combinado e quando o caso será revisto." /></label><ErrorNotice message={error} /><button className="primary-button" disabled={busy}>{busy ? 'Salvando…' : 'Salvar revisão do tutor'}</button>{saved && <p role="status">Revisão salva.</p>}{review.updated_at && <small>Último registro: {date(review.updated_at)}</small>}<p>A revisão é salva junto desta avaliação. Para mudar os dados ou treinar o modelo novamente, use as telas de bases e modelos.</p></form>;
}

export default function TutorReviewPanel({ studentId }: { studentId: string }) {
  const { data, error, loading } = useResource<TutorReview>(`/students/${studentId}/review`);
  return <article className="summary-card tutor-review"><span className="section-kicker">Registro de acompanhamento</span><h3>Revisão do tutor</h3><p>Registre o que foi conferido e os encaminhamentos combinados. Marque as ações já realizadas.</p><ErrorNotice message={error} />{loading && <Loading />}{data && <ReviewForm key={studentId} studentId={studentId} initial={data} />}</article>;
}
