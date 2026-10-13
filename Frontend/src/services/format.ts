export const percent = (value: number | null | undefined) => typeof value !== 'number' || !Number.isFinite(value) ? 'Indisponível' : `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const date = (value: string) => new Date(value).toLocaleString('pt-BR');
