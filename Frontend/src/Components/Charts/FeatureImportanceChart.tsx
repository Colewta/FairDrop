import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type FeatureImportanceChartProps = {
  importances: Record<string, number>;
};

function compactFeatureName(name: string) {
  if (name.length <= 28) {
    return name;
  }

  return `${name.slice(0, 25)}...`;
}

export default function FeatureImportanceChart({ importances }: FeatureImportanceChartProps) {
  const data = Object.entries(importances)
    .map(([feature, importance]) => ({ feature: compactFeatureName(feature), importance, originalFeature: feature }))
    .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
    .slice(0, 12)
    .reverse();

  return (
    <article className="chart-card full-span">
      <div className="card-heading horizontal">
        <div>
          <span className="section-kicker">Interpretabilidade</span>
          <h3>Variáveis mais influentes</h3>
        </div>
        <span className="chart-note">Top {data.length || 0}</span>
      </div>

      {data.length > 0 ? (
        <div className="chart-frame tall">
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(value) => Number(value).toFixed(2)} />
              <YAxis dataKey="feature" type="category" width={180} tick={{ fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: 'rgba(88, 120, 139, 0.08)' }}
                formatter={(value) => [Number(value).toFixed(4), 'Importância']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.originalFeature ?? ''}
              />
              <Bar dataKey="importance" radius={[0, 6, 6, 0]}>
                {data.map((item) => (
                  <Cell key={item.originalFeature} fill={item.importance >= 0 ? '#58788b' : '#a98b59'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="empty-state compact">A importância das variáveis não está disponível para este algoritmo.</div>
      )}
    </article>
  );
}
