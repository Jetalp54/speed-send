
import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Trash2, ChevronDown, ChevronUp, Activity, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LogEntry {
    level: 'info' | 'success' | 'warning' | 'error' | 'system';
    message: string;
    timestamp: string;
    campaign_id?: number | string;
    data?: any;
    id: number;
}

const ConsoleMonitor: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [connected, setConnected] = useState(false);
    const [isMinimized, setIsMinimized] = useState(true);
    const [filterId, setFilterId] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [lastLogId, setLastLogId] = useState(0);
    const [errorCount, setErrorCount] = useState(0);

    // Auto-scroll logic
    useEffect(() => {
        if (!isMinimized && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isMinimized]);

    // Polling logic
    useEffect(() => {
        let isMounted = true;
        let pollTimer: NodeJS.Timeout;

        const pollLogs = async () => {
            if (!isMounted) return;
            try {
                const res = await fetch(`/api/v1/live-logs/recent?after_id=${lastLogId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.logs && data.logs.length > 0) {
                        setConnected(true);
                        setLogs(prev => {
                            const existingIds = new Set(prev.map(l => l.id));
                            const newUniqueLogs = data.logs.filter((l: any) => !existingIds.has(l.id));
                            return [...prev, ...newUniqueLogs].slice(-300);
                        });
                        const maxId = Math.max(...data.logs.map((l: any) => l.id));
                        setLastLogId(maxId);
                        const errors = data.logs.filter((l: any) => l.level === 'error').length;
                        if (errors > 0) setErrorCount(c => c + errors);
                    } else {
                        setConnected(true);
                    }
                } else {
                    setConnected(false);
                }
            } catch (e) {
                setConnected(false);
            }
            pollTimer = setTimeout(pollLogs, 1500);
        };

        pollLogs();
        return () => {
            isMounted = false;
            clearTimeout(pollTimer);
        };
    }, [lastLogId]);

    const clearLogs = () => {
        setLogs([]);
        setErrorCount(0);
    };

    const getColorClass = (level: string) => {
        switch (level) {
            case 'success': return 'text-emerald-400';
            case 'error': return 'text-rose-400';
            case 'warning': return 'text-amber-400';
            case 'system': return 'text-indigo-400';
            default: return 'text-slate-300';
        }
    };

    return (
        <div className={`fixed bottom-0 left-0 right-0 z-[60] transition-all duration-500 ease-in-out px-4 pb-4 ${isMinimized ? 'translate-y-[calc(100%-48px)]' : 'translate-y-0'}`}>
            <div className="max-w-[1700px] mx-auto">
                <Card className="bg-slate-950/90 backdrop-blur-2xl border-slate-800 shadow-[0_-20px_50px_rgba(0,0,0,0.3)] overflow-hidden rounded-t-2xl">
                    <CardHeader
                        className="p-3 border-b border-slate-800 cursor-pointer flex flex-row items-center justify-between"
                        onClick={() => setIsMinimized(!isMinimized)}
                    >
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Process Monitor</span>
                            </div>

                            <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
                                <div className="flex items-center gap-2 bg-slate-900/50 px-2 py-1 rounded border border-slate-800">
                                    <Activity className="h-3 w-3 text-indigo-400" />
                                    <input
                                        type="text"
                                        placeholder="Filter by Campaign ID..."
                                        className="bg-transparent border-none text-[10px] font-black text-slate-300 focus:ring-0 w-32 outline-none p-0 placeholder:text-slate-600"
                                        value={filterId || ''}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setFilterId(e.target.value || null)}
                                    />
                                    {filterId && (
                                        <X className="h-3 w-3 text-slate-500 cursor-pointer hover:text-white" onClick={(e) => { e.stopPropagation(); setFilterId(null); }} />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {errorCount > 0 && (
                                <Badge variant="destructive" className="bg-rose-500/10 text-rose-500 border-rose-500/20 text-[10px] font-bold">
                                    {errorCount} ERRORS
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); clearLogs(); }}
                                className="h-7 w-7 text-slate-500 hover:text-white hover:bg-slate-800"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <div className="text-slate-400">
                                {isMinimized ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0 bg-black/40">
                        <div className="h-[350px] overflow-y-auto p-4 font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700">
                            {logs.filter(l => !filterId || l.message.includes(` ${filterId} `) || l.campaign_id?.toString() === filterId).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3 opacity-50">
                                    <Terminal className="h-8 w-8" />
                                    <p className="font-bold tracking-widest uppercase text-[10px]">{filterId ? `No signals for ID: ${filterId}` : 'Awaiting system signals...'}</p>
                                </div>
                            ) : (
                                logs
                                    .filter(l => !filterId || l.message.includes(` ${filterId} `) || l.campaign_id?.toString() === filterId)
                                    .map((log, i) => (
                                        <div key={i} className="flex gap-4 group hover:bg-white/5 p-1 rounded transition-colors">
                                            <span className="text-slate-600 w-20 shrink-0 tabular-nums">
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                                            </span>
                                            <span className={`${getColorClass(log.level)} break-all leading-relaxed`}>
                                                <span className="font-black uppercase mr-2 opacity-50">[{log.level}]</span>
                                                {log.message}
                                            </span>
                                        </div>
                                    ))
                            )}
                            <div ref={bottomRef} />
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ConsoleMonitor;
