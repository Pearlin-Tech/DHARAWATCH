import React, { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import './Evidence.css';

export default function Evidence() {
  const [showTech, setShowTech] = useState(false);

  return (
    <section className="evidence-section" id="evidence">
      <div className="evidence-container glass-panel">
        <div className="evidence-header mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4 text-success">
            <ShieldCheck size={24} />
            <span className="font-mono text-sm tracking-wider">VERIFIED INTELLIGENCE</span>
          </div>
          <h2 className="text-3xl font-bold uppercase">THE EVIDENCE LAYER</h2>
          <p className="text-gray mt-2">Every answer is backed by traceable, auditable satellite data.</p>
        </div>

        <div className="evidence-card">
          <div className="evidence-grid">
            <div className="evidence-item">
              <div className="e-label">QUESTION</div>
              <div className="e-value">"What changed here?"</div>
            </div>
            <div className="evidence-item">
              <div className="e-label">SOURCE</div>
              <div className="e-value">Sentinel-2</div>
            </div>
            <div className="evidence-item">
              <div className="e-label">DATE</div>
              <div className="e-value font-mono">24 Sep 2026</div>
            </div>
            <div className="evidence-item">
              <div className="e-label">METHOD</div>
              <div className="e-value">Change Detection (NDWI)</div>
            </div>
            <div className="evidence-item">
              <div className="e-label text-success">RESULT</div>
              <div className="e-value font-mono text-success text-xl">12.8 KM²</div>
            </div>
          </div>
          
          <div className="evidence-tech-toggle" onClick={() => setShowTech(!showTech)}>
            <span className="font-mono text-xs">SHOW TECHNICAL DETAILS</span>
            {showTech ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>

          {showTech && (
            <div className="evidence-tech-details">
              <div className="tech-row">
                <span className="tech-label">Spatial Resolution:</span>
                <span className="tech-val">10m / pixel</span>
              </div>
              <div className="tech-row">
                <span className="tech-label">Spectral Bands:</span>
                <span className="tech-val">B3 (Green), B8 (NIR)</span>
              </div>
              <div className="tech-row">
                <span className="tech-label">Algorithm:</span>
                <span className="tech-val">NDWI = (Green - NIR) / (Green + NIR)</span>
              </div>
              <div className="tech-row">
                <span className="tech-label">Cloud Cover:</span>
                <span className="tech-val">0.08% (Negligible)</span>
              </div>
              <div className="tech-row">
                <span className="tech-label">Coordinate System:</span>
                <span className="tech-val">EPSG:4326 (WGS84)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
