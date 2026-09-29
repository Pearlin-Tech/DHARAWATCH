import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import './Hero.css';

export default function Hero() {
  const navigate = useNavigate();
  return (
    <section className="hero-section">
      <div className="hero-content">
        <motion.div 
          className="hero-badge text-xs font-mono"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="indicator"></span>
          DRISHTIWATCH AI · ACTIVE MONITORING GRID
        </motion.div>
        
        <motion.h1 
          className="hero-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          UNDERSTAND EARTH.<br />
          WITH INTELLIGENCE.
        </motion.h1>
        
        <motion.p 
          className="hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          Ask questions. Analyse satellite imagery. Measure changes. See the evidence.
        </motion.p>
        
        <motion.div 
          className="hero-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <button className="btn-primary" onClick={() => navigate('/explore')}>
            START EXPLORING <ArrowRight size={16} className="ml-2" />
          </button>
          <button className="btn-secondary" onClick={() => navigate('/ask')}>
            ASK DRISHTIWATCH <Sparkles size={16} className="ml-2" />
          </button>
        </motion.div>
      </div>

      <motion.div 
        className="hero-visual"
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
      >
        <div className="satellite-image-wrapper">
          <img src="/hero-map.jpg" alt="Satellite imagery of river delta" className="satellite-image" />
          
          <div className="image-metadata glass-panel font-mono text-xs">
            <div className="meta-item">
              <span className="meta-label">LAT</span> 28.7561° N
            </div>
            <div className="meta-item">
              <span className="meta-label">LON</span> -89.2158° W
            </div>
            <div className="meta-item">
              <span className="meta-label">DATE</span> 24 Sep 2026
            </div>
            <div className="meta-item">
              <span className="meta-label">SENSOR</span> Sentinel-2 (10m)
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
