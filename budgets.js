(function(root){
  'use strict';
  const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\binstalacoes\b/g,'instalacao');
  const words=v=>(normalize(v).match(/[a-z0-9]+/g)||[]).filter(t=>!['de','do','da','dos','das','e','com','para'].includes(t));
  const contains=(value,terms)=>{const tokens=words(value);return terms.every(t=>tokens.some(w=>/^\d+$/.test(t)?w===t:w.startsWith(t)));};
  const name=v=>words(v).join(' ');
  const area=v=>normalize(v).replace(/(\d+)\s*(?:[º°ª]|[oa]\b)/g,'$1').replace(/\b(?:pavimento|andar)\b/g,'pav').replace(/\bsub\s+solo\b/g,'subsolo');
  function find(database,request){
    const terms=words(request.query);if(!terms.length)return[];
    const numeric=/^\d+$/.test(request.query),found=[];
    for(const project of database.projects||[]){
      if(request.context?.work&&!contains(project.work,words(request.context.work)))continue;
      for(const record of project.records||[]){
        if(request.context?.area&&!contains(area(record.uc+' '+record.substage+' '+record.activity),words(area(request.context.area))))continue;
        const component=record.items.find(i=>numeric?i.c===request.query:contains(i.d,terms));
        if(!component&&(numeric||!contains(record.activity,terms)))continue;
        found.push({project,record,component});
      }
    }
    return found;
  }
  const api={find,name};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  const database=JSON.parse(document.getElementById('budgetData')?.textContent||'{"projects":[]}');
  const official=new Map((CATALOG.items||[]).map(i=>[String(i.c),i]));
  const quantity=value=>value===''||value==null?'Não informado':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:6});
  const money=value=>value===''||value==null?'Não informado':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function itemLine(i){const registered=official.get(i.c),compatible=registered&&name(registered.d)===name(i.d);return i.c+' · '+i.d+' · Qtd. orçada: '+quantity(i.qty)+' '+i.unit+' · Índice original: '+quantity(i.index)+' · Preço unitário: '+money(i.price)+' · Valor orçado: '+money(i.budgeted)+' · linha '+i.row+(!registered?' · Código ausente da tabela geral atual':!compatible?' · Descrição do orçamento difere do cadastro atual; vínculo de fornecedor não inferido':'');}
  root.LupemaBudgetStatus=()=>({integrated:!!database.projects?.length,revision:database.revision,asOf:database.asOf,projects:(database.projects||[]).map(p=>({work:p.work,...p.counts}))});
  root.LupemaBudgetWorkNames=()=>(database.projects||[]).map(p=>p.work.replace(/\s*-\s*OBRA\s*$/i,'').trim());
  root.LupemaBudgetSearch=request=>find(database,request).map(({project,record,component})=>{
    const budgeted=record.items.filter(i=>!i.outside),outside=record.items.filter(i=>i.outside);
    const codes=[...new Set(budgeted.filter(i=>{const registered=official.get(i.c);return registered&&name(registered.d)===name(i.d);}).map(i=>i.c))];
    return {kind:'budgets',id:record.id,title:project.work+' · '+record.activity,subtitle:record.uc+' · '+budgeted.length+' linhas orçadas · '+outside.length+' fora da composição',reason:component?'Correspondência no insumo '+component.c+' · '+component.d+' · linha '+component.row+(component.outside?' — compra fora da composição; não é insumo orçado neste serviço.':'.'):'Correspondência no serviço orçamentário · linha '+record.row+'.',componentCodes:codes,details:[
      ['Obra',project.workCode+' · '+project.work],['Unidade construtiva',record.uc],['Etapa',record.stage],['Subetapa',record.substage],['Serviço / atividade',record.activity],
      ['Valor orçado da atividade',money(record.total.budgeted)],
      ['Insumos orçados nesta atividade',budgeted.length?budgeted.map(itemLine).join('\n'):'Nenhum insumo orçado discriminado nesta atividade.'],
      ['Compras fora da composição',outside.length?outside.map(i=>itemLine(i)+' · Qtd. comprometida: '+quantity(i.committedQty)+' '+i.unit+' · Comprometido: '+money(i.committed)).join('\n'):'Nenhuma linha marcada como fora da composição.'],
      ['Ajustes e ausência de composição',record.adjustments.length?record.adjustments.map(a=>a.label+' · Valor orçado: '+money(a.budgeted)+' · linha '+a.row).join('\n'):'Nenhum ajuste informado.'],
      ['Como interpretar', 'Quantidades e índice são os valores originais da exportação. A quantidade-base do serviço não foi informada separadamente; o índice não foi usado para estimar quantidades nem produtividade. Compras fora da composição não integram a lista de insumos orçados.'],
      ['Fonte',project.source+' · aba '+project.sheet+' · atividade na linha '+record.row+' · arquivo recebido em '+String(database.asOf||'').split('-').reverse().join('/')+'. Exportação estática; não atualiza o Sienge.']
    ]};
  });
})(typeof window==='object'?window:globalThis);
