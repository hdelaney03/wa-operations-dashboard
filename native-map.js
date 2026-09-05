(() => {
  'use strict';

  const TILE_SIZE = 256;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const wrap = (v, n) => ((v % n) + n) % n;

  function project(lat, lon, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const x = (lon + 180) / 360 * scale;
    const sin = Math.sin(clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180);
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    return { x, y };
  }

  function unproject(x, y, zoom) {
    const scale = TILE_SIZE * Math.pow(2, zoom);
    const lon = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng: lon };
  }

  class Bounds {
    constructor(points = []) {
      this.minLat = Infinity; this.minLon = Infinity;
      this.maxLat = -Infinity; this.maxLon = -Infinity;
      points.forEach(p => this.extend(p));
    }
    extend(p) {
      if (!p) return this;
      const lat = Array.isArray(p) ? Number(p[0]) : Number(p.lat);
      const lon = Array.isArray(p) ? Number(p[1]) : Number(p.lng ?? p.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return this;
      this.minLat = Math.min(this.minLat, lat); this.maxLat = Math.max(this.maxLat, lat);
      this.minLon = Math.min(this.minLon, lon); this.maxLon = Math.max(this.maxLon, lon);
      return this;
    }
    isValid() { return Number.isFinite(this.minLat) && Number.isFinite(this.minLon) && Number.isFinite(this.maxLat) && Number.isFinite(this.maxLon); }
    pad(r = 0) {
      if (!this.isValid()) return new Bounds();
      const dLat = (this.maxLat - this.minLat || 0.08) * r;
      const dLon = (this.maxLon - this.minLon || 0.08) * r;
      return new Bounds([[this.minLat - dLat, this.minLon - dLon], [this.maxLat + dLat, this.maxLon + dLon]]);
    }
    getCenter() { return { lat: (this.minLat + this.maxLat) / 2, lng: (this.minLon + this.maxLon) / 2 }; }
  }

  class TileLayer {
    constructor(url, options = {}) { this.url = url; this.options = options; this._map = null; }
    addTo(map) { this._map = map; map._setBaseLayer(this); return this; }
  }

  class LayerGroup {
    constructor() { this.layers = []; this._map = null; this._visible = false; }
    addTo(map) { this._map = map; this._visible = true; map._groups.add(this); map._renderOverlays(); return this; }
    addLayer(layer) { if (!this.layers.includes(layer)) this.layers.push(layer); layer._group = this; if (this._map && this._visible) this._map._renderOverlays(); return this; }
    clearLayers() { this.layers.length = 0; if (this._map) this._map._renderOverlays(); return this; }
  }

  class Marker {
    constructor(latlng, options = {}) { this.latlng = { lat: Number(latlng[0]), lng: Number(latlng[1]) }; this.options = options; this.popup = ''; this.tooltip = ''; this._group = null; }
    addTo(target) { if (target instanceof LayerGroup) target.addLayer(this); else if (target?._addStandaloneLayer) target._addStandaloneLayer(this); return this; }
    bindPopup(html) { this.popup = html || ''; return this; }
    bindTooltip(text) { this.tooltip = text || ''; return this; }
  }

  class Polygon {
    constructor(points, options = {}) { this.points = (points || []).map(p => [Number(p[0]), Number(p[1])]); this.options = options; this.popup = ''; this._group = null; }
    addTo(target) { if (target instanceof LayerGroup) target.addLayer(this); else if (target?._addStandaloneLayer) target._addStandaloneLayer(this); return this; }
    bindPopup(html) { this.popup = html || ''; return this; }
  }

  class NativeMap {
    constructor(id, options = {}) {
      this.el = typeof id === 'string' ? document.getElementById(id) : id;
      if (!this.el) throw new Error('Map container not found');
      this.options = options;
      this.center = { lat: -31.9523, lng: 115.8613 };
      this.zoom = 9;
      this._baseLayer = null;
      this._groups = new Set();
      this._standalone = [];
      this._events = new Map();
      this._drag = null;
      this._build();
      this._bindInput();
    }

    _build() {
      this.el.innerHTML = '';
      this.el.classList.add('waos-native-map');
      this.tilePane = document.createElement('div');
      this.tilePane.className = 'waos-native-tiles';
      this.overlayPane = document.createElement('div');
      this.overlayPane.className = 'waos-native-overlays';
      this.popupPane = document.createElement('div');
      this.popupPane.className = 'waos-native-popup-pane';
      this.attribution = document.createElement('div');
      this.attribution.className = 'waos-native-attribution';
      this.el.append(this.tilePane, this.overlayPane, this.popupPane, this.attribution);
    }

    _bindInput() {
      this.el.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('.waos-native-popup')) return;
        this.el.setPointerCapture?.(e.pointerId);
        const p = project(this.center.lat, this.center.lng, this.zoom);
        this._drag = { x: e.clientX, y: e.clientY, cx: p.x, cy: p.y };
        this.el.classList.add('dragging');
      });
      this.el.addEventListener('pointermove', e => {
        if (!this._drag) return;
        const x = this._drag.cx - (e.clientX - this._drag.x);
        const y = this._drag.cy - (e.clientY - this._drag.y);
        this.center = unproject(x, y, this.zoom);
        this.center.lat = clamp(this.center.lat, -85, 85);
        this._render();
      });
      const endDrag = () => {
        if (!this._drag) return;
        this._drag = null;
        this.el.classList.remove('dragging');
        this._emit('moveend');
      };
      this.el.addEventListener('pointerup', endDrag);
      this.el.addEventListener('pointercancel', endDrag);
      this.el.addEventListener('wheel', e => {
        e.preventDefault();
        const next = clamp(this.zoom + (e.deltaY < 0 ? 1 : -1), this.options.minZoom ?? 3, 19);
        if (next === this.zoom) return;
        const rect = this.el.getBoundingClientRect();
        const beforeCenter = project(this.center.lat, this.center.lng, this.zoom);
        const cursorWorld = { x: beforeCenter.x + e.clientX - rect.left - rect.width / 2, y: beforeCenter.y + e.clientY - rect.top - rect.height / 2 };
        const cursorGeo = unproject(cursorWorld.x, cursorWorld.y, this.zoom);
        this.zoom = next;
        const cursorWorld2 = project(cursorGeo.lat, cursorGeo.lng, this.zoom);
        const centerWorld2 = { x: cursorWorld2.x - (e.clientX - rect.left - rect.width / 2), y: cursorWorld2.y - (e.clientY - rect.top - rect.height / 2) };
        this.center = unproject(centerWorld2.x, centerWorld2.y, this.zoom);
        this._render();
        this._emit('zoomend'); this._emit('moveend');
      }, { passive: false });
      window.addEventListener('resize', () => this.invalidateSize());
    }

    on(names, fn) { String(names).split(/\s+/).filter(Boolean).forEach(n => { if (!this._events.has(n)) this._events.set(n, new Set()); this._events.get(n).add(fn); }); return this; }
    _emit(name, detail = {}) { (this._events.get(name) || []).forEach(fn => { try { fn({ target: this, ...detail }); } catch {} }); }
    setView(center, zoom = this.zoom) { this.center = { lat: Number(center[0]), lng: Number(center[1]) }; this.zoom = clamp(Math.round(Number(zoom)), this.options.minZoom ?? 3, 19); this._render(); this._emit('moveend'); this._emit('zoomend'); return this; }
    flyTo(center, zoom = this.zoom) { return this.setView(center, zoom); }
    getCenter() { return { lat: this.center.lat, lng: this.center.lng }; }
    getZoom() { return this.zoom; }
    invalidateSize() { this._render(); return this; }
    hasLayer(layer) { return layer === this._baseLayer || (layer instanceof LayerGroup && layer._map === this && layer._visible); }
    removeLayer(layer) {
      if (layer === this._baseLayer) { this._baseLayer = null; this._renderTiles(); return this; }
      if (layer instanceof LayerGroup) { layer._visible = false; this._renderOverlays(); return this; }
      return this;
    }
    _setBaseLayer(layer) { this._baseLayer = layer; this._renderTiles(); this._renderAttribution(); }
    _addStandaloneLayer(layer) { this._standalone.push(layer); this._renderOverlays(); }

    fitBounds(boundsLike, options = {}) {
      let b = boundsLike instanceof Bounds ? boundsLike : new Bounds(boundsLike || []);
      if (!b.isValid()) return this;
      const rect = this.el.getBoundingClientRect();
      const pad = Array.isArray(options.padding) ? Math.max(...options.padding) : 24;
      const maxZoom = options.maxZoom ?? 16;
      let chosen = this.options.minZoom ?? 3;
      for (let z = maxZoom; z >= (this.options.minZoom ?? 3); z--) {
        const a = project(b.maxLat, b.minLon, z), c = project(b.minLat, b.maxLon, z);
        if (Math.abs(c.x - a.x) <= Math.max(60, rect.width - pad * 2) && Math.abs(c.y - a.y) <= Math.max(60, rect.height - pad * 2)) { chosen = z; break; }
      }
      const center = b.getCenter();
      return this.setView([center.lat, center.lng], chosen);
    }

    _render() { this._renderTiles(); this._renderOverlays(); this._renderAttribution(); }

    _renderTiles() {
      this.tilePane.innerHTML = '';
      if (!this._baseLayer) return;
      const rect = this.el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const z = this.zoom, n = Math.pow(2, z), centerPx = project(this.center.lat, this.center.lng, z);
      const left = centerPx.x - rect.width / 2, top = centerPx.y - rect.height / 2;
      const x0 = Math.floor(left / TILE_SIZE) - 1, x1 = Math.floor((left + rect.width) / TILE_SIZE) + 1;
      const y0 = Math.max(0, Math.floor(top / TILE_SIZE) - 1), y1 = Math.min(n - 1, Math.floor((top + rect.height) / TILE_SIZE) + 1);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const wrappedX = wrap(tx, n);
          const img = document.createElement('img');
          img.className = 'waos-native-tile';
          const sub = ['a','b','c'][Math.abs(tx + ty) % 3];
          img.src = this._baseLayer.url.replace('{s}', sub).replace('{z}', z).replace('{x}', wrappedX).replace('{y}', ty);
          img.alt = '';
          img.draggable = false;
          img.style.left = `${tx * TILE_SIZE - left}px`;
          img.style.top = `${ty * TILE_SIZE - top}px`;
          this.tilePane.appendChild(img);
        }
      }
    }

    _visibleLayers() {
      const out = [...this._standalone];
      for (const group of this._groups) if (group._visible) out.push(...group.layers);
      return out;
    }

    _renderOverlays() {
      this.overlayPane.innerHTML = '';
      this.popupPane.innerHTML = '';
      const rect = this.el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const centerPx = project(this.center.lat, this.center.lng, this.zoom);
      const toScreen = (lat, lon) => { const p = project(lat, lon, this.zoom); return { x: p.x - centerPx.x + rect.width / 2, y: p.y - centerPx.y + rect.height / 2 }; };

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'waos-native-svg');
      svg.setAttribute('width', String(rect.width)); svg.setAttribute('height', String(rect.height));
      this.overlayPane.appendChild(svg);

      for (const layer of this._visibleLayers()) {
        if (layer instanceof Polygon) {
          const pts = layer.points.map(([lat, lon]) => toScreen(lat, lon)).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
          if (pts.length < 3) continue;
          const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
          poly.setAttribute('fill', layer.options.fillColor || layer.options.color || '#ff646d');
          poly.setAttribute('fill-opacity', String(layer.options.fillOpacity ?? 0.16));
          poly.setAttribute('stroke', layer.options.color || '#ff646d');
          poly.setAttribute('stroke-opacity', String(layer.options.opacity ?? 0.95));
          poly.setAttribute('stroke-width', String(layer.options.weight ?? 2));
          if (layer.popup) { poly.style.cursor = 'pointer'; poly.addEventListener('click', e => this._showPopup(layer.popup, e.offsetX, e.offsetY)); }
          svg.appendChild(poly);
        } else if (layer instanceof Marker) {
          const p = toScreen(layer.latlng.lat, layer.latlng.lng);
          if (p.x < -80 || p.y < -80 || p.x > rect.width + 80 || p.y > rect.height + 80) continue;
          const marker = document.createElement('div');
          marker.className = `waos-native-marker ${layer.options.icon?.options?.className || ''}`;
          marker.innerHTML = layer.options.icon?.options?.html || '<div class="waos-native-default-pin"></div>';
          const anchor = layer.options.icon?.options?.iconAnchor || [12, 12];
          marker.style.left = `${p.x - Number(anchor[0] || 0)}px`;
          marker.style.top = `${p.y - Number(anchor[1] || 0)}px`;
          if (layer.tooltip) { marker.title = String(layer.tooltip); }
          if (layer.popup) marker.addEventListener('click', e => { e.stopPropagation(); this._showPopup(layer.popup, p.x, p.y); });
          this.overlayPane.appendChild(marker);
        }
      }
    }

    _showPopup(html, x, y) {
      this.popupPane.innerHTML = '';
      const p = document.createElement('div');
      p.className = 'waos-native-popup';
      p.innerHTML = `<button type="button" aria-label="Close">×</button><div>${html}</div>`;
      p.style.left = `${clamp(x, 130, Math.max(130, this.el.clientWidth - 130))}px`;
      p.style.top = `${clamp(y, 80, Math.max(80, this.el.clientHeight - 100))}px`;
      p.querySelector('button').addEventListener('click', () => p.remove());
      this.popupPane.appendChild(p);
    }

    _renderAttribution() {
      const text = this._baseLayer?.options?.attribution || '';
      this.attribution.innerHTML = text;
    }
  }

  window.L = {
    map: (id, options) => new NativeMap(id, options),
    tileLayer: (url, options) => new TileLayer(url, options),
    layerGroup: () => new LayerGroup(),
    marker: (latlng, options) => new Marker(latlng, options),
    polygon: (points, options) => new Polygon(points, options),
    divIcon: options => ({ options: options || {} }),
    latLngBounds: points => new Bounds(points || [])
  };
})();