import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Explore from './pages/Explore/Explore';
import Ask from './pages/Ask/Ask';
import Detect from './pages/Detect/Detect';
import Compare from './pages/Compare/Compare';
import Measure from './pages/Measure/Measure';
import Area from './pages/Area/Area';
import WatchList from './pages/Watch/WatchList';
import WatchNew from './pages/Watch/WatchNew';
import WatchDetail from './pages/Watch/WatchDetail';
import Timeline from './pages/Timeline/Timeline';
import Evidence from './pages/Evidence/Evidence';
import Reports from './pages/Reports/Reports';
import ReportDetail from './pages/Reports/ReportDetail';
import Settings from './pages/Settings/Settings';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/ask" element={<Ask />} />
        <Route path="/detect" element={<Detect />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/measure" element={<Measure />} />
        <Route path="/area" element={<Area />} />
        <Route path="/watch" element={<WatchList />} />
        <Route path="/watch/new" element={<WatchNew />} />
        <Route path="/watch/:id" element={<WatchDetail />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/evidence/:id" element={<Evidence />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}

export default App;
