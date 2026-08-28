(function(){
'use strict';
const V=window.WAOpsV3;if(!V)return;
const q=V.q,qa=V.qa;
function reapply(){setTimeout(()=>{V.cluster?.();V.refresh?.()},0)}
qa('[data-layer-toggle]').forEach(x=>x.addEventListener('change',reapply));
qa('[data-layer-preset]').forEach(x=>x.addEventListener('click',()=>setTimeout(reapply,20)));
function sharedEmptyLayers(){if(!location.hash.includes('v=3'))return;const p=new URLSearchParams(location.hash.slice(1));if(!p.has('layers'))return;const wanted=(p.get('layers')||'').split(',').filter(Boolean);if(wanted.length)return;qa('[data-layer-toggle]').forEach(x=>{if(x.checked){x.checked=false;x.dispatchEvent(new Event('change',{bubbles:true}))}})}
function refreshFireFromLoadedFeed(){const items=typeof feedData!=='undefined'?(feedData.emergency||[]):[],tfb=items.filter(i=>/total fire ban/i.test(`${i.title||''} ${i.description||''}`)),fdr=items.filter(i=>/fire danger|catastrophic|extreme fire/i.test(`${i.title||''} ${i.description||''}`)),tv=q('#v3TfbValue'),tl=q('#v3TfbLabel'),fv=q('#v3FdrValue'),fl=q('#v3FdrLabel');if(tfb.length&&tv&&tl){tv.textContent=`${tfb.length} notice${tfb.length===1?'':'s'}`;tv.style.color='#fecaca';tl.textContent=tfb.slice(0,2).map(x=>x.title).join(' · ')}if(fdr.length&&fv&&fl&&/Official forecast|Checking|Open BOM/.test(fv.textContent)){fv.textContent=fdr[0].title||'Fire danger notice';fl.textContent='A fire danger notice is present in the current Emergency WA feed.'}}
function fixBasemapControl(){const base=q('.basemap-switcher');if(!base)return false;base.classList.add('leaflet-control');base.style.pointerEvents='auto';base.style.position=base.parentElement?.classList?.contains('leaflet-control-container')?'absolute':base.style.position;qa('[data-basemap]').forEach(b=>{b.style.pointerEvents='auto';b.disabled=false;b.setAttribute('role','button')});try{if(window.L?.DomEvent){L.DomEvent.disableClickPropagation(base);L.DomEvent.disableScrollPropagation(base)}}catch{}return true}
setTimeout(()=>{sharedEmptyLayers();V.refresh?.();refreshFireFromLoadedFeed();fixBasemapControl()},250);
setTimeout(()=>{V.refresh?.();refreshFireFromLoadedFeed();fixBasemapControl()},1600);
setTimeout(()=>{V.refresh?.();refreshFireFromLoadedFeed();fixBasemapControl()},4500);
setTimeout(()=>{V.refresh?.();refreshFireFromLoadedFeed();fixBasemapControl()},10000);
window.addEventListener('offline',()=>V.toast?.('You are offline — showing cached dashboard shell and last loaded data',true));
window.addEventListener('online',()=>{V.toast?.('Connection restored');document.getElementById('refresh')?.click()});
if(!document.querySelector('link[data-waos-map-controls-fix]')){const l=document.createElement('link');l.rel='stylesheet';l.href='map-controls-hotfix.css?v=20260827-1835';l.dataset.waosMapControlsFix='1';document.head.appendChild(l)}
if(!document.querySelector('script[data-waos-swin]')){const s=document.createElement('script');s.src='swin-focus.js?v=20260827-1715';s.dataset.waosSwin='1';document.body.appendChild(s)}
if(!document.querySelector('script[data-waos-mr-cleanup]')){const s=document.createElement('script');s.src='main-roads-cleanup.js?v=20260827-1705';s.dataset.waosMrCleanup='1';document.body.appendChild(s)}
if(!document.querySelector('script[data-waos-swin-header]')){const s=document.createElement('script');s.src='swin-header-picture.js?v=20260827-1725';s.dataset.waosSwinHeader='1';document.body.appendChild(s)}
if(!document.querySelector('script[data-waos-swin-zones]')){const s=document.createElement('script');s.src='swin-zones.js?v=20260827-1845';s.dataset.waosSwinZones='1';document.body.appendChild(s)}
if(!document.querySelector('script[data-gridpulse-brand]')){const s=document.createElement('script');s.src='gridpulse-brand.js?v=20260828-1005';s.dataset.gridpulseBrand='1';document.body.appendChild(s)}
if(!document.querySelector('script[data-gridpulse-wp-live-guard]')){const s=document.createElement('script');s.src='wp-live-guard.js?v=20260828-1515';s.dataset.gridpulseWpLiveGuard='1';document.body.appendChild(s)}
fixBasemapControl();
})();
