(function(){
'use strict';
function category(i){try{return typeof wpCategory==='function'?wpCategory(i):(i?.outageCategory||'unknown')}catch{return i?.outageCategory||'unknown'}}
function update(){
  const d=typeof feedData!=='undefined'&&feedData?feedData:{},wp=Array.isArray(d.westernPower)?d.westernPower:[];
  const c={ewa:(d.emergency||[]).length,bom:(d.bom||[]).length,unplanned:wp.filter(x=>category(x)==='unplanned').length,planned:wp.filter(x=>category(x)==='planned').length,mr:(d.mainRoads||[]).length};c.total=c.ewa+c.bom+c.unplanned+c.planned+c.mr;
  const vals={swinHpEwa:c.ewa,swinHpBom:c.bom,swinHpUnplanned:c.unplanned,swinHpPlanned:c.planned,swinHpMr:c.mr,swinHpTotal:c.total};
  for(const[id,v]of Object.entries(vals)){const el=document.getElementById(id);if(el)el.textContent=Number(v).toLocaleString('en-AU')}
  document.getElementById('swinOpsOverview')?.remove();document.getElementById('swinSummary')?.remove();
}
function boot(){if(typeof feedData==='undefined'||!document.getElementById('swinHpTotal')){setTimeout(boot,120);return}update();setInterval(update,2000);document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(update,700))}
boot();
})();
