'use client';

import { useEffect, useState, useRef } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { logsApi } from '@/lib/api'; // We will add this export next
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, Terminal, Info, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface LogEntry {
    id: number;
    level: string;
    message: string;
    timestamp: string;
    data?: any;
}

export default function SystemLogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);

    const fetchLogs = async () => {
        try {
            const res = await logsApi.getRecent(100);
            if (res.data && Array.isArray(res.data.logs)) {
                setLogs(res.data.logs);
            }
        } catch (error) {
            console.error("Failed to fetch logs:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(() => {
            if (autoRefresh) fetchLogs();
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh]);

    useEffect(() => {
        // Auto-scroll to bottom on first load
        if (!loading && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [loading]);

    const getLevelColor = (level: string) => {
        switch (level.toLowerCase()) {
            case 'error': return 'bg-red-100 text-red-800 border-red-200';
            case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'success': return 'bg-green-100 text-green-800 border-green-200';
            default: return 'bg-slate-100 text-slate-800 border-slate-200';
        }
    };

    const getLevelIcon = (level: string) => {
        switch (level.toLowerCase()) {
            case 'error': return <AlertCircle className="w-4 h-4" />;
            case 'warning': return <AlertTriangle className="w-4 h-4" />;
            case 'success': return <CheckCircle className="w-4 h-4" />;
            default: return <Info className="w-4 h-4" />;
        }
    };

    return (
        <div className="flex h-screen bg-background">
            <Sidebar />
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-white dark:bg-slate-900">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Terminal className="w-6 h-6 text-slate-500" />
                            System Logs
                        </h1>
                        <p className="text-muted-foreground text-sm">Real-time worker and API activity</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`text-xs px-3 py-1.5 rounded-md border flex items-center gap-2 ${autoRefresh ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-600'}`}
                        >
                            <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} />
                            {autoRefresh ? 'Auto-Refreshing' : 'Paused'}
                        </button>
                        <button onClick={fetchLogs} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                            Refresh Now
                        </button>
                    </div>
                </div>

                <div className="flex-1 p-6 overflow-hidden bg-slate-50/50">
                    <Card className="h-full flex flex-col shadow-sm border-slate-200">
                        <CardContent className="p-0 flex-1 relative bg-slate-900 text-slate-300 font-mono text-xs rounded-lg overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-auto p-4 space-y-1.5">
                                {loading ? (
                                    <div className="text-slate-500 text-center py-10">Loading system logs...</div>
                                ) : logs.length === 0 ? (
                                    <div className="text-slate-500 text-center py-10">No recent logs found.</div>
                                ) : (
                                    logs.map((log) => (
                                        <div key={log.id} className="flex gap-3 hover:bg-slate-800/50 p-1 rounded -mx-2 px-2 transition-colors">
                                            <span className="text-slate-500 w-32 shrink-0 select-none">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            <span className={`uppercase font-bold shrink-0 w-16 ${log.level === 'error' ? 'text-red-400' :
                                                    log.level === 'warning' ? 'text-yellow-400' :
                                                        'text-blue-400'
                                                }`}>
                                                [{log.level}]
                                            </span>
                                            <span className="break-all text-slate-300">{log.message}</span>
                                        </div>
                                    ))
                                )}
                                <div ref={bottomRef} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
