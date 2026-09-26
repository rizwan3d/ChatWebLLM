(() => {
  const ADV_KEY = 'chatwebllm.advancedTools.v1';
  const defaults = {
    webSuite: true,
    genui: true,
    filesTool: true,
    fileLibraryMaxBytes: 5 * 1024 * 1024,
    webOpenMaxChars: 18000,
    pdfMaxPages: 20,
    weatherProvider: 'open-meteo',
    currencyProvider: 'frankfurter'
  };
  const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  let adv = { ...defaults, ...read(ADV_KEY, {}) };
  const persist = () => localStorage.setItem(ADV_KEY, JSON.stringify(adv));
  const json = (v) => JSON.stringify(v, null, 2);
  const trimText = (s, n = adv.webOpenMaxChars) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const safeUrl = (value) => {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are allowed');
    return u;
  };

  const DB_NAME = 'chatwebllm-library';
  const STORE = 'files';
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('name', 'name');
          s.createIndex('folder', 'folder');
          s.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    try {
      return await new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
        let out;
        Promise.resolve(fn(s)).then(v => out = v).catch(reject);
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
      });
    } finally { d.close(); }
  }
  const reqP = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  async function libraryPut({ name, text, folder = '/', type = 'text/plain' }) {
    text = String(text ?? '');
    const bytes = new Blob([text]).size;
    if (bytes > adv.fileLibraryMaxBytes) throw new Error(`File exceeds ${Math.round(adv.fileLibraryMaxBytes / 1024 / 1024)} MB library limit`);
    const item = { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, name: name || 'untitled.txt', folder: folder || '/', type, text, size: bytes, createdAt: Date.now(), updatedAt: Date.now() };
    await tx('readwrite', s => reqP(s.put(item)));
    return item;
  }
  async function libraryAll() { return tx('readonly', s => reqP(s.getAll())); }
  async function libraryGet(id) { return tx('readonly', s => reqP(s.get(id))); }
  async function libraryDelete(id) { await tx('readwrite', s => reqP(s.delete(id))); return { ok: true, id }; }
  async function libraryMove(id, folder) {
    const item = await libraryGet(id); if (!item) throw new Error('File not found');
    item.folder = folder || '/'; item.updatedAt = Date.now();
    await tx('readwrite', s => reqP(s.put(item))); return item;
  }
  async function librarySearch(query) {
    const q = String(query || '').toLowerCase();
    return (await libraryAll()).filter(f => `${f.name}\n${f.folder}\n${f.text}`.toLowerCase().includes(q)).slice(0, 50);
  }

  async function fetchText(url, opts = {}) {
    const u = safeUrl(url);
    const r = await fetch(u, { redirect: 'follow', ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text().catch(() => '')}`.trim());
    return r;
  }
  async function webOpen(url) {
    const r = await fetchText(url);
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/pdf') || /\.pdf(?:$|\?)/i.test(url)) return inspectPdf(url);
    const raw = await r.text();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script,style,noscript,svg,canvas,template').forEach(n => n.remove());
    const title = trimText(doc.title, 300);
    const text = trimText(doc.body?.innerText || doc.documentElement?.innerText || raw);
    return { url: r.url, title, contentType: ct, text };
  }
  async function webSearchAdvanced(query, kind = 'web', maxResults = 5) {
    const provider = settings?.webSearchProvider || 'searxng';
    const endpoint = settings?.webSearchUrl || 'http://127.0.0.1:8080/search';
    const key = settings?.webSearchKey || '';
    maxResults = Math.max(1, Math.min(20, Number(maxResults) || 5));
    if (provider === 'tavily') {
      const r = await fetchText(endpoint || 'https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query, max_results: maxResults, include_images: kind === 'images' })
      });
      const data = await r.json();
      if (kind === 'images') return { query, images: (data.images || []).slice(0, maxResults) };
      return { query, results: (data.results || []).slice(0, maxResults).map(x => ({ title: x.title, url: x.url, content: x.content, score: x.score })) };
    }
    const u = new URL(endpoint);
    u.searchParams.set('q', kind === 'products' ? `${query} shopping product` : kind === 'businesses' ? `${query} business local` : query);
    u.searchParams.set('format', 'json');
    if (kind === 'images') u.searchParams.set('categories', 'images');
    const headers = key ? { Authorization: `Bearer ${key}` } : {};
    const r = await fetchText(u, { headers });
    const data = await r.json();
    const results = (data.results || []).slice(0, maxResults);
    if (kind === 'images') return { query, images: results.map(x => ({ title: x.title, url: x.url, image: x.img_src || x.thumbnail || x.url, source: x.source || x.engine })) };
    return { query, kind, results: results.map(x => ({ title: x.title, url: x.url, content: x.content || x.snippet || '', source: x.engine || x.source })) };
  }
  async function inspectPdf(url) {
    if (!window.pdfjsLib) await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
    if (!window.pdfjsLib) throw new Error('PDF.js failed to load. The PDF host must also allow browser CORS.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const task = window.pdfjsLib.getDocument({ url: safeUrl(url).href });
    const pdf = await task.promise, pages = Math.min(pdf.numPages, adv.pdfMaxPages), out = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i), content = await page.getTextContent();
      out.push({ page: i, text: trimText(content.items.map(x => x.str).join(' '), 12000) });
    }
    return { url, pagesRead: pages, totalPages: pdf.numPages, pages: out };
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${src}`)); document.head.appendChild(s);
    });
  }

  async function genuiData(type, args = {}) {
    if (type === 'calculator') return { type, expression: args.expression, value: calculator(args.expression)?.result ?? null };
    if (type === 'time') return { type, now: new Date().toString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (type === 'weather') {
      const q = encodeURIComponent(args.location || '');
      const geo = await (await fetchText(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`)).json();
      const p = geo.results?.[0]; if (!p) throw new Error('Location not found');
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5`;
      const data = await (await fetchText(u)).json();
      return { type, location: `${p.name}${p.country ? ', ' + p.country : ''}`, current: data.current, daily: data.daily, units: { current: data.current_units, daily: data.daily_units } };
    }
    if (type === 'currency') {
      const from = String(args.from || 'USD').toUpperCase(), to = String(args.to || 'EUR').toUpperCase(), amount = Number(args.amount || 1);
      const data = await (await fetchText(`https://api.frankfurter.app/latest?amount=${encodeURIComponent(amount)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).json();
      return { type, from, to, amount, result: data.rates?.[to], date: data.date };
    }
    if (type === 'table' || type === 'key_value') return { type, ...args };
    throw new Error('Unsupported widget type');
  }
  function renderWidget(spec) {
    const wrap = document.createElement('div');
    wrap.className = 'my-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900';
    const type = spec.type || 'key_value';
    if (type === 'weather') {
      const c = spec.current || {};
      wrap.innerHTML = `<div class="font-semibold">${esc(spec.location || 'Weather')}</div><div class="mt-2 text-2xl font-semibold">${esc(c.temperature_2m ?? '—')}°</div><div class="mt-1 text-xs text-zinc-500">Feels ${esc(c.apparent_temperature ?? '—')}° · Wind ${esc(c.wind_speed_10m ?? '—')}</div>`;
    } else if (type === 'currency') {
      wrap.innerHTML = `<div class="text-xs text-zinc-500">Currency</div><div class="mt-1 text-xl font-semibold">${esc(spec.amount)} ${esc(spec.from)} = ${esc(spec.result ?? '—')} ${esc(spec.to)}</div><div class="mt-1 text-xs text-zinc-500">${esc(spec.date || '')}</div>`;
    } else if (type === 'time') {
      wrap.innerHTML = `<div class="text-xs text-zinc-500">${esc(spec.timezone || '')}</div><div class="mt-1 text-lg font-semibold">${esc(spec.now || '')}</div>`;
    } else if (type === 'calculator') {
      wrap.innerHTML = `<div class="text-xs text-zinc-500">${esc(spec.expression || '')}</div><div class="mt-1 text-2xl font-semibold">${esc(spec.value)}</div>`;
    } else if (type === 'table') {
      const cols = spec.columns || [], rows = spec.rows || [];
      wrap.innerHTML = `<div class="font-semibold">${esc(spec.title || 'Table')}</div><div class="mt-3 overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr>${cols.map(c => `<th class="border-b p-2 dark:border-zinc-700">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map((c, i) => `<td class="border-b p-2 dark:border-zinc-800">${esc(Array.isArray(r) ? r[i] : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else {
      wrap.innerHTML = `<div class="font-semibold">${esc(spec.title || 'Details')}</div><pre class="mt-2 overflow-auto text-xs">${esc(json(spec.data || spec))}</pre>`;
    }
    return wrap;
  }

  const originalToolDefs = toolDefs;
  toolDefs = function () {
    const list = originalToolDefs();
    if (!settings?.toolsEnabled) return list;
    if (adv.webSuite) list.push(
      { type: 'function', function: { name: 'web_open', description: 'Open a webpage URL and extract readable text. Browser CORS rules apply.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
      { type: 'function', function: { name: 'web_image_search', description: 'Search the web for images using the configured web-search provider.', parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'] } } },
      { type: 'function', function: { name: 'web_product_search', description: 'Search for products using the configured web-search provider. Results are web search results, not a purchasing API.', parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'] } } },
      { type: 'function', function: { name: 'web_business_search', description: 'Search for local businesses using the configured web-search provider.', parameters: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'] } } },
      { type: 'function', function: { name: 'web_pdf_inspect', description: 'Extract text from a PDF URL in the browser. CORS applies.', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } }
    );
    if (adv.genui) list.push({ type: 'function', function: { name: 'show_widget', description: 'Render a UI card in chat. Supported types: weather, currency, time, calculator, table, key_value.', parameters: { type: 'object', properties: { type: { type: 'string', enum: ['weather', 'currency', 'time', 'calculator', 'table', 'key_value'] }, args: { type: 'object' } }, required: ['type'] } } });
    if (adv.filesTool) list.push(
      { type: 'function', function: { name: 'files_list', description: 'List files stored in the browser-local ChatWebLLM library.', parameters: { type: 'object', properties: { folder: { type: 'string' } } } } },
      { type: 'function', function: { name: 'files_search', description: 'Search file names, folders, and text in the browser-local library.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
      { type: 'function', function: { name: 'files_read', description: 'Read one local-library file by id.', parameters: { type: 'object', properties: { id: { type: 'string' }, max_chars: { type: 'integer' } }, required: ['id'] } } },
      { type: 'function', function: { name: 'files_save', description: 'Create a text file in the browser-local library.', parameters: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' }, folder: { type: 'string' } }, required: ['name', 'text'] } } },
      { type: 'function', function: { name: 'files_move', description: 'Organize a local-library file by moving it to a folder.', parameters: { type: 'object', properties: { id: { type: 'string' }, folder: { type: 'string' } }, required: ['id', 'folder'] } } },
      { type: 'function', function: { name: 'files_delete', description: 'Delete a file from the browser-local library.', parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } } }
    );
    return list;
  };

  const originalExecuteTool = executeTool;
  executeTool = async function (name, args = {}) {
    if (name === 'web_open') return webOpen(args.url);
    if (name === 'web_image_search') return webSearchAdvanced(args.query, 'images', args.max_results);
    if (name === 'web_product_search') return webSearchAdvanced(args.query, 'products', args.max_results);
    if (name === 'web_business_search') return webSearchAdvanced(args.query, 'businesses', args.max_results);
    if (name === 'web_pdf_inspect') return inspectPdf(args.url);
    if (name === 'show_widget') return { widget: await genuiData(args.type, args.args || {}) };
    if (name === 'files_list') {
      const all = await libraryAll(), folder = args.folder;
      return all.filter(f => !folder || f.folder === folder).map(({ text, ...m }) => m);
    }
    if (name === 'files_search') return (await librarySearch(args.query)).map(({ text, ...m }) => ({ ...m, preview: trimText(text, 500) }));
    if (name === 'files_read') {
      const f = await libraryGet(args.id); if (!f) return { error: 'File not found' };
      return { ...f, text: String(f.text || '').slice(0, Math.max(1, Math.min(50000, Number(args.max_chars) || 20000))) };
    }
    if (name === 'files_save') return libraryPut({ name: args.name, text: args.text, folder: args.folder || '/' });
    if (name === 'files_move') return libraryMove(args.id, args.folder);
    if (name === 'files_delete') return libraryDelete(args.id);
    return originalExecuteTool(name, args);
  };

  const originalRenderMessages = renderMessages;
  renderMessages = function () {
    originalRenderMessages();
    const c = active?.();
    const root = document.getElementById('messages');
    if (!c || !root) return;
    c.messages.filter(m => m.role === 'tool' && m.name === 'show_widget').forEach(m => {
      try {
        const payload = JSON.parse(m.content || '{}');
        if (payload.widget) root.appendChild(renderWidget(payload.widget));
      } catch {}
    });
  };

  function injectSettings() {
    const appearance = [...document.querySelectorAll('#settings section')].find(s => /Appearance/i.test(s.textContent || ''));
    if (!appearance || document.getElementById('advancedToolsSection')) return;
    const section = document.createElement('section');
    section.id = 'advancedToolsSection';
    section.innerHTML = `
      <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Advanced tools</h2>
      <div class="space-y-2 text-sm">
        <label class="flex justify-between rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"><span><b class="block">Web suite</b><small class="text-zinc-500">Open pages, images, products, businesses and PDFs</small></span><input id="advWebSuite" type="checkbox"></label>
        <label class="flex justify-between rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"><span><b class="block">GenUI</b><small class="text-zinc-500">Weather, currency, time, calculator and data cards</small></span><input id="advGenui" type="checkbox"></label>
        <label class="flex justify-between rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"><span><b class="block">Files library</b><small class="text-zinc-500">IndexedDB-backed local file tools</small></span><input id="advFiles" type="checkbox"></label>
        <div class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div class="flex items-center justify-between gap-2"><div><b class="text-sm">Local library</b><div id="advLibraryCount" class="text-xs text-zinc-500">0 files</div></div><label class="cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700">Import<input id="advLibraryImport" type="file" multiple class="hidden"></label></div>
          <div id="advLibraryList" class="mt-3 max-h-40 space-y-1 overflow-y-auto"></div>
        </div>
      </div>`;
    appearance.before(section);
    document.getElementById('advLibraryImport').addEventListener('change', async e => {
      for (const f of [...e.target.files]) {
        if (f.size > adv.fileLibraryMaxBytes) continue;
        await libraryPut({ name: f.name, text: await f.text(), type: f.type || 'text/plain' });
      }
      e.target.value = ''; await refreshLibraryUi();
    });
  }
  async function refreshLibraryUi() {
    const count = document.getElementById('advLibraryCount'), list = document.getElementById('advLibraryList');
    if (!count || !list) return;
    const all = (await libraryAll()).sort((a, b) => b.updatedAt - a.updatedAt);
    count.textContent = `${all.length} file${all.length === 1 ? '' : 's'}`;
    list.innerHTML = all.slice(0, 50).map(f => `<div class="flex items-center gap-2 rounded-lg bg-zinc-100 px-2 py-1.5 text-xs dark:bg-zinc-800"><span class="min-w-0 flex-1 truncate">${esc(f.folder === '/' ? '' : f.folder + '/')}${esc(f.name)}</span><span class="text-zinc-500">${Math.ceil(f.size / 1024)} KB</span><button data-adv-del="${esc(f.id)}" class="text-zinc-500">×</button></div>`).join('');
    list.querySelectorAll('[data-adv-del]').forEach(b => b.onclick = async () => { await libraryDelete(b.dataset.advDel); refreshLibraryUi(); });
  }
  injectSettings();
  const oldOpenSettings = openSettings;
  openSettings = function () {
    oldOpenSettings(); injectSettings();
    document.getElementById('advWebSuite').checked = adv.webSuite;
    document.getElementById('advGenui').checked = adv.genui;
    document.getElementById('advFiles').checked = adv.filesTool;
    refreshLibraryUi();
  };
  document.getElementById('openSettings').onclick = openSettings;
  document.getElementById('modelButton').onclick = openSettings;

  const oldSaveForm = saveForm;
  saveForm = function () {
    adv.webSuite = !!document.getElementById('advWebSuite')?.checked;
    adv.genui = !!document.getElementById('advGenui')?.checked;
    adv.filesTool = !!document.getElementById('advFiles')?.checked;
    persist();
    oldSaveForm();
  };
  document.getElementById('saveSettings').onclick = saveForm;
  renderToolCount?.();
})();