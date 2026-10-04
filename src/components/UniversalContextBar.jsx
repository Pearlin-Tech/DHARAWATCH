import React, { useState, useEffect, useContext, createContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Layers, Navigation, MapPin, Target, 
  ChevronDown, X, Activity, ExternalLink,
  Eye, Clock, CheckCircle2
} from 'lucide-react';

// ─── Context for app-wide state ──────────────────────────────────
const AppContext = createContext();

export function useAppContext() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [currentWatershed, setCurrentWatershed] = useState(null);
  const [currentObservation, setCurrentObservation] = useState(null);
  // Canonical selected intervention (Evidence Review → Field / Compare / Watershed)
  const [currentIntervention, setCurrentIntervention] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const clearContext = () => {
    setCurrentWatershed(null);
    setCurrentObservation(null);
    setCurrentIntervention(null);
  };

  const loadDemo = async () => {
    setDemoLoading(true);
    try {
      // Load demo data sequence
      // 1. Load Sardar Sarovar watershed
      // 2. Load mission
      // 3. Load field observation
      // 4. Load intervention
      // This would call the backend to ensure demo data exists
      setDemoMode(true);
      
      // The actual data loading happens when pages are visited
      // This just sets the demo mode flag
    } catch (err) {
      console.error('Demo load failed:', err);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AppContext.Provider value={{
      currentWatershed,
      setCurrentWatershed,
      currentObservation,
      setCurrentObservation,
      currentIntervention,
      setCurrentIntervention,
      clearContext,
      demoMode,
      setDemoMode,
      demoLoading,
      loadDemo
    }}>
      {children}
    </AppContext.Provider>
  );
}

// ─── Universal Context Bar ───────────────────────────────────────
export function UniversalContextBar() {
  const { 
    currentWatershed, 
    currentObservation,
    demoMode,
    demoLoading,
    loadDemo,
    clearContext 
  } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  const isMajorPage = ['/evidence-review', '/field', '/compare', '/evidence', '/ask'].some(p => location.pathname.startsWith(p));

  if (!isMajorPage) return null;

  const contextItems = [];
  
  if (currentWatershed) {
    contextItems.push({
      type: 'watershed',
      icon: <Layers size={12} color="#38bdf8" />,
      label: 'WATERSHED',
      name: currentWatershed.name || currentWatershed.id,
      onClick: () => navigate('/watershed', { state: { watershedId: currentWatershed.id } }),
      color: '#38bdf8'
    });
  }


  if (currentObservation) {
    contextItems.push({
      type: 'observation',
      icon: <MapPin size={12} color="#10b981" />,
      label: 'OBSERVATION',
      name: currentObservation.id?.slice(0, 12) || 'Field',
      onClick: () => navigate('/field', { state: { observationId: currentObservation.id } }),
      color: '#10b981'
    });
  }

  return (
    <div className="universal-context-bar">
      <div className="ucb-left">
        {contextItems.length > 0 && (
          <div className="ucb-context-chain">
            {contextItems.map((item, idx) => (
              <React.Fragment key={item.type}>
                {idx > 0 && <span className="ucb-separator">›</span>}
                <button 
                  className="ucb-context-btn"
                  onClick={item.onClick}
                  style={{ borderColor: item.color }}
                >
                  {item.icon}
                  <span>
                    <span className="ucb-ctx-label">{item.label}</span>
                    <span className="ucb-ctx-name">{item.name}</span>
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {contextItems.length === 0 && (
          <div className="ucb-empty">
            <span className="ucb-ctx-label">NO ACTIVE CONTEXT</span>
            <button className="ucb-demo-btn" onClick={loadDemo} disabled={demoLoading}>
              {demoLoading ? 'LOADING…' : demoMode ? 'DEMO MODE ACTIVE' : 'LOAD DEMONSTRATION'}
              <Activity size={10} className={demoLoading ? 'spin' : ''} />
            </button>
          </div>
        )}
      </div>

      <div className="ucb-right">
        {demoMode && (
          <span className="ucb-demo-badge">
            <Activity size={10} className="spin" style={{ color: '#f59e0b' }} />
            DEMO MODE
          </span>
        )}
        {contextItems.length > 0 && (
          <button className="ucb-clear-btn" onClick={clearContext} title="Clear context">
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export default AppContext;