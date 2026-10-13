type AccuracyCardProps = {
  label: string;
  value: number | null;
  helper: string;
  tone?: 'neutral' | 'good' | 'warning';
};

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${(value * 100).toFixed(1)}%`;
}

export default function AccuracyCard({ label, value, helper, tone = 'neutral' }: AccuracyCardProps) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{formatPercent(value)}</strong>
      </div>
      <p>{helper}</p>
    </article>
  );
}
