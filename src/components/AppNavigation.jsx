import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, MessageSquare, FileStack, Settings, Eye, ShieldCheck, Layers, MapPin, ClipboardCheck } from 'lucide-react';
import './AppNavigation.css';

export default function AppNavigation() {
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // exact section match: '/evidence-review' must not light up '/evidence/…' (and vice versa)
  const isActive = (path) => {
    const section = path.split('/')[1];
    return location.pathname.split('/')[1] === section;
  };

  const navItems = [
    { id: 'explore', icon: MapIcon, label: 'Explore', path: '/explore' },
    { id: 'watershed', icon: Layers, label: 'Watershed', path: '/watershed' },
    { id: 'field', icon: MapPin, label: 'Field', path: '/field' },
    { id: 'evidence-review', icon: ClipboardCheck, label: 'Evidence Review', path: '/evidence-review' },
    { id: 'ask', icon: MessageSquare, label: 'Ask', path: '/ask' },
    { id: 'compare', icon: FileStack, label: 'Compare', path: '/compare' },
    { id: 'evidence', icon: ShieldCheck, label: 'Evidence', path: '/evidence' },
  ];

  return (
    <motion.nav 
      className="explore-nav-rail glass-panel"
      animate={{ width: isNavExpanded ? 220 : 72 }}
      onMouseEnter={() => setIsNavExpanded(true)}
      onMouseLeave={() => setIsNavExpanded(false)}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div 
        className="nav-rail-header" 
        onClick={() => navigate('/')} 
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: isNavExpanded ? 'flex-start' : 'center', paddingLeft: isNavExpanded ? '20px' : '0' }}
      >
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
              <span style={{ fontFamily: 'monospace', fontWeight: 900, color: 'var(--accent-blue)', letterSpacing: '2px', fontSize: '14px' }}>DHARA</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 300, color: '#9ca3af', letterSpacing: '6.5px', fontSize: '9px', marginTop: '2px', paddingLeft: '1px' }}>WATCH</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <div className="nav-rail-links">
        {navItems.map((item) => {
          return (
            <button 
              key={item.id}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <div className="nav-icon">
                <item.icon size={18} />
              </div>
              <AnimatePresence>
                {isNavExpanded && (
                  <motion.span 
                    className="nav-label"
                    initial={{ opacity: 0, x: -10, width: 0 }}
                    animate={{ opacity: 1, x: 0, width: 'auto' }}
                    exit={{ opacity: 0, x: -10, width: 0 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>

      <div className="nav-rail-bottom" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button className={`nav-item ${location.pathname.includes('/settings') ? 'active' : ''}`} onClick={() => navigate('/settings')}>
          <div className="nav-icon"><Settings size={18} /></div>
          <AnimatePresence>
            {isNavExpanded && (
              <motion.span 
                className="nav-label"
                initial={{ opacity: 0, x: -10, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 'auto' }}
                exit={{ opacity: 0, x: -10, width: 0 }}
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.nav>
  );
}
