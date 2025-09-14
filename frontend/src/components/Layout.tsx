import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Upload as UploadIcon, Settings, Github } from 'lucide-react'
import AnimatedBackground from './AnimatedBackground'
import Logo from './Logo'

interface LayoutProps {
  children: React.ReactNode
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex flex-col relative">
      {/* Animated background */}
      <AnimatedBackground isUploading={false} />
      {/* Header */}
      <header className="bg-white/30 backdrop-blur-xl border-b border-black/10 shadow-lg relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link to="/" className="flex items-center">
              <Logo className="h-12" />
            </Link>

            <nav className="flex items-center space-x-4">
              <Link
                to="/"
                className={`flex items-center space-x-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location.pathname === '/'
                    ? 'bg-orange-500/20 text-orange-700 backdrop-blur-sm border border-orange-400/30 shadow-lg'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-white/20 backdrop-blur-sm'
                }`}
              >
                <UploadIcon className="h-4 w-4" />
                <span>Upload</span>
              </Link>
              
              <Link
                to="/admin"
                className={`flex items-center space-x-1 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location.pathname === '/admin'
                    ? 'bg-orange-500/20 text-orange-700 backdrop-blur-sm border border-orange-400/30 shadow-lg'
                    : 'text-gray-700 hover:text-gray-900 hover:bg-white/20 backdrop-blur-sm'
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Admin</span>
              </Link>

              <a
                href="https://github.com/creativeheadz/whirlcrypt"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-orange-500 transition-colors duration-200 p-2 rounded-lg hover:bg-white/20"
              >
                <Github className="h-5 w-5" />
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="bg-white/40 backdrop-blur-xl rounded-2xl border border-gray-200/50 shadow-2xl p-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200/50 bg-white/30 backdrop-blur-xl relative z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4 text-sm text-gray-700">
              <span>© {new Date().getFullYear()} Whirlcrypt</span>
              <span>RFC 8188 Encrypted</span>
            </div>

            <div className="flex items-center space-x-4 text-xs text-gray-600">
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