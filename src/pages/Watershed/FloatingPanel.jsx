import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Minus, Maximize2, GripHorizontal, Pin } from 'lucide-react';
import './FloatingPanel.css';

export default function FloatingPanel({ 
  id,
  title, 
  icon, 
  defaultPosition, 
  defaultSize, 
  minSize = { width: 280, height: 150 },
  onClose, 
  zIndex, 
  bringToFront,
  children,
  badge
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const panelRef = useRef(null);

  // Resize state
  const [size, setSize] = useState(defaultSize || { width: 320, height: 'auto' });

  const handlePointerDown = () => {
    if (bringToFront) bringToFront(id);
  };

  const handleResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelRef.current.offsetWidth;
    const startHeight = panelRef.current.offsetHeight;

    const onMouseMove = (moveEvent) => {
      let newWidth = startWidth + (moveEvent.clientX - startX);
      let newHeight = startHeight + (moveEvent.clientY - startY);
      
      newWidth = Math.max(minSize.width, newWidth);
      newHeight = Math.max(minSize.height, newHeight);
      
      // Limit to viewport max bounds
      newWidth = Math.min(window.innerWidth - 48, newWidth);
      newHeight = Math.min(window.innerHeight - 48, newHeight);

      setSize({ width: newWidth, height: newHeight });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <motion.div
      ref={panelRef}
      id={`ws-panel-${id}`}
      className={`ws-panel glass-panel pointer-events-auto ${isMinimized ? 'minimized' : ''} ${isPinned ? 'pinned' : ''}`}
      initial={defaultPosition}
      animate={{ width: size.width, height: isMinimized ? 48 : size.height }}
      drag={!isPinned}
      dragMomentum={false}
      dragConstraints={{ left: 0, top: 0, right: window.innerWidth - 100, bottom: window.innerHeight - 100 }}
      onPointerDown={handlePointerDown}
      style={{ 
        position: 'absolute', 
        zIndex: zIndex || 10,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div className="ws-panel-header drag-handle" onDoubleClick={() => setIsMinimized(!isMinimized)}>
        <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
          {icon && <span className="text-gray">{icon}</span>}
          <span className="font-bold tracking-wider text-sm truncate uppercase">{title}</span>
          {badge && <span className="badge ml-2">{badge}</span>}
        </div>
        <div className="ws-panel-controls flex items-center gap-2 text-gray">
          <button onClick={() => setIsPinned(!isPinned)} className={`panel-btn ${isPinned ? 'text-accent-blue' : 'hover:text-white'}`}>
            <Pin size={12} />
          </button>
          <button onClick={() => setIsMinimized(!isMinimized)} className="panel-btn hover:text-white">
            <Minus size={14} />
          </button>
          <button onClick={onClose} className="panel-btn hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div className="ws-panel-content flex-1 overflow-auto">
            {children}
          </div>
          
          {/* Resize Handle */}
          <div 
            className="ws-resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-end justify-end p-1 opacity-20 hover:opacity-100"
            onPointerDown={handleResize}
          >
            <div className="w-2 h-2 border-r border-b border-white"></div>
          </div>
        </>
      )}
    </motion.div>
  );
}
