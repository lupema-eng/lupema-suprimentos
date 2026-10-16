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
    const users = members.filter(u => (!filter.dept || u.dept === filter.dept) && (!filter.work || u.work === filter.work));
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
    return {rows, enabled: users.length, active: active.size, adoption: users.length ? active.size / users.length * 100 : null,
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
  return {day, summarize, csv};
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
  const metricFilter = () => ({start: $('metricStart').value, end: $('metricEnd').value, dept: $('metricDept').value, work: $('metricWork').value});
  let report = null;
  const panelNames = Object.fromEntries([...document.querySelectorAll('.nav-btn')].map(b => [b.dataset.view, b.textContent.trim()]));
  panelNames.entrada = 'Entrada na plataforma';
  function renderMetrics() {
    for (const [id, field] of [['metricDept','dept'],['metricWork','work']]) {
      const selected = $(id).value;
      $(id).innerHTML = '<option value="">Todos</option>' + [...new Set(LupemaCloud.members.map(u => u[field]).filter(Boolean))].sort().map(v => '<option>' + esc(v) + '</option>').join('');
      $(id).value = selected;
    }
    const f = metricFilter();
    const valid = f.start && f.end && f.start <= f.end;
    $('metricError').textContent = valid ? '' : 'Informe um período válido, com início anterior ou igual ao fim.';
    $('metricReport').hidden = !valid; $('metricCsv').disabled = !valid;
    if (!valid) { report = null; return; }
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
    $('metricStages').textContent = report.stages.map(r => ({cotacao:'Cotações',pedido:'Pedidos',contrato:'Contratos'}[r.label]) + ': ' + r.count).join(' · ');
  }
  const end = today(), start = new Date(end + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate()-29);
  $('metricStart').value = start.toISOString().slice(0,10); $('metricEnd').value = end;
  for (const id of ['metricStart','metricEnd','metricDept','metricWork']) $(id).addEventListener('change', renderMetrics);
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
