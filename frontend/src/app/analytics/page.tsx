'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi, campaignsApi } from '@/lib/api';
import { 
  TrendingUp, 
  Mail, 
  CheckCircle, 
  XCircle,
  Clock,
  Zap,
  BarChart3,
  Activity
} from 'lucide-react';

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const [statsRes, campaignsRes] = await Promise.all([
        dashboardApi.stats(),
        campaignsApi.list()
      ]);
      setStats(statsRes.data);
      setCampaigns(Array.isArray(campaignsRes.data) ? campaignsRes.data : []);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalSent = () => {
    if (!campaigns || !Array.isArray(campaigns)) return 0;
    return campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
  };

  const calculateTotalFailed = () => {
    if (!campaigns || !Array.isArray(campaigns)) return 0;
    return campaigns.reduce((sum, c) => sum + (c.failed_count || 0), 0);
  };

  const calculateSuccessRate = () => {
    const total = calculateTotalSent() + calculateTotalFailed();
    if (total === 0) return 0;
    return ((calculateTotalSent() / total) * 100).toFixed(1);
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-lg">Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Analytics & Reports</h1>
            <p className="text-muted-foreground">
              Detailed insights into your email campaigns
            </p>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sent</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{calculateTotalSent().toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{calculateSuccessRate()}%</div>
                <p className="text-xs text-muted-foreground mt-1">Delivery rate</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{campaigns.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {campaigns.filter(c => c.status === 'completed').length} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Failed Emails</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">{calculateTotalFailed()}</div>
                <p className="text-xs text-muted-foreground mt-1">Requires attention</p>
              </CardContent>
            </Card>
          </div>

          {/* Campaign Performance */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Campaign Performance</CardTitle>
              <CardDescription>Detailed breakdown by campaign</CardDescription>
            </CardHeader>
            <CardContent>
              {!campaigns || campaigns.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No campaigns yet</p>
              ) : (
                <div className="space-y-4">
                  {campaigns.map((campaign) => {
                    const total = campaign.total_recipients || 0;
                    const sent = campaign.sent_count || 0;
                    const failed = campaign.failed_count || 0;
                    const pending = campaign.pending_count || 0;
                    const successRate = total > 0 ? ((sent / (sent + failed)) * 100).toFixed(1) : 0;

                    return (
                      <div key={campaign.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">{campaign.name}</h3>
                            <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                          </div>
                          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                            campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                            campaign.status === 'sending' ? 'bg-blue-100 text-blue-700' :
                            campaign.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {campaign.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-1">Total</p>
                            <p className="font-semibold text-lg">{total}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Sent
                            </p>
                            <p className="font-semibold text-lg text-green-600">{sent}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1 flex items-center gap-1">
                              <XCircle className="h-3 w-3" /> Failed
                            </p>
                            <p className="font-semibold text-lg text-red-600">{failed}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Pending
                            </p>
                            <p className="font-semibold text-lg text-yellow-600">{pending}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1 flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" /> Rate
                            </p>
                            <p className="font-semibold text-lg">{successRate}%</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">Progress</span>
                            <span>{sent + failed}/{total}</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-600 to-cyan-600"
                              style={{ width: `${total > 0 ? ((sent + failed) / total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground">
                          Created: {new Date(campaign.created_at).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  Sending Speed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="text-5xl font-bold mb-2">
                    <span className="bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
                      ⚡
                    </span>
                  </div>
                  <p className="text-2xl font-bold mb-2">PowerMTA Mode</p>
                  <p className="text-muted-foreground">
                    Ultra-fast parallel sending enabled
                  </p>
                  <p className="text-sm text-muted-foreground mt-4">
                    Target: 15,000 emails in &lt;15 seconds
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Accounts</span>
                    <span className="font-semibold text-green-600">
                      {stats?.total_accounts || 0} Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Available Senders</span>
                    <span className="font-semibold text-green-600">
                      {stats?.total_users || 0} Users
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Today&apos;s Quota Used</span>
                    <span className="font-semibold">
                      {stats?.emails_sent_today || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Error Rate</span>
                    <span className="font-semibold text-green-600">
                      {calculateTotalFailed() > 0 
                        ? ((calculateTotalFailed() / (calculateTotalSent() + calculateTotalFailed())) * 100).toFixed(2)
                        : 0}%
                    </span>
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

