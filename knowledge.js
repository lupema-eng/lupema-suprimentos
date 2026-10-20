(function(root){
  'use strict';
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const sources=[{label:'ABCP — Alvenaria estrutural',url:'https://abcp.org.br/aplicacoes-alvenaria-estrutural/'},{label:'ABCP — Alvenaria estrutural em pauta',url:'https://abcp.org.br/alvenaria-estrutural-em-pauta/'}];
  function answer(input,previous){
    const text=norm(input),technical=/o que (?:e|significa)|explique|como funciona|metodologia|metodo construtivo|duvida|cuidados|comparar|diferenca|como (?:executar|e executada)/.test(text);
    // A search for contracts or materials must continue to query the private base.
    if(/contrat|fornecedor|insumo|busc|pesquis/.test(text))return null;
    const elliptical=/^(?:e )?(?:(?:quais|que) (?:os )?cuidados|como funciona|como (?:executar|e executada))[? .]*$/.test(text);
    const topic=/alvenaria estrutural/.test(text)?'alvenaria-estrutural':elliptical?previous:null;
    if(!technical)return null;
    if(topic!=='alvenaria-estrutural')return {unknown:true};
    let result='Alvenaria estrutural é um sistema em que as paredes participam da estrutura da edificação, recebendo e transmitindo cargas. Pode ser usada em casas e edifícios. Há soluções armadas e não armadas, definidas no projeto. Na solução armada, barras de aço e graute podem preencher os vazados dos blocos.\n\nA geometria, as aberturas e as instalações precisam ser compatibilizadas com o projeto estrutural. Esta explicação é conceitual: não define dimensões, resistências ou autoriza alterações na obra.';
    if(/cuidados|execut/.test(text))result='Cuidados com alvenaria estrutural\n\nConfira o projeto estrutural e a compatibilização das instalações antes de executar. A modulação, o alinhamento das paredes e as aberturas interferem no comportamento do sistema. Não decida cortes, rasgos, remoção de paredes ou novas aberturas com base apenas nesta explicação: encaminhe a situação ao responsável pelo projeto estrutural.\n\nPara a execução, siga os projetos liberados e os procedimentos aprovados para a obra. A biblioteca não fornece um dimensionamento nem um procedimento executivo completo.';
    if(/comparar|diferenca/.test(text))result='Alvenaria estrutural × alvenaria de vedação\n\nEstrutural: as paredes fazem parte do sistema que recebe e transmite as cargas previstas no projeto.\n\nVedação: sua função principal é fechar e dividir ambientes; as cargas principais da edificação são atendidas por outro sistema estrutural. Ela também exige projeto, estabilidade e compatibilização.\n\nA aparência da parede não basta para identificar sua função. Consulte o projeto antes de decidir qualquer intervenção.';
    return {topic:'alvenaria-estrutural',text:result,sources};
  }
  const api={answer};if(typeof module==='object'&&module.exports)module.exports=api;else root.LupemaKnowledge=api;
})(typeof window==='object'?window:globalThis);
