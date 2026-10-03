import React, { createContext, useContext, useState } from 'react';

const GlobalContext = createContext();

export function useGlobalContext() {
  return useContext(GlobalContext);
}

export function GlobalProvider({ children }) {
  // Watershed page manages its own active context via URL params and its own state.
  // GlobalContext does NOT force a default watershed — that caused the Sardar Sarovar bug.
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [activeLayers, setActiveLayers] = useState({
    boundary: true,
    ndvi: true,
    ndwi: true,
    true_color: true
  });

  const setFeature = (feature) => {
    setSelectedFeature(feature);
    if (feature) {
      try { localStorage.setItem('dharawatch_selectedFeature', JSON.stringify(feature)); } catch (_) {}
    } else {
      try { localStorage.removeItem('dharawatch_selectedFeature'); } catch (_) {}
    }
  };

  return (
    <GlobalContext.Provider value={{
      selectedFeature,
      setSelectedFeature: setFeature,
      defaultFeature: null,
      activeLayers,
      setActiveLayers
    }}>
      {children}
    </GlobalContext.Provider>
  );
}
