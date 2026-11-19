import { useId, useState } from 'react';

const techniques = [
  { key: 'data', title: 'Conferir e corrigir os registros', technical: 'Qualidade dos dados e dos resultados históricos',
    when: 'Quando faltas, notas ou a situação final parecem erradas, incompletas ou registradas de forma diferente entre grupos.',
    meaning: 'O modelo aprende com os registros. Se o histórico contém erros repetidos para um grupo, ele pode aprender esses erros como se fossem um padrão real.',
    example: 'Exemplo fictício: alunos de uma turma participaram, mas a chamada não foi registrada. A baixa frequência pode produzir alertas indevidos.',
    tutor: 'Confira a chamada e o resultado com os responsáveis pelo registro; ouça o aluno e documente a divergência na revisão individual.',
    team: 'Corrija a fonte, mantenha o histórico da correção e prepare uma nova base. Se o erro estava no treino, treine novamente; se estava só nos dados atuais, gere outra avaliação com os dados corrigidos.',
    verify: 'Confira se diminuiu a falta de informações e se os falsos alertas e casos perdidos por grupo melhoraram em dados de avaliação adequados.',
    limit: 'Não altere notas ou resultados apenas para melhorar uma métrica. Correções precisam corresponder ao que realmente aconteceu.',
    availability: 'A revisão do tutor pode ser registrada na tela do aluno. A correção é feita na fonte e exige importar a base novamente.' },
  { key: 'representation', title: 'Incluir melhor os grupos pouco representados', technical: 'Representatividade da amostra',
    when: 'Quando há poucos exemplos de um grupo, períodos ausentes ou situações de risco quase não representadas.',
    meaning: 'Se um grupo quase não aparece no histórico, o sistema tem poucos exemplos para aprender sobre ele. Por isso, pode errar mais com esses alunos.',
    example: 'Exemplo fictício: a base tem muitas turmas diurnas e quase nenhuma noturna. O modelo pode funcionar pior para quem estuda à noite.',
    tutor: 'Avise quais turmas ou situações estão pouco presentes e confira se os canais de registro atendem a todos.',
    team: 'Busque registros reais e consistentes dos grupos e períodos ausentes. Separe novos dados para avaliar o modelo, evitando duplicar o mesmo aluno entre treino e avaliação.',
    verify: 'Compare o número de registros de cada grupo, a disponibilidade das métricas e os erros nos novos períodos.',
    limit: 'Copiar linhas não cria novas evidências. Igualar quantidades por si só não corrige resultados históricos errados nem garante equidade.',
    availability: 'A escola precisa buscar os registros que estão faltando. Quando a planilha estiver revisada, envie-a de novo e inicie outra análise.' },
  { key: 'reweighing', title: 'Reponderar os exemplos de treinamento', technical: 'Reponderação · Reweighing',
    when: 'Quando as situações registradas aparecem em proporções diferentes entre os grupos e você quer testar um ajuste no aprendizado. Antes, confira se essas diferenças refletem a realidade ou erros na planilha.',
    meaning: 'Cada registro continua sendo o mesmo. O que muda é quanto ele conta durante o aprendizado: algumas combinações de grupo e resultado recebem mais peso e outras, menos.',
    example: 'Exemplo fictício: o histórico tem poucos casos de trancamento do noturno em relação aos casos dos outros grupos. O sistema pode dar mais importância a essa combinação enquanto aprende. A conta considera o grupo junto com o resultado, e não apenas o tamanho da turma.',
    tutor: 'Escolha uma coluna para comparar os grupos, confira os erros e use “Preparar um experimento” para testar a reponderação.',
    team: 'O FairDrop calcula os pesos no treino e compara o modelo original com a versão reponderada. O resultado final usa os mesmos registros de teste e o mesmo limite de alerta.',
    verify: 'Leia antes e depois: diminuiu a diferença de detecção? Aumentaram os falsos alertas? Algum grupo ficou com mais casos sem apoio? Confira também o desempenho geral.',
    limit: 'Pode melhorar uma medida e piorar outra. Não conserta registros errados nem garante a eliminação do viés. A comparação pode manter o modelo original.',
    availability: 'Na seção “Preparar um experimento”, escolha os grupos e a reponderação. O sistema avisa se faltam exemplos. KNN, um dos métodos de previsão, não aceita esse ajuste.' },
  { key: 'proxy', title: 'Revisar informações que podem reproduzir desigualdades', technical: 'Revisão de variáveis e de proxies',
    when: 'Quando uma informação parece representar indiretamente condições sociais ou oportunidades desiguais, em vez de uma necessidade educacional bem compreendida.',
    meaning: 'Uma informação pode dar pistas sobre outra. O bairro, por exemplo, pode estar ligado à renda. Essas pistas indiretas são chamadas proxies. Por isso, tirar a coluna de renda não garante que o sistema deixou de usar informações ligadas a ela.',
    example: 'Exemplo fictício: poucos acessos à plataforma podem estar ligados à falta de internet. Interpretá-los automaticamente como desinteresse pode prejudicar um grupo.',
    tutor: 'Pergunte como a informação é produzida e quais barreiras podem explicá-la. Confira o contexto com o aluno, sem presumir sua situação a partir do grupo.',
    team: 'Revise a utilidade e a disponibilidade da informação antes do resultado. Teste um modelo com e outro sem a variável, mantendo condições de comparação equivalentes.',
    verify: 'Veja se as diferenças entre grupos diminuíram e se a escola ainda consegue encontrar os casos que precisam de apoio.',
    limit: 'Uma associação não prova discriminação. Excluir uma coluna pode prejudicar a detecção ou deixar a mesma informação representada em outras colunas.',
    availability: 'A equipe técnica pode escolher as variáveis na configuração de treino da base. É necessário treinar e comparar um novo modelo.' },
  { key: 'threshold', title: 'Revisar quando emitir um alerta', technical: 'Ajuste do limiar de classificação',
    when: 'Quando muitos casos ficam sem alerta ou o volume de falsos alertas dificulta o acompanhamento.',
    meaning: 'O limite é uma régua: acima dela, o modelo emite alerta. Baixá-la pode encontrar mais casos, mas também chamar mais alunos que não tiveram o resultado de risco.',
    example: 'Exemplo fictício: uma previsão de 45% não gera alerta com limite de 50%, mas gera com limite de 40%. O risco estimado continua sendo 45%; mudou a regra de alerta.',
    tutor: 'Converse com a equipe sobre a capacidade de atendimento e os efeitos de perder casos ou fazer contatos desnecessários. Mantenha apoio disponível também sem alerta.',
    team: 'Compare limites na validação e confira erros por grupo. O ajuste deve respeitar a finalidade de apoio e ser avaliado em teste separado.',
    verify: 'Conte quantos casos novos foram encontrados e quantos falsos alertas surgiram em cada grupo. Não olhe apenas para a acurácia.',
    limit: 'Mudar o limite não muda o histórico nem a probabilidade estimada. Melhorar o total de casos encontrados não garante reduzir desigualdades.',
    availability: 'A configuração técnica de treino permite um limite comum. O FairDrop não aplica automaticamente limites diferentes por grupo.' },
  { key: 'calibration', title: 'Ajustar o significado das probabilidades', technical: 'Calibração',
    when: 'Quando previsões como “80%” não acompanham as frequências observadas em conjuntos de casos semelhantes.',
    meaning: 'A calibração ajusta a escala das probabilidades para aproximá-la dos resultados observados. A estimativa de um aluno continua sujeita a erros.',
    example: 'Exemplo fictício: em muitas previsões próximas de 80%, o resultado acontece em cerca de 50% dos casos. A escala pode estar exagerando o risco.',
    tutor: 'Evite apresentar a porcentagem como destino do aluno. Peça que a equipe confira se a escala faz sentido antes de usá-la para priorizar atendimento.',
    team: 'Teste a calibração durante o treino e avalie depois a curva, o Brier e os erros por grupo em registros separados.',
    verify: 'Confira se as frequências observadas ficaram mais próximas das previstas, se o erro das probabilidades mudou e se os alertas continuam úteis.',
    limit: 'Uma escala bem ajustada no total pode funcionar mal em um grupo. Calibração não é uma técnica que, sozinha, garanta equidade.',
    availability: 'Existe uma opção de calibração na configuração técnica de treino. É preciso treinar e avaliar um novo modelo.' },
  { key: 'support', title: 'Tornar o apoio acessível e acompanhar os efeitos', technical: 'Revisão humana e monitoramento',
    when: 'Em toda utilização, especialmente quando um grupo recebe menos apoio ou mais abordagens desnecessárias.',
    meaning: 'O cuidado também está no uso dos resultados: conferir a situação, ouvir o aluno e ver se ele consegue acessar o apoio. Um ajuste no sistema não resolve, por exemplo, um horário de tutoria que o aluno não pode frequentar.',
    example: 'Exemplo fictício: a tutoria só atende em um horário incompatível com parte dos alunos. Oferecer outros horários pode ampliar o acesso sem alterar a identidade de ninguém.',
    tutor: 'Combine um encaminhamento com o aluno, registre a revisão e verifique depois se ele conseguiu acessar o apoio. Não condicione todo atendimento ao alerta.',
    team: 'Acompanhe acesso ao apoio e, quando os resultados reais estiverem disponíveis, compare falsos alertas e casos perdidos por grupo no novo período.',
    verify: 'Verifique quem conseguiu atendimento e se as diferenças de acesso e de erros persistem. Uma queda no risco previsto não prova que uma ação causou melhora.',
    limit: 'As métricas descrevem o modelo; elas não substituem a avaliação das práticas da escola nem determinam o motivo da situação de um aluno.',
    availability: 'O plano de revisão fica na tela individual do aluno. As ações de apoio são conduzidas pela instituição e não mudam automaticamente o modelo.' },
];

