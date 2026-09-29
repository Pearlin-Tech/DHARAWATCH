import React from 'react';
import { MessageSquare, Map, SplitSquareHorizontal, Ruler, Hexagon, Activity } from 'lucide-react';
import './ProductCapabilities.css';

export default function ProductCapabilities() {
  const capabilities = [
    {
      id: 'ask',
      icon: <MessageSquare size={24} />,
      title: 'ASK',
      desc: 'Query satellite imagery using natural language. Get immediate analytical responses.',
      colSpan: 2
    },
    {
      id: 'detect',
      icon: <Map size={24} />,
      title: 'DETECT',
      desc: 'Identify changes, anomalies, and specific features across multiple temporal passes.',
      colSpan: 1
    },
    {
      id: 'compare',
      icon: <SplitSquareHorizontal size={24} />,
      title: 'COMPARE',
      desc: 'Visually and analytically compare regions across time with sub-meter precision.',
      colSpan: 1
    },
    {
      id: 'measure',
      icon: <Ruler size={24} />,
      title: 'MEASURE',
      desc: 'Calculate area, distance, and volumetric changes directly on the map interface.',
      colSpan: 1
    },
    {
      id: 'area',
      icon: <Hexagon size={24} />,
      title: 'AREA',
      desc: 'Create custom geofenced regions using conversational boundary definitions.',
      colSpan: 1
    },
    {
      id: 'watch',
      icon: <Activity size={24} />,
      title: 'WATCH',
      desc: 'Set up active monitoring alerts for specific regions based on custom criteria.',
      colSpan: 2
    }
  ];

  return (
    <section className="capabilities-section" id="capabilities">
      <div className="capabilities-header mb-16">
        <h2 className="text-3xl font-bold uppercase mb-4">Core Capabilities</h2>
        <p className="text-gray max-w-2xl text-lg">A comprehensive suite of analytical tools designed to extract intelligence from earth observation data.</p>
      </div>

      <div className="capabilities-grid">
        {capabilities.map(cap => (
          <div key={cap.id} className={`capability-card glass-panel col-span-${cap.colSpan}`}>
            <div className="cap-icon-wrapper mb-6 text-blue-accent">
              {cap.icon}
            </div>
            <h3 className="text-xl font-bold mb-3">{cap.title}</h3>
            <p className="text-gray text-sm line-height-relaxed">{cap.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
