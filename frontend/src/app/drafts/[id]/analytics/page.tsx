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
    Legend
} from 'recharts';
import {
    ArrowLeft,
    Globe,
    MousePointer2,
    MailRead,
    Smartphone,
    Monitor,
    Clock,
    MapPin,
    ExternalLink,
    Zap
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

const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

const AnalyticsPage = () => {
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
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <Zap className="h-10 w-10 text-purple-600 animate-pulse" />
                    <p className="text-slate-500 font-medium tracking-tight">Gathering draft insights...</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="container mx-auto p-8">
                <div className="bg-red-50 border border-red-100 p-6 rounded-2xl text-center">
                    <p className="text-red-600 font-medium mb-4">{error || 'Something went wrong'}</p>
                    <Button onClick={() => router.back()}>Go Back</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-12">
            {/* Header Section */}
            <div className="bg-white border-b border-slate-200 px-6 py-8 mb-8 sticky top-0 z-10 backdrop-blur-md bg-white/80">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => router.back()}
                            className="group flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-sm font-medium mb-2"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            Back to Drafts
                        </button>
                        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                            Analytics Insights
                            <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50 font-semibold px-3 py-1 text-xs">
                                Draft #{id}
                            </Badge>
                        </h1>
                        <p className="text-slate-500 text-lg max-w-2xl">
                            Deep dive into campaign performance, audience demographics, and engagement trends.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button variant="outline" onClick={fetchAnalytics} className="hover:bg-slate-50 border-slate-200">
                            Refresh Live
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 space-y-8">
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card className="border-none shadow-sm bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div className="bg-white/20 p-2 rounded-lg">
                                    <MailRead className="h-6 w-6 text-white" />
                                </div>
                                <Badge className="bg-white/20 border-none text-white text-[10px]">TOTAL OPENS</Badge>
                            </div>
                            <div className="text-4xl font-black mb-1">{data.total_opens}</div>
                            <div className="text-purple-100 text-sm flex items-center gap-1">
                                <span className="font-bold underline cursor-default">{data.unique_opens}</span> unique recipients
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div className="bg-white/20 p-2 rounded-lg">
                                    <MousePointer2 className="h-6 w-6 text-white" />
                                </div>
                                <Badge className="bg-white/20 border-none text-white text-[10px]">TOTAL CLICKS</Badge>
                            </div>
                            <div className="text-4xl font-black mb-1">{data.total_clicks}</div>
                            <div className="text-blue-100 text-sm flex items-center gap-1">
                                <span className="font-bold underline cursor-default">{data.unique_clicks}</span> unique clicks
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm bg-white">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div className="bg-green-100 p-2 rounded-lg">
                                    <Zap className="h-6 w-6 text-green-600" />
                                </div>
                                <Badge variant="secondary" className="text-[10px]">CLICK RATE</Badge>
                            </div>
                            <div className="text-4xl font-black mb-1">
                                {data.unique_opens > 0 ? ((data.unique_clicks / data.unique_opens) * 100).toFixed(1) : '0'}%
                            </div>
                            <div className="text-slate-500 text-sm">CTR (Click-to-Open)</div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-sm bg-white">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div className="bg-orange-100 p-2 rounded-lg">
                                    <Globe className="h-6 w-6 text-orange-600" />
                                </div>
                                <Badge variant="secondary" className="text-[10px]">REACH</Badge>
                            </div>
                            <div className="text-4xl font-black mb-1">{data.geo_countries.length}</div>
                            <div className="text-slate-500 text-sm">Countries reached</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Chart View */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Activity Timeline */}
                    <Card className="lg:col-span-2 border-slate-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5 text-purple-500" />
                                Engagement Timeline
                            </CardTitle>
                            <CardDescription>Activity in the last 24 hours (Hourly Breakdown)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px] w-full">
                                {data.timeseries.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={data.timeseries}>
                                            <defs>
                                                <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis
                                                dataKey="timestamp"
                                                tickFormatter={(t) => format(new Date(t), 'HH:mm')}
                                                stroke="#94A3B8"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                labelFormatter={(t) => format(new Date(t), 'MMM d, HH:mm')}
                                            />
                                            <Area type="monotone" dataKey="opens" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorOpens)" strokeWidth={3} />
                                            <Area type="monotone" dataKey="clicks" stroke="#3b82f6" fillOpacity={1} fill="url(#colorClicks)" strokeWidth={3} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400">
                                        No timeline data recorded yet.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Geo Map Summary */}
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-red-500" />
                                Top Countries
                            </CardTitle>
                            <CardDescription>Where your audience is based</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {data.geo_countries.length > 0 ? (
                                    data.geo_countries.map((country, idx) => (
                                        <div key={country.label} className="flex flex-col gap-2">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="font-semibold text-slate-700 flex items-center gap-2">
                                                    <span className="w-6 h-4 bg-slate-100 rounded flex items-center justify-center text-[10px] text-slate-400">
                                                        {country.label}
                                                    </span>
                                                    {country.label === 'Unknown' ? 'Global' : country.label}
                                                </span>
                                                <span className="text-slate-500 font-medium">{country.value} hits</span>
                                            </div>
                                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-purple-500 h-full rounded-full"
                                                    style={{ width: `${(country.value / data.total_opens) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-slate-400 text-sm italic">
                                        Location tracking pending...
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tech Stack Distribution */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {/* Device Type */}
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Device Distribution</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={data.device_types}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        nameKey="label"
                                    >
                                        {data.device_types.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Browser Breakdown */}
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Top Browsers</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {data.browsers.map((b, idx) => (
                                    <div key={b.label} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                            <span className="text-sm font-medium text-slate-600">{b.label}</span>
                                        </div>
                                        <span className="text-sm font-bold text-slate-900">{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* OS Breakdown */}
                    <Card className="border-slate-200">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500">Operating Systems</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[180px] w-full pr-4">
                                <div className="space-y-4">
                                    {data.os_systems.map((os, idx) => (
                                        <div key={os.label} className="flex items-center justify-between">
                                            <span className="text-sm text-slate-600">{os.label}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-400">{((os.value / data.total_opens) * 100).toFixed(0)}%</span>
                                                <span className="text-sm font-bold text-slate-900">{os.value}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Events Log */}
                <Card className="border-slate-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b border-slate-100">
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="text-lg">Live Engagement Stream</CardTitle>
                                <CardDescription>Real-time view of recent recipient interactions</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 font-medium">
                                        <th className="px-6 py-4">Event</th>
                                        <th className="px-6 py-4">Time</th>
                                        <th className="px-6 py-4">Location</th>
                                        <th className="px-6 py-4">Device</th>
                                        <th className="px-6 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.recent_events.map((event) => (
                                        <tr key={event.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <Badge className={`${event.event_type === 'open' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'} border-none uppercase text-[10px] font-bold`}>
                                                    {event.event_type}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 font-medium whitespace-nowrap">
                                                {format(new Date(event.timestamp), 'MMM d, HH:mm:ss')}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900">{event.geo_city || 'Unknown City'}</span>
                                                    <span className="text-xs text-slate-400">{event.geo_country || 'Global'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    {event.device === 'mobile' ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                                                    <span className="text-xs">{event.browser} on {event.os}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900">
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {data.recent_events.length === 0 && (
                                <div className="py-20 text-center flex flex-col items-center gap-2">
                                    <MailRead className="h-12 w-12 text-slate-200" />
                                    <p className="text-slate-400 italic">Listening for live events... No data captured yet.</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AnalyticsPage;
