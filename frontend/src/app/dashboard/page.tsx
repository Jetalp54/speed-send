'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboardApi, campaignsApi, serviceAccountsApi, draftsApi } from '@/lib/api';
import {
  Mail,
  Users,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
  Rocket
} from 'lucide-react';

interface DashboardStats {
  total_accounts: number;
  total_users: number;
  total_campaigns: number;
  active_campaigns: number;
  emails_sent_today: number;
  emails_failed_today: number;
  quota_usage: any;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      // Use draftsApi instead of campaignsApi to show real usage
      const [statsRes, draftsRes, accountsRes] = await Promise.all([
        dashboardApi.stats(),
        draftsApi.list(),
        serviceAccountsApi.list()
      ]);

      setStats(statsRes.data);
      // Slice drafts to show recent 5
      setRecentCampaigns(Array.isArray(draftsRes.data) ? draftsRes.data.slice(0, 5) : []);
      setAccounts(Array.isArray(accountsRes.data) ? accountsRes.data : []);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      // Ensure arrays are always initialized even on error
      setRecentCampaigns([]);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateSuccessRate = () => {
    if (!stats) return 0;
    const total = stats.emails_sent_today + stats.emails_failed_today;
    if (total === 0) return 0;
    return ((stats.emails_sent_today / total) * 100).toFixed(1);
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      draft: 'text-gray-500',
      preparing: 'text-blue-400',
      ready: 'text-cyan-500',
      sending: 'text-blue-600',
      paused: 'text-orange-500',
      completed: 'text-green-500',
      failed: 'text-red-500',
    };
    return colors[status] || 'text-gray-500';
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-lg">Loading dashboard...</div>
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
            <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome to Speed-Send - Professional Bulk Email Platform
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Accounts */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Workspace Accounts</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.total_accounts || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.total_users || 0} total users
                </p>
              </CardContent>
            </Card>

            {/* Campaigns */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
                <Rocket className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats?.total_campaigns || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.active_campaigns || 0} active
                </p>
              </CardContent>
            </Card>

            {/* Emails Sent Today */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sent Today</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {stats?.emails_sent_today?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.emails_failed_today || 0} failed
                </p>
              </CardContent>
            </Card>

            {/* Success Rate */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {calculateSuccessRate()}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Delivery performance
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Campaigns */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Campaigns</CardTitle>
                <CardDescription>Latest campaign activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!recentCampaigns || recentCampaigns.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No campaigns yet
                    </p>
                  ) : (
                    recentCampaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {/* Drafts schema uses diff fields: total_drafts / recipients_count */}
                              {campaign.total_drafts || 0}/{campaign.recipients_count || campaign.total_recipients || 0}
                            </p>
                            <p className={`text-xs font-semibold uppercase ${getStatusColor(campaign.status)}`}>
                              {campaign.status}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Account Health */}
            <Card>
              <CardHeader>
                <CardTitle>Account Health</CardTitle>
                <CardDescription>Workspace account status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {!accounts || accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No accounts configured
                    </p>
                  ) : (
                    accounts.map((account) => {
                      const quotaPercent = account.quota_limit > 0
                        ? (account.quota_used_today / account.quota_limit) * 100
                        : 0;

                      return (
                        <div
                          key={account.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{account.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {account.total_users} users
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {account.quota_used_today}/{account.quota_limit}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              {quotaPercent < 50 ? (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                              ) : quotaPercent < 80 ? (
                                <Clock className="h-3 w-3 text-yellow-500" />
                              ) : (
                                <AlertCircle className="h-3 w-3 text-red-500" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {quotaPercent.toFixed(0)}% used
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats Bar */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">PowerMTA Mode</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">Enabled</p>
                  <p className="text-xs text-muted-foreground mt-1">Ultra-fast sending</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Total Senders</span>
                  </div>
                  <p className="text-2xl font-bold">{stats?.total_users || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Available users</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Delivered</span>
                  </div>
                  <p className="text-2xl font-bold">{stats?.emails_sent_today || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Today</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">Failed</span>
                  </div>
                  <p className="text-2xl font-bold">{stats?.emails_failed_today || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

