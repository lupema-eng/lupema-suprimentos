(function(){
  'use strict';
  const data=window.LupemaAssistantDataStatus?.();if(!data)return;
  const box=document.createElement('aside');box.id='sourceIntegrationStatus';box.className='small';
  box.style.cssText='margin:12px 0;padding:12px 15px;border:1px solid #b6d7cb;border-radius:9px;background:#eff8f3;color:#204e3b';
  const title=document.createElement('strong'),body=document.createElement('div');
  if(data.sourceAudit&&data.activeScope){
    const audit=data.sourceAudit;title.textContent='Fontes conciliadas · '+String(audit.asOf||'').split('-').reverse().join('/');
    body.textContent=Number(audit.activeSuppliers).toLocaleString('pt-BR')+' credores na lista de ativos indicada pela administradora · '+Number(audit.purchaseOrders).toLocaleString('pt-BR')+' pedidos emitidos analisados. Recomendações excluem cadastros bloqueados/reprovados. Histórico preservado; emissão não comprova entrega. Orçamentos ainda não integrados. Solicitações disponíveis no painel próprio e no Lupinho.';
  }else{
    title.textContent='Atualização dos relatórios ainda não ativada no banco';
    body.textContent='Esta sessão utiliza o histórico anterior. A nova lista de fornecedores ativos e os relatórios conciliados só serão aplicados após a carga privada pelo administrador. A data da interface não representa atualização dos dados.';
  }
  box.append(title,body);const anchor=document.querySelector('#buildDate');
  const panel=document.querySelector('main .content');if(panel)panel.insertBefore(box,panel.firstChild);
  if(anchor)anchor.title=data.activeScope?'Data das fontes carregadas nesta sessão':'A carga dos novos relatórios está pendente';
})();
