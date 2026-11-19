import type { CleaningReport } from '../../types/platform';

export default function DataCleaningNotice({ report }: { report?: CleaningReport | null }) {
  if (!report?.issues.length) return null;
  return <aside className="summary-card data-cleaning-notice" aria-label="Tratamento automático dos dados">
    <h3>Tratamento automático dos dados</h3>
    <p>Foram recebidos <strong>{report.input_rows.toLocaleString('pt-BR')} registros</strong> e aproveitados <strong>{report.output_rows.toLocaleString('pt-BR')}</strong>. {report.removed_rows > 0 ? `${report.removed_rows.toLocaleString('pt-BR')} registros foram removidos pelos motivos abaixo.` : 'Os registros foram mantidos com os ajustes indicados abaixo.'}</p>
    <details><summary>Ver ajustes e localização</summary>
      <p>Os números da última coluna ajudam você a encontrar o problema na planilha original; a linha do título também entra na contagem. Um campo de previsão inválido, como uma palavra no lugar da nota, pode ser preenchido com uma regra aprendida no histórico. Já a situação final do aluno nunca é adivinhada para completar o treino.</p>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Ajuste</th><th>Quantidade</th><th>Coluna</th><th>Linhas de origem</th></tr></thead><tbody>
        {report.issues.map(issue => <tr key={`${issue.code}:${issue.column ?? ''}`}><td>{issue.message}</td><td>{issue.count.toLocaleString('pt-BR')}</td><td>{issue.column ?? 'Registro completo'}</td><td>{issue.rows.length ? <>{issue.rows.join(', ')}{issue.count > issue.rows.length && <small> · primeiras {issue.rows.length} ocorrências</small>}</> : 'Não se aplica'}</td></tr>)}
      </tbody></table></div>
    </details>
  </aside>;
}
