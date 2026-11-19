import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Explanation } from '../../types/platform';

export function FeatureImpactChart({ explanation }: { explanation: Explanation }) {
  const data = Object.entries(explanation.global_importance).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([feature, impact]) => ({ feature, impact }));
  return <article className="chart-card"><h3>Principais informações usadas pelo modelo</h3><p>Quanto maior a barra, mais essa informação pesou nas previsões dos exemplos analisados. Isso ajuda a entender o que o sistema levou em conta. Uma barra grande para frequência, por exemplo, não prova que as faltas causaram a saída de um aluno.</p><details><summary>Método de cálculo</summary><p>{explanation.method}: {explanation.message}</p></details>
    {data.length > 0 ? <ResponsiveContainer width="100%" height={Math.max(200, data.length * 32)}><BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
      <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="feature" width={140} /><Tooltip /><Bar isAnimationActive={false} dataKey="impact" fill="#587b69" /></BarChart></ResponsiveContainer> : <p>Explicação {explanation.status === 'pending' ? 'pendente' : 'indisponível'}.</p>}
  </article>;
}
