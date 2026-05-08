import React, { useState, useEffect } from 'react';
import { Shield, Eye, Globe, Zap, AlertTriangle, Activity } from 'lucide-react';

interface SecurityStats {
  totalAttacks: number;
  attacksToday: number;
  uniqueIPs: number;
  topCountries: Array<{ country: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
  lastUpdated: string;
}

const SecurityDashboard: React.FC = () => {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSecurityData = async () => {
    try {
      const statsRes = await fetch('/api/security/stats');

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data);
      }

      setLoading(false);
    } catch (err) {
      setError('Failed to load security data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
    const interval = setInterval(fetchSecurityData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: string } = {
      wordpress: '🎯',
      admin: '🔐',
      env: '🕵️',
      scanner: '🔍',
      exploit: '💥',
      random404: '🎲'
    };
    return icons[category] || '⚠️';
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      wordpress: 'from-red-500/20 to-red-600/10',
      admin: 'from-orange-500/20 to-orange-600/10',
      env: 'from-purple-500/20 to-purple-600/10',
      scanner: 'from-blue-500/20 to-blue-600/10',
      exploit: 'from-pink-500/20 to-pink-600/10',
      random404: 'from-yellow-500/20 to-yellow-600/10'
    };
    return colors[category] || 'from-gray-500/20 to-gray-600/10';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center">
        <div className="card p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-gray-200 border-t-orange-500 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-700">Loading security data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center">
        <div className="card p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-orange-300/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-orange-100/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="relative z-10 container mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="card p-8 mb-8">
            <Shield className="w-16 h-16 text-orange-600 mx-auto mb-4" />
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Whirlcrypt Security Center</h1>
            <p className="text-gray-600 text-lg">Real-time attack monitoring and threat detection</p>
            <div className="flex items-center justify-center mt-4 text-sm text-gray-500">
              <Activity className="w-4 h-4 mr-2" />
              Last updated: {stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : 'Never'}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="card p-6 text-center hover:scale-105 transition-transform duration-300">
              <Eye className="w-8 h-8 text-red-500 mx-auto mb-3" />
              <div className="text-3xl font-bold text-gray-900 mb-1">{stats.totalAttacks}</div>
              <div className="text-gray-600 text-sm">Total Attacks Blocked</div>
            </div>

            <div className="card p-6 text-center hover:scale-105 transition-transform duration-300">
              <Zap className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
              <div className="text-3xl font-bold text-gray-900 mb-1">{stats.attacksToday}</div>
              <div className="text-gray-600 text-sm">Attacks Today</div>
            </div>

            <div className="card p-6 text-center hover:scale-105 transition-transform duration-300">
              <Globe className="w-8 h-8 text-blue-500 mx-auto mb-3" />
              <div className="text-3xl font-bold text-gray-900 mb-1">{stats.uniqueIPs}</div>
              <div className="text-gray-600 text-sm">Unique Attacker IPs</div>
            </div>
          </div>
        )}

        {/* Attack Categories */}
        {stats && stats.topCategories.length > 0 && (
          <div className="card p-8 mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <Shield className="w-6 h-6 mr-3 text-orange-500" />
              Attack Categories
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.topCategories.map((category) => (
                <div key={category.category} className={`p-4 rounded-xl bg-gradient-to-r ${getCategoryColor(category.category)} border border-gray-200/50`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">{getCategoryIcon(category.category)}</span>
                      <div>
                        <div className="text-gray-900 font-semibold capitalize">{category.category}</div>
                        <div className="text-gray-600 text-sm">{category.count} attempts blocked</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No attacks yet */}
        {stats && stats.totalAttacks === 0 && (
          <div className="card p-8 text-center">
            <Shield className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">All Clear</h2>
            <p className="text-gray-600">No attacks detected. The system is monitoring for threats.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityDashboard;
