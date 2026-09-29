import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronDown, ChevronUp, Link as LinkIcon, Download, Share2, Compass, ShieldCheck, Activity, Satellite, Calendar, Lock, BarChart2, Maximize, Layers, MapPin } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './Evidence.css';

export default function Evidence() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mapInstance, setMapInstance] = useState(null);
  const [techOpen, setTechOpen] = useState(false);

  // Mock Evidence Object (would normally come from API based on ID)
  const evidence = {
    id: 'EV-3841-B',
    query: 'Did sediment discharge at Camargue Estuary exceed the 2021 seasonal baseline?',
    result: {
      type: 'AFFIRMATIVE DETECTION',
      summary: 'Yes. Estuarine sediment plume extent expanded by +34.2 km² (+18.4% above baseline threshold), driven by accelerated glacial melt runoff and upstream hydrological pulse.',
      confidence: '99.4%',
      shiftVal: '+18.4% ANOMALY'
    },
    metadata: {
      source: 'Sentinel-2B MSI & Landsat-8 OLI-2',
      sourceSub: 'L2A Surface Reflectance',
      timestamp: '18 Aug 2024 - 10:42 UTC',
      timestampSub: 'Baseline: 15 Aug 2021 (Dual-Orbit)',
      method: 'NDTI & SWIR-1/NIR Ratio',
      methodSub: 'Normalized Turbidity Index',
      shift: 'B03/B08 Index Δ > +0.24',
      shiftSub: 'Sub-pixel coregistered (RMS 0.12px)'
    },
    hash: 'sha256:7f9a2e68c011d4e21a0f903324bc'
  };

  const handleExplore = () => {
    navigate('/explore', { state: { coords: { lat: 43.53, lng: 4.69 }, geometry: 'evidence-plume' } });
  };

  return (
    <div className="evidence-page-container">
      <AppNavigation />
      
      <div className="evidence-page-content">
        
        {/* NEW HEADER BAR */}
        <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button className="text-gray hover:text-white transition-colors" onClick={() => navigate(-1)}>
              ← Back
            </button>
            <div className="evidence-id-badge">
              <ShieldCheck size={14} className="text-gray" /> DOSSIER #{evidence.id}
            </div>
            <div className="evidence-status-badge">
              <div className="w-1.5 h-1.5 bg-success-mint rounded-full"></div>
              VERIFIED
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button className="px-3 py-1.5 bg-transparent hover:bg-white/5 rounded border border-white/10 text-xs text-white transition-colors flex items-center gap-2">
              <Share2 size={14} /> Share
            </button>
            <button 
              className="px-3 py-1.5 bg-transparent hover:bg-white/5 rounded border border-white/10 text-xs text-white transition-colors flex items-center gap-2"
              onClick={handleExplore}
            >
              <Compass size={14} /> Open in Explore
            </button>
            <button className="px-3 py-1.5 bg-accent-blue hover:bg-blue-600 rounded text-xs font-bold text-white transition-colors flex items-center gap-2">
              <Download size={14} /> Export
            </button>
          </div>
        </div>

        {/* QUERY */}
        <div className="max-w-4xl">
          <div className="text-[10px] font-mono text-accent-blue uppercase tracking-widest mb-3 flex items-center gap-2">
            ANALYTICAL QUERY <span className="text-gray-dim">· CAMARGUE ESTUARY DELTA · RHÔNE BASIN</span>
          </div>
          <h1 className="evidence-query">"{evidence.query}"</h1>
        </div>

        {/* RESULT PANEL */}
        <div className="evidence-result-panel">
          <div className="flex items-start gap-4">
            <div className="mt-1 p-2 bg-accent-blue/10 rounded border border-accent-blue/20 text-accent-blue">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-mono text-success-mint font-bold tracking-wide">{evidence.result.type}</span>
                <span className="text-[10px] font-mono bg-success-mint/20 text-success-mint px-2 py-0.5 rounded">{evidence.result.shiftVal}</span>
              </div>
              <p className="text-white text-lg leading-relaxed max-w-2xl">
                {/* Highlight specific parts like a real app would */}
                Yes. Estuarine sediment plume extent expanded by <span className="text-accent-blue font-bold">+34.2 km²</span> (+18.4% above baseline threshold), driven by accelerated glacial melt runoff and upstream hydrological pulse.
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Audit Confidence</div>
            <div className="text-3xl font-bold text-accent-blue">{evidence.result.confidence}</div>
          </div>
        </div>

        {/* METADATA GRID - Moved to side panel to avoid spreading across width */}


        {/* PROOF INSPECTION */}
        <div className="flex items-center gap-3 mb-4">
          <Layers size={18} className="text-accent-blue" />
          <h2 className="text-xl font-medium text-white">Multispectral Proof Inspection</h2>
          <span className="text-[10px] font-mono text-gray-dim uppercase bg-white/5 px-2 py-1 rounded ml-2">ORTHORECTIFIED SENTINEL-2B</span>
          <span className="text-[9px] font-mono text-gray-dim ml-auto">AOI: 43°21'52"N 4°41'30"E · CRS: EPSG:4326</span>
        </div>

        <div className="proof-inspection-area">
          <div className="proof-map-container">
            <MapViewport 
              center={[4.69, 43.53]} 
              zoom={11.5}
              onMapLoad={setMapInstance}
            />
            
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Mock Plume Vector Boundary */}
              <svg width="100%" height="100%" className="absolute inset-0">
                <path 
                  d="M 200 150 Q 400 300 500 450 Q 600 350 450 200 Z" 
                  fill="rgba(37, 99, 235, 0.15)" 
                  stroke="var(--accent-blue)" 
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
              </svg>
              <div className="absolute top-4 left-4 bg-black/60 backdrop-blur border border-accent-blue/30 px-3 py-1.5 rounded-lg text-[10px] font-mono text-accent-blue flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-accent-blue rounded-full"></div> VECTOR BOUNDARY: TURBIDITY PLUME (+34.2 km²)
              </div>
              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur border border-success-mint/30 px-3 py-1.5 rounded-lg text-[10px] font-mono text-success-mint flex items-center gap-2">
                <CheckCircle2 size={12} /> CORRELATION 0.994
              </div>
              
              <div className="absolute bottom-4 left-4 text-[9px] font-mono text-white/50 bg-black/60 px-2 py-1 rounded">
                GSD: 10.0m - SUN ELEV: 51.4°
              </div>
              <div className="absolute bottom-4 right-4 text-[10px] font-mono text-accent-blue bg-black/60 px-2 py-1 rounded">
                SCALE 1:25,000
              </div>
            </div>
          </div>
          
          <div className="proof-side-panel">
            {/* Metadata moved here */}
            <div className="mb-6 flex flex-col gap-4">
              <div className="evidence-meta-item">
                <div className="evidence-meta-label"><Satellite size={12} /> Source Constellation</div>
                <div className="evidence-meta-val">{evidence.metadata.source}</div>
              </div>
              <div className="evidence-meta-item">
                <div className="evidence-meta-label"><Calendar size={12} /> Observation Stamp</div>
                <div className="evidence-meta-val">{evidence.metadata.timestamp}</div>
              </div>
              <div className="evidence-meta-item">
                <div className="evidence-meta-label"><Activity size={12} /> Evidence Shift</div>
                <div className="evidence-meta-val text-accent-blue">{evidence.metadata.shift}</div>
              </div>
            </div>
            
            <div className="w-full h-px bg-white/5 mb-6"></div>

            {/* Temporal Drift */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-mono text-gray-dim uppercase">Temporal Plume Drift</span>
                <span className="text-[10px] font-mono text-success-mint">+18.4% ANOMALY</span>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-xs font-mono text-gray mb-1">
                  <span>15 Aug 2021 (Baseline)</span>
                  <span>185.8 km²</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gray" style={{ width: '60%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-mono text-accent-blue mb-1">
                  <span>18 Aug 2024 (Observation)</span>
                  <span>220.0 km²</span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue" style={{ width: '80%' }}></div>
                </div>
              </div>
            </div>
            
            <div className="w-full h-px bg-white/5"></div>
            
            {/* Spectral Profile */}
            <div className="flex-1">
              <div className="text-[10px] font-mono text-gray-dim uppercase mb-4">Spectral Reflectance Profile (B02-B11)</div>
              
              <div className="h-24 w-full relative mb-4 border-b border-dashed border-white/20">
                <svg width="100%" height="100%" preserveAspectRatio="none">
                  {/* Baseline curve */}
                  <path d="M 0 60 Q 50 65 100 70 T 200 65 T 250 80 T 300 90" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="3 3" />
                  {/* Observation curve */}
                  <path d="M 0 50 Q 50 40 100 20 T 200 30 T 250 50 T 300 70" fill="none" stroke="var(--accent-blue)" strokeWidth="2" />
                  <circle cx="100" cy="20" r="3" fill="var(--accent-blue)" />
                </svg>
              </div>
              
              <div className="flex justify-between text-[9px] font-mono text-gray mb-6">
                <span>B02 (Blue)</span>
                <span className="text-accent-blue font-bold">B03 (Green)</span>
                <span>B08 (NIR)</span>
                <span>B11 (SWIR)</span>
              </div>
              
              <div className="flex flex-col gap-1 text-[10px] font-mono text-gray-dim">
                <div className="flex justify-between"><span>Coregistration RMS:</span> <span className="text-white">0.082 px</span></div>
                <div className="flex justify-between"><span>Turbidity Index (NDTI):</span> <span className="text-accent-blue">+0.441 (Mean)</span></div>
                <div className="flex justify-between"><span>Atmospheric Model:</span> <span className="text-white">Sen2Cor v2.11 / B0A</span></div>
              </div>
            </div>

            <button 
              className="w-full py-2 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-xs font-medium text-white transition-colors flex items-center justify-center gap-2"
              onClick={handleExplore}
            >
              <Maximize size={14} className="text-accent-blue" /> Inspect Geospatial Layers
            </button>
          </div>
        </div>

        {/* TECHNICAL DETAILS TOGGLE */}
        <button 
          className="technical-details-toggle"
          onClick={() => setTechOpen(!techOpen)}
        >
          <div className="w-4 h-4 bg-accent-blue/20 rounded flex items-center justify-center">
            {techOpen ? <ChevronUp size={12} className="text-accent-blue" /> : <ChevronDown size={12} className="text-accent-blue" />}
          </div>
          Show Technical Details (6 Audit Parameters)
          <span className="ml-4 text-[9px] text-gray opacity-50">ISO-19115 COMPLIANT</span>
          <span className="ml-auto text-[9px] text-gray opacity-50">Deterministic Pipeline Execution: drishti-watch-engine-v4.1.2</span>
        </button>

        {/* TECHNICAL DETAILS GRID */}
        <AnimatePresence>
          {techOpen && (
            <motion.div 
              className="technical-grid"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="tech-card">
                <div className="tech-card-header">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><BarChart2 size={14} className="text-gray" /> 01 - Pixel Classification</div>
                  <div className="text-[10px] font-mono text-accent-blue text-right leading-tight">342.8k<br/>px</div>
                </div>
                <div className="tech-row"><span className="label">Total Evaluated:</span> <span className="val">342,890 px</span></div>
                <div className="tech-row"><span className="label">Plume Pixels:</span> <span className="val text-accent-blue">48,120 px</span></div>
                <div className="tech-row"><span className="label">Background Water:</span> <span className="val">194,280 px</span></div>
                <div className="tech-row mt-2 pt-2 border-t border-white/10"><span className="label">Cloud / Shadow Mask:</span> <span className="val text-success-mint">0.8% (SCL Filtered)</span></div>
              </div>
              
              <div className="tech-card">
                <div className="tech-card-header">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><Layers size={14} className="text-gray" /> 02 - Spectral Bands</div>
                  <div className="text-[10px] font-mono text-accent-blue text-right leading-tight">5<br/>Channels</div>
                </div>
                <div className="tech-row"><span className="label">Sentinel-2 MSI:</span> <span className="val">B2(490), B3(560), B4(665)</span></div>
                <div className="tech-row"><span className="label">Infrared Indices:</span> <span className="val">B8(NIR 842nm), B11(SWIR 1610nm)</span></div>
                <div className="tech-row"><span className="label">Landsat-8 Coreg:</span> <span className="val">B4 (Red) + B5 (NIR)</span></div>
                <div className="tech-row mt-2 pt-2 border-t border-white/10"><span className="label">Calibration:</span> <span className="val">TOA → BOA L2A (Sen2Cor)</span></div>
              </div>
              
              <div className="tech-card">
                <div className="tech-card-header">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><Maximize size={14} className="text-gray" /> 03 - Resolution Limits</div>
                  <div className="text-[10px] font-mono text-accent-blue text-right leading-tight">10m<br/>GSD</div>
                </div>
                <div className="tech-row"><span className="label">Spatial (VNIR):</span> <span className="val">10.0m GSD Native</span></div>
                <div className="tech-row"><span className="label">Spatial (SWIR):</span> <span className="val">20m Bilinear Resample</span></div>
                <div className="tech-row"><span className="label">Temporal Baseline:</span> <span className="val">5-day revisit cycle composite</span></div>
                <div className="tech-row mt-2 pt-2 border-t border-white/10"><span className="label">Radiometric Depth:</span> <span className="val">12-bit native → 16-bit int</span></div>
              </div>

              <div className="tech-card">
                <div className="tech-card-header">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><span className="font-mono text-gray">Σ</span> 04 - Mathematical Indices</div>
                  <div className="text-[10px] font-mono text-success-mint text-right leading-tight">Z=+3.82</div>
                </div>
                <div className="text-[9px] font-mono text-gray-dim mb-1 uppercase">Turbidity Formula:</div>
                <div className="text-[10px] font-mono text-white bg-white/5 px-2 py-1 rounded mb-3">NDTI = (Red - Green) / (Red + Green)</div>
                <div className="text-[9px] font-mono text-gray-dim mb-1 uppercase">Water Separation:</div>
                <div className="text-[10px] font-mono text-white bg-white/5 px-2 py-1 rounded mb-3">MNDWI = (Green - SWIR) / (Green + SWIR)</div>
                <div className="tech-row"><span className="label">Differential Anomaly:</span> <span className="val">ΔArea = ∑(P_obs - P_base) × 100m²</span></div>
                <div className="tech-row mt-2 pt-2 border-t border-white/10"><span className="label">Confidence Score:</span> <span className="val text-success-mint">σ = 0.841 (Z-Score: +3.82)</span></div>
              </div>

              <div className="tech-card">
                <div className="tech-card-header">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><MapPin size={14} className="text-gray" /> 05 - Spatial Reference</div>
                  <div className="text-[10px] font-mono text-accent-blue text-right leading-tight">UTM<br/>31N</div>
                </div>
                <div className="tech-row"><span className="label">Projection:</span> <span className="val">EPSG:4326 (WGS 84)</span></div>
                <div className="tech-row"><span className="label">Cartographic UTM:</span> <span className="val">Zone 31N Northern Hemisphere</span></div>
                <div className="tech-row"><span className="label">Sub-pixel Align:</span> <span className="val text-success-mint">RMS error &lt; 0.12 pixels</span></div>
                <div className="tech-row mt-2 pt-2 border-t border-white/10"><span className="label">Orthorectification:</span> <span className="val">Copernicus GLO-30 DEM</span></div>
              </div>

              <div className="tech-card">
                <div className="tech-card-header">
                  <div className="flex items-center gap-2 text-sm font-medium text-white"><ShieldCheck size={14} className="text-gray" /> 06 - Provenance Hash</div>
                  <div className="text-[10px] font-mono text-accent-blue text-right leading-tight">STAC<br/>v1.0</div>
                </div>
                <div className="tech-row"><span className="label">Pipeline Engine:</span> <span className="val">GeoTIFF COG / STAC API v1.0</span></div>
                <div className="tech-row"><span className="label">Atmospheric Zenith:</span> <span className="val">Zenith 30.6° - Azimuth 154.2°</span></div>
                <div className="text-[9px] font-mono text-gray-dim mt-3 mb-1 uppercase">Integrity Signature:</div>
                <div className="text-[10px] font-mono text-accent-blue break-all bg-accent-blue/10 px-2 py-1 rounded mb-3">{evidence.hash}</div>
                <div className="tech-row mt-2 pt-2 border-t border-white/10"><span className="label">Legal Audit Record:</span> <span className="val text-success-mint font-bold">VERIFIED TAMPER-PROOF</span></div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FOOTER ACTIONS */}
        <div className="evidence-footer">
          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-dim">
            <Lock size={12} /> Cryptographically signed with ED25519 - DRISHTIWATCH Defense Node #89
          </div>
          <div className="text-[10px] font-mono text-accent-blue bg-accent-blue/10 px-2 py-1 rounded">
            {evidence.hash}
          </div>
        </div>

      </div>
    </div>
  );
}
