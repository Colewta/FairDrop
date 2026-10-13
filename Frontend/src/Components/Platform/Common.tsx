import { Link } from 'react-router-dom';
import type { DatasetProfile, StudentPrediction } from '../../types/platform';
export { FairnessIndicator } from './FairnessIndicator';

import { percent } from '../../services/format';
export function ErrorNotice({ message }: { message: string | null }) { return message ? <p className="form-error" role="alert">{message}</p> : null; }
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
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>Aluno</th><th>Risco estimado</th><th>Faixa</th><th>Detalhes</th></tr></thead><tbody>
    {students.map(student => <tr key={student.id}><td>{student.student_id}</td><td><strong>{percent(student.risk_probability)}</strong></td><td><RiskBadge level={student.risk_level} /></td><td><Link to={`/students/${student.id}`}>Revisar aluno</Link></td></tr>)}
  </tbody></table></div>;
}
