'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Trash2, Minimize2, Maximize2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface LogEntry {
    timestamp: string;
    level: string;
    campaign_id?: number;
    message: string;
    data?: any;
}

export const LiveTerminal: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const terminalRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    useEffect(() => {
        // Connect to SSE endpoint
        const connectSSE = () => {
            try {
                // Use window.location.origin for production compatibility
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const sseUrl = `${baseUrl}/api/v1/live-logs/stream`;
                console.log('Connecting to SSE:', sseUrl);
                const eventSource = new EventSource(sseUrl);

                eventSource.onopen = () => {
                    console.log('SSE connected');
                    setIsConnected(true);
                    addLog({
                        timestamp: new Date().toISOString(),
                        level: 'info',
                        message: 'Connected to live log stream'
                    });
                };

                eventSource.onmessage = (event) => {
                    console.log('📨 SSE MESSAGE RECEIVED:', event.data);
                    try {
                        const log: LogEntry = JSON.parse(event.data);
                        console.log('✅ Parsed log:', log);
                        addLog(log);
                    } catch (err) {
                        console.error('❌ Failed to parse log:', err, 'Raw data:', event.data);
                    }
                };

                eventSource.onerror = (error) => {
                    console.error('❌ SSE ERROR:', error);
                    console.error('EventSource readyState:', eventSource.readyState);
                    setIsConnected(false);
                    addLog({
                        timestamp: new Date().toISOString(),
                        level: 'error',
                        message: '🔴 SSE Connection Error - Reconnecting in 3s...'
                    });
                    eventSource.close();

                    // Retry connection after 3 seconds
                    setTimeout(() => {
                        console.log('🔄 Retrying SSE connection...');
                        connectSSE();
                    }, 3000);
                };

                eventSourceRef.current = eventSource;
            } catch (err) {
                console.error('Failed to connect SSE:', err);
            }
        };

        connectSSE();

        // Cleanup on unmount
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    const addLog = (log: LogEntry) => {
        setLogs(prev => {
            const newLogs = [...prev, log];
            // Keep only last 200 logs
            return newLogs.slice(-200);
        });
    };

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (terminalRef.current && !isCollapsed) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs, isCollapsed]);

    const clearLogs = async () => {
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
            await fetch(`${baseUrl}/api/v1/live-logs/clear`, { method: 'POST' });
            setLogs([]);
        } catch (err) {
            console.error('Failed to clear logs:', err);
        }
    };

    const formatTimestamp = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch {
            return timestamp;
        }
    };

    const getLevelColor = (level: string) => {
        switch (level.toLowerCase()) {
            case 'success':
                return 'text-green-400';
            case 'error':
                return 'text-red-400';
            case 'warning':
                return 'text-yellow-400';
            case 'info':
            default:
                return 'text-blue-300';
        }
    };

    const getLevelIcon = (level: string) => {
        switch (level.toLowerCase()) {
            case 'success':
                return '✅';
            case 'error':
                return '❌';
            case 'warning':
                return '⚠️';
            default:
                return '📋';
        }
    };

    if (!isVisible) {
        return (
            <div className="fixed bottom-4 right-4 z-50">
                <Button
                    onClick={() => setIsVisible(true)}
                    className="flex items-center gap-2 bg-gray-900 text-green-400 hover:bg-gray-800"
                >
                    <Terminal className="h-4 w-4" />
                    Show Terminal
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full mt-6">
            <Card className="bg-gray-900 border-gray-700 overflow-hidden">
                {/* Terminal Header */}
                <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-green-400" />
                        <span className="font-mono text-sm text-green-400 font-semibold">
                            Live Process Monitor
                        </span>
                        <span className="ml-2 flex items-center gap-1">
                            <span
                                className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                                    }`}
                            />
                            <span className="text-xs text-gray-400">
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={clearLogs}
                            variant="ghost"
                            size="sm"
                            className="h-7 text-gray-400 hover:text-white"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                        <Button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            variant="ghost"
                            size="sm"
                            className="h-7 text-gray-400 hover:text-white"
                        >
                            {isCollapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                        </Button>
                        <Button
                            onClick={() => setIsVisible(false)}
                            variant="ghost"
                            size="sm"
                            className="h-7 text-gray-400 hover:text-white"
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                {/* Terminal Body */}
                {!isCollapsed && (
                    <div
                        ref={terminalRef}
                        className="bg-black p-4 font-mono text-sm text-gray-300 overflow-y-auto"
                        style={{ maxHeight: '400px', minHeight: '200px' }}
                    >
                        {logs.length === 0 ? (
                            <div className="text-gray-500 text-center py-8">
                                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>Waiting for process logs...</p>
                                <p className="text-xs mt-1">Start a scheduled resume or launch to see live updates</p>
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div key={index} className="mb-1 flex gap-2 text-xs leading-relaxed">
                                    <span className="text-gray-500 select-none">
                                        {formatTimestamp(log.timestamp)}
                                    </span>
                                    <span className="select-none">{getLevelIcon(log.level)}</span>
                                    <span className={getLevelColor(log.level)}>{log.message}</span>
                                    {log.campaign_id && (
                                        <span className="text-gray-600 text-xs">
                                            [Campaign {log.campaign_id}]
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
};
