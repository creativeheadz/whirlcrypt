import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Upload from './components/Upload'
import Download from './components/Download'
import Admin from './components/Admin'
import SecurityDashboard from './components/SecurityDashboard'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/download/:id" element={<Download />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/security" element={<SecurityDashboard />} />
      </Routes>
    </Layout>
  )
}

export default App