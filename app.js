(() => {
  'use strict';

  const CONFIG = window.WAOS_CONFIG || {};
  const PERTH = { name: 'Perth', lat: -31.9523, lon: 115.8613 };
  const WA_BOUNDS = [[-35.2, 112.6], [-13.4, 129.1]];
  const VIEWS = {
    perth: { center: [-31.9523, 115.8613], zoom: 12, label: 'Perth' },
    metro: { center: [-31.9523, 115.8613], zoom: 9, label: 'Perth Metro' },
    wa: { bounds: WA_BOUNDS, label: 'Western Australia' }
  };

  const SOURCE_META = {
    emergency: { label: 'Emergency WA', short: 'Emergency', colour: '#ff646d' },
    incidents: { label: 'Emergency WA Incidents', short: 'Incidents', colour: '#de7cff' },
    bom: { label: 'Bureau of Meteorology', short: 'BOM', colour: '#63a8ff' },
    fdr: { label: 'Fire Danger Ratings', short: 'Fire danger', colour: '#f6c85f' },
    tfb: { label: 'Total Fire Bans', short: 'Total fire ban', colour: '#ff8b47' },
    westernPower: { label: 'Western Power', short: 'Power outage', colour: '#ff646d' }
  };

  const DEFAULT_PREFS = {
    theme: 'dark',
    basemap: CONFIG.defaultBasemap || 'streets',
    layers: { emergency: true, incidents: true, bom: true, fdr: true, tfb: true, wpUnplanned: true, wpPlanned: true, weather: true, places: false },
    drawerOpen: true,
    panel: 'layers'
  };

  const state = {
    prefs: loadPrefs(),
    map: null,
    baseLayers: {},
    activeBasemap: null,
    overlayGroups: {},
    items: { emergency: [], incidents: [], bom: [], fdr: [], tfb: [], westernPower: [] },
    sourceStatus: {},
    feedUpdatedAt: null,
    alertFilter: 'all',
    mappedFeatureCount: 0,
    warningBounds: null,
    weather: null,
    weatherLocation: { ...PERTH },
    weatherUpdatedAt: null,
    weatherOk: false,
    selectedLocation: null,
    lastSearchAt: 0,
    activePanel: 'layers',
    loadingFeeds: false,
    loadingWeather: false
  };

  const byId = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem('waos-v3-prefs') || '{}');
      return {
        ...DEFAULT_PREFS,
        ...saved,
        layers: { ...DEFAULT_PREFS.layers, ...(saved.layers || {}) }
      };
    } catch {
      return typeof structuredClone === 'function' ? structuredClone(DEFAULT_PREFS) : JSON.parse(JSON.stringify(DEFAULT_PREFS));
    }
  }

  function savePrefs() {
    localStorage.setItem('waos-v3-prefs', JSON.stringify(state.prefs));
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function safeUrl(value, fallback = '#') {
    try {
      const u = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(u.protocol) ? u.href : fallback;
    } catch { return fallback; }
  }

  function formatTime(value, { includeDate = false } = {}) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Perth',
      ...(includeDate ? { day: 'numeric', month: 'short' } : {}),
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d);
  }

  function relativeAge(value) {
    if (!value) return 'unknown';
    const ms = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(ms)) return 'unknown';
    const mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} mins ago`;
    const hrs = Math.round(mins / 60);
    return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
  }

  function toast(title, message = '') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ''}`;
    byId('toastStack').appendChild(el);
    window.setTimeout(() => el.remove(), 3800);
  }

  function updateClock() {
    byId('clock').textContent = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  }

  function setTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    state.prefs.theme = next;
    savePrefs();
    const use = byId('themeToggle').querySelector('use');
    use.setAttribute('href', next === 'dark' ? '#i-moon' : '#i-cloud');
  }

  function initTheme() {
    setTheme(state.prefs.theme || 'dark');
    byId('themeToggle').addEventListener('click', () => setTheme(state.prefs.theme === 'dark' ? 'light' : 'dark'));
  }

  function makeBasemapLayers() {
    if (typeof L === 'undefined') return {};
    return {
      streets: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      }),
      terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>'
      })
    };
  }

  function initMap() {
    const fallback = byId('mapFallback');
    if (typeof L === 'undefined') {
      fallback.hidden = false;
      return;
    }
    try {
      state.map = L.map('map', {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        minZoom: 4,
        maxBoundsViscosity: 0.25
      }).setView(VIEWS.metro.center, VIEWS.metro.zoom);

      state.baseLayers = makeBasemapLayers();
      state.overlayGroups = {
        emergency: L.layerGroup(), incidents: L.layerGroup(), bom: L.layerGroup(), fdr: L.layerGroup(), tfb: L.layerGroup(),
        wpUnplanned: L.layerGroup(), wpPlanned: L.layerGroup(),
        weather: L.layerGroup(), places: L.layerGroup(), search: L.layerGroup(), user: L.layerGroup()
      };

      setBasemap(state.prefs.basemap, false);
      Object.entries(state.prefs.layers).forEach(([key, enabled]) => {
        if (enabled && state.overlayGroups[key]) state.overlayGroups[key].addTo(state.map);
      });
      state.overlayGroups.search.addTo(state.map);
      state.overlayGroups.user.addTo(state.map);
      addReferencePlaces();

      state.map.on('click', () => {
        // Deliberately no click-to-weather behaviour. Location/weather inspection is explicit via search or geolocation.
      });
      state.map.on('moveend zoomend', updateMapViewLabel);
      state.map.on('baselayerchange', updateMapSummary);

      qsa('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
      byId('homeBtn').addEventListener('click', () => setView('metro'));
      byId('fitAlertsBtn').addEventListener('click', fitMappedWarnings);
      byId('locateBtn').addEventListener('click', useMyLocation);
      updateMapViewLabel();
    } catch (err) {
      console.error('Map init failed', err);
      fallback.hidden = false;
    }
  }

  function setBasemap(name, persist = true) {
    if (!state.map || !state.baseLayers[name]) return;
    Object.values(state.baseLayers).forEach(layer => state.map.hasLayer(layer) && state.map.removeLayer(layer));
    state.baseLayers[name].addTo(state.map);
    state.activeBasemap = name;
    state.prefs.basemap = name;
    if (persist) savePrefs();
    qsa('.basemap-card').forEach(el => el.classList.toggle('active', el.dataset.basemap === name));
  }

  function setView(name) {
    if (!state.map || !VIEWS[name]) return;
    const v = VIEWS[name];
    if (v.bounds) state.map.fitBounds(v.bounds, { padding: [14, 14] });
    else state.map.flyTo(v.center, v.zoom, { duration: .45 });
    qsa('[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
    byId('mapSummaryTitle').textContent = v.label;
  }

  function updateMapViewLabel() {
    if (!state.map) return;
    const z = state.map.getZoom();
    const c = state.map.getCenter();
    const label = z <= 6 ? 'Western Australia' : z <= 10 ? 'Perth Metro' : 'Local view';
    byId('mapSummaryTitle').textContent = label;
    if (state.selectedLocation) return;
    byId('mapSummaryText').textContent = `${Math.abs(c.lat).toFixed(2)}°S · ${c.lng.toFixed(2)}°E · zoom ${z}`;
  }

  function addReferencePlaces() {
    if (!state.overlayGroups.places || typeof L === 'undefined') return;
    const places = [
      ['Perth', -31.9523, 115.8613], ['Fremantle', -32.0569, 115.7439], ['Joondalup', -31.7450, 115.7660],
      ['Mandurah', -32.5269, 115.7217], ['Bunbury', -33.3271, 115.6414], ['Albany', -35.0269, 117.8837],
      ['Geraldton', -28.7774, 114.6149], ['Kalgoorlie', -30.7489, 121.4658]
    ];
    state.overlayGroups.places.clearLayers();
    places.forEach(([name, lat, lon]) => {
      L.marker([lat, lon], { icon: L.divIcon({ className: 'operational-marker', html: '<div class="place-dot"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }) })
        .bindTooltip(name, { direction: 'top', offset: [0, -6] })
        .addTo(state.overlayGroups.places);
    });
  }

  function setOverlay(name, enabled) {
    const group = state.overlayGroups[name];
    if (!group || !state.map) return;
    if (enabled) group.addTo(state.map); else state.map.removeLayer(group);
    if (name in state.prefs.layers) state.prefs.layers[name] = enabled;
    savePrefs();
    renderLegend();
    updateMapSummary();
  }

  function fitMappedWarnings() {
    if (!state.map || !state.warningBounds || !state.warningBounds.isValid()) {
      toast('No mapped warning geometry', 'Warning cards can still be live even when the feed does not provide map geometry.');
      return;
    }
    state.map.fitBounds(state.warningBounds.pad(.18), { maxZoom: 12, padding: [30, 30] });
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast('Location unavailable', 'This browser does not provide geolocation.');
      return;
    }
    byId('locateBtn').disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
      byId('locateBtn').disabled = false;
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      state.overlayGroups.user.clearLayers();
      L.marker([lat, lon], { icon: makePin('#4fd1c5') }).addTo(state.overlayGroups.user).bindTooltip('Your location');
      state.map.flyTo([lat, lon], 13, { duration: .5 });
      selectLocation({ name: 'Your location', lat, lon, detail: `Accuracy ±${Math.round(pos.coords.accuracy)} m` });
    }, err => {
      byId('locateBtn').disabled = false;
      toast('Could not get your location', err.message || 'Check browser location permissions.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function makePin(colour) {
    return L.divIcon({
      className: 'search-marker',
      html: `<div class="marker-core" style="--marker-colour:${colour}"></div>`,
      iconSize: [24, 24], iconAnchor: [12, 22], popupAnchor: [0, -20]
    });
  }

  function makeAlertPin(colour) {
    return L.divIcon({
      className: 'alert-marker',
      html: `<div class="alert-pin" style="--marker-colour:${colour}">!</div>`,
      iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14]
    });
  }

  function selectLocation(loc) {
    state.selectedLocation = loc;
    byId('selectionName').textContent = loc.name || 'Selected location';
    byId('selectionCoords').textContent = `${Number(loc.lat).toFixed(5)}, ${Number(loc.lon).toFixed(5)}${loc.detail ? ` · ${loc.detail}` : ''}`;
    byId('selectionCard').hidden = false;
    byId('mapSummaryText').textContent = `Selected · ${Number(loc.lat).toFixed(4)}, ${Number(loc.lon).toFixed(4)}`;
  }

  function clearSelection() {
    state.selectedLocation = null;
    byId('selectionCard').hidden = true;
    state.overlayGroups.search?.clearLayers();
    updateMapViewLabel();
  }

  function initSelectionActions() {
    byId('selectionClose').addEventListener('click', clearSelection);
    byId('selectionCopyBtn').addEventListener('click', async () => {
      if (!state.selectedLocation) return;
      const text = `${state.selectedLocation.lat}, ${state.selectedLocation.lon}`;
      try { await navigator.clipboard.writeText(text); toast('Coordinates copied', text); }
      catch { toast('Copy unavailable', text); }
    });
    byId('selectionWeatherBtn').addEventListener('click', () => {
      if (!state.selectedLocation) return;
      state.weatherLocation = { name: state.selectedLocation.name, lat: state.selectedLocation.lat, lon: state.selectedLocation.lon };
      openPanel('weather');
      loadWeather(state.weatherLocation);
    });
  }

  function weatherCode(code) {
    const map = {
      0:['Clear','☀'],1:['Mostly clear','🌤'],2:['Partly cloudy','⛅'],3:['Cloudy','☁'],45:['Fog','≋'],48:['Rime fog','≋'],
      51:['Light drizzle','☂'],53:['Drizzle','☂'],55:['Heavy drizzle','☂'],56:['Freezing drizzle','☂'],57:['Freezing drizzle','☂'],
      61:['Light rain','☂'],63:['Rain','☂'],65:['Heavy rain','☂'],66:['Freezing rain','☂'],67:['Freezing rain','☂'],
      71:['Light snow','❄'],73:['Snow','❄'],75:['Heavy snow','❄'],77:['Snow grains','❄'],80:['Rain showers','☂'],81:['Rain showers','☂'],82:['Heavy showers','☂'],
      85:['Snow showers','❄'],86:['Heavy snow showers','❄'],95:['Thunderstorm','ϟ'],96:['Thunderstorm + hail','ϟ'],99:['Severe thunderstorm','ϟ']
    };
    return map[code] || ['Conditions','•'];
  }

  function buildWeatherUrl(loc) {
    const params = new URLSearchParams({
      latitude: loc.lat,
      longitude: loc.lon,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset',
      timezone: 'Australia/Perth',
      forecast_days: '7'
    });
    return `https://api.open-meteo.com/v1/forecast?${params}`;
  }

  async function loadWeather(loc = state.weatherLocation) {
    if (state.loadingWeather) return;
    state.loadingWeather = true;
    renderWeatherPanel();
    try {
      const res = await fetch(buildWeatherUrl(loc));
      if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
      state.weather = await res.json();
      state.weatherLocation = { ...loc };
      state.weatherUpdatedAt = new Date().toISOString();
      state.weatherOk = true;
      renderWeatherMarker();
      renderWeatherPanel();
      updateSystemStatus();
    } catch (err) {
      console.error('Weather load failed', err);
      state.weatherOk = false;
      renderWeatherPanel();
      updateSystemStatus();
    } finally {
      state.loadingWeather = false;
    }
  }

  function renderWeatherMarker() {
    const group = state.overlayGroups.weather;
    if (!group || !state.weather?.current || typeof L === 'undefined') return;
    group.clearLayers();
    const c = state.weather.current;
    const icon = L.divIcon({ className: 'weather-marker', html: `<div class="weather-pin">${Math.round(c.temperature_2m)}°</div>`, iconSize: [29,29], iconAnchor:[14,14] });
    const [desc] = weatherCode(c.weather_code);
    L.marker([state.weatherLocation.lat, state.weatherLocation.lon], { icon })
      .bindPopup(`<strong>${escapeHtml(state.weatherLocation.name)}</strong><br>${Math.round(c.temperature_2m)}°C · ${escapeHtml(desc)}<br>Wind ${Math.round(c.wind_speed_10m)} km/h`)
      .addTo(group);
  }

  function windCompass(deg) {
    if (!Number.isFinite(Number(deg))) return '—';
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round(Number(deg) / 45) % 8];
  }

  function renderWeatherPanel() {
    if (state.activePanel !== 'weather') return;
    const body = byId('drawerBody');
    if (!state.weather) {
      body.innerHTML = `<div class="empty-state"><strong>${state.loadingWeather ? 'Loading weather…' : 'Weather unavailable'}</strong>${state.loadingWeather ? 'Retrieving current conditions and 7-day forecast.' : 'Try refreshing the weather service.'}</div>`;
      return;
    }
    const c = state.weather.current;
    const d = state.weather.daily;
    const [desc, icon] = weatherCode(c.weather_code);
    const forecastRows = d.time.map((date, i) => {
      const [fd, fi] = weatherCode(d.weather_code[i]);
      const label = i === 0 ? 'Today' : new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'Australia/Perth' }).format(new Date(`${date}T12:00:00+08:00`));
      return `<div class="forecast-row" title="Rain ${d.precipitation_sum[i]} mm · ${d.precipitation_probability_max[i] ?? 0}% chance · gust ${Math.round(d.wind_gusts_10m_max[i] || 0)} km/h"><span class="day">${label}</span><span class="wx">${fi}</span><span class="desc">${escapeHtml(fd)} · ${Math.round(d.precipitation_probability_max[i] || 0)}%</span><span class="temps">${Math.round(d.temperature_2m_max[i])}° <span>${Math.round(d.temperature_2m_min[i])}°</span></span></div>`;
    }).join('');
    body.innerHTML = `
      <div class="weather-hero">
        <div class="weather-head"><span class="weather-place">${escapeHtml(state.weatherLocation.name)}</span><span class="weather-updated">${relativeAge(state.weatherUpdatedAt)}</span></div>
        <div class="weather-primary"><div class="weather-icon-big">${icon}</div><div><div class="weather-temp">${Math.round(c.temperature_2m)}°</div><div class="weather-condition">${escapeHtml(desc)}</div></div></div>
        <div class="metric-grid">
          <div class="metric"><span>Feels like</span><strong>${Math.round(c.apparent_temperature)}°C</strong></div>
          <div class="metric"><span>Humidity</span><strong>${Math.round(c.relative_humidity_2m)}%</strong></div>
          <div class="metric"><span>Wind</span><strong>${Math.round(c.wind_speed_10m)} km/h ${windCompass(c.wind_direction_10m)}</strong></div>
          <div class="metric"><span>Gusts</span><strong>${Math.round(c.wind_gusts_10m)} km/h</strong></div>
          <div class="metric"><span>Rain now</span><strong>${Number(c.precipitation || 0).toFixed(1)} mm</strong></div>
          <div class="metric"><span>UV max</span><strong>${Number(d.uv_index_max?.[0] || 0).toFixed(1)}</strong></div>
        </div>
      </div>
      <div class="section-label">7-day forecast</div>
      <div class="panel-block"><div class="forecast">${forecastRows}</div></div>
      <div class="status-actions">
        <button class="button primary" id="weatherRefreshBtn" type="button"><svg class="icon"><use href="#i-refresh"></use></svg> Refresh</button>
        <button class="button subtle" id="weatherPerthBtn" type="button">Back to Perth</button>
      </div>
      <p class="legal-note">Forecast data: Open-Meteo. For official warnings, use the BOM warning feed and linked Bureau warning page.</p>`;
    byId('weatherRefreshBtn').addEventListener('click', () => loadWeather(state.weatherLocation));
    byId('weatherPerthBtn').addEventListener('click', () => { state.weatherLocation = { ...PERTH }; loadWeather(PERTH); state.map?.flyTo([PERTH.lat, PERTH.lon], 11); });
  }

  function normaliseItem(raw, source) {
    const point = Array.isArray(raw?.point) && raw.point.length === 2 ? raw.point.map(Number) : null;
    const polygon = Array.isArray(raw?.polygon) ? raw.polygon.map(p => Array.isArray(p) ? p.map(Number) : p) : null;
    return {
      id: raw?.id || raw?.guid || raw?.link || `${source}-${raw?.title || 'item'}-${raw?.published || ''}`,
      source,
      title: raw?.title || 'Untitled item',
      description: raw?.description || raw?.summary || '',
      link: safeUrl(raw?.link || sourceFallback(source), sourceFallback(source)),
      published: raw?.published || raw?.updated || null,
      categories: Array.isArray(raw?.categories) ? raw.categories : [],
      point: point?.every(Number.isFinite) ? point : null,
      polygon: polygon?.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) || null
    };
  }

  function geoJsonOuterRings(geometry) {
    const type = geometry?.type;
    const coords = geometry?.coordinates;
    const polygons = type === 'Polygon' ? [coords] : type === 'MultiPolygon' ? coords : [];
    const rings = [];
    (Array.isArray(polygons) ? polygons : []).forEach(poly => {
      const outer = Array.isArray(poly) ? poly[0] : null;
      const ring = (Array.isArray(outer) ? outer : [])
        .map(p => Array.isArray(p) ? [Number(p[1]), Number(p[0])] : null)
        .filter(p => p && p.every(Number.isFinite));
      if (ring.length >= 3) rings.push(ring);
    });
    return rings;
  }

  function normaliseWesternPower(raw) {
    const category = ['planned','unplanned'].includes(raw?.outageCategory) ? raw.outageCategory : (raw?.planned === true ? 'planned' : raw?.planned === false ? 'unplanned' : 'unknown');
    const customers = Number.isFinite(Number(raw?.customersImpacted)) ? Number(raw.customersImpacted) : null;
    const area = raw?.affectedArea || '';
    const restoration = raw?.estimatedRestorationTime || null;
    const description = [
      customers !== null ? `${customers.toLocaleString('en-AU')} customer${customers === 1 ? '' : 's'} impacted` : '',
      restoration ? `Estimated restoration ${formatTime(restoration,{includeDate:true})}` : ''
    ].filter(Boolean).join(' · ');
    return {
      id: raw?.id || raw?.incidentRef || raw?.enarNumber || `wp-${Math.random().toString(36).slice(2)}`,
      source: 'westernPower',
      title: raw?.title || `${category === 'planned' ? 'Planned' : category === 'unplanned' ? 'Unplanned' : 'Power'} outage${area ? ` – ${area}` : ''}`,
      description,
      link: safeUrl(raw?.link || CONFIG.links?.westernPowerOutages, CONFIG.links?.westernPowerOutages || 'https://www.westernpower.com.au/faults-outages/power-outages/'),
      published: raw?.timeAdded || raw?.outageStartTime || null,
      outageCategory: category,
      planned: raw?.planned ?? null,
      incidentRef: raw?.incidentRef || '',
      affectedArea: area,
      customersImpacted: customers,
      estimatedRestorationTime: restoration,
      polygons: geoJsonOuterRings(raw?.geometry)
    };
  }

  function sourceFallback(source) {
    if (source === 'bom') return CONFIG.links?.bomWarnings || 'https://www.bom.gov.au/wa/warnings/';
    if (source === 'westernPower') return CONFIG.links?.westernPowerOutages || 'https://www.westernpower.com.au/faults-outages/power-outages/';
    return CONFIG.links?.emergencyWA || 'https://www.emergency.wa.gov.au/';
  }

  function styleForItem(item) {
    const t = `${item.title} ${item.description}`.toLowerCase();
    if (item.source === 'emergency') {
      if (t.includes('emergency warning')) return { colour: '#ff4f5f', level: 'Emergency Warning' };
      if (t.includes('watch and act')) return { colour: '#ff9b52', level: 'Watch and Act' };
      if (t.includes('advice')) return { colour: '#f6c85f', level: 'Advice' };
      return { colour: '#ff646d', level: 'Emergency WA' };
    }
    if (item.source === 'incidents') return { colour: '#de7cff', level: 'DFES Incident' };
    if (item.source === 'tfb') return { colour: '#ff7a45', level: 'Total Fire Ban' };
    if (item.source === 'fdr') return { colour: '#f6c85f', level: 'Fire Danger Rating' };
    if (t.includes('tropical cyclone') || t.includes('cyclone')) return { colour: '#de7cff', level: 'Cyclone' };
    if (t.includes('severe thunderstorm')) return { colour: '#d96bff', level: 'Severe Thunderstorm' };
    if (t.includes('severe weather')) return { colour: '#9d8cff', level: 'Severe Weather' };
    if (t.includes('flood')) return { colour: '#56d7ff', level: 'Flood' };
    if (t.includes('fire weather')) return { colour: '#ff9b52', level: 'Fire Weather' };
    if (t.includes('tsunami')) return { colour: '#55dbc8', level: 'Tsunami' };
    if (t.includes('marine') || t.includes('gale') || t.includes('wind')) return { colour: '#63a8ff', level: 'Weather Warning' };
    return { colour: '#63a8ff', level: 'BOM Warning' };
  }

  async function loadFeeds({ silent = false } = {}) {
    const base = String(CONFIG.feedProxyBase || '').replace(/\/$/, '');
    if (!base) {
      state.sourceStatus = {
        bom: { ok: false, error: 'not_configured', message: 'Feed Worker not configured' },
        emergency: { ok: false, error: 'not_configured', message: 'Feed Worker not configured' },
        incidents: { ok: false, error: 'not_configured', message: 'Feed Worker not configured' },
        fdr: { ok: false, error: 'not_configured', message: 'Optional feed not configured' },
        tfb: { ok: false, error: 'not_configured', message: 'Optional feed not configured' }
      };
      updateAfterFeeds();
      return;
    }
    if (state.loadingFeeds) return;
    state.loadingFeeds = true;
    try {
      const res = await fetch(`${base}/api/feeds`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Feed proxy HTTP ${res.status}`);
      const snapshot = await res.json();
      const collections = snapshot.collections || {};
      state.items.emergency = (collections.emergency || snapshot.emergency || []).map(x => normaliseItem(x, 'emergency'));
      state.items.incidents = (collections.incidents || snapshot.incidents || []).map(x => normaliseItem(x, 'incidents'));
      state.items.bom = (collections.bom || snapshot.bom || []).map(x => normaliseItem(x, 'bom'));
      state.items.fdr = (collections.fdr || snapshot.fdr || []).map(x => normaliseItem(x, 'fdr'));
      state.items.tfb = (collections.tfb || snapshot.tfb || []).map(x => normaliseItem(x, 'tfb'));
      state.items.westernPower = (collections.westernPower || snapshot.westernPower || []).map(normaliseWesternPower);
      state.sourceStatus = snapshot.sources || {};
      state.feedUpdatedAt = snapshot.updatedAt || null;
      updateAfterFeeds();
      if (!silent) toast('Operational feeds refreshed', `${allItems().length} current items loaded.`);
    } catch (err) {
      console.error('Feed load failed', err);
      state.sourceStatus = {
        bom: { ok: false, error: 'unavailable', message: err.message }, emergency: { ok: false, error: 'unavailable', message: err.message }
      };
      updateAfterFeeds();
      if (!silent) toast('Feed proxy unavailable', 'Weather and official source links still work.');
    } finally {
      state.loadingFeeds = false;
    }
  }

  function allItems() {
    return ['emergency', 'incidents', 'bom', 'fdr', 'tfb'].flatMap(k => state.items[k] || [])
      .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));
  }

  function updateAfterFeeds() {
    renderAllMapItems();
    updateAlertCounts();
    renderLegend();
    updateSystemStatus();
    updateMapSummary();
    if (state.activePanel === 'alerts') renderAlertsPanel();
    if (state.activePanel === 'status') renderStatusPanel();
    if (state.activePanel === 'layers') renderLayersPanel();
  }

  function renderAllMapItems() {
    if (!state.map || typeof L === 'undefined') return;
    ['emergency', 'incidents', 'bom', 'fdr', 'tfb', 'wpUnplanned', 'wpPlanned'].forEach(source => state.overlayGroups[source]?.clearLayers());
    state.warningBounds = L.latLngBounds([]);
    let mapped = 0;
    ['emergency', 'incidents', 'bom', 'fdr', 'tfb'].forEach(source => {
      const group = state.overlayGroups[source];
      if (!group) return;
      state.items[source].forEach(item => {
        const style = styleForItem(item);
        const popup = `<strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(SOURCE_META[source]?.label || source)}</span><br><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Open official source</a>`;
        if (item.point) {
          const [lat, lon] = item.point;
          L.marker([lat, lon], { icon: makeAlertPin(style.colour) }).bindPopup(popup).addTo(group);
          state.warningBounds.extend([lat, lon]);
          mapped++;
        }
        if (item.polygon && item.polygon.length >= 3) {
          const poly = L.polygon(item.polygon, { color: style.colour, weight: 2.2, opacity: .95, fillColor: style.colour, fillOpacity: .16 });
          poly.bindPopup(popup).addTo(group);
          item.polygon.forEach(p => state.warningBounds.extend(p));
          mapped++;
        }
      });
    });
    state.items.westernPower.forEach(item => {
      const key = item.outageCategory === 'planned' ? 'wpPlanned' : 'wpUnplanned';
      const group = state.overlayGroups[key];
      if (!group) return;
      const colour = item.outageCategory === 'planned' ? '#f6c85f' : item.outageCategory === 'unplanned' ? '#ff646d' : '#a6bed0';
      const details = [
        item.affectedArea ? `<span>${escapeHtml(item.affectedArea)}</span>` : '',
        item.customersImpacted !== null ? `<br><span><strong>${item.customersImpacted.toLocaleString('en-AU')}</strong> customers impacted</span>` : '',
        item.estimatedRestorationTime ? `<br><span>Estimated restoration: ${escapeHtml(formatTime(item.estimatedRestorationTime,{includeDate:true}))}</span>` : '',
        item.incidentRef ? `<br><span>Incident: ${escapeHtml(item.incidentRef)}</span>` : ''
      ].join('');
      const popup = `<strong>${escapeHtml(item.title)}</strong><br>${details}<br><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">Open Western Power outage page</a>`;
      item.polygons.forEach(ring => {
        L.polygon(ring, { color: colour, weight: 2.4, opacity: .98, fillColor: colour, fillOpacity: .20 })
          .bindPopup(popup).addTo(group);
        mapped++;
      });
    });
    state.mappedFeatureCount = mapped;
  }

  function updateAlertCounts() {
    const count = allItems().length;
    const badge = byId('railAlertCount');
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    byId('floatingAlerts').hidden = count === 0;
    byId('floatingAlertCount').textContent = count;
  }

  function updateMapSummary() {
    const count = allItems().length;
    const outageCount = state.items.westernPower.length;
    const mapped = state.mappedFeatureCount;
    if (state.selectedLocation) return;
    if (!CONFIG.feedProxyBase) {
      byId('mapSummaryText').textContent = 'Weather live · operational feed proxy requires configuration';
    } else if (count === 0 && outageCount === 0) {
      byId('mapSummaryText').textContent = `No current operational items · refreshed ${relativeAge(state.feedUpdatedAt)}`;
    } else {
      byId('mapSummaryText').textContent = `${count} warning/incident item${count === 1 ? '' : 's'} · ${outageCount} power outage${outageCount === 1 ? '' : 's'} · ${mapped} mapped feature${mapped === 1 ? '' : 's'}`;
    }
  }

  function renderLegend() {
    const host = byId('mapLegend');
    const chips = [];
    ['emergency','incidents','bom','fdr','tfb'].forEach(source => {
      if (!state.prefs.layers[source] || !state.items[source]?.length) return;
      const meta = SOURCE_META[source];
      chips.push(`<span class="legend-chip"><i class="legend-dot" style="--legend-colour:${meta.colour}"></i>${escapeHtml(meta.short)}</span>`);
    });
    const wpUnplanned = state.items.westernPower.filter(x => x.outageCategory !== 'planned').length;
    const wpPlanned = state.items.westernPower.filter(x => x.outageCategory === 'planned').length;
    if (state.prefs.layers.wpUnplanned && wpUnplanned) chips.push(`<span class="legend-chip"><i class="legend-dot" style="--legend-colour:#ff646d"></i>Power outage</span>`);
    if (state.prefs.layers.wpPlanned && wpPlanned) chips.push(`<span class="legend-chip"><i class="legend-dot" style="--legend-colour:#f6c85f"></i>Planned outage</span>`);
    if (state.prefs.layers.weather && state.weather) chips.push(`<span class="legend-chip"><i class="legend-dot" style="--legend-colour:#4fd1c5"></i>Weather</span>`);
    if (state.prefs.layers.places) chips.push(`<span class="legend-chip"><i class="legend-dot" style="--legend-colour:#a6bed0"></i>Places</span>`);
    host.innerHTML = chips.join('');
  }

  function updateSystemStatus() {
    const feedStatuses = Object.values(state.sourceStatus || {}).filter(Boolean);
    const anyFeedGood = feedStatuses.some(s => s.ok);
    const anyFeedBad = feedStatuses.some(s => !s.ok && s.error !== 'not_configured');
    const led = byId('systemLed');
    led.className = 'status-led';
    let label = 'Ready', cls = 'good';
    if (!state.weatherOk && !anyFeedGood) { label = 'Limited'; cls = 'warn'; }
    if (anyFeedBad && !anyFeedGood) { label = 'Degraded'; cls = 'bad'; }
    if (!CONFIG.feedProxyBase && state.weatherOk) { label = 'Weather only'; cls = 'warn'; }
    led.classList.add(cls);
    byId('systemText').textContent = label;
  }

  function renderLayersPanel() {
    setPanelHeading('MAP', 'Layers');
    const body = byId('drawerBody');
    const proxyConfigured = Boolean(CONFIG.feedProxyBase);
    const overlayRow = (key, title, subtitle, colour, disabled = false, disabledText = '') => `
      <div class="layer-row ${disabled ? 'layer-disabled' : ''}">
        <div class="layer-meta"><span class="layer-symbol" style="--symbol-colour:${colour};--symbol-bg:color-mix(in srgb,${colour} 12%,transparent)"><svg class="icon"><use href="#${key === 'weather' ? 'i-cloud' : key === 'places' ? 'i-location' : 'i-alert'}"></use></svg></span><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(disabled ? disabledText : subtitle)}</span></div></div>
        <label class="switch"><input type="checkbox" data-layer-toggle="${key}" ${state.prefs.layers[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></label>
      </div>`;

    body.innerHTML = `
      <div class="section-label">Base map</div>
      <div class="basemap-grid">
        <button class="basemap-card ${state.activeBasemap === 'streets' ? 'active' : ''}" data-basemap="streets" type="button">Streets</button>
        <button class="basemap-card ${state.activeBasemap === 'satellite' ? 'active' : ''}" data-basemap="satellite" type="button">Satellite</button>
        <button class="basemap-card ${state.activeBasemap === 'terrain' ? 'active' : ''}" data-basemap="terrain" type="button">Terrain</button>
      </div>
      <div class="section-label">Operational overlays</div>
      <div class="panel-block">
        ${overlayRow('emergency','Emergency WA warnings',`${state.items.emergency.length} current · geometry when supplied`,'#ff646d',false)}
        ${overlayRow('incidents','Emergency WA incidents',`${state.items.incidents.length} current · DFES response incidents`,'#de7cff',false)}
        ${overlayRow('bom','BOM warnings',`${state.items.bom.length} current · WA warning feed`,'#63a8ff',false)}
        ${overlayRow('fdr','Fire danger ratings',`${state.items.fdr.length} current · optional designated feed`,'#f6c85f',false)}
        ${overlayRow('tfb','Total fire bans',`${state.items.tfb.length} current · optional designated feed`,'#ff8b47',false)}
        ${overlayRow('weather','Weather marker',`Current weather at ${state.weatherLocation.name}`,'#4fd1c5',false)}
        ${overlayRow('places','Reference places','Major WA reference locations','#a6bed0',false)}
      </div>
      <div class="section-label">Electricity network</div>
      <div class="panel-block">
        ${overlayRow('wpUnplanned','Western Power unplanned outages',`${state.items.westernPower.filter(x => x.outageCategory !== 'planned').length} current · live outage polygons`, '#ff646d', false)}
        ${overlayRow('wpPlanned','Western Power planned outages',`${state.items.westernPower.filter(x => x.outageCategory === 'planned').length} current · planned outage polygons`, '#f6c85f', false)}
        <a class="source-link" href="${escapeHtml(CONFIG.links?.westernPowerOutages || '#')}" target="_blank" rel="noopener"><div><strong>Open official Western Power outage map</strong><span>Verify current outage and restoration information</span></div><svg class="icon"><use href="#i-external"></use></svg></a>
      </div>
      ${!proxyConfigured ? `<div class="panel-block"><h3>Feed proxy setup</h3><p class="panel-copy">The map and weather work now. Deploy the included Cloudflare Worker and paste its URL into <code>config.js</code> to enable live BOM/Emergency WA feed cards and overlays.</p></div>` : ''}`;

    qsa('[data-basemap]', body).forEach(btn => btn.addEventListener('click', () => { setBasemap(btn.dataset.basemap); renderLayersPanel(); }));
    qsa('[data-layer-toggle]', body).forEach(input => input.addEventListener('change', () => setOverlay(input.dataset.layerToggle, input.checked)));
  }

  function renderAlertsPanel() {
    setPanelHeading('LIVE', 'Warnings');
    const body = byId('drawerBody');
    const filters = [
      ['all','All'],['emergency','Warnings'],['incidents','Incidents'],['bom','BOM'],['fdr','Fire danger'],['tfb','Fire bans']
    ];
    const items = allItems().filter(x => state.alertFilter === 'all' || x.source === state.alertFilter);
    const cards = items.length ? items.map(item => {
      const style = styleForItem(item);
      return `<a class="alert-card" href="${escapeHtml(item.link)}" target="_blank" rel="noopener" style="--alert-colour:${style.colour}">
        <div class="alert-card-top"><span class="alert-source"><i></i>${escapeHtml(SOURCE_META[item.source]?.short || item.source)}</span><time class="alert-time">${escapeHtml(formatTime(item.published,{includeDate:true}))}</time></div>
        <h4>${escapeHtml(item.title)}</h4>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
        <span class="alert-level">${escapeHtml(style.level)}</span>
      </a>`;
    }).join('') : `<div class="empty-state"><strong>${CONFIG.feedProxyBase ? 'No matching current items' : 'Warning feeds not connected'}</strong>${CONFIG.feedProxyBase ? 'The selected feed currently has no items.' : 'Deploy the included Worker and add its URL to config.js.'}</div>`;

    body.innerHTML = `
      <div class="alert-filters">${filters.map(([id,label]) => `<button class="filter-pill ${state.alertFilter === id ? 'active' : ''}" type="button" data-alert-filter="${id}">${label}</button>`).join('')}</div>
      <div class="panel-block flat"><p class="panel-copy">Feed snapshot: ${state.feedUpdatedAt ? `${formatTime(state.feedUpdatedAt,{includeDate:true})} (${relativeAge(state.feedUpdatedAt)})` : 'not available'}. Open any card to verify it on the official source.</p></div>
      <div class="alert-list">${cards}</div>`;
    qsa('[data-alert-filter]', body).forEach(btn => btn.addEventListener('click', () => { state.alertFilter = btn.dataset.alertFilter; renderAlertsPanel(); }));
  }

  function feedStatusRow(key, label) {
    const s = state.sourceStatus?.[key] || {};
    let cls = s.ok ? 'good' : s.error === 'not_configured' ? 'warn' : 'bad';
    let msg = s.ok ? `${s.count ?? state.items[key]?.length ?? 0} item${(s.count ?? 0) === 1 ? '' : 's'}` : (s.message || (s.error === 'not_configured' ? 'Not configured' : 'Unavailable'));
    return `<div class="feed-row"><span class="status-led ${cls}"></span><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(msg)}</span></div><time>${s.fetchedAt ? relativeAge(s.fetchedAt) : '—'}</time></div>`;
  }

  function renderStatusPanel() {
    setPanelHeading('SYSTEM', 'Data status');
    const body = byId('drawerBody');
    body.innerHTML = `
      <div class="section-label">Live services</div>
      <div class="status-list">
        <div class="feed-row"><span class="status-led ${state.weatherOk ? 'good' : 'bad'}"></span><div><strong>Weather API</strong><span>${state.weatherOk ? `${state.weatherLocation.name} · current + 7 day` : 'Weather unavailable'}</span></div><time>${state.weatherUpdatedAt ? relativeAge(state.weatherUpdatedAt) : '—'}</time></div>
        ${feedStatusRow('emergency','Emergency WA warnings')}
        ${feedStatusRow('incidents','Emergency WA incidents')}
        ${feedStatusRow('bom','BOM WA warnings')}
        ${feedStatusRow('fdr','Fire Danger Ratings')}
        ${feedStatusRow('tfb','Total Fire Bans')}
        ${feedStatusRow('westernPower','Western Power outages')}
      </div>
      <div class="status-actions"><button class="button primary" id="refreshAllBtn" type="button"><svg class="icon"><use href="#i-refresh"></use></svg> Refresh all</button></div>
      <div class="section-label">Snapshot</div>
      <div class="panel-block"><p class="panel-copy"><strong>${allItems().length}</strong> current feed items · <strong>${state.mappedFeatureCount}</strong> mapped features. RSS feeds can carry headline data without geometry, so a live warning may appear in the list without a shape on the map.</p></div>`;
    byId('refreshAllBtn').addEventListener('click', refreshAll);
  }

  function renderSourcesPanel() {
    setPanelHeading('OFFICIAL', 'Sources');
    const body = byId('drawerBody');
    const links = [
      [CONFIG.links?.westernPowerOutages,'Western Power','Power outages and restoration information'],
      [CONFIG.links?.emergencyWA,'Emergency WA','Warnings, incidents and emergency information'],
      [CONFIG.links?.bomWarnings,'Bureau of Meteorology','WA warnings'],
      [CONFIG.links?.bomRadar,'BOM Perth radar','Official radar loop'],
      [CONFIG.links?.osmFixMap,'OpenStreetMap','Report or correct a base-map issue']
    ];
    body.innerHTML = `${links.map(([href,title,desc]) => `<a class="source-link" href="${escapeHtml(href || '#')}" target="_blank" rel="noopener"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></div><svg class="icon"><use href="#i-external"></use></svg></a>`).join('')}
      <p class="legal-note">WAOS is a supplementary personal situational-awareness dashboard, not an emergency warning service. Always verify critical information directly with Emergency WA, the Bureau of Meteorology, Western Power and other relevant authorities.</p>
      <p class="legal-note">© State of Western Australia acting through the Department of Fire and Emergency Services. For current information go to www.emergency.wa.gov.au.</p><p class="legal-note">BOM RSS items link directly to the applicable Bureau page. Base maps retain provider attribution on the map. Search data © OpenStreetMap contributors.</p>`;
  }

  function renderSettingsPanel() {
    setPanelHeading('WAOS', 'Settings');
    const body = byId('drawerBody');
    body.innerHTML = `
      <div class="panel-block">
        <div class="setting-row"><div><strong>Colour theme</strong><span>Dark operations mode or light mode</span></div><select class="select" id="themeSelect"><option value="dark" ${state.prefs.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${state.prefs.theme === 'light' ? 'selected' : ''}>Light</option></select></div>
        <div class="setting-row"><div><strong>Default map</strong><span>Saved between sessions</span></div><select class="select" id="basemapSelect"><option value="streets" ${state.prefs.basemap === 'streets' ? 'selected' : ''}>Streets</option><option value="satellite" ${state.prefs.basemap === 'satellite' ? 'selected' : ''}>Satellite</option><option value="terrain" ${state.prefs.basemap === 'terrain' ? 'selected' : ''}>Terrain</option></select></div>
      </div>
      <div class="section-label">Keyboard shortcuts</div>
      <div class="panel-block shortcut-grid"><kbd>/</kbd><span>Search</span><kbd>L</kbd><span>Layers</span><kbd>A</kbd><span>Warnings</span><kbd>W</kbd><span>Weather</span><kbd>Esc</kbd><span>Close panel / search</span></div>
      <button class="button subtle" id="resetPrefsBtn" type="button">Reset saved preferences</button>
      <p class="legal-note">WAOS V${escapeHtml(CONFIG.version || '3')}. Preferences are stored only in this browser.</p>`;
    byId('themeSelect').addEventListener('change', e => setTheme(e.target.value));
    byId('basemapSelect').addEventListener('change', e => { setBasemap(e.target.value); renderSettingsPanel(); });
    byId('resetPrefsBtn').addEventListener('click', () => {
      localStorage.removeItem('waos-v3-prefs');
      state.prefs = JSON.parse(JSON.stringify(DEFAULT_PREFS));
      setTheme(state.prefs.theme); setBasemap(state.prefs.basemap);
      Object.entries(state.prefs.layers).forEach(([k,v]) => setOverlay(k,v));
      toast('Preferences reset');
      renderSettingsPanel();
    });
  }

  function setPanelHeading(eyebrow, title) {
    byId('panelEyebrow').textContent = eyebrow;
    byId('panelTitle').textContent = title;
  }

  function renderPanel() {
    switch (state.activePanel) {
      case 'alerts': renderAlertsPanel(); break;
      case 'weather': renderWeatherPanel(); break;
      case 'status': renderStatusPanel(); break;
      case 'sources': renderSourcesPanel(); break;
      case 'settings': renderSettingsPanel(); break;
      default: renderLayersPanel();
    }
  }

  function openPanel(name) {
    state.activePanel = name;
    state.prefs.panel = name;
    state.prefs.drawerOpen = true;
    savePrefs();
    byId('leftDrawer').classList.add('open');
    qs('.workspace').classList.add('drawer-open');
    qsa('[data-panel]').forEach(btn => btn.classList.toggle('active', btn.dataset.panel === name));
    renderPanel();
    window.setTimeout(() => state.map?.invalidateSize(), 260);
  }

  function closePanel() {
    state.prefs.drawerOpen = false;
    savePrefs();
    byId('leftDrawer').classList.remove('open');
    qs('.workspace').classList.remove('drawer-open');
    qsa('[data-panel]').forEach(btn => btn.classList.remove('active'));
    window.setTimeout(() => state.map?.invalidateSize(), 260);
  }

  function initPanels() {
    const mobile = window.matchMedia('(max-width:760px)').matches;
    state.activePanel = state.prefs.panel || 'layers';
    if (mobile) {
      byId('leftDrawer').classList.remove('open');
      qs('.workspace').classList.remove('drawer-open');
    } else if (state.prefs.drawerOpen !== false) {
      byId('leftDrawer').classList.add('open');
      qs('.workspace').classList.add('drawer-open');
    }
    qsa('[data-panel]').forEach(btn => btn.addEventListener('click', () => {
      const already = state.activePanel === btn.dataset.panel && byId('leftDrawer').classList.contains('open');
      if (already && btn.closest('.rail')) closePanel(); else openPanel(btn.dataset.panel);
    }));
    byId('closeDrawer').addEventListener('click', closePanel);
    renderPanel();
  }

  async function searchWA(query) {
    const q = query.trim();
    if (q.length < 2) return [];
    const elapsed = Date.now() - state.lastSearchAt;
    if (elapsed < 1100) await new Promise(r => setTimeout(r, 1100 - elapsed));
    state.lastSearchAt = Date.now();
    const params = new URLSearchParams({
      q, format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: 'au',
      viewbox: '112.6,-13.4,129.1,-35.2', bounded: '1'
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    return res.json();
  }

  function renderSearchResults(results) {
    const host = byId('searchResults');
    if (!results.length) {
      host.innerHTML = `<div class="empty-state"><strong>No WA matches</strong>Try a suburb, town, postcode or more complete address.</div>`;
      host.hidden = false;
      return;
    }
    host.innerHTML = results.map((r, i) => {
      const primary = r.name || r.display_name?.split(',')[0] || 'Location';
      const secondary = r.display_name || '';
      return `<button class="search-result" type="button" role="option" data-search-index="${i}"><svg class="icon"><use href="#i-location"></use></svg><div><strong>${escapeHtml(primary)}</strong><span>${escapeHtml(secondary)}</span></div></button>`;
    }).join('');
    host.hidden = false;
    qsa('[data-search-index]', host).forEach(btn => btn.addEventListener('click', () => chooseSearchResult(results[Number(btn.dataset.searchIndex)])));
  }

  function chooseSearchResult(r) {
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const name = r.name || r.display_name?.split(',')[0] || 'Selected location';
    byId('searchInput').value = name;
    byId('searchClear').hidden = false;
    byId('searchResults').hidden = true;
    state.overlayGroups.search.clearLayers();
    L.marker([lat, lon], { icon: makePin('#4fd1c5') }).addTo(state.overlayGroups.search).bindTooltip(name);
    state.map.flyTo([lat, lon], Number(r.type === 'house' ? 17 : 14), { duration: .55 });
    selectLocation({ name, lat, lon, detail: r.display_name || '' });
  }

  function initSearch() {
    const form = byId('searchForm'), input = byId('searchInput'), clear = byId('searchClear'), results = byId('searchResults');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!input.value.trim()) return;
      clear.hidden = false;
      results.innerHTML = `<div class="empty-state"><strong>Searching…</strong>Looking within Western Australia.</div>`;
      results.hidden = false;
      try { renderSearchResults(await searchWA(input.value)); }
      catch (err) { console.error(err); results.innerHTML = `<div class="empty-state"><strong>Search unavailable</strong>Please try again shortly.</div>`; }
    });
    input.addEventListener('input', () => { clear.hidden = !input.value; if (!input.value) results.hidden = true; });
    clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; results.hidden = true; clearSelection(); input.focus(); });
    document.addEventListener('pointerdown', e => { if (!form.contains(e.target)) results.hidden = true; });
  }

  async function refreshAll() {
    await Promise.allSettled([loadWeather(state.weatherLocation), loadFeeds({ silent: true })]);
    toast('WAOS refreshed', 'Weather and configured operational feeds were checked.');
    renderPanel();
  }

  function initKeyboard() {
    document.addEventListener('keydown', e => {
      const target = e.target;
      const typing = target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
      if (e.key === 'Escape') {
        byId('searchResults').hidden = true;
        if (window.matchMedia('(max-width:760px)').matches) closePanel();
        return;
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); byId('searchInput').focus(); }
      if (e.key.toLowerCase() === 'l') openPanel('layers');
      if (e.key.toLowerCase() === 'a') openPanel('alerts');
      if (e.key.toLowerCase() === 'w') openPanel('weather');
    });
  }

  function initResponsive() {
    let lastMobile = window.matchMedia('(max-width:760px)').matches;
    window.addEventListener('resize', () => {
      const mobile = window.matchMedia('(max-width:760px)').matches;
      if (mobile !== lastMobile) {
        lastMobile = mobile;
        if (mobile) closePanel(); else if (state.prefs.drawerOpen !== false) openPanel(state.activePanel);
      }
      state.map?.invalidateSize();
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(reg => reg.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(() => {});
    }
  }

  function boot() {
    updateClock(); window.setInterval(updateClock, 1000);
    initTheme();
    initMap();
    initPanels();
    initSearch();
    initSelectionActions();
    initKeyboard();
    initResponsive();
    registerServiceWorker();
    loadWeather(PERTH);
    loadFeeds({ silent: true });
    const weatherMs = Math.max(5, Number(CONFIG.refresh?.weatherMinutes || 10)) * 60000;
    const feedsMs = Math.max(5, Number(CONFIG.refresh?.feedsMinutes || 5)) * 60000;
    window.setInterval(() => loadWeather(state.weatherLocation), weatherMs);
    window.setInterval(() => loadFeeds({ silent: true }), feedsMs);
  }

  boot();
})();