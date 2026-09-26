(() => {
  const KEY = 'chatwebllm.goTools.v1';
  const defaults = {
    enabled: false,
    visibleEnabled: false,
    runnerUrl: 'http://127.0.0.1:8787/run',
    timeoutMs: 5000,
    maxOutputBytes: 262144
  };
  const read = () => { try { return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { return { ...defaults }; } };
  let cfg = read();
  const saveCfg = () => localStorage.setItem(KEY, JSON.stringify(cfg));
  const clamp = (n, min, max, fallback) => Number.isFinite(+n) ? Math.max(min, Math.min(max, +n)) : fallback;

  function addSettingsUI() {
    const appearance = [...document.querySelectorAll('#settings section')].find(s => /Appearance/i.test(s.textContent || ''));
    if (!appearance || document.getElementById('goToolsSection')) return;
    const section = document.createElement('section');
    section.id = 'goToolsSection';
    section.innerHTML = `
      <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Go tools</h2>
      <div class="space-y-2 text-sm">
        <label class="flex justify-between rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"><span><b class="block">Private Go</b><small class="text-zinc-500">Expose run_go for analysis-only execution on your local runner</small></span><input id="goToolEnabled" type="checkbox"></label>
        <label class="flex justify-between rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"><span><b class="block">Visible Go</b><small class="text-zinc-500">Expose run_go_visible for charts, tables, and files</small></span><input id="goVisibleEnabled" type="checkbox"></label>
        <label class="block rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">Local Go runner URL<input id="goRunnerUrl" class="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700" placeholder="http://127.0.0.1:8787/run"></label>
        <div class="grid gap-2 sm:grid-cols-2"><label class="block rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">Timeout (ms)<input id="goTimeoutMs" type="number" min="250" max="30000" step="250" class="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"></label><label class="block rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800">Max output (KB)<input id="goMaxOutputKb" type="number" min="16" max="2048" step="16" class="mt-1 h-9 w-full rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700"></label></div>
        <div><button id="testGoRunner" class="rounded-xl border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700">Test Go runner</button><span id="goRunnerResult" class="ml-2 text-xs text-zinc-500"></span></div>
        <p class="text-[11px] text-zinc-500">The WebUI never compiles Go itself. Code is sent directly from this browser to the configured local runner. Keep the runner bound to loopback unless you deliberately secure it.</p>
      </div>`;
    appearance.parentElement.insertBefore(section, appearance);

    const syncIn = () => {
      cfg = read();
      document.getElementById('goToolEnabled').checked = !!cfg.enabled;
      document.getElementById('goVisibleEnabled').checked = !!cfg.visibleEnabled;
      document.getElementById('goRunnerUrl').value = cfg.runnerUrl;
      document.getElementById('goTimeoutMs').value = cfg.timeoutMs;
      document.getElementById('goMaxOutputKb').value = Math.round(cfg.maxOutputBytes / 1024);
    };
    const syncOut = () => {
      cfg.enabled = document.getElementById('goToolEnabled').checked;
      cfg.visibleEnabled = document.getElementById('goVisibleEnabled').checked;
      cfg.runnerUrl = document.getElementById('goRunnerUrl').value.trim() || defaults.runnerUrl;
      cfg.timeoutMs = clamp(document.getElementById('goTimeoutMs').value, 250, 30000, 5000);
      cfg.maxOutputBytes = clamp(document.getElementById('goMaxOutputKb').value, 16, 2048, 256) * 1024;
      saveCfg();
    };
    syncIn();
    document.getElementById('openSettings')?.addEventListener('click', syncIn);
    document.getElementById('modelButton')?.addEventListener('click', syncIn);
    document.getElementById('saveSettings')?.addEventListener('click', syncOut);
    document.getElementById('testGoRunner')?.addEventListener('click', async () => {
      syncOut();
      const out = document.getElementById('goRunnerResult');
      out.textContent = 'Testing…';
      try {
        const r = await callRunner('package main\nimport "fmt"\nfunc main(){fmt.Print("ok")}\n', false);
        out.textContent = r.stdout?.trim() === 'ok' ? 'Connected' : `Connected: ${String(r.stdout || '').slice(0, 80)}`;
      } catch (e) { out.textContent = `Failed: ${e.message}`; }
    });
  }

  async function callRunner(code, visible) {
    cfg = read();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs + 1500);
    try {
      const r = await fetch(cfg.runnerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, mode: visible ? 'visible' : 'private', timeout_ms: cfg.timeoutMs, max_output_bytes: cfg.maxOutputBytes }),
        signal: controller.signal
      });
      const text = await r.text();
      if (!r.ok) throw new Error(text || `HTTP ${r.status}`);
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Go runner returned invalid JSON'); }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`Go runner timed out after ${cfg.timeoutMs} ms`);
      throw e;
    } finally { clearTimeout(timer); }
  }

  function tool(name, description) {
    return { type: 'function', function: { name, description, parameters: { type: 'object', properties: { code: { type: 'string', description: 'Complete Go program with package main and func main().' } }, required: ['code'] } } };
  }

  const originalToolDefs = toolDefs;
  toolDefs = function () {
    const list = originalToolDefs();
    cfg = read();
    if (!settings?.toolsEnabled) return list;
    if (cfg.enabled) list.push(tool('run_go', 'Run Go code privately on the user-configured local Go runner for analysis. The result is returned to the model but is not rendered as a user-facing artifact.'));
    if (cfg.visibleEnabled) list.push(tool('run_go_visible', 'Run Go code on the local Go runner and render structured visible outputs. To create tables, charts, or files, print one final line beginning CHATWEBLLM_VISIBLE: followed by JSON with an outputs array.'));
    return list;
  };

  const originalExecuteTool = executeTool;
  executeTool = async function (name, args) {
    if (name === 'run_go') return callRunner(String(args?.code || ''), false);
    if (name === 'run_go_visible') return callRunner(String(args?.code || ''), true);
    return originalExecuteTool(name, args);
  };

  function parseVisible(content) {
    try {
      const data = typeof content === 'string' ? JSON.parse(content) : content;
      return Array.isArray(data?.visible?.outputs) ? data.visible.outputs : [];
    } catch { return []; }
  }
  function downloadFile(o) {
    const bytes = o.base64 ? Uint8Array.from(atob(o.base64), c => c.charCodeAt(0)) : new TextEncoder().encode(String(o.content || ''));
    const blob = new Blob([bytes], { type: o.mime || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.name || 'output.bin'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function visibleCard(o) {
    const wrap = document.createElement('div');
    wrap.className = 'my-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900';
    if (o.type === 'table') {
      const cols = o.columns || [], rows = o.rows || [];
      wrap.innerHTML = `<div class="font-semibold">${esc(o.title || 'Go table')}</div><div class="mt-3 overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr>${cols.map(c => `<th class="border-b p-2 dark:border-zinc-700">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map((c,i) => `<td class="border-b p-2 dark:border-zinc-800">${esc(Array.isArray(r) ? r[i] : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else if (o.type === 'chart') {
      const data = Array.isArray(o.data) ? o.data : [], xKey = o.xKey || 'x', series = Array.isArray(o.series) ? o.series : [];
      const w = 640, h = 260, pad = 36;
      const vals = data.flatMap(d => series.map(s => Number(d[s.dataKey]))).filter(Number.isFinite), max = Math.max(1, ...vals), barW = Math.max(4, (w - pad*2) / Math.max(1,data.length) / Math.max(1,series.length));
      const bars = data.map((d, i) => series.map((s,j) => { const v=Number(d[s.dataKey])||0, x=pad+i*((w-pad*2)/Math.max(1,data.length))+j*barW, bh=(h-pad*2)*(v/max), y=h-pad-bh; return `<rect x="${x}" y="${y}" width="${Math.max(2,barW-2)}" height="${bh}" fill="currentColor" opacity="${0.45 + Math.min(j,4)*0.1}"></rect>`; }).join('')).join('');
      wrap.innerHTML = `<div class="font-semibold">${esc(o.title || 'Go chart')}</div><svg viewBox="0 0 ${w} ${h}" class="mt-3 w-full text-zinc-700 dark:text-zinc-300"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="currentColor" opacity=".25"/>${bars}</svg><div class="mt-2 text-[11px] text-zinc-500">${esc(data.map(d=>d[xKey]).join(' · ').slice(0,300))}</div>`;
    } else if (o.type === 'file') {
      const b = document.createElement('button'); b.className='rounded-xl border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700'; b.textContent=`Download ${o.name || 'file'}`; b.onclick=()=>downloadFile(o); wrap.appendChild(b);
    } else {
      wrap.innerHTML = `<pre class="overflow-auto text-xs">${esc(JSON.stringify(o,null,2))}</pre>`;
    }
    return wrap;
  }

  const originalRenderMessages = renderMessages;
  renderMessages = function () {
    originalRenderMessages();
    const c = active?.(); if (!c) return;
    const root = document.getElementById('messages'); if (!root || root.classList.contains('hidden')) return;
    for (const m of c.messages || []) {
      if (m.role !== 'tool' || m.name !== 'run_go_visible') continue;
      for (const o of parseVisible(m.content)) root.appendChild(visibleCard(o));
    }
  };

  addSettingsUI();
})();
