import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Search, Target, Database, Activity, Map as MapIcon } from 'lucide-react';
import AppNavigation from '../../components/AppNavigation';
import MapViewport from '../../components/MapViewport';
import './Watch.css';

export default function WatchNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mapInstance, setMapInstance] = useState(null);
  const [step, setStep] = useState(1); // 1: Condition, 2: Threshold, 3: Dataset, 4: Frequency, 5: Review
  
  // Passed area/geometry context if available
  const initialCoords = location.state?.coords || { lng: -69.19, lat: -12.58 }; // Madre de Dios basin default

  const [watchConfig, setWatchConfig] = useState({
    condition: '',
    threshold: '',
    dataset: 'Sentinel-2',
    frequency: 'Weekly'
  });

  const conditions = [
    { id: 'deforestation', label: 'Deforestation', desc: 'Canopy loss & logging roads', icon: Target },
    { id: 'flood', label: 'Flood Expansion', desc: 'Surface water changes', icon: Activity },
    { id: 'construction', label: 'New Construction', desc: 'Urban sprawl & concrete', icon: Target },
    { id: 'vegetation', label: 'Vegetation Decline', desc: 'Crop stress & drought', icon: Activity },
  ];

  const datasets = [
    { id: 'Sentinel-2', label: 'Sentinel-2 MSI', desc: '10m Optical & NIR', rec: true },
    { id: 'Sentinel-1', label: 'Sentinel-1 SAR', desc: '10m Radar (All-weather)', rec: false },
    { id: 'Landsat-9', label: 'Landsat 9', desc: '30m Optical & Thermal', rec: false },
  ];

  const updateConfig = (key, val) => {
    setWatchConfig(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="watch-container">
      <AppNavigation />
      
      <div className="watch-new-layout">
        {/* MAP PREVIEW AREA */}
        <div className="watch-map-area">
          <div className="absolute top-6 left-6 z-20">
            <button 
              className="flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 rounded-lg text-xs font-mono text-white transition-colors"
              onClick={() => navigate('/watch')}
            >
              <ArrowLeft size={14} /> CANCEL CREATION
            </button>
          </div>

          <MapViewport 
            center={[initialCoords.lng, initialCoords.lat]} 
            zoom={12}
            onMapLoad={setMapInstance}
          />
          
          <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
            {/* Simple AOI indicator */}
            <div className="w-64 h-64 border-2 border-dashed border-accent-blue/50 bg-accent-blue/10 flex items-center justify-center relative">
               <div className="absolute -top-6 left-0 text-[10px] font-mono text-accent-blue uppercase bg-black/60 px-1 rounded">Target AOI</div>
               <div className="w-2 h-2 rounded-full bg-accent-blue"></div>
            </div>
          </div>
        </div>

        {/* CREATION PANEL */}
        <div className="watch-form-panel">
          <div className="p-6 border-b border-white/5 bg-black/40">
            <h2 className="text-xl font-bold text-white mb-2">Create New Watch</h2>
            
            {/* Step Progress */}
            <div className="flex justify-between mt-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`flex-1 h-1 rounded-full mx-0.5 ${i <= step ? 'bg-accent-blue' : 'bg-white/10'}`}></div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {step === 1 && (
              <div className="form-step">
                <div className="step-header">STEP 1 / 5</div>
                <h3 className="text-lg font-medium text-white mb-6">What should we watch for?</h3>
                
                <div className="mb-6">
                  <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-3 rounded-lg mb-4">
                    <Search size={16} className="text-gray" />
                    <input 
                      type="text" 
                      placeholder="Describe naturally... (e.g., Water expands)" 
                      className="bg-transparent border-none text-white text-sm outline-none flex-1"
                    />
                  </div>
                  
                  <div className="text-[10px] font-mono text-gray-dim uppercase mb-3">Or choose a preset</div>
                  <div className="grid grid-cols-1 gap-3">
                    {conditions.map(c => (
                      <div 
                        key={c.id} 
                        className={`form-card ${watchConfig.condition === c.label ? 'selected' : ''}`}
                        onClick={() => updateConfig('condition', c.label)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${watchConfig.condition === c.label ? 'bg-accent-blue/20 text-accent-blue' : 'bg-white/5 text-gray'}`}>
                            <c.icon size={16} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{c.label}</div>
                            <div className="text-xs text-gray-dim">{c.desc}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="form-step">
                <div className="step-header">STEP 2 / 5</div>
                <h3 className="text-lg font-medium text-white mb-6">Define the trigger threshold</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono text-gray-dim uppercase mb-2">Metric</label>
                    <select className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none">
                      <option>Area (km²)</option>
                      <option>NDVI Index</option>
                      <option>Percentage Change (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-gray-dim uppercase mb-2">Condition</label>
                    <select className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none">
                      <option>Increases by more than</option>
                      <option>Decreases by more than</option>
                      <option>Drops below</option>
                      <option>Exceeds</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-gray-dim uppercase mb-2">Value</label>
                    <input 
                      type="number" 
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none"
                      placeholder="e.g., 10"
                      value={watchConfig.threshold}
                      onChange={(e) => updateConfig('threshold', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="form-step">
                <div className="step-header">STEP 3 / 5</div>
                <h3 className="text-lg font-medium text-white mb-6">Select imagery source</h3>
                
                <div className="grid grid-cols-1 gap-3">
                  {datasets.map(d => (
                    <div 
                      key={d.id} 
                      className={`form-card ${watchConfig.dataset === d.id ? 'selected' : ''}`}
                      onClick={() => updateConfig('dataset', d.id)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{d.label}</span>
                            {d.rec && <span className="text-[10px] font-mono bg-accent-blue/20 text-accent-blue px-1.5 rounded">RECOMMENDED</span>}
                          </div>
                          <div className="text-xs text-gray-dim mt-1">{d.desc}</div>
                        </div>
                        {watchConfig.dataset === d.id && <CheckCircle2 size={16} className="text-accent-blue" />}
                      </div>
                    </div>
                  ))}
                  
                  <div className="mt-4 p-4 bg-black/40 border border-white/5 rounded-lg flex items-start gap-3">
                    <Database size={16} className="text-gray shrink-0 mt-0.5" />
                    <p className="text-xs text-gray leading-relaxed">
                      Based on your selection of "{watchConfig.condition || 'Custom'}", Sentinel-2 provides the best spectral resolution for this analysis.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="form-step">
                <div className="step-header">STEP 4 / 5</div>
                <h3 className="text-lg font-medium text-white mb-6">Monitoring Frequency</h3>
                
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {['Daily', 'Every 3 days', 'Weekly', 'Every 2 weeks', 'Monthly'].map(f => (
                    <div 
                      key={f}
                      className={`form-card text-center ${watchConfig.frequency === f ? 'selected' : ''}`}
                      onClick={() => updateConfig('frequency', f)}
                    >
                      <div className="text-sm font-medium text-white">{f}</div>
                    </div>
                  ))}
                </div>
                
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Estimated Schedule</div>
                  <div className="text-sm text-white">Next check: <span className="text-accent-blue font-medium">Tomorrow 10:30 UTC</span></div>
                  <div className="text-xs text-gray-dim mt-1">Cost estimate: Standard Tier</div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="form-step">
                <div className="step-header">STEP 5 / 5</div>
                <h3 className="text-lg font-medium text-white mb-6">Review & Confirm</h3>
                
                <div className="space-y-4">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                    <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Location</div>
                    <div className="text-sm text-white flex items-center gap-2">
                      <MapIcon size={14} className="text-gray" /> Target AOI (240 km²)
                    </div>
                  </div>
                  
                  <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                    <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Watch Rule</div>
                    <div className="text-sm font-medium text-white">{watchConfig.condition || 'Custom Rule'}</div>
                    <div className="text-xs text-gray-dim mt-1">Alert when: {watchConfig.threshold ? `Increases by > ${watchConfig.threshold}` : 'Condition met'}</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                      <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Source</div>
                      <div className="text-sm text-white">{watchConfig.dataset}</div>
                    </div>
                    <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
                      <div className="text-[10px] font-mono text-gray-dim uppercase mb-1">Frequency</div>
                      <div className="text-sm text-white">{watchConfig.frequency}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="p-6 border-t border-white/5 flex gap-3 bg-black/40">
            {step > 1 && (
              <button 
                className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium text-white transition-colors"
                onClick={() => setStep(s => s - 1)}
              >
                Back
              </button>
            )}
            
            {step < 5 ? (
              <button 
                className="flex-1 py-3 bg-accent-blue hover:bg-blue-600 rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                onClick={() => setStep(s => s + 1)}
              >
                Continue <ChevronRight size={16} />
              </button>
            ) : (
              <button 
                className="flex-1 py-3 bg-success-mint hover:bg-green-500 rounded-lg text-sm font-bold text-black transition-colors flex items-center justify-center gap-2"
                onClick={() => navigate('/watch/wt-01')}
              >
                <Check size={16} /> CREATE WATCH
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
