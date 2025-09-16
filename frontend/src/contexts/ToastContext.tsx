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
    const id = Math.random().toString(36).substr(2, 9)
    const toast: ToastMessage = {
      id,
      type,
      title,
      message,
      duration
    }

    setToasts(prev => [...prev, toast])
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
