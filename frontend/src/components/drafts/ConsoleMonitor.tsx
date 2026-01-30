
import React, { useEffect, useState, useRef } from 'react';
import { Terminal, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogEntry {
    level: 'info' | 'success' | 'warning' | 'error' | 'system';
    message: string;
    timestamp: string;
    campaign_id?: number | string;
    data?: any;
}

const ConsoleMonitor: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [connected, setConnected] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [errorCount, setErrorCount] = useState(0);

    // Auto-scroll
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    // SSE Connection
    useEffect(() => {
        let eventSource: EventSource | null = null;
        let reconnectTimer: NodeJS.Timeout;

        const connect = () => {
            console.log("ConsoleMonitor: Connecting to SSE...");
            eventSource = new EventSource('/api/v1/live-logs/stream'); // Use relative path for proxy

            eventSource.onopen = () => {
                console.log("ConsoleMonitor: Connected!");
                setConnected(true);
                addSystemLog("Connected to Live Log Stream");
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Filter out keep-alives or empty messages if any
                    setLogs(prev => [...prev.slice(-499), data]); // Keep last 500 logs
                    if (data.level === 'error') setErrorCount(c => c + 1);
                } catch (e) {
                    console.error("Failed to parse log:", event.data);
                }
            };

            eventSource.onerror = (err) => {
                console.error("ConsoleMonitor: SSE Error", err);
                setConnected(false);
                eventSource?.close();

                // Retry in 3s
                reconnectTimer = setTimeout(connect, 3000);
            };
        };

        connect();

        return () => {
            eventSource?.close();
            clearTimeout(reconnectTimer);
        };
    }, []);

    const addSystemLog = (msg: string) => {
        setLogs(prev => [...prev, {
            level: 'system',
            message: msg,
            timestamp: new Date().toISOString()
        }]);
    };

    const clearLogs = () => {
        setLogs([]);
        setErrorCount(0);
        addSystemLog("Console cleared.");
    };

    const getColorClass = (level: string) => {
        switch (level) {
            case 'success': return 'text-green-400';
            case 'error': return 'text-red-400';
            case 'warning': return 'text-orange-400';
            case 'system': return 'text-blue-400';
            default: return 'text-gray-300';
        }
    };

    return (
        <Card className="mt-8 bg-zinc-950 border-zinc-800 text-zinc-100 shadow-2xl">
            <CardHeader className="border-b border-zinc-800 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Terminal className="w-5 h-5 text-zinc-400" />
                            <span className={`absolute -top-1 -right-1 block h-2.5 w-2.5 rounded-full ring-2 ring-zinc-950 ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                        </div>

                        <div className="flex flex-col">
                            <span className="text-sm font-bold font-mono tracking-wider text-zinc-300">LIVE MONITOR</span>
                            <span className={`text-[10px] font-mono ${connected ? 'text-green-500' : 'text-red-500'}`}>
                                {connected ? 'CONNECTED' : 'DISCONNECTED'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {errorCount > 0 && (
                            <Badge variant="destructive" className="font-mono text-xs">
                                {errorCount} ERRORS
                            </Badge>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={clearLogs}
                            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
                            title="Clear Console"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="h-[400px] overflow-y-auto p-4 font-mono text-sm bg-black/50 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    {logs.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
                            <Terminal className="w-8 h-8 opacity-50" />
                            <span>Waiting for process logs...</span>
                        </div>
                    )}

                    {logs.map((log, i) => (
                        <div key={i} className="flex gap-3 mb-1 font-mono text-xs md:text-sm hover:bg-white/5 p-0.5 rounded px-2">
                            <span className="text-zinc-600 shrink-0 select-none w-20">
                                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                            <span className={`${getColorClass(log.level)} break-all`}>
                                {log.message}
                            </span>
                        </div>
                    ))}
                    <div ref={bottomRef} />
                </div>
            </CardContent>
        </Card>
    );
};

export default ConsoleMonitor;
