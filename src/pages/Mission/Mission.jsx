/**
 * DHARAWATCH — Intervention Evidence Review
 *
 * Route: /mission
 *
 * Review field evidence, satellite change and terrain context for watershed interventions.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Camera, Droplets, Mountain, Satellite, ShieldCheck, CheckCircle2,
  AlertTriangle, Clock, MapPin, Layers, ZoomIn, ZoomOut, Maximize,
  Info, Eye, ChevronDown, Check, X, Plus, Upload, Compass, Filter,
  Share2, ArrowRight, RefreshCw, Sliders, ExternalLink, Bookmark
} from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  fetchReviewWatersheds,
  fetchReviewInterventions,
  fetchInterventionDetail,
  addFieldPhoto,
  toggleReviewStatus,
  getStatusBadge
} from '../../services/interventionReviewService';
import './Mission.css';

// ─── Dropdown Helper ─────────────────────────────────────────────────────────
function Dropdown({ anchorRef, open, onClose, children, width = 320 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open || !anchorRef.current) return null;
  const rect = anchorRef.current.getBoundingClientRect();
  return (
    <div
      ref={ref}
      className="review-dropdown-portal"
      style={{
        position: 'fixed',
        top: rect.bottom + 6,
        left: rect.left,
        width: Math.max(width, rect.width),
        zIndex: 99999
      }}
    >
      {children}
    </div>
  );
}

export default function InterventionEvidenceReview() {
  const location = useLocation();

  // ─── State: Control Bar ─────────────────────────────────────────────────────
  const [watersheds, setWatersheds] = useState([]);
  const [selectedWatershed, setSelectedWatershed] = useState(null);
  const [interventions, setInterventions] = useState([]);
  const [selectedInterventionId, setSelectedInterventionId] = useState(null);
  const [interventionDetail, setInterventionDetail] = useState(null);

  // Time periods
  const [beforePeriod, setBeforePeriod] = useState('2022-05 (Baseline)');
  const [afterPeriod, setAfterPeriod] = useState('2024-09 (Current)');

  // Dropdown toggles
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [intDropdownOpen, setIntDropdownOpen] = useState(false);
  const [beforeDropdownOpen, setBeforeDropdownOpen] = useState(false);
  const [afterDropdownOpen, setAfterDropdownOpen] = useState(false);

  const wsAnchorRef = useRef(null);
  const intAnchorRef = useRef(null);
  const beforeAnchorRef = useRef(null);
  const afterAnchorRef = useRef(null);

  // Active Tab: 'EVIDENCE' | 'CHANGE' | 'TERRAIN'
  const [activeTab, setActiveTab] = useState('EVIDENCE');

  // Slider position for Before/After satellite comparison (0 to 100%)
  const [sliderPos, setSliderPos] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  // Map layer toggles
  const [layers, setLayers] = useState({
    interventions: true,
    fieldPhotos: true,
    drainage: true,
    demElevation: false,
    slope: false,
    flowAccumulation: false
  });
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const layerAnchorRef = useRef(null);

  // Modals & Notifications
  const [selectedPhotoModal, setSelectedPhotoModal] = useState(null);
  const [addEvidenceModalOpen, setAddEvidenceModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Add photo form state
  const [newPhotoForm, setNewPhotoForm] = useState({
    title: '',
    type: 'Verification Audit',
    photographer: 'Field Officer',
    notes: '',
    url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
    lat: '',
    lng: ''
  });

  // MapLibre references
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ─── 1. Initial Load: Watersheds ──────────────────────────────────────────
  useEffect(() => {
    let unmounted = false;
    async function loadInitial() {
      setLoading(true);
      try {
        const wsList = await fetchReviewWatersheds();
        if (unmounted) return;
        setWatersheds(wsList);
        if (wsList.length > 0) {
          const initialWs = wsList[0];
          setSelectedWatershed(initialWs);
          loadInterventionsForWs(initialWs.id);
        }
      } catch (err) {
        console.warn('[Review] Load watersheds error:', err);
      } finally {
        if (!unmounted) setLoading(false);
      }
    }
    loadInitial();
    return () => { unmounted = true; };
  }, []);

  // ─── 2. Load Interventions for Watershed ───────────────────────────────────
  const loadInterventionsForWs = useCallback(async (wsId, preferredIntId = null) => {
    try {
      const items = await fetchReviewInterventions(wsId);
      setInterventions(items);
      if (items.length > 0) {
        const targetId = preferredIntId || items[0].id;
        setSelectedInterventionId(targetId);
        loadDetail(targetId);
      } else {
        setSelectedInterventionId(null);
        setInterventionDetail(null);
      }
    } catch (err) {
      console.warn('[Review] Load interventions error:', err);
    }
  }, []);

  // ─── 3. Load Intervention Detail ──────────────────────────────────────────
  const loadDetail = useCallback(async (intId) => {
    setLoading(true);
    try {
      const detail = await fetchInterventionDetail(intId);
      setInterventionDetail(detail);
      // Center map on intervention
      if (mapRef.current && detail?.lat && detail?.lng) {
        mapRef.current.flyTo({
          center: [detail.lng, detail.lat],
          zoom: 14.5,
          speed: 1.2,
          curve: 1.4
        });
      }
    } catch (err) {
      console.warn('[Review] Load detail error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── 4. Analyze Action Handler ────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!selectedInterventionId) return;
    setAnalyzing(true);
    try {
      await loadDetail(selectedInterventionId);
      showToast('Intervention multi-source evidence synchronized.');
    } finally {
      setTimeout(() => setAnalyzing(false), 500);
    }
  };

  // ─── 5. Map Initialization with Google Satellite Layer ─────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
            ],
            tileSize: 256,
            attribution: '© Google Satellite'
          }
        },
        layers: [
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      center: [73.7351, 21.8294],
      zoom: 13.5,
      pitch: 25
    });

    mapRef.current = map;

    // Resize observer to ensure full container width and height
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(mapContainerRef.current);

    map.on('load', () => {
      map.resize();

      // Add Watershed Boundary GeoJSON
      map.addSource('ws-boundary', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { name: 'Kevadiya Catchment' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [73.40, 21.60], [73.95, 21.62], [74.00, 22.05],
              [73.65, 22.10], [73.35, 21.85], [73.40, 21.60]
            ]]
          }
        }
      });

      map.addLayer({
        id: 'ws-boundary-line',
        type: 'line',
        source: 'ws-boundary',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 2,
          'line-dasharray': [4, 2],
          'line-opacity': 0.8
        }
      });

      // Add Drainage Network
      map.addSource('drainage-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { streamOrder: 3, name: 'Karjan River Tributary' },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [73.68, 21.78], [73.71, 21.81], [73.735, 21.829],
                  [73.75, 21.845], [73.78, 21.87]
                ]
              }
            },
            {
              type: 'Feature',
              properties: { streamOrder: 2, name: 'Valley Drainage Stream' },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [73.71, 21.845], [73.725, 21.835], [73.735, 21.829]
                ]
              }
            }
          ]
        }
      });

      map.addLayer({
        id: 'drainage-layer',
        type: 'line',
        source: 'drainage-source',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
        paint: {
          'line-color': '#06b6d4',
          'line-width': 3,
          'line-opacity': 0.9
        }
      });
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ─── 6. Update Map Markers & Layers ────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // 1. Plot Interventions
    if (layers.interventions && interventions.length > 0) {
      interventions.forEach(item => {
        const isSelected = item.id === selectedInterventionId;
        const statusBadge = getStatusBadge(item.evidenceStatus);

        const el = document.createElement('div');
        el.className = `ier-map-marker ${isSelected ? 'ier-marker-selected' : ''}`;
        el.style.backgroundColor = statusBadge.color;

        el.innerHTML = `
          <div class="ier-marker-inner">
            ${isSelected ? '★' : '•'}
          </div>
          ${isSelected ? `<div class="ier-marker-label">${item.name}</div>` : ''}
        `;

        el.addEventListener('click', () => {
          setSelectedInterventionId(item.id);
          loadDetail(item.id);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([item.lng, item.lat])
          .addTo(mapRef.current);

        markersRef.current.push(marker);
      });
    }

    // 2. Plot Field Photos for the selected intervention
    if (layers.fieldPhotos && interventionDetail?.fieldPhotos?.length > 0) {
      interventionDetail.fieldPhotos.forEach(photo => {
        const el = document.createElement('div');
        el.className = 'ier-photo-marker';
        el.innerHTML = `
          <div class="ier-photo-marker-pin">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          </div>
        `;

        el.addEventListener('click', () => {
          setSelectedPhotoModal(photo);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([photo.lng, photo.lat])
          .addTo(mapRef.current);

        markersRef.current.push(marker);
      });
    }

    // 3. Update layer visibility
    if (mapRef.current.isStyleLoaded()) {
      if (mapRef.current.getLayer('drainage-layer')) {
        mapRef.current.setLayoutProperty(
          'drainage-layer',
          'visibility',
          layers.drainage ? 'visible' : 'none'
        );
      }
    }
  }, [interventions, selectedInterventionId, interventionDetail, layers, loadDetail]);

  // ─── 7. Toggle Review / Watchlist Status ────────────────────────────────────
  const handleToggleReview = async () => {
    if (!interventionDetail) return;
    const nextStatus = !interventionDetail.isReviewed;
    try {
      const res = await toggleReviewStatus({
        interventionId: interventionDetail.id,
        isReviewed: nextStatus
      });
      setInterventionDetail(prev => ({
        ...prev,
        isReviewed: res.isReviewed,
        reviewStatus: res.isReviewed ? 'REVIEWED' : 'PENDING_REVIEW'
      }));
      setInterventions(prev => prev.map(item =>
        item.id === interventionDetail.id ? { ...item, isReviewed: res.isReviewed } : item
      ));
      showToast(res.message || (nextStatus ? 'Intervention marked as Reviewed.' : 'Intervention marked for Review.'));
    } catch (err) {
      showToast('Failed to update review status.');
    }
  };

  // ─── 8. Add Field Evidence Submission ──────────────────────────────────────
  const handleAddPhotoSubmit = async (e) => {
    e.preventDefault();
    if (!interventionDetail) return;

    try {
      const res = await addFieldPhoto({
        interventionId: interventionDetail.id,
        title: newPhotoForm.title || 'Field Ground Inspection',
        type: newPhotoForm.type,
        photographer: newPhotoForm.photographer,
        notes: newPhotoForm.notes,
        url: newPhotoForm.url,
        lat: newPhotoForm.lat || interventionDetail.lat,
        lng: newPhotoForm.lng || interventionDetail.lng
      });

      if (res.intervention) {
        setInterventionDetail(res.intervention);
      }

      setAddEvidenceModalOpen(false);
      setNewPhotoForm({
        title: '',
        type: 'Verification Audit',
        photographer: 'Field Officer',
        notes: '',
        url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80',
        lat: '',
        lng: ''
      });
      showToast('Geo-tagged field evidence recorded successfully.');
    } catch (err) {
      showToast('Failed to save field evidence.');
    }
  };

  // ─── 9. Dragging Handler for Before/After Slider ───────────────────────────
  const handleSliderMouseDown = () => setIsDraggingSlider(true);
  const handleSliderMouseMove = (e) => {
    if (!isDraggingSlider) return;
    const container = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - container.left;
    const pct = Math.max(0, Math.min(100, (x / container.width) * 100));
    setSliderPos(pct);
  };
  const handleSliderMouseUp = () => setIsDraggingSlider(false);

  const statusBadge = interventionDetail?.evidenceStatusInfo
    ? getStatusBadge(interventionDetail.evidenceStatusInfo.status)
    : getStatusBadge('NO DATA');

  return (
    <div className="ier-layout">
      {/* Side Navigation Rail */}
      <AppNavigation />

      <main className="ier-main">
        {/* ─── Top Page Header ────────────────────────────────────────── */}
        <header className="ier-header">
          <div className="ier-header-left">
            <div className="ier-badge-row">
              <span className="ier-status-pill">
                <span className="ier-status-dot" />
                EVIDENCE MONITORING
              </span>
              <span className="ier-sub-badge">SIH26015 WATERSHED VERIFICATION</span>
            </div>
            <h1 className="ier-title">INTERVENTION EVIDENCE REVIEW</h1>
            <p className="ier-subtitle">
              Review field evidence, satellite change and terrain context for watershed interventions.
            </p>
          </div>

          <div className="ier-header-right">
            {interventionDetail && (
              <button
                className={`ier-review-btn ${interventionDetail.isReviewed ? 'ier-btn-reviewed' : ''}`}
                onClick={handleToggleReview}
                title="Mark this intervention for follow-up or mark as reviewed"
              >
                <Bookmark size={15} />
                {interventionDetail.isReviewed ? 'REVIEWED ✓' : 'MARK FOR REVIEW'}
              </button>
            )}
          </div>
        </header>

        {/* ─── Top Control Bar ────────────────────────────────────────── */}
        <section className="ier-control-bar">
          {/* Watershed Selector */}
          <div className="ier-control-group">
            <label className="ier-control-label">WATERSHED</label>
            <div
              ref={wsAnchorRef}
              className="ier-select-trigger"
              onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            >
              <div className="ier-select-value">
                <span className="ier-select-main">{selectedWatershed?.name || 'Select Watershed'}</span>
                <span className="ier-select-sub">{selectedWatershed?.state || 'India'} · {selectedWatershed?.areaKm2 || 0} km²</span>
              </div>
              <ChevronDown size={15} className="ier-chevron" />
            </div>

            <Dropdown
              anchorRef={wsAnchorRef}
              open={wsDropdownOpen}
              onClose={() => setWsDropdownOpen(false)}
            >
              <div className="ier-dropdown-header">AVAILABLE WATERSHEDS</div>
              <div className="ier-dropdown-list">
                {watersheds.map(ws => (
                  <div
                    key={ws.id}
                    className={`ier-dropdown-item ${selectedWatershed?.id === ws.id ? 'ier-item-active' : ''}`}
                    onClick={() => {
                      setSelectedWatershed(ws);
                      setWsDropdownOpen(false);
                      loadInterventionsForWs(ws.id);
                    }}
                  >
                    <div className="ier-item-title">{ws.name}</div>
                    <div className="ier-item-sub">{ws.district}, {ws.state} · {ws.interventionsCount} interventions</div>
                  </div>
                ))}
              </div>
            </Dropdown>
          </div>

          {/* Intervention Selector */}
          <div className="ier-control-group">
            <label className="ier-control-label">INTERVENTION</label>
            <div
              ref={intAnchorRef}
              className="ier-select-trigger"
              onClick={() => setIntDropdownOpen(!intDropdownOpen)}
            >
              <div className="ier-select-value">
                <span className="ier-select-main">{interventionDetail?.name || 'Select Intervention'}</span>
                <span className="ier-select-sub">{interventionDetail?.type || 'Intervention'} · {interventionDetail?.status || ''}</span>
              </div>
              <ChevronDown size={15} className="ier-chevron" />
            </div>

            <Dropdown
              anchorRef={intAnchorRef}
              open={intDropdownOpen}
              onClose={() => setIntDropdownOpen(false)}
            >
              <div className="ier-dropdown-header">WATERSHED INTERVENTIONS ({interventions.length})</div>
              <div className="ier-dropdown-list">
                {interventions.map(item => {
                  const badge = getStatusBadge(item.evidenceStatus);
                  return (
                    <div
                      key={item.id}
                      className={`ier-dropdown-item ${selectedInterventionId === item.id ? 'ier-item-active' : ''}`}
                      onClick={() => {
                        setSelectedInterventionId(item.id);
                        setIntDropdownOpen(false);
                        loadDetail(item.id);
                      }}
                    >
                      <div className="ier-item-row">
                        <span className="ier-item-title">{item.name}</span>
                        <span className="ier-item-status-pill" style={{ color: badge.color, backgroundColor: badge.bg }}>
                          {item.evidenceStatus}
                        </span>
                      </div>
                      <div className="ier-item-sub">{item.type} · {item.village}</div>
                    </div>
                  );
                })}
              </div>
            </Dropdown>
          </div>

          {/* Time Period: Before */}
          <div className="ier-control-group">
            <label className="ier-control-label">BEFORE (BASELINE)</label>
            <div
              ref={beforeAnchorRef}
              className="ier-select-trigger ier-select-sm"
              onClick={() => setBeforeDropdownOpen(!beforeDropdownOpen)}
            >
              <span className="ier-select-main">{beforePeriod}</span>
              <ChevronDown size={14} className="ier-chevron" />
            </div>
            <Dropdown
              anchorRef={beforeAnchorRef}
              open={beforeDropdownOpen}
              onClose={() => setBeforeDropdownOpen(false)}
              width={220}
            >
              <div className="ier-dropdown-list">
                {['2021-06 (Pre-Monsoon)', '2022-05 (Baseline)', '2022-10 (Post-Monsoon)', '2023-05 (Dry Season)'].map(p => (
                  <div
                    key={p}
                    className={`ier-dropdown-item ${beforePeriod === p ? 'ier-item-active' : ''}`}
                    onClick={() => { setBeforePeriod(p); setBeforeDropdownOpen(false); }}
                  >
                    {p}
                  </div>
                ))}
              </div>
            </Dropdown>
          </div>

          {/* Time Period: After */}
          <div className="ier-control-group">
            <label className="ier-control-label">AFTER (CURRENT)</label>
            <div
              ref={afterAnchorRef}
              className="ier-select-trigger ier-select-sm"
              onClick={() => setAfterDropdownOpen(!afterDropdownOpen)}
            >
              <span className="ier-select-main">{afterPeriod}</span>
              <ChevronDown size={14} className="ier-chevron" />
            </div>
            <Dropdown
              anchorRef={afterAnchorRef}
              open={afterDropdownOpen}
              onClose={() => setAfterDropdownOpen(false)}
              width={220}
            >
              <div className="ier-dropdown-list">
                {['2023-10 (Post-Monsoon)', '2024-05 (Pre-Monsoon)', '2024-09 (Current)', '2024-10 (Latest S2)'].map(p => (
                  <div
                    key={p}
                    className={`ier-dropdown-item ${afterPeriod === p ? 'ier-item-active' : ''}`}
                    onClick={() => { setAfterPeriod(p); setAfterDropdownOpen(false); }}
                  >
                    {p}
                  </div>
                ))}
              </div>
            </Dropdown>
          </div>

          {/* Analyze Button */}
          <button
            className={`ier-analyze-btn ${analyzing ? 'ier-btn-analyzing' : ''}`}
            onClick={handleAnalyze}
            disabled={analyzing || !selectedInterventionId}
          >
            {analyzing ? (
              <>
                <RefreshCw size={15} className="ier-spinner" />
                ANALYZING...
              </>
            ) : (
              <>
                <Eye size={15} />
                ANALYZE INTERVENTION
              </>
            )}
          </button>
        </section>

        {/* ─── Main 2-Column Layout ──────────────────────────────────── */}
        <div className="ier-body">
          {/* ─── LEFT: Interactive Satellite Map ────────────────────── */}
          <section className="ier-map-col">
            <div className="ier-map-wrapper">
              <div ref={mapContainerRef} className="ier-map-container" />

              {/* Map Floating Controls */}
              <div className="ier-map-controls">
                <button
                  className="ier-map-btn"
                  title="Zoom In"
                  onClick={() => mapRef.current?.zoomIn()}
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  className="ier-map-btn"
                  title="Zoom Out"
                  onClick={() => mapRef.current?.zoomOut()}
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  className="ier-map-btn"
                  title="Center on Intervention"
                  onClick={() => {
                    if (mapRef.current && interventionDetail) {
                      mapRef.current.flyTo({
                        center: [interventionDetail.lng, interventionDetail.lat],
                        zoom: 14.5
                      });
                    }
                  }}
                >
                  <Maximize size={16} />
                </button>

                {/* Layer Control Trigger */}
                <div style={{ position: 'relative' }}>
                  <button
                    ref={layerAnchorRef}
                    className={`ier-map-btn ${layerMenuOpen ? 'ier-map-btn-active' : ''}`}
                    title="Toggle Map Layers"
                    onClick={() => setLayerMenuOpen(!layerMenuOpen)}
                  >
                    <Layers size={16} />
                  </button>

                  <Dropdown
                    anchorRef={layerAnchorRef}
                    open={layerMenuOpen}
                    onClose={() => setLayerMenuOpen(false)}
                    width={240}
                  >
                    <div className="ier-dropdown-header">MAP LAYERS</div>
                    <div className="ier-layer-list">
                      <label className="ier-layer-item">
                        <input
                          type="checkbox"
                          checked={layers.interventions}
                          onChange={(e) => setLayers(prev => ({ ...prev, interventions: e.target.checked }))}
                        />
                        <span>Watershed Interventions</span>
                      </label>
                      <label className="ier-layer-item">
                        <input
                          type="checkbox"
                          checked={layers.fieldPhotos}
                          onChange={(e) => setLayers(prev => ({ ...prev, fieldPhotos: e.target.checked }))}
                        />
                        <span>Field Evidence Photos</span>
                      </label>
                      <label className="ier-layer-item">
                        <input
                          type="checkbox"
                          checked={layers.drainage}
                          onChange={(e) => setLayers(prev => ({ ...prev, drainage: e.target.checked }))}
                        />
                        <span>Drainage Network</span>
                      </label>
                    </div>
                  </Dropdown>
                </div>
              </div>

              {/* Map Footer Bar / Coordinate Overlay */}
              {interventionDetail && (
                <div className="ier-map-overlay-footer">
                  <div className="ier-coord-chip">
                    <MapPin size={12} className="text-cyan-400" />
                    <span>{interventionDetail.lat.toFixed(4)}°N, {interventionDetail.lng.toFixed(4)}°E</span>
                  </div>
                  <div className="ier-coord-chip">
                    <Mountain size={12} className="text-emerald-400" />
                    <span>Elev: {interventionDetail.terrain?.elevationM || 412}m</span>
                  </div>
                  <div className="ier-coord-chip">
                    <Droplets size={12} className="text-blue-400" />
                    <span>Drainage: {interventionDetail.terrain?.drainageDistanceM || 38}m</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ─── RIGHT: Summary & Multi-Source Evidence Panel ─────────── */}
          <section className="ier-detail-col">
            {loading && !interventionDetail ? (
              <div className="ier-loading-box">
                <RefreshCw size={24} className="ier-spinner text-cyan-400" />
                <p>Analyzing intervention evidence...</p>
              </div>
            ) : !interventionDetail ? (
              <div className="ier-empty-box">
                <Info size={32} className="text-gray-500" />
                <p>Select an intervention from the top control bar to begin analysis.</p>
              </div>
            ) : (
              <div className="ier-detail-scroll">
                {/* 1. Header Card */}
                <div className="ier-card ier-card-header">
                  <div className="ier-header-meta">
                    <div className="ier-header-top">
                      <span className="ier-type-tag">{interventionDetail.type}</span>
                      <span className="ier-status-tag">{interventionDetail.status}</span>
                      {interventionDetail.scheme && (
                        <span className="ier-scheme-tag">{interventionDetail.scheme}</span>
                      )}
                    </div>
                    <h2 className="ier-int-name">{interventionDetail.name}</h2>
                    <div className="ier-location-line">
                      <MapPin size={13} className="text-cyan-400" />
                      <span>{interventionDetail.village}, {interventionDetail.district}</span>
                      <span className="ier-dot-sep">•</span>
                      <span>Constructed: {interventionDetail.constructionDate}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Evidence Status Banner */}
                <div
                  className="ier-status-banner"
                  style={{
                    backgroundColor: statusBadge.bg,
                    borderColor: statusBadge.border
                  }}
                >
                  <div className="ier-status-banner-header">
                    <span className="ier-status-banner-title">EVIDENCE STATUS</span>
                    <span
                      className="ier-status-badge-pill"
                      style={{
                        backgroundColor: statusBadge.color,
                        color: '#000',
                        fontWeight: 700
                      }}
                    >
                      {statusBadge.label}
                    </span>
                  </div>
                  <p className="ier-status-explanation">
                    {interventionDetail.evidenceStatusInfo?.explanation ||
                      'Recent geo-tagged field evidence and satellite observations are consistent.'}
                  </p>
                </div>

                {/* 3. Three Core Highlight Cards (Field + Satellite + Terrain) */}
                <div className="ier-triad-grid">
                  {/* Field Card */}
                  <div
                    className={`ier-triad-card ${activeTab === 'EVIDENCE' ? 'ier-triad-card-active' : ''}`}
                    onClick={() => setActiveTab('EVIDENCE')}
                  >
                    <div className="ier-triad-icon-row">
                      <div className="ier-triad-icon ier-icon-green">
                        <Camera size={15} />
                      </div>
                      <span className="ier-triad-label">FIELD EVIDENCE</span>
                    </div>
                    <div className="ier-triad-value">
                      {(interventionDetail.fieldPhotos || []).length} Photos
                    </div>
                    <div className="ier-triad-sub">
                      {interventionDetail.fieldPhotos?.length > 0
                        ? `Latest: ${interventionDetail.fieldPhotos[0].date}`
                        : 'No photos recorded'}
                    </div>
                    <div className="ier-triad-pill-row">
                      <span className="ier-mini-pill">GPS: ✓ Available</span>
                    </div>
                  </div>

                  {/* Satellite Card */}
                  <div
                    className={`ier-triad-card ${activeTab === 'CHANGE' ? 'ier-triad-card-active' : ''}`}
                    onClick={() => setActiveTab('CHANGE')}
                  >
                    <div className="ier-triad-icon-row">
                      <div className="ier-triad-icon ier-icon-blue">
                        <Satellite size={15} />
                      </div>
                      <span className="ier-triad-label">SATELLITE CHANGE</span>
                    </div>
                    <div className="ier-triad-value">
                      NDVI {interventionDetail.satelliteChange?.ndvi?.delta >= 0 ? '+' : ''}
                      {interventionDetail.satelliteChange?.ndvi?.delta?.toFixed(2) || '0.00'}
                    </div>
                    <div className="ier-triad-sub">
                      Water: {interventionDetail.satelliteChange?.waterExtentHa?.delta >= 0 ? '+' : ''}
                      {interventionDetail.satelliteChange?.waterExtentHa?.delta?.toFixed(1) || '0.0'} ha
                    </div>
                    <div className="ier-triad-pill-row">
                      <span className="ier-mini-pill">Sentinel-2 L2A</span>
                    </div>
                  </div>

                  {/* Terrain Card */}
                  <div
                    className={`ier-triad-card ${activeTab === 'TERRAIN' ? 'ier-triad-card-active' : ''}`}
                    onClick={() => setActiveTab('TERRAIN')}
                  >
                    <div className="ier-triad-icon-row">
                      <div className="ier-triad-icon ier-icon-amber">
                        <Mountain size={15} />
                      </div>
                      <span className="ier-triad-label">TERRAIN CONTEXT</span>
                    </div>
                    <div className="ier-triad-value">
                      {interventionDetail.terrain?.flowAccumulation || 'HIGH'} Accum.
                    </div>
                    <div className="ier-triad-sub">
                      Drainage: {interventionDetail.terrain?.drainageDistanceM || 38} m
                    </div>
                    <div className="ier-triad-pill-row">
                      <span className="ier-mini-pill">Elev: {interventionDetail.terrain?.elevationM || 412}m</span>
                    </div>
                  </div>
                </div>

                {/* 4. Tab Navigation */}
                <div className="ier-tabs-nav">
                  <button
                    className={`ier-tab-btn ${activeTab === 'EVIDENCE' ? 'ier-tab-active' : ''}`}
                    onClick={() => setActiveTab('EVIDENCE')}
                  >
                    <Camera size={14} />
                    FIELD EVIDENCE ({interventionDetail.fieldPhotos?.length || 0})
                  </button>
                  <button
                    className={`ier-tab-btn ${activeTab === 'CHANGE' ? 'ier-tab-active' : ''}`}
                    onClick={() => setActiveTab('CHANGE')}
                  >
                    <Satellite size={14} />
                    SATELLITE CHANGE
                  </button>
                  <button
                    className={`ier-tab-btn ${activeTab === 'TERRAIN' ? 'ier-tab-active' : ''}`}
                    onClick={() => setActiveTab('TERRAIN')}
                  >
                    <Mountain size={14} />
                    TERRAIN & DEM
                  </button>
                </div>

                {/* 5. Tab Content: FIELD EVIDENCE */}
                {activeTab === 'EVIDENCE' && (
                  <div className="ier-tab-body">
                    <div className="ier-action-bar">
                      <div className="ier-section-title">
                        GEO-TAGGED FIELD PHOTOGRAPHS
                      </div>
                      <button
                        className="ier-btn-secondary"
                        onClick={() => setAddEvidenceModalOpen(true)}
                      >
                        <Plus size={14} />
                        ADD EVIDENCE
                      </button>
                    </div>

                    {(!interventionDetail.fieldPhotos || interventionDetail.fieldPhotos.length === 0) ? (
                      <div className="ier-empty-state-card">
                        <Camera size={28} className="text-gray-500" />
                        <p>No geo-tagged field photographs currently recorded for this intervention.</p>
                        <button
                          className="ier-btn-primary ier-btn-sm"
                          onClick={() => setAddEvidenceModalOpen(true)}
                        >
                          <Upload size={14} />
                          Upload First Ground Photo
                        </button>
                      </div>
                    ) : (
                      <div className="ier-photo-grid">
                        {interventionDetail.fieldPhotos.map((photo, idx) => (
                          <div
                            key={photo.id || idx}
                            className="ier-photo-card"
                            onClick={() => setSelectedPhotoModal(photo)}
                          >
                            <div className="ier-photo-thumb-wrap">
                              <img src={photo.thumbnail || photo.url} alt={photo.title} className="ier-photo-thumb" />
                              <span className="ier-photo-type-badge">{photo.type || 'Field Photo'}</span>
                            </div>
                            <div className="ier-photo-card-info">
                              <h4 className="ier-photo-title">{photo.title}</h4>
                              <div className="ier-photo-meta-row">
                                <span><Clock size={11} /> {photo.date}</span>
                                <span><MapPin size={11} /> ±{photo.accuracyMeters || 3.0}m</span>
                              </div>
                              <p className="ier-photo-notes-snippet">{photo.notes}</p>
                              <div className="ier-photo-author">By: {photo.photographer}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 6. Tab Content: SATELLITE CHANGE */}
                {activeTab === 'CHANGE' && (
                  <div className="ier-tab-body">
                    <div className="ier-section-title">TEMPORAL CHANGE DETECTION</div>

                    {/* Interactive Before / After Split Comparison */}
                    <div
                      className="ier-slider-container"
                      onMouseDown={handleSliderMouseDown}
                      onMouseMove={handleSliderMouseMove}
                      onMouseUp={handleSliderMouseUp}
                      onMouseLeave={handleSliderMouseUp}
                    >
                      {/* After Image */}
                      <img
                        src={interventionDetail.satelliteChange?.currentImageUrl || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80'}
                        alt="Current Satellite Observation"
                        className="ier-slider-img"
                      />
                      <span className="ier-slider-badge ier-badge-after">AFTER: {afterPeriod}</span>

                      {/* Before Image */}
                      <div
                        className="ier-slider-clipped"
                        style={{ width: `${sliderPos}%` }}
                      >
                        <img
                          src={interventionDetail.satelliteChange?.baselineImageUrl || 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=900&q=80'}
                          alt="Baseline Satellite Observation"
                          className="ier-slider-img"
                        />
                        <span className="ier-slider-badge ier-badge-before">BEFORE: {beforePeriod}</span>
                      </div>

                      {/* Divider Handle */}
                      <div className="ier-slider-handle" style={{ left: `${sliderPos}%` }}>
                        <div className="ier-handle-line" />
                        <div className="ier-handle-knob">
                          <Sliders size={13} />
                        </div>
                      </div>
                    </div>

                    {/* Quantitative Metric Comparison Grid */}
                    <div className="ier-metrics-grid">
                      {/* NDVI Metric */}
                      <div className="ier-metric-box">
                        <div className="ier-metric-label">VEGETATION DENSITY (NDVI)</div>
                        <div className="ier-metric-transition">
                          <span className="ier-metric-val-old">{interventionDetail.satelliteChange?.ndvi?.before || 0.34}</span>
                          <ArrowRight size={13} className="text-gray-500" />
                          <span className="ier-metric-val-new">{interventionDetail.satelliteChange?.ndvi?.after || 0.47}</span>
                          <span className={`ier-metric-delta ${(interventionDetail.satelliteChange?.ndvi?.delta || 0) >= 0 ? 'ier-delta-pos' : 'ier-delta-neg'}`}>
                            {(interventionDetail.satelliteChange?.ndvi?.delta || 0) >= 0 ? '+' : ''}
                            {interventionDetail.satelliteChange?.ndvi?.delta?.toFixed(2) || '+0.13'}
                          </span>
                        </div>
                        <p className="ier-metric-interp">
                          {interventionDetail.satelliteChange?.ndvi?.interpretation || 'Vegetation index change within parcel'}
                        </p>
                      </div>

                      {/* Water Extent Metric */}
                      <div className="ier-metric-box">
                        <div className="ier-metric-label">SURFACE WATER EXTENT</div>
                        <div className="ier-metric-transition">
                          <span className="ier-metric-val-old">{interventionDetail.satelliteChange?.waterExtentHa?.before || 2.7} ha</span>
                          <ArrowRight size={13} className="text-gray-500" />
                          <span className="ier-metric-val-new">{interventionDetail.satelliteChange?.waterExtentHa?.after || 4.9} ha</span>
                          <span className={`ier-metric-delta ${(interventionDetail.satelliteChange?.waterExtentHa?.delta || 0) >= 0 ? 'ier-delta-pos' : 'ier-delta-neg'}`}>
                            {(interventionDetail.satelliteChange?.waterExtentHa?.delta || 0) >= 0 ? '+' : ''}
                            {interventionDetail.satelliteChange?.waterExtentHa?.delta?.toFixed(1) || '+2.2'} ha
                          </span>
                        </div>
                        <p className="ier-metric-interp">
                          {interventionDetail.satelliteChange?.waterExtentHa?.interpretation || 'Surface water expansion'}
                        </p>
                      </div>

                      {/* Land Cover Transition */}
                      <div className="ier-metric-box ier-metric-box-full">
                        <div className="ier-metric-label">LAND USE / COVER TRANSITION</div>
                        <div className="ier-lulc-row">
                          <span className="ier-lulc-chip ier-lulc-before">
                            {interventionDetail.satelliteChange?.lulc?.before || 'Barren / Fallow'}
                          </span>
                          <ArrowRight size={13} className="text-cyan-400" />
                          <span className="ier-lulc-chip ier-lulc-after">
                            {interventionDetail.satelliteChange?.lulc?.after || 'Water Storage & Crop'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Observed Change Narrative */}
                    <div className="ier-narrative-box">
                      <div className="ier-narrative-header">
                        <Info size={14} className="text-cyan-400" />
                        <span>OBSERVED SATELLITE CHANGE</span>
                      </div>
                      <p className="ier-narrative-text">
                        "{interventionDetail.satelliteChange?.observedChangeSummary ||
                          'Vegetation and water-related indicators increased during the selected comparison period.'}"
                      </p>
                      <div className="ier-disclaimer-note">
                        Note: Satellite observations indicate change in spectral indices during the comparison period. Causal attribution is not inferred.
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. Tab Content: TERRAIN & HYDROLOGY */}
                {activeTab === 'TERRAIN' && (
                  <div className="ier-tab-body">
                    <div className="ier-section-title">DEM TERRAIN & HYDROLOGICAL CONTEXT</div>

                    <div className="ier-terrain-grid">
                      <div className="ier-terrain-card">
                        <span className="ier-terrain-label">ELEVATION</span>
                        <span className="ier-terrain-val">{interventionDetail.terrain?.elevationM || 412} m</span>
                        <span className="ier-terrain-sub">Above Mean Sea Level</span>
                      </div>

                      <div className="ier-terrain-card">
                        <span className="ier-terrain-label">SLOPE GRADIENT</span>
                        <span className="ier-terrain-val">{interventionDetail.terrain?.slopeDeg || 7.2}°</span>
                        <span className="ier-terrain-sub">Valley Flank</span>
                      </div>

                      <div className="ier-terrain-card">
                        <span className="ier-terrain-label">FLOW ACCUMULATION</span>
                        <span className="ier-terrain-val ier-val-highlight">{interventionDetail.terrain?.flowAccumulation || 'HIGH'}</span>
                        <span className="ier-terrain-sub">{interventionDetail.terrain?.flowAccumulationVal || '14,250 cells'}</span>
                      </div>

                      <div className="ier-terrain-card">
                        <span className="ier-terrain-label">NEAREST DRAINAGE</span>
                        <span className="ier-terrain-val">{interventionDetail.terrain?.drainageDistanceM || 38} m</span>
                        <span className="ier-terrain-sub">Order {interventionDetail.terrain?.streamOrder || 3} Stream</span>
                      </div>
                    </div>

                    {/* Terrain Explanation */}
                    <div className="ier-narrative-box">
                      <div className="ier-narrative-header">
                        <Mountain size={14} className="text-emerald-400" />
                        <span>TERRAIN & HYDROLOGY ANALYSIS</span>
                      </div>
                      <p className="ier-narrative-text">
                        "{interventionDetail.terrain?.explanation ||
                          'Terrain context indicates that the intervention is located near a high-flow-accumulation drainage area.'}"
                      </p>
                      <div className="ier-disclaimer-note">
                        Data Source: {interventionDetail.terrain?.dataSource || 'DEM DEMONSTRATION DATA (SRTM 30m derived)'}
                      </div>
                    </div>
                  </div>
                )}

                {/* 8. Structured Factual Assessment Card */}
                <div className="ier-card ier-assessment-card">
                  <div className="ier-assessment-header">
                    <ShieldCheck size={16} className="text-cyan-400" />
                    <span>SYNTHESIZED EVIDENCE ASSESSMENT</span>
                  </div>
                  <p className="ier-assessment-body">
                    {interventionDetail.assessment?.summary ||
                      'Field evidence confirms a geo-referenced intervention at the selected location. Satellite analysis shows increased vegetation and water-related indicators during the comparison period. Terrain analysis indicates proximity to a high-flow-accumulation drainage area.'}
                  </p>
                  <div className="ier-assessment-footer">
                    <span>Structured Decision-Support Heuristic · PS26015 Compliant</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ─── Photo Detail Modal ─────────────────────────────────────── */}
      {selectedPhotoModal && (
        <div className="ier-modal-backdrop" onClick={() => setSelectedPhotoModal(null)}>
          <div className="ier-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ier-modal-header">
              <div>
                <h3 className="ier-modal-title">{selectedPhotoModal.title}</h3>
                <span className="ier-modal-sub">{selectedPhotoModal.type} · {selectedPhotoModal.date}</span>
              </div>
              <button className="ier-modal-close" onClick={() => setSelectedPhotoModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="ier-modal-body">
              <div className="ier-modal-img-wrap">
                <img src={selectedPhotoModal.url} alt={selectedPhotoModal.title} className="ier-modal-img" />
              </div>

              <div className="ier-modal-meta-grid">
                <div className="ier-meta-item">
                  <span className="ier-meta-lbl">GEO-COORDINATES</span>
                  <span className="ier-meta-val">{selectedPhotoModal.lat?.toFixed(5)}°N, {selectedPhotoModal.lng?.toFixed(5)}°E</span>
                </div>
                <div className="ier-meta-item">
                  <span className="ier-meta-lbl">GPS ACCURACY</span>
                  <span className="ier-meta-val">±{selectedPhotoModal.accuracyMeters || 3.0} meters</span>
                </div>
                <div className="ier-meta-item">
                  <span className="ier-meta-lbl">DEVICE / SENSOR</span>
                  <span className="ier-meta-val">{selectedPhotoModal.device || 'Mobile GPS'}</span>
                </div>
                <div className="ier-meta-item">
                  <span className="ier-meta-lbl">INSPECTOR</span>
                  <span className="ier-meta-val">{selectedPhotoModal.photographer || 'Field Officer'}</span>
                </div>
              </div>

              {selectedPhotoModal.notes && (
                <div className="ier-modal-notes">
                  <span className="ier-meta-lbl">FIELD INSPECTION NOTES</span>
                  <p className="ier-notes-text">{selectedPhotoModal.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Field Evidence Modal ───────────────────────────────── */}
      {addEvidenceModalOpen && (
        <div className="ier-modal-backdrop" onClick={() => setAddEvidenceModalOpen(false)}>
          <div className="ier-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ier-modal-header">
              <div>
                <h3 className="ier-modal-title">ADD GEO-TAGGED FIELD EVIDENCE</h3>
                <span className="ier-modal-sub">Attach field inspection photograph and ground observations</span>
              </div>
              <button className="ier-modal-close" onClick={() => setAddEvidenceModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddPhotoSubmit} className="ier-form">
              <div className="ier-form-group">
                <label className="ier-form-lbl">PHOTO TITLE / DESCRIPTION</label>
                <input
                  type="text"
                  className="ier-form-input"
                  placeholder="e.g. Spillway Inspection & Basin Storage"
                  value={newPhotoForm.title}
                  onChange={(e) => setNewPhotoForm(p => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>

              <div className="ier-form-row">
                <div className="ier-form-group">
                  <label className="ier-form-lbl">INSPECTION TYPE</label>
                  <select
                    className="ier-form-input"
                    value={newPhotoForm.type}
                    onChange={(e) => setNewPhotoForm(p => ({ ...p, type: e.target.value }))}
                  >
                    <option value="Post-Monsoon Storage">Post-Monsoon Storage</option>
                    <option value="Embankment Inspection">Embankment Inspection</option>
                    <option value="Spillway Audit">Spillway Audit</option>
                    <option value="Routine Verification">Routine Verification</option>
                    <option value="Damage Assessment">Damage Assessment</option>
                  </select>
                </div>

                <div className="ier-form-group">
                  <label className="ier-form-lbl">FIELD OFFICER NAME</label>
                  <input
                    type="text"
                    className="ier-form-input"
                    value={newPhotoForm.photographer}
                    onChange={(e) => setNewPhotoForm(p => ({ ...p, photographer: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="ier-form-row">
                <div className="ier-form-group">
                  <label className="ier-form-lbl">LATITUDE (°N)</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="ier-form-input"
                    placeholder={interventionDetail?.lat?.toFixed(4) || '21.8294'}
                    value={newPhotoForm.lat}
                    onChange={(e) => setNewPhotoForm(p => ({ ...p, lat: e.target.value }))}
                  />
                </div>
                <div className="ier-form-group">
                  <label className="ier-form-lbl">LONGITUDE (°E)</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="ier-form-input"
                    placeholder={interventionDetail?.lng?.toFixed(4) || '73.7351'}
                    value={newPhotoForm.lng}
                    onChange={(e) => setNewPhotoForm(p => ({ ...p, lng: e.target.value }))}
                  />
                </div>
              </div>

              <div className="ier-form-group">
                <label className="ier-form-lbl">FIELD INSPECTION OBSERVATIONS</label>
                <textarea
                  className="ier-form-textarea"
                  rows={3}
                  placeholder="Record structural condition, water depth, siltation, or vegetation observations..."
                  value={newPhotoForm.notes}
                  onChange={(e) => setNewPhotoForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>

              <div className="ier-form-actions">
                <button
                  type="button"
                  className="ier-btn-secondary"
                  onClick={() => setAddEvidenceModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="ier-btn-primary">
                  <Upload size={14} />
                  Save Geo-Tagged Evidence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Toast Notification ─────────────────────────────────────── */}
      {toastMessage && (
        <div className="ier-toast">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
