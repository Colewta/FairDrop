import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type DropoutChartProps = {
  confusionMatrix: number[][];
};

function getMatrixValue(matrix: number[][], row: number, column: number) {
  return matrix[row]?.[column] ?? 0;
}

export default function DropoutChart({ confusionMatrix }: DropoutChartProps) {
  const trueNegative = getMatrixValue(confusionMatrix, 0, 0);
  const falsePositive = getMatrixValue(confusionMatrix, 0, 1);
  const falseNegative = getMatrixValue(confusionMatrix, 1, 0);
  const truePositive = getMatrixValue(confusionMatrix, 1, 1);

  const chartData = [
    { label: 'Ativos reais', value: trueNegative + falsePositive },
    { label: 'Evadidos reais', value: falseNegative + truePositive },
    { label: 'Ativos previstos', value: trueNegative + falseNegative },
    { label: 'Evadidos previstos', value: falsePositive + truePositive },
  ];

  return (
    <article className="chart-card">
      <div className="card-heading">
        <span className="section-kicker">Matriz de confusão</span>
        <h3>Distribuição de classes</h3>
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip cursor={{ fill: 'rgba(88, 123, 105, 0.08)' }} />
            <Bar dataKey="value" fill="#587b69" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="confusion-matrix" aria-label="Matriz de confusao detalhada">
        <span />
        <strong>Previsto ativo</strong>
        <strong>Previsto evasão</strong>
        <strong>Real ativo</strong>
        <span>{trueNegative}</span>
        <span>{falsePositive}</span>
        <strong>Real evasão</strong>
        <span>{falseNegative}</span>
        <span>{truePositive}</span>
      </div>
    </article>
  );
}
