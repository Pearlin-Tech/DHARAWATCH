import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, Download, ArrowRight, ShieldCheck, MapPin } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import './Reports.css';

export default function Reports() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('All');
  
  const filters = [
    { name: 'All Reports', count: 24, id: 'All' },
    { name: 'Hydrology', count: 8, id: 'Hydrology' },
    { name: 'Forestry', count: 5, id: 'Forestry' },
    { name: 'Infrastructure', count: 6, id: 'Infrastructure' },
    { name: 'Cryosphere', count: 3, id: 'Cryosphere' }
  ];

  const reports = [
    {
      id: '#EV-8841-B',
      title: 'Camargue Estuary Delta',
      desc: 'Turbidity baseline deviation · Rhone Marine Outlet',
      location: 'Camargue Estuary',
      coords: '43°32\'N 04°30\'E',
      sensor: 'SENTINEL-2 MSI',
      date: '18 Aug 2024',
      time: '10:42 UTC (+4h ago)',
      status: 'AFFIRMATIVE ANOMALY',
      statusClass: 'affirmative',
      finding: 'Plume extent +34.2 km²'
    },
    {
      id: '#EV-7729-A',
      title: 'Madre de Dios Canopy',
      desc: 'Rapid clearcut expansion along river tributary',
      location: 'Madre de Dios Basin',
      coords: '12°35\'S 69°11\'W',
      sensor: 'SENTINEL-1 SAR',
      date: '14 Aug 2024',
      time: '14:15 UTC (4d ago)',
      status: 'CRITICAL ALERT',
      statusClass: 'alert',
      finding: '412 hectares canopy loss'
    },
    {
      id: '#EV-6512-C',
      title: 'Rhone Valley Agriculture',
      desc: 'Surface moisture and NDWI stress multi-band scan',
      location: 'Rhone Basin Agricultural Zone',
      coords: '44°10\'N 04°45\'E',
      sensor: 'LANDSAT-9',
      date: '02 Aug 2024',
      time: '09:30 UTC (16d ago)',
      status: 'VERIFIED DEFICIT',
      statusClass: 'alert',
      finding: 'NDWI -0.22 (Severe stress)'
    },
    {
      id: '#EV-5904-F',
      title: 'Pine Island Glacier Shelf',
      desc: 'Interferometric SAR displacement & fracture track',
      location: 'Amundsen Sea Sector',
      coords: '75°10\'S 100°00\'W',
      sensor: 'SENTINEL-1 SAR',
      date: '28 Jul 2024',
      time: '18:20 UTC (21d ago)',
      status: 'STRUCTURAL ADVANCE',
      statusClass: 'advance',
      finding: 'Rift propagation +1.2km'
    },
    {
      id: '#EV-4210-D',
      title: 'Rotterdam Outer Harbor',
      desc: '0.3m optical vessel classification & dwell survey',
      location: 'Rotterdam Port Maasvlakte',
      coords: '51°57\'N 04°05\'E',
      sensor: 'WORLDVIEW-3',
      date: '20 Jul 2024',
      time: '11:05 UTC (29d ago)',
      status: 'NOMINAL RANGE',
      statusClass: 'nominal',
      finding: 'Vessel queue at 38 ships'
    }
  ];

  const handleRowClick = (id) => {
    navigate(`/reports/${id.replace('#', '').toLowerCase()}`);
  };

  return (
    <div className="reports-container">
      <AppNavigation />
      
      <div className="reports-main-content">
        <div className="text-[10px] font-mono text-accent-blue uppercase tracking-widest flex items-center gap-2 mb-4">
          ANALYSIS DOSSIERS & AUDIT LOGS <span className="text-gray-dim">· IMMUTABLE ARCHIVE</span>
        </div>
        
        <div className="reports-header">
          <h1 className="reports-header-title">Reports</h1>
          <p className="reports-header-sub max-w-2xl">
            Browse, filter, and review verified multi-spectral analyses, orbital detections, and baseline differentials.
          </p>
        </div>

        <div className="reports-top-bar">
          <div className="reports-search-box">
            <Search size={18} className="search-icon" />
            <input type="text" placeholder="Search reports by name, coordinate, sensor, or AOI... (Cmd+K)" />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex gap-1">
              <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-gray font-mono flex items-center justify-center">⌘</span>
              <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[10px] text-gray font-mono flex items-center justify-center">K</span>
            </div>
          </div>
          
          <div className="flex gap-4">
            <button className="flex items-center gap-2 text-xs font-mono text-gray-dim uppercase bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg transition-colors">
              Sort: Newest First <ChevronDown size={14} />
            </button>
            <button className="flex items-center gap-2 text-xs font-mono text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg transition-colors">
              <Download size={14} /> CSV
            </button>
            <button className="flex items-center gap-2 text-xs font-mono text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg transition-colors">
              {`{ }`} JSON
            </button>
          </div>
        </div>

        <div className="reports-filter-row">
          {filters.map(f => (
            <button 
              key={f.id}
              className={`filter-chip ${activeFilter === f.id ? 'active' : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.name} <span className="bg-black/20 px-1.5 py-0.5 rounded">{f.count}</span>
            </button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-2"></div>
          <button className="filter-chip alerts">
            <div className="w-1.5 h-1.5 bg-danger-red rounded-full"></div> Alerts Only <span className="bg-danger-red/20 text-danger-red px-1.5 py-0.5 rounded">4</span>
          </button>
        </div>

        <div className="reports-list">
          <div className="reports-list-header">
            <div>Report Title & Dossier</div>
            <div>Target AOI & Constellation</div>
            <div>Acquisition UTC</div>
            <div>Verified Findings</div>
            <div className="text-right">Actions</div>
          </div>
          
          {reports.map((report) => (
            <div 
              key={report.id} 
              className="report-row"
              onClick={() => handleRowClick(report.id)}
            >
              <div className="report-title-cell">
                <span className="report-id">{report.id}</span>
                <h3>{report.title}</h3>
                <p>{report.desc}</p>
              </div>
              
              <div className="report-target-cell">
                <div className="location-name"><MapPin size={12} className="text-gray" /> {report.location}</div>
                <div className="coords-sensor">{report.coords} · <span className="text-accent-blue bg-accent-blue/10 px-1 py-0.5 rounded">{report.sensor}</span></div>
              </div>
              
              <div className="report-acq-cell">
                <div className="date">{report.date}</div>
                <div className="time">{report.time}</div>
              </div>
              
              <div className="report-status-cell">
                <div className={`status-badge ${report.statusClass}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${report.statusClass === 'affirmative' ? 'bg-success-mint' : report.statusClass === 'alert' ? 'bg-danger-red' : report.statusClass === 'advance' ? 'bg-accent-blue' : 'bg-gray'}`}></div>
                  {report.status}
                </div>
                <div className="finding-text font-bold">{report.finding}</div>
              </div>
              
              <div className="report-actions-cell">
                <button onClick={(e) => { e.stopPropagation(); }}><Download size={16} /></button>
                <button onClick={(e) => { e.stopPropagation(); handleRowClick(report.id); }}><ArrowRight size={16} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="reports-footer">
          <div className="flex items-center gap-4">
            <span>Showing <strong>5</strong> of <strong>24</strong> verified reports</span>
            <span className="flex items-center gap-2 text-success-mint"><ShieldCheck size={14} /> 100% Cryptographically Verified</span>
          </div>
          <div className="reports-footer-actions">
            <button>J</button>
            <button>K</button>
            <span className="mx-2 flex items-center">Navigate</span>
            <button>Enter</button>
            <span className="mx-2 flex items-center">Open Report</span>
            <button>⌘</button>
            <button>E</button>
            <span className="mx-2 flex items-center">Export All</span>
          </div>
        </div>

      </div>
    </div>
  );
}
