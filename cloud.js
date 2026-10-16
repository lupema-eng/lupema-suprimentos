(function () {
  'use strict';
  const config = window.LUPEMA_CONFIG || {};
  const $ = id => document.getElementById(id);
  const gate = $('lupemaGate');
  let session = null, members = [], started = false, loading = false, refreshing = false, reloadRequired = false;
  let refreshPromise = null, lastFailure = null, busyCount = 0;
  const baseUrl = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const key = String(config.publishableKey || '');
  const sessionKey = 'lupema-auth:' + baseUrl;
  const store = new LupemaSync.SharedStore(changes => request('/rest/v1/rpc/lupema_aplicar_alteracoes', {
    method: 'POST', body: JSON.stringify({alteracoes: changes})
  }));
  const profile = row => ({id: row.id, name: row.nome, dept: row.setor, work: row.obra,
    email: row.email_contato, phone: row.telefone, role: row.perfil});
  const gateBrand = gate.querySelector('.lupema-gate-brand')?.outerHTML || '<b>LUPEMA ENGENHARIA</b>';
  gate.innerHTML = '<div class="lupema-gate-card">' + gateBrand +
    '<h1 id="lupemaGateTitle">Suprimentos · Base compartilhada</h1>' +
    '<p class="muted">Entre com seu acesso individual para consultar e cadastrar informações da equipe.</p>' +
    '<form id="cloudLoginForm"><div class="field"><label for="cloudEmail">E-mail</label>' +
    '<input class="input" id="cloudEmail" type="email" autocomplete="username" required></div>' +
    '<div class="field"><label for="cloudPassword">Senha</label><input class="input" id="cloudPassword" type="password" autocomplete="current-password" required></div>' +
    '<p id="cloudLoginError" role="alert" style="color:#a33b36"></p><button class="btn primary" id="cloudLogin" type="submit">Entrar</button></form>' +
    '<p class="small muted">Acesso destinado aos colaboradores autorizados. Solicite a liberação ou a recuperação de senha ao responsável pelo sistema.</p></div>';
  const status = document.createElement('div');
  status.id = 'cloudStatus'; status.className = 'cloud-status'; status.setAttribute('role', 'status');
  status.innerHTML = '<span id="cloudStatusText">Conectando à base compartilhada…</span><button class="btn" type="button" id="cloudRefresh">Atualizar agora</button><button class="btn" type="button" id="cloudRecovery" hidden>Exportar alteração não confirmada</button>';
  document.querySelector('main')?.insertBefore(status, document.querySelector('main .content'));
  const busy = document.createElement('div'); busy.id = 'cloudBusy'; busy.hidden = true;
  busy.setAttribute('role', 'status'); busy.innerHTML = '<div>Gravando na base compartilhada…<br><span class="small muted">Aguarde a confirmação.</span></div>';
  document.body.appendChild(busy);
  function state(message, error = false) {
    $('cloudStatusText').textContent = message;
    status.classList.toggle('cloud-error', error);
  }
  function notify(reason) { window.dispatchEvent(new CustomEvent('lupema:changed', {detail: {reason}})); }
  function validConfig() {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return false;
      if (key.startsWith('sb_secret_')) return false;
      if (key.startsWith('sb_publishable_')) return true;
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.role === 'anon';
    } catch { return false; }
  }
  function saveSession(value) {
    session = value;
    if (value) {
      session.expires_at = value.expires_at || Math.floor(Date.now() / 1000) + value.expires_in;
      try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch { /* Sessão apenas em memória. */ }
    } else { try { sessionStorage.removeItem(sessionKey); } catch { /* Armazenamento indisponível. */ } }
  }
  async function raw(path, options = {}, token = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const headers = {'apikey': key, 'Content-Type': 'application/json', ...(options.headers || {})};
      if (token) headers.Authorization = 'Bearer ' + token;
      const response = await fetch(baseUrl + path, {...options, headers, signal: controller.signal, cache: 'no-store'});
      const content = await response.text();
      let data = null;
      try { data = content ? JSON.parse(content) : null; } catch { throw Error('Resposta inválida do servidor.'); }
      if (!response.ok) {
        const error = Error(data?.message || data?.msg || data?.error_description || 'Falha na comunicação com o servidor.');
        error.status = response.status; error.code = data?.code; throw error;
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  async function refreshSession() {
    if (!session?.refresh_token) throw Object.assign(Error('Entre novamente para continuar.'), {status: 401});
    if (!refreshPromise) refreshPromise = raw('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({refresh_token: session.refresh_token})
    }).then(value => { saveSession(value); }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function request(path, options = {}) {
    if (!session?.access_token) throw Object.assign(Error('Entre novamente para continuar.'), {status: 401});
    if (session.expires_at < Date.now() / 1000 + 45) await refreshSession();
    try { return await raw(path, options, session.access_token); }
    catch (error) {
      if (error.status !== 401) throw error;
      await refreshSession();
      return raw(path, options, session.access_token);
    }
  }
  async function pages(table, columns, extra = '') {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const batch = await request('/rest/v1/' + table + '?select=' + columns + extra + '&limit=500&offset=' + offset);
      if (!Array.isArray(batch)) throw Error('Resposta de dados inválida.');
      rows.push(...batch);
      if (batch.length < 500) return rows;
    }
  }
  async function fetchMembers() {
    const rows = await pages('lupema_membros', 'id,nome,setor,obra,email_contato,telefone,perfil', '&ativo=eq.true&order=id');
    if (!rows.some(row => row.id === session.user.id)) throw Object.assign(Error('Seu acesso ainda não foi liberado para este sistema.'), {code: 'LUPEMA_ACCESS'});
    members = rows.map(profile);
  }
  async function fetchRecords() {
    return pages('lupema_registros', 'colecao,id,dados,revisao,excluido,criado_em,atualizado_em,criado_por,atualizado_por', '&order=colecao,id');
  }
  async function refresh(force = false) {
    if (!started || refreshing || store.pending || (!force && document.hidden)) return;
    refreshing = true;
    try {
      await fetchMembers();
      const rows = await fetchRecords();
      // A edição pode ter começado durante a consulta: nunca substitua a gravação.
      if (store.pending) return;
      const changed = LupemaSync.stable(rows) !== LupemaSync.stable([...store.rows.values()]);
      store.hydrate(rows);
      if (changed) notify('remote'); else notify('profiles');
      if (lastFailure) state('Base atualizada. Há uma alteração sem confirmação; revise o formulário ou exporte a recuperação.', true);
      else state('Base compartilhada · ' + cloud.user.name + ' · Atualizada às ' + new Date().toLocaleTimeString('pt-BR'));
    } catch (error) {
      if (error.code === 'LUPEMA_ACCESS' || error.status === 401) {
        saveSession(null); location.reload(); return;
      }
      state('Sem confirmação de conexão. Os cadastros só serão salvos após resposta do servidor.', true);
    } finally { refreshing = false; }
  }
  function errorMessage(error) {
    if (error.code === 'LUPEMA_READ_ONLY') return error.message;
    if (error.code === '40001') return 'Outro usuário alterou este registro. A base foi atualizada; revise os dados e tente novamente.';
    if (error.code === '23505') return 'Este documento de fornecedor já está cadastrado na base compartilhada.';
    if (error.status === 401 || error.code === 'LUPEMA_ACCESS') return 'Seu acesso precisa ser renovado. Exporte a alteração não confirmada antes de entrar novamente.';
    return 'A gravação não foi confirmada. Confira sua conexão e tente salvar novamente. Os dados digitados no formulário foram mantidos.';
  }
  async function writeMany(values, options = {}) {
    const snapshot = JSON.parse(JSON.stringify(values));
    if (!LupemaSync.canWrite(cloud.role,session?.user?.id,store.changes(snapshot))) {
      const error=Object.assign(Error('Seu perfil permite somente consulta. Os cadastros não foram alterados.'),{code:'LUPEMA_READ_ONLY'});
      if(!options.quiet) alert(error.message);
      throw error;
    }
    if (!options.quiet) { busyCount++; busy.hidden = false; }
    if (!options.quiet || !lastFailure) state('Gravando na base compartilhada…');
    try {
      await store.write(snapshot);
      if (!options.quiet) { lastFailure = null; $('cloudRecovery').hidden = true; }
      notify('saved');
      if (!options.quiet || !lastFailure) state('Gravação confirmada · Disponível para a equipe · ' + new Date().toLocaleTimeString('pt-BR'));
      return true;
    } catch (error) {
      if (error.code === '40001') store.locks.clear();
      if (!options.quiet) { lastFailure = {at: new Date().toISOString(), values: snapshot}; $('cloudRecovery').hidden = false; }
      notify('rollback');
      await refresh(true);
      state(errorMessage(error), true);
      if (!options.quiet) alert(errorMessage(error));
      throw error;
    } finally {
      if (!options.quiet) { busyCount--; busy.hidden = busyCount === 0; }
    }
  }
  const cloud = window.LupemaCloud = {
    get user() { return members.find(row => row.id === session?.user?.id); },
    get members() { return JSON.parse(JSON.stringify(members)); },
    get role() { return cloud.user?.role; },
    get prospectRecords() {
      return [...store.rows.values()].filter(row=>row.colecao==='lupemaLeads').map(row=>({
        id:row.id,name:row.dados?.name||row.dados?.tradeName||'Fornecedor sem nome',
        status:row.excluido?'Excluído':row.dados?.status||'Prospectado',deleted:!!row.excluido,
        origin:row.dados?.registrationOrigin||'unknown',createdBy:row.criado_por||null,createdAt:row.criado_em||null
      }));
    },
    read(collection, fallback = []) { return store.get(collection, fallback); },
    write(collection, value, options) { return writeMany({[collection]: value}, options); },
    writeMany, refresh, lock: (key, id) => store.lock(key, id), unlock: (key, id) => store.unlock(key, id),
    async updateContact(email, phone) {
      const updated = await request('/rest/v1/lupema_membros?id=eq.' + encodeURIComponent(session.user.id), {
        method: 'PATCH', body: JSON.stringify({email_contato: email, telefone: phone}), headers: {Prefer: 'return=representation'}
      });
      if (!Array.isArray(updated) || updated.length !== 1) throw Error('Atualização não confirmada.');
      await fetchMembers(); notify('profiles');
    },
    async logout() {
      if (store.pending) { alert('Aguarde a conclusão da gravação antes de encerrar a sessão.'); return; }
      try { await request('/auth/v1/logout?scope=local', {method: 'POST'}); } catch { /* Saída local mesmo sem rede. */ }
      saveSession(null); location.reload();
    }
  };
  function applyAccessMode() {
    if (cloud.role !== 'leitor') return;
    document.body.classList.add('lupema-reader');
    for (const id of ['quickLeadForm','leadForm','needForm','usageUseForm','usageFeedbackForm']) if($(id)) $(id).hidden=true;
    for (const id of ['refSave','shortlistCreateGroup','usageImport']) if($(id)) $(id).disabled=true;
    document.querySelector('label[for="usageImport"]')?.setAttribute('hidden','');
    const note=document.createElement('p');note.className='cloud-reader-note';note.textContent='Acesso somente consulta · Você pode pesquisar, visualizar os cadastros e exportar resultados. Inclusões, alterações e exclusões são reservadas aos perfis autorizados.';
    status.after(note);
  }
  document.addEventListener('submit',event=>{
    if(cloud.role==='leitor' && event.target.id!=='cloudLoginForm') {event.preventDefault();event.stopImmediatePropagation();alert('Seu perfil permite somente consulta.');}
  },true);
  document.addEventListener('click',event=>{
    if(cloud.role!=='leitor')return;
    const target=event.target.closest('button,[onclick],label'); if(!target)return;
    const code=target.getAttribute('onclick')||'';
    const blocked=['editLead','removeLead','removeNeed','completeNeed','removeShortlistGroup','saveSupplierClasses','saveSupplierContactUpdate','prepareCapture','planFromContract'];
    if (blocked.some(name=>new RegExp('\\b'+name+'\\s*\\(').test(code)) || target.matches('[data-usage-remove],#drawerShortlist,[for="usageImport"]')) {event.preventDefault();event.stopImmediatePropagation();alert('Seu perfil permite somente consulta.');}
  },true);
  function loadScript(name) {
    return new Promise((resolve, reject) => {
      let runtimeError = null;
      const onError = event => { if (event.filename && new URL(event.filename, location.href).pathname.endsWith('/' + name)) runtimeError = event.error || Error(event.message); };
      window.addEventListener('error', onError);
      const script = document.createElement('script'); script.src = './' + name + '?v=' + encodeURIComponent(config.assetVersion || '1');
      const failed = () => { reloadRequired = true; reject(Object.assign(Error('Falha ao abrir a plataforma.'), {code: 'LUPEMA_APP_INIT'})); };
      script.onload = () => { window.removeEventListener('error', onError); runtimeError ? failed() : resolve(); };
      script.onerror = () => { window.removeEventListener('error', onError); failed(); };
      document.body.appendChild(script);
    });
  }
  async function start() {
    if (started || loading) return;
    loading = true;
    try {
      await fetchMembers();
      $('cloudLoginError').textContent = 'Carregando a base compartilhada…';
      const expected = ['creditorClassesData', 'supplierData', 'itemData', 'contractData', 'poData'];
      const batches = await Promise.all(expected.map(id => request('/rest/v1/lupema_base?select=chave,conteudo&chave=eq.' + encodeURIComponent(id))));
      const base = batches.flat();
      if (expected.some(id => !base.some(row => row.chave === id))) throw Error('A base inicial ainda não foi carregada. Solicite a ativação ao responsável.');
      base.forEach(row => { if (expected.includes(row.chave)) $(row.chave).textContent = JSON.stringify(row.conteudo); });
      store.hydrate(await fetchRecords());
      await loadScript('main.js'); await loadScript('references.js'); await loadScript('usage.js');
      started = true;
      applyAccessMode();
      document.body.classList.remove('lupema-locked'); gate.hidden = true;
      $('cloudPassword').value = '';
      state('Base compartilhada · ' + cloud.user.name);
      setInterval(() => refresh(), Math.max(5000, Number(config.syncIntervalMs) || 10000));
    } finally { loading = false; }
  }
  $('cloudLoginForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (reloadRequired) { location.reload(); return; }
    $('cloudLogin').disabled = true; $('cloudLoginError').textContent = 'Verificando acesso…';
    try {
      const value = await raw('/auth/v1/token?grant_type=password', {
        method: 'POST', body: JSON.stringify({email: $('cloudEmail').value.trim(), password: $('cloudPassword').value})
      });
      saveSession(value); await start();
    } catch (error) {
      $('cloudLoginError').textContent = error.code === 'LUPEMA_ACCESS' ? error.message :
        error.code === 'LUPEMA_APP_INIT' ? 'Não foi possível abrir a plataforma. Clique em Recarregar plataforma e entre novamente.' :
        error.status === 400 || error.status === 401 ? 'E-mail ou senha inválidos, ou acesso ainda não confirmado.' :
        error.status === 403 || error.code === '42501' ? 'Seu login foi recebido, mas o acesso à base foi bloqueado. Solicite a revisão das permissões ao responsável.' :
        error.name === 'AbortError' ? 'O servidor demorou a responder. Aguarde um momento e tente entrar novamente.' :
        error.message.includes('base inicial') ? error.message : 'Não foi possível entrar. Confira a conexão e a configuração do sistema.';
      saveSession(null);
    } finally { $('cloudLogin').disabled = false; $('cloudLogin').textContent = reloadRequired ? 'Recarregar plataforma' : 'Entrar'; }
  });
  $('cloudRefresh').addEventListener('click', () => refresh(true));
  $('lupemaLogout').addEventListener('click', () => cloud.logout());
  $('cloudRecovery').addEventListener('click', () => {
    if (!lastFailure) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({schema: 'lupema-alteracao-nao-confirmada-v1', ...lastFailure}, null, 2)], {type: 'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = 'LUPEMA_ALTERACAO_NAO_CONFIRMADA.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener('online', () => refresh(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });
  window.addEventListener('beforeunload', event => {
    if (!store.pending && !lastFailure) return;
    event.preventDefault(); event.returnValue = '';
  });
  // Eventos de interface antigos podem chamar funções async por atributos onclick.
  window.addEventListener('unhandledrejection', event => {
    if (status.classList.contains('cloud-error')) event.preventDefault();
  });
  if (!validConfig()) {
    $('cloudLoginError').textContent = 'Sistema ainda não conectado à base compartilhada. Solicite a ativação ao responsável.';
    $('cloudLogin').disabled = true;
    return;
  }
  try { session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { session = null; }
  if (session?.access_token) start().catch(error => {
    saveSession(null); $('cloudLoginError').textContent = error.code === 'LUPEMA_ACCESS' ? error.message : 'Entre novamente para carregar a base compartilhada.';
  });
})();
