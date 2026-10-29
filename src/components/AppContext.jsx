import React, { useState, useContext, createContext } from 'react';

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

  const clearContext = () => {
    setCurrentWatershed(null);
    setCurrentObservation(null);
    setCurrentIntervention(null);
  };

  return (
    <AppContext.Provider value={{
      currentWatershed,
      setCurrentWatershed,
      currentObservation,
      setCurrentObservation,
      currentIntervention,
      setCurrentIntervention,
      clearContext
    }}>
      {children}
    </AppContext.Provider>
  );
}

export default AppContext;
