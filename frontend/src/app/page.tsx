'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi } from '@/lib/api';
import {
  Mail, Users, Building2, Activity, ArrowUpRight,
  CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await dashboardApi.stats();
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Use real history data if available, otherwise mock for initial load
  const chartData = stats?.history || [
    { name: 'Mon', sent: 0 },
    { name: 'Tue', sent: 0 },
    { name: 'Wed', sent: 0 },
    { name: 'Thu', sent: 0 },
    { name: 'Fri', sent: 0 },
    { name: 'Sat', sent: 0 },
    { name: 'Sun', sent: 0 },
  ];

  if (loading) {
    return (
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground animate-pulse">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background font-sans">
      <Sidebar />

      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
        <div className="p-8 max-w-7xl mx-auto space-y-8">

          {/* Hero Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                Dashboard
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Overview of your email infrastructure performance.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-4 py-2 rounded-full border shadow-sm">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">System Healthy</span>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="relative overflow-hidden border-none shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-100">Emails Sent Today</CardTitle>
                <Mail className="h-4 w-4 text-blue-100 opacity-70" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.emails_sent_today?.toLocaleString() || 0}</div>
                <div className="flex items-center gap-1 text-xs text-blue-100 mt-1 opacity-80">
                  <ArrowUpRight className="h-3 w-3" /> +12% from yesterday
                </div>
              </CardContent>
              {/* Decorative overlay */}
              <div className="absolute -right-6 -bottom-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
            </Card>

            <Card className="border-none shadow-md hover:shadow-lg transition-shadow bg-white dark:bg-slate-900">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Campaigns</CardTitle>
                <Activity className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">{stats?.active_campaigns || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Currently processing
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-lg transition-shadow bg-white dark:bg-slate-900">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Workspace Users</CardTitle>
                <Users className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">{stats?.total_users || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Across {stats?.total_accounts || 0} service accounts
                </p>
              </CardContent>
            </Card>

            <Card className="border-none shadow-md hover:shadow-lg transition-shadow bg-white dark:bg-slate-900">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Success Rate</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                  {stats?.success_rate ? `${stats.success_rate.toFixed(1)}%` : '100%'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Email deliverability
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts & Activity Section */}
          <div className="grid gap-6 md:grid-cols-7">

            {/* Main Chart */}
            <Card className="md:col-span-4 border-none shadow-md bg-white dark:bg-slate-900">
              <CardHeader>
                <CardTitle>Sending Velocity</CardTitle>
                <CardDescription>
                  Daily email volume over the last 7 days
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-0">
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        cursor={{ stroke: '#3b82f6', strokeWidth: 2 }}
                      />
                      <Area type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSent)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Quota / Status Widget */}
            <Card className="md:col-span-3 border-none shadow-md bg-white dark:bg-slate-900">
              <CardHeader>
                <CardTitle>Quota Usage</CardTitle>
                <CardDescription>
                  Top account utilization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {stats?.quota_usage && Object.keys(stats.quota_usage).length > 0 ? (
                    Object.entries(stats.quota_usage).slice(0, 5).map(([name, usage]: [string, any]) => (
                      <div key={name} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                              {name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-sm text-slate-700 dark:text-slate-200 truncate max-w-[120px]" title={name}>{name}</span>
                          </div>
                          <span className="text-xs font-bold text-slate-500">
                            {usage.sent.toLocaleString()} / {usage.limit.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${usage.percentage > 90 ? 'bg-red-500' :
                              usage.percentage > 70 ? 'bg-amber-500' : 'bg-blue-500'
                              }`}
                            style={{ width: `${Math.min(usage.percentage, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed">
                      <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                      <p>No active accounts found.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex items-center justify-center p-4">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Last updated: {new Date().toLocaleTimeString()}
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
