import React from 'react';
import { Leaf, Droplets, MapPin } from 'lucide-react';
import './ProductStory.css';

export default function ProductStory() {
  const stories = [
    {
      id: 'water-dynamics',
      icon: <Droplets size={32} />,
      title: 'Water Dynamics',
      desc: 'Track water extent and seasonal variation across rivers, ponds, reservoirs and other water bodies.',
      image: '/hero-map.jpg'
    },
    {
      id: 'vegetation-change',
      icon: <Leaf size={32} />,
      title: 'Vegetation Change',
      desc: 'Measure vegetation condition and temporal spectral change across the watershed.',
      image: '/map-after.jpg'
    },
    {
      id: 'land-intervention',
      icon: <MapPin size={32} />,
      title: 'Land & Intervention Impact',
      desc: 'Relate land-cover change to mapped watershed interventions and field evidence.',
      image: '/map-before.jpg'
    },
    {
      id: 'field-evidence',
      icon: <MapPin size={32} />,
      title: 'Field Evidence',
      desc: 'Connect geo-tagged ground observations to satellite context.',
      image: '/field-photo.jpg'
    }
  ];

  return (
    <section className="product-story-section" id="use-cases">
      <div className="story-header text-center mb-16">
        <h2 className="text-3xl font-bold uppercase mb-4">Analytical Value</h2>
        <p className="text-gray max-w-2xl mx-auto text-lg">WATERSHED INTELLIGENCE.</p>
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
