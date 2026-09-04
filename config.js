window.WAOS_CONFIG = {
  version: "5.0.0",
  feedProxyBase: "https://wa-operations-dashboard-new.haidenp10.workers.dev",
  defaultView: "metro",
  defaultBasemap: "streets",
  refresh: { weatherMinutes: 10, feedsMinutes: 5 },
  features: {
    search: true,
    geolocation: true,
    satellite: true,
    terrain: true,
    fireDangerRatings: true,
    totalFireBans: true
  },
  links: {
    westernPowerOutages: "https://www.westernpower.com.au/faults-outages/power-outages/",
    emergencyWA: "https://www.emergency.wa.gov.au/",
    bomWarnings: "https://www.bom.gov.au/wa/warnings/",
    bomRadar: "https://www.bom.gov.au/products/IDR703.loop.shtml",
    osmFixMap: "https://www.openstreetmap.org/fixthemap"
  }
};