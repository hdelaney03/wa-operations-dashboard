(function(){
'use strict';

const q=s=>document.querySelector(s);

function injectStyles(){
  if(q('#swinHeaderPictureStyle'))return;
  const s=document.createElement('style');
  s.id='swinHeaderPictureStyle';
  s.textContent=`
    #swinSummary{display:none!important}
    body .mapcard.swin-header-picture{
      width:560px!important;height:60px!important;top:6px!important;left:16px!important;
      padding:6px 10px!important;border-left:3px solid #f97316!important;
      display:block!important;pointer-events:none!important;overflow:hidden!important;
    }
    .swin-hp-top{display:flex;align-items:center;gap:7px;min-width:0;margin-bottom:4px}
    .swin-hp-title{font-size:8.5px;font-weight:900;letter-spacing:.75px;text-transform:uppercase;color:#f5f5f5;white-space:nowrap}
    .swin-hp-sub{font-size:7.5px;color:#97a1ac;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .swin-hp-badge{margin-left:auto;flex:0 0 auto;border:1px solid #8c4d24;border-radius:999px;background:#3b2112;color:#fdba74;padding:2px 6px;font-size:7px;font-weight:950;letter-spacing:.7px}
    .swin-hp-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-bottom:3px}
    .swin-hp-stat{min-width:0;display:flex;align-items:baseline;justify-content:space-between;gap:4px;padding:2px 5px;border:1px solid #303740;border-radius:6px;background:#11151acc}
    .swin-hp-stat span{font-size:6.4px!important;line-height:1!important;color:#8f99a4!important;text-transform:uppercase;letter-spacing:.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .swin-hp-stat b{font-size:9.5px;line-height:1;color:#f5f5f5;font-variant-numeric:tabular-nums}
    .swin-hp-stat.em b{color:#fca5a5}.swin-hp-stat.bom b{color:#fde047}.swin-hp-stat.unp b{color:#fdba74}.swin-hp-stat.pln b{color:#86efac}.swin-hp-stat.mr b{color:#93c5fd}.swin-hp-stat.total b{color:#fff}
    .swin-hp-note{font-size:6.5px;line-height:1.12;color:#737d88;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:1450px){body .mapcard.swin-header-picture{width:485px!important}.swin-hp-sub{display:none}.swin-hp-stat span{font-size:5.9px!important}}
    @media(max-width:1180px){body .mapcard.swin-header-picture{width:410px!important}.swin-hp-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 4px}.swin-hp-note{display:none}.swin-hp-top{margin-bottom:2px}.swin-hp-stat{padding:2px 4px}}
    @media(max-width:900px){body .mapcard.swin-header-picture{width:calc(100vw - 118px)!important;left:8px!important}.swin-hp-title{font-size:7.5px}.swin-hp-badge{font-size:6px}}
  `;
  document.head.appendChild(s);
}

function category(i){
  try{if(typeof wpCategory==='function')return wpCategory(i)}catch{}
  if(i?.outageCategory)return i.outageCategory;
  if(i?.planned===true)return'planned';
  if(i?.planned===false)return'unplanned';
  return'unknown';
}

function counts(){
  const d=typeof feedData!=='undefined'&&feedData?feedData:{};
  const wp=Array.isArray(d.westernPower)?d.westernPower:[];
  const c={
    ewa:Array.isArray(d.emergency)?d.emergency.length:0,
    bom:Array.isArray(d.bom)?d.bom.length:0,
    unplanned:wp.filter(x=>category(x)==='unplanned').length,
    planned:wp.filter(x=>category(x)==='planned').length,
    mr:Array.isArray(d.mainRoads)?d.mainRoads.length:0
  };
  c.total=c.ewa+c.bom+c.unplanned+c.planned+c.mr;
  return c;
}

function build(){
  injectStyles();
  const host=q('.mapcard');
  if(!host)return false;
  host.classList.add('swin-header-picture');
  host.setAttribute('aria-label','SWIN operational picture');
  host.innerHTML=`
    <div class="swin-hp-top">
      <strong class="swin-hp-title">SWIN operational picture</strong>
      <span class="swin-hp-sub">Western Power network footprint only</span>
      <b class="swin-hp-badge">SWIN</b>
    </div>
    <div class="swin-hp-grid" aria-label="SWIN live operational counts">
      <div class="swin-hp-stat em"><span>Emergency WA</span><b id="swinHpEwa">--</b></div>
      <div class="swin-hp-stat bom"><span>BOM warnings</span><b id="swinHpBom">--</b></div>
      <div class="swin-hp-stat unp"><span>Unplanned power</span><b id="swinHpUnplanned">--</b></div>
      <div class="swin-hp-stat pln"><span>Planned power</span><b id="swinHpPlanned">--</b></div>
      <div class="swin-hp-stat mr"><span>Main Roads</span><b id="swinHpMr">--</b></div>
      <div class="swin-hp-stat total"><span>Total live items</span><b id="swinHpTotal">--</b></div>
    </div>
    <div class="swin-hp-note" title="All operational feeds on this page are scoped to items mapped within, crossing, or clearly referring to the Western Power SWIN footprint. Boundary is indicative for situational awareness.">All operational feeds on this page are scoped to items mapped within, crossing, or clearly referring to the Western Power SWIN footprint. Boundary is indicative for situational awareness.</div>`;
  q('#swinSummary')?.remove();
  return true;
}

function update(){
  if(!q('.mapcard.swin-header-picture')&&!build())return;
  const c=counts();
  const vals={swinHpEwa:c.ewa,swinHpBom:c.bom,swinHpUnplanned:c.unplanned,swinHpPlanned:c.planned,swinHpMr:c.mr,swinHpTotal:c.total};
  for(const [id,v] of Object.entries(vals)){const el=document.getElementById(id);if(el)el.textContent=Number(v).toLocaleString('en-AU')}
  q('#swinSummary')?.remove();
}

function boot(){
  if(!build()){setTimeout(boot,150);return}
  update();
  setInterval(update,2000);
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(update,800));
  const list=document.getElementById('warnings');
  if(list)new MutationObserver(()=>update()).observe(list,{childList:true,subtree:false});
}

boot();
})();
