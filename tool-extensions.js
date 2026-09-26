(() => {
  const KEY = 'chatwebllm.toolExtensions.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let cfg = { restaurantAvailabilityUrl: '', ...read() };
  const saveCfg = () => localStorage.setItem(KEY, JSON.stringify(cfg));

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('chatwebllm-library', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function getFile(id) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally { db.close(); }
  }

  async function restaurantAvailability(args = {}) {
    if (!cfg.restaurantAvailabilityUrl) {
      return {
        error: 'No restaurant availability endpoint configured',
        hint: 'Set one in Settings → Advanced tools. The endpoint must accept browser CORS and POST JSON.'
      };
    }
    const url = new URL(cfg.restaurantAvailabilityUrl);
    if (!/^https?:$/.test(url.protocol)) throw new Error('Availability endpoint must use http(s)');
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurant: args.restaurant || '',
        location: args.location || '',
        party_size: Math.max(1, Number(args.party_size || 2)),
        start_date_time: args.start_date_time || ''
      })
    });
    if (!r.ok) throw new Error(`Availability endpoint HTTP ${r.status}`);
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : { text: (await r.text()).slice(0, 20000) };
  }

  const prevToolDefs = toolDefs;
  toolDefs = function () {
    const list = prevToolDefs();
    if (!settings?.toolsEnabled) return list;
    list.push(
      { type: 'function', function: { name: 'web_restaurant_availability', description: 'Check restaurant availability through the user-configured browser-accessible availability API.', parameters: { type: 'object', properties: { restaurant: { type: 'string' }, location: { type: 'string' }, party_size: { type: 'integer', minimum: 1 }, start_date_time: { type: 'string' } }, required: ['restaurant'] } } },
      { type: 'function', function: { name: 'files_inspect', description: 'Inspect metadata and a short preview for a browser-local library file.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } },
      { type: 'function', function: { name: 'files_materialize', description: 'Materialize a browser-local text file into the current tool result, including its complete stored text.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } }
    );
    return list;
  };

  const prevExecute = executeTool;
  executeTool = async function (name, args = {}) {
    if (name === 'web_restaurant_availability') return restaurantAvailability(args);
    if (name === 'files_inspect') {
      const f = await getFile(args.id);
      if (!f) return { error: 'File not found' };
      const { text, ...meta } = f;
      return { ...meta, preview: String(text || '').replace(/\s+/g, ' ').slice(0, 1000) };
    }
    if (name === 'files_materialize') {
      const f = await getFile(args.id);
      if (!f) return { error: 'File not found' };
      return { id: f.id, name: f.name, folder: f.folder, type: f.type, size: f.size, text: f.text };
    }
    return prevExecute(name, args);
  };

  function inject() {
    if (document.getElementById('restaurantAvailabilityUrl')) return;
    const target = document.getElementById('advancedToolsSection');
    if (!target) return;
    const label = document.createElement('label');
    label.className = 'mt-2 block rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800';
    label.innerHTML = 'Restaurant availability endpoint (optional)<input id="restaurantAvailabilityUrl" placeholder="https://provider.example/availability" class="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"><small class="mt-1 block text-zinc-500">POST JSON endpoint; must allow browser CORS. No ChatWebLLM proxy is used.</small>';
    target.querySelector('.space-y-2')?.appendChild(label);
  }

  inject();
  const prevOpen = openSettings;
  openSettings = function () {
    prevOpen(); inject();
    const input = document.getElementById('restaurantAvailabilityUrl');
    if (input) input.value = cfg.restaurantAvailabilityUrl || '';
  };
  document.getElementById('openSettings').onclick = openSettings;
  document.getElementById('modelButton').onclick = openSettings;

  const prevSave = saveForm;
  saveForm = function () {
    const input = document.getElementById('restaurantAvailabilityUrl');
    if (input) cfg.restaurantAvailabilityUrl = input.value.trim();
    saveCfg();
    prevSave();
  };
  document.getElementById('saveSettings').onclick = saveForm;
  renderToolCount?.();
})();

const chatWebLLMGoTools = document.createElement('script');
chatWebLLMGoTools.src = 'go-tools.js';
chatWebLLMGoTools.onload = () => {
  const ui = document.createElement('script');
  ui.src = 'ui-v2.js';
  document.body.appendChild(ui);
};
document.body.appendChild(chatWebLLMGoTools);
