(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LupemaSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const specs = Object.freeze({
    lupemaLeads: 'list', lupemaContractNeeds: 'list',
    lupemaReferenceProposalsV1: 'list',
    lupemaShortlist: 'set', lupemaShortlistCustomGroups: 'set',
    lupemaCreditorClassCustomV1: 'set', lupemaShortlistGroups: 'map',
    lupemaCreditorClassUpdatesV1: 'map', lupemaSupplierContactUpdatesV1: 'map',
    lupemaSupplierIncidentsV1: 'incidents', lupemaUsageControlV1: 'usage'
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  const token = (collection, id) => JSON.stringify([collection, String(id)]);
  function stable(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  }
  function encode(collection, value) {
    const mode = specs[collection];
    if (!mode) throw Error('Coleção não reconhecida.');
    const output = new Map();
    const put = (id, data) => {
      if (id === undefined || id === null || String(id) === '') throw Error('Registro sem identificador.');
      if (output.has(String(id))) throw Error('Identificador duplicado no cadastro.');
      output.set(String(id), clone(data));
    };
    if (mode === 'list') {
      if (!Array.isArray(value)) throw Error('Lista inválida.');
      value.forEach(row => put(row.localId || row.id, row));
    } else if (mode === 'set') {
      if (!Array.isArray(value)) throw Error('Lista inválida.');
      [...new Set(value)].forEach(row => put(row, row));
    } else if (mode === 'map') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Mapa inválido.');
      Object.entries(value).forEach(([id, row]) => put(id, row));
    } else if (mode === 'incidents') {
      Object.entries(value || {}).forEach(([supplierId, records]) => {
        if (!Array.isArray(records)) throw Error('Ocorrências inválidas.');
        records.forEach(row => {
          if (!row.id) throw Error('Ocorrência sem identificador.');
          put(JSON.stringify([supplierId, row.id]), {supplierId, record: row});
        });
      });
    } else if (mode === 'usage') {
      for (const kind of ['accesses', 'uses', 'feedbacks']) {
        if (!Array.isArray(value[kind])) throw Error('Controle de utilização inválido.');
        value[kind].forEach(row => put(kind + '/' + row.id, {kind, record: row}));
      }
    }
    return output;
  }
  function decode(collection, records) {
    const mode = specs[collection];
    const rows = records.filter(row => row.colecao === collection && !row.excluido);
    if (mode === 'list' || mode === 'set') {
      rows.sort((a, b) => {
        const date = row => String(row.dados?.capturedAt || row.dados?.createdAt || row.dados?.at || row.dados?.date || row.criado_em || '');
        const order = date(a).localeCompare(date(b)) || a.id.localeCompare(b.id);
        return collection === 'lupemaLeads' ? -order : order;
      });
      return rows.map(row => clone(row.dados));
    }
    if (mode === 'map') return Object.fromEntries(rows.map(row => [row.id, clone(row.dados)]));
    if (mode === 'incidents') {
      const output = {};
      rows.forEach(row => { const item = row.dados; (output[item.supplierId] ||= []).push(clone(item.record)); });
      Object.values(output).forEach(items => items.sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date))));
      return output;
    }
    if (mode === 'usage') {
      const output = {users: [], accesses: [], uses: [], feedbacks: []};
      rows.forEach(row => { const item = row.dados; if (output[item.kind]) output[item.kind].push(clone(item.record)); });
      for (const kind of ['accesses', 'uses', 'feedbacks']) output[kind].sort((a, b) => String(a.at || a.createdAt || a.date).localeCompare(String(b.at || b.createdAt || b.date)));
      return output;
    }
    throw Error('Coleção não reconhecida.');
  }
  class SharedStore {
    constructor(transport) {
      this.transport = transport;
      this.rows = new Map();
      this.locks = new Map();
      this.pending = 0;
      this.queue = Promise.resolve();
    }
    hydrate(records) {
      if (this.pending) throw Error('Gravação em andamento.');
      this.rows = new Map(records.map(row => [token(row.colecao, row.id), clone(row)]));
    }
    get(collection, fallback) {
      if (!specs[collection]) return clone(fallback);
      return decode(collection, [...this.rows.values()]);
    }
    lock(collection, id) {
      const key = token(collection, id);
      if (!this.locks.has(key)) this.locks.set(key, this.rows.get(key)?.revisao ?? null);
    }
    unlock(collection, id) { this.locks.delete(token(collection, id)); }
    changes(values) {
      const changes = [];
      for (const [collection, value] of Object.entries(values)) {
        const desired = encode(collection, value);
        const previous = new Map([...this.rows.values()].filter(row => row.colecao === collection).map(row => [row.id, row]));
        for (const [id, data] of desired) {
          const before = previous.get(id);
          if (before && !before.excluido && stable(before.dados) === stable(data)) continue;
          const key = token(collection, id);
          changes.push({colecao: collection, id, dados: data, excluido: false,
            revisao_esperada: this.locks.has(key) ? this.locks.get(key) : before?.revisao ?? null});
        }
        for (const [id, before] of previous) {
          if (before.excluido || desired.has(id)) continue;
          const key = token(collection, id);
          changes.push({colecao: collection, id, dados: null, excluido: true,
            revisao_esperada: this.locks.has(key) ? this.locks.get(key) : before.revisao});
        }
      }
      return changes;
    }
    write(values) {
      const snapshot = clone(values);
      this.pending++;
      const task = this.queue.then(async () => {
        const changes = this.changes(snapshot);
        if (!changes.length) return [];
        const saved = await this.transport(changes);
        if (!Array.isArray(saved) || saved.length !== changes.length) throw Error('Confirmação de gravação incompleta.');
        for (const row of saved) {
          const key = token(row.colecao, row.id);
          this.rows.set(key, clone(row));
          this.locks.delete(key);
        }
        return saved;
      });
      const finished = task.finally(() => { this.pending--; });
      this.queue = finished.catch(() => {});
      return finished;
    }
  }
  function canWrite(role, userId, changes) {
    if (role === 'admin' || role === 'editor') return true;
    if (role !== 'leitor' || !userId) return false;
    return changes.every(change => change.colecao === 'lupemaUsageControlV1' &&
      String(change.id || '').startsWith('accesses/') && change.revisao_esperada === null && !change.excluido &&
      change.dados?.kind === 'accesses' && change.dados?.record?.userId === userId);
  }
  return {SharedStore, encode, decode, stable, specs, canWrite};
});
