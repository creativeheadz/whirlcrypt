import React, { createContext, useContext, useState, ReactNode } from 'react'
import { ToastMessage, ToastType } from '../components/Toast'
import ToastContainer from '../components/ToastContainer'

interface ToastContextType {
  showToast: (type: ToastType, title: string, message?: string, duration?: number) => void
  showSuccess: (title: string, message?: string, duration?: number) => void
  showError: (title: string, message?: string, duration?: number) => void
  showWarning: (title: string, message?: string, duration?: number) => void
  showInfo: (title: string, message?: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: ReactNode
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = (type: ToastType, title: string, message?: string, duration?: number) => {
    setToasts(prev => {
      // Deduplicate: skip if same title+message already showing
      if (prev.some(t => t.title === title && t.message === message)) return prev

      const id = crypto.getRandomValues(new Uint8Array(6))
        .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')
      const toast: ToastMessage = {
        id,
        type,
        title,
        message,
        // Default: 8s for errors, 5s for everything else
        duration: duration ?? (type === 'error' ? 8000 : 5000)
      }

      // Cap at 5 toasts max
      const updated = [...prev, toast]
      return updated.length > 5 ? updated.slice(-5) : updated
    })
  }

  const showSuccess = (title: string, message?: string, duration?: number) => {
    showToast('success', title, message, duration)
  }

  const showError = (title: string, message?: string, duration?: number) => {
    showToast('error', title, message, duration)
  }

  const showWarning = (title: string, message?: string, duration?: number) => {
    showToast('warning', title, message, duration)
  }

  const showInfo = (title: string, message?: string, duration?: number) => {
    showToast('info', title, message, duration)
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  return (
    <ToastContext.Provider value={{
      showToast,
      showSuccess,
      showError,
      showWarning,
      showInfo
    }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  )
}
