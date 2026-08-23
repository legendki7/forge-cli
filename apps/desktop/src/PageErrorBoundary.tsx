import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  pageName: string;
  onLeave(): void;
}

interface State {
  failed: boolean;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="page-error" role="alert">
        <h1>{this.props.pageName} could not open</h1>
        <p>The rest of ForgeKi is still available. Return home and try opening this page again.</p>
        <button onClick={this.props.onLeave}>Return home</button>
      </section>
    );
  }
}
