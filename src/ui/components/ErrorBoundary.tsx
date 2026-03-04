import { Component, h, type ComponentChildren } from 'preact'

interface ErrorBoundaryState {
  hasError: boolean
}

interface ErrorBoundaryProps {
  children: ComponentChildren
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  componentDidCatch(err: unknown) {
    console.error('[ErrorBoundary]', err)
    this.setState({ hasError: true })
  }

  private handleReload = () => {
    try {
      parent.postMessage({ pluginMessage: { type: 'RELOAD' } }, '*')
    } catch {
      // ignore
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={styles.container}>
        <div style={styles.title}>Something went wrong.</div>
        <div style={styles.subtitle}>Please restart the plugin.</div>
        <button style={styles.button} onClick={this.handleReload}>
          Reload
        </button>
      </div>
    )
  }
}

const styles: Record<string, h.JSX.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    textAlign: 'center',
    gap: '8px',
    backgroundColor: 'var(--figma-color-bg)'
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--figma-color-text)'
  },
  subtitle: {
    fontSize: '12px',
    color: 'var(--figma-color-text-secondary)'
  },
  button: {
    marginTop: '8px',
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    fontSize: '12px',
    cursor: 'pointer'
  }
}
