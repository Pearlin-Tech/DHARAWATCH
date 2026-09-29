import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Download, Map as MapIcon, ShieldCheck, CheckCircle2, FlaskConical, AlertTriangle, Layers, Maximize } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './ReportDetail.css';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mapInstance, setMapInstance] = useState(null);

  const handleBack = () => navigate('/reports');
  const handleEvidence = () => navigate(`/evidence/ev-${id}`);
  const handleExplore = () => navigate('/explore');

  return (
    <div className="report-detail-container">
      <AppNavigation />
      
      <div className="report-main-content">
        
        {/* HEADER BAR */}
        <div className="report-header-bar">
          <div className="flex items-center gap-4">
            <button className="report-back-btn" onClick={handleBack}>
              <ArrowLeft size={14} /> REPORTS ARCHIVE
            </button>
            <div className="report-id-badge">
              <div className="w-1.5 h-1.5 bg-accent-blue rounded-full"></div> REPORT #EV-{id?.toUpperCase() || '8841-B'}
            </div>
            <div className="text-[10px] font-mono text-gray-dim uppercase">· IMMUTABLE ARCHIVE</div>
          </div>
          <div className="report-header-actions">
            <button className="px-3 py-1.5 bg-transparent hover:bg-white/5 rounded border border-white/10 text-xs text-white transition-colors flex items-center gap-2">
              <Share2 size={14} /> SHARE DOSSIER
            </button>
            <button className="px-3 py-1.5 bg-transparent hover:bg-white/5 rounded border border-white/10 text-xs text-white transition-colors flex items-center gap-2" onClick={handleExplore}>
              <MapIcon size={14} /> EXPORT GEOJSON
            </button>
            <button className="px-3 py-1.5 bg-accent-blue hover:bg-blue-600 rounded border border-blue-500 text-xs text-white font-medium transition-colors flex items-center gap-2">
              <Download size={14} /> EXPORT DOSSIER (PDF)
            </button>
          </div>
        </div>

        {/* TITLE SECTION */}
        <div className="report-title-section">
          <div className="flex justify-between items-center mb-4">
            <div className="text-[10px] font-mono text-accent-blue uppercase tracking-widest flex items-center gap-2">
              ORBITAL ENVIRONMENTAL AUDIT <span className="text-gray-dim">· CAMARGUE BASIN</span>
            </div>
            <div className="text-[10px] font-mono text-success-mint border border-success-mint/30 bg-success-mint/10 px-2 py-1 rounded flex items-center gap-1.5 uppercase">
              <ShieldCheck size={12} /> CRYPTOGRAPHICALLY VERIFIED (ED25519)
            </div>
          </div>
          <h1 className="report-query-title">Did sediment discharge at Camargue Estuary exceed the 2021 seasonal baseline?</h1>
        </div>

        {/* SUMMARY METADATA */}
        <div className="report-summary-grid">
          <div className="report-summary-cell">
            <div className="summary-label">SENSORS / CONSTELLATION</div>
            <div className="summary-value">Sentinel-2B MSI & Landsat-8</div>
            <div className="summary-sub">L2A Surface Reflectance</div>
          </div>
          <div className="report-summary-cell">
            <div className="summary-label">ACQUISITION TIMESTAMP</div>
            <div className="summary-value">18 AUG 2024 - 10:42:18 UTC</div>
            <div className="summary-sub">Sun Azimuth 148.6° / Zen 32.1°</div>
          </div>
          <div className="report-summary-cell">
            <div className="summary-label">HISTORICAL BASELINE</div>
            <div className="summary-value">15 AUG 2021 - 10:41:02 UTC</div>
            <div className="summary-sub">36-Month Tri-Year Median</div>
          </div>
          <div className="report-summary-cell">
            <div className="summary-label text-accent-blue">TARGET COORDINATES (AOI)</div>
            <div className="summary-value text-accent-blue">43°32'14"N, 04°30'28"E</div>
            <div className="summary-sub text-accent-blue">Rhône Delta Plume Shelf</div>
          </div>
        </div>

        {/* MAIN PROOF VISUAL */}
        <div className="report-map-header">
          <div className="text-[10px] font-mono text-accent-blue uppercase tracking-widest">
            SENSOR FRAME #S2B_MSIL2A_20240818T104218 <span className="text-gray-dim">| RGB True Color (B04, B03, B02) - NDTI vector Extent</span>
          </div>
          <div className="text-[10px] font-mono text-gray-dim uppercase flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-accent-blue rounded-full"></div> 10m Ground Sample Distance (GSD)
          </div>
        </div>
        
        <div className="report-map-container">
          <MapViewport 
            center={[4.69, 43.53]} 
            zoom={11}
            onMapLoad={setMapInstance}
          />
          {/* Overlay Graphics to match reference */}
          <div className="absolute inset-0 pointer-events-none z-10">
             <svg width="100%" height="100%" className="absolute inset-0">
                <path 
                  d="M 300 200 Q 500 350 600 500 Q 700 400 550 250 Z" 
                  fill="rgba(37, 99, 235, 0.15)" 
                  stroke="var(--accent-blue)" 
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
                <circle cx="580" cy="480" r="4" fill="var(--accent-blue)" />
                <line x1="580" y1="480" x2="680" y2="430" stroke="var(--accent-blue)" strokeWidth="1" />
              </svg>
              <div className="absolute" style={{ top: '410px', left: '690px' }}>
                <div className="bg-black/80 border border-accent-blue/30 px-2 py-1 rounded text-[9px] font-mono text-accent-blue">OUTFLOW APEX - DISCHARGE PULSE</div>
              </div>
          </div>
          
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur border border-white/10 px-3 py-1.5 rounded-lg text-[10px] font-mono text-white flex items-center gap-2 z-20">
            <Maximize size={12} className="text-accent-blue" /> CENTROID: 43.4194° N, 4.7082° E
          </div>
        </div>
        <p className="report-caption">
          <strong>Figure 1.0:</strong> Orthorectified multi-spectral composite demonstrating seaward particulate plume advection extending 19.4 km southeast of the Grand-Rhône river mouth. Dashed contour denotes 2024 anomalous delta envelope relative to August 2021 boundary. <span className="float-right font-mono text-[9px] uppercase text-gray">STAC COLLECTION: V1.0.0</span>
        </p>

        {/* ANALYSIS & DOSSIER */}
        <div className="report-body-grid">
          
          {/* Left Column: Analytics */}
          <div className="analytical-panel">
            <div className="analytical-panel-header">
              <div className="flex items-center gap-2 text-xs font-mono text-white uppercase"><CheckCircle2 size={16} className="text-success-mint" /> ANALYTICAL DETERMINATION</div>
              <div className="text-[10px] font-mono text-success-mint bg-success-mint/10 px-2 py-1 rounded">AFFIRMATIVE ANOMALY DETECTED</div>
            </div>
            
            <p className="text-[1.1rem] leading-relaxed text-gray-200 mb-6">
              Estuarine sediment plume surface extent expanded by <span className="text-accent-blue font-bold">+34.2 km²</span>, reaching a verified total observed marine footprint of 220.0 km² (versus the August 2021 reference limit of 185.8 km²).
            </p>
            <p className="text-sm text-gray-400 mb-8">
              Multi-spectral band ratio diagnostics verify that this outflow pulse was precipitated by accelerated late-season Alpine glacial melt coupled with localized high-intensity rainfall across the southern Rhône drainage corridor between 12-16 August 2024.
            </p>
            
            <div className="grid grid-cols-3 gap-4 mb-8 border-t border-white/10 pt-6">
              <div>
                <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">2021 BASELINE EXTENT</div>
                <div className="text-xl font-bold text-white">185.8 <span className="text-sm font-normal text-gray-dim">km²</span></div>
                <div className="text-[10px] font-mono text-gray-dim mt-1">Ref: 2021-08-15</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">2024 OBSERVED EXTENT</div>
                <div className="text-xl font-bold text-accent-blue">220.0 <span className="text-sm font-normal text-accent-blue/60">km²</span></div>
                <div className="text-[10px] font-mono text-accent-blue mt-1">Net Δ: +34.2 km²</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">STATISTICAL SIGNIFICANCE</div>
                <div className="text-xl font-bold text-success-mint">99.4%</div>
                <div className="text-[10px] font-mono text-success-mint mt-1">Z-Score +3.82 (p &lt; 0.001)</div>
              </div>
            </div>

            {/* Profile Chart placeholder */}
            <div className="border-t border-white/10 pt-6">
              <div className="flex justify-between text-[9px] font-mono text-gray-dim uppercase mb-4">
                <span>Normalized Difference Turbidity Index (NDTI) Profile</span>
                <span>Trans-Sect A → A' (24 km)</span>
              </div>
              <div className="h-24 w-full relative mb-4">
                <svg width="100%" height="100%" preserveAspectRatio="none">
                  <path d="M 0 80 Q 250 85 500 90" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                  <path d="M 0 80 Q 250 20 500 80" fill="none" stroke="var(--accent-blue)" strokeWidth="2" />
                  <circle cx="250" cy="35" r="3" fill="var(--accent-blue)" />
                </svg>
              </div>
              <div className="flex justify-between text-[9px] font-mono text-gray">
                <div className="flex gap-4">
                  <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-accent-blue"></div> 2024 Observed</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-gray"></div> 2021 Baseline</span>
                </div>
                <span>Estuary Apex (0 km) → Open Shelf (24 km)</span>
              </div>
            </div>
            
          </div>

          {/* Right Column: Dossier Criteria */}
          <div className="dossier-panel">
            <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
              <div className="text-xs font-mono text-white uppercase tracking-widest">DOSSIER CRITERIA</div>
              <div className="text-[10px] font-mono text-success-mint">5/5 PASS</div>
            </div>
            
            <div className="criteria-list">
              <div className="criteria-item">
                <CheckCircle2 size={16} className="text-success-mint criteria-icon" />
                <div>
                  <h4>Cloud Obscuration &lt; 1.0%</h4>
                  <p>Measured 0.8% over AOI via SCL</p>
                </div>
              </div>
              <div className="criteria-item">
                <CheckCircle2 size={16} className="text-success-mint criteria-icon" />
                <div>
                  <h4>Coregistration Threshold</h4>
                  <p>RMS error 0.082 px (&lt; 0.15 limit)</p>
                </div>
              </div>
              <div className="criteria-item">
                <CheckCircle2 size={16} className="text-success-mint criteria-icon" />
                <div>
                  <h4>Atmospheric Correction</h4>
                  <p>Sen2Cor v2.11 BOA validated</p>
                </div>
              </div>
              <div className="criteria-item">
                <CheckCircle2 size={16} className="text-success-mint criteria-icon" />
                <div>
                  <h4>MNDWI Water Inundation Mask</h4>
                  <p>Shoreline vector matched Copernicus DEM</p>
                </div>
              </div>
              <div className="criteria-item">
                <CheckCircle2 size={16} className="text-success-mint criteria-icon" />
                <div>
                  <h4>Radiometric Calibration</h4>
                  <p>Cross-calibrated with Landsat-8 OLI-2</p>
                </div>
              </div>
            </div>

            <div className="report-crypto-box">
              <div className="text-[10px] font-mono text-gray-dim uppercase mb-2">CRYPTOGRAPHIC CUSTODY</div>
              <div className="text-[10px] font-mono text-accent-blue bg-accent-blue/10 p-2 rounded break-all mb-4">
                sha256:7f9a2e68c031d4c21a0f903824bc893df12933e4811a0cb419bba514
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-gray">Authorizing Unit:</span>
                <span className="text-white">DRISHTIWATCH-SYS-ALPHA</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono mt-1">
                <span className="text-gray">Security Compartment:</span>
                <span className="text-accent-blue">CIVIL-EARTH-MONITOR</span>
              </div>
            </div>
            
            <button 
              className="w-full mt-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-xs font-mono text-white transition-colors flex items-center justify-center gap-2"
              onClick={handleEvidence}
            >
              <ShieldCheck size={14} /> OPEN EVIDENCE VERIFICATION
            </button>
          </div>
          
        </div>
        
        {/* Footer */}
        <div className="flex justify-between items-center border-t border-white/10 pt-6 pb-12">
          <div>
            <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">DRISHTIWATCH AUTOMATED EARTH OBSERVATION SYSTEM</div>
            <div className="text-xs text-gray">Generated for Department of Environmental Spatial Surveillance - Reference Mission EV-8841-B</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">DISPOSITION: VERIFIED COMPLETE</div>
            <div className="text-[10px] font-mono text-success-mint uppercase tracking-widest">STATUS: SIGNED & SEALED</div>
          </div>
        </div>

      </div>
    </div>
  );
}
