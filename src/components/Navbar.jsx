import React, { useState, useEffect } from 'react';
import { User, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import './Navbar.css';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`navbar ${isScrolled ? 'scrolled glass-panel' : ''}`}>
      <div className="navbar-container">
        <div className="navbar-brand">
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '2px', fontSize: '1.25rem' }}>DRISHTI</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 300, color: '#9ca3af', letterSpacing: '4px', fontSize: '1.25rem', marginLeft: '4px' }}>WATCH</span>
            <span className="brand-ai" style={{ marginLeft: '12px' }}>AI</span>
          </Link>
        </div>
        
        <div className="navbar-center hide-mobile">
          <Link to="/explore" className="nav-link">Explore</Link>
          <Link to="/ask" className="nav-link">Ask</Link>
          <Link to="/compare" className="nav-link">Compare</Link>
          <Link to="/watch" className="nav-link">Watch</Link>
        </div>
        
        <div className="navbar-right hide-mobile">
          <Link to="/explore" className="btn-secondary" style={{ textDecoration: 'none' }}>Open Analyst</Link>
          <button className="profile-btn">
            <User size={20} />
          </button>
        </div>

        <button 
          className="mobile-menu-btn hide-desktop"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-menu glass-panel">
          <Link to="/explore" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>Explore</Link>
          <Link to="/ask" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>Ask</Link>
          <Link to="/compare" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>Compare</Link>
          <Link to="/watch" className="nav-link" onClick={() => setIsMobileMenuOpen(false)}>Watch</Link>
          <Link to="/explore" className="btn-secondary mt-4" style={{ textDecoration: 'none', textAlign: 'center' }} onClick={() => setIsMobileMenuOpen(false)}>Open Analyst</Link>
        </div>
      )}
    </nav>
  );
}
