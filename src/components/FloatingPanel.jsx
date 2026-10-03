import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { X, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { motion, useDragControls, useMotionValue } from 'framer-motion';
import './FloatingPanel.css';

const INTERACTIVE = 'button, a, input, select, textarea, label, [role="slider"], [data-no-drag]';
const MARGIN = 8;

/**
 * Reusable floating panel: DRAG (header only) · SCROLL (body) · COLLAPSE · EXPAND · CLOSE · RESIZE.
 * Stays inside the viewport while dragging, expanding, resizing and on window resize.
 *
 * position: { left | right, top | bottom } in px from the viewport edges.
 */
export default function FloatingPanel({
  id,
  title,
  subtitle,
  status,
  headerActions,
  isOpen,
  onClose,
  bringToFront,
  zIndex = 10,
  position = { left: 24, top: 80 },
  width = 320,
  maxHeight,
  expandedWidth = 760,
  defaultMode = 'normal',
  mode: controlledMode,
  onModeChange,
  className = '',
  children
}) {
  const [innerMode, setInnerMode] = useState(defaultMode);
  const mode = controlledMode ?? innerMode;
  const setMode = useCallback((m) => { setInnerMode(m); onModeChange?.(m); }, [onModeChange]);
  const [size, setSize] = useState(null); // user-resized { width, height }
  const dragControls = useDragControls();
  const panelRef = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // initial placement from the requested edges
  const [origin] = useState(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = position.left ?? Math.max(MARGIN, vw - (position.right ?? 24) - width);
    const top = position.top ?? Math.max(MARGIN, vh - (position.bottom ?? 24) - 200);
    return { left, top };
  });

  /** Pull the panel back inside the viewport (after expand / resize / window resize). */
  const clamp = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let dx = 0, dy = 0;
    if (r.right > vw - MARGIN) dx = vw - MARGIN - r.right;
    if (r.left + dx < MARGIN) dx = MARGIN - r.left;
    if (r.bottom > vh - MARGIN) dy = vh - MARGIN - r.bottom;
    if (r.top + dy < MARGIN) dy = MARGIN - r.top;
    if (dx) x.set(x.get() + dx);
    if (dy) y.set(y.get() + dy);
  }, [x, y]);

  useLayoutEffect(() => { if (isOpen) clamp(); }, [mode, size, isOpen, clamp]);
  useEffect(() => {
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [clamp]);

  if (!isOpen) return null;

  const expanded = mode === 'expanded';
  const collapsed = mode === 'collapsed';
  const w = expanded ? Math.min(expandedWidth, window.innerWidth - 120) : (size?.width ?? width);
  const style = {
    position: 'absolute',
    top: origin.top,
    left: origin.left,
    width: w,
    height: collapsed ? 'auto' : (expanded ? undefined : size?.height),
    maxHeight: collapsed ? undefined : (expanded ? 'calc(100vh - 96px)' : (maxHeight ?? 'calc(100vh - 120px)')),
    zIndex,
    x, y
  };

  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE)) return; // never drag from controls
    dragControls.start(e);
  };

  return (
    <motion.div
      ref={panelRef}
      data-panel-id={id}
      className={`floating-panel-container ${collapsed ? 'is-collapsed' : ''} ${expanded ? 'is-expanded' : ''} ${className}`}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      onDragEnd={clamp}
      onPointerDownCapture={() => bringToFront?.(id)}
      style={style}
    >
      <div className="floating-panel-header" onPointerDown={startDrag} onDoubleClick={(e) => { if (!e.target.closest(INTERACTIVE)) setMode(expanded ? 'normal' : 'expanded'); }}>
        <div className="floating-panel-titles">
          <span className="floating-panel-title">{title}</span>
          {subtitle && <span className="floating-panel-subtitle">{subtitle}</span>}
        </div>
        {status && <div className="floating-panel-status">{status}</div>}
        <div className="floating-panel-actions">
          {headerActions}
          <button className="panel-action-btn" title={collapsed ? 'Expand panel body' : 'Collapse'} aria-label={collapsed ? 'Show panel' : 'Collapse panel'}
            onClick={() => setMode(collapsed ? 'normal' : 'collapsed')}>
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          <button className="panel-action-btn" title={expanded ? 'Restore size' : 'Expand'} aria-label={expanded ? 'Restore panel' : 'Expand panel'}
            onClick={() => setMode(expanded ? 'normal' : 'expanded')}>
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {onClose && (
            <button className="panel-action-btn" title="Close" aria-label="Close panel" onClick={onClose}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {!collapsed && <div className="floating-panel-body">{children}</div>}

      {!collapsed && !expanded && (
        <div
          className="floating-panel-resizer"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX, startY = e.clientY;
            const startW = panelRef.current.offsetWidth, startH = panelRef.current.offsetHeight;
            const move = (m) => setSize({
              width: Math.max(250, Math.min(window.innerWidth - 100, startW + (m.clientX - startX))),
              height: Math.max(140, Math.min(window.innerHeight - 40, startH + (m.clientY - startY)))
            });
            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }}
        />
      )}
    </motion.div>
  );
}
