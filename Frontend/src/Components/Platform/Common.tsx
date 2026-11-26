import { Link } from 'react-router-dom';
import type { DatasetProfile, StudentPrediction } from '../../types/platform';
export { FairnessIndicator } from './FairnessIndicator';

import { date, percent } from '../../services/format';
export function ErrorNotice({ message, onRetry }: { message: string | null; onRetry?: () => void }) { return message ? <div className="form-error" role="alert"><p>{message}</p>{onRetry && <button onClick={onRetry} type="button">Tentar novamente</button>}</div> : null; }
export function Loading() { return <p className="loading-state" role="status">Carregando…</p>; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="empty-state">{children}</div>; }
export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong>{detail && <p>{detail}</p>}</article>;
}
export function RiskBadge({ level }: { level: StudentPrediction['risk_level'] }) {
  return <span className={`risk-badge risk-${level}`}>{({ low: 'Baixo', medium: 'Médio', high: 'Alto' })[level]}</span>;
}
export function DatasetHealthCard({ profile }: { profile: DatasetProfile }) {
  return <article className="summary-card"><h3>Qualidade da base</h3>
    <p>Confira as pendências antes de iniciar o treinamento.</p>
    <ul className="health-list">{profile.health.checks.map(check => <li key={check}>{check}</li>)}
      {profile.health.issues.map((issue, index) => <li key={index} className={issue.severity === 'critical' ? 'critical-text' : ''}>
        <strong>{issue.column ? `${issue.column}: ` : ''}</strong>{issue.message}</li>)}</ul>
  </article>;
}
export function StudentRiskTable({ students }: { students: StudentPrediction[] }) {
  return <div className="table-scroll"><table className="data-table student-table"><caption className="sr-only">Estimativas dos alunos nesta avaliação</caption><thead><tr><th scope="col">Identificador</th><th scope="col">Curso / turma</th><th scope="col">Risco estimado</th><th scope="col">Faixa</th><th scope="col">Avaliação</th><th scope="col">Detalhes</th></tr></thead><tbody>
    {students.map(student => <tr key={student.id}><td>{student.student_id}{student.top_factors?.length>0&&<small>Fatores: {student.top_factors.slice(0,2).map(f=>f.feature).join(', ')}</small>}</td><td>{Object.entries(student.groups??{}).map(([k,v])=><small key={k}>{k}: {v}</small>)}</td><td><div className="risk-cell"><strong>{percent(student.risk_probability)}</strong><span className="risk-meter" aria-hidden="true"><span style={{width:`${Number.isFinite(student.risk_probability)?Math.max(0,Math.min(100,student.risk_probability*100)):0}%`}}/></span></div></td><td><RiskBadge level={student.risk_level} /></td><td>{date(student.created_at)}</td><td><Link to={`/students/${student.id}`}>Revisar aluno</Link></td></tr>)}
  </tbody></table></div>;
}
