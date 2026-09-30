import React, { createContext, useContext, useState, useEffect } from 'react';

const GlobalContext = createContext();

export function useGlobalContext() {
  return useContext(GlobalContext);
}

export function GlobalProvider({ children }) {
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [activeLayers, setActiveLayers] = useState({
    boundary: true,
    ndvi: true,
    ndwi: true,
    true_color: true
  });

  // Sardar Sarovar Dam Default Context
  const defaultFeature = {
    id: 'demo-sardar-sarovar',
    name: 'Sardar Sarovar Dam',
    type: 'Infrastructure',
    latitude: 21.8315,
    longitude: 73.7485,
    watershedId: 'narmada-basin-demo',
    watershedName: 'Narmada Basin',
    source: 'DEMO PRESET',
    mode: 'demo'
  };

  // Initialize from local storage or use default
  useEffect(() => {
    try {
      const stored = localStorage.getItem('dharawatch_selectedFeature');
      if (stored) {
        setSelectedFeature(JSON.parse(stored));
      } else {
        setSelectedFeature(defaultFeature);
      }
    } catch (e) {
      setSelectedFeature(defaultFeature);
    }
  }, []);

  // Update local storage when it changes
  const setFeature = (feature) => {
    setSelectedFeature(feature);
    if (feature) {
      localStorage.setItem('dharawatch_selectedFeature', JSON.stringify(feature));
    } else {
      localStorage.removeItem('dharawatch_selectedFeature');
    }
  };

  return (
    <GlobalContext.Provider value={{ 
      selectedFeature, 
      setSelectedFeature: setFeature, 
      defaultFeature,
      activeLayers,
      setActiveLayers
    }}>
      {children}
    </GlobalContext.Provider>
  );
}
