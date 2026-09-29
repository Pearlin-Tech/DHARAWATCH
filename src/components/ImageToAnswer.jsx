import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Search, ChevronRight } from 'lucide-react';
import './ImageToAnswer.css';

export default function ImageToAnswer() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const queryOpacity = useTransform(scrollYProgress, [0.1, 0.3], [0, 1]);
  const queryY = useTransform(scrollYProgress, [0.1, 0.3], [30, 0]);
  
  const mapScale = useTransform(scrollYProgress, [0.2, 0.5], [0.9, 1]);
  const mapOpacity = useTransform(scrollYProgress, [0.2, 0.4], [0.5, 1]);

  const overlayOpacity = useTransform(scrollYProgress, [0.4, 0.6], [0, 1]);
  const resultOpacity = useTransform(scrollYProgress, [0.5, 0.7], [0, 1]);
  const resultY = useTransform(scrollYProgress, [0.5, 0.7], [20, 0]);

  return (
    <section className="ita-section" ref={containerRef} id="ask">
      <div className="ita-header">
        <div className="text-xs font-mono text-blue-accent mb-4">SENSOR TO SIGNAL · SOURCE · SENTINEL-2</div>
        <h2 className="ita-title">FROM IMAGE<br/>TO ANSWER.</h2>
        <p className="ita-subtitle">Shift from complex manual GIS software workflows to natural conversational understanding powered by AI-native earth observation models.</p>
      </div>

      <motion.div 
        className="query-container glass-panel"
        style={{ opacity: queryOpacity, y: queryY }}
      >
        <div className="query-input-bar">
          <div className="query-icon">
            <Search size={20} color="var(--accent-blue)" />
          </div>
          <div className="query-text">
            <span className="query-label">PROMPT / DIRECTIVE</span>
            <div className="query-question">"What changed here over the last 14 days?"</div>
          </div>
          <div className="query-meta font-mono text-xs">
            TYPE: CV · REQ: 21.05S
          </div>
        </div>
        <div className="query-tags">
          <span className="tag success">● Built 5 / Polygon: 12 · 482FT² · Res 10</span>
          <span className="tag">Temporal Shift 14d</span>
          <span className="tag border-only ml-auto">Confidence: 96.8%</span>
        </div>
      </motion.div>

      <div className="ita-visual-container">
        <motion.div 
          className="ita-map-wrapper"
          style={{ scale: mapScale, opacity: mapOpacity }}
        >
          <img src="/map-before.jpg" alt="Map Region" className="ita-map-base" />
          
          <motion.div className="ita-map-overlay" style={{ opacity: overlayOpacity }}>
            <div className="svg-overlay-container">
              <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="none">
                <path d="M200,150 L600,180 L650,450 L150,500 Z" className="polygon-highlight" />
                <circle cx="400" cy="320" r="8" className="pulse-point" />
              </svg>
            </div>
          </motion.div>

          <motion.div 
            className="ita-result-panel glass-panel"
            style={{ opacity: resultOpacity, y: resultY }}
          >
            <div className="text-xs font-mono text-warning mb-2">● FINDING VERIFIED</div>
            <h3 className="result-title">CHANGE DETECTED</h3>
            <p className="result-desc text-sm text-gray">Automated surface deltas indicate a 21% increase in hydrological variation across the sensor baseline, confirming seasonal shift in ground-level water limits.</p>
            
            <div className="result-metrics">
              <div className="metric-row font-mono">
                <span className="text-gray">AFFECTED AREA</span>
                <span className="text-primary text-lg">12.8 <span className="text-xs">KM²</span></span>
              </div>
              <div className="metric-row font-mono">
                <span className="text-gray">RELATIVE CHANGE (14d)</span>
                <span className="text-success text-lg">+21.7%</span>
              </div>
            </div>

            <button className="btn-secondary mt-4 w-full">
              View Evidence <ChevronRight size={16} />
            </button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
