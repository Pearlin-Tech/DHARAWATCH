import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand-sat">DHARAWATCH</span>
            <p className="footer-tagline text-xs font-mono mt-4 text-gray">
              AI-powered watershed intelligence.<br/>
              Satellite analysis, field evidence and temporal understanding.
            </p>
          </div>
          
          <div className="footer-links">
            <div className="link-group">
              <h4 className="font-mono text-xs">PRODUCT</h4>
              <Link to="/explore">Explore</Link>
              <Link to="/watershed">Watershed</Link>
              <Link to="/field">Field</Link>
              <Link to="/evidence-review">Evidence Review</Link>
            </div>
            <div className="link-group">
              <h4 className="font-mono text-xs">WORKSPACE</h4>
              <Link to="/ask">Ask</Link>
              <Link to="/compare">Compare</Link>
              <Link to="/evidence">Evidence</Link>
              <Link to="/settings">Settings</Link>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="text-xs text-gray">
            &copy; {new Date().getFullYear()} DHARAWATCH. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
