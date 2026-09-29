import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function Cta() {
  const navigate = useNavigate();
  return (
    <section className="cta-section" style={{ padding: 'var(--spacing-32) 0', textAlign: 'center' }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        style={{ maxWidth: '600px', margin: '0 auto' }}
      >
        <h2 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', textTransform: 'uppercase', marginBottom: 'var(--spacing-6)', lineHeight: 1.1 }}>
          START SEEING<br/>THE EVIDENCE.
        </h2>
        
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem', marginBottom: 'var(--spacing-12)' }}>
          Turn satellite imagery into answers you can understand. Query millions of square kilometers in seconds.
        </p>
        
        <div style={{ display: 'flex', gap: 'var(--spacing-4)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => navigate('/explore')}>
            START EXPLORING <ArrowRight size={16} className="ml-2" />
          </button>
          <button className="btn-secondary">
            REQUEST ENTERPRISE DEMO <Sparkles size={16} className="ml-2" />
          </button>
        </div>
      </motion.div>
    </section>
  );
}
