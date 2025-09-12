import React, { useState, useEffect } from 'react'
import { Settings, BarChart3, Trash2, RefreshCw, HardDrive, Clock, FileText, AlertTriangle } from 'lucide-react'
import axios from 'axios'

interface Stats {
  totalFiles: number
  totalSize: number
  expiredFiles: number
  config: {
    maxFileSize: number
    defaultRetentionHours: number
    maxRetentionHours: number
    allowedExtensions?: string[]
  }
}

interface Config {
  retention: {
    defaultRetentionHours: number
    maxRetentionHours: number
    cleanupIntervalMinutes: number
    maxFileSize: number
    allowedExtensions?: string[]
  }
  rateLimiting: {
    windowMs: number
    maxRequests: number
  }
  maxFileSize: number
}

const Admin: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Configuration form state
  const [configForm, setConfigForm] = useState({
    defaultRetentionHours: 24,
    maxRetentionHours: 168,
    maxFileSize: 104857600 // 100MB
  })

  const [configSaving, setConfigSaving] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const [statsResponse, configResponse] = await Promise.all([
        axios.get('/api/admin/stats'),
        axios.get('/api/admin/config')
      ])
      
      setStats(statsResponse.data)
      setConfig(configResponse.data)
      
      // Update form with current config
      setConfigForm({
        defaultRetentionHours: configResponse.data.retention.defaultRetentionHours,
        maxRetentionHours: configResponse.data.retention.maxRetentionHours,
        maxFileSize: configResponse.data.retention.maxFileSize
      })
      
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Failed to load data'
        : 'Failed to load data'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleCleanup = async () => {
    setCleanupLoading(true)
    setCleanupResult(null)
    
    try {
      const response = await axios.post('/api/admin/cleanup')
      setCleanupResult(response.data.message)
      
      // Refresh stats after cleanup
      await fetchData()
      
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Cleanup failed'
        : 'Cleanup failed'
      setError(errorMessage)
    } finally {
      setCleanupLoading(false)
    }
  }

  const handleConfigSave = async () => {
    setConfigSaving(true)
    setConfigSaved(false)
    
    try {
      await axios.put('/api/admin/config', configForm)
      setConfigSaved(true)
      
      // Refresh config
      await fetchData()
      
      setTimeout(() => setConfigSaved(false), 3000)
      
    } catch (error) {
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Failed to save configuration'
        : 'Failed to save configuration'
      setError(errorMessage)
    } finally {
      setConfigSaving(false)
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatSizeInput = (bytes: number): number => {
    return Math.round(bytes / (1024 * 1024)) // Convert to MB
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600">Loading admin panel...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Admin Panel
        </h1>
        <p className="text-gray-600">
          Manage file retention settings and view system statistics
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="card p-4 bg-red-50 border-red-200">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Files</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalFiles}</p>
              </div>
              <FileText className="h-8 w-8 text-primary-600" />
            </div>
          </div>
          
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Storage Used</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatFileSize(stats.totalSize)}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-primary-600" />
            </div>
          </div>
          
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Expired Files</p>
                <p className="text-2xl font-bold text-gray-900">{stats.expiredFiles}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            {stats.expiredFiles > 0 && (
              <p className="text-sm text-amber-600 mt-2">
                Files ready for cleanup
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cleanup Section */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
          <Trash2 className="h-5 w-5 mr-2" />
          File Cleanup
        </h2>
        
        <p className="text-gray-600 mb-4">
          Remove expired files to free up storage space. This operation is automatic but can be 
          triggered manually when needed.
        </p>
        
        <button
          onClick={handleCleanup}
          disabled={cleanupLoading}
          className="btn-primary flex items-center"
        >
          {cleanupLoading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 mr-2" />
          )}
          {cleanupLoading ? 'Cleaning up...' : 'Run Cleanup Now'}
        </button>
        
        {cleanupResult && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-700">{cleanupResult}</p>
          </div>
        )}
      </div>

      {/* Configuration Section */}
      {config && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Configuration
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Retention Settings */}
            <div>
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                File Retention
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Retention (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={configForm.maxRetentionHours}
                    value={configForm.defaultRetentionHours}
                    onChange={(e) => setConfigForm(prev => ({
                      ...prev,
                      defaultRetentionHours: parseInt(e.target.value) || 1
                    }))}
                    className="input"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maximum Retention (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={configForm.maxRetentionHours}
                    onChange={(e) => setConfigForm(prev => ({
                      ...prev,
                      maxRetentionHours: parseInt(e.target.value) || 1
                    }))}
                    className="input"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maximum File Size (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formatSizeInput(configForm.maxFileSize)}
                    onChange={(e) => setConfigForm(prev => ({
                      ...prev,
                      maxFileSize: (parseInt(e.target.value) || 1) * 1024 * 1024
                    }))}
                    className="input"
                  />
                </div>
              </div>
            </div>
            
            {/* Current Settings Display */}
            <div>
              <h3 className="text-lg font-medium text-gray-800 mb-3">
                Current Settings
              </h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Cleanup Interval:</span>
                  <span className="font-medium">{config.retention.cleanupIntervalMinutes} minutes</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Rate Limit Window:</span>
                  <span className="font-medium">{config.rateLimiting.windowMs / 60000} minutes</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">Rate Limit Max:</span>
                  <span className="font-medium">{config.rateLimiting.maxRequests} requests</span>
                </div>
                
                {config.retention.allowedExtensions && (
                  <div>
                    <span className="text-gray-600">Allowed Extensions:</span>
                    <div className="mt-1">
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {config.retention.allowedExtensions.join(', ') || 'All types'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Save Button */}
          <div className="mt-6 pt-4 border-t">
            <button
              onClick={handleConfigSave}
              disabled={configSaving}
              className="btn-primary flex items-center"
            >
              {configSaving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Settings className="h-4 w-4 mr-2" />
              )}
              {configSaving ? 'Saving...' : 'Save Configuration'}
            </button>
            
            {configSaved && (
              <p className="text-green-600 text-sm mt-2">
                Configuration saved successfully!
              </p>
            )}
          </div>
        </div>
      )}

      {/* System Info */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
          <BarChart3 className="h-5 w-5 mr-2 text-primary-600" />
          System Information
        </h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>• Files are automatically cleaned up based on retention settings</p>
          <p>• All uploads are rate-limited to prevent abuse</p>
          <p>• Server never has access to decryption keys</p>
          <p>• Configuration changes take effect immediately</p>
        </div>
      </div>
    </div>
  )
}

export default Admin