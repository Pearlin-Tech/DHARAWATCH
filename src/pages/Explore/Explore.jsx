import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Calendar, Layers, Map as MapIcon, ChevronRight, 
  MessageSquare, Plus, Minus, Crosshair, Sparkles, Navigation,
  Menu, Eye, Calendar as CalendarIcon, FileStack, Settings, Activity, Clock, MapPin, X,
  GripHorizontal, Maximize2, Minimize2, Paperclip, ArrowUp, Compass, Cpu, CheckCircle2, AlertTriangle, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import maplibregl from '../../lib/maplibre';
import { aiService } from '../../services/aiService';
import { validateGeoTiffFile, processClientGeoTiff } from '../../utils/geotiffClient';
import './Explore.css';

export default function Explore() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [lng, setLng] = useState(72.5714);
  const [lat, setLat] = useState(23.0225);
  const [zoom, setZoom] = useState(12);
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const [activeLayer, setActiveLayer] = useState('satellite');
  const [layersOpen, setLayersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [markerCoords, setMarkerCoords] = useState(null);
  const [hoverCoords, setHoverCoords] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [layerOpacity, setLayerOpacity] = useState(100);
  
  // Geolocation state
  const [locatingState, setLocatingState] = useState('idle'); // idle, locating, success, denied, error
  const [userLocation, setUserLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);

  const [mapError, setMapError] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (map.current) return; // initialize map only once
    
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: [
                'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
              ],
              tileSize: 256,
              attribution: 'Google'
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
        center: [lng, lat],
        zoom: zoom,
        attributionControl: false
      });

      map.current.on('load', () => {
        setIsLoading(false);
        // We would add satellite imagery layers here
      });

      map.current.on('move', () => {
        setLng(map.current.getCenter().lng.toFixed(4));
        setLat(map.current.getCenter().lat.toFixed(4));
        setZoom(map.current.getZoom().toFixed(2));
      });

      map.current.on('mousemove', (e) => {
        // Throttle state update using requestAnimationFrame
        requestAnimationFrame(() => {
          setHoverCoords({
            lng: e.lngLat.lng.toFixed(4),
            lat: e.lngLat.lat.toFixed(4),
            x: e.point.x,
            y: e.point.y
          });
        });
      });

      map.current.on('mouseout', () => {
        setHoverCoords(null);
      });

      map.current.on('click', (e) => {
        setMarkerCoords({
          lat: parseFloat(e.lngLat.lat),
          lng: parseFloat(e.lngLat.lng)
        });
        setInspectorOpen(true);
        setLayersOpen(false);
      });
    } catch (err) {
      console.error('Map initialization failed in Explore:', err);
      setMapError(true);
      setIsLoading(false);
    }
  }, [lng, lat, zoom]);

  // Handle Escape key to close panels
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setLayersOpen(false);
        setInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync selected location marker
  useEffect(() => {
    if (!map.current) return;
    
    if (markerCoords) {
      if (!markerRef.current) {
        // Create a custom DOM element for the marker
        const el = document.createElement('div');
        el.className = 'custom-map-marker';
        markerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([markerCoords.lng, markerCoords.lat])
          .addTo(map.current);
      } else {
        markerRef.current.setLngLat([markerCoords.lng, markerCoords.lat]);
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    }
  }, [markerCoords]);

  // Sync user location marker
  useEffect(() => {
    if (!map.current) return;
    
    if (userLocation) {
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        const inner = document.createElement('div');
        inner.className = 'user-location-dot';
        el.appendChild(inner);
        
        userMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map.current);
      } else {
        userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      }
    }
  }, [userLocation]);

  const handleZoomIn = () => map.current?.zoomIn();
  const handleZoomOut = () => map.current?.zoomOut();
  const handleResetView = () => map.current?.flyTo({ center: [72.5714, 23.0225], zoom: 12 });

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      setLocatingState('error');
      return;
    }
    
    setLocatingState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy: locAccuracy } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        setAccuracy(Math.round(locAccuracy));
        setLocatingState('success');
        
        map.current?.flyTo({
          center: [longitude, latitude],
          zoom: 14,
          duration: 2500
        });
      },
      (error) => {
        setLocatingState(error.code === 1 ? 'denied' : 'error');
        setTimeout(() => setLocatingState('idle'), 4000);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const handleSearch = (e) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      // Simulate finding a location
      const simulatedCoords = { lng: -122.4194, lat: 37.7749 };
      setMarkerCoords(simulatedCoords);
      setInspectorOpen(true);
      map.current?.flyTo({
        center: [simulatedCoords.lng, simulatedCoords.lat],
        zoom: 13,
        duration: 2000
      });
    }
  };


  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotContext, setCopilotContext] = useState(null);
  const [copilotMode, setCopilotMode] = useState('explorer');
  const [aiState, setAiState] = useState('idle');
  const [queryInput, setQueryInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);

  // Copilot Dragging & Session Persistence State
  const copilotRef = useRef(null);
  const [copilotPos, setCopilotPos] = useState(() => {
    try {
      const saved = localStorage.getItem('drishtiWatchCopilotPosition');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read saved copilot position:', e);
    }
    return null;
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);

  // GeoTIFF Attachment states
  const [attachmentState, setAttachmentState] = useState('IDLE');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentMeta, setAttachmentMeta] = useState(null);
  const [attachmentError, setAttachmentError] = useState(null);

  const handleFileSelect = async (file) => {
    if (!file) return;
    setAttachmentError(null);
    setAttachmentState('VALIDATING');

    const val = validateGeoTiffFile(file);
    if (!val.valid) {
      setAttachmentError(val.error);
      setAttachmentState('ERROR');
      return;
    }

    try {
      setAttachmentState('PROCESSING');
      const clientMeta = await processClientGeoTiff(file);

      setAttachmentState('UPLOADING');
      const uploadRes = await aiService.uploadRaster(file);

      setAttachmentMeta({
        ...clientMeta,
        ...uploadRes.metadata,
        attachmentId: uploadRes.attachmentId,
        filename: uploadRes.filename,
        sizeMb: uploadRes.sizeMb
      });
      setAttachmentFile(file);
      setAttachmentState('READY');
    } catch (err) {
      console.error('GeoTIFF upload error in Copilot:', err);
      setAttachmentError(err.message || 'Failed to parse TIFF metadata.');
      setAttachmentState('ERROR');
    }
  };

  const clearAttachment = () => {
    setAttachmentState('IDLE');
    setAttachmentFile(null);
    setAttachmentMeta(null);
    setAttachmentError(null);
  };

  // Clamp position to viewport bounds
  const clampPosition = (x, y) => {
    const width = 450;
    const height = 580;
    const minX = 10;
    const minY = 10;
    const maxX = Math.max(minX, window.innerWidth - width - 10);
    const maxY = Math.max(minY, window.innerHeight - height - 10);
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY)
    };
  };

  // Pointer down handler on drag header bar
  const handleDragPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('label')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    let currentX = copilotPos?.x;
    let currentY = copilotPos?.y;

    if (currentX === undefined || currentY === undefined || currentX === null) {
      if (copilotRef.current) {
        const rect = copilotRef.current.getBoundingClientRect();
        currentX = rect.left;
        currentY = rect.top;
      } else {
        currentX = Math.max(20, window.innerWidth - 470);
        currentY = Math.max(20, window.innerHeight - 620);
      }
    }

    setDragOffset({
      x: e.clientX - currentX,
      y: e.clientY - currentY
    });
    setIsDragging(true);
  };

  // Dragging event listeners
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      const clamped = clampPosition(newX, newY);
      setCopilotPos(clamped);
    };

    const handlePointerUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (copilotPos) {
        try {
          localStorage.setItem('drishtiWatchCopilotPosition', JSON.stringify(copilotPos));
        } catch (err) {
          console.warn('Could not save copilot position:', err);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { capture: true });
    window.addEventListener('pointerup', handlePointerUp, { capture: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
    };
  }, [isDragging, dragOffset, copilotPos]);

  // Window resize clamp
  useEffect(() => {
    const handleResize = () => {
      if (copilotPos) {
        const clamped = clampPosition(copilotPos.x, copilotPos.y);
        setCopilotPos(clamped);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [copilotPos]);

  const openCopilot = (contextOptions = {}) => {
    let selectedLoc = contextOptions.selectedLocation || markerCoords;
    if (!selectedLoc && map.current) {
      const center = map.current.getCenter();
      selectedLoc = { lat: center.lat, lng: center.lng, lon: center.lng };
    } else if (!selectedLoc) {
      selectedLoc = { lat: parseFloat(lat), lng: parseFloat(lng), lon: parseFloat(lng) };
    }

    const latVal = typeof selectedLoc.lat === 'function' ? selectedLoc.lat() : selectedLoc.lat;
    const lngVal = typeof selectedLoc.lng === 'function' ? selectedLoc.lng() : (selectedLoc.lng ?? selectedLoc.lon);

    const formattedLocation = {
      lat: parseFloat(latVal),
      lon: parseFloat(lngVal),
      lng: parseFloat(lngVal)
    };

    const currentBounds = map.current ? map.current.getBounds() : null;
    const currentZoom = map.current ? map.current.getZoom() : zoom;

    const contextState = {
      entryPoint: contextOptions.entryPoint || 'floating_map_button',
      selectedLocation: formattedLocation,
      coords: formattedLocation,
      dataset: contextOptions.dataset || 'Sentinel-2',
      selectedDate: contextOptions.selectedDate || '24 Sep 2026',
      mapContext: {
        center: { lat: formattedLocation.lat, lon: formattedLocation.lon },
        zoom: currentZoom,
        bounds: currentBounds ? {
          north: currentBounds.getNorth(),
          south: currentBounds.getSouth(),
          east: currentBounds.getEast(),
          west: currentBounds.getWest()
        } : null
      }
    };

    setCopilotContext(contextState);
    setCopilotOpen(true);
    setIsMinimized(false);
    setInspectorOpen(false);
  };

  const handleCopilotSubmit = async (customQuestion) => {
    const questionText = customQuestion || queryInput || "What changed here?";
    if (!questionText.trim() && !attachmentMeta) return;

    const userMessage = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: questionText,
      attachment: attachmentMeta ? { filename: attachmentMeta.filename, sizeMb: attachmentMeta.sizeMb } : null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => [...prev, userMessage]);
    setQueryInput('');
    setAiState('loading');

    const activeAttachment = attachmentMeta;
    clearAttachment();

    try {
      const currentBounds = map.current ? map.current.getBounds() : null;
      const currentZoom = map.current ? map.current.getZoom() : zoom;
      const activeLoc = copilotContext?.selectedLocation || markerCoords;

      const mapContext = {
        center: activeLoc ? { lat: activeLoc.lat, lon: activeLoc.lng || activeLoc.lon } : { lat, lon: lng },
        zoom: currentZoom,
        bounds: currentBounds ? {
          north: currentBounds.getNorth(),
          south: currentBounds.getSouth(),
          east: currentBounds.getEast(),
          west: currentBounds.getWest()
        } : null
      };

      const resData = await aiService.ask({
        question: questionText,
        mapContext,
        mode: copilotMode,
        selectedLocation: activeLoc ? { lat: activeLoc.lat, lon: activeLoc.lng || activeLoc.lon } : null,
        entryPoint: copilotContext?.entryPoint || 'floating_map_button',
        dataset: copilotContext?.dataset || 'Sentinel-2',
        selectedDate: copilotContext?.selectedDate || '24 Sep 2026',
        attachment: activeAttachment ? { attachmentId: activeAttachment.attachmentId, filename: activeAttachment.filename } : null
      });

      const aiMessage = {
        id: 'msg-' + (Date.now() + 1),
        sender: 'ai',
        text: resData.answer || resData.summary || 'Analysis complete.',
        result: resData,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setChatMessages(prev => [...prev, aiMessage]);
      setAiState('result');

      if (resData.location && map.current) {
        map.current.flyTo({
          center: [resData.location.lon, resData.location.lat],
          zoom: 13,
          duration: 1500
        });
      }
    } catch (err) {
      console.error('Copilot Submit Error:', err);
      setAiState('error');
      setChatMessages(prev => [...prev, {
        id: 'msg-' + (Date.now() + 1),
        sender: 'ai',
        text: 'Failed to communicate with geospatial AI service. Please check your backend connection.',
        error: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }
  };

  return (
    <div className="explore-container">
      {/* MAP BACKGROUND */}
      <div className={`map-container ${hoverCoords ? 'crosshair-active' : ''}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
        {mapError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-black text-gray">
            <div className="text-warning mb-2 text-xl font-bold">MAP UNAVAILABLE</div>
            <div className="text-sm">Unable to initialize map engine. Features may be limited.</div>
            <button className="btn-secondary mt-4" onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      {/* HOVER CROSSHAIR GUIDES */}
      <AnimatePresence>
        {hoverCoords && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="crosshair-guides"
          >
            <div className="crosshair-guide-h" style={{ top: hoverCoords.y }} />
            <div className="crosshair-guide-v" style={{ left: hoverCoords.x }} />
            
            <div 
              className="hover-coordinate-indicator glass-panel text-xs font-mono"
              style={{ left: hoverCoords.x + 15, top: hoverCoords.y + 15 }}
            >
              <div>LAT {hoverCoords.lat}° N</div>
              <div>LON {hoverCoords.lng}° E</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP LOADING STATE */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            className="map-loading-indicator glass-panel text-xs font-mono"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <span className="indicator animate-pulse"></span>
            SHELL READY · LOADING IMAGERY
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT NAVIGATION RAIL */}
      <motion.nav 
        className="explore-nav-rail glass-panel"
        animate={{ width: isNavExpanded ? 220 : 72 }}
        onMouseEnter={() => setIsNavExpanded(true)}
        onMouseLeave={() => setIsNavExpanded(false)}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="nav-rail-header" onClick={() => navigate('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: isNavExpanded ? 'flex-start' : 'center', paddingLeft: isNavExpanded ? '20px' : '0' }}>
          <div className="brand-sat flex items-center justify-center">
            <Eye size={20} className="text-accent-blue" />
          </div>
          <AnimatePresence>
            {isNavExpanded && (
              <motion.div
                className="ml-2 flex flex-col items-start justify-center leading-none"
                initial={{ opacity: 0, x: -10, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 'auto' }}
                exit={{ opacity: 0, x: -10, width: 0 }}
                style={{ overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '2px' }}
              >
                <span style={{ fontFamily: 'monospace', fontWeight: 900, color: 'var(--accent-blue)', letterSpacing: '2px', fontSize: '14px' }}>DRISHTI</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 300, color: '#9ca3af', letterSpacing: '6.5px', fontSize: '9px', marginTop: '2px', paddingLeft: '1px' }}>WATCH</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="nav-rail-links">
          <NavItem icon={<MapIcon size={20} />} label="Explore" path="/explore" active expanded={isNavExpanded} />
          <NavItem icon={<MessageSquare size={20} />} label="Ask" path="/ask" expanded={isNavExpanded} />
          <NavItem icon={<Activity size={20} />} label="Detect" path="/detect" expanded={isNavExpanded} />
          <NavItem icon={<Layers size={20} />} label="Compare" path="/compare" expanded={isNavExpanded} />
          <NavItem icon={<Navigation size={20} />} label="Measure" path="/measure" expanded={isNavExpanded} />
          <NavItem icon={<Eye size={20} />} label="Watch" path="/watch" expanded={isNavExpanded} />
          <NavItem icon={<Clock size={20} />} label="Timeline" path="/timeline" expanded={isNavExpanded} />
        </div>

        <div className="nav-rail-footer">
          <NavItem icon={<Settings size={20} />} label="Settings" path="/settings" expanded={isNavExpanded} />
        </div>
      </motion.nav>

      {/* TOP COMMAND BAR */}
      <div className="top-command-bar">
        <div className="search-box glass-panel">
          <Search size={16} className="text-gray" />
          <input 
            type="text" 
            placeholder="Search city, region, coordinates..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
          />
        </div>
        
        <div className="command-controls">
          <button className="command-btn glass-panel text-xs font-mono">
            <CalendarIcon size={14} className="mr-2 text-gray" />
            DATE: <span className="text-white ml-1">24 Sep 2026</span>
            <ChevronRight size={14} className="ml-1 text-gray" />
          </button>
          
          <button className="command-btn glass-panel text-xs font-mono">
            <FileStack size={14} className="mr-2 text-gray" />
            DATASET: <span className="text-white ml-1">Sentinel-2</span>
            <ChevronRight size={14} className="ml-1 text-gray" />
          </button>
          
          <button 
            className={`command-btn glass-panel text-xs font-mono ${layersOpen ? 'active' : ''}`}
            onClick={() => setLayersOpen(!layersOpen)}
          >
            <Layers size={14} className="mr-2 text-gray" />
            LAYERS
          </button>
        </div>
      </div>

      {/* SPECTRAL LAYERS PANEL */}
      <AnimatePresence>
        {layersOpen && (
          <motion.div 
            className="layers-panel glass-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <div className="panel-header flex items-center justify-between text-xs font-mono text-gray">
              <span>SPECTRAL LAYERS</span>
              <button onClick={() => setLayersOpen(false)}><ChevronRight size={14} className="rotate-[-90deg]"/></button>
            </div>
            <div className="layer-options mt-4">
              <label className={`layer-option ${activeLayer === 'satellite' ? 'active' : ''}`}>
                <input type="radio" name="layer" checked={activeLayer === 'satellite'} onChange={() => setActiveLayer('satellite')} />
                <span className="text-sm flex-1">Satellite / True Color</span>
                {activeLayer === 'satellite' && <span className="layer-badge">RGB</span>}
              </label>
              <label className={`layer-option ${activeLayer === 'optical' ? 'active' : ''}`}>
                <input type="radio" name="layer" checked={activeLayer === 'optical'} onChange={() => setActiveLayer('optical')} />
                <span className="text-sm flex-1">Optical / False Color</span>
                {activeLayer === 'optical' && <span className="layer-badge">NIR</span>}
              </label>
              <label className={`layer-option ${activeLayer === 'sar' ? 'active' : ''}`}>
                <input type="radio" name="layer" checked={activeLayer === 'sar'} onChange={() => setActiveLayer('sar')} />
                <span className="text-sm flex-1">SAR (Radar)</span>
              </label>
              <label className={`layer-option ${activeLayer === 'ndvi' ? 'active' : ''}`}>
                <input type="radio" name="layer" checked={activeLayer === 'ndvi'} onChange={() => setActiveLayer('ndvi')} />
                <span className="text-sm flex-1">NDVI (Vegetation)</span>
              </label>
              <label className={`layer-option ${activeLayer === 'ndwi' ? 'active' : ''}`}>
                <input type="radio" name="layer" checked={activeLayer === 'ndwi'} onChange={() => setActiveLayer('ndwi')} />
                <span className="text-sm flex-1">NDWI (Water)</span>
              </label>
              <label className={`layer-option ${activeLayer === 'change' ? 'active' : ''}`}>
                <input type="radio" name="layer" checked={activeLayer === 'change'} onChange={() => setActiveLayer('change')} />
                <span className="text-sm flex-1">Change Detection</span>
              </label>
            </div>
            
            <div className="opacity-control mt-6 pt-4 border-t border-white-10">
              <div className="flex justify-between text-xs font-mono mb-2">
                <span className="text-gray">OPACITY</span>
                <span className="text-accent-blue">{layerOpacity}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={layerOpacity} 
                onChange={(e) => setLayerOpacity(e.target.value)} 
                className="opacity-slider"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOCATION INSPECTOR (INFO ONLY CARD) */}
      <AnimatePresence>
        {inspectorOpen && markerCoords && (
          <motion.div 
            className="location-inspector glass-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <button className="close-btn" onClick={() => setInspectorOpen(false)} aria-label="Close inspector">×</button>
            <h3 className="inspector-title">SELECTED LOCATION</h3>
            <p className="inspector-subtitle text-gray text-xs font-mono mt-1">
              {markerCoords.lat.toFixed(4)}° N, {markerCoords.lng.toFixed(4)}° E
            </p>
            
            <div className="inspector-meta text-xs font-mono mt-3 pt-3 border-t border-white/10 flex flex-col gap-1.5">
              <div className="flex justify-between items-center"><span className="text-gray">SOURCE</span> <span className="text-white font-semibold">Sentinel-2</span></div>
              <div className="flex justify-between items-center"><span className="text-gray">STATUS</span> <span className="text-success-mint font-semibold">Latest available imagery</span></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MINIMIZED FLOATING PILL */}
      <AnimatePresence>
        {copilotOpen && isMinimized && (
          <motion.button 
            className="copilot-minimized-pill glass-panel flex items-center gap-2 px-4 py-2.5 rounded-full shadow-2xl border border-accent-blue/40 text-white font-mono text-xs cursor-pointer z-50 hover:bg-accent-blue/20 transition-all"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={copilotPos ? { position: 'fixed', left: copilotPos.x, top: copilotPos.y } : { position: 'fixed', bottom: '24px', right: '80px' }}
            onClick={() => setIsMinimized(false)}
          >
            <Sparkles size={16} className="text-accent-blue animate-pulse" />
            <span className="font-bold">DRISHTIWATCH AI</span>
            {copilotContext?.selectedLocation && (
              <span className="text-[10px] text-accent-blue/80 bg-black/40 px-2 py-0.5 rounded-full">
                📍 {copilotContext.selectedLocation.lat.toFixed(2)}°, {(copilotContext.selectedLocation.lon || copilotContext.selectedLocation.lng).toFixed(2)}°
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* FULLY DRAGGABLE AI COPILOT PANEL */}
      <AnimatePresence>
        {copilotOpen && !isMinimized && (
          <motion.div 
            ref={copilotRef}
            className={`ai-copilot-window glass-panel ${isDragging ? 'dragging' : ''}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={
              copilotPos 
                ? { position: 'fixed', left: `${copilotPos.x}px`, top: `${copilotPos.y}px` } 
                : { position: 'fixed', bottom: '24px', right: '80px' }
            }
          >
            {/* DRAGGABLE HEADER BAR */}
            <div 
              className="copilot-header-handle flex items-center justify-between px-4 py-3 border-b border-white/10 select-none cursor-grab active:cursor-grabbing bg-black/40"
              onPointerDown={handleDragPointerDown}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal size={16} className="text-gray-dim hover:text-white transition-colors mr-1" />
                <Sparkles size={16} className="text-accent-blue" />
                <span className="font-mono text-xs font-bold tracking-wider text-white">DRISHTIWATCH AI</span>
              </div>

              <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
                {/* EXPLORER / EXPERT SEGMENTED SWITCH */}
                <div className="segmented-control flex items-center bg-black/60 p-0.5 rounded-lg border border-white/10 text-xs font-mono">
                  <button 
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${copilotMode === 'explorer' ? 'bg-accent-blue text-black font-bold shadow-md' : 'text-gray hover:text-white'}`}
                    onClick={() => setCopilotMode('explorer')}
                  >
                    Explorer
                  </button>
                  <button 
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${copilotMode === 'expert' ? 'bg-accent-blue text-black font-bold shadow-md' : 'text-gray hover:text-white'}`}
                    onClick={() => setCopilotMode('expert')}
                  >
                    Expert
                  </button>
                </div>

                {/* WINDOW ACTIONS */}
                <button 
                  className="control-icon-btn text-gray hover:text-white p-1 rounded" 
                  onClick={() => setIsMinimized(true)}
                  title="Minimize Copilot"
                >
                  <Minus size={14} />
                </button>
                
                <button 
                  className="control-icon-btn text-gray hover:text-white p-1 rounded" 
                  onClick={() => navigate('/ask', { state: copilotContext })}
                  title="Expand to Full Page"
                >
                  <Maximize2 size={13} />
                </button>

                <button 
                  className="control-icon-btn text-gray hover:text-white p-1 rounded hover:bg-danger-red/20" 
                  onClick={() => setCopilotOpen(false)}
                  title="Close Copilot"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* LOCATION / METADATA CONTEXT STRIP */}
            {copilotContext?.selectedLocation ? (
              <div className="copilot-context-strip flex items-center justify-between bg-black/60 px-4 py-2 border-b border-accent-blue/30 text-xs font-mono select-none">
                <div className="flex items-center gap-2 text-accent-blue font-bold truncate">
                  <MapPin size={13} />
                  <span>{copilotContext.selectedLocation.lat.toFixed(4)}° N, {(copilotContext.selectedLocation.lon || copilotContext.selectedLocation.lng).toFixed(4)}° E</span>
                </div>
                <div className="flex items-center gap-2 text-gray text-[11px]">
                  <span>{copilotContext.dataset || 'Sentinel-2'}</span>
                  <span className="text-gray-dim">•</span>
                  <span>{copilotContext.selectedDate || '24 Sep 2026'}</span>
                  <button 
                    className="text-gray hover:text-white ml-2 p-0.5" 
                    onClick={() => setCopilotContext(prev => ({ ...prev, selectedLocation: null }))}
                    title="Clear location context"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="copilot-context-strip flex items-center justify-between bg-black/40 px-4 py-1.5 border-b border-white/5 text-[11px] font-mono text-gray select-none">
                <span>📍 Viewport Analysis Center</span>
                <span>Sentinel-2 • 24 Sep 2026</span>
              </div>
            )}

            {/* SCROLLABLE CHAT MESSAGES AREA */}
            <div className="copilot-chat-body p-4 overflow-y-auto flex flex-col gap-4 flex-1">
              {chatMessages.length === 0 && (
                <div className="empty-copilot-state text-center py-8 px-4 flex flex-col items-center justify-center text-gray">
                  <div className="w-12 h-12 rounded-full bg-accent-blue/10 flex items-center justify-center mb-3 border border-accent-blue/30">
                    <Sparkles size={22} className="text-accent-blue animate-pulse" />
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">Grounded Geospatial Intelligence</h4>
                  <p className="text-xs text-gray mb-4 max-w-[280px]">Ask questions about land surface changes, vegetation health, or water bodies around this area.</p>
                </div>
              )}

              {chatMessages.map((msg) => (
                <div key={msg.id} className={`message-bubble-wrapper flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.sender === 'user' ? (
                    <div className="user-message-bubble bg-accent-blue/20 border border-accent-blue/40 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs max-w-[85%] shadow-sm">
                      {msg.attachment && (
                        <div className="flex items-center gap-1.5 text-[11px] text-accent-blue mb-1 font-mono">
                          <Paperclip size={12} /> <span>{msg.attachment.filename}</span>
                        </div>
                      )}
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  ) : (
                    <div className="ai-response-card bg-black/50 border border-white/10 text-gray-100 rounded-2xl rounded-tl-sm p-4 text-xs max-w-[92%] shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-accent-blue font-bold font-mono text-xs flex items-center gap-1.5">
                          <Sparkles size={13} /> {msg.result?.title || 'ANALYSIS COMPLETE'}
                        </span>
                        {msg.result?.confidence && (
                          <span className="text-[10px] font-mono text-success-mint bg-success-mint/10 px-2 py-0.5 rounded border border-success-mint/30">
                            {msg.result.confidence} Confidence
                          </span>
                        )}
                      </div>

                      <div className="text-xs leading-relaxed text-gray-200 mb-3 whitespace-pre-wrap">
                        {msg.text}
                      </div>

                      {/* METRICS CARDS */}
                      {msg.result?.metrics && (
                        <div className="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-lg bg-black/60 border border-white/10 font-mono text-[11px]">
                          {msg.result.metrics.affectedAreaKm2 && (
                            <div>
                              <div className="text-gray-dim text-[10px]">AFFECTED AREA</div>
                              <div className="text-white font-bold">{msg.result.metrics.affectedAreaKm2} km²</div>
                            </div>
                          )}
                          {msg.result.metrics.overallShift && (
                            <div>
                              <div className="text-gray-dim text-[10px]">OVERALL SHIFT</div>
                              <div className="text-accent-blue font-bold">{msg.result.metrics.overallShift}</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ACTION BUTTONS */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/10">
                        {msg.result?.location && (
                          <button 
                            className="text-[11px] font-mono text-accent-blue hover:underline flex items-center gap-1"
                            onClick={() => map.current?.flyTo({ center: [msg.result.location.lon, msg.result.location.lat], zoom: 14 })}
                          >
                            <MapPin size={11} /> Show on Map
                          </button>
                        )}
                        <button 
                          className="text-[11px] font-mono text-gray hover:text-white flex items-center gap-1 ml-auto"
                          onClick={() => navigate('/evidence/ev-3841-b')}
                        >
                          View Evidence →
                        </button>
                      </div>
                    </div>
                  )}
                  <span className="text-[9px] text-gray-dim mt-1 font-mono px-1">{msg.timestamp}</span>
                </div>
              ))}

              {aiState === 'loading' && (
                <div className="loading-card flex items-center gap-3 p-3 bg-black/60 rounded-xl border border-accent-blue/40 text-xs font-mono text-accent-blue animate-pulse">
                  <Sparkles size={16} className="animate-spin text-accent-blue" />
                  <span>ANALYZING SATELLITE IMAGERY & SPECTRAL SIGNALS...</span>
                </div>
              )}
            </div>

            {/* QUICK SUGGESTION PROMPT CHIPS */}
            <div className="quick-prompts-bar px-4 py-2.5 border-t border-white/10 bg-black/40 flex items-center gap-2 overflow-x-auto no-scrollbar select-none">
              <button className="prompt-chip" onClick={() => handleCopilotSubmit("What changed here?")}>What changed here?</button>
              <button className="prompt-chip" onClick={() => handleCopilotSubmit("Find water expansion")}>Water expansion</button>
              <button className="prompt-chip" onClick={() => handleCopilotSubmit("Check vegetation health")}>Vegetation health</button>
              <button className="prompt-chip" onClick={() => handleCopilotSubmit("Detect new infrastructure")}>Infrastructure</button>
            </div>

            {/* ATTACHMENT FILE CHIP DISPLAY */}
            {attachmentMeta && (
              <div className="px-4 py-1.5 bg-black/70 border-t border-accent-blue/30 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-white truncate">
                  <Paperclip size={13} className="text-accent-blue" />
                  <span className="font-semibold truncate">{attachmentMeta.filename}</span>
                  <span className="text-gray-dim">•</span>
                  <span className="text-gray text-[10px]">{attachmentMeta.sizeMb} MB</span>
                </div>
                <button onClick={clearAttachment} className="text-gray hover:text-white p-0.5">
                  <X size={13} />
                </button>
              </div>
            )}

            {attachmentError && (
              <div className="px-4 py-1.5 bg-warning-amber/10 border-t border-warning-amber/30 text-xs font-mono text-warning-amber">
                {attachmentError}
              </div>
            )}

            {/* COMPOSER INPUT AREA */}
            <div className="copilot-composer p-3 border-t border-white/10 bg-black/60 flex items-center gap-2">
              <label htmlFor="copilot-file-input" className="p-2 text-gray hover:text-accent-blue cursor-pointer transition-colors" title="Attach GeoTIFF / TIFF file">
                <Paperclip size={18} />
              </label>
              <input 
                id="copilot-file-input"
                type="file" 
                accept=".tif,.tiff,.geotiff" 
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              />

              <input 
                type="text" 
                placeholder={copilotContext?.selectedLocation ? `Ask about ${copilotContext.selectedLocation.lat.toFixed(2)}°, ${copilotContext.selectedLocation.lon.toFixed(2)}°...` : "Ask a question..."} 
                className="composer-input flex-1 bg-black/50 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:border-accent-blue transition-all"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCopilotSubmit(queryInput)}
              />

              <button 
                className="btn-primary p-2.5 rounded-xl text-xs flex items-center justify-center"
                onClick={() => handleCopilotSubmit(queryInput)}
                disabled={aiState === 'loading' || (!queryInput.trim() && !attachmentMeta)}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLOATING AI BUTTON */}
      <button 
        className="floating-ai-btn btn-primary"
        aria-label="Ask DrishtiWatch about this location"
        onClick={(e) => {
          e.stopPropagation();
          openCopilot({ entryPoint: 'floating_map_button', selectedLocation: markerCoords });
        }}
      >
        <Sparkles size={16} className="mr-2" /> ASK DRISHTIWATCH
      </button>

      {/* ZOOM & LOCATION CONTROLS */}
      <div className="map-controls">
        <button className="control-btn glass-panel" onClick={handleZoomIn} aria-label="Zoom In"><Plus size={18} /></button>
        <button className="control-btn glass-panel" onClick={handleZoomOut} aria-label="Zoom Out"><Minus size={18} /></button>
        <button className="control-btn glass-panel mt-2" onClick={handleMyLocation} aria-label="My Location">
          <Navigation size={18} className={locatingState === 'locating' ? 'animate-pulse text-accent-blue' : ''} />
        </button>
        <button className="control-btn glass-panel mt-2" onClick={handleResetView} aria-label="Reset View"><Crosshair size={18} /></button>
      </div>

      {/* MY LOCATION STATUS TOAST */}
      <AnimatePresence>
        {locatingState !== 'idle' && (
          <motion.div 
            className="location-status-toast glass-panel text-xs font-mono"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            {locatingState === 'locating' && <><span className="indicator animate-pulse mr-2"></span>LOCATING...</>}
            {locatingState === 'success' && <><span className="indicator mr-2"></span>MY LOCATION • ACCURACY ±{accuracy}m</>}
            {locatingState === 'denied' && <span className="text-warning-amber">LOCATION ACCESS BLOCKED</span>}
            {locatingState === 'error' && <span className="text-danger-red">LOCATION UNAVAILABLE</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOTTOM STATUS BAR */}
      <div className="bottom-status-bar glass-panel text-xs font-mono text-gray">
        <span>LAT {lat}°</span>
        <span className="mx-2 text-gray-dim">|</span>
        <span>LON {lng}°</span>
        <span className="mx-2 text-gray-dim">|</span>
        <span>ZOOM {zoom}</span>
        <span className="mx-2 text-gray-dim">|</span>
        <span>10 km</span>
        <span className="mx-2 text-gray-dim">|</span>
        <span>Sentinel-2</span>
        <span className="mx-2 text-gray-dim">|</span>
        <span className="text-accent-blue ml-4">LIVE</span>
      </div>
    </div>
  );
}

function NavItem({ icon, label, path, active, expanded }) {
  const navigate = useNavigate();
  return (
    <div 
      className={`nav-item ${active ? 'active' : ''}`} 
      onClick={() => path ? navigate(path) : null}
      style={{ cursor: path ? 'pointer' : 'default' }}
    >
      <div className="nav-icon">{icon}</div>
      <AnimatePresence>
        {expanded && (
          <motion.span 
            className="nav-label"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
