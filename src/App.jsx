import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Explore from './pages/Explore/Explore';
import Watershed from './pages/Watershed/Watershed';
import Ask from './pages/Ask/Ask';
import Detect from './pages/Detect/Detect';
import Compare from './pages/Compare/Compare';
import Field from './pages/Field/Field';
import EvidenceReview from './pages/EvidenceReview/EvidenceReview';
import Evidence from './pages/Evidence/Evidence';
import Settings from './pages/Settings/Settings';
import { GlobalProvider } from './context/GlobalContext';
import { AppProvider } from './components/AppContext';

function App() {
  return (
    <AppProvider>
      <GlobalProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/watershed" element={<Watershed />} />
            <Route path="/field" element={<Field />} />
            {/* Mission was retired; Evidence Review replaces it */}
            <Route path="/mission" element={<Navigate to="/evidence-review" replace />} />
            <Route path="/evidence-review" element={<EvidenceReview />} />
            <Route path="/ask" element={<Ask />} />
            <Route path="/detect" element={<Detect />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/evidence" element={<Evidence />} />
            <Route path="/evidence/:id" element={<Evidence />} />
            <Route path="/settings" element={<Settings />} />
            {/* Unknown paths (incl. retired mock pages: watch, reports, timeline, area, measure) */}
            <Route path="*" element={<Navigate to="/explore" replace />} />
          </Routes>
        </Router>
      </GlobalProvider>
    </AppProvider>
  );
}

export default App;
