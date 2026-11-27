type Props = {
  label: string;
  value: number | null;
  stage: string;
  failed?: boolean;
};

export default function TaskProgress({ label, value, stage, failed = false }: Props) {
  const percent = value === null ? null : Math.max(0, Math.min(100, Math.floor(value)));
  const complete = percent === 100 && !failed;
  return <div className={`task-progress${failed ? ' task-progress-failed' : ''}${complete ? ' task-progress-complete' : ''}`}>
    <div className="task-progress-heading"><strong>{label}</strong><span className="task-progress-value">{percent === null ? '—' : <>{percent}<small>%</small></>}</span></div>
    <div className={`task-progress-track${percent === null ? ' task-progress-pending' : ''}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
      aria-valuetext={`${percent === null ? 'Aguardando atualização' : `${percent}%`}. ${stage}${failed ? ' Operação interrompida.' : ''}`}>
      <span className="task-progress-fill" style={percent === null ? undefined : { width: `${percent}%` }} />
    </div>
    <p className="task-progress-stage" role="status">{stage}</p>
    {!complete && !failed && <small className="task-progress-note">O percentual acompanha as etapas concluídas. Algumas podem demorar mais, sem mudar a porcentagem.</small>}
  </div>;
}
