import React from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import ImageToAnswer from '../components/ImageToAnswer';
import BuiltForAccuracy from '../components/BuiltForAccuracy';
import WorkspaceShowcase from '../components/WorkspaceShowcase';
import ProductCapabilities from '../components/ProductCapabilities';
import ProductStory from '../components/ProductStory';
import Evidence from '../components/Evidence';
import Cta from '../components/Cta';
import Footer from '../components/Footer';

function Home() {
  return (
    <div className="app-container">
      <Navbar />
      <main>
        <Hero />
        <ImageToAnswer />
        <BuiltForAccuracy />
        <WorkspaceShowcase />
        <ProductCapabilities />
        <ProductStory />
        <Evidence />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

export default Home;
