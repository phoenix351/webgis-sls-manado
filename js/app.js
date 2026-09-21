// WebGIS Peta SLS & Titik Geotag Kota Manado - Core Application

(function () {
  'use strict';

  // State
  let map;
  let currentBasemap;
  const basemaps = {};
  
  let hierarchyData = null;
  let slsGeoJson = null;
  let slsLayer = null;
  let kecLayer = null;
  let highlightSlsLayer = null;
  
  let selectedSlsId = null;
  let activePointsData = [];
  let pointsLayerGroup = null;
  let markerClusterGroup = null;
  let pointCanvasRenderer = null;

  let activeCategories = new Set(['BKU', 'Campuran', 'BTT', 'Fasum', 'Kosong', 'Non Respon']);
  let filterOnlyBelum = false;
  let useClustering = true;
  let showBoundaries = true;

  // GPS Tracking State
  let isGpsActive = false;
  let gpsWatchId = null;
  let userLocationMarker = null;
  let userAccuracyCircle = null;
  let detectedGpsSls = null;

  // Colors & Categories
  const CATEGORY_COLORS = {
    'BKU': '#0064e6',
    'Campuran': '#aa1ec8',
    'BTT': '#1eaf1e',
    'Fasum': '#f5820a',
    'Kosong': '#8c8c8c',
    'Non Respon': '#e61414',
    'Lainnya': '#94a3b8'
  };

  // Init
  window.addEventListener('DOMContentLoaded', init);

  function init() {
    initMap();
    initControls();
    loadHierarchy();
    loadBoundaries();
  }

  // 1. MAP INITIALIZATION
  function initMap() {
    // Manado center roughly [1.4748, 124.8428]
    map = L.map('map', {
      center: [1.4900, 124.8450],
      zoom: 13,
      zoomControl: false,
      preferCanvas: true
    });

    // Renderer khusus titik dengan toleransi tap/sentuh 20px (sangat mudah disentuh di HP)
    pointCanvasRenderer = L.canvas({
      padding: 0.5,
      tolerance: 20
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Basemaps definition
    basemaps['google-hybrid'] = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 21,
      attribution: '&copy; Google Maps'
    });

    basemaps['google-sat'] = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 21,
      attribution: '&copy; Google Maps'
    });

    basemaps['google-street'] = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '&copy; Google Maps'
    });

    basemaps['osm'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });

    basemaps['esri-sat'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri World Imagery'
    });

    // Default Basemap
    currentBasemap = basemaps['google-hybrid'];
    currentBasemap.addTo(map);

    pointsLayerGroup = L.layerGroup().addTo(map);
    markerClusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    }).addTo(map);
  }

  // 2. DATA LOADING
  async function loadHierarchy() {
    try {
      const res = await fetch('data/hierarchy.json');
      hierarchyData = await res.json();
      populateKecamatanSelect();
    } catch (err) {
      console.error('Gagal memuat hierarki:', err);
    }
  }

  async function loadBoundaries() {
    // 1. Load Kecamatan Boundaries
    try {
      const resKec = await fetch('data/kecamatan.geojson');
      const kecData = await resKec.json();
      kecLayer = L.geoJSON(kecData, {
        style: {
          color: '#ffffff',
          weight: 2,
          opacity: 0.8,
          fillColor: '#0284c7',
          fillOpacity: 0.05,
          dashArray: '4, 4'
        },
        interactive: false
      }).addTo(map);
    } catch (e) {
      console.warn('Kecamatan GeoJSON not loaded:', e);
    }

    // 2. Load SLS Boundaries
    try {
      const resSls = await fetch('data/sls_manado.geojson');
      slsGeoJson = await resSls.json();
      
      slsLayer = L.geoJSON(slsGeoJson, {
        style: function (feat) {
          return {
            color: '#38bdf8',
            weight: 1.5,
            opacity: 0.75,
            fillColor: '#0284c7',
            fillOpacity: 0.08
          };
        },
        onEachFeature: function (feat, layer) {
          const p = feat.properties;
          layer.bindTooltip(`<b>${p.nmsls}</b><br><small>${p.nmdesa}, ${p.nmkec}</small>`, {
            sticky: true,
            className: 'sls-tooltip'
          });

          layer.on({
            mouseover: function (e) {
              if (p.idsls !== selectedSlsId) {
                e.target.setStyle({
                  weight: 3,
                  color: '#f59e0b',
                  fillOpacity: 0.2
                });
              }
            },
            mouseout: function (e) {
              if (p.idsls !== selectedSlsId) {
                slsLayer.resetStyle(e.target);
              }
            },
            click: function (e) {
              // PENTING: Jika pengguna mengklik poligon SLS yang sedang aktif (misal meleset saat tap titik),
              // JANGAN zoom out atau panggil ulang selectSlsById!
              if (p.idsls === selectedSlsId) {
                if (e && e.originalEvent) {
                  L.DomEvent.stopPropagation(e);
                }
                return;
              }
              selectSlsById(p.idsls, true);
            }
          });
        }
      }).addTo(map);

    } catch (err) {
      console.error('Gagal memuat batas SLS:', err);
    }
  }

  // 3. UI POPULATION & FILTERS
  function populateKecamatanSelect() {
    const sel = document.getElementById('select-kecamatan');
    sel.innerHTML = '<option value="">-- Pilih Kecamatan (Semua) --</option>';
    for (const kec of Object.keys(hierarchyData)) {
      const opt = document.createElement('option');
      opt.value = kec;
      opt.textContent = kec;
      sel.appendChild(opt);
    }
  }

  function handleKecamatanChange() {
    const selKec = document.getElementById('select-kecamatan');
    const selDesa = document.getElementById('select-kelurahan');
    const selSls = document.getElementById('select-sls');
    
    const kec = selKec.value;
    selDesa.innerHTML = '<option value="">-- Pilih Kelurahan --</option>';
    selSls.innerHTML = '<option value="">-- Pilih SLS --</option>';
    selSls.disabled = true;

    if (!kec || !hierarchyData[kec]) {
      selDesa.disabled = true;
      return;
    }

    selDesa.disabled = false;
    for (const desa of Object.keys(hierarchyData[kec])) {
      const opt = document.createElement('option');
      opt.value = desa;
      opt.textContent = desa;
      selDesa.appendChild(opt);
    }
  }

  function handleKelurahanChange() {
    const selKec = document.getElementById('select-kecamatan');
    const selDesa = document.getElementById('select-kelurahan');
    const selSls = document.getElementById('select-sls');
    
    const kec = selKec.value;
    const desa = selDesa.value;
    selSls.innerHTML = '<option value="">-- Pilih SLS --</option>';

    if (!desa || !hierarchyData[kec] || !hierarchyData[kec][desa]) {
      selSls.disabled = true;
      return;
    }

    selSls.disabled = false;
    const slsList = hierarchyData[kec][desa];
    for (const s of slsList) {
      const opt = document.createElement('option');
      opt.value = s.idsls;
      opt.textContent = `${s.nmsls} (${s.stat.total} titik)`;
      selSls.appendChild(opt);
    }
  }

  // 4. SELECT SLS & LOAD POINTS
  async function selectSlsById(idsls, syncDropdowns = true) {
    if (!idsls) return;
    selectedSlsId = idsls;

    // Find in GeoJSON
    let targetFeature = null;
    if (slsGeoJson) {
      targetFeature = slsGeoJson.features.find(f => f.properties.idsls === idsls);
    }

    if (!targetFeature) {
      console.warn('SLS tidak ditemukan:', idsls);
      return;
    }

    const p = targetFeature.properties;

    // Highlight SLS Polygon
    if (highlightSlsLayer) {
      map.removeLayer(highlightSlsLayer);
    }
    highlightSlsLayer = L.geoJSON(targetFeature, {
      style: {
        color: '#f59e0b',
        weight: 3.5,
        opacity: 1,
        fillColor: '#f59e0b',
        fillOpacity: 0.15
      },
      interactive: false
    }).addTo(map);

    // Zoom to bounds
    const bbox = p.bbox; // [min_lng, min_lat, max_lng, max_lat]
    map.fitBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]], {
      padding: [40, 40],
      maxZoom: 18,
      animate: true
    });

    // Update UI Cards
    updateSlsInfoCard(p);

    // Sync dropdowns if triggered from map click
    if (syncDropdowns) {
      document.getElementById('select-kecamatan').value = p.nmkec;
      handleKecamatanChange();
      document.getElementById('select-kelurahan').value = p.nmdesa;
      handleKelurahanChange();
      document.getElementById('select-sls').value = p.idsls;
    }

    // Auto-close sidebar on mobile
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
    }

    // Load Points
    await loadPointsForSls(idsls);
  }

  function updateSlsInfoCard(props) {
    const card = document.getElementById('sls-info-card');
    const filterSec = document.getElementById('point-filter-section');
    card.style.display = 'block';
    filterSec.style.display = 'block';

    document.getElementById('info-nmsls').textContent = props.nmsls;
    document.getElementById('info-admin').textContent = `Kecamatan ${props.nmkec}, Kelurahan ${props.nmdesa}`;
    document.getElementById('info-idsls').textContent = `ID SLS: ${props.idsls}`;
    document.getElementById('badge-luas').textContent = `${props.luas} Ha`;

    const s = props.stat;
    document.getElementById('stat-total').textContent = s.total;
    document.getElementById('stat-bku').textContent = s.bku;
    document.getElementById('stat-campuran').textContent = s.campuran;
    document.getElementById('stat-btt').textContent = s.btt;
    document.getElementById('stat-fasum').textContent = s.fasum;
    document.getElementById('stat-non-respon').textContent = s.non_respon;

    const total = s.total || 1;
    const pctBerhasil = Math.round((s.berhasil / total) * 100);
    const pctBelum = Math.round((s.belum / total) * 100);

    document.getElementById('bar-berhasil').style.width = `${pctBerhasil}%`;
    document.getElementById('bar-belum').style.width = `${pctBelum}%`;
    document.getElementById('label-berhasil').textContent = `Berhasil: ${s.berhasil} (${pctBerhasil}%)`;
    document.getElementById('label-belum').textContent = `Belum: ${s.belum} (${pctBelum}%)`;
  }

  // 5. RENDER POINTS WITH MULTIVARIATE SYMBOLOGY
  async function loadPointsForSls(idsls) {
    clearPoints();
    try {
      const res = await fetch(`data/points/${idsls}.json`);
      if (!res.ok) {
        console.warn('Berkas titik tidak ditemukan untuk SLS ini.');
        return;
      }
      activePointsData = await res.json();
      renderPoints();
    } catch (e) {
      console.error('Gagal mengambil titik SLS:', e);
    }
  }

  function clearPoints() {
    activePointsData = [];
    pointsLayerGroup.clearLayers();
    markerClusterGroup.clearLayers();
  }

  function renderPoints() {
    pointsLayerGroup.clearLayers();
    markerClusterGroup.clearLayers();

    const targetGroup = useClustering ? markerClusterGroup : pointsLayerGroup;

    for (const pt of activePointsData) {
      // Apply filters
      if (!activeCategories.has(pt.cat)) continue;
      if (filterOnlyBelum && pt.st !== 'BELUM') continue;

      const marker = createPointMarker(pt);
      targetGroup.addLayer(marker);
    }
  }

  function createPointMarker(pt) {
    const color = CATEGORY_COLORS[pt.cat] || '#94a3b8';
    const isBerhasil = (pt.st === 'BERHASIL');
    const isNonRespon = (pt.cat === 'Non Respon');

    let marker;

    if (isNonRespon) {
      // Red X custom div icon dengan area sentuh luas (36x36px) agar mudah di-tap di HP
      const icon = L.divIcon({
        className: 'custom-x-icon',
        html: `<div style="width:36px; height:36px; display:flex; align-items:center; justify-content:center; color:#e61414; font-weight:900; font-size:22px; line-height:1; cursor:pointer; text-shadow:0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff;">&times;</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      marker = L.marker([pt.lt, pt.lg], {
        icon: icon,
        bubblingMouseEvents: false
      });
    } else if (isBerhasil) {
      // Solid circle dengan white stroke dan renderer toleransi tinggi
      marker = L.circleMarker([pt.lt, pt.lg], {
        renderer: pointCanvasRenderer,
        radius: 8,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95,
        bubblingMouseEvents: false
      });
    } else {
      // Hollow circle (Cincin / Ring) dengan border tebal dan renderer toleransi tinggi
      marker = L.circleMarker([pt.lt, pt.lg], {
        renderer: pointCanvasRenderer,
        radius: 8.5,
        fillColor: '#ffffff',
        color: color,
        weight: 3.5,
        opacity: 1,
        fillOpacity: 0.85,
        bubblingMouseEvents: false
      });
    }

    // Popup Content
    const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${pt.lt},${pt.lg}`;
    const statusColor = isBerhasil ? '#10b981' : '#f59e0b';
    
    const popupHtml = `
      <div class="popup-header" style="background:linear-gradient(135deg, ${color}, #0f172a);">
        <span class="popup-cat-badge">${pt.cat}</span>
        <div class="popup-title">${pt.c || 'ID: ' + pt.i}</div>
      </div>
      <div class="popup-body">
        <div class="popup-row">
          <span class="popup-key">Fullcode</span>
          <span class="popup-val" style="font-family:monospace;">${pt.f}</span>
        </div>
        <div class="popup-row">
          <span class="popup-key">Kd Bangunan</span>
          <span class="popup-val">Kode ${pt.k || '-'}</span>
        </div>
        <div class="popup-row">
          <span class="popup-key">Status Keberadaan</span>
          <span class="popup-val">${pt.sk || '-'}</span>
        </div>
        <div class="popup-row">
          <span class="popup-key">Status Pendataan</span>
          <span class="popup-val" style="color:${statusColor}; font-weight:700;">${pt.sp || '-'}</span>
        </div>
        <div class="popup-row">
          <span class="popup-key">Akurasi GPS</span>
          <span class="popup-val">${pt.a} meter</span>
        </div>
        <div class="popup-row">
          <span class="popup-key">Koordinat</span>
          <span class="popup-val" style="font-size:0.72rem;">${pt.lt}, ${pt.lg}</span>
        </div>
        <a href="${gmapsNavUrl}" target="_blank" rel="noopener noreferrer" class="popup-btn-nav">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
          Buka Rute di Google Maps
        </a>
      </div>
    `;

    marker.bindPopup(popupHtml, { maxWidth: 300 });
    return marker;
  }

  // 6. REAL-TIME GPS & POINT-IN-POLYGON
  function toggleGps() {
    const btn = document.getElementById('btn-gps');
    if (isGpsActive) {
      if (userLocationMarker) {
        // Jika GPS sudah aktif, klik tombol GPS langsung memusatkan pandangan ke posisi pengguna
        map.flyTo(userLocationMarker.getLatLng(), 18, { duration: 0.8 });
      } else {
        stopGps();
        btn.classList.remove('active', 'gps-pulse');
      }
    } else {
      startGps();
      btn.classList.add('active', 'gps-pulse');
    }
  }

  function startGps() {
    if (!navigator.geolocation) {
      alert('Perangkat Anda tidak mendukung Geolocation API.');
      return;
    }
    isGpsActive = true;
    gpsWatchId = navigator.geolocation.watchPosition(
      onGpsSuccess,
      onGpsError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function stopGps() {
    isGpsActive = false;
    if (gpsWatchId !== null) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
    }
    if (userLocationMarker) map.removeLayer(userLocationMarker);
    if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);
    userLocationMarker = null;
    userAccuracyCircle = null;
    document.getElementById('gps-banner').classList.remove('show');
  }

  function onGpsSuccess(pos) {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = Math.round(pos.coords.accuracy);

    // Radar Beacon khusus agar posisi pengguna SANGAT MENCOLOK dan TIDAK TERSAMARKAN
    const userBeaconHtml = `
      <div class="user-location-beacon">
        <div class="user-location-radar"></div>
        <div class="user-location-radar"></div>
        <div class="user-location-core" title="Lokasi Anda">
          <div class="user-location-core-inner"></div>
        </div>
        <div class="user-location-tag">📍 Posisi Anda</div>
      </div>
    `;

    const userIcon = L.divIcon({
      className: 'user-location-marker-container',
      html: userBeaconHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (!userLocationMarker) {
      userLocationMarker = L.marker([lat, lng], {
        icon: userIcon,
        zIndexOffset: 10000, // Selalu di atas semua titik tagging dan klaster
        bubblingMouseEvents: false
      }).addTo(map);

      userAccuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: '#ff3b30',
        weight: 1.5,
        fillColor: '#ff3b30',
        fillOpacity: 0.1,
        dashArray: '4, 4'
      }).addTo(map);

      userLocationMarker.bindPopup(`
        <div style="padding:10px 14px; font-size:12px; line-height:1.5;">
          <b style="color:#ff3b30; font-size:13px;">📍 Lokasi GPS Anda</b><br>
          Akurasi: <b>${accuracy} meter</b><br>
          Koordinat: <span style="font-family:monospace; color:#334155;">${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
        </div>
      `, { offset: [0, -18] });

      // Pertama kali dapat GPS: zoom mulus ke posisi pengguna
      map.flyTo([lat, lng], 18, { duration: 1.2 });
    } else {
      userLocationMarker.setLatLng([lat, lng]);
      userAccuracyCircle.setLatLng([lat, lng]);
      userAccuracyCircle.setRadius(accuracy);
    }

    // Point in Polygon Check against SLS polygons
    checkUserSlsLocation(lng, lat);
  }

  function onGpsError(err) {
    console.warn('GPS Error:', err.message);
    alert('Tidak dapat mendeteksi lokasi GPS: ' + err.message);
    stopGps();
    document.getElementById('btn-gps').classList.remove('active', 'gps-pulse');
  }

  // Ray-Casting algorithm for Point-in-Polygon
  function pointInPolygon(point, vs) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function checkUserSlsLocation(lng, lat) {
    if (!slsGeoJson) return;

    for (const feat of slsGeoJson.features) {
      const geom = feat.geometry;
      let isInside = false;

      if (geom.type === 'Polygon') {
        isInside = pointInPolygon([lng, lat], geom.coordinates[0]);
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          if (pointInPolygon([lng, lat], poly[0])) {
            isInside = true;
            break;
          }
        }
      }

      if (isInside) {
        detectedGpsSls = feat.properties;
        const banner = document.getElementById('gps-banner');
        document.getElementById('gps-banner-text').innerHTML = `Posisi Anda: <b>${detectedGpsSls.nmsls}</b> (${detectedGpsSls.nmdesa})`;
        banner.classList.add('show');
        return;
      }
    }
  }

  // 7. EVENT CONTROLS
  function initControls() {
    // Selects
    document.getElementById('select-kecamatan').addEventListener('change', handleKecamatanChange);
    document.getElementById('select-kelurahan').addEventListener('change', handleKelurahanChange);
    document.getElementById('select-sls').addEventListener('change', (e) => {
      if (e.target.value) selectSlsById(e.target.value, false);
    });

    // Mobile menu toggle
    const sidebar = document.getElementById('sidebar');
    document.getElementById('mobile-toggle-btn').addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
    document.getElementById('close-sidebar-btn').addEventListener('click', () => {
      sidebar.classList.remove('open');
    });

    // Basemap toggle panel
    const btnBasemap = document.getElementById('btn-basemap');
    const basemapPanel = document.getElementById('basemap-panel');
    btnBasemap.addEventListener('click', () => {
      basemapPanel.classList.toggle('show');
    });

    document.querySelectorAll('.basemap-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.basemap-option').forEach(o => o.classList.remove('active'));
        el.classList.add('active');
        const key = el.getAttribute('data-map');
        if (basemaps[key]) {
          map.removeLayer(currentBasemap);
          currentBasemap = basemaps[key];
          currentBasemap.addTo(map);
          // Bring boundaries & markers to front
          if (kecLayer) kecLayer.bringToFront();
          if (slsLayer) slsLayer.bringToFront();
          if (highlightSlsLayer) highlightSlsLayer.bringToFront();
        }
        basemapPanel.classList.remove('show');
      });
    });

    // Toggle Boundaries
    const btnBoundaries = document.getElementById('btn-toggle-boundaries');
    btnBoundaries.addEventListener('click', () => {
      showBoundaries = !showBoundaries;
      btnBoundaries.classList.toggle('active', showBoundaries);
      if (showBoundaries) {
        if (slsLayer) map.addLayer(slsLayer);
        if (kecLayer) map.addLayer(kecLayer);
      } else {
        if (slsLayer) map.removeLayer(slsLayer);
        if (kecLayer) map.removeLayer(kecLayer);
      }
    });

    // Reset View
    document.getElementById('btn-reset-view').addEventListener('click', () => {
      map.setView([1.4900, 124.8450], 13);
    });

    // GPS Button
    document.getElementById('btn-gps').addEventListener('click', toggleGps);

    // Banner button to load detected GPS SLS
    document.getElementById('btn-load-gps-sls').addEventListener('click', () => {
      if (detectedGpsSls) {
        selectSlsById(detectedGpsSls.idsls, true);
        document.getElementById('gps-banner').classList.remove('show');
      }
    });

    // Category Filter Buttons
    document.querySelectorAll('.cat-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        if (activeCategories.has(cat)) {
          activeCategories.delete(cat);
          btn.classList.remove('active');
          btn.classList.add('inactive');
        } else {
          activeCategories.add(cat);
          btn.classList.add('active');
          btn.classList.remove('inactive');
        }
        renderPoints();
      });
    });

    // Reset Filters
    document.getElementById('btn-reset-filters').addEventListener('click', () => {
      activeCategories = new Set(['BKU', 'Campuran', 'BTT', 'Fasum', 'Kosong', 'Non Respon']);
      document.querySelectorAll('.cat-filter-btn').forEach(b => {
        b.classList.add('active');
        b.classList.remove('inactive');
      });
      document.getElementById('chk-only-belum').checked = false;
      filterOnlyBelum = false;
      renderPoints();
    });

    // Filter Belum Selesai checkbox
    document.getElementById('chk-only-belum').addEventListener('change', (e) => {
      filterOnlyBelum = e.target.checked;
      renderPoints();
    });

    // Cluster mode toggle
    document.getElementById('chk-cluster').addEventListener('change', (e) => {
      useClustering = e.target.checked;
      renderPoints();
    });

    // Legenda Toggle (Minimize / Expand)
    const legToggle = document.getElementById('legend-toggle');
    const legItems = document.getElementById('legend-items');
    legToggle.addEventListener('click', () => {
      if (legItems.style.display === 'none') {
        legItems.style.display = 'block';
        legToggle.textContent = 'Sembunyikan';
      } else {
        legItems.style.display = 'none';
        legToggle.textContent = 'Buka';
      }
    });

    // Quick Search Autocomplete
    const searchInput = document.getElementById('quick-search');
    searchInput.addEventListener('input', debounce((e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q || !slsGeoJson) return;

      // 1. Search SLS
      const match = slsGeoJson.features.find(f => {
        const p = f.properties;
        return p.nmsls.toLowerCase().includes(q) ||
               p.idsls.includes(q) ||
               p.nmdesa.toLowerCase().includes(q);
      });

      if (match) {
        selectSlsById(match.properties.idsls, true);
      }
    }, 400));
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

})();