export default function MitigationGuide() {
  const [selected, setSelected] = useState('data');
  const id = useId();
  const technique = techniques.find(item => item.key === selected)!;
  return <div className="mitigation-guide">
    <h4>Opções de mitigação</h4>
    <p>Nem toda diferença se resolve mudando o método de previsão. Um erro na chamada, por exemplo, precisa ser corrigido na escola. Escolha abaixo o problema que quer entender e veja quem pode agir e como conferir o resultado.</p>
    <label className="field-group" htmlFor={id}>Ação a consultar<select id={id} value={selected} onChange={e => setSelected(e.target.value)}>{techniques.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
    <div className="metric-lesson" aria-live="polite" aria-atomic="true"><h4>{technique.title}</h4><span className="section-kicker">{technique.technical}</span><p>{technique.meaning}</p>
      <p><strong>Quando usar:</strong> {technique.when}</p>
      <div className="metric-reading"><p>{technique.example}</p></div>
      <div className="action-responsibilities"><div><h4>O que o tutor pode fazer</h4><p>{technique.tutor}</p></div><div><h4>O que precisa da escola ou da equipe técnica</h4><p>{technique.team}</p></div></div>
      <h4>Como avaliar o resultado</h4><p>{technique.verify}</p>
      <p><strong>Limites:</strong> {technique.limit}</p>
      <p className="notice"><strong>Na aplicação:</strong> {technique.availability}</p>
    </div>
  </div>;
}
