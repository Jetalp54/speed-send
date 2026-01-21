'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { API_URL } from '@/lib/api';

interface LiveStats {
  campaign_id: number;
  status: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  started_at: string | null;
  completed_at: string | null;
  accounts: Record<string, { sent: number; failed: number; pending: number }>;
}

interface Props {
  campaignId: number;
  onClose?: () => void;
}

export function CampaignLiveDashboard({ campaignId, onClose }: Props) {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to SSE stream
    const url = `${API_URL}/api/v1/campaigns/${campaignId}/stream/`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log('✅ SSE Connected');
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStats(data);
      } catch (error) {
        console.error('SSE parse error:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setConnected(false);
      eventSource.close();
    };

    eventSourceRef.current = eventSource;

    // Cleanup
    return () => {
      eventSource.close();
    };
  }, [campaignId]);

  if (!stats) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse">Connecting to live stream...</div>
        </CardContent>
      </Card>
    );
  }

  const progress = stats.total > 0 ? ((stats.sent + stats.failed) / stats.total) * 100 : 0;
  const successRate = (stats.sent + stats.failed) > 0 ? (stats.sent / (stats.sent + stats.failed)) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-muted-foreground">
          {connected ? 'Live updates active' : 'Disconnected'}
        </span>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-sm text-blue-600 hover:underline">
            Close Dashboard
          </button>
        )}
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">✅ Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.sent.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">❌ Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">⏳ Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.pending.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Overall Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{progress.toFixed(1)}% complete</span>
            <span>{successRate.toFixed(1)}% success rate</span>
          </div>
        </CardContent>
      </Card>

      {/* Per-Account Stats */}
      {stats.accounts && Object.keys(stats.accounts).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Per-Account Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.accounts).map(([accountName, accountStats]) => {
                const accountTotal = accountStats.sent + accountStats.failed + accountStats.pending;
                const accountProgress = accountTotal > 0
                  ? ((accountStats.sent + accountStats.failed) / accountTotal) * 100
                  : 0;

                return (
                  <div key={accountName} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium truncate max-w-[200px]" title={accountName}>
                        {accountName}
                      </span>
                      <span className="text-muted-foreground">
                        <span className="text-green-600">{accountStats.sent}</span>
                        {' / '}
                        <span className="text-red-600">{accountStats.failed}</span>
                        {' / '}
                        <span className="text-blue-600">{accountStats.pending}</span>
                      </span>
                    </div>
                    <Progress value={accountProgress} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Badge */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <span className="text-sm font-medium">Campaign Status:</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${stats.status === 'completed' ? 'bg-green-500' :
              stats.status === 'sending' ? 'bg-blue-500 animate-pulse' :
                stats.status === 'ready' ? 'bg-cyan-500' :
                  stats.status === 'preparing' ? 'bg-yellow-500' :
                    stats.status === 'failed' ? 'bg-red-500' :
                      'bg-gray-500'
            }`}>
            {stats.status.toUpperCase()}
          </span>
        </CardContent>
      </Card>

      {/* Timing */}
      {stats.started_at && (
        <Card>
          <CardContent className="p-4 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Started:</span>
              <span>{new Date(stats.started_at).toLocaleString()}</span>
            </div>
            {stats.completed_at && (
              <div className="flex justify-between">
                <span>Completed:</span>
                <span>{new Date(stats.completed_at).toLocaleString()}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

