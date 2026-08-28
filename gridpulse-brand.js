(function(){
'use strict';
const BRAND='GRIDPULSE';
const TITLE='GRIDPULSE — SWIN Operations';
const DESCRIPTION='GRIDPULSE — SWIN operations intelligence for outages, warnings, weather, roads, emergency facilities and environmental conditions.';

function apply(){
  document.title=TITLE;
  const desc=document.querySelector('meta[name="description"]');
  if(desc)desc.content=DESCRIPTION;
  const apple=document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if(apple)apple.content=BRAND;

  const brand=document.querySelector('.top > .brand');
  if(brand&&!brand.dataset.gridpulse){
    brand.dataset.gridpulse='1';
    brand.innerHTML='<h1 aria-label="GRIDPULSE — SWIN Operations Intelligence" title="GRIDPULSE — SWIN Operations Intelligence">GRIDPULSE</h1><span class="gridpulse-brand-sub">SWIN OPERATIONS INTELLIGENCE</span>';
  }

  document.querySelectorAll('.notice').forEach(n=>{
    if(/WAOS is a situational-awareness workbench/i.test(n.textContent||'')){
      n.textContent=(n.textContent||'').replace(/WAOS/g,BRAND);
    }
  });
}

function style(){
  if(document.getElementById('gridpulseBrandStyle'))return;
  const s=document.createElement('style');
  s.id='gridpulseBrandStyle';
  s.textContent=`
body.waos-workbench .top>.brand{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;line-height:1!important}
body.waos-workbench .top>.brand h1{font-size:18px!important;letter-spacing:.105em!important;font-weight:950!important;color:#fff!important;text-shadow:0 0 20px rgba(249,115,22,.12)!important}
.gridpulse-brand-sub{display:block;margin-top:5px;color:#fb923c;font-size:6.5px;font-weight:900;letter-spacing:.16em;white-space:nowrap;text-transform:uppercase}
@media(max-width:1100px){body.waos-workbench .top>.brand h1{font-size:16px!important}.gridpulse-brand-sub{font-size:5.8px}}
`;
  document.head.appendChild(s);
}

function brandedBrief(e){
  const button=e.target?.closest?.('#wbCopyBrief');
  if(!button)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const text=id=>document.getElementById(id)?.textContent?.trim()||'--';
  const time=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',dateStyle:'medium',timeStyle:'short'}).format(new Date());
  const top=document.getElementById('wbTopPriority')?.textContent?.trim()||'No priority incident identified.';
  const lines=[
    'GRIDPULSE — SWIN operational brief',
    `Generated ${time}`,
    `Priority items: ${text('wbPriority')}`,
    `Unplanned power customers shown: ${text('wbCustomers')}`,
    `Road closures: ${text('wbClosures')}`,
    `Warning items: ${text('wbWarnings')}`,
    '',top,'',
    'Values are SWIN-scoped situational-awareness data; verify safety-critical information with official sources.'
  ];
  navigator.clipboard?.writeText(lines.join('\n')).then(()=>window.WAOpsV3?.toast?.('GRIDPULSE shift brief copied')).catch(()=>window.WAOpsV3?.toast?.('Unable to copy briefing',true));
}

style();apply();
document.addEventListener('click',brandedBrief,true);
new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(apply,500);setTimeout(apply,1800);setTimeout(apply,4500);
})();
