import React from 'react'
import Toast, { ToastMessage } from './Toast'

interface ToastContainerProps {
  toasts: ToastMessage[]
  onClose: (id: string) => void
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm w-full">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  )
}

export default ToastContainer
