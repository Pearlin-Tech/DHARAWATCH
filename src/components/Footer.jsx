import React from 'react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand-sat">DRISHTIWATCH</span>
            <span className="brand-ai">AI</span>
            <p className="footer-tagline text-xs font-mono mt-4 text-gray">
              Next-generation natural language satellite analysis.<br/>
              Powered by advanced earth observation models.
            </p>
          </div>
          
          <div className="footer-links">
            <div className="link-group">
              <h4 className="font-mono text-xs">PRODUCT</h4>
              <a href="#">Capabilities</a>
              <a href="#">Data Sources</a>
              <a href="#">Documentation</a>
              <a href="#">Pricing</a>
            </div>
            <div className="link-group">
              <h4 className="font-mono text-xs">COMPANY</h4>
              <a href="#">About</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="link-group">
              <h4 className="font-mono text-xs">RESOURCES</h4>
              <a href="#">Blog</a>
              <a href="#">Research</a>
              <a href="#">API</a>
            </div>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="text-xs text-gray">
            &copy; {new Date().getFullYear()} DrishtiWatch AI. All rights reserved.
          </div>
          <div className="footer-legal">
            <a href="#" className="text-xs text-gray">Privacy Policy</a>
            <a href="#" className="text-xs text-gray">Terms of Service</a>
            <a href="#" className="text-xs text-gray">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
