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
    meaning: 'Com poucos exemplos de um grupo, o modelo pode deixar de reconhecer situações importantes para esses alunos.',
    example: 'Exemplo fictício: a base tem muitas turmas diurnas e quase nenhuma noturna. O modelo pode funcionar pior para quem estuda à noite.',
    tutor: 'Avise quais turmas ou situações estão pouco presentes e confira se os canais de registro atendem a todos.',
    team: 'Busque registros reais e consistentes dos grupos e períodos ausentes. Separe novos dados para avaliar o modelo, evitando duplicar o mesmo aluno entre treino e avaliação.',
    verify: 'Compare o número de registros de cada grupo, a disponibilidade das métricas e os erros nos novos períodos.',
    limit: 'Copiar linhas não cria novas evidências. Igualar quantidades por si só não corrige resultados históricos errados nem garante equidade.',
    availability: 'A composição da base é revista pela instituição. Depois, importe a base revisada e faça um novo treino.' },
  { key: 'reweighing', title: 'Reponderar os exemplos de treinamento', technical: 'Reponderação · Reweighing',
    when: 'Quando há associação entre o grupo e o resultado no histórico e é preciso testar se reduzir essa associação no aprendizado diminui diferenças nas previsões.',
    meaning: 'Cada registro continua sendo o mesmo. O que muda é quanto ele conta durante o aprendizado: algumas combinações de grupo e resultado recebem mais peso e outras, menos.',
    example: 'Exemplo fictício: uma combinação de grupo e resultado aparece menos do que seria esperado se fossem independentes. Esses registros podem receber mais peso no treino. O peso depende da combinação, não apenas do tamanho do grupo.',
    tutor: 'Escolha o atributo que precisa de investigação, leia os erros dos dois grupos e use o experimento abaixo para pedir a comparação.',
    team: 'O FairDrop calcula os pesos no treino e compara o modelo original com a versão reponderada. O resultado final usa os mesmos registros de teste e o mesmo limite de alerta.',
    verify: 'Leia antes e depois: diminuiu a diferença de detecção? Aumentaram os falsos alertas? Algum grupo ficou com mais casos sem apoio? Confira também o desempenho geral.',
    limit: 'Pode melhorar uma medida e piorar outra. Não conserta registros errados nem garante a eliminação do viés. A comparação pode manter o modelo original.',
    availability: 'Use “Comparar com reponderação” abaixo. O experimento exige dados suficientes em cada grupo. A técnica não está disponível para KNN.' },
  { key: 'proxy', title: 'Revisar informações que podem reproduzir desigualdades', technical: 'Revisão de variáveis e de proxies',
    when: 'Quando uma informação parece representar indiretamente condições sociais ou oportunidades desiguais, em vez de uma necessidade educacional bem compreendida.',
    meaning: 'Uma proxy é uma pista indireta. Mesmo sem informar renda, outras colunas podem carregar parte dessa informação. Retirar apenas o nome de um atributo sensível não elimina o problema.',
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
    meaning: 'Mitigar também significa reduzir possíveis danos no uso da análise: conferir cada caso, ouvir o aluno e remover barreiras no atendimento.',
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
    <p>Confira os registros e os erros por grupo antes de escolher uma ação. As opções abaixo atendem a problemas diferentes e podem precisar ser combinadas.</p>
    <label className="field-group" htmlFor={id}>Ação a consultar<select id={id} value={selected} onChange={e => setSelected(e.target.value)}>{techniques.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
    <div className="metric-lesson" aria-live="polite" aria-atomic="true"><h4>{technique.title}</h4><span className="section-kicker">{technique.technical}</span><p>{technique.meaning}</p>
      <p><strong>Quando usar:</strong> {technique.when}</p>
      <div className="metric-reading"><p>{technique.example}</p></div>
      <div className="action-responsibilities"><div><h4>Na revisão do aluno</h4><p>{technique.tutor}</p></div><div><h4>Com a instituição e a equipe técnica</h4><p>{technique.team}</p></div></div>
      <h4>Como avaliar o resultado</h4><p>{technique.verify}</p>
      <p><strong>Limites:</strong> {technique.limit}</p>
      <p className="notice"><strong>Na aplicação:</strong> {technique.availability}</p>
    </div>
  </div>;
}
