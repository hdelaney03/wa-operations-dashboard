(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const fmt=n=>Number(n||0).toLocaleString('en-AU');
let ready=false,organising=false,currentFocus='priority',topPriorityItem=null;

function V(){return window.WAOpsV3||null}
function type(i){const v=V();return v?.type?v.type(i):String(i?.source||'').toLowerCase().includes('western')?'wp':String(i?.source||'').toLowerCase().includes('emergency')?'ewa':String(i?.source||'').toLowerCase().includes('main roads')?'mr':'bom'}
function wpCat(i){try{return typeof wpCategory==='function'?wpCategory(i):(i?.outageCategory||'unknown')}catch{return i?.outageCategory||'unknown'}}
function items(){const d=typeof feedData!=='undefined'&&feedData?feedData:{};return[...(d.emergency||[]),...(d.bom||[]),...(d.westernPower||[]),...(d.mainRoads||[])]}
function priority(){const v=V();return v?.priority?v.priority():items().filter(i=>type(i)==='ewa'||type(i)==='bom'||(type(i)==='wp'&&wpCat(i)==='unplanned')||(type(i)==='mr'&&['closed','incident'].includes(i.category)))}
function score(i){return V()?.score?.(i)||0}
function label(i){return V()?.label?.(i)||type(i).toUpperCase()}
function title(i){return i?.title||i?.affectedArea||i?.location||label(i)}

function ensureBriefing(){
  if(q('#wbBriefing'))return;
  const live=q('#liveIncidentsHeading')?.closest('.ops-section');if(!live)return;
  const s=document.createElement('section');s.id='wbBriefing';s.className='ops-section';
  s.innerHTML=`<div class="wb-briefing"><div class="wb-briefing-head"><div><span class="wb-kicker">Operational briefing</span><strong>What needs attention now</strong></div><span class="wb-health" id="wbHealth">Checking feeds</span></div><div class="wb-grid"><div class="wb-metric orange"><span>Priority items</span><b id="wbPriority">--</b></div><div class="wb-metric red"><span>Unplanned customers</span><b id="wbCustomers">--</b></div><div class="wb-metric blue"><span>Road closures</span><b id="wbClosures">--</b></div><div class="wb-metric yellow"><span>Warning items</span><b id="wbWarnings">--</b></div></div><button class="wb-top-priority" id="wbTopPriority" type="button"><strong>Highest priority:</strong> Loading current SWIN picture…</button><div class="wb-focus" id="wbFocus" aria-label="Operational focus modes"><button type="button" data-wb-focus="priority" class="active">Priority</button><button type="button" data-wb-focus="power">Power</button><button type="button" data-wb-focus="warnings">Warnings</button><button type="button" data-wb-focus="roads">Roads</button><button type="button" data-wb-focus="all">Everything</button></div><div class="wb-brief-actions"><button class="wb-copy" id="wbCopyBrief" type="button">Copy shift brief</button></div></div>`;
  live.insertAdjacentElement('beforebegin',s);
  qa('[data-wb-focus]',s).forEach(b=>b.addEventListener('click',()=>applyFocus(b.dataset.wbFocus)));
  q('#wbTopPriority',s)?.addEventListener('click',()=>{if(!topPriorityItem)return;try{focusMapItem(itemKey(topPriorityItem))}catch{const p=V()?.itemPoint?.(topPriorityItem);if(p)map?.setView?.([p.lat,p.lon],11,{animate:true})}});
  q('#wbCopyBrief',s)?.addEventListener('click',copyBrief);
}

function setLayers(next){
  const boxes=qa('[data-layer-toggle]');
  boxes.forEach(x=>{const k=x.dataset.layerToggle;const on=next[k]===true;if(x.checked!==on){x.checked=on;x.dispatchEvent(new Event('change',{bubbles:true}))}});
}
function clickFilter(name){const b=q(`[data-filter="${CSS.escape(name)}"]`);if(b)b.click()}
function applyFocus(mode){currentFocus=mode;qa('[data-wb-focus]').forEach(b=>b.classList.toggle('active',b.dataset.wbFocus===mode));
  if(mode==='priority'){setLayers({bom:true,ewa:true,wpUnplanned:true,wpPlanned:false,mr:true});clickFilter('priority')}
  if(mode==='power'){setLayers({bom:false,ewa:false,wpUnplanned:true,wpPlanned:true,mr:false});clickFilter('wp')}
  if(mode==='warnings'){setLayers({bom:true,ewa:true,wpUnplanned:false,wpPlanned:false,mr:false});clickFilter('all')}
  if(mode==='roads'){setLayers({bom:false,ewa:false,wpUnplanned:false,wpPlanned:false,mr:true});clickFilter('mr')}
  if(mode==='all'){setLayers({bom:true,ewa:true,wpUnplanned:true,wpPlanned:true,mr:true});clickFilter('all')}
  try{localStorage.setItem('waosWorkbenchFocusV1',mode)}catch{}
}

function severeWarningCount(){
  const d=typeof feedData!=='undefined'?feedData:{};const e=(d.emergency||[]).length;
  const b=(d.bom||[]).filter(i=>/severe|storm|flood|fire weather|heatwave|cyclone|destructive|damaging/i.test(`${i.title||''} ${i.description||''}`)).length;
  return e+b;
}
function health(){
  const d=typeof feedData!=='undefined'?feedData:{};const keys=['bom','emergency','westernPower','mainRoads'];let bad=0,old=0;
  for(const k of keys){const s=d.sources?.[k];if(s?.ok===false)bad++;const at=s?.fetchedAt||d.updatedAt;if(at){const m=(Date.now()-new Date(at).getTime())/60000;if(Number.isFinite(m)&&m>30)old++;}}
  if(bad)return{cls:'bad',text:`${bad} feed${bad===1?'':'s'} unavailable`};if(old)return{cls:'warn',text:`${old} stale feed${old===1?'':'s'}`};return{cls:'',text:'Feeds live'};
}
function updateBriefing(){
  if(!q('#wbBriefing'))return;const d=typeof feedData!=='undefined'?feedData:{};const wp=d.westernPower||[],mr=d.mainRoads||[],p=priority();
  const customers=wp.filter(i=>wpCat(i)==='unplanned').reduce((s,i)=>{const n=Number(i.customersImpacted);return s+(Number.isFinite(n)?n:0)},0);
  const closures=mr.filter(i=>i.category==='closed'||/closed/i.test(`${i.categoryLabel||''} ${i.title||''}`)).length;
  q('#wbPriority').textContent=fmt(p.length);q('#wbCustomers').textContent=fmt(customers);q('#wbClosures').textContent=fmt(closures);q('#wbWarnings').textContent=fmt(severeWarningCount());
  topPriorityItem=p[0]||null;const top=q('#wbTopPriority');if(top)top.innerHTML=topPriorityItem?`<strong>Highest priority:</strong> ${escapeHtml(label(topPriorityItem))} — ${escapeHtml(title(topPriorityItem))}`:'<strong>Highest priority:</strong> No priority incidents currently identified.';
  const h=health(),chip=q('#wbHealth');if(chip){chip.className=`wb-health ${h.cls}`.trim();chip.textContent=h.text}
  const statLabel=qa('.topstats .stat span').find(x=>/SWIN items|Live items|Priority/i.test(x.textContent));if(statLabel){statLabel.textContent='Priority';const strong=statLabel.parentElement?.querySelector('strong');if(strong)strong.textContent=fmt(p.length)}
}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

async function copyBrief(){
  const d=typeof feedData!=='undefined'?feedData:{},wp=d.westernPower||[],mr=d.mainRoads||[],p=priority();
  const customers=wp.filter(i=>wpCat(i)==='unplanned').reduce((s,i)=>s+(Number.isFinite(Number(i.customersImpacted))?Number(i.customersImpacted):0),0);
  const closures=mr.filter(i=>i.category==='closed'||/closed/i.test(`${i.categoryLabel||''} ${i.title||''}`)).length;
  const time=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth,dateStyle:'medium',timeStyle:'short'}).format(new Date());
  const lines=[`WAOS — SWIN operational brief`,`Generated ${time}`,`Priority items: ${p.length}`,`Unplanned power customers shown: ${customers.toLocaleString('en-AU')}`,`Road closures: ${closures}`,`Warning items: ${severeWarningCount()}`,'',...p.slice(0,6).map((i,n)=>`${n+1}. ${label(i)} — ${title(i)}`),'','Values are SWIN-scoped situational-awareness data; verify safety-critical information with official sources.'];
  try{await navigator.clipboard.writeText(lines.join('\n'));V()?.toast?.('SWIN shift brief copied')}catch{V()?.toast?.('Unable to copy briefing',true)}
}

