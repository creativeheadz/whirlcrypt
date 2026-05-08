import React, { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastProps {
  toast: ToastMessage
  onClose: (id: string) => void
}

const stripClass: Record<ToastType, string> = {
  success: 'strip strip-success',
  error:   'strip strip-error',
  warning: 'strip strip-warn',
  info:    'strip strip-info',
}

const iconColor: Record<ToastType, string> = {
  success: 'var(--green)',
  error:   'var(--red)',
  warning: 'var(--amber)',
  info:    'var(--blue)',
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => handleClose(), toast.duration || 5000)
      return () => clearTimeout(timer)
    }
  }, [toast.duration])

  const handleClose = () => {
    setIsLeaving(true)
    setTimeout(() => onClose(toast.id), 240)
  }

  const Icon =
    toast.type === 'success' ? CheckCircle2 :
    toast.type === 'error'   ? AlertCircle :
    toast.type === 'warning' ? AlertTriangle :
                                Info

  return (
    <div
      className="mb-2"
      style={{
        transform: isVisible && !isLeaving ? 'translateX(0)' : 'translateX(110%)',
        opacity: isVisible && !isLeaving ? 1 : 0,
        transition: 'transform 240ms ease, opacity 240ms ease',
      }}
    >
      <div className={stripClass[toast.type]}>
        <Icon
          className="h-4 w-4 flex-shrink-0"
          style={{ marginTop: 2, color: iconColor[toast.type] }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="font-display italic text-ink"
            style={{ fontSize: 15, lineHeight: 1.25 }}
          >
            {toast.title}
          </div>
          {toast.message && (
            <div className="text-ink-soft mt-1" style={{ fontSize: 12, lineHeight: 1.5 }}>
              {toast.message}
            </div>
          )}
        </div>
        <button
          onClick={handleClose}
          aria-label="Dismiss"
          className="text-ink-faint hover:text-ember transition-colors flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default Toast
