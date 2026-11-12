'use strict';
const B='https://openrouter.ai/api/v1',$=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID(),ic=n=>`<i data-lucide="${n}"></i>`,icons=()=>window.lucide&&lucide.createIcons();
let db,me,P,convs=[],cur=null,catalog=null,catP,loading=false,ctrl=null,files=[],memKey='',showArch=false,mode='login',mcat='or',mq='',edit='',raf=0;

/* ---------- storage ---------- */
const idb=()=>new Promise((ok,no)=>{const r=indexedDB.open('openquex',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('users',{keyPath:'username'});d.createObjectStore('convs',{keyPath:'id'}).createIndex('user','user');d.createObjectStore('prefs',{keyPath:'user'})};r.onsuccess=()=>{db=r.result;ok()};r.onerror=()=>no(r.error)});
const tx=(s,m,f)=>new Promise((ok,no)=>{const t=db.transaction(s,m),q=f(t.objectStore(s));t.oncomplete=()=>ok(q&&q.result);t.onerror=()=>no(t.error)});
const get=(s,k)=>tx(s,'readonly',o=>o.get(k)),put=(s,v)=>tx(s,'readwrite',o=>o.put(v)),del=(s,k)=>tx(s,'readwrite',o=>o.delete(k)),all=s=>tx(s,'readonly',o=>o.getAll());
const saveP=()=>put('prefs',P),saveC=c=>put('convs',c);
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))),unb=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function hash(pw,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']);return b64(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},k,256))}
const key=()=>memKey||P.key,mask=k=>k.slice(0,6)+'…'+k.slice(-4);
const rd=(f,k)=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r['readAs'+k](f)});
const dl=(t,n,ty='application/json')=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:ty}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1e3)};
function toast(m){const t=document.createElement('div');t.textContent=m;$('#toast').append(t);setTimeout(()=>t.remove(),3800)}

/* ---------- presets ---------- */
const SER={Fable:['Fable 5.2','Fable 5.1','Fable 5'],Opus:['Opus 5.5','Opus 5','Opus 4.8','Opus 4.7','Opus 4.6','Opus 3'],Sonnet:['Sonnet 5.5','Sonnet 5','Sonnet 4.6'],Haiku:['Haiku 5.5']};
const STY={Fable:'imaginative, vivid writing and storytelling; explain with analogies; creative but accurate',Opus:'deep, rigorous reasoning; thorough step-by-step analysis; careful, complete code that handles edge cases',Sonnet:'balanced and practical; clear explanations; clean, idiomatic code; moderate length',Haiku:'fast and concise; short direct answers; minimal code with brief comments'};
const defPresets=()=>Object.fromEntries(Object.entries(SER).flatMap(([s,l])=>l.map(n=>[n,{series:s,model:'openrouter/auto',prompt:`You are "${n}", a custom OpenQuex assistant persona. You are not an official Anthropic release. Style: ${STY[s]}. Use Markdown, put code in fenced blocks with language tags, and separate paragraphs with blank lines.`}])));
const EFF={low:'low',medium:'medium',high:'high',extra:'high',max:'high'},EFFTXT={extra:'Think carefully and verify your work before answering.',max:'Reason as exhaustively as possible, check edge cases and verify before answering.'};
function selection(){if(P.sel.t==='fc'&&P.presets[P.sel.id]){const p=P.presets[P.sel.id];return{model:p.model,sys:p.prompt,label:P.sel.id}}return{model:P.sel.id,sys:P.sys,label:catalog?.find(x=>x.id===P.sel.id)?.name||P.sel.id}}
const modelLabel=()=>selection().label,reasoningOK=id=>!!catalog?.find(x=>x.id===id)?.supported_parameters?.includes('reasoning');

