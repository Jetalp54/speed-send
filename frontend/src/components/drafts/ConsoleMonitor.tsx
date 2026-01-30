
import React, { useEffect, useState, useRef } from 'react';
import { Card, CardHeader, CardContent, Divider, Typography, Box, Badge, IconButton } from '@mui/material';
import TerminalIcon from '@mui/icons-material/Terminal';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

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
            eventSource = new EventSource('http://localhost:8000/api/v1/live-logs/stream');

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

    const getColor = (level: string) => {
        switch (level) {
            case 'success': return '#4caf50'; // Green
            case 'error': return '#f44336';   // Red
            case 'warning': return '#ff9800'; // Orange
            case 'system': return '#2196f3';  // Blue
            default: return '#e0e0e0';        // White/Grey
        }
    };

    return (
        <Card variant="outlined" sx={{
            mt: 4,
            bgcolor: '#0a0a0a',
            color: '#f0f0f0',
            border: '1px solid #333',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}>
            <CardHeader
                title={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Badge variant="dot" color={connected ? "success" : "error"}>
                            <TerminalIcon />
                        </Badge>
                        <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                            LIVE CONSOLE MONITOR
                        </Typography>
                        {connected ? (
                            <Typography variant="caption" sx={{ color: '#4caf50', border: '1px solid #4caf50', px: 1, borderRadius: 1 }}>
                                ONLINE
                            </Typography>
                        ) : (
                            <Typography variant="caption" sx={{ color: '#f44336', border: '1px solid #f44336', px: 1, borderRadius: 1 }}>
                                DISCONNECTED
                            </Typography>
                        )}
                        {errorCount > 0 && (
                            <Typography variant="caption" sx={{ color: '#f44336', fontWeight: 'bold' }}>
                                {errorCount} ERRORS
                            </Typography>
                        )}
                    </Box>
                }
                action={
                    <Box>
                        <IconButton onClick={clearLogs} size="small" sx={{ color: '#ffffff80', mr: 1 }} title="Clear">
                            <DeleteSweepIcon />
                        </IconButton>
                    </Box>
                }
                sx={{ borderBottom: '1px solid #333' }}
            />
            <CardContent sx={{
                height: '400px',
                overflowY: 'auto',
                p: 2,
                fontFamily: '"Fira Code", monospace',
                fontSize: '0.85rem',
                backgroundColor: '#000'
            }}>
                {logs.length === 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}>
                        <Typography>Waiting for process logs...</Typography>
                    </Box>
                )}

                {logs.map((log, i) => (
                    <Box key={i} sx={{ mb: 0.5, display: 'flex', gap: 2 }}>
                        <Typography component="span" sx={{ color: '#666', minWidth: '80px', fontSize: '0.75rem' }}>
                            {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </Typography>
                        <Typography component="span" sx={{ color: getColor(log.level), flex: 1, wordBreak: 'break-all' }}>
                            {log.message}
                        </Typography>
                    </Box>
                ))}
                <div ref={bottomRef} />
            </CardContent>
        </Card>
    );
};

export default ConsoleMonitor;
