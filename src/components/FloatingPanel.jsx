import React, { useState, useRef, useEffect } from 'react';
import { X, Pin } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import './FloatingPanel.css';

export default function FloatingPanel({
  id,
  title,
  isOpen,
  isPinned,
  onClose,
  onPin,
  bringToFront,
  zIndex = 10,
  defaultPosition = { x: 24, y: 80 },
  defaultSize = { width: 320, height: 'auto' },
  children
}) {
  const [size, setSize] = useState({ 
    width: typeof defaultSize.width === 'number' ? defaultSize.width : parseInt(defaultSize.width) || 320, 
    height: typeof defaultSize.height === 'number' ? defaultSize.height : (defaultSize.height === 'auto' ? 'auto' : parseInt(defaultSize.height))
  });
  
  // Convert position to number or string (framer motion works best with numbers for drag limits)
  const leftPos = typeof defaultPosition.x === 'string' && defaultPosition.x.includes('calc') 
    ? (defaultPosition.x.includes('100%') ? window.innerWidth - parseInt(defaultPosition.x.match(/\d+/)[0]) : 24)
    : (typeof defaultPosition.x === 'number' ? defaultPosition.x : parseInt(defaultPosition.x) || 24);
    
  const topPos = typeof defaultPosition.y === 'string' && defaultPosition.y.includes('calc') 
    ? (defaultPosition.y.includes('100%') ? window.innerHeight - parseInt(defaultPosition.y.match(/\d+/)[0]) : 80)
    : (typeof defaultPosition.y === 'number' ? defaultPosition.y : parseInt(defaultPosition.y) || 80);

  const dragControls = useDragControls();
  const panelRef = useRef(null);

  if (!isOpen) return null;

  return (
    <motion.div
      ref={panelRef}
      className={`floating-panel-container ${isPinned ? 'is-pinned' : ''}`}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      onMouseDown={() => bringToFront && bringToFront(id)}
      style={{
        position: 'absolute',
        top: topPos,
        left: leftPos,
        width: size.width === 'auto' ? 'auto' : `${size.width}px`,
        height: size.height === 'auto' ? 'auto' : `${size.height}px`,
        zIndex: zIndex
      }}
    >
      <div 
        className="floating-panel-header"
        onPointerDown={(e) => dragControls.start(e)}
        style={{ cursor: 'grab' }}
      >
        <span className="floating-panel-title">{title}</span>
        <div className="floating-panel-actions">
          {onPin && (
            <button
              className={`panel-action-btn ${isPinned ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); onPin(); }}
              title={isPinned ? 'Unpin Panel' : 'Pin Panel'}
            >
              <Pin size={12} />
            </button>
          )}
          {onClose && (
            <button
              className="panel-action-btn"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="Close Panel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="floating-panel-body">
        {children}
      </div>
      
      {/* Resize Handle */}
      <div 
        className="floating-panel-resizer"
        onPointerDown={(e) => {
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const startWidth = panelRef.current.offsetWidth;
          const startHeight = panelRef.current.offsetHeight;

          const onPointerMove = (moveEvent) => {
            setSize({
              width: Math.max(250, startWidth + (moveEvent.clientX - startX)),
              height: Math.max(150, startHeight + (moveEvent.clientY - startY))
            });
          };

          const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
          };

          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
        }}
      />
    </motion.div>
  );
}
