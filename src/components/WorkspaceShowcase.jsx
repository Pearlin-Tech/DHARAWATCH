import React, { useState, useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Layers, Settings, Search, CheckCircle2, ChevronRight, Share2, Download, Maximize2 } from 'lucide-react';
import './WorkspaceShowcase.css';

export default function WorkspaceShowcase() {
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "center center"]
  });

  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);

  const handleSliderChange = (e) => {
    setSliderPosition(e.target.value);
  };

  return (
    <section className="workspace-section" ref={containerRef}>
      <div className="workspace-header mb-12">
        <div className="text-xs font-mono text-blue-accent mb-4">WORKSPACE · PREVIEW</div>
        <h2 className="accuracy-title">THE DRISHTIWATCH WORKSPACE</h2>
        <p className="step-desc mt-4">A complete environment designed for analysts, researchers and operators to manage and generate high-fidelity spatial intelligence.</p>
      </div>

      <motion.div 
        className="workspace-app-container glass-panel"
        style={{ scale, opacity }}
      >
        <div className="workspace-topbar">
          <div className="ws-brand">DRISHTIWATCH <span className="text-blue-accent text-xs">AI</span></div>
          <div className="ws-search glass-panel">
            <Search size={16} />
            <span>Ahmedabad, India</span>
          </div>
          <div className="ws-actions">
            <Share2 size={16} />
            <Download size={16} />
            <Maximize2 size={16} />
          </div>
        </div>

        <div className="workspace-body">
          <div className="ws-sidebar hide-mobile">
            <div className="ws-nav-item active"><Layers size={18} /> Map</div>
            <div className="ws-nav-item"><Settings size={18} /> Settings</div>
          </div>

          <div className="ws-main">
            <div className="ws-map-area">
              <div className="comparison-slider-container">
                <div className="map-view before-map" style={{ width: `${sliderPosition}%` }}>
                  <img src="/map-before.jpg" alt="Before" className="map-image" />
                  <div className="map-label font-mono">Time: OCT 2021</div>
                </div>
                
                <div className="map-view after-map" style={{ width: `${100 - sliderPosition}%`, right: 0 }}>
                  <img src="/map-after.jpg" alt="After" className="map-image" style={{ transform: `translateX(-${sliderPosition}%)` }} />
                  <div className="map-label font-mono" style={{ right: 16, left: 'auto' }}>Time: OCT 2026</div>
                </div>
                
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={sliderPosition} 
                  onChange={handleSliderChange}
                  className="comparison-slider"
                />
                
                <div className="slider-handle" style={{ left: `${sliderPosition}%` }}>
                  <div className="handle-line"></div>
                  <div className="handle-button">
                    <ChevronRight size={12} className="handle-icon left" />
                    <ChevronRight size={12} className="handle-icon right" />
                  </div>
                </div>
              </div>

              {/* Floating AI Panel */}
              <div className="ws-ai-panel glass-panel">
                <div className="panel-header text-xs font-mono">AI Command</div>
                <div className="panel-content">
                  <div className="flex items-center gap-2">
                    <div className="ai-avatar"><img src="/vite.svg" width="16" /></div>
                    <span className="text-sm">"Calculate deforested area since 2021."</span>
                  </div>
                  <button className="btn-primary mt-2 text-xs w-full">Ask</button>
                </div>
              </div>
            </div>

            <div className="ws-right-panel hide-mobile glass-panel">
              <h4 className="text-sm font-semibold mb-4">ANALYSIS: DEFORESTATION</h4>
              
              <div className="panel-section">
                <div className="text-xs text-gray mb-1">Status</div>
                <div className="flex items-center gap-2 text-success text-sm">
                  <CheckCircle2 size={14} /> Completed
                </div>
              </div>

              <div className="panel-section">
                <div className="text-xs text-gray mb-1">Affected Area</div>
                <div className="text-xl font-mono">4.2 KM²</div>
              </div>
              
              <div className="panel-section">
                <div className="text-xs text-gray mb-1">Confidence</div>
                <div className="text-sm font-mono">94.2%</div>
              </div>

              <div className="panel-section">
                <div className="text-xs text-gray mb-2">Legend</div>
                <div className="legend-item"><span className="color-box bg-red"></span> Deforested</div>
                <div className="legend-item"><span className="color-box bg-green"></span> Forest</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
