import type { ModelMetrics } from '../../types/model';
import type { Metrics } from '../../types/platform';
import { learningMetrics, testCounts } from '../../services/metricEducation';
import { percent } from '../../services/format';
import MetricExplorer from './MetricExplorer';

export default function LearningMetricsPanel({ metrics, threshold, outcome }: {
  metrics: ModelMetrics & Partial<Metrics>; threshold?: number; outcome?: string;
}) {
  const counts = testCounts(metrics);
  return <article className="summary-card" id="entender-desempenho">
    <span className="section-kicker">Desempenho · etapa 1</span>
    <h3>Desempenho do modelo</h3>
    <p>Compare os acertos e os erros. Escolha uma medida abaixo para entender seu resultado.</p>
    {outcome && <p>Nesta análise, usamos o nome <strong>resultado de risco</strong> a situação <strong>{outcome}</strong>. Um alerta é um aviso do sistema sobre essa situação. Já um caso real é um registro do histórico em que ela aconteceu. Compare os dois para saber quantos avisos estavam certos e quantos casos passaram sem aviso.</p>}
    {counts && <div className="outcome-counts" aria-label="Acertos e erros em registros"><p><strong>{counts.tp}</strong> casos de risco com alerta</p><p><strong>{counts.fn}</strong> casos de risco sem alerta</p><p><strong>{counts.fp}</strong> falsos alertas</p><p><strong>{counts.tn}</strong> registros sem o resultado e sem alerta</p></div>}
    <MetricExplorer metrics={learningMetrics(metrics)} label="Medida de desempenho" />
    <details><summary>Probabilidades e critérios de avaliação</summary>    <p>O FairDrop aprende com exemplos do passado: informações dos alunos e o que aconteceu com eles. O que ele aprende fica salvo em um modelo, usado depois para estimar novas situações. Esse processo é chamado aprendizado de máquina, ou ML. Aqui você vê como ele se saiu com registros que ficaram de fora do aprendizado.</p>
      <p><strong>Probabilidade:</strong> é uma chance estimada a partir do histórico. Se o sistema estiver bem ajustado, entre muitos casos com previsão perto de 70%, esperamos que a situação aconteça em cerca de 70 de cada 100. Isso não diz com certeza o que acontecerá com um aluno específico.</p>
      <p><strong>Limite de alerta (limiar):</strong> é a marca a partir da qual o sistema emite um aviso. Uma previsão de 60% gera alerta se a marca for 50%, mas não gera se ela for 70%. {threshold !== undefined && <>Neste modelo, a avaliação usa alerta a partir de <strong>{percent(threshold)}</strong>. </>}Baixar a marca pode ajudar a encontrar mais casos e também gerar mais falsos avisos. As faixas baixo, médio e alto são outra divisão: servem para organizar a revisão dos alunos.</p>
      <p><strong>Treino, validação e teste:</strong> são três partes diferentes do histórico. O treino serve para aprender. A validação compara as opções e escolhe uma delas. O teste confere a escolhida em exemplos que não participaram dessas duas etapas. Os resultados desta ficha vêm dessa última parte.</p>
      <p><strong>Amostra:</strong> é o conjunto de exemplos usado na conta. Se houver poucos exemplos, um ou dois erros podem mudar bastante a porcentagem. Por isso, confira o tamanho dos grupos e verifique os resultados de outras turmas e períodos.</p>
      <p><strong>Calibração:</strong> é o ajuste da escala das chances. Se muitos casos recebem previsão de 80%, mas a situação acontece em apenas metade deles, a escala pode estar exagerando o risco. O gráfico do modo técnico ajuda a conferir isso. Uma escala boa no total ainda pode funcionar mal para um grupo.</p>
    </details>
    <p className="method-sources">Referência: <a href="https://scikit-learn.org/stable/modules/model_evaluation.html" target="_blank" rel="noreferrer">scikit-learn — avaliação de modelos</a>.</p>
  </article>;
}
