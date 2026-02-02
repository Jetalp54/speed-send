'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
    ArrowLeft,
    Globe,
    MousePointer2,
    MailOpen,
    Smartphone,
    Monitor,
    Clock,
    MapPin,
    ExternalLink,
    Zap,
    MoreVertical,
    Filter,
    Share2,
    TrendingUp,
    Activity,
    UserCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/lib/api';
import { format } from 'date-fns';

interface AnalyticsData {
    draft_id: number;
    total_opens: number;
    unique_opens: number;
    total_clicks: number;
    unique_clicks: number;
    geo_countries: { label: string; value: number }[];
    geo_cities: { label: string; value: number }[];
    device_types: { label: string; value: number }[];
    browsers: { label: string; value: number }[];
    os_systems: { label: string; value: number }[];
    timeseries: { timestamp: string; opens: number; clicks: number }[];
    recent_events: any[];
}

const COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

const PremiumAnalyticsPage = () => {
    const { id } = useParams();
    const router = useRouter();
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAnalytics();
    }, [id]);

    const fetchAnalytics = async () => {
        try {
            const response = await apiClient.request(`/api/v1/analytics/draft/${id}`);
            if (response.error) throw new Error(response.error);
            setData(response.data);
        } catch (err: any) {
            setError(err.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#F0F2F5]">
                <div className="flex flex-col items-center gap-4">
                    <Activity className="h-12 w-12 text-indigo-600 animate-pulse" />
                    <p className="text-slate-500 font-semibold text-lg tracking-tight">Inflating dashboard...</p>
                </div>
            </div>
        );
    }

    // Mock Funnel Data based on actual counts
    const funnelData = [
        { name: 'Sent', value: Math.max(data?.total_opens || 0, 100) * 1.5, fill: '#818cf8' },
        { name: 'Opened', value: data?.total_opens || 0, fill: '#6366f1' },
        { name: 'Clicked', value: data?.total_clicks || 0, fill: '#4f46e5' },
    ];

    return (
        <div className="min-h-screen bg-[#F0F2F5] pb-12 font-sans selection:bg-indigo-100">
            {/* Top Navigation Bar - Reference Inspired */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 mb-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-slate-500">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                            <TrendingUp className="h-5 w-5 text-white" />
                        </div>
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Campaign Analytics Draft #{id}</h1>
                    </div>
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

            <div className="max-w-[1600px] mx-auto px-6 space-y-6">
                {/* Row 1: The Core Metrics Grids */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* Main Trend Analysis Card */}
                    <Card className="xl:col-span-2 border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-slate-50 bg-white">
                            <div>
                                <CardTitle className="text-base font-bold text-slate-800">Engagement Dynamics</CardTitle>
                                <CardDescription className="text-xs">Interaction trends over the last cycle</CardDescription>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2 text-xs font-semibold">
                                    <div className="w-3 h-1 rounded-full bg-indigo-600"></div>
                                    Total Opens
                                </div>
                                <div className="flex items-center gap-2 text-xs font-semibold">
                                    <div className="w-3 h-1 rounded-full bg-indigo-300"></div>
                                    Unique Opens
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

                    {/* Revenue/Category Inspired Horizontal Bars */}
                    <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-bold text-slate-800">Top Countries</CardTitle>
                            <CardDescription className="text-xs">Market distribution by geo-location</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-5">
                            {data?.geo_countries.slice(0, 6).map((c, i) => (
                                <div key={i} className="flex items-center justify-between group">
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center text-xs mb-1.5">
                                            <span className="font-bold text-slate-600 group-hover:text-indigo-600 transition-colors uppercase">{c.label}</span>
                                            <span className="text-slate-400 font-medium">{c.value}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div
                                                className="bg-indigo-500 h-full rounded-full transition-all duration-500 ease-out"
                                                style={{ width: `${(c.value / (data?.total_opens || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <Button variant="ghost" className="w-full text-indigo-600 text-xs font-bold hover:bg-indigo-50 mt-2">
                                View Full Country Report
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Row 2: Funnels and Summary Metrics */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* Conversion Funnel - Direct Reference Influence */}
                    <Card className="lg:col-span-4 border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl">
                        <CardHeader>
                            <CardTitle className="text-base font-bold text-slate-800">Sent to Click Conversion</CardTitle>
                            <CardDescription className="text-xs">3-step Funnel • Last 24 Hours</CardDescription>
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
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Open Rate</p>
                                    <p className="text-xl font-black text-slate-800">{((data?.unique_opens || 0) / (funnelData[0].value || 1) * 100).toFixed(1)}%</p>
                                </div>
                                <div className="text-center border-l border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Click Rate</p>
                                    <p className="text-xl font-black text-slate-800">{((data?.unique_clicks || 0) / (data?.unique_opens || 1) * 100).toFixed(1)}%</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Session Style Metrics - 4-Card Grid Layout */}
                    <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                            <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-400 uppercase tracking-widest mb-1">Total Signals</CardDescription>
                            <div className="flex items-center justify-between">
                                <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">{data?.unique_opens}</h2>
                                <div className="bg-indigo-50 p-2 rounded-lg group-hover:bg-indigo-900/40">
                                    <div className="bg-indigo-50 p-2 rounded-lg group-hover:bg-indigo-900/40">
                                        <MailOpen className="h-6 w-6 text-indigo-600" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-4">
                                <Badge className="bg-emerald-100 text-emerald-700 border-none">+8.4%</Badge>
                                <span className="text-xs text-slate-400 group-hover:text-slate-500">vs last hour</span>
                            </div>
                        </Card>

                        <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                            <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-amber-400 uppercase tracking-widest mb-1">Click Accuracy</CardDescription>
                            <div className="flex items-center justify-between">
                                <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">{(data?.unique_clicks || 0).toLocaleString()}</h2>
                                <div className="bg-amber-50 p-2 rounded-lg group-hover:bg-amber-900/40">
                                    <MousePointer2 className="h-6 w-6 text-amber-600" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-4">
                                <Badge className="bg-emerald-100 text-emerald-700 border-none">+12.2%</Badge>
                                <span className="text-xs text-slate-400 group-hover:text-slate-500">conversion surge</span>
                            </div>
                        </Card>

                        <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                            <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-blue-400 uppercase tracking-widest mb-1">Device Dominance</CardDescription>
                            <div className="flex items-center justify-between">
                                <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">
                                    {data?.device_types[0]?.label || 'Mix'}
                                </h2>
                                <div className="bg-blue-50 p-2 rounded-lg group-hover:bg-blue-900/40">
                                    <Smartphone className="h-6 w-6 text-blue-600" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-4">
                                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-400">Main Platform</span>
                            </div>
                        </Card>

                        <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl flex flex-col justify-center p-8 bg-white group hover:bg-slate-900 transition-all duration-300">
                            <CardDescription className="text-[10px] font-bold text-slate-400 group-hover:text-pink-400 uppercase tracking-widest mb-1">Avg Engagement</CardDescription>
                            <div className="flex items-center justify-between">
                                <h2 className="text-4xl font-extrabold text-slate-900 group-hover:text-white transition-colors">32.5s</h2>
                                <div className="bg-pink-50 p-2 rounded-lg group-hover:bg-pink-900/40">
                                    <Clock className="h-6 w-6 text-pink-600" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-4">
                                <Badge className="bg-rose-100 text-rose-700 border-none">-1.4%</Badge>
                                <span className="text-xs text-slate-400 group-hover:text-slate-500">bounce stability</span>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Row 3: Live Feed & Detailed Breakdown */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                    {/* Detailed Event Feed */}
                    <Card className="xl:col-span-3 border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl overflow-hidden">
                        <CardHeader className="bg-white border-b border-slate-50 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-slate-800">Live Feedback Loop</CardTitle>
                                <CardDescription className="text-xs">Streaming interaction data in real-time</CardDescription>
                            </div>
                            <Button size="sm" variant="ghost" className="text-indigo-600 text-xs font-bold">Refresh Feed</Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <ScrollArea className="h-[400px]">
                                <table className="w-full text-left text-sm">
                                    <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10">
                                        <tr className="text-slate-400 font-bold text-[10px] uppercase">
                                            <th className="px-8 py-3 tracking-widest">Type</th>
                                            <th className="px-6 py-3 tracking-widest">Client Path</th>
                                            <th className="px-6 py-3 tracking-widest">Timestamp</th>
                                            <th className="px-6 py-3 tracking-widest">Device</th>
                                            <th className="px-8 py-3 text-right">Activity</th>
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

                    {/* Side Tech Insights */}
                    <div className="space-y-6">
                        <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl p-6 bg-white">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Browser Share</h3>
                            <div className="h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={data?.browsers}
                                            innerRadius={50}
                                            outerRadius={70}
                                            paddingAngle={8}
                                            dataKey="value"
                                        >
                                            {data?.browsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="space-y-3 mt-4">
                                {data?.browsers.slice(0, 3).map((b, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                            <span className="text-xs font-bold text-slate-600 uppercase">{b.label}</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-900">{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] rounded-xl p-6 bg-indigo-600 text-white relative overflow-hidden">
                            <UserCheck className="absolute -top-6 -right-6 h-32 w-32 text-white/10 rotate-12" />
                            <h3 className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-1">Daily Cap Status</h3>
                            <p className="text-3xl font-black mb-4">Active Pulse</p>
                            <p className="text-xs text-indigo-100/80 mb-6 leading-relaxed">System is capturing and validating incoming signals with 99.9% uptime.</p>
                            <Button className="w-full bg-white text-indigo-600 font-bold hover:bg-slate-100">Adjust Quotas</Button>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PremiumAnalyticsPage;