/* ---------- markdown + code ---------- */
const hl=c=>c.replace(/(\/\/.*|#.*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(\d+\.?\d*)\b|\b(function|const|let|var|return|if|else|for|while|class|import|from|export|def|async|await|new|try|catch|throw|in|of|true|false|null|None|True|False|self|this|public|private|static|void|int|string)\b|([&<>])/g,(m,a,s,n,k)=>a?`<i class="c">${esc(a)}</i>`:s?`<i class="s">${esc(s)}</i>`:n?`<i class="n">${n}</i>`:k?`<i class="k">${k}</i>`:esc(m));
const codebox=(l,c)=>`<div class="cb" data-l="${esc(l.toLowerCase())}"><div class="ch"><span>${esc(l||'text')}</span><button class="ic sm" data-c="c" title="Copy code">${ic('copy')}</button><button class="ic sm" data-c="d" title="Download">${ic('download')}</button><button class="ic sm" data-c="x" title="Expand or collapse">${ic('chevrons-up-down')}</button></div><pre>${c.split('\n').map(x=>`<span class="ln">${hl(x)}</span>`).join('')}</pre></div>`;
const inl=t=>t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(^|\W)\*(?!\s)(.+?)\*(?=\W|$)/g,'$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
function md(src){const bl=[];let s=src.replace(/```([\w+-]*)\n?([\s\S]*?)(```|$)/g,(_,l,c)=>{bl.push(codebox(l,c.replace(/\n$/,'')));return `\u0000${bl.length-1}\u0000`});
 let out='',list=null,m;const cl=()=>{if(list){out+=`</${list}>`;list=null}};
 for(const ln of esc(s).split('\n')){
  if(m=ln.match(/^(#{1,4})\s+(.*)/)){cl();const n=m[1].length+1;out+=`<h${n}>${inl(m[2])}</h${n}>`}
  else if(m=ln.match(/^\s*([-*]|\d+\.)\s+(.*)/)){const t=/\d/.test(m[1])?'ol':'ul';if(list!==t){cl();out+=`<${t}>`;list=t}out+=`<li>${inl(m[2])}</li>`}
  else if(m=ln.match(/^&gt;\s?(.*)/)){cl();out+=`<blockquote>${inl(m[1])}</blockquote>`}
  else if(!ln.trim())cl();
  else{cl();out+=`<p>${inl(ln.replace(/`([^`]+)`/g,'<code>$1</code>'))}</p>`}}
 cl();return out.replace(/<p>\u0000(\d+)\u0000<\/p>/g,(_,i)=>bl[i])}

/* ---------- auth ---------- */
$$('#authForm .tabs button').forEach(b=>b.onclick=()=>{mode=b.dataset.m;$('#authForm').dataset.m=mode;$$('#authForm .tabs button').forEach(x=>x.classList.toggle('on',x===b));$('#authGo').textContent=mode==='reg'?'Create account':'Log in';$('#aUser').placeholder=mode==='reg'?'Username':'Username or email';$('#authErr').textContent=''});
$('#authForm').onsubmit=async e=>{e.preventDefault();const err=m=>($('#authErr').textContent=m),un=$('#aUser').value.trim(),pw=$('#aPass').value;err('');
 try{if(mode==='reg'){const em=$('#aEmail').value.trim().toLowerCase();
   if(!/^\w{3,24}$/.test(un))return err('Username must be 3–24 letters, numbers or underscores.');
   if(!/^\S+@\S+\.\S+$/.test(em))return err('Enter a valid email address.');
   if(pw.length<8||!/\d/.test(pw)||!/[a-z]/i.test(pw))return err('Password needs 8+ characters with letters and numbers.');
   if(pw!==$('#aPass2').value)return err('Passwords do not match.');
   if((await all('users')).some(u=>u.username.toLowerCase()===un.toLowerCase()||u.email===em))return err('That username or email is already registered here.');
   const salt=crypto.getRandomValues(new Uint8Array(16)),u={username:un,email:em,display:un,salt:b64(salt),hash:await hash(pw,salt)};
   await put('users',u);toast('Account created on this device.');await start(u,$('#aRem').checked)
  }else{const k=un.toLowerCase(),u=(await all('users')).find(x=>x.username.toLowerCase()===k||x.email===k);
   if(!u||await hash(pw,unb(u.salt))!==u.hash)return err('Wrong username, email or password.');
   await start(u,$('#aRem').checked)}
  $('#aPass').value=$('#aPass2').value=''
 }catch{err('Account features need HTTPS or localhost (Web Crypto and IndexedDB).')}};
async function start(u,rem){if(rem!==undefined)(rem?localStorage:sessionStorage).setItem('oq_s',u.username);
 me=u;memKey='';P=Object.assign({user:u.username,fav:[],recent:[],sel:{t:'or',id:'openrouter/auto'},effort:'medium',enter:true,sys:'',key:'',store:false},await get('prefs',u.username));
 P.presets=Object.assign(defPresets(),P.presets||{});convs=await tx('convs','readonly',o=>o.index('user').getAll(u.username));cur=null;files=[];
 $('#auth').hidden=true;$('#app').hidden=false;head();renderUser();renderList();renderChat();renderAtts();loadCatalog()}
function logout(){localStorage.removeItem('oq_s');sessionStorage.removeItem('oq_s');ctrl?.abort();me=P=null;$('#dlg').close();$('#app').hidden=true;$('#auth').hidden=false}

/* ---------- sidebar ---------- */
const row=c=>`<div class="row${c===cur?' on':''}" data-id="${c.id}"><span>${esc(c.title)}</span><button class="ic sm" data-more="1" aria-label="Chat actions">${ic('more-horizontal')}</button></div>`;
function renderList(){const q=$('#q').value.toLowerCase(),f=convs.filter(c=>!q||c.title.toLowerCase().includes(q)||c.messages.some(m=>m.content.toLowerCase().includes(q)));
 const live=f.filter(c=>!c.archived).sort((a,b)=>b.updated-a.updated),sec=(t,a)=>a.length?`<h4>${t}</h4>`+a.map(row).join(''):'';
 $('#list').innerHTML=sec('Pinned',live.filter(c=>c.pinned))+sec('Recent',live.filter(c=>!c.pinned))+(showArch?sec('Archived',f.filter(c=>c.archived)):'')||'<p class="muted pad">No chats yet.</p>';icons()}
const renderUser=()=>{$('#userBox').innerHTML=`<div class="av">${esc(me.display[0].toUpperCase())}</div><div><b>${esc(me.display)}</b><div class="muted" style="font-size:12px">Local account</div></div>`};
const closeSide=()=>$('#side').classList.remove('open');
const newChat=()=>{if(ctrl)return;cur=null;files=[];renderAtts();renderChat();renderList();closeSide();$('#in').focus()};
const upd=async(c,o)=>{Object.assign(c,o);await saveC(c);renderList()};
function popup(btn,items){const p=$('#pop');p.innerHTML=items.map((it,i)=>`<button data-i="${i}">${ic(it[1])}${it[0]}</button>`).join('');p.hidden=false;const r=btn.getBoundingClientRect();let t=r.bottom+4;if(t+p.offsetHeight>innerHeight-8)t=r.top-p.offsetHeight-4;p.style.top=Math.max(8,t)+'px';p.style.left=Math.max(8,Math.min(r.left,innerWidth-p.offsetWidth-8))+'px';p.onclick=e=>{const b=e.target.closest('button');if(b){p.hidden=true;items[b.dataset.i][2]()}};icons()}
document.addEventListener('click',e=>{if(!e.target.closest('#pop,[data-more],#plus'))$('#pop').hidden=true},true);
$('#list').onclick=e=>{const r=e.target.closest('.row');if(!r)return;const c=convs.find(x=>x.id===r.dataset.id);
 if(e.target.closest('[data-more]'))return popup(e.target.closest('[data-more]'),[['Rename','pencil',async()=>{const t=await ask('Rename chat',c.title);if(t&&t.trim())upd(c,{title:t.trim().slice(0,80)})}],[c.pinned?'Unpin':'Pin','pin',()=>upd(c,{pinned:!c.pinned})],[c.archived?'Restore':'Archive','archive',()=>upd(c,{archived:!c.archived})],['Delete','trash-2',async()=>{if(!confirm('Delete this chat permanently?'))return;await del('convs',c.id);convs=convs.filter(x=>x!==c);if(cur===c)cur=null;renderList();renderChat()}]]);
 if(ctrl)return toast('Wait for the response to finish or stop it first.');cur=c;renderChat();renderList();closeSide()};
$('#q').oninput=renderList;$('#newChat').onclick=newChat;$('#menu').onclick=()=>$('#side').classList.toggle('open');
$('#arch').onclick=()=>{showArch=!showArch;renderList()};$('#setBtn').onclick=$('#userBox').onclick=()=>openSettings();$('#modelBtn').onclick=openModels;
$('#effort').onchange=e=>{P.effort=e.target.value;saveP()};$('main').addEventListener('click',()=>closeSide());

/* ---------- chat rendering ---------- */
const scroll=()=>{const m=$('#msgs');m.scrollTop=m.scrollHeight};
const bodyHTML=m=>m.role==='user'?(m.images||[]).map(s=>`<img src="${esc(s)}" alt="attachment">`).join('')+(m.att||[]).map(n=>`<div class="muted">${esc(n)}</div>`).join('')+`<div class="pre">${esc(m.content)}</div>`:(m.reasoning?`<details class="think"><summary>Show thinking</summary><div class="pre">${esc(m.reasoning)}</div></details>`:'')+(m.error?`<div class="err">${esc(m.error)}</div><button class="btn" data-a="retry">${ic('rotate-cw')}Retry</button>`:m.content?md(m.content):'<span class="dots"><b></b><b></b><b></b></span>');
function msgHTML(m,i){const u=m.role==='user',last=i===cur.messages.length-1,t=new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),b=(a,n,x)=>`<button class="ic sm${m.fb===a?' fav':''}" data-a="${a}" title="${x}" aria-label="${x}">${ic(n)}</button>`;
 return `<div class="msg ${m.role}" data-i="${i}"><div class="body">${bodyHTML(m)}</div><div class="meta"><span>${u?'You':esc(m.model||'')} · ${t}${m.dur?` · generated in ${(m.dur/1000).toFixed(1)}s`:''}${m.usage?.total_tokens?` · ${m.usage.total_tokens} tokens`:''}</span>${b('copy','copy','Copy')}${u?b('edit','pencil','Edit'):(last&&!m.error?b('regen','refresh-cw','Regenerate'):'')+b('up','thumbs-up','Good response')+b('down','thumbs-down','Bad response')}${b('del','trash-2','Delete')}</div></div>`}
function renderChat(){const m=$('#msgs');
 if(!cur||!cur.messages.length)m.innerHTML=`<div class="welcome"><svg class="logo big"><use href="#logo"/></svg><h2>Hi ${esc(me.display)}, what are we building?</h2><p class="muted">${key()?'':'Add your OpenRouter key in Settings to start. '}Current model: <b>${esc(modelLabel())}</b></p><div class="sug">${['Explain how closures work in JavaScript','Write a Python script that renames files by date','Draft a polite follow-up email','Summarize the pros and cons of SQL and NoSQL'].map(s=>`<button class="btn" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
 else m.innerHTML=cur.messages.map(msgHTML).join('');icons();scroll()}
function paint(a,c){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const b=cur===c&&$('#msgs .msg:last-child .body');if(!b)return;const o=$('details',b)?.open,m=$('#msgs'),near=m.scrollHeight-m.scrollTop-m.clientHeight<160;b.innerHTML=bodyHTML(a);if(o)$('details',b).open=true;if(near)scroll()})}
const head=()=>{$('#modelBtn').innerHTML=`${ic('sparkles')}<span>${esc(modelLabel())}</span>${ic('chevron-down')}`;$('#effort').value=P.effort;icons()};
function setBusy(b){$('#send').innerHTML=ic(b?'square':'arrow-up');icons()}

/* ---------- sending ---------- */
async function send(text){text=text.trim();if(!(text||files.length)||ctrl)return;
 if(!key()){toast('Add your OpenRouter API key first.');return openSettings()}
 const imgs=files.filter(f=>f.img).map(f=>f.data),sel=selection(),cm=catalog?.find(x=>x.id===sel.model);
 if(imgs.length&&cm&&!cm.architecture?.input_modalities?.includes('image'))return toast(`${cm.name} doesn't accept images. Pick a model with the Vision badge.`);
 if(!cur){cur={id:uid(),user:me.username,title:(text||files[0].name).slice(0,40),pinned:false,archived:false,updated:Date.now(),messages:[]};convs.push(cur)}
 cur.messages.push({id:uid(),role:'user',content:text,images:imgs,att:files.filter(f=>!f.img).map(f=>f.name),ctx:files.filter(f=>!f.img).map(f=>`\n\n[File: ${f.name}]\n\`\`\`\n${f.data}\n\`\`\``).join(''),ts:Date.now()});
 files=[];renderAtts();$('#in').value='';autosize();await run()}
async function run(){const c=cur,sel=selection(),a={id:uid(),role:'assistant',content:'',model:sel.label,ts:Date.now()},t0=performance.now();
 c.messages.push(a);ctrl=new AbortController();setBusy(true);renderChat();renderList();
 try{const rs=reasoningOK(sel.model),sys=[sel.sys,!rs&&EFFTXT[P.effort]].filter(Boolean).join('\n\n'),msgs=sys?[{role:'system',content:sys}]:[];
  for(const m of c.messages.slice(0,-1)){if(m.error)continue;const t=m.content+(m.ctx||'');msgs.push({role:m.role,content:m.images?.length?[{type:'text',text:t||'See image.'},...m.images.map(u=>({type:'image_url',image_url:{url:u}}))]:t})}
  const body={model:sel.model,messages:msgs,stream:true,usage:{include:true}};if(rs)body.reasoning={effort:EFF[P.effort]};
  const r=await fetch(B+'/chat/completions',{method:'POST',signal:ctrl.signal,headers:{Authorization:'Bearer '+key(),'Content-Type':'application/json','HTTP-Referer':location.origin,'X-Title':'OpenQuex'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(await apiErr(r));
  const rdr=r.body.getReader(),dec=new TextDecoder();let buf='';
  for(;;){const{done,value}=await rdr.read();if(done)break;buf+=dec.decode(value,{stream:true});const parts=buf.split('\n');buf=parts.pop();
   for(const l of parts){if(!l.startsWith('data: '))continue;const d=l.slice(6).trim();if(d==='[DONE]')continue;let j;try{j=JSON.parse(d)}catch{continue}
    if(j.error)throw new Error(j.error.message||'Provider error.');const dl=j.choices?.[0]?.delta;
    if(dl?.content)a.content+=dl.content;if(dl?.reasoning)a.reasoning=(a.reasoning||'')+dl.reasoning;if(j.usage)a.usage=j.usage;paint(a,c)}}
  if(!a.content&&!a.reasoning)throw new Error('The model returned no content.')
 }catch(e){if(e.name==='AbortError'){if(!a.content&&!a.reasoning)c.messages.pop()}else a.error=e instanceof TypeError?'Network error. Check your connection and retry.':e.message||'Request failed.'}
 finally{a.dur=performance.now()-t0;ctrl=null;setBusy(false);c.updated=Date.now();await saveC(c);if(cur===c)renderChat();renderList()}}
async function apiErr(r){let m='';try{m=(await r.json()).error?.message||''}catch{}
 return`${{401:'Invalid or expired API key.',402:'Insufficient credits for this model.',403:'This model or request is restricted for your key.',404:'Model not found or unavailable.',408:'Request timed out.',429:'Rate limited. Wait a moment and retry.'}[r.status]||'Request failed ('+r.status+').'} ${m}`.trim()}
const go=()=>send($('#in').value),autosize=()=>{const t=$('#in');t.style.height='auto';t.style.height=Math.min(t.scrollHeight,200)+'px'};
$('#send').onclick=()=>ctrl?ctrl.abort():go();$('#in').oninput=autosize;
$('#in').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&(P.enter?!e.shiftKey:e.ctrlKey||e.metaKey)){e.preventDefault();go()}};
$('#msgs').onclick=async e=>{const s=e.target.closest('[data-s]');if(s){$('#in').value=s.dataset.s;return go()}
 const cb=e.target.closest('[data-c]');
 if(cb){const box=cb.closest('.cb'),code=$$('.ln',box).map(x=>x.textContent).join('\n'),k=cb.dataset.c;
  if(k==='x')box.classList.toggle('closed');else if(k==='c')navigator.clipboard.writeText(code).then(()=>toast('Code copied'),()=>toast('Copy failed'));
  else dl(code,'code.'+({javascript:'js',js:'js',python:'py',py:'py',html:'html',css:'css',json:'json',java:'java',bash:'sh',sh:'sh'}[box.dataset.l]||'txt'),'text/plain');return}
 const a=e.target.closest('[data-a]');if(!a||ctrl)return;const el=a.closest('.msg'),i=+el.dataset.i,m=cur.messages[i],k=a.dataset.a;
 if(k==='copy')navigator.clipboard.writeText(m.content).then(()=>toast('Copied'),()=>toast('Copy failed'));
 else if(k==='up'||k==='down'){m.fb=m.fb===k?null:k;await saveC(cur);renderChat()}
 else if(k==='del'){cur.messages.splice(i,1);await saveC(cur);renderChat()}
 else if(k==='edit'){$('#in').value=m.content;cur.messages.splice(i);await saveC(cur);renderChat();autosize();$('#in').focus()}
 else if(k==='regen'){cur.messages.splice(i);await run()}
 else if(k==='retry'){cur.messages.pop();await run()}};

/* ---------- attachments ---------- */
$('#plus').onclick=e=>popup(e.currentTarget,[['Photos','image',()=>$('#fImg').click()],['Text & code files','file-text',()=>$('#fTxt').click()]]);
$('#fImg').onchange=e=>addFiles(e,true);$('#fTxt').onchange=e=>addFiles(e,false);
async function addFiles(e,img){for(const f of e.target.files){
  if(img){if(!/^image\/(png|jpe?g|gif|webp)$/.test(f.type)){toast(`${f.name}: use PNG, JPEG, GIF or WebP.`);continue}if(f.size>5e6){toast(`${f.name} is over 5 MB.`);continue}files.push({name:f.name,img:true,data:await rd(f,'DataURL')})}
  else{if(!/\.(txt|csv|json|xml|html|css|js|py|java|md)$/i.test(f.name)){toast(`${f.name}: only text and code files can be read locally.`);continue}if(f.size>2e5){toast(`${f.name} is over 200 KB.`);continue}files.push({name:f.name,data:await rd(f,'Text')})}}
 e.target.value='';renderAtts()}
function renderAtts(){$('#atts').innerHTML=files.map((f,i)=>`<span class="chip">${f.img?`<img src="${esc(f.data)}" alt="">`:ic('file')}${esc(f.name)}<button class="ic sm" data-rm="${i}" aria-label="Remove">${ic('x')}</button></span>`).join('');icons()}
$('#atts').onclick=e=>{const b=e.target.closest('[data-rm]');if(b){files.splice(+b.dataset.rm,1);renderAtts()}};

/* ---------- dialogs ---------- */
const modal=h=>{const d=$('#dlg');d.innerHTML=`<div class="in">${h}<button class="ic x" data-close aria-label="Close">${ic('x')}</button></div>`;d.showModal();icons()};
$('#dlg').addEventListener('click',e=>{if(e.target.id==='dlg'||e.target.closest('[data-close]'))$('#dlg').close()});
const ask=(t,v='',type='text')=>new Promise(res=>{modal(`<h3>${esc(t)}</h3><input id="ask" type="${type}" value="${esc(v)}"><div class="rowb"><button class="btn pri" id="ok">OK</button></div>`);const d=$('#dlg'),i=$('#ask');i.focus();$('#ok').onclick=()=>{const x=i.value;d.close();res(x)};i.onkeydown=e=>e.key==='Enter'&&$('#ok').click();d.onclose=()=>res(null)});

/* ---------- models ---------- */
const price=p=>p==null?'n/a':+p===0?'free':'$'+(p*1e6).toFixed(2)+'/M';
function loadCatalog(f){if(catalog&&!f)return catP;loading=true;catalog=null;return catP=(async()=>{try{const r=await fetch(B+'/models');if(!r.ok)throw 0;catalog=(await r.json()).data}catch{catalog=null}loading=false;if(P)head()})()}
function openModels(){modal(`<h3>Choose a model</h3><div class="tabs"><button data-c="or">OpenRouter Models</button><button data-c="fc">Fake Claude Models</button></div><div id="mtop"></div><div id="mlist"></div><div id="mfoot"></div>`);
 $$('#dlg .tabs button').forEach(b=>b.onclick=()=>{mcat=b.dataset.c;renderModels()});
 $('#mlist').onclick=e=>{const f=e.target.closest('[data-f]');if(f){const id=f.dataset.f;P.fav=P.fav.includes(id)?P.fav.filter(x=>x!==id):[...P.fav,id];saveP();return renderModels()}
  const m=e.target.closest('[data-m]');if(m)return pick(m.dataset.m);
  const p=e.target.closest('[data-p]');if(p){edit=p.dataset.p;P.sel={t:'fc',id:edit};saveP();head();renderModels();if(!cur?.messages.length)renderChat()}};
 $('#mfoot').onclick=e=>{const b=e.target.closest('button');if(!b)return;
  if(b.id==='mref'){loadCatalog(true).then(renderModels);renderModels()}
  else if(b.id==='cuse'){const v=$('#cid').value.trim();if(v)pick(v)}
  else if(b.id==='psave'){const p=P.presets[edit];p.model=$('#pm').value.trim()||'openrouter/auto';p.prompt=$('#pp').value;saveP();renderModels();toast('Preset saved')}
  else if(b.id==='preset'){P.presets[edit]=defPresets()[edit];saveP();renderModels()}};
 if(!catalog)(loading?catP:loadCatalog()).then(renderModels);renderModels()}
function pick(id){P.sel={t:'or',id};P.recent=[id,...P.recent.filter(x=>x!==id)].slice(0,8);saveP();head();$('#dlg').close();if(!cur?.messages.length)renderChat()}
function renderModels(){const L=$('#mlist'),T=$('#mtop'),F=$('#mfoot');if(!L)return;$$('#dlg .tabs button').forEach(b=>b.classList.toggle('on',b.dataset.c===mcat));
 if(mcat==='fc'){T.innerHTML='<p class="muted">Custom presets, not official Anthropic releases. They use your OpenRouter key and the underlying model ID you set.</p>';
  L.innerHTML=Object.entries(P.presets).map(([n,p])=>`<div class="mrow${P.sel.t==='fc'&&P.sel.id===n?' on':''}" data-p="${esc(n)}"><div><b>${esc(n)}</b><small>${esc(p.series||'Custom')} series · ${esc(p.model)}</small></div></div>`).join('');
  const p=P.presets[edit];F.innerHTML=p?`<h4>${esc(edit)}</h4><input id="pm" value="${esc(p.model)}" placeholder="OpenRouter model ID"><textarea id="pp" rows="5">${esc(p.prompt)}</textarea><div class="rowb"><button class="btn pri" id="psave">Save preset</button><button class="btn" id="preset">Reset</button></div>`:'<p class="muted">Select a preset to edit its model and system prompt.</p>';return icons()}
 if(!$('#mq')){T.innerHTML=`<input id="mq" type="search" placeholder="Search models" value="${esc(mq)}" aria-label="Search models">`;$('#mq').oninput=e=>{mq=e.target.value.toLowerCase();renderModels()}}
 if(!catalog){L.innerHTML=loading?'<div class="sk"></div>'.repeat(5):'<p class="err">Couldn\'t load the model catalog. Check your connection and retry.</p>';F.innerHTML=`<button class="btn" id="mref">${ic('refresh-cw')}${loading?'Loading…':'Retry'}</button>`;return icons()}
 const rank=m=>P.fav.includes(m.id)?0:P.recent.includes(m.id)?1:2,hit=catalog.filter(m=>!mq||(m.id+' '+m.name).toLowerCase().includes(mq)).sort((a,b)=>rank(a)-rank(b));
 L.innerHTML=hit.slice(0,80).map(m=>{const pr=m.pricing||{},free=+pr.prompt===0&&+pr.completion===0,img=m.architecture?.input_modalities?.includes('image');
  return`<div class="mrow${P.sel.t==='or'&&P.sel.id===m.id?' on':''}" data-m="${esc(m.id)}"><div><b>${esc(m.name)}</b> ${free?'<span class="badge">Free</span> ':''}${img?'<span class="badge">Vision</span> ':''}<small>${esc(m.id)} · ${Math.round((m.context_length||0)/1000)}k context · in ${price(pr.prompt)} · out ${price(pr.completion)}</small><small>${esc((m.description||'').slice(0,110))}</small></div><button class="ic sm${P.fav.includes(m.id)?' fav':''}" data-f="${esc(m.id)}" aria-label="Favorite">${ic('star')}</button></div>`}).join('')||'<p class="muted">No models match.</p>';
 if(hit.length>80)L.innerHTML+=`<p class="muted pad">Showing 80 of ${hit.length}. Search to narrow down.</p>`;
 F.innerHTML=`<div class="rowb"><input id="cid" placeholder="Custom model ID, e.g. vendor/model" style="flex:1;margin:0"><button class="btn" id="cuse">Use</button><button class="btn" id="mref">${ic('refresh-cw')}Refresh</button></div>`;icons()}

/* ---------- settings ---------- */
function openSettings(){if(!me)return;const k=key();
 modal(`<h3>Settings</h3><h4>OpenRouter API key</h4><p class="muted">Status: <b>${k?'Key in use '+esc(mask(k)):'Not connected'}</b>. A key kept in the browser can be read by anyone using this browser; it is not protected like a server secret.</p>
 <input id="kin" type="password" placeholder="${k?'Paste a new key to replace it':'sk-or-…'}" autocomplete="off"><label class="chk"><input type="checkbox" id="kst" ${P.store?'checked':''}> Save this key on this device (unencrypted local storage)</label>
 <div class="rowb"><button class="btn pri" id="kgo">Validate &amp; connect</button><button class="btn" id="kdis">Disconnect</button></div>
 <h4>Chat</h4><label class="chk"><input type="checkbox" id="senter" ${P.enter?'checked':''}> Enter sends (Shift+Enter adds a line)</label><textarea id="ssys" rows="3" placeholder="Custom system prompt for OpenRouter models">${esc(P.sys)}</textarea>
 <h4>Profile</h4><input id="sdn" value="${esc(me.display)}" placeholder="Display name" maxlength="40"><p class="muted">${esc(me.email)}</p><div class="rowb"><button class="btn pri" id="ssave">Save settings</button><button class="btn" id="spw">Change password</button></div>
 <h4>Data</h4><p class="muted" id="sstat"></p><p class="muted">Clearing browser site data deletes local accounts and chats unless you export a backup. Backups exclude your API key and password.</p>
 <div class="rowb"><button class="btn" id="sexp">${ic('download')}Export</button><button class="btn" id="simp">${ic('upload')}Import</button><button class="btn" id="slog">${ic('log-out')}Log out</button><button class="btn danger" id="sdel">${ic('trash-2')}Delete account</button></div>`);
 const n=convs.reduce((s,c)=>s+c.messages.length,0),at=convs.reduce((s,c)=>s+c.messages.reduce((q,m)=>q+(m.images?.length||0)+(m.att?.length||0),0),0);
 navigator.storage?.estimate?.().then(e=>{const s=$('#sstat');if(s)s.textContent=`${convs.length} chats · ${n} messages · ${at} attachments · about ${((e.usage||0)/1048576).toFixed(1)} MB used`});
 $('#kgo').onclick=async()=>{const v=$('#kin').value.trim();if(!v)return toast('Paste your key first.');const r=await fetch(B+'/auth/key',{headers:{Authorization:'Bearer '+v}}).catch(()=>null);
  if(!r||!r.ok)return toast(r?'OpenRouter rejected this key.':'Network error. Could not reach OpenRouter.');const d=(await r.json()).data||{};
  P.store=$('#kst').checked;memKey=v;P.key=P.store?v:'';await saveP();toast(`Connected${d.usage!=null?` · usage $${(+d.usage).toFixed(4)}`:''}`);openSettings();renderChat()};
 $('#kdis').onclick=async()=>{memKey='';P.key='';await saveP();toast('Disconnected.');openSettings()};
 $('#ssave').onclick=async()=>{P.enter=$('#senter').checked;P.sys=$('#ssys').value;me.display=$('#sdn').value.trim()||me.username;await put('users',me);await saveP();renderUser();renderChat();toast('Settings saved')};
 $('#spw').onclick=async()=>{const o=await ask('Current password','','password');if(o==null)return;if(await hash(o,unb(me.salt))!==me.hash)return toast('Current password is wrong.');
  const p=await ask('New password (8+ characters, letters and numbers)','','password');if(p==null)return;if(p.length<8||!/\d/.test(p)||!/[a-z]/i.test(p))return toast('New password is too weak.');
  const s=crypto.getRandomValues(new Uint8Array(16));me.salt=b64(s);me.hash=await hash(p,s);await put('users',me);toast('Password changed.')};
 $('#sexp').onclick=()=>{const{salt,hash:h,...u}=me,{key:_,...p}=P;dl(JSON.stringify({app:'openquex',v:1,profile:u,prefs:p,convs},null,1),`openquex-${me.username}.json`)};
 $('#simp').onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='.json';i.onchange=async()=>{try{const d=JSON.parse(await rd(i.files[0],'Text'));if(d.app!=='openquex'||!Array.isArray(d.convs))throw 0;
  const ok=d.convs.filter(c=>c&&typeof c.title==='string'&&Array.isArray(c.messages)&&c.messages.every(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'));
  if(!ok.length||!confirm(`Import ${ok.length} chats? Your existing chats are kept.`))return;
  for(const c of ok){const x={id:uid(),user:me.username,title:c.title.slice(0,80),pinned:!!c.pinned,archived:!!c.archived,updated:+c.updated||Date.now(),messages:c.messages.map(m=>({id:uid(),role:m.role,content:m.content,model:String(m.model||''),ts:+m.ts||Date.now(),images:(m.images||[]).filter(s=>/^data:image\//.test(s)),att:(m.att||[]).map(String),ctx:typeof m.ctx==='string'?m.ctx:''}))};await put('convs',x);convs.push(x)}
  renderList();toast('Backup imported.')}catch{toast('That file is not a valid OpenQuex backup.')}};i.click()};
 $('#slog').onclick=logout;
 $('#sdel').onclick=async()=>{if(!confirm('Delete this account and all its chats from this browser? This cannot be undone.'))return;for(const c of convs)await del('convs',c.id);await del('prefs',me.username);await del('users',me.username);logout()}}

/* ---------- shortcuts + boot ---------- */
addEventListener('keydown',e=>{if(!me)return;const m=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
 if(m&&k==='k'){e.preventDefault();$('#side').classList.add('open');$('#q').focus()}
 else if(m&&e.shiftKey&&k==='o'){e.preventDefault();newChat()}
 else if(e.key==='Escape'){$('#pop').hidden=true;closeSide()}});
(async()=>{try{await idb()}catch{return($('#authErr').textContent='IndexedDB is unavailable in this browser.')}
 icons();const s=localStorage.getItem('oq_s')||sessionStorage.getItem('oq_s'),u=s&&await get('users',s);if(u)start(u)})();
