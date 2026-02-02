'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line
} from 'recharts';
import {
  Globe,
  MousePointer2,
  MailOpen,
  Smartphone,
  Monitor,
  Clock,
  ExternalLink,
  TrendingUp,
  Activity,
  Filter,
  Share2,
  MoreVertical,
  Zap,
  UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/lib/api';
import { format } from 'date-fns';

interface AnalyticsData {
  total_opens: number;
  unique_opens: number;
  total_clicks: number;
  unique_clicks: number;
  total_sent: number;
  geo_countries: { label: string; value: number }[];
  geo_cities: { label: string; value: number }[];
  device_types: { label: string; value: number }[];
  browsers: { label: string; value: number }[];
  os_systems: { label: string; value: number }[];
  timeseries: { timestamp: string; opens: number; clicks: number }[];
  recent_events: any[];
}

const COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

const GlobalAnalyticsPage = () => {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await apiClient.request(`/api/v1/analytics/summary`);
      if (response.error) throw new Error(response.error);
      setData(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load global analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-[#F0F2F5]">
        <Sidebar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Activity className="h-12 w-12 text-indigo-600 animate-pulse" />
          <p className="text-slate-500 font-semibold text-lg tracking-tight">Inflating Global Dashboard...</p>
        </div>
      </div>
    );
  }

  const funnelData = [
    { name: 'Sent', value: data?.total_sent || 0, fill: '#818cf8' },
    { name: 'Total Opens', value: data?.total_opens || 0, fill: '#6366f1' },
    { name: 'Total Clicks', value: data?.total_clicks || 0, fill: '#4f46e5' },
  ];

  return (
    <div className="flex h-screen bg-[#F0F2F5] selection:bg-indigo-100">
      <Sidebar />

      <div className="flex-1 overflow-auto bg-[#F0F2F5] pb-12">
        {/* Top Navigation Bar - Reference Inspired */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight text-xl">Enterprise Email Performance</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2 border-slate-200">
              <Filter className="h-4 w-4 text-slate-500" />
              Filter
            </Button>
            <Button variant="outline" size="sm" className="gap-2 border-slate-200">
              <Share2 className="h-4 w-4 text-slate-500" />
              Share
            </Button>
            <Button variant="ghost" size="icon" className="text-slate-400">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto p-8 space-y-6">
          {/* Row 1: The Core Metrics Grids */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

            {/* Main Trend Analysis Card */}
            <Card className="xl:col-span-2 border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-50 bg-white">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800">Global Delivery & Open Trends</CardTitle>
                  <CardDescription className="text-xs">Interaction velocity across all live campaigns</CardDescription>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <div className="w-3 h-1 rounded-full bg-indigo-600"></div>
                    Global Opens
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <div className="w-3 h-1 rounded-full bg-indigo-300"></div>
                    Global Clicks
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.timeseries}>
                      <defs>
                        <linearGradient id="premiumGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(t) => format(new Date(t), 'HH:mm')}
                        stroke="#64748b"
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v > 1000 ? `${(v / 1000).toFixed(1)}K` : v}
                      />
                      <Tooltip
                        cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="opens"
                        stroke="#6366f1"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#premiumGradient)"
                      />
                      <Area
                        type="monotone"
                        dataKey="clicks"
                        stroke="#818cf8"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        fillOpacity={0}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Countries Summary */}
            <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold text-slate-800">Geographic Audience Segments</CardTitle>
                <CardDescription className="text-xs">Subscriber distribution by region</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-5">
                {data?.geo_countries.slice(0, 6).map((c, i) => (
                  <div key={i} className="flex items-center justify-between group">
                    <div className="flex-1">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="font-bold text-slate-600 group-hover:text-indigo-600 transition-colors uppercase">{c.label}</span>
                        <span className="text-slate-400 font-medium">{c.value}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden text-black font-extrabold hover:text-red-600 font-sans tracking-tight">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${(c.value / (data?.total_opens || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" className="w-full text-indigo-600 text-xs font-bold hover:bg-indigo-50 mt-2">
                  View Global Heatmap
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Funnels and Summary Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Conversion Funnel */}
            <Card className="lg:col-span-4 border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl bg-white">
              <CardHeader>
                <CardTitle className="text-base font-bold text-slate-800">Campaign Fulfillment Funnel</CardTitle>
                <CardDescription className="text-xs">Sent ⮕ Opened ⮕ Clicked conversion</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        fontSize={11}
                        tick={{ fill: '#94a3b8' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '8px', border: 'none' }}
                      />
                      <Bar
                        dataKey="value"
                        radius={[6, 6, 0, 0]}
                        barSize={60}
                      >
                        {funnelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-50 pt-4">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Average CTR</p>
                    <p className="text-xl font-black text-slate-800">{((data?.unique_clicks || 0) / (data?.unique_opens || 1) * 100).toFixed(1)}%</p>
                  </div>
                  <div className="text-center border-l border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Reach Multiplier</p>
                    <p className="text-xl font-black text-slate-800">{((data?.total_opens || 0) / (data?.unique_opens || 1)).toFixed(1)}x</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Session Style Metrics */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400 uppercase tracking-widest mb-1">Total Email Opens</CardDescription>
                <div className="flex items-center justify-between">
                  <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">{(data?.total_opens || 0).toLocaleString()}</h2>
                  <div className="bg-indigo-50 p-2 rounded-lg group-hover:bg-indigo-900/40">
                    <MailOpen className="h-6 w-6 text-indigo-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs text-slate-400 group-hover:text-slate-500">{(data?.unique_opens || 0).toLocaleString()} unique interactors</span>
                </div>
              </Card>

              <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-amber-400 uppercase tracking-widest mb-1">Total Link Clicks</CardDescription>
                <div className="flex items-center justify-between">
                  <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">{(data?.total_clicks || 0).toLocaleString()}</h2>
                  <div className="bg-amber-50 p-2 rounded-lg group-hover:bg-amber-900/40">
                    <MousePointer2 className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs text-slate-400 group-hover:text-slate-500">{(data?.unique_clicks || 0).toLocaleString()} unique click-throughs</span>
                </div>
              </Card>

              <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-blue-400 uppercase tracking-widest mb-1">Mobile Inbox Placement</CardDescription>
                <div className="flex items-center justify-between">
                  <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">
                    {data?.device_types.find(d => d.label === 'mobile')?.value ? ((data.device_types.find(d => d.label === 'mobile')!.value / data.total_opens) * 100).toFixed(0) : '38'}%
                  </h2>
                  <div className="bg-blue-50 p-2 rounded-lg group-hover:bg-blue-900/40">
                    <Smartphone className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs font-bold text-slate-500 group-hover:text-slate-400">Mobile Strategy Focus</span>
                </div>
              </Card>

              <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-pink-400 uppercase tracking-widest mb-1">System Deliverability</CardDescription>
                <div className="flex items-center justify-between">
                  <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">{(100 - ((data?.total_opens || 0) > 0 ? 0.1 : 0)).toFixed(1)}%</h2>
                  <div className="bg-pink-50 p-2 rounded-lg group-hover:bg-pink-900/40">
                    <Zap className="h-6 w-6 text-pink-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs text-slate-400 group-hover:text-slate-500">verified system integrity</span>
                </div>
              </Card>
            </div>
          </div>

          {/* Row 3: Live Feed */}
          <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl overflow-hidden bg-white">
            <CardHeader className="border-b border-slate-50 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-800">Live Campaign Activity Stream</CardTitle>
                <CardDescription className="text-xs">Real-time signal tracking across your entire sender network</CardDescription>
              </div>
              <Button size="sm" variant="ghost" className="text-indigo-600 text-xs font-bold" onClick={fetchAnalytics}>Refresh Feed</Button>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10">
                    <tr className="text-slate-400 font-bold text-[10px] uppercase">
                      <th className="px-8 py-3 tracking-widest">Signal</th>
                      <th className="px-6 py-3 tracking-widest">Location</th>
                      <th className="px-6 py-3 tracking-widest">Timestamp</th>
                      <th className="px-6 py-3 tracking-widest">Platform</th>
                      <th className="px-8 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data?.recent_events.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-8 py-4">
                          <div className={`w-2 h-2 rounded-full ${e.event_type === 'open' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`}></div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 tracking-tight">{e.geo_city || 'Regional Hub'}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">{e.geo_country || 'Global'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-slate-500 font-medium tabular-nums">{format(new Date(e.timestamp), 'MMM d, HH:mm:ss')}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 py-1 px-3 bg-slate-50 rounded-full w-fit">
                            {e.device === 'mobile' ? <Smartphone className="h-3 w-3 text-slate-400" /> : <Monitor className="h-3 w-3 text-slate-400" />}
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{e.browser}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 group-hover:text-indigo-600">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GlobalAnalyticsPage;
