
(function(){
 const q=id=>document.getElementById(id), safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const normal=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const stop=new Set(['de','da','do','dos','das','com','para','em','um','uma','tipo','por','the','and']);
 const tokens=x=>normal(x).split(' ').filter(t=>t.length>2&&!stop.has(t));
 const catalog=catalogItems.map(x=>({...x,_type:x.laborEligible?'Mão de obra / serviço':'Material / insumo'}));
 let proposals=LupemaCloud.read('lupemaReferenceProposalsV1',[]);
 const groups=[...new Set(catalog.map(x=>x.g||x.group||x.stage).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 q('refGroupOptions').innerHTML=groups.map(x=>'<option value="'+safe(x)+'"></option>').join('');
 function score(item,term){const a=normal(item.d||item.name||''),b=normal(term),code=String(item.c||item.code||'');if(!b)return 0;if(code&&b===normal(code))return 100;if(a===b)return 98;if(containsTokens(a,b)&&b.length>3)return 90;const ts=tokens(term),is=new Set(tokens(a));if(!ts.length)return 0;const common=ts.filter(t=>is.has(t)).length;return Math.round(common/ts.length*75)+Math.round(common/Math.max(1,is.size)*12)}
 function find(){const term=q('refTerm').value.trim();if(!term){q('refSummary').textContent='Para pesquisar pela imagem, use o Google Lens. Após identificar o produto, informe a descrição para comparar com a base Lupema.';q('refMatches').innerHTML='';return}
 const list=catalog.map(x=>({x,rank:score(x,term)})).filter(z=>z.rank>=25).sort((a,b)=>b.rank-a.rank).slice(0,25);
 q('refSummary').textContent=list.length?`${list.length} correspondência(s) sugerida(s) entre os resultados mais próximos. Verifique unidade, dimensões, composição e aplicação antes de confirmar.`:'Nenhuma correspondência textual relevante. Isso não comprova que o insumo inexiste; revise sinônimos e detalhes.';
 q('refMatches').innerHTML=list.map(({x,rank})=>`<div style="padding:12px 4px;border-bottom:1px solid #dce2df"><b>${safe(x.c||x.code||'Sem código')} — ${safe(x.d||x.name||'')}</b> <span class="badge">${rank} pontos de similaridade textual</span><div class="small muted">${safe(x._type)} · ${safe(x.unit||x.u||'Unidade não informada')} · ${safe(x.g||x.group||x.stage||'Grupo não informado')}</div><button class="btn" type="button" data-ref-code="${safe(x.c||x.code||'')}" data-ref-type="${safe(x._type)}">Usar como referência de nomenclatura</button></div>`).join('');
 if(!q('refProposedName').value)q('refProposedName').value=term;
 }
 q('refSearch').addEventListener('click',find);
 q('refTerm').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find()}});
 q('refMatches').addEventListener('click',e=>{const b=e.target.closest('[data-ref-code]');if(!b)return;const x=catalog.find(x=>String(x.c||x.code||'')===b.dataset.refCode&&x._type===b.dataset.refType);if(!x)return;q('refProposedName').value=x.d||x.name||'';q('refUnit').value=[...q('refUnit').options].some(o=>o.value===x.u)?x.u:'un';q('refGroup').value=x.g||x.group||x.stage||'';q('refDetail').value='Referência de cadastro existente: '+(x.c||x.code)+' — confirmar se o produto é tecnicamente equivalente.'});
 function openSearch(images,byLink){let term=byLink?q('refLink').value.trim():q('refTerm').value.trim();if(!term){alert('Informe '+(byLink?'o link':'a nomenclatura')+' antes de pesquisar.');return}if(!byLink)term+=' fornecedor fabricante distribuidor '+q('refRegion').value;const url='https://www.google.com/search?'+(images?'tbm=isch&':'')+'q='+encodeURIComponent(term);window.open(url,'_blank','noopener,noreferrer')}
 q('refLens').addEventListener('click',()=>{
  const file=q('refImage').files[0], raw=q('refImageUrl').value.trim(), note=q('refLensNote');
  let url='https://lens.google.com/';
  if(raw){
    let parsed;try{parsed=new URL(raw)}catch(e){alert('Informe uma URL válida para a imagem.');return}
    if(!['https:','http:'].includes(parsed.protocol)){alert('Use um endereço de imagem HTTP ou HTTPS.');return}
    url='https://lens.google.com/uploadbyurl?url='+encodeURIComponent(parsed.href);
    if(note)note.textContent='Abrindo Google Lens com a URL pública informada. O acesso à imagem depende de ela estar disponível publicamente e de o Google aceitar esse endereço. Se não carregar, cole a URL no Lens ou faça upload manual.';
  }else if(file){
    if(note)note.textContent='O arquivo '+file.name+' está apenas neste computador. Por segurança, o navegador não permite transferi-lo automaticamente ao Google Lens. Selecione-o novamente no Lens ou informe acima uma URL pública direta da imagem.';
  }else{alert('Selecione uma imagem local ou informe a URL pública direta da imagem.');return}
  const w=window.open(url,'_blank','noopener,noreferrer');if(!w)alert('O navegador bloqueou a nova aba. Libere pop-ups e tente novamente.');
});
 q('refGoogle').addEventListener('click',()=>openSearch(false,false));q('refGoogleImage').addEventListener('click',()=>openSearch(true,false));q('refGoogleLink').addEventListener('click',()=>openSearch(false,true));
 q('refImage').addEventListener('change',e=>{const f=e.target.files[0];const out=q('refPreview');out.textContent='';if(!f)return;if(!f.type.startsWith('image/')){out.textContent='Selecione uma imagem válida.';return}const img=document.createElement('img');img.style.cssText='max-width:230px;max-height:170px;object-fit:contain;border:1px solid #ddd;border-radius:8px';img.src=URL.createObjectURL(f);img.onload=()=>URL.revokeObjectURL(img.src);out.append(img);const t=document.createElement('div');t.textContent='Imagem selecionada: '+f.name+' (não analisada automaticamente)';out.append(t)});
 q('refSuggest').addEventListener('click',()=>{const term=q('refTerm').value.trim();if(!term){alert('Informe a nomenclatura de mercado.');return}const ranked=catalog.map(x=>({x,n:score(x,term)})).sort((a,b)=>b.n-a.n)[0];q('refProposedName').value=term.replace(/\s+/g,' ').trim();if(ranked&&ranked.n>=50){q('refGroup').value=ranked.x.g||ranked.x.group||ranked.x.stage||'';if([...q('refUnit').options].some(o=>o.value===ranked.x.u))q('refUnit').value=ranked.x.u;q('refDetail').value='Conferir características técnicas com o cadastro '+(ranked.x.c||'')+': '+(ranked.x.d||'')+'. Não copiar especificações sem validação.'}else q('refDetail').value='Confirmar material, dimensões, acabamento, norma técnica, aplicação e fabricante antes do cadastro.'});
 function render(){q('refProposals').innerHTML='<b>Propostas locais: '+proposals.length+'</b>'+proposals.slice().reverse().slice(0,20).map(p=>`<div style="padding:9px 0;border-bottom:1px solid #ddd"><b>${safe(p.name)}</b> · ${safe(p.unit)} · ${safe(p.group)}<div class="small muted">${safe(p.detail)} · ${safe(p.date)}</div></div>`).join('')}
 q('refSave').addEventListener('click',async()=>{const name=q('refProposedName').value.trim();if(!name){alert('Informe a descrição proposta.');return}const p={id:crypto.randomUUID(),name,unit:q('refUnit').value,group:q('refGroup').value.trim(),detail:q('refDetail').value.trim(),marketTerm:q('refTerm').value.trim(),sourceUrl:q('refLink').value.trim(),date:new Date().toISOString(),status:'Pendente de validação Sienge'};proposals.push(p);await LupemaCloud.write('lupemaReferenceProposalsV1',proposals);render();alert('Proposta salva para conferência. Não foi criado um código no Sienge.')});
 q('refExport').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({schema:'lupema-reference-proposals-v1',proposals},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='lupema_propostas_insumos.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});render();
window.addEventListener('lupema:changed',e=>{if(e.detail.reason==='profiles')return;proposals=LupemaCloud.read('lupemaReferenceProposalsV1',[]);render();});
})();
