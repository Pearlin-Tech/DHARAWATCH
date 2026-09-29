import React from 'react';
import { Leaf, Droplets, MapPin } from 'lucide-react';
import './ProductStory.css';

export default function ProductStory() {
  const stories = [
    {
      id: 'flood',
      icon: <Droplets size={32} />,
      title: 'Flood Analysis & Hydro-Dynamics',
      desc: 'Rapidly assess flood extents, calculate affected surface area, and track water receding over time using SAR and NDWI pipelines automatically selected for you.',
      image: '/hero-map.jpg'
    },
    {
      id: 'vegetation',
      icon: <Leaf size={32} />,
      title: 'Vegetation Health & Deforestation',
      desc: 'Monitor vast forest regions for illegal logging or measure crop health variations across growing seasons using multi-temporal NDVI comparisons.',
      image: '/map-after.jpg'
    }
  ];

  return (
    <section className="product-story-section" id="use-cases">
      <div className="story-header text-center mb-16">
        <h2 className="text-3xl font-bold uppercase mb-4">Analytical Value</h2>
        <p className="text-gray max-w-2xl mx-auto text-lg">Applied intelligence across industries. From environmental monitoring to infrastructure verification.</p>
      </div>

      <div className="stories-container">
        {stories.map((story, index) => (
          <div key={story.id} className={`story-row ${index % 2 !== 0 ? 'reverse' : ''}`}>
            <div className="story-content">
              <div className="story-icon glass-panel mb-6 text-blue-accent inline-block p-4 rounded-lg">
                {story.icon}
              </div>
              <h3 className="text-2xl font-bold mb-4">{story.title}</h3>
              <p className="text-gray text-lg line-height-relaxed mb-6">{story.desc}</p>
              <div className="font-mono text-xs text-blue-accent cursor-pointer hover-white">EXPLORE USE CASE →</div>
            </div>
            <div className="story-visual">
              <div className="story-image-wrapper glass-panel p-2 rounded-xl">
                <img src={story.image} alt={story.title} className="story-img rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
