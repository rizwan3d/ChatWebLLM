(() => {
  const css = `
  :root{color-scheme:dark}html,body{background:#0b0b0b!important;color:#e7e7e7!important}
  body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  #sidebar{background:#111!important;border-color:#242424!important;box-shadow:20px 0 60px #0008;transform:translateX(-102%)!important;position:fixed!important;z-index:80!important}
  #sidebar.open{transform:translateX(0)!important}
  main{background:#0b0b0b!important}
  main>header{height:50px!important;border:0!important;padding:10px 22px!important;background:#0b0b0b!important}
  #modelButton{display:none!important}#clearChat{display:none!important}
  #chatArea{padding-top:2px}
  #welcome{display:none!important}
  #messages{max-width:850px!important;padding-top:34px!important;padding-bottom:190px!important;gap:30px!important}
  #messages>div{position:relative}
  #messages .msg{font-size:14px;line-height:1.75;color:#dedede}
  #messages>div.justify-end>div{background:#1c1c1c!important;border:1px solid #2c2c2c;border-radius:22px!important;padding:12px 16px!important}
  #messages>div:not(.justify-end)>div{max-width:100%!important}
  #messages .text-\\[10px\\]{display:none!important}
  #composerDock{position:absolute;left:0;right:0;bottom:0;padding:50px 20px 15px;background:linear-gradient(0deg,#0b0b0b 65%,transparent)}
  #composerCard{max-width:850px;margin:auto;background:#1d1d1d;border:1px solid #313131;border-radius:24px;padding:10px 11px 9px;box-shadow:0 18px 50px #0007}
  #prompt{min-height:62px!important;max-height:180px!important;padding:7px 10px!important;color:#eee!important;font-size:15px!important}
  #prompt::placeholder{color:#9a9a9a}
  #composerBar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px}
  .roundIcon{width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:#2b2b2b;color:#ddd;border:1px solid #333;transition:.15s}
  .roundIcon:hover{background:#363636}.roundIcon svg{width:17px;height:17px}
  #send{width:34px!important;height:34px!important;border-radius:999px!important;padding:0!important;display:grid!important;place-items:center;background:#999!important;color:#111!important}
  #send:not(:disabled):hover{background:#bbb!important}#send:disabled{opacity:.35!important}
  #composerModel{display:flex;align-items:center;gap:6px;max-width:260px;height:30px;padding:0 9px;border-radius:10px;background:#292929;border:1px solid #353535;font-size:11px;color:#ddd;cursor:pointer}
  #composerModelName{max-width:175px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
  #toolCount{padding:0!important;font-size:10px!important}
  #topStats{display:flex;align-items:center;gap:14px;font-size:11px;color:#aaa;min-height:28px}
  #topStats span{white-space:nowrap}#topStats b{font-weight:500;color:#d0d0d0}
  #chatActions{max-width:850px;margin:0 auto;padding:0 2px;display:flex;gap:9px;color:#ddd;min-height:28px}
  .chatAction{width:20px;height:20px;display:grid;place-items:center;opacity:.9}.chatAction:hover{opacity:1;color:white}.chatAction svg{width:16px;height:16px}
  .messageActions{display:flex;gap:11px;margin-top:12px;color:#d2d2d2;opacity:.92}.messageActions button:hover{color:white}.messageActions svg{width:16px;height:16px}
  #connectionBanner{display:none;max-width:850px;margin:5px auto 0;padding:9px 12px;border:1px solid #6c3737;background:#2a1717;color:#e5b4b4;border-radius:12px;font-size:11px}
  #connectionBanner.show{display:block}
  #settings>div{background:#151515!important;border-color:#303030!important}
  #settings section label,#settings section>div{border-color:#313131!important}#settings input,#settings textarea,#settings select{border-color:#383838!important;background:#111!important}
  #attachments{max-width:850px;margin:0 auto 8px!important}
  @media(max-width:700px){#messages{padding-left:16px!important;padding-right:16px!important}#composerDock{padding-left:10px;padding-right:10px}#topStats{gap:8px;font-size:10px}#topStats .optional{display:none}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  const icon = (name) => ({
    menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
    up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 6-6 6 6M12 6v12"/></svg>',
    cube:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v9"/></svg>',
    copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    regen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0 1 5"/></svg>',
    share:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/></svg>',
    trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    gauge:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 16 4-5"/></svg>'
  })[name]||'';

  // Header: menu + response stats, matching the supplied compact layout.
  const header=document.querySelector('main>header');
  if(header){
    header.innerHTML=`<div class="flex items-center gap-3"><button id="compactMenu" class="chatAction" title="Open sidebar">${icon('menu')}</button><div id="topStats"><span>⌁ <b id="statTokens">0 tokens</b></span><span>${icon('clock')} <b id="statTime">0s</b></span><span class="optional">${icon('gauge')} <b id="statTps">0 tokens/s</b></span></div></div><div></div>`;
    header.querySelectorAll('#topStats svg').forEach(s=>{s.style.width='13px';s.style.height='13px';s.style.display='inline';s.style.verticalAlign='-2px'});
    document.getElementById('compactMenu').onclick=()=>document.getElementById('sidebar')?.classList.add('open');
  }

  // Convert existing dock into the screenshot-style composer while retaining original IDs/listeners.
  const oldDock=document.querySelector('main>.absolute.inset-x-0.bottom-0');
  if(oldDock){
    oldDock.id='composerDock';
    const oldInner=oldDock.firstElementChild;
    const attachments=document.getElementById('attachments');
    const oldCard=oldInner?.querySelector('.rounded-2xl');
    if(oldCard){
      oldCard.id='composerCard';
      const prompt=document.getElementById('prompt');
      const oldBar=oldCard.lastElementChild; oldBar.id='composerBar'; oldBar.innerHTML='';
      const left=document.createElement('div');left.className='flex items-center gap-2';
      const file=document.getElementById('fileInput');
      const fileLabel=document.createElement('label');fileLabel.className='roundIcon cursor-pointer';fileLabel.title='Attach files';fileLabel.innerHTML=icon('plus');fileLabel.appendChild(file);left.appendChild(fileLabel);
      const tools=document.getElementById('toolCount');left.appendChild(tools);
      const right=document.createElement('div');right.className='flex items-center gap-2';
      const model=document.createElement('button');model.id='composerModel';model.type='button';model.innerHTML=`${icon('cube')}<span id="composerModelName">No model</span>`;model.onclick=()=>openSettings();right.appendChild(model);
      const send=document.getElementById('send');send.innerHTML=icon('up');send.title='Send';right.appendChild(send);
      oldBar.append(left,right);
      if(prompt) prompt.placeholder='Type a message...';
    }
    oldInner?.querySelector('.mt-2.text-center')?.remove();
    if(attachments) oldDock.insertBefore(attachments,oldInner);
  }

  const chatArea=document.getElementById('chatArea');
  if(chatArea){const b=document.createElement('div');b.id='connectionBanner';chatArea.prepend(b)}

  // Chat-wide actions similar to the second screenshot.
  const actions=document.createElement('div');actions.id='chatActions';
  actions.innerHTML=`<button class="chatAction" data-a="copy" title="Copy last response">${icon('copy')}</button><button class="chatAction" data-a="edit" title="Edit last prompt">${icon('edit')}</button><button class="chatAction" data-a="regen" title="Regenerate">${icon('regen')}</button><button class="chatAction" data-a="share" title="Copy conversation">${icon('share')}</button><button class="chatAction" data-a="trash" title="Clear chat">${icon('trash')}</button>`;
  document.getElementById('messages')?.before(actions);

  const copyText=async t=>{try{await navigator.clipboard.writeText(t||'')}catch{}};
  actions.onclick=async e=>{
    const btn=e.target.closest('[data-a]');if(!btn)return;const c=active?.();if(!c)return;
    const lastAssistant=[...c.messages].reverse().find(m=>m.role==='assistant');
    const lastUser=[...c.messages].reverse().find(m=>m.role==='user');
    if(btn.dataset.a==='copy') return copyText(lastAssistant?.content||'');
    if(btn.dataset.a==='share') return copyText(c.messages.filter(m=>m.role!=='tool').map(m=>`${m.role}: ${m.content||''}`).join('\n\n'));
    if(btn.dataset.a==='edit'&&lastUser){document.getElementById('prompt').value=lastUser.content||'';document.getElementById('prompt').focus();}
    if(btn.dataset.a==='trash'){c.messages=[];save();render();}
    if(btn.dataset.a==='regen'&&!busy){const idx=c.messages.map(m=>m.role).lastIndexOf('assistant');if(idx>=0)c.messages.splice(idx);busy=true;try{await complete(c)}catch(err){c.messages.push({role:'assistant',content:`Error: ${err.message}`})}finally{busy=false;save();render();}}
  };

  let lastStats={tokens:0,seconds:0,tps:0};
  function paintStats(){
    const t=document.getElementById('statTokens'),s=document.getElementById('statTime'),p=document.getElementById('statTps'),m=document.getElementById('composerModelName');
    if(t)t.textContent=`${lastStats.tokens} tokens`;if(s)s.textContent=`${lastStats.seconds.toFixed(lastStats.seconds<10?1:0)}s`;if(p)p.textContent=`${lastStats.tps.toFixed(lastStats.tps<100?1:0)} tokens/s`;if(m)m.textContent=settings?.model||'No model';
  }
  const originalComplete=complete;
  complete=async function(c){const before=c.messages.filter(m=>m.role==='assistant').reduce((n,m)=>n+(m.content||'').length,0);const start=performance.now();try{return await originalComplete(c)}finally{const after=c.messages.filter(m=>m.role==='assistant').reduce((n,m)=>n+(m.content||'').length,0);const chars=Math.max(0,after-before);const tokens=Math.max(0,Math.round(chars/4));const seconds=Math.max(.001,(performance.now()-start)/1000);lastStats={tokens,seconds,tps:tokens/seconds};paintStats()}};

  // Add per-response action strip after existing rendering.
  const originalRenderMessages=renderMessages;
  renderMessages=function(){
    originalRenderMessages();paintStats();
    const root=document.getElementById('messages');if(!root||root.classList.contains('hidden'))return;
    const c=active?.();if(!c)return;
    const assistantMsgs=c.messages.filter(m=>m.role==='assistant');let ai=0;
    [...root.children].forEach(node=>{if(node.classList.contains('justify-end'))return;const msg=assistantMsgs[ai++];if(!msg)return;const row=document.createElement('div');row.className='messageActions';row.innerHTML=`<button title="Copy">${icon('copy')}</button><button title="Regenerate">${icon('regen')}</button><button title="Delete">${icon('trash')}</button>`;const bs=row.querySelectorAll('button');bs[0].onclick=()=>copyText(msg.content||'');bs[1].onclick=()=>actions.querySelector('[data-a="regen"]').click();bs[2].onclick=()=>{const i=c.messages.indexOf(msg);if(i>=0)c.messages.splice(i,1);save();render()};node.firstElementChild?.appendChild(row)});
  };

  // Fix uncaught model-loading errors and give actionable browser/CORS feedback.
  const originalListModels=listModels;
  listModels=async function(){
    const banner=document.getElementById('connectionBanner');if(banner)banner.classList.remove('show');
    try{return await originalListModels()}
    catch(err){
      const url=document.getElementById('baseUrl')?.value||settings?.baseUrl||'';
      let msg=`Could not reach ${url}. `;
      if(location.protocol==='https:'&&/^http:\/\//i.test(url)) msg+='This HTTPS page is trying to reach an HTTP local endpoint; the browser may block mixed-content/private-network requests. ';
      msg+='Check that the local LLM is running and allows this WebUI origin with CORS.';
      if(banner){banner.textContent=msg;banner.classList.add('show')}
      const tr=document.getElementById('testResult');if(tr)tr.textContent='Connection failed — check CORS / local endpoint';
      return [];
    }
  };
  const loadBtn=document.getElementById('loadModels');if(loadBtn)loadBtn.onclick=()=>listModels();
  const testBtn=document.getElementById('testConnection');if(testBtn)testBtn.onclick=async()=>{const names=await listModels();if(names.length){document.getElementById('testResult').textContent='Connected';document.getElementById('statusText').textContent='Connected'}};

  // Rebind old hidden sidebar trigger removed from the compact header.
  document.getElementById('closeSidebar')?.addEventListener('click',()=>document.getElementById('sidebar')?.classList.remove('open'));
  paintStats();renderMessages();
})();