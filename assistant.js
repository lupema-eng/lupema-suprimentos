(function(root){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const stop=new Set('eu me voce voces por favor preciso precisamos quero queria gostaria encontre encontrar busca buscar busque pesquisa pesquisar pesquise procura procurar procure mostre mostrar ver localizar localize um uma uns umas o a os as de do da dos das para pra com que tem na no nossa nosso base lupema cadastrado cadastrados cadastrada cadastradas apenas somente so e pelo pela classe classes grupo grupos realizacao realizar aplicacao aplicar semelhante semelhantes relacionado relacionados sobre tambem esses estas estes isso desse dessa dele dela traga trazer tudo informacoes resumo qual quais indique informe encontro'.split(' '));
  function parse(text,previous,workNames=[]){
    let clean=normalize(text).trim();
    if(/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|como usar)[!? .]*$/.test(clean))return {help:true};
    const classificationQuestion=/\b(?:qual|quais|informe|mostrar|mostre|ver|consultar)\b.*\b(?:classe|classificacao|casse|grupo)\b|\b(?:classe|classificacao|casse|grupo)\s+(?:do|de|desse|deste|da|dessa)\b/.test(clean);
    if(classificationQuestion){
      const subject=clean.replace(/^.*?\b(?:classe|classificacao|casse|grupo)\b/,'').replace(/\b(?:do|da|de|dos|das|desse|deste|dessa|desta|esse|este|essa|esta|o|a|os|as|insumo|insumos|material|materiais|servico|servicos|pesquisado|pesquisados|pesquisada|pesquisadas|consultado|consultados|anterior|anteriormente|que|eu|me|voce|pesquisei|pesquisou|busquei|procurei|e)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
      return {query:subject||previous?.query||'',scope:/servico|mao de obra/.test(clean)||previous?.scope==='services'?'services':'items',location:'',intent:'classification'};
    }
    const contractIntent=/\bcontratos?\b/.test(clean),itemIntent=/\binsumos?\b|\bmateriais?\b/.test(clean);
    const requestIntent=/\b(?:solicitacoes?|solicitacao)(?: de compra)?\b|\bsc\s*\d+/.test(clean);
    let scope=requestIntent?'requests':contractIntent&&itemIntent?'all':contractIntent?'contracts':/prospectad|novos fornecedores/.test(clean)?'leads':/fornecedor|fornecedores|cnpj|cpf/.test(clean)?'suppliers':/mao de obra|servico|servicos/.test(clean)?'services':/insumo|insumos|material|materiais|equipamento|ferramenta/.test(clean)?'items':'all';
    if(scope==='services'&&/\b(?:realizar|executar|execucao|vou|irei|preciso|quero|gostaria)\b/.test(clean)&&!/\b(?:somente|apenas|so)\b/.test(clean))scope='all';
    const selection=clean.match(/\b(?:insumos?|materiais?|fornecedores?|contratos?|servicos?)\b(?:\s*(?:,|e)\s*(?:insumos?|materiais?|fornecedores?|contratos?|servicos?)\b)+/);
    const scopes=selection?[...new Set((selection[0].match(/[a-z]+/g)||[]).filter(t=>t!=='e').map(t=>/^contrato/.test(t)?'contracts':/^fornecedor/.test(t)?'suppliers':/^servico/.test(t)?'services':'items'))]:null;
    if(scopes)scope='all';
    const context={};
    const workMention=workNames.some(name=>{const words=normalize(name).match(/[a-z0-9]+/g)||[];return words.length&&new RegExp('\\b'+words.join('[\\s-]*')+'\\b').test(clean);});
    if(requestIntent||workMention||/\b(?:realizar|executar|execucao|vou|irei|pavimento|andar|subsolo|obra|empreendimento)\b/.test(clean)){
      const names=[...new Set(workNames)].sort((a,b)=>b.length-a.length);
      for(const name of names){
        const words=normalize(name).match(/[a-z0-9]+/g)||[];if(!words.length)continue;
        const pattern=new RegExp('\\b'+words.join('[\\s-]*')+'\\b','g');
        if(pattern.test(clean)){context.work=name;clean=clean.replace(pattern,' ');break;}
      }
      const areaPattern=/\b(?:pavimento\s+(?:(?:do|de)\s+)?(?:h?tipo|terreo|tecnico|superior|inferior)|\d+\s*(?:[º°ª]|o|a)?\s*(?:andar|pavimento|subsolo)|terreo|mezanino|cobertura)\b/g;
      const areas=clean.match(areaPattern);if(areas){context.area=areas.join(' · ');clean=clean.replace(areaPattern,' ');}
      clean=clean.replace(/\b(?:vou|irei|executar|execucao|fazer|obra|empreendimento|pavimento)\b/g,' ').replace(/\s+/g,' ').trim().replace(/\b(?:em|no|na|do|da)(?:\s+(?:em|no|na|do|da))*\s*$/,'').trim();
    }
    const locationMatch=clean.match(/\b(?:em|na cidade de|no estado de)\s+(.+?)[?.!]*$/);
    const location=locationMatch?locationMatch[1].replace(/[?.!]+$/,'').trim():'';
    let value=locationMatch?clean.slice(0,locationMatch.index):clean;
    // Keep the requested subject before conversational purpose clauses.
    value=value.split(/\bpara (?:a )?(?:realizacao|realizar|aplicacao|aplicar|contratar|contratacao)\b/)[0];
    value=value.replace(/\b(?:solicitacoes de compras|solicitacoes de compra|solicitacao de compras|solicitacao de compra|solicitacoes|solicitacao|observacoes|observacao|sc|numero|realizadas|realizada|ja|mao de obra|novos fornecedores|fornecedores|fornecedor|insumos|insumo|materiais|material|servicos|servico|cnpj|cpf|prospectados|prospectado|contratos|contrato)\b/g,' ');
    let terms=(value.match(/[a-z0-9]+/g)||[]).filter(t=>!stop.has(t)).join(' ');
    const following=!terms&&!!previous?.query;
    if(!terms&&previous?.query){terms=previous.query;if(scope==='all')scope=previous.scope;}
    // Location-only follow-ups keep the subject and supplier scope.
    if(location&&scope==='all')scope=previous?.scope==='leads'?'leads':'suppliers';
    return {query:terms,scope,...(requestIntent&&/\bobservac/.test(clean)?{requestField:'observation'}:{}),...(requestIntent&&/^\d+$/.test(terms)&&! /\binsumo/.test(clean)?{requestNumber:terms}:{}),location:location||(following&&previous?.location)||'',...(scopes?{scopes}:following&&scope==='all'&&previous?.scopes?{scopes:previous.scopes}:{}),...(Object.keys(context).length?{context}:following&&previous?.context?{context:previous.context}:{})};
  }
  function externalLinks(term){const q=encodeURIComponent(String(term||'').trim().slice(0,250));return [{label:'Google',url:'https://www.google.com/search?q='+q},{label:'Google Imagens',url:'https://www.google.com/search?tbm=isch&q='+q},{label:'Google Maps',url:'https://www.google.com/maps/search/?api=1&query='+q},{label:'Google Lens (imagem)',url:'https://lens.google.com/'}];}
  function speechText(text){
    return String(text||'').replace(/\((s|es)\)/g,'$1').replace(/⚠/g,' Atenção. ').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(full,year,month,day)=>{const months=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];return months[Number(month)-1]?Number(day)+' de '+months[Number(month)-1]+' de '+year:full;}).replace(/https?:\/\/\S+/g,'link da fonte').replace(/\bCNPJ\b/g,'C N P J').replace(/\bCPF\b/g,'C P F').replace(/\bNBR\b/g,'N B R').replace(/\bMO\b/g,'mão de obra').replace(/\bCP\s*(II|III|IV|V)\b/gi,(_,n)=>'C P '+({II:'dois',III:'três',IV:'quatro',V:'cinco'}[n.toUpperCase()])).replace(/m²/g,'metros quadrados').replace(/m³/g,'metros cúbicos').replace(/\bkg\b/gi,'quilogramas').replace(/[·→↗×]/g,', ').replace(/[*_#]/g,'').replace(/\s+/g,' ').trim();
  }
  function speechChunks(text){
    const words=speechText(text).slice(0,6000).split(/\s+/),chunks=[];let part='';
    words.forEach(word=>{if(part&&(part.length+word.length>180||(/[.!?;:]$/.test(part)&&part.length>=60))){chunks.push(part);part='';}part+=(part?' ':'')+word;});if(part)chunks.push(part);return chunks;
  }
  function localVoices(voices){return (voices||[]).filter(v=>v.localService&&/^pt(?:[-_]|$)/i.test(v.lang)).sort((a,b)=>Number(/^pt[-_]BR$/i.test(b.lang))-Number(/^pt[-_]BR$/i.test(a.lang)));}
  const api={parse,normalize,externalLinks,speechText,speechChunks,localVoices};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  root.LupemaAssistant=api;
  const panel=document.getElementById('view-assistant');if(!panel)return;
  const input=document.getElementById('assistantInput'),log=document.getElementById('assistantLog'),status=document.getElementById('assistantStatus'),mascot=document.getElementById('assistantMascot');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={items:'Insumos',services:'Serviços / mão de obra',suppliers:'Fornecedores da base',leads:'Fornecedores prospectados',contracts:'Contratos semelhantes',needs:'Necessidades',references:'Referências salvas',requests:'Solicitações de compra'};
  let previous=null,turn=0,lastAnswer='',lastTopic=null,animation=null,animationEnd=null,speaking=false,voiceRun=0,currentUtterance=null,lastVoiceRecords=[];
  const reduceMotion=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const voiceButton=document.getElementById('assistantVoice');
  const slides=['./lupinho-ola.webp','./lupinho-pensando.webp','./lupinho-fala-1.webp'];
  let slideIndex=0,slidesPaused=!!reduceMotion;
  const slidePause=document.getElementById('assistantSlidePause'),slideCount=document.getElementById('assistantSlideCount');
  slides.concat('./lupinho-fala-2.webp').forEach(src=>{const image=new Image();image.src=src;});
  function slideControls(){slidePause.textContent=slidesPaused?'▶ Iniciar slides':'Ⅱ Pausar slides';slidePause.setAttribute('aria-pressed',String(slidesPaused));slideCount.textContent=(slideIndex+1)+' / '+slides.length;}
  function nextSlide(){slideIndex=(slideIndex+1)%slides.length;mascot.src=slides[slideIndex];mascot.classList.remove('assistant-slide-change');void mascot.offsetWidth;mascot.classList.add('assistant-slide-change');slideControls();}
  slidePause.addEventListener('click',()=>{slidesPaused=!slidesPaused;slideControls();});
  document.getElementById('assistantSlideNext').addEventListener('click',()=>{stopVoice();nextSlide();});
  setInterval(()=>{if(slidesPaused||document.hidden||!panel.classList.contains('active')||speaking||animation)return;nextSlide();},4000);
  slideControls();

  function stopTalking(){clearInterval(animation);clearTimeout(animationEnd);animation=null;speaking=false;panel.classList.remove('assistant-speaking');mascot.src='./lupinho-fala-1.webp';voiceButton.textContent='Ouvir resposta';}
  function animate(duration){if(reduceMotion)return;clearInterval(animation);clearTimeout(animationEnd);let frame=false;panel.classList.add('assistant-speaking');animation=setInterval(()=>{frame=!frame;mascot.src=frame?'./lupinho-fala-2.webp':'./lupinho-fala-1.webp';},240);if(duration)animationEnd=setTimeout(stopTalking,duration);}
  const voiceChoice=document.getElementById('assistantVoiceChoice'),voiceRate=document.getElementById('assistantVoiceRate'),voicePause=document.getElementById('assistantVoicePause'),voiceStop=document.getElementById('assistantVoiceStop');
  function resetVoiceControls(){voicePause.hidden=true;voiceStop.hidden=true;voicePause.textContent='Pausar áudio';}
  function stopVoice(){voiceRun++;root.speechSynthesis?.cancel();if(root.speechSynthesis?.paused)root.speechSynthesis.resume();currentUtterance=null;resetVoiceControls();stopTalking();}
  function refreshVoices(){
    const old=voiceChoice.value,voices=localVoices(root.speechSynthesis?.getVoices()||[]);voiceChoice.replaceChildren();
    voices.forEach((v,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=v.name+' · '+v.lang;voiceChoice.append(o);});
    if(!voices.length){const o=document.createElement('option');o.value='';o.textContent='Nenhuma voz local em português';voiceChoice.append(o);}
    if([...voiceChoice.options].some(o=>o.value===old))voiceChoice.value=old;
    document.getElementById('assistantVoiceHint').textContent=voices.length?'Escolha a voz e a velocidade mais claras para você. Leitura por frases, usando somente voz local.':'Nenhuma voz local em português foi encontrada. A leitura depende das vozes instaladas no dispositivo.';
  }
  root.speechSynthesis?.addEventListener?.('voiceschanged',refreshVoices);refreshVoices();
  voiceButton.addEventListener('click',()=>{
    if(speaking){stopVoice();return;}
    const voices=localVoices(root.speechSynthesis?.getVoices()||[]),voice=voices[Number(voiceChoice.value)]||voices[0];
    if(!voice||!root.SpeechSynthesisUtterance){status.textContent='Voz local em português indisponível neste navegador. Você pode continuar pelo texto.';refreshVoices();return;}
    let text=lastAnswer;
    if(document.getElementById('assistantVoiceMode').value==='results'&&lastVoiceRecords.length){text+=' Resultados. '+lastVoiceRecords.slice(0,5).map((r,i)=>'Resultado '+(i+1)+'. '+r.title+'. '+incidentLabel(r)+' '+r.subtitle+'.').join(' ');if(lastVoiceRecords.length>5)text+=' Há mais resultados disponíveis na tela.';}
    const chunks=speechChunks(text);if(!chunks.length)return;
    stopVoice();const run=voiceRun;speaking=true;voiceButton.textContent='Parar áudio';voicePause.hidden=false;voiceStop.hidden=false;let index=0;
    function next(){
      if(run!==voiceRun)return;
      if(index>=chunks.length){currentUtterance=null;resetVoiceControls();stopTalking();status.textContent='Leitura concluída';return;}
      const utterance=currentUtterance=new root.SpeechSynthesisUtterance(chunks[index++]);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=Number(voiceRate.value)||.9;utterance.pitch=1;utterance.volume=1;
      utterance.onstart=()=>{if(run!==voiceRun)return;speaking=true;voiceButton.textContent='Parar áudio';animate();status.textContent='Lendo resposta · trecho '+index+' de '+chunks.length;};
      utterance.onend=()=>{if(run===voiceRun)next();};
      utterance.onerror=()=>{if(run!==voiceRun)return;stopVoice();status.textContent='Leitura interrompida. Tente outra voz local ou uma velocidade menor.';};
      root.speechSynthesis.speak(utterance);
    }
    next();
  });
  voicePause.addEventListener('click',()=>{if(!speaking)return;if(root.speechSynthesis.paused){root.speechSynthesis.resume();voicePause.textContent='Pausar áudio';animate();status.textContent='Leitura retomada';}else{root.speechSynthesis.pause();voicePause.textContent='Retomar áudio';clearInterval(animation);animation=null;panel.classList.remove('assistant-speaking');status.textContent='Leitura pausada';}});
  voiceStop.addEventListener('click',stopVoice);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice();});
  document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view!=='assistant')stopVoice();}));
  function message(text,who='bot'){
    const node=document.createElement('div');node.className='assistant-message '+who;
    const label=document.createElement('strong');label.textContent=who==='user'?'Você':'Assistente Lupema';node.append(label);
    const p=document.createElement('p');p.textContent=text;node.append(p);log.append(node);if(who==='bot'){lastAnswer=text;lastVoiceRecords=[];animate(Math.min(4200,Math.max(1800,text.length*12)));}return node;
  }
  function welcome(){stopVoice();lastTopic=null;previous=null;log.replaceChildren();mascot.src='./lupinho-ola.webp';status.textContent='Pronto para ajudar';message('Olá! O que você precisa para a obra? Sou o Lupinho! Localizo insumos, serviços, fornecedores e contratos semelhantes. Também explico os temas disponíveis na biblioteca técnica. Experimente: “Preciso de cimento” ou “Fornecedor de cimento em São Paulo”.');}
  function incidentInfo(record){
    const v=record.incidentSummary;
    if(v)return {summary:v,text:v.unresolved?'⚠ '+v.unresolved+' ocorrência(s) pendente(s). Não seguir com cotação sem análise e liberação da equipe responsável.':v.total?'⚠ Histórico de '+v.total+' ocorrência(s) resolvida(s). Consulte os registros antes de nova cotação.':'Sem ocorrência registrada. Isso não equivale a fornecedor aprovado.'};
    const linked=(record.suppliers||[]).filter(s=>s.incidentSummary?.total);
    if(!linked.length)return null;const pending=linked.reduce((n,s)=>n+s.incidentSummary.unresolved,0);
    return {summary:{total:linked.length,unresolved:pending},text:'⚠ '+linked.length+' fornecedor(es) vinculado(s) com ocorrências'+(pending?' pendentes. Não seguir com cotação sem análise e liberação da equipe responsável.':' resolvidas. Consulte os registros antes de nova cotação.')};
  }
  function incidentLabel(record){return incidentInfo(record)?.text||'';}
  function incidentBanner(record){const info=incidentInfo(record);if(!info)return '';const v=info.summary;return '<span class="assistant-incident '+(v.unresolved?'open':v.total?'history':'none')+'">'+esc(info.text)+'</span>';}
  function detail(record){
    if(['items','services'].includes(record.kind))previous={query:String(record.id),scope:record.kind,location:''};
    const dialog=document.getElementById('assistantDetail');document.getElementById('assistantDetailTitle').textContent=record.title;
    document.getElementById('assistantDetailBody').innerHTML=`${incidentBanner(record)}<p class="assistant-source">${esc(labels[record.kind])}</p><dl>${record.details.filter(x=>x[1]!==undefined&&x[1]!==null&&String(x[1]).trim()).map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${record.suppliers?.length?'<h3>Fornecedores vinculados ao registro</h3><p>Vínculos registrados na base; confirme o atendimento atual.</p>':''}`;
    (record.suppliers||[]).forEach(s=>{const b=document.createElement('button');b.type='button';b.className='btn assistant-linked';b.textContent=s.title+(s.incidentSummary?.total?' — ⚠ '+s.incidentSummary.total+' ocorrência(s), '+s.incidentSummary.unresolved+' pendente(s)':'')+' — ver contato';if(s.incidentSummary?.total)b.classList.add('has-incident');b.addEventListener('click',()=>detail(s));document.getElementById('assistantDetailBody').append(b);});
    if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
  }
  function results(node,records){
    lastVoiceRecords=records;
    const size=8;let shown=0;
    const list=document.createElement('div');list.className='assistant-results';node.append(list);
    const more=document.createElement('button');more.type='button';more.className='btn';node.append(more);
    function next(){records.slice(shown,shown+size).forEach(r=>{
      const b=document.createElement('button');b.type='button';b.className='assistant-result'+(r.incidentSummary?.total?' has-incident':'');
      b.innerHTML=`${incidentBanner(r)}<span class="assistant-source">${esc(labels[r.kind])}</span><b>${esc(r.title)}</b><span>${esc(r.subtitle)}</span><small>${esc(r.reason)}</small><span class="assistant-detail-link">Ver detalhes →</span>`;
      b.addEventListener('click',()=>detail(r));list.append(b);
    });shown=Math.min(shown+size,records.length);more.hidden=shown>=records.length;more.textContent=`Mostrar mais (${shown} de ${records.length})`;}
    const filters=document.createElement('div');filters.className='assistant-result-filters';node.insertBefore(filters,list);
    const allRecords=records;
    [['all','Todos'],...Object.entries(labels)].forEach(([kind,label])=>{const count=kind==='all'?allRecords.length:allRecords.filter(r=>r.kind===kind).length;if(!count)return;const b=document.createElement('button');b.type='button';b.textContent=label+' ('+count+')';b.setAttribute('aria-pressed',String(kind==='all'));b.addEventListener('click',()=>{records=kind==='all'?allRecords:allRecords.filter(r=>r.kind===kind);shown=0;lastVoiceRecords=records;list.replaceChildren();filters.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));next();});filters.append(b);});
    more.addEventListener('click',next);next();
  }
  function showKnowledge(text){
    const answer=root.LupemaKnowledge?.answer(text,lastTopic);if(!answer)return false;
    if(answer.unknown){lastTopic=null;const subject=normalize(text).match(/^(?:o que (?:e|significa)|explique(?: sobre)?|fale sobre)\s+(.+?)[?.!]*$/);if(subject)previous=parse(subject[1]);const node=message('Esse tema ainda não está disponível na biblioteca técnica. Não vou improvisar uma orientação. Posso pesquisar os registros da base; para isso, informe o nome do insumo, fornecedor ou contrato.');externalSearch(node,text);status.textContent='Tema técnico ainda não cadastrado';return true;}
    lastTopic=answer.topic;previous={query:'alvenaria estrutural',scope:'all',location:''};
    const node=message(answer.text);const refs=document.createElement('p');refs.className='assistant-knowledge-source';refs.textContent='Conteúdo de referência · Fontes consultadas em 20/10/2026: ';
    answer.sources.forEach(source=>{const a=document.createElement('a');a.href=source.url;a.textContent=source.label;a.target='_blank';a.rel='noopener noreferrer';refs.append(a,document.createTextNode(' '));});node.append(refs);
    const actions=document.createElement('div');actions.className='assistant-result-filters';
    ['Quais cuidados com alvenaria estrutural?','Comparar alvenaria estrutural e vedação','Contratos semelhantes de alvenaria estrutural','Insumos de alvenaria estrutural'].forEach(prompt=>{const b=document.createElement('button');b.type='button';b.textContent=prompt;b.addEventListener('click',()=>send(prompt));actions.append(b);});node.append(actions);status.textContent='Consulta à biblioteca técnica';return true;
  }
  function externalSearch(node,term){
    const block=document.createElement('div');block.className='assistant-external';
    const heading=document.createElement('strong');heading.textContent='Continuar na internet';block.append(heading);
    const note=document.createElement('p');note.textContent='Google, Imagens e Maps abrem uma pesquisa externa. Os resultados ainda não foram consultados nem verificados pelo Lupinho. No Lens, selecione a imagem manualmente.';block.append(note);
    const field=document.createElement('input');field.type='text';field.maxLength=250;field.value=term;field.setAttribute('aria-label','Termo enviado à pesquisa externa');block.append(field);
    const links=document.createElement('div');links.className='assistant-result-filters';block.append(links);
    function update(){links.replaceChildren();if(!field.value.trim())return;externalLinks(field.value).forEach(source=>{const a=document.createElement('a');a.href=source.url;a.textContent=source.label+' ↗';a.target='_blank';a.rel='noopener noreferrer';links.append(a);});}
    field.addEventListener('input',update);update();node.append(block);
  }
  function checkSupplier(identity){
    const field=document.getElementById('assistantSupplierIdentity');identity=String(identity||'').trim();if(!identity){field.focus();return;}
    stopVoice();message('Verificar fornecedor: '+identity,'user');
    const checked=root.LupemaAssistantFindSupplier(identity);
    const descriptions={empty:'Informe o nome ou documento do fornecedor.', 'invalid-document':'Informe o CNPJ com 14 dígitos ou o CPF com 11 dígitos para conferir pelo documento.',document:'Fornecedor encontrado na base pelo documento exato.',name:'Encontrei cadastro com o mesmo nome normalizado. Confira o CNPJ para confirmar que é a mesma empresa.',possible:'Encontrei possíveis correspondências pelo nome. Confira o CNPJ e os dados antes de considerar o fornecedor cadastrado.', 'not-found':'Não localizei esse nome ou documento nos cadastros de fornecedores e prospectados disponíveis. Pode existir com outro nome; confira também pelo CNPJ. Você pode continuar a pesquisa na internet abaixo.'};
    const node=message(descriptions[checked.status]);if(checked.records.length)results(node,checked.records);
    if(!['empty','invalid-document'].includes(checked.status))externalSearch(node,identity);
    status.textContent=checked.status==='document'?'Documento encontrado na base':'Conferência de fornecedor';
    log.lastElementChild?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  }
  document.getElementById('assistantCheckSupplier').addEventListener('click',()=>checkSupplier(document.getElementById('assistantSupplierIdentity').value));
  document.getElementById('assistantSupplierIdentity').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();checkSupplier(event.target.value);}});
  function classification(request){
    if(!request.query){message('De qual insumo você quer saber a classe ou o grupo? Informe o nome ou código.');status.textContent='Informe o insumo';return;}
    const records=root.LupemaAssistantSearch(request).filter(r=>['items','services'].includes(r.kind));
    if(!records.length){message('Não localizei o insumo “'+request.query+'” no catálogo. Informe o código ou a descrição para conferir o grupo cadastrado.');status.textContent='Insumo não localizado';return;}
    previous={query:request.query,scope:request.scope,location:''};
    const groupOf=r=>r.details.find(([key])=>key==='Grupo / etapa')?.[1]||'Não informado na base';
    const groups=[...new Set(records.map(groupOf))];
    const node=message(records.length===1?'O grupo / etapa cadastrado de '+records[0].title+' é: '+groupOf(records[0])+'.':groups.length===1?'Os '+records.length+' insumos encontrados para “'+request.query+'” estão no grupo / etapa: '+groups[0]+'.':'Encontrei '+records.length+' insumos para “'+request.query+'”, com grupos diferentes: '+groups.join(' · ')+'. Confira o código e a descrição abaixo.');
    const note=document.createElement('p');note.className='assistant-counts';note.textContent='Esta é a classificação do insumo no catálogo. A classe de credor pertence ao cadastro do fornecedor.';node.append(note);
    results(node,records.map(r=>({...r,subtitle:'Grupo / etapa: '+groupOf(r),reason:'Categoria: '+(r.details.find(([key])=>key==='Categoria')?.[1]||'Não informada na base')})));
    status.textContent='Grupo do insumo consultado na base';
  }
  function send(text){
    stopVoice();text=String(text||'').trim().slice(0,400);if(!text)return;
    if(/(?:consta|cadastrad[oa]|existe|verificar|verifique).*(?:base|fornecedor)|fornecedor.*(?:consta|cadastrad[oa]|existe)/i.test(normalize(text))){const identity=text.replace(/^.*?\bfornecedor(?:a)?\s+/i,'').replace(/\s+(?:consta|esta|está|existe|ja|já|e|é)\b.*$/i,'').replace(/[?!.]+$/,'').trim();if(identity&&identity!==text){input.value='';checkSupplier(identity);return;}}
    if(++turn>20){log.replaceChildren();turn=1;} // Keep this tab's transient history bounded.
    input.value='';message(text,'user');status.textContent='Consultando a base…';mascot.src='./lupinho-pensando.webp';
    try{
      if(/\b(?:solicitacao|solicitacoes) de compra|\bpedidos?\b|\bcotac(?:ao|oes)\b|\bavaliac(?:ao|oes)\b/.test(normalize(text))){message('A consulta específica de solicitações de compra, pedidos, cotações e avaliações ainda não está integrada ao assistente. Isso não significa que esses registros não existam. Hoje posso pesquisar os cadastros, insumos, serviços, contratos, necessidades e referências já disponíveis.');status.textContent='Consulta aguardando integração';return;}
      const request=parse(text,previous,root.LupemaAssistantWorkNames?.()||[]);
      if(request.intent==='classification'){classification(request);return;}
      if(showKnowledge(text))return;
      if(request.help||!request.query){message('Diga o nome ou código do insumo, nome do fornecedor ou CNPJ. Para refinar, escreva “somente insumos”, “e os fornecedores?” “em São Paulo” ou “contratos semelhantes”. Para dúvidas técnicas, experimente “O que é alvenaria estrutural?”. Uso os registros disponíveis na base, sem consultar preços ou estoque em tempo real.');status.textContent='Qual insumo ou fornecedor você procura?';return;}
      if(request.scope==='requests'&&!root.LupemaAssistantDataStatus?.().sourceAudit?.purchaseRequestSearchIntegrated){message('A consulta de solicitações ainda não está ativada nesta base. O administrador precisa aplicar a carga privada dos relatórios e entrar novamente.');status.textContent='Carga de solicitações pendente';return;}
      previous=request;
      const records=root.LupemaAssistantSearch(request);
      const subject=`Busca: “${request.query}”${request.location?' · Localidade: '+request.location:''}`;
      const node=message(records.length?`${subject}. Encontrei ${records.length} registro(s). Abra um resultado para conferir a origem e os detalhes.`:`${subject}. Não encontrei registros com esses termos. Tente um nome mais curto, o código ou outra descrição. Não substituí o insumo por um produto diferente.`);
      if(request.context){
        const p=document.createElement('p');p.className='assistant-counts';
        p.textContent='Contexto informado: '+[request.context.work,request.context.area].filter(Boolean).join(' · ')+'. Os resultados abaixo são referências gerais da base, com a origem indicada em cada registro. A composição do orçamento desta obra ainda não está integrada; estes resultados não confirmam os insumos nem as quantidades necessários para esse serviço.';
        node.append(p);
      }
      if(records.length){
        const counts=Object.entries(labels).filter(([kind])=>request.scopes?request.scopes.includes(kind)||kind==='leads'&&request.scopes.includes('suppliers'):request.scope==='all'?['items','services','suppliers','contracts'].includes(kind)||records.some(r=>r.kind===kind):request.scope===kind||request.scope==='suppliers'&&kind==='leads').map(([kind,label])=>`${records.filter(r=>r.kind===kind).length} ${label.toLowerCase()}`).join(' · ');
        const p=document.createElement('p');p.className='assistant-counts';p.textContent=counts;node.append(p);results(node,records);
      }
      const providers=records.filter(r=>['suppliers','leads'].includes(r.kind));
      const membership=document.createElement('p');membership.className='assistant-membership';membership.textContent=providers.length?providers.length+' fornecedor(es) da base ou prospectados associados à busca. Para confirmar uma empresa, use a conferência por nome/CNPJ acima.':'Nenhum fornecedor associado a estes termos foi localizado na base ou nos prospectados. Para conferir uma empresa específica, use nome/CNPJ acima.';if(request.scope!=='requests')node.append(membership);
      const dataStatus=root.LupemaAssistantDataStatus?.();
      if(dataStatus){
        const note=document.createElement('p');note.className='assistant-counts';
        const date=String(dataStatus.supplierGeneratedAt||'').slice(0,10);const formatted=/^\d{4}-\d{2}-\d{2}$/.test(date)?date.split('-').reverse().join('/'):'';
        note.textContent='Fontes: tabela geral de insumos, cadastro de fornecedores e histórico de contratos importados'+(formatted?'. Cadastro de fornecedores gerado em '+formatted:'')+(dataStatus.sourceAudit?.purchaseRequestSearchIntegrated?'. Solicitações de compra e vínculos de pedidos: relatórios enviados em 20/10/2026':'')+'. Alterações da equipe são lidas da base compartilhada. Esta consulta não atualiza o Sienge.';
        node.append(note);
      }
      if(request.scope!=='requests')externalSearch(node,[request.query,request.location].filter(Boolean).join(' '));
      status.textContent=records.length?'Resultados encontrados':'Vamos ajustar a busca?';mascot.src=records.length?'./lupinho-fala-1.webp':'./lupinho-ola.webp';
    }catch(error){message('Não consegui concluir a consulta. Tente novamente. Se continuar, informe a equipe técnica.');status.textContent='Consulta interrompida';}
    finally{log.lastElementChild?.scrollIntoView?.({behavior:'smooth',block:'nearest'});input.focus();}
  }
  document.getElementById('assistantSend').addEventListener('click',()=>send(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(input.value);}});
  panel.querySelectorAll('[data-assistant-action]').forEach(button=>button.addEventListener('click',()=>{
    const action=button.dataset.assistantAction;
    if(action==='check'){document.getElementById('assistantSupplierIdentity').focus();return;}
    if(action==='external'){stopVoice();const node=message('Digite o termo no campo abaixo e escolha onde pesquisar. A consulta será aberta no serviço externo.');externalSearch(node,input.value.trim());node.querySelector('input').focus();return;}
    if(action==='technical')input.value='O que é ';
    input.focus();
  }));
  panel.querySelectorAll('[data-assistant-prompt]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.assistantPrompt)));
  document.getElementById('assistantClear').addEventListener('click',()=>{turn=0;welcome();input.focus();});
  document.getElementById('assistantDetailClose').addEventListener('click',()=>{const d=document.getElementById('assistantDetail');if(d.close)d.close();else d.removeAttribute('open');});
  mascot.addEventListener('click',()=>send('Como usar?'));
  mascot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();send('Como usar?');}});
  welcome();
})(typeof window==='object'?window:globalThis);
