import { h } from 'preact'
import { useEffect, useState } from 'preact/hooks'

export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
}

type Listener = (toasts: Toast[]) => void

const listeners = new Set<Listener>()
let toasts: Toast[] = []

function emit() {
  listeners.forEach(listener => listener(toasts))
}

export function pushToast(
  message: string,
  kind: ToastKind = 'info',
  durationMs = 4000
): void {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  toasts = [...toasts, { id, kind, message }]
  emit()

  window.setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    emit()
  }, durationMs)
}

export function useToastStore(): Toast[] {
  const [state, setState] = useState<Toast[]>(toasts)

  useEffect(() => {
    const listener: Listener = next => setState(next)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])

  return state
}

export function ToastContainer() {
  const items = useToastStore()
  if (items.length === 0) return null

  return (
    <div style={styles.container} aria-live="polite">
      {items.map(item => (
        <div key={item.id} style={{ ...styles.toast, ...styles[item.kind] }}>
          {item.message}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, h.JSX.CSSProperties> = {
  container: {
    position: 'absolute',
    right: '12px',
    bottom: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: 10
  },
  toast: {
    maxWidth: '280px',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '11px',
    lineHeight: 1.4,
    border: '1px solid var(--figma-color-border)',
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.12)'
  },
  info: {
    backgroundColor: 'var(--figma-color-bg)',
    color: 'var(--figma-color-text)'
  },
  success: {
    backgroundColor: 'var(--figma-color-bg-success, #D4EDDA)',
    color: 'var(--figma-color-text-success, #155724)',
    borderColor: 'var(--figma-color-bg-success, #D4EDDA)'
  },
  error: {
    backgroundColor: 'var(--figma-color-bg-danger)',
    color: 'var(--figma-color-text-danger)',
    borderColor: 'var(--figma-color-bg-danger)'
  }
}
