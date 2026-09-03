export const VERSION='5.0.1';
export const WORKER='https://wa-operations-dashboard-new.haidenp10.workers.dev';
export const PERTH={lat:-31.9523,lon:115.8613};
export const REFRESH_MS=5*60*1000;
export const STALE_MS=30*60*1000;
export const DELAYED_MS=10*60*1000;

export const COLORS={
  bom:'#eab308',ewa:'#dc2626',wpUnplanned:'#f97316',wpPlanned:'#16a34a',wpUnknown:'#64748b',
  incident:'#2563eb',signal:'#db2777',roadworks:'#0891b2',event:'#7c3aed',closed:'#991b1b',
  restriction:'#9333ea',condition:'#92400e',detour:'#475569',zone:'#f97316'
};

export const SWIN_RING=[
  [-27.55,114.05],[-27.45,114.55],[-28.35,115.70],[-29.10,116.25],[-29.80,116.60],
  [-30.50,117.20],[-30.60,118.50],[-30.80,119.60],[-30.45,121.00],[-30.45,121.75],
  [-31.40,122.00],[-31.55,120.60],[-31.85,119.40],[-32.45,118.75],[-33.20,120.20],
  [-33.75,120.10],[-34.10,119.75],[-34.55,119.50],[-35.10,118.35],[-35.15,117.60],
  [-35.05,116.90],[-34.70,116.20],[-34.35,115.20],[-33.85,114.90],[-33.25,115.10],
  [-32.60,115.60],[-31.95,115.65],[-31.25,115.40],[-30.55,115.00],[-29.85,114.80],
  [-29.10,114.85],[-28.35,114.50]
];

export const ZONES={
  swin:{label:'SWIN',bounds:[[-35.30,113.90],[-27.20,122.30]]},
  metro:{label:'Metro',bounds:[[-32.75,115.45],[-31.25,116.35]]},
  southmetro:{label:'South Metro',bounds:[[-32.75,115.50],[-31.90,116.30]]},
  northmetro:{label:'North Metro',bounds:[[-31.95,115.45],[-31.25,116.30]]},
  southcountry:{label:'South Country',bounds:[[-35.30,114.60],[-32.70,120.35]]},
  northcountry:{label:'North Country',bounds:[[-31.30,113.95],[-27.30,119.25]]},
  eastcountry:{label:'East Country',bounds:[[-33.30,116.15],[-30.15,122.25]]}
};

export const LAYER_DEFAULTS={bom:true,ewa:true,wpUnplanned:true,wpPlanned:true,mr:true,mrRoadworks:false};
export const FACILITY_DEFAULTS={police:false,fire:false,ambulance:false,hospital:false,wp:false};

export const FACILITY_META={
  police:{label:'Police station',short:'P',colour:'#2563eb',source:'OpenStreetMap mapped location; verify with WA Police',verify:'https://www.police.wa.gov.au/'},
  fire:{label:'Fire / DFES station',short:'F',colour:'#dc2626',source:'WA Government DFES Stations (DFES-023)',verify:'https://catalogue.data.wa.gov.au/dataset/dfes-stations'},
  ambulance:{label:'Ambulance station',short:'A',colour:'#ef4444',source:'OpenStreetMap mapped location; verify with St John WA',verify:'https://www.stjohnwa.com.au/'},
  hospital:{label:'Emergency hospital',short:'H',colour:'#ffffff',text:'#b91c1c',source:'WA Health Hospitals (HEALTH-001), ED reporting field',verify:'https://catalogue.data.wa.gov.au/dataset/health-establishments'},
  wp:{label:'Western Power work location',short:'WP',colour:'#f97316',source:'Publicly documented Western Power work-location address',verify:'https://www.westernpower.com.au/'}
};

export const DFES_URL='https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/33/query?where=1%3D1&outFields=objectid%2Cdisplaynam%2Ctype&returnGeometry=true&outSR=4326&f=geojson';
export const HEALTH_URL='https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Health/MapServer/7/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson';
export const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];

export const WP_PUBLIC=[
  {name:'South Metro Depot / Boyli Mia',address:'114 Ayres Road, Forrestdale WA 6112'},
  {name:'Vasse Depot',address:'19 Ostler Drive, Vasse WA 6280'},
  {name:'Albany Depot / Kinjarling Pindjarri',address:'27-31 Chester Pass Road, Orana WA 6330'},
  {name:'Picton work location',address:'1757 Boyanup-Picton Road, Picton WA 6229'},
  {name:'Northam work location',address:'York Road, Northam WA 6401'},
  {name:'Narrogin work location',address:'55 Booth Street, Narrogin WA 6312'},
  {name:'Merredin work location',address:'Great Eastern Highway and Combes Drive, Merredin WA 6415'},
  {name:'Geraldton work location',address:'Eighth Avenue, Utakarra WA 6530'},
  {name:'Three Springs work location',address:'Perenjori Road, Three Springs WA 6519'}
];
