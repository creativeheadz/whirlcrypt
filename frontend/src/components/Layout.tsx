import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Shield, Upload as UploadIcon, Settings, Github } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link to="/" className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900">Whirlcrypt</h1>
            </Link>
            
            <nav className="flex items-center space-x-4">
              <Link
                to="/"
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <UploadIcon className="h-4 w-4" />
                <span>Upload</span>
              </Link>
              
              <Link
                to="/admin"
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/admin'
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Admin</span>
              </Link>

              <a
                href="https://github.com/creativeheadz/whirlcrypt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Github className="h-5 w-5" />
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span>© {new Date().getFullYear()} Whirlcrypt</span>
              <span className="flex items-center space-x-1">
                <Shield className="h-3 w-3" />
                <span>RFC 8188 Encrypted</span>
              </span>
            </div>
            
            <div className="flex items-center space-x-4 text-xs text-gray-400">
              <span>End-to-end encrypted file sharing</span>
              <span>•</span>
              <span>No server-side decryption</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Layout