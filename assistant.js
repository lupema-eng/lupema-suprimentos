(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const stop=new Set('eu me voce voces por favor preciso precisamos quero queria gostaria encontre encontrar busca buscar busque pesquisa pesquisar pesquise procura procurar procure mostre mostrar ver localizar localize um uma uns umas o a os as de do da dos das para pra com que tem na no nossa nosso base lupema cadastrado cadastrados cadastrada cadastradas apenas somente so e pelo pela classe classes grupo grupos'.split(' '));
  function parse(text,previous){
    const clean=normalize(text).trim();
    if(/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|como usar)[!? .]*$/.test(clean))return {help:true};
    let scope=/prospectad|novos fornecedores/.test(clean)?'leads':/fornecedor|fornecedores|cnpj|cpf/.test(clean)?'suppliers':/mao de obra|servico|servicos/.test(clean)?'services':/insumo|insumos|material|materiais|equipamento|ferramenta/.test(clean)?'items':'all';
    const locationMatch=clean.match(/\b(?:em|na cidade de|no estado de)\s+(.+?)[?.!]*$/);
    const location=locationMatch?locationMatch[1].replace(/[?.!]+$/,'').trim():'';
    let value=locationMatch?clean.slice(0,locationMatch.index):clean;
    value=value.replace(/\b(?:mao de obra|novos fornecedores|fornecedores|fornecedor|insumos|insumo|materiais|material|servicos|servico|cnpj|cpf|prospectados|prospectado)\b/g,' ');
    let terms=(value.match(/[a-z0-9]+/g)||[]).filter(t=>!stop.has(t)).join(' ');
    const following=!terms&&!!previous?.query;
    if(!terms&&previous?.query){terms=previous.query;if(scope==='all')scope=previous.scope;}
    // Location-only follow-ups keep the subject and supplier scope.
    if(location&&scope==='all')scope=previous?.scope==='leads'?'leads':'suppliers';
    return {query:terms,scope,location:location||(following&&previous?.location)||''};
  }
  const api={parse,normalize};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.LupemaAssistant=api;
  const panel=document.getElementById('view-assistant');if(!panel)return;
  const input=document.getElementById('assistantInput'),log=document.getElementById('assistantLog'),status=document.getElementById('assistantStatus'),mascot=document.getElementById('assistantMascot');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={items:'Insumos',services:'Serviços / mão de obra',suppliers:'Fornecedores da base',leads:'Fornecedores prospectados'};
  let previous=null,turn=0;
  function message(text,who='bot'){
    const node=document.createElement('div');node.className='assistant-message '+who;
    const label=document.createElement('strong');label.textContent=who==='user'?'Você':'Assistente Lupema';node.append(label);
    const p=document.createElement('p');p.textContent=text;node.append(p);log.append(node);return node;
  }
  function welcome(){previous=null;log.replaceChildren();mascot.src='./mascote-ola.webp';status.textContent='Pronto para ajudar';message('Olá! O que você precisa para a obra? Posso localizar insumos, serviços e fornecedores cadastrados. Experimente: “Preciso de cimento” ou “Fornecedor de cimento em São Paulo”.');}
  function detail(record){
    const dialog=document.getElementById('assistantDetail');document.getElementById('assistantDetailTitle').textContent=record.title;
    document.getElementById('assistantDetailBody').innerHTML=`<p class="assistant-source">${esc(labels[record.kind])}</p><dl>${record.details.filter(x=>x[1]!==undefined&&x[1]!==null&&String(x[1]).trim()).map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${record.suppliers?.length?'<h3>Fornecedores vinculados ao insumo</h3><p>Vínculos registrados na base; confirme o atendimento atual.</p>':''}`;
    (record.suppliers||[]).forEach(s=>{const b=document.createElement('button');b.type='button';b.className='btn assistant-linked';b.textContent=s.title+' — ver contato';b.addEventListener('click',()=>detail(s));document.getElementById('assistantDetailBody').append(b);});
    if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
  }
  function results(node,records){
    const size=8;let shown=0;
    const list=document.createElement('div');list.className='assistant-results';node.append(list);
    const more=document.createElement('button');more.type='button';more.className='btn';node.append(more);
    function next(){records.slice(shown,shown+size).forEach(r=>{
      const b=document.createElement('button');b.type='button';b.className='assistant-result';
      b.innerHTML=`<span class="assistant-source">${esc(labels[r.kind])}</span><b>${esc(r.title)}</b><span>${esc(r.subtitle)}</span><small>${esc(r.reason)}</small><span class="assistant-detail-link">Ver detalhes e contatos →</span>`;
      b.addEventListener('click',()=>detail(r));list.append(b);
    });shown=Math.min(shown+size,records.length);more.hidden=shown>=records.length;more.textContent=`Mostrar mais (${shown} de ${records.length})`;}
    more.addEventListener('click',next);next();
  }
  function send(text){
    text=String(text||'').trim().slice(0,400);if(!text)return;
    if(++turn>20){log.replaceChildren();turn=1;} // Keep this tab's transient history bounded.
    input.value='';message(text,'user');status.textContent='Consultando a base…';mascot.src='./mascote-busca.webp';
    try{
      const request=parse(text,previous);
      if(request.help||!request.query){message('Diga o nome ou código do insumo, nome do fornecedor ou CNPJ. Para refinar, escreva “somente insumos”, “e os fornecedores?” ou “em São Paulo”. Uso os registros disponíveis na base, sem consultar preços ou estoque em tempo real.');status.textContent='Qual insumo ou fornecedor você procura?';return;}
      previous=request;
      const records=root.LupemaAssistantSearch(request);
      const subject=`Busca: “${request.query}”${request.location?' · Localidade: '+request.location:''}`;
      const node=message(records.length?`${subject}. Encontrei ${records.length} registro(s). Abra um resultado para conferir a origem e os detalhes.`:`${subject}. Não encontrei registros com esses termos. Tente um nome mais curto, o código ou outra descrição. Não substituí o insumo por um produto diferente.`);
      if(records.length){
        const counts=Object.entries(labels).map(([kind,label])=>{const count=records.filter(r=>r.kind===kind).length;return count?`${count} ${label.toLowerCase()}`:'';}).filter(Boolean).join(' · ');
        const p=document.createElement('p');p.className='assistant-counts';p.textContent=counts;node.append(p);results(node,records);
      }
      status.textContent=records.length?'Resultados encontrados':'Vamos ajustar a busca?';mascot.src=records.length?'./mascote-ok.webp':'./mascote-ola.webp';
    }catch(error){message('Não consegui concluir a consulta. Tente novamente. Se continuar, informe a equipe técnica.');status.textContent='Consulta interrompida';}
    finally{log.lastElementChild?.scrollIntoView?.({behavior:'smooth',block:'nearest'});input.focus();}
  }
  document.getElementById('assistantSend').addEventListener('click',()=>send(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(input.value);}});
  panel.querySelectorAll('[data-assistant-prompt]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.assistantPrompt)));
  document.getElementById('assistantClear').addEventListener('click',()=>{turn=0;welcome();input.focus();});
  document.getElementById('assistantDetailClose').addEventListener('click',()=>{const d=document.getElementById('assistantDetail');if(d.close)d.close();else d.removeAttribute('open');});
  mascot.addEventListener('click',()=>send('Como usar?'));
  mascot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();send('Como usar?');}});
  welcome();
})(typeof window==='object'?window:globalThis);
