/* Indicadores de adoção: eventos de navegação, não monitoramento de tempo. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LupemaMetrics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function day(value) {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isFinite(+date) ? date.toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'}) : '';
  }
  function week(value) {
    const date = new Date(day(value) + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    return date.toISOString().slice(0, 10);
  }
  function summarize(data, members, filter) {
    const users = members.filter(u => (!filter.dept || u.dept === filter.dept) && (!filter.work || u.work === filter.work) && (!filter.userId || u.id === filter.userId));
    const ids = new Set(users.map(u => u.id));
    const within = r => { const d = day(r.at || r.createdAt || r.date); return ids.has(r.userId) && d && d >= filter.start && d <= filter.end; };
    const unique = rows => [...new Map((rows || []).filter(r => r && r.id).map(r => [r.id, r])).values()];
    const accesses = unique(data.accesses).filter(within), uses = unique(data.uses).filter(within), feedbacks = unique(data.feedbacks).filter(within);
    const all = [...accesses, ...uses, ...feedbacks];
    const active = new Set(all.map(r => r.userId));
    const rows = users.map(user => {
      const events = all.filter(r => r.userId === user.id);
      const a = accesses.filter(r => r.userId === user.id);
      return {...user, active: events.length > 0, recurring: new Set(events.map(r => week(r.at || r.createdAt || r.date))).size >= 2,
        visits: a.filter(r => r.kind !== 'search').length, searches: a.filter(r => r.kind === 'search').length,
        uses: uses.filter(r => r.userId === user.id).length, feedbacks: feedbacks.filter(r => r.userId === user.id).length,
        last: events.map(r => r.at || r.createdAt || r.date).sort().at(-1) || ''};
    });
    const breakdown = field => [...new Set(users.map(u => u[field] || 'Não informado'))].sort().map(label => {
      const group = rows.filter(u => (u[field] || 'Não informado') === label);
      return {label, enabled: group.length, active: group.filter(u => u.active).length};
    });
    const startDate = new Date(filter.start + 'T12:00:00Z'), endDate = new Date(filter.end + 'T12:00:00Z');
    const span = (+endDate - +startDate) / 86400000;
    const grain = span <= 93 ? 'dia' : span <= 1095 ? 'mês' : 'ano';
    const key = value => day(value).slice(0, grain === 'dia' ? 10 : grain === 'mês' ? 7 : 4);
    const buckets = new Map();
    const cursor = new Date(startDate);
    if (grain === 'mês') cursor.setUTCDate(1);
    if (grain === 'ano') { cursor.setUTCMonth(0); cursor.setUTCDate(1); }
    for (; cursor <= endDate;) {
      buckets.set(key(cursor.toISOString()), new Set());
      if (grain === 'dia') cursor.setUTCDate(cursor.getUTCDate() + 1);
      else if (grain === 'mês') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    }
    all.forEach(r => buckets.get(key(r.at || r.createdAt || r.date))?.add(r.userId));
    const trend = [...buckets].map(([label, people]) => ({label, count: people.size}));
    const events = [
      ...accesses.map(r=>({id:'accesses/'+r.id,userId:r.userId,at:r.at,view:r.view,kind:r.kind==='search'?'search':r.view==='entrada'?'opening':'navigation',record:r})),
      ...uses.map(r=>({id:'uses/'+r.id,userId:r.userId,at:r.createdAt||r.date,view:'usage',kind:'use',record:r})),
      ...feedbacks.map(r=>({id:'feedbacks/'+r.id,userId:r.userId,at:r.at,view:r.panel,kind:'feedback',record:r}))
    ].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    const firstRecorded = [...unique(data.accesses),...unique(data.uses),...unique(data.feedbacks)].filter(r=>ids.has(r.userId)).map(r=>day(r.at||r.createdAt||r.date)).filter(Boolean).sort()[0] || '';
    return {events, firstRecorded, trend, grain, rows, enabled: users.length, active: active.size, adoption: users.length ? active.size / users.length * 100 : null,
      recurring: rows.filter(u => u.recurring).length, visits: accesses.filter(r => r.kind !== 'search').length,
      searches: accesses.filter(r => r.kind === 'search').length, uses: uses.length, feedbacks: feedbacks.length,
      departments: breakdown('dept'), works: breakdown('work'),
      panels: [...new Set(accesses.map(r => r.view))].filter(Boolean).map(label => ({label, count: accesses.filter(r => r.view === label).length})).sort((a,b) => b.count-a.count),
      stages: ['cotacao','pedido','contrato'].map(label => ({label, count: uses.filter(r => r.stage === label).length})),
      evidence: uses.length ? uses.filter(r => String(r.number || '').trim() && String(r.work || '').trim()).length / uses.length * 100 : null};
  }
  function csv(rows) {
    const cell = value => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    return '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n');
  }
  function details(report, query = {}) {
    const people = new Map(report.rows.map(u=>[u.id,u]));
    const person = id => people.get(id);
    const matchUser = u => u && (!query.userId || u.id===query.userId) && (!query.dept || (u.dept||'Não informado')===query.dept) && (!query.work || (u.work||'Não informado')===query.work);
    const events = report.events.filter(e => matchUser(person(e.userId)) &&
      (!query.kind || e.kind===query.kind || query.kind==='consultation' && ['opening','navigation','search'].includes(e.kind)) &&
      (!query.view || e.view===query.view) && (!query.stage || e.record.stage===query.stage) &&
      (!query.bucket || day(e.at).startsWith(query.bucket)));
    if (query.mode !== 'people') return events.map(e=>({...e,person:person(e.userId)}));
    return report.rows.filter(u=>matchUser(u) && (query.active===undefined || u.active===query.active) &&
      (!query.recurring || u.recurring) && (!query.bucket || events.some(e=>e.userId===u.id)));
  }
  return {day, summarize, csv, details};
});
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const KEY = 'lupemaUsageControlV1';
  const $ = id => document.getElementById(id);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const empty = () => ({users: [], accesses: [], uses: [], feedbacks: []});
  let data = LupemaCloud.read(KEY, empty());
  const current = LupemaCloud.user.id;
  const supplierKey = row => String(row.document || '').replace(/\D/g, '') || String(row.name || '').trim().toLocaleLowerCase('pt-BR');
  const supplierName = row => row.tradeName || row.name || row.document || 'Sem identificação';
  const leads = () => LupemaCloud.read('lupemaLeads', []);
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
  async function save(options) { await LupemaCloud.write(KEY, data, options); }
  function render() {
    data.users = LupemaCloud.members;
    const me = data.users.find(row => row.id === current);
    const selectedSupplier = $('usageSupplier').value;
    $('usageUser').innerHTML = '<option value="' + esc(current) + '">' + esc(me?.name) + ' · ' + esc(me?.dept) + '</option>';
    $('usageUser').disabled = true;
    $('usageCurrentLabel').textContent = 'Em operação: ' + (me?.name || 'Usuário autenticado');
    $('usageSupplier').innerHTML = '<option value="">Selecione um prospectado</option>' + leads().map(row =>
      '<option value="' + esc(supplierKey(row)) + '">' + esc(supplierName(row)) + ' · ' + esc(row.document || 'Sem documento') + '</option>').join('');
    $('usageSupplier').value = selectedSupplier;
    for (const [id, value] of [['usageNewName', me?.name], ['usageNewDept', me?.dept], ['usageNewWork', me?.work]]) {
      $(id).value = value || ''; $(id).readOnly = true;
    }
    $('usageAddUser').disabled = true;
    $('usageAddUser').title = 'Os acessos são liberados pelo responsável pelo sistema.';
    $('usageUsersCount').textContent = data.users.length;
    $('usageAccessCount').textContent = data.accesses.length;
    $('usageUseCount').textContent = data.uses.length;
    $('usageFeedbackCount').textContent = data.feedbacks.length;
    renderMetrics();
    const name = id => data.users.find(row => row.id === id)?.name || 'Usuário histórico';
    const remove = (kind, row) => row.userId === current || LupemaCloud.role === 'admin' ?
      '<button class="btn" data-usage-remove="' + kind + '" data-id="' + esc(row.id) + '">Excluir</button>' : '—';
    $('usageUserRows').innerHTML = data.users.map(row => {
      const accesses = data.accesses.filter(x => x.userId === row.id);
      return '<tr><td><b>' + esc(row.name) + '</b><div class="small muted">' + esc(row.dept) + ' · ' + esc(row.work) +
        '</div><div class="small muted">' + esc(row.email) + ' · ' + esc(row.phone) + '</div></td><td>' + accesses.length +
        '</td><td>' + data.uses.filter(x => x.userId === row.id).length + '</td><td>' + data.feedbacks.filter(x => x.userId === row.id).length +
        '</td><td>' + esc(accesses.length ? new Date(accesses[accesses.length - 1].at).toLocaleString('pt-BR') : '—') + '</td></tr>';
    }).join('');
    $('usageUseRows').innerHTML = data.uses.slice().reverse().map(row => '<tr><td>' + esc(row.date) +
      '<div class="small muted">' + esc(name(row.userId)) + '</div></td><td>' + esc(row.supplier) +
      '<div class="small muted">' + esc(row.document) + '</div></td><td>' + esc(row.stage) + ' · ' + esc(row.situation) +
      '</td><td>' + esc(row.work || '—') + '<div class="small muted">' + esc(row.number) + '</div></td><td>' + remove('uses', row) + '</td></tr>').join('') || '<tr><td colspan="5">Nenhum registro de utilização.</td></tr>';
    $('usageFeedbackRows').innerHTML = data.feedbacks.slice().reverse().map(row => '<tr><td>' +
      esc(new Date(row.at).toLocaleDateString('pt-BR')) + '<div class="small muted">' + esc(name(row.userId)) +
      '</div></td><td>' + esc(row.panel) + '<div class="small muted">' + esc(row.type) + ' · ' + esc(row.priority) +
      '</div></td><td>' + esc(row.rating || '—') + '</td><td>' + esc(row.text) + '</td><td>' + remove('feedbacks', row) + '</td></tr>').join('') || '<tr><td colspan="5">Nenhum feedback registrado.</td></tr>';
  }
  async function record(view, kind = 'navigation') {
    data.accesses.push({id: crypto.randomUUID(), userId: current, view, kind, at: new Date().toISOString()});
    try { await save({quiet: true}); } catch { /* O indicador informa a falha; nenhuma confirmação falsa. */ }
  }
  const metricFilter = () => ({start: $('metricStart').value, end: $('metricEnd').value, dept: $('metricDept').value, work: $('metricWork').value, userId: $('metricUser').value});
  let report = null;
  const panelNames = Object.fromEntries([...document.querySelectorAll('.nav-btn')].map(b => [b.dataset.view, b.textContent.trim()]));
  panelNames.entrada = 'Abertura da base';
  function renderMetrics() {
    for (const [id, field] of [['metricDept','dept'],['metricWork','work']]) {
      const selected = $(id).value;
      $(id).innerHTML = '<option value="">Todos</option>' + [...new Set(LupemaCloud.members.map(u => u[field]).filter(Boolean))].sort().map(v => '<option>' + esc(v) + '</option>').join('');
      $(id).value = selected;
    }
    const chosen = $('metricUser').value;
    const available = LupemaCloud.members.filter(u => (!$('metricDept').value || u.dept === $('metricDept').value) && (!$('metricWork').value || u.work === $('metricWork').value));
    $('metricUser').innerHTML = '<option value="">Todos os usuários</option>' + available.map(u => '<option value="'+esc(u.id)+'">'+esc(u.name)+' · '+esc(u.dept || 'Setor não informado')+'</option>').join('');
    $('metricUser').value = available.some(u => u.id === chosen) ? chosen : '';
    const f = metricFilter();
    const valid = f.start && f.end && f.start <= f.end;
    $('metricError').textContent = valid ? '' : 'Informe um período válido, com início anterior ou igual ao fim.';
    $('metricReport').hidden = !valid; $('metricCsv').disabled = !valid;
    syncDashboardFilters();
    $('dashboardError').textContent = $('metricError').textContent;
    $('dashboardReport').hidden = !valid;
    $('dashboardCsv').disabled = !valid;
    $('dashboardPrint').disabled = !valid;
    if (!valid) { report = null; closeDetail(); return; }
    report = LupemaMetrics.summarize(data, LupemaCloud.members, f);
    const pct = v => v === null ? '—' : v.toLocaleString('pt-BR', {maximumFractionDigits:1}) + '%';
    $('metricAdoption').textContent = pct(report.adoption);
    $('metricActive').textContent = report.active + ' de ' + report.enabled + ' autorizados';
    $('metricRecurring').textContent = report.recurring;
    $('metricSearches').textContent = report.searches;
    $('metricContributions').textContent = report.uses + report.feedbacks;
    $('metricEvidence').textContent = pct(report.evidence);
    $('metricUsers').innerHTML = report.rows.map(u => '<tr><td>' + esc(u.name) + '<div class="small muted">' + esc(u.dept) + ' · ' + esc(u.work) + '</div></td><td>' + (u.active ? 'Sim' : 'Não') + '</td><td>' + u.visits + '</td><td>' + u.searches + '</td><td>' + u.uses + ' / ' + u.feedbacks + '</td><td>' + (u.last ? esc(new Date(u.last).toLocaleString('pt-BR')) : '—') + '</td></tr>').join('') || '<tr><td colspan="6">Nenhum usuário neste recorte.</td></tr>';
    const groups = (id, rows) => { $(id).innerHTML = rows.map(r => '<tr><td>' + esc(r.label) + '</td><td>' + r.active + ' / ' + r.enabled + '</td><td>' + pct(r.active / r.enabled * 100) + '</td></tr>').join('') || '<tr><td colspan="3">Sem dados.</td></tr>'; };
    groups('metricDepartments', report.departments); groups('metricWorks', report.works);
    $('metricPanels').innerHTML = report.panels.map(r => '<tr><td>' + esc(panelNames[r.label] || r.label) + '</td><td>' + r.count + '</td></tr>').join('') || '<tr><td colspan="2">Sem eventos no período.</td></tr>';
    renderDashboard();
    $('metricStages').textContent = report.stages.map(r => ({cotacao:'Cotações',pedido:'Pedidos',contrato:'Contratos'}[r.label]) + ': ' + r.count).join(' · ');
  }
  let detailState = null, detailStack = [], detailPage = 0;
  const detailLimit = 100;
  const actionNames = {opening:'Abriu a base (nova abertura ou sessão retomada)',navigation:'Abriu um painel',search:'Realizou uma ação de pesquisa',use:'Registrou uma utilização declarada',feedback:'Registrou um feedback'};
  function drillButton(value, query, title) {
    if (!query) return '<strong>'+esc(value)+'</strong>';
    return '<button type="button" class="exec-drill" data-exec-query="'+esc(JSON.stringify(query))+'" data-exec-title="'+esc(title||'Detalhamento')+'" title="Clique para ver quem e quais registros compõem este número">'+esc(value)+'<span aria-hidden="true"> ↗</span></button>';
  }
  function stamp(at) { return /^\d{4}-\d{2}-\d{2}$/.test(at||'') ? at.split('-').reverse().join('/')+' (sem horário registrado)' : new Date(at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}); }
  function closeDetail() { if ($('execDetail').open) { if ($('execDetail').close) $('execDetail').close(); else $('execDetail').removeAttribute('open'); } detailState=null; detailStack=[]; }
  function openDetail(query,title,child=false) {
    if (!report) return;
    if (child && detailState) detailStack.push(detailState); else detailStack=[];
    detailState={query,title}; detailPage=0;
    renderDetail();
    if (!$('execDetail').open) { if ($('execDetail').showModal) $('execDetail').showModal(); else $('execDetail').setAttribute('open',''); }
  }
  function renderDetail() {
    if (!report || !detailState) return;
    const {query,title}=detailState, rows=LupemaMetrics.details(report,query), people=query.mode==='people';
    const page=rows.slice(detailPage*detailLimit,(detailPage+1)*detailLimit);
    $('execDetailTitle').textContent=title;
    const explanation=people ? (!query.bucket && query.active===undefined && !query.recurring ? rows.filter(u=>u.active).length+' pessoas com registro de uso ÷ '+rows.length+' pessoas autorizadas neste grupo. ' : 'Cada pessoa é contada uma única vez; clique em registros para conferir suas ações. ') : 'Cada linha corresponde a uma ação registrada; a mesma pessoa pode aparecer várias vezes. ';
    $('execDetailExplain').textContent=explanation+rows.length+' '+(people?'pessoa(s)':'registro(s)')+' que compõem este número. '+$('dashboardScope').textContent+'. Horários de Brasília.';
    $('execDetailBack').hidden=!detailStack.length;
    $('execDetailHead').innerHTML=people?'<tr><th>Nome</th><th>Setor</th><th>Obra</th><th>Registros que explicam a participação</th></tr>':'<tr><th>Data e horário</th><th>Nome</th><th>Setor</th><th>O que fez</th><th>Painel / referência</th></tr>';
    $('execDetailRows').innerHTML=page.map(row=>{
      if (people) { const next={...query,mode:'events',userId:row.id}; delete next.active; delete next.recurring; const count=LupemaMetrics.details(report,next).length; return '<tr><td>'+esc(row.name)+'</td><td>'+esc(row.dept||'Não informado')+'</td><td>'+esc(row.work||'Não informada')+'</td><td>'+drillButton(count+' registros',next,'Registros de '+row.name+' · '+(row.dept||'Não informado'))+'</td></tr>'; }
      const ref=row.kind==='use' ? (row.record.supplier||'Fornecedor não informado')+' · '+({cotacao:'Cotação',pedido:'Pedido',contrato:'Contrato'}[row.record.stage]||row.record.stage||'')+' · Referência: '+(row.record.number||'Não informada') : panelNames[row.view]||row.view||'Não informado';
      return '<tr><td>'+esc(stamp(row.at))+'</td><td>'+esc(row.person.name)+'</td><td>'+esc(row.person.dept||'Não informado')+'</td><td>'+esc(actionNames[row.kind]||row.kind)+'</td><td>'+esc(ref)+'</td></tr>';
    }).join('') || '<tr><td colspan="5">Nenhum registro neste recorte. Isso não indica presença online nem comprova ausência de uso antes do início da coleta.</td></tr>';
    $('execDetailPage').textContent=rows.length ? (detailPage*detailLimit+1)+'–'+Math.min((detailPage+1)*detailLimit,rows.length)+' de '+rows.length : '0 registros';
    $('execDetailPrev').disabled=detailPage===0; $('execDetailNext').disabled=(detailPage+1)*detailLimit>=rows.length;
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-exec-query]'); if (!button) return;
    openDetail(JSON.parse(button.dataset.execQuery),button.dataset.execTitle,!!button.closest('#execDetail'));
  });
  document.addEventListener('keydown',event=>{
    const point=event.target.closest('[data-exec-query]');
    if (point && point.tagName.toLowerCase()==='circle' && ['Enter',' '].includes(event.key)) {event.preventDefault(); point.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
  });
  $('execDetailClose').addEventListener('click',closeDetail);
  $('execDetail').addEventListener('close',()=>{detailState=null;detailStack=[];});
  $('execDetailBack').addEventListener('click',()=>{detailState=detailStack.pop();detailPage=0;renderDetail();});
  $('execDetailPrev').addEventListener('click',()=>{detailPage--;renderDetail();});
  $('execDetailNext').addEventListener('click',()=>{detailPage++;renderDetail();});
  const cardQueries={execActive:{mode:'people',active:true},execAdoption:{mode:'people'},execRecurring:{mode:'people',recurring:true},execSearches:{kind:'search'},execUses:{kind:'use'}};
  for (const [id,query] of Object.entries(cardQueries)) $(id).addEventListener('click',()=>openDetail(query,$(id).closest('article').querySelector('span').textContent));
  function syncDashboardFilters() {
    for (const suffix of ['Start','End','Dept','Work','User']) {
      if (suffix === 'Dept' || suffix === 'Work' || suffix === 'User') $('dashboard'+suffix).innerHTML = $('metric'+suffix).innerHTML;
      $('dashboard'+suffix).value = $('metric'+suffix).value;
    }
  }
  function chartTable(rows, label) {
    return '<details class="exec-data"><summary>Ver dados do gráfico</summary><div class="table-wrap"><table class="table"><thead><tr><th>Categoria</th><th>' + esc(label) + '</th></tr></thead><tbody>' + rows.map(r => '<tr><td>'+esc(r.label)+'</td><td>'+(r.query?drillButton(r.value,r.query,r.label):esc(r.value))+'</td></tr>').join('') + '</tbody></table></div></details>';
  }
  function bars(id, rows, percent = false) {
    const max = percent ? 100 : Math.max(1,...rows.map(r=>r.count));
    const fmt = n => n.toLocaleString('pt-BR',{maximumFractionDigits:1}) + (percent?'%':'');
    $(id).innerHTML = rows.length ? '<div class="exec-bars">' + rows.map(r=>'<div class="exec-bar-row"><div class="exec-bar-label"><span>'+esc(r.label)+'</span>'+drillButton(fmt(r.count),r.query,r.label)+'</div><div class="exec-track"><div style="width:'+Math.min(100,Math.max(0,r.count/max*100))+'%"></div></div>'+(r.note?'<small>'+esc(r.note)+'</small>':'')+'</div>').join('') + '</div>' + chartTable(rows.map(r=>({label:r.label,value:fmt(r.count)+(r.note?' · '+r.note:''),query:r.query})),percent?'Adesão':'Eventos') : '<p class="exec-empty">Sem dados neste recorte.</p>';
  }
  function renderDashboard() {
    const f = metricFilter(), pct = n => n === null ? '—' : n.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
    $('dashboardScope').textContent = new Date(f.start+'T12:00:00').toLocaleDateString('pt-BR')+' a '+new Date(f.end+'T12:00:00').toLocaleDateString('pt-BR')+' · '+(f.dept||'Todos os setores')+' · '+(f.work||'Todas as obras')+' · '+(LupemaCloud.members.find(u=>u.id===f.userId)?.name || 'Todos os usuários');
    const me = LupemaCloud.user;
    $('dashboardIdentity').textContent = 'Você está conectado como '+(me.name || 'Usuário identificado')+' · Setor: '+(me.dept || 'Não informado')+' · Obra: '+(me.work || 'Não informada');
    $('execUserRows').innerHTML = report.rows.map(u => '<tr><td><strong>'+esc(u.name)+'</strong></td><td><span class="exec-sector">'+esc(u.dept || 'Não informado')+'</span></td><td>'+esc(u.work || 'Não informada')+'</td><td><span class="exec-status '+(u.active?'is-active':'is-inactive')+'">'+(u.active?'Com atividade':'Sem atividade')+'</span></td><td>'+u.visits+'</td><td>'+u.searches+'</td><td>'+u.uses+'</td><td>'+u.feedbacks+'</td><td>'+(u.last?esc(new Date(u.last).toLocaleString('pt-BR')):'Sem registro no período')+'</td></tr>').join('') || '<tr><td colspan="9">Nenhum usuário neste recorte.</td></tr>';
    bars('execPeople',report.rows.slice().sort((a,b)=>(b.visits+b.searches)-(a.visits+a.searches)).map(u=>({label:(u.name || 'Sem nome')+' · '+(u.dept || 'Setor não informado'),count:u.visits+u.searches,note:'Ações registradas: a mesma pessoa pode realizar várias.',query:{userId:u.id,kind:'consultation'}})));
    $('execActive').textContent=report.active;
    $('execAdoption').textContent=pct(report.adoption);
    $('execRecurring').textContent=report.recurring;
    $('execSearches').textContent=report.searches;
    $('execUses').textContent=report.uses;
    $('execBase').textContent=report.enabled+' colaboradores atualmente autorizados no recorte';
    const inactive=report.enabled-report.active, percentage=report.adoption||0;
    $('execParticipation').innerHTML=report.enabled?'<div class="exec-participation"><div class="exec-donut" role="group" aria-label="'+report.active+' pessoas utilizaram a base entre '+report.enabled+' autorizadas" style="background:conic-gradient(#147653 0% '+percentage+'%,#f5b857 '+percentage+'% 100%)"><div>'+drillButton(pct(report.adoption),{mode:'people'},'Pessoas autorizadas e participação')+'<span>usaram a base</span></div></div><div><p>'+drillButton(report.active+' pessoas utilizaram',{mode:'people',active:true},'Quem utilizou a base')+'</p><p>'+drillButton(inactive+' sem registro de uso',{mode:'people',active:false},'Pessoas sem registro de uso no período')+'</p></div></div><div class="exec-roster">'+report.departments.map(d=>'<div><b>'+esc(d.label)+'</b><p>'+d.active+' de '+d.enabled+' pessoas utilizaram a base</p>'+report.rows.filter(u=>(u.dept||'Não informado')===d.label).map(u=>drillButton(u.name+' · '+(u.active?'utilizou':'sem registro'),{userId:u.id},'Registros de '+u.name+' · '+d.label)).join(' ')+'</div>').join('')+'</div>':'<p class="exec-empty">Nenhum colaborador neste recorte.</p>';
    bars('execDepartments',report.departments.map(r=>({label:r.label,count:r.active/r.enabled*100,note:r.active+' de '+r.enabled+' colaboradores',query:{mode:'people',dept:r.label}})),true);
    bars('execWorks',report.works.map(r=>({label:r.label,count:r.active/r.enabled*100,note:r.active+' de '+r.enabled+' colaboradores',query:{mode:'people',work:r.label}})),true);
    bars('execPanels',report.panels.map(r=>({label:panelNames[r.label]||r.label,count:r.count,query:{view:r.label,kind:'consultation'}})));
    bars('execStages',report.stages.map(r=>({label:{cotacao:'Cotações',pedido:'Pedidos',contrato:'Contratos'}[r.label],count:r.count,query:{kind:'use',stage:r.label}})));
    const points=report.trend, high=Math.max(1,...points.map(r=>r.count)), w=640,h=230,left=40,top=28,bottom=188;
    const x=i=>left+(w-left-18)*(points.length===1?.5:i/(points.length-1));
    const y=n=>bottom-(bottom-top)*n/high;
    const formatBucket=label=>label.length===10?label.slice(8)+'/'+label.slice(5,7)+'/'+label.slice(0,4):label.length===7?label.slice(5)+'/'+label.slice(0,4):label;
    const colors=['#2563a6','#7553a6','#127e89','#b87813','#15734e','#ac4769'];
    const historyKey=report.firstRecorded.slice(0,report.grain==='dia'?10:report.grain==='mês'?7:4);
    const peopleById=new Map(report.rows.map(u=>[u.id,u]));
    const periodPeople=new Map();
    report.events.forEach(e=>{const bucket=LupemaMetrics.day(e.at).slice(0,report.grain==='dia'?10:report.grain==='mês'?7:4),dept=peopleById.get(e.userId)?.dept||'Não informado',key=JSON.stringify([bucket,dept]); if(!periodPeople.has(key)) periodPeople.set(key,new Set()); periodPeople.get(key).add(e.userId);});
    const idsAt=(bucket,dept)=>periodPeople.get(JSON.stringify([bucket,dept]))||new Set();
    const series=report.departments.map((dept,index)=>({label:dept.label,color:colors[index%colors.length],points:points.map(p=>({label:p.label,count:idsAt(p.label,dept.label).size}))}));
    const ticks=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
    $('execTrendNote').textContent='Cada linha representa um setor. O número indica pessoas diferentes que utilizaram a base por '+report.grain+', mesmo que tenham realizado várias ações. Clique em um ponto ou na tabela para ver os nomes e os registros.';
    const legend='<div class="exec-legend">'+series.map(r=>'<span><i style="background:'+r.color+'"></i>'+esc(r.label)+'</span>').join('')+'</div>';
    const paths=series.map(r=>'<polyline fill="none" stroke="'+r.color+'" stroke-width="3" points="'+r.points.map((p,i)=>({p,i})).filter(({p})=>historyKey&&p.label>=historyKey).map(({p,i})=>x(i)+','+y(p.count)).join(' ')+'"/>'+r.points.map((p,i)=>p.count?'<circle role="button" tabindex="0" aria-label="'+esc(r.label+' · '+formatBucket(p.label)+' · '+p.count+' pessoas: ver detalhes')+'" data-exec-query="'+esc(JSON.stringify({mode:'people',dept:r.label,bucket:p.label}))+'" data-exec-title="'+esc(r.label+' · '+formatBucket(p.label))+'" cx="'+x(i)+'" cy="'+y(p.count)+'" r="6" fill="'+r.color+'"><title>'+esc(r.label)+' · '+formatBucket(p.label)+': '+p.count+' pessoas; clique para ver nomes</title></circle>':'').join('')).join('');
    const trendRows=series.flatMap(r=>r.points.filter(p=>p.count).map(p=>({label:p.label,dept:r.label,count:p.count,people:report.rows.filter(u=>idsAt(p.label,r.label).has(u.id))}))).sort((a,b)=>b.label.localeCompare(a.label));
    const table='<div class="table-wrap"><table class="table"><thead><tr><th>Data / período</th><th>Setor</th><th>Pessoas que utilizaram</th><th>Nomes</th></tr></thead><tbody>'+trendRows.map(r=>'<tr><td>'+esc(formatBucket(r.label))+'</td><td>'+esc(r.dept)+'</td><td>'+drillButton(r.count+' pessoas',{mode:'people',dept:r.dept,bucket:r.label},r.dept+' · '+formatBucket(r.label))+'</td><td>'+r.people.map(u=>drillButton(u.name,{userId:u.id,bucket:r.label},u.name+' · '+formatBucket(r.label))).join(' ')+'</td></tr>').join('')+'</tbody></table></div>';
    $('execTrend').innerHTML=trendRows.length ? legend+'<svg viewBox="0 0 '+w+' '+h+'" role="group" aria-label="Pessoas que utilizaram a base por setor e por '+report.grain+'" class="exec-line"><title>Pessoas que utilizaram a base por setor</title><text x="'+left+'" y="14">Pessoas</text>'+[0,high].map(n=>'<line x1="'+left+'" x2="'+(w-18)+'" y1="'+y(n)+'" y2="'+y(n)+'" stroke="#dce5df"/><text x="'+(left-8)+'" y="'+(y(n)+4)+'" text-anchor="end">'+n+'</text>').join('')+paths+ticks.map(i=>'<text x="'+x(i)+'" y="218" text-anchor="'+(i===0?'start':i===points.length-1?'end':'middle')+'">'+esc(formatBucket(points[i].label))+'</text>').join('')+'</svg>'+table+'<p class="small muted">A tabela mostra os períodos com registros. Primeiro registro disponível para os usuários deste recorte: '+esc(formatBucket(report.firstRecorded))+'. Antes disso não há histórico suficiente para afirmar que ninguém utilizou a base.</p>' : '<p class="exec-empty">Não há registros de utilização neste período para os usuários selecionados. Não é possível apresentar uma evolução sem registros.</p>';
    if (detailState && $('execDetail').open) renderDetail();
    $('execSummary').textContent=report.enabled ? report.active+' de '+report.enabled+' colaboradores tiveram atividade. '+report.recurring+' utilizaram a base em pelo menos duas semanas distintas. Foram registradas '+report.searches+' ações de pesquisa e '+report.uses+' utilizações declaradas.' : 'Nenhum usuário autorizado corresponde aos filtros selecionados.';
    $('execUpdated').textContent='Quadro calculado às '+new Date().toLocaleTimeString('pt-BR')+' · Dados compartilhados carregados nesta sessão';
  }
  for (const suffix of ['Start','End','Dept','Work','User']) $('dashboard'+suffix).addEventListener('change',()=>{ $('metric'+suffix).value=$('dashboard'+suffix).value; closeDetail(); renderMetrics(); });
  $('dashboardCsv').addEventListener('click',()=>$('metricCsv').click());
  $('dashboardPrint').addEventListener('click',()=>window.print());
  const end = today(), start = new Date(end + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate()-29);
  $('metricStart').value = start.toISOString().slice(0,10); $('metricEnd').value = end;
  for (const id of ['metricStart','metricEnd','metricDept','metricWork','metricUser']) $(id).addEventListener('change', ()=>{closeDetail();renderMetrics();});
  $('metricCsv').addEventListener('click', () => {
    if (!report) return;
    const f = metricFilter();
    const rows = [['Início','Fim','Nome','Setor','Obra','Ativo no período','Recorrente em 2 semanas','Entradas e navegações','Pesquisas','Utilizações declaradas','Feedbacks','Última atividade no período']];
    report.rows.forEach(u => rows.push([f.start,f.end,u.name,u.dept,u.work,u.active?'Sim':'Não',u.recurring?'Sim':'Não',u.visits,u.searches,u.uses,u.feedbacks,u.last]));
    const url = URL.createObjectURL(new Blob([LupemaMetrics.csv(rows)],{type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download='LUPEMA_INDICADORES_'+f.start+'_'+f.end+'.csv'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  // Contabiliza ações após pausa; nunca persiste texto, documento ou filtro digitado.
  const timers = new Map();
  const searchIds = ['topSearch','iItemSearch','iCreditorClass','lServiceSearch','lScopeSearch','cScopeSearch','cItemSearch','q','leadSearch','leadClassFilter','leadItemFilter'];
  for (const id of searchIds) {
    const field = $(id); if (!field) continue;
    field.addEventListener('input', () => {
      clearTimeout(timers.get(id));
      if (!field.value.trim()) return;
      const view = field.closest('.view')?.id.replace('view-','') || 'global';
      timers.set(id,setTimeout(() => { if (field.value.trim()) record(view,'search'); },1500));
    });
  }
  $('refSearch')?.addEventListener('click', () => record('reference','search'));
  $('usageEditUser').addEventListener('click', async () => {
    const email = $('usageNewEmail').value.trim().toLowerCase(), phone = $('usageNewPhone').value.trim();
    if (!email && !phone) { alert('Preencha o e-mail e/ou telefone de contato.'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Informe um e-mail válido.'); return; }
    if (phone && phone.replace(/\D/g, '').length < 10) { alert('Informe telefone com DDD.'); return; }
    const me = LupemaCloud.user;
    try {
      await LupemaCloud.updateContact(email || me.email || '', phone || me.phone || '');
      $('usageNewEmail').value = ''; $('usageNewPhone').value = '';
      alert('Contato atualizado para a equipe. Seu e-mail de login permanece o mesmo.');
    } catch { alert('Não foi possível confirmar a atualização. Tente novamente.'); }
  });
  $('usageUseForm').addEventListener('submit', async event => {
    event.preventDefault();
    const supplier = leads().find(row => supplierKey(row) === $('usageSupplier').value);
    if (!supplier || !$('usageDate').value) { alert('Selecione um fornecedor e informe a data.'); return; }
    data.uses.push({id: crypto.randomUUID(), userId: current, supplierKey: supplierKey(supplier), supplier: supplierName(supplier),
      document: supplier.document || '', stage: $('usageStage').value, situation: $('usageSituation').value,
      date: $('usageDate').value, work: $('usageWork').value.trim(), number: $('usageNumber').value.trim(),
      notes: $('usageNotes').value.trim(), createdAt: new Date().toISOString(), source: 'Declaração manual; não verificada no Sienge'});
    await save(); event.target.reset(); $('usageDate').value = today(); render();
    alert('Utilização compartilhada com a equipe. Pendente de conferência no Sienge.');
  });
  $('usageFeedbackForm').addEventListener('submit', async event => {
    event.preventDefault();
    const text = $('usageFeedbackText').value.trim();
    if (!text) { alert('Descreva o feedback.'); return; }
    data.feedbacks.push({id: crypto.randomUUID(), userId: current, at: new Date().toISOString(), panel: $('usageFeedbackPanel').value,
      type: $('usageFeedbackType').value, rating: $('usageFeedbackRating').value, priority: $('usageFeedbackPriority').value, text});
    await save(); event.target.reset(); render(); alert('Feedback salvo na base compartilhada.');
  });
  $('view-usage').addEventListener('click', async event => {
    const button = event.target.closest('[data-usage-remove]'); if (!button) return;
    const kind = button.dataset.usageRemove, id = button.dataset.id, row = data[kind]?.find(x => x.id === id);
    if (!row || (row.userId !== current && LupemaCloud.role !== 'admin')) return;
    if (!confirm('Excluir este registro da base compartilhada?')) return;
    data[kind] = data[kind].filter(x => x.id !== id); await save(); render();
  });
  $('usageExport').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({schema: 'lupema-usage-v1', exportedAt: new Date().toISOString(), ...data}, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'LUPEMA_CONTROLE_UTILIZACAO_' + today() + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('usageImport').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup.schema !== 'lupema-usage-v1') throw Error('Arquivo incompatível.');
      if (!confirm('Importar os seus registros para a base compartilhada? A importação não cria contas de acesso.')) return;
      let added = 0, skipped = 0;
      for (const kind of ['accesses', 'uses', 'feedbacks']) {
        if (!Array.isArray(backup[kind])) throw Error('Backup incompleto.');
        const ids = new Set(data[kind].map(row => row.id));
        for (const row of backup[kind]) {
          if (!row?.id || row.userId !== current || ids.has(row.id)) { skipped++; continue; }
          data[kind].push(row); ids.add(row.id); added++;
        }
      }
      await save(); render(); alert(added + ' registro(s) importado(s); ' + skipped + ' ignorado(s) por autoria ou duplicidade.');
    } catch (error) { alert('Importação não confirmada: ' + error.message); }
    finally { event.target.value = ''; }
  });
  window.addEventListener('lupema:changed', () => { data = LupemaCloud.read(KEY, empty()); render(); });
  document.querySelectorAll('.nav-btn').forEach(button => button.addEventListener('click', () => record(button.dataset.view)));
  $('usageDate').value = today(); render(); record('entrada');
})();
