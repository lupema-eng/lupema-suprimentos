(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\binstalacoes\b/g,'instalacao').replace(/\b(hidraulic|eletric)(?:as|os|a|o)\b/g,'$1');
  const ignored=new Set('de do da dos das e para com a o os as'.split(' '));
  const words=value=>(normalize(value).match(/[a-z0-9]+/g)||[]).filter(w=>!ignored.has(w));
  const contains=(value,terms)=>{const tokens=words(value);return terms.every(t=>tokens.some(w=>/^\d+$/.test(t)?w===t:w.startsWith(t)));};
  function match(record,query,officialByCode=new Map()){
    const text=String(query||'').trim(),terms=words(text);
    if(!terms.length)return {type:'all',reason:'Histórico de solicitações; nenhum termo de insumo informado.'};
    const number=text.match(/^(?:sc\s*)?(\d+)$/i);
    if(number){
      if(String(record.number)===number[1])return {type:'number',reason:'Número exato da solicitação: SC '+record.number+'.'};
      const item=!/^sc/i.test(text)&&(record.items||[]).find(i=>String(i.c)===number[1]);
      return item?{type:'code',reason:'Código exato do insumo '+item.c+' · '+item.d+' · linha '+item.row+'.'}:null;
    }
    // The subject field is the purchased item. Notes, work, brand and location
    // cannot turn an event or a conduit into a masonry purchase.
    const item=(record.items||[]).find(i=>contains(i.d,terms));
    if(item)return {type:'description',reason:'Descrição do insumo '+item.c+' · '+item.d+' · linha '+item.row+'.'};
    // A small, explicit catalog relationship, not a composition or semantic guess.
    // Only generic masonry queries qualify; structural queries never expand here.
    if(!terms.includes('alvenaria')||!terms.every(t=>['alvenaria','vedacao'].includes(t)))return null;
    const related=(record.items||[]).find(i=>{
      const official=officialByCode.get(String(i.c));
      if(!official||!normalize(official.g).includes('elementos de vedacao'))return false;
      const historic=normalize(i.d),current=normalize(official.d);
      const head=historic.match(/^(bloco|tijolo|canaleta)\b/);
      return !!head&&current.startsWith(head[1]+' ')&&!/estrutural|autoportante|refratari|silico/.test(historic+' '+current);
    });
    if(!related)return null;
    const official=officialByCode.get(String(related.c));
    return {type:'related',reason:'Material relacionado pelo grupo da tabela geral: '+official.g+' · '+related.c+' · '+related.d+' · linha '+related.row+'. Não comprova contratação do serviço nem composição completa.'};
  }
  function observation(record,query){const terms=words(query);const note=(record.observations||[]).find(note=>contains(note,terms));return note?{type:'observation',reason:'Correspondência somente na observação original: '+note+'. Não comprova o tipo de insumo comprado.'}:null;}
  const api={match,observation};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LupemaRequestMatcher=api;
})(typeof window==='object'?window:globalThis);
