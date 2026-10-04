import React from 'react';
import { MessageSquare, Map, SplitSquareHorizontal, Ruler, Hexagon, Activity } from 'lucide-react';
import './ProductCapabilities.css';

export default function ProductCapabilities() {
  const capabilities = [
    {
      id: 'ask',
      icon: <MessageSquare size={24} />,
      title: 'ASK',
      desc: 'Ask questions about a watershed using natural language.',
      colSpan: 2
    },
    {
      id: 'watershed',
      icon: <Map size={24} />,
      title: 'WATERSHED',
      desc: 'Explore watershed boundaries, micro-watersheds, drainage and environmental layers.',
      colSpan: 1
    },
    {
      id: 'field',
      icon: <SplitSquareHorizontal size={24} />,
      title: 'FIELD',
      desc: 'Connect geo-tagged ground observations with satellite context.',
      colSpan: 1
    },
    {
      id: 'evidence-review',
      icon: <Ruler size={24} />,
      title: 'EVIDENCE REVIEW',
      desc: 'Review field evidence, satellite change and terrain context for each watershed intervention.',
      colSpan: 1
    },
    {
      id: 'compare',
      icon: <Hexagon size={24} />,
      title: 'COMPARE',
      desc: 'Compare watershed conditions across time.',
      colSpan: 1
    },
    {
      id: 'evidence',
      icon: <Activity size={24} />,
      title: 'EVIDENCE',
      desc: 'Trace observations and analytical results back to their sources.',
      colSpan: 1
    },
    {
      id: 'monitor',
      icon: <Activity size={24} />,
      title: 'MONITOR',
      desc: 'Track watershed conditions and surface change over time.',
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
