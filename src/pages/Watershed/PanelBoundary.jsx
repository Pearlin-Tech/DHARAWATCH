import React from 'react';

/** Contains a render error to one panel and shows it, instead of blanking the whole page. */
export default class PanelBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error(`[Watershed] panel "${this.props.name}" failed:`, error, info?.componentStack); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ws-state error">
        PANEL ERROR — {this.props.name}: {String(this.state.error.message || this.state.error)}
        <button className="ws-mini-btn" onClick={() => this.setState({ error: null })}>RETRY</button>
      </div>
    );
  }
}