function tidySections(){
  q('#swinOpsOverview')?.remove();
  const panel=q('.ops-panel .panel-content');if(!panel)return;
  const live=q('#liveIncidentsHeading')?.closest('.ops-section');
  const layers=q('.layergrid')?.closest('.ops-section');
  const weather=qa('.ops-panel .ops-section').find(s=>/SWIN weather overview/i.test(s.textContent));
  const trackers=q('#weatherTrackers');const areas=q('#v3MyAreas');const env=q('#v3Environment');
  const selected=q('#selectedTitle')?.closest('.ops-section');const healthSec=q('#weatherFeed')?.closest('.ops-section');
  const help=qa('.ops-panel .ops-section').find(s=>/Official sources/i.test(s.textContent));
  [layers,trackers,areas,env,selected,healthSec,help].filter(Boolean).forEach(s=>s.classList.add('wb-secondary'));
  [selected,healthSec,help].filter(Boolean).forEach(s=>s.classList.add('wb-tertiary'));
  const order=[q('#wbBriefing'),live,weather,trackers,layers,areas,env,selected,healthSec,help].filter(Boolean);
  const head=q('.ops-head');let anchor=head;for(const sec of order){if(sec.parentElement!==panel||sec.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',sec);anchor=sec}
  if(head){const h=head.querySelector('h2');if(h)h.textContent='SWIN Operations'}
  // Remove redundant help block while keeping official source verification links.
  if(help){const using=qa('details.fold',help).find(d=>/Using the map/i.test(d.querySelector('summary')?.textContent||''));using?.remove();const src=qa('details.fold',help).find(d=>/Official sources/i.test(d.querySelector('summary')?.textContent||''));if(src){const sm=src.querySelector('summary');if(sm)sm.innerHTML='Sources & verification <span class="foldhint">official links</span>';src.open=false}}
  // Secondary panels default closed; the important incident/weather areas stay open.
  [layers,trackers,areas,env,selected,healthSec].forEach(s=>{const d=s?.querySelector(':scope > details.fold');if(d&&s!==weather)d.open=false});
  // Rename a few sections to work-oriented labels.
  const a=areas?.querySelector(':scope > details > summary');if(a)a.innerHTML='Saved work areas <span class="foldhint">watch zones + alerts</span>';
  const e=env?.querySelector(':scope > details > summary');if(e)e.innerHTML='Fire & environment <span class="foldhint">FDR · TFB · air</span>';
  const l=layers?.querySelector(':scope > details > summary');if(l)l.innerHTML='Map layers <span class="foldhint">display controls</span>';
  const t=trackers?.querySelector(':scope > details > summary');if(t)t.innerHTML='Storm tracking <span class="foldhint">radar + lightning</span>';
}

function legend(){const l=q('.legend');if(!l||q('.wb-legend-head',l))return;const h=document.createElement('div');h.className='wb-legend-head';h.innerHTML='<span>Map key</span><button type="button" id="wbLegendToggle">Hide</button>';l.prepend(h);let collapsed=true;try{collapsed=localStorage.getItem('waosLegendOpenV1')!=='1'}catch{};const apply=()=>{l.classList.toggle('wb-collapsed',collapsed);q('#wbLegendToggle',l).textContent=collapsed?'Show':'Hide'};q('#wbLegendToggle',l).onclick=()=>{collapsed=!collapsed;try{localStorage.setItem('waosLegendOpenV1',collapsed?'0':'1')}catch{}apply()};apply()}

function shortcuts(){if(document.body.dataset.wbShortcuts)return;document.body.dataset.wbShortcuts='1';document.addEventListener('keydown',e=>{const tag=document.activeElement?.tagName;if(['INPUT','TEXTAREA','SELECT'].includes(tag)||document.activeElement?.isContentEditable||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(k==='r'){e.preventDefault();q('#refresh')?.click();V()?.toast?.('Refreshing SWIN feeds')}if(k==='p'){e.preventDefault();applyFocus('priority')}if(k==='1'){e.preventDefault();applyFocus('power')}if(k==='2'){e.preventDefault();applyFocus('warnings')}if(k==='3'){e.preventDefault();applyFocus('roads')}if(k==='0'){e.preventDefault();applyFocus('all')}})}

function organise(){if(organising)return;organising=true;try{document.body.classList.add('waos-workbench');ensureBriefing();tidySections();legend();updateBriefing();const label=qa('.topstats .stat span').find(x=>/Weather/i.test(x.textContent));if(label)label.textContent='SWIN weather';const ref=q('#refresh');if(ref)ref.textContent='Refresh';}finally{organising=false}}

function boot(){if(ready)return;if(typeof map==='undefined'||!map||typeof feedData==='undefined'||!q('.ops-panel')){setTimeout(boot,150);return}ready=true;organise();shortcuts();let saved='priority';try{saved=localStorage.getItem('waosWorkbenchFocusV1')||'priority'}catch{};setTimeout(()=>applyFocus(saved),900);setInterval(updateBriefing,3000);const panel=q('.ops-panel');if(panel)new MutationObserver(()=>organise()).observe(panel,{childList:true,subtree:true});q('#refresh')?.addEventListener('click',()=>setTimeout(()=>{organise();updateBriefing()},900));console.info('WAOS SWIN workbench loaded')}
boot();
})();
