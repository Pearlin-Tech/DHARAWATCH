import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Satellite, EyeOff, AlertTriangle, Pause, Play, MoreHorizontal, Activity, Download } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import './Watch.css';

export default function WatchList() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('All');

  const mockWatches = [
    { id: 'wt-01', name: 'Forest region // Madre de Dios Basin', condition: 'Deforestation', sub: 'Canopy Loss Vector', env: '340 km²', thresh: 'NDVI Δ > -12%', threshSub: 'Dual-band differential', last: '18m ago', next: 'Next pass in 3h 12m', sensor: 'Sentinel-2', status: 'Active', img: 'S2' },
    { id: 'wt-02', name: 'River delta // Camargue Estuary', condition: 'Flood change', sub: 'Surface Water Surge', env: '850 km²', thresh: 'Surface Area +10%', threshSub: 'SAR NDWI verification', last: '1h ago', next: 'Tomorrow 09:40 UTC', sensor: 'Sentinel-2', status: 'Active', img: 'S2' },
    { id: 'wt-03', name: 'City edge // Eastern Ring Corridor', condition: 'Construction', sub: 'New Sprawl & Concrete', env: '48 km²', thresh: 'Footprint > 500 m²', threshSub: 'Cadastral overlap check', last: '3d ago', next: 'Alert fired 5d ago', sensor: 'WorldView-3', status: 'Paused', img: 'WV3', alert: true },
    { id: 'wt-04', name: 'Agricultural belt // San Joaquin Valley', condition: 'Crop Stress', sub: 'Water Deficit Index', env: '1,420 km²', thresh: 'NDWI < 0.20', threshSub: 'Thermal stress model', last: '4h ago', next: 'Next pass in 6h', sensor: 'Landsat 9', status: 'Active', img: 'L9' },
    { id: 'wt-05', name: 'Glacial lake // Cordillera Blanca', condition: 'Outburst Hazard', sub: 'Moraine Expansion', env: '120 km²', thresh: 'Lake level +1.5m', threshSub: 'Radar interferometry', last: '6h ago', next: 'Next pass in 14h', sensor: 'Sentinel-1 SAR', status: 'Active', img: 'SAR' },
    { id: 'wt-06', name: 'Coastal perimeter // Wadden Sea', condition: 'Sediment Erosion', sub: 'Intertidal Sandbank Drift', env: '510 km²', thresh: 'Retreat > 2m', threshSub: 'Tidal baseline corrected', last: '12h ago', next: 'Next pass in 2d', sensor: 'Sentinel-2', status: 'Active', img: 'S2' },
  ];

  return (
    <div className="watch-container">
      <AppNavigation />
      
      <div className="watch-main-content">
        <div className="watch-header-bar">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold tracking-tight">Watch</h1>
              <span className="text-[10px] font-mono text-accent-blue bg-accent-blue/10 px-2 py-0.5 rounded border border-accent-blue/20">SURVEILLANCE HUD</span>
            </div>
            <p className="text-gray mt-2 font-medium">Continuous orbital surveillance and automated threshold triggers across designated spatial envelopes.</p>
            
            <div className="watch-stats-row">
              <div className="stat-pill"><span className="text-gray-dim uppercase">Envelopes</span> <span className="val">8</span></div>
              <div className="stat-pill"><div className="indicator bg-success-mint"></div> <span className="text-gray-dim uppercase">Active</span> <span className="val">6</span></div>
              <div className="stat-pill"><div className="indicator bg-warning-amber"></div> <span className="text-gray-dim uppercase">Paused</span> <span className="val">2</span></div>
              <div className="h-6 w-px bg-white/10 mx-1"></div>
              <div className="stat-pill"><Satellite size={12} className="text-accent-blue" /> <span className="text-gray-dim uppercase">Next Pass</span> <span className="val text-accent-blue">42m (Sentinel-2)</span></div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border border-white/5">
              Rulesets
            </button>
            <button 
              className="px-4 py-2 bg-accent-blue hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
              onClick={() => navigate('/watch/new')}
            >
              <Plus size={16} /> New Watch <span className="text-[10px] font-mono opacity-60 ml-1">N</span>
            </button>
          </div>
        </div>

        <div className="watch-filters">
          <div className="watch-search">
            <Search size={14} className="text-gray" />
            <input type="text" placeholder="Filter watches or coords... (Cmd+K)" />
          </div>
          
          <div className="filter-tabs">
            {['All', 'Active', 'Paused', 'Alerts'].map(tab => (
              <div 
                key={tab} 
                className={`filter-tab ${activeFilter === tab ? 'active' : ''}`}
                onClick={() => setActiveFilter(tab)}
              >
                {tab} {tab === 'Alerts' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger-red ml-1"></span>}
              </div>
            ))}
          </div>
        </div>

        <table className="watch-table">
          <thead>
            <tr>
              <th>Target AOI / Location Envelope</th>
              <th>Condition / Target</th>
              <th>Threshold Criteria</th>
              <th>Recent Orbital Pass</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {mockWatches.map(watch => (
              <tr key={watch.id} className="watch-row" onClick={() => navigate(`/watch/${watch.id}`)}>
                <td>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-800 rounded relative overflow-hidden flex-shrink-0">
                      {/* Fake imagery placeholder */}
                      <img src={`https://picsum.photos/seed/${watch.id}/100/100`} alt="AOI" className="w-full h-full object-cover opacity-60 mix-blend-luminosity" />
                      <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] font-mono px-1">{watch.img}</div>
                    </div>
                    <div>
                      <div className="text-white font-medium mb-0.5">{watch.name}</div>
                      <div className="text-[10px] font-mono text-gray-dim">Envelope: {watch.env}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="text-white font-medium mb-0.5">{watch.condition}</div>
                  <div className="text-[10px] font-mono text-gray-dim">{watch.sub}</div>
                </td>
                <td>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/5 rounded text-xs font-mono text-white mb-1">
                    {watch.thresh.includes('<') || watch.thresh.includes('>') ? <Activity size={10} className="text-accent-blue" /> : <EyeOff size={10} className="text-accent-blue" />}
                    {watch.thresh}
                  </div>
                  <div className="text-[10px] font-mono text-gray-dim">{watch.threshSub}</div>
                </td>
                <td>
                  <div className="text-xs text-white mb-0.5"><span className="text-accent-blue">{watch.last}</span> · {watch.sensor}</div>
                  <div className="text-[10px] font-mono text-gray-dim flex items-center gap-1">
                    {watch.alert ? <AlertTriangle size={10} className="text-danger-red" /> : null}
                    {watch.next}
                  </div>
                </td>
                <td>
                  <div className={`status-badge ${watch.status.toLowerCase()} ${watch.alert ? 'alert' : ''}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${watch.status === 'Active' ? 'bg-success-mint' : 'bg-warning-amber'}`}></div>
                    {watch.status} <Satellite size={10} />
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-3 text-gray">
                    <button className="hover:text-white transition-colors p-1" onClick={(e) => { e.stopPropagation(); }}>
                      {watch.status === 'Active' ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button className="hover:text-white transition-colors p-1" onClick={(e) => { e.stopPropagation(); }}>
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center text-xs font-mono text-gray-dim">
          <div className="flex gap-4">
            <span><strong className="text-white">N</strong> New Watch</span>
            <span><strong className="text-white">J K</strong> Navigate</span>
            <span><strong className="text-white">Space</strong> Preview Pass</span>
            <span><strong className="text-white">Cmd+K</strong> Filter</span>
          </div>
          <button className="flex items-center gap-2 hover:text-white transition-colors">
            <Download size={12} /> Export Rules (GeoJSON)
          </button>
        </div>

      </div>
    </div>
  );
}
