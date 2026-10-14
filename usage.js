(function () {
  'use strict';
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
  async function record(view) {
    data.accesses.push({id: crypto.randomUUID(), userId: current, view, at: new Date().toISOString()});
    try { await save({quiet: true}); } catch { /* O indicador informa a falha; nenhuma confirmação falsa. */ }
  }
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
