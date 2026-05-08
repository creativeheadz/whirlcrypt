import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Upload from './components/Upload'
import Download from './components/Download'

// Lazy-load admin routes (not needed for most users)
const Admin = lazy(() => import('./components/Admin'))
const SecurityDashboard = lazy(() => import('./components/SecurityDashboard'))

const LazyFallback = () => (
  <div className="flex justify-center items-center py-20">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
  </div>
)

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/download/:id" element={<Download />} />
        <Route path="/admin" element={<Suspense fallback={<LazyFallback />}><Admin /></Suspense>} />
        <Route path="/security" element={<Suspense fallback={<LazyFallback />}><SecurityDashboard /></Suspense>} />
        <Route path="*" element={
          <div className="max-w-md mx-auto text-center py-20">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
            <p className="text-gray-600 mb-6">Page not found</p>
            <a href="/" className="btn-primary inline-block">Go Home</a>
          </div>
        } />
      </Routes>
    </Layout>
  )
}

export default App
