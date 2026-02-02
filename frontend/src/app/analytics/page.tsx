'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { dashboardApi } from '@/lib/api';
import { Loader2, TrendingUp, Users, Mail, MousePointer } from 'lucide-react';

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Re-use dashboard stats for now, in future we can add a dedicated analytics endpoint
    // with more granular data (opens/clicks over time etc)
    const loadData = async () => {
      try {
        const response = await dashboardApi.stats();
        setStats(response.data);
      } catch (error) {
        console.error("Failed to load analytics", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  if (loading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Transform quota usage for Pie Chart
  const pieData = stats?.quota_usage ? Object.entries(stats.quota_usage).map(([name, data]: [string, any]) => ({
    name,
    value: data.sent
  })).filter(d => d.value > 0) : [];

  return (
    <div className="flex h-screen bg-background font-sans">
      <Sidebar />
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
        <div className="p-8 max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Deep dive into your campaign performance.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Sending Volume */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Sending Volume (7 Days)</CardTitle>
                <CardDescription>Daily email traffic across all accounts.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.history || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="sent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Account Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Traffic by Account</CardTitle>
                <CardDescription>Share of voice among service accounts.</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No data available yet.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Engagement (Placeholder for now until tracking events are fully aggregated) */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Overview</CardTitle>
                <CardDescription>Opens and Clicks (Aggregate)</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] flex flex-col justify-center gap-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-full">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Unique Opens</p>
                      <p className="text-xs text-muted-foreground">Last 24h</p>
                    </div>
                  </div>
                  <div className="text-2xl font-bold">
                    {stats?.total_opens || 0}
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-full">
                      <MousePointer className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Click-throughs</p>
                      <p className="text-xs text-muted-foreground">Last 24h</p>
                    </div>
                  </div>
                  <div className="text-2xl font-bold">
                    {stats?.total_clicks || 0}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
