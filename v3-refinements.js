(function(){
'use strict';
const V=window.WAOpsV3;if(!V)return;
const q=V.q,qa=V.qa;
function reapply(){setTimeout(()=>{V.cluster?.();V.refresh?.()},0)}
qa('[data-layer-toggle]').forEach(x=>x.addEventListener('change',reapply));
qa('[data-layer-preset]').forEach(x=>x.addEventListener('click',()=>setTimeout(reapply,20)));
function sharedEmptyLayers(){if(!location.hash.includes('v=3'))return;const p=new URLSearchParams(location.hash.slice(1));if(!p.has('layers'))return;const wanted=(p.get('layers')||'').split(',').filter(Boolean);if(wanted.length)return;qa('[data-layer-toggle]').forEach(x=>{if(x.checked){x.checked=false;x.dispatchEvent(new Event('change',{bubbles:true}))}})}
function refreshFireFromLoadedFeed(){const items=typeof feedData!=='undefined'?(feedData.emergency||[]):[],tfb=items.filter(i=>/total fire ban/i.test(`${i.title||''} ${i.description||''}`)),fdr=items.filter(i=>/fire danger|catastrophic|extreme fire/i.test(`${i.title||''} ${i.description||''}`)),tv=q('#v3TfbValue'),tl=q('#v3TfbLabel'),fv=q('#v3FdrValue'),fl=q('#v3FdrLabel');if(tfb.length&&tv&&tl){tv.textContent=`${tfb.length} notice${tfb.length===1?'':'s'}`;tv.style.color='#fecaca';tl.textContent=tfb.slice(0,2).map(x=>x.title).join(' · ')}if(fdr.length&&fv&&fl&&/Official forecast|Checking|Open BOM/.test(fv.textContent)){fv.textContent=fdr[0].title||'Fire danger notice';fl.textContent='A fire danger notice is present in the current Emergency WA feed.'}}
setTimeout(()=>{sharedEmptyLayers();V.refresh?.();refreshFireFromLoadedFeed()},1600);
setTimeout(()=>{V.refresh?.();refreshFireFromLoadedFeed()},4500);
setTimeout(()=>{V.refresh?.();refreshFireFromLoadedFeed()},10000);
window.addEventListener('offline',()=>V.toast?.('You are offline — showing cached dashboard shell and last loaded data',true));
window.addEventListener('online',()=>{V.toast?.('Connection restored');document.getElementById('refresh')?.click()});
if(!document.querySelector('script[data-waos-swin]')){const s=document.createElement('script');s.src='swin-focus.js?v=20260827-1635';s.dataset.waosSwin='1';document.body.appendChild(s)}
if(!document.querySelector('script[data-waos-mr-cleanup]')){const s=document.createElement('script');s.src='main-roads-cleanup.js?v=20260827-1705';s.dataset.waosMrCleanup='1';document.body.appendChild(s)}
})();
