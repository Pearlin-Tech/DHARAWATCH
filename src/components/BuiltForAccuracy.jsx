import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import './BuiltForAccuracy.css';

export default function BuiltForAccuracy() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"]
  });

  const step1Opacity = useTransform(scrollYProgress, [0, 0.2], [0.3, 1]);
  const step2Opacity = useTransform(scrollYProgress, [0.3, 0.5], [0.3, 1]);
  const step3Opacity = useTransform(scrollYProgress, [0.6, 0.8], [0.3, 1]);

  const lineWidth = useTransform(scrollYProgress, [0, 0.8], ["0%", "100%"]);

  return (
    <section className="accuracy-section" ref={containerRef}>
      <div className="accuracy-header text-center mb-16">
        <div className="text-xs font-mono text-blue-accent mb-4">ARCHITECTURE · PIPELINE</div>
        <h2 className="accuracy-title">BUILT FOR ACCURACY.</h2>
      </div>

      <div className="pipeline-container">
        <div className="pipeline-line-bg">
          <motion.div className="pipeline-line-active" style={{ width: lineWidth }} />
        </div>
        
        <div className="pipeline-steps">
          <motion.div className="pipeline-step" style={{ opacity: step1Opacity }}>
            <div className="step-number">01</div>
            <h3 className="step-title">ASK.</h3>
            <p className="step-desc">Formulate queries in natural language. Parameters are parsed, constraints specific to API and routing logic are synthetically aligned.</p>
            <div className="step-meta font-mono text-xs">NLP · SEMANTIC PARSING · QUERY</div>
          </motion.div>

          <motion.div className="pipeline-step" style={{ opacity: step2Opacity }}>
            <div className="step-number">02</div>
            <h3 className="step-title">ANALYSE.</h3>
            <p className="step-desc">Accurate surface, perimeter, and multi-temporal metrics calculated directly on sensor bits, polygons, raster multi-spectral data layers.</p>
            <div className="step-meta font-mono text-xs">RAW ASSET COMPUTE · PIPELINE</div>
          </motion.div>

          <motion.div className="pipeline-step" style={{ opacity: step3Opacity }}>
            <div className="step-number">03</div>
            <h3 className="step-title">VERIFY.</h3>
            <p className="step-desc">Every extracted metric is verified against original sensor run passes with full geo-hash, data provenance and audit trail variants attached.</p>
            <div className="step-meta font-mono text-xs">DATA PROVENANCE · QA · LINEAGE</div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
