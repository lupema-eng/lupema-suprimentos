/* Private administrator notices use authenticated record authorship. Public daily content contains no corporate data. */
(function(){
  'use strict';
  const byId=id=>document.getElementById(id),form=byId('assistantNoticeForm'),admin=byId('assistantBoardAdmin'),manage=byId('assistantBoardManage'),list=byId('assistantNotices'),daily=byId('assistantDaily'),status=byId('assistantNoticeStatus');
  let editing=null,dailyData=null;
  const displayDate=value=>value.split('-').reverse().join('/');
  const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
  const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
  const active=row=>row.notice?.visible!==false&&row.notice?.startDate<=today()&&(!row.notice?.endDate||row.notice.endDate>=today());
  function el(tag,text,cls){const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;}
  function card(row){
    const item=row.notice,node=el('article','', 'assistant-board-card'+(item.priority==='Importante'?' important':''));
    node.append(el('small',(item.kind||'Informativo')+' · '+item.startDate),el('h3',item.title),el('p',item.text),el('small','Publicado por '+row.createdByName));
    if(safeUrl(item.sourceUrl)){const a=el('a','Consultar fonte ↗');a.href=safeUrl(item.sourceUrl);a.target='_blank';a.rel='noopener noreferrer';node.append(a);}return node;
  }
  function showDaily(manual){
    daily.replaceChildren(el('strong','Conhecimento do dia'));
    if(manual){daily.append(card(manual));return;}
    if(!dailyData){daily.append(el('p','Conteúdo automático indisponível no momento. Os informativos da equipe continuam disponíveis.'));return;}
    daily.append(el('small',dailyData.publishedOn===today()?'Conteúdo de '+displayDate(dailyData.publishedOn):'Último conteúdo disponível: '+displayDate(dailyData.publishedOn)),el('h3',dailyData.title),el('p',dailyData.text));
    (dailyData.sources||[]).forEach(source=>{const url=safeUrl(source.url);if(!url)return;const a=el('a',source.label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';daily.append(a);});
    daily.append(el('small','Referência conceitual. Aplicação na obra depende dos projetos e procedimentos aprovados.'));
  }
  function render(){
    const isAdmin=LupemaCloud.role==='admin';admin.hidden=!isAdmin;manage.hidden=!isAdmin;
    const rows=LupemaCloud.assistantNotices.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    const published=rows.filter(active),manual=published.find(r=>r.notice.kind==='Conhecimento do dia');
    list.replaceChildren();published.filter(r=>r.notice.kind!=='Conhecimento do dia').forEach(row=>list.append(card(row)));
    if(!list.children.length)list.append(el('p','Nenhum informativo ativo da administração.','assistant-board-empty'));
    showDaily(manual);
    const management=byId('assistantNoticeAdminList');management.replaceChildren();
    if(!isAdmin)return;
    rows.forEach(row=>{const node=el('div','', 'assistant-notice-admin-row'),label=el('span',row.notice.title+' · '+(row.notice.visible===false?'Arquivado':active(row)?'Publicado':'Fora da vigência'));
      const edit=el('button','Editar','btn');edit.type='button';edit.addEventListener('click',()=>{if(LupemaCloud.role!=='admin')return;if(editing)LupemaCloud.unlock('lupemaUsageControlV1','feedbacks/'+editing);editing=row.id;LupemaCloud.lock('lupemaUsageControlV1','feedbacks/'+editing);Object.entries(row.notice).forEach(([key,value])=>{if(form.elements.namedItem(key))form.elements.namedItem(key).value=value||'';});admin.open=true;status.textContent='Editando: '+row.notice.title;});
      const archive=el('button',row.notice.visible===false?'Republicar':'Arquivar','btn');archive.type='button';archive.addEventListener('click',async()=>{if(LupemaCloud.role!=='admin')return;archive.disabled=true;try{await LupemaCloud.saveAssistantNotice({...row.notice,id:row.id,visible:row.notice.visible===false});status.textContent='Alteração confirmada na base compartilhada.';render();}catch(error){status.textContent=error.message;}finally{archive.disabled=false;}});node.append(label,edit,archive);management.append(node);
    });
  }
  function reset(){if(editing)LupemaCloud.unlock('lupemaUsageControlV1','feedbacks/'+editing);editing=null;form.reset();form.elements.startDate.value=today();status.textContent='';}
  manage.addEventListener('click',()=>{if(LupemaCloud.role==='admin')admin.open=!admin.open;});
  byId('assistantNoticeNew').addEventListener('click',reset);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(LupemaCloud.role!=='admin'){status.textContent='Somente o administrador pode publicar.';return;}
    const d=Object.fromEntries(new FormData(form).entries());d.title=String(d.title||'').trim();d.text=String(d.text||'').trim();
    if(!d.title||!d.text||!d.startDate){status.textContent='Preencha título, conteúdo e data inicial.';return;}
    if(d.endDate&&d.endDate<d.startDate){status.textContent='A data final deve ser igual ou posterior à inicial.';return;}
    if(d.sourceUrl&&!safeUrl(d.sourceUrl)){status.textContent='A fonte precisa ser um endereço HTTP ou HTTPS válido.';return;}
    const button=form.querySelector('[type="submit"]');button.disabled=true;status.textContent='Gravando…';
    try{await LupemaCloud.saveAssistantNotice({...d,id:editing||undefined,visible:true});reset();status.textContent='Publicação confirmada. Conteúdo disponível para a equipe conforme a vigência.';render();}catch(error){status.textContent='Publicação não confirmada: '+error.message;}finally{button.disabled=false;}
  });
  async function loadDaily(){
    try{const r=await fetch('./daily-knowledge.json',{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error('Indisponível');const d=await r.json();if(d.schema!=='lupema-daily-knowledge-v1'||!/^\d{4}-\d{2}-\d{2}$/.test(d.publishedOn)||d.publishedOn>today()||typeof d.title!=='string'||typeof d.text!=='string'||d.title.length>140||d.text.length>3000||!Array.isArray(d.sources))throw Error('Conteúdo inválido');dailyData=d;}catch{dailyData=null;}render();
  }
  window.addEventListener('lupema:changed',render);
  document.querySelector('[data-view="assistant"]').addEventListener('click',loadDaily);
  setInterval(()=>{if(!document.hidden&&byId('view-assistant').classList.contains('active'))loadDaily();},900000);
  reset();render();loadDaily();
})();
