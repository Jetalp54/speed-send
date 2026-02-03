'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
// axios removed

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Mail,
  Search,
  LayoutGrid,
  TrendingUp,
  Target,
  Users as UsersIcon,
  ChevronDown,
  ArrowUpRight,
  Filter as FilterIcon,
  Plus,
  MoreHorizontal,
  Upload,
  Edit,
  Copy,
  Play,
  Trash2,
  Eye,
  Rocket,
  Clock,
  X,
  Activity
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { TestDraftDialog } from '@/components/drafts/TestDraftDialog';
import ConsoleMonitor from '@/components/drafts/ConsoleMonitor';
import { serviceAccountsApi, usersApi, dataListsApi, draftsApi, API_URL, apiClient } from '@/lib/api';

interface DraftCampaign {
  id: number;
  name: string;
  subject: string;
  from_name?: string;
  body_html: string;
  created_at: string;
  total_drafts: number;
  drafts_by_user: { [key: string]: number };
  status: string;
  recipients_count: number;
  users_count: number;
  emails_per_user: number;
  opens_count?: number;
  clicks_count?: number;
  bounces_count?: number;
}

const DraftsPage: React.FC = () => {
  const [draftCampaigns, setDraftCampaigns] = useState<DraftCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedDraftForSchedule, setSelectedDraftForSchedule] = useState<number | null>(null);
  const [scheduleConfig, setScheduleConfig] = useState({ repetitions: 20, interval_ms: 1000 });
  const [testDraftId, setTestDraftId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [summaryStats, setSummaryStats] = useState({
    activeDispatches: 0,
    totalReach: 0,
    totalReady: 0,
    successRate: 0
  });
  const router = useRouter();

  useEffect(() => {
    fetchDraftCampaigns();

    const refreshInterval = setInterval(() => {
      fetchDraftCampaigns();
    }, 5000); // 5s is plenty for background refresh

    return () => clearInterval(refreshInterval);
  }, []);

  const calculateSummary = (campaigns: DraftCampaign[]) => {
    const activeStates = ['sending', 'ready', 'launched', 'scheduled'];
    setSummaryStats({
      activeDispatches: campaigns.filter(c => activeStates.includes(c.status)).length,
      totalReach: campaigns.reduce((acc, curr) => acc + (curr.recipients_count || 0), 0),
      totalReady: campaigns.reduce((acc, curr) => acc + (curr.total_drafts || 0), 0),
      successRate: campaigns.length > 0 ?
        Math.round((campaigns.filter(c => c.status === 'completed' || c.status === 'sending').length / campaigns.length) * 100) : 0
    });
  };

  const fetchDraftCampaigns = async () => {
    try {
      const response = await apiClient.request('/api/v1/drafts');
      if (response.error) throw new Error(response.error);
      const data = response.data || [];
      setDraftCampaigns(data);
      calculateSummary(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch draft campaigns.');
    }
  };

  const filteredCampaigns = draftCampaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const launchDrafts = async (draftId: number) => {
    setLoading(true);
    try {
      // ULTRA-FAST: Parallel launch across all users simultaneously
      const response = await apiClient.request(`/api/v1/drafts/${draftId}/launch-ultra`, { method: 'POST' });
      if (response.error) throw new Error(response.error);
      setDraftCampaigns(prev => prev.map(d =>
        d.id === draftId ? { ...d, status: 'launched' } : d
      ));
      setError(null);
      // Log success (response has users_count and total_drafts from ultra endpoint)
      if ((response as any).users_count) {
        console.log(`✅ Launch queued: ${(response as any).users_count} users, ${(response as any).total_drafts} drafts`);
      }
    } catch (err: any) {
      setError(`Failed to launch drafts: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // RESUME NOW: Send all Gmail drafts immediately
  const resumeNow = async (draftId: number) => {
    setLoading(true);
    try {
      const response = await apiClient.request(`/api/v1/drafts/${draftId}/resume-now`, { method: 'POST' });
      if (response.error) throw new Error(response.error);
      setError(null);
      alert(`✅ Resume started for ${(response as any).users_count} users!`);
    } catch (err: any) {
      setError(`Failed to resume drafts: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // SCHEDULED RESUME: Auto-launch at intervals
  const startScheduledResume = async () => {
    if (!selectedDraftForSchedule) return;

    setLoading(true);
    try {
      const response = await apiClient.request(
        `/api/v1/drafts/${selectedDraftForSchedule}/resume-scheduled`,
        {
          method: 'POST',
          body: JSON.stringify(scheduleConfig)
        }
      );
      if (response.error) throw new Error(response.error);
      setError(null);
      setShowScheduleModal(false);
      alert(`✅ Scheduled resume started: ${scheduleConfig.repetitions} iterations, ${scheduleConfig.interval_ms}ms (${scheduleConfig.interval_ms / 1000}s) interval`);
    } catch (err: any) {
      setError(`Failed to start scheduled resume: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openScheduleModal = (draftId: number) => {
    setSelectedDraftForSchedule(draftId);
    setShowScheduleModal(true);
  };

  // RETRY UPLOAD: Trigger upload again for failed/created campaigns
  const retryUpload = async (draftId: number) => {
    setLoading(true);
    try {
      const response = await apiClient.request(`/api/v1/drafts/${draftId}/upload`, { method: 'POST' });
      if (response.error) throw new Error(response.error);
      setDraftCampaigns(prev => prev.map(d =>
        d.id === draftId ? { ...d, status: 'ready', total_drafts: (response as any).total_drafts } : d
      ));
      setError(null);
      alert(`✅ Upload successful: ${(response as any).total_drafts} drafts created!`);
    } catch (err: any) {
      setError(`Failed to upload drafts: ${err.response?.data?.detail || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const duplicateDraft = async (draftId: number) => {
    try {
      // Call server-side duplicate endpoint that copies everything
      const response = await apiClient.request(`/api/v1/drafts/${draftId}/duplicate`, {
        method: 'POST'
      });

      if (response.error) throw new Error(response.error);

      setDraftCampaigns(prev => [...prev, response.data]);
      alert(`✅ Draft duplicated successfully with all users, accounts, and contacts!`);
    } catch (err: any) {
      setError(`Failed to duplicate draft: ${err.response?.data?.detail || err.message}`);
    }
  };

  const deleteDraft = async (draftId: number) => {
    if (!confirm('Are you sure you want to delete this draft?')) return;

    try {
      const response = await draftsApi.delete(draftId);
      if (response.error) throw new Error(response.error);
      setDraftCampaigns(prev => prev.filter(d => d.id !== draftId));
    } catch (err: any) {
      setError(`Failed to delete draft: ${err.response?.data?.detail || err.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { color: string, label: string } } = {
      created: { color: 'bg-gray-100 text-gray-800', label: 'Draft' }, // Was 'draft'
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft' },   // Legacy
      uploading: { color: 'bg-yellow-100 text-yellow-800', label: 'Uploading' },
      ready: { color: 'bg-blue-100 text-blue-800', label: 'Ready' }, // Was 'uploaded'
      uploaded: { color: 'bg-blue-100 text-blue-800', label: 'Uploaded' }, // Legacy
      scheduled: { color: 'bg-purple-100 text-purple-800', label: 'Scheduled' },
      sending: { color: 'bg-green-100 text-green-800', label: 'Sending' }, // Was 'launched'
      launched: { color: 'bg-green-100 text-green-800', label: 'Launched' }, // Legacy
      paused: { color: 'bg-orange-100 text-orange-800', label: 'Paused' },
      completed: { color: 'bg-green-800 text-green-100', label: 'Completed' },
      failed: { color: 'bg-red-100 text-red-800', label: 'Failed' },
      canceled: { color: 'bg-gray-500 text-white', label: 'Canceled' }
    };
    const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', label: status };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  return (
    <div className="flex h-screen bg-[#F0F2F5] selection:bg-indigo-100 font-sans">
      <Sidebar />

      <div className="flex-1 overflow-auto bg-[#F0F2F5] pb-12">
        {/* Enterprise Header */}
        <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-30 shadow-sm backdrop-blur-md bg-white/80">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Rocket className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Campaign Center</h1>
              <p className="text-xs text-slate-500 font-medium">Enterprise Outreach Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg mr-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Node: PowerMTA-v4
            </div>

            <Button
              onClick={() => router.push('/drafts/new')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100 gap-2 font-bold px-6"
            >
              <Plus className="h-4 w-4" />
              New Outreach Campaign
            </Button>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto p-8 space-y-8">
          {error && (
            <Alert className="border-red-200 bg-red-50/50 backdrop-blur-sm rounded-xl">
              <AlertDescription className="text-red-800 flex items-center gap-2 font-medium">
                <X className="h-4 w-4" />
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Quick Metrics Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                    <Activity className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-bold">LIVE</Badge>
                </div>
                <div className="text-2xl font-black text-slate-900">{summaryStats.activeDispatches}</div>
                <p className="text-xs text-slate-400 font-medium mt-1">Active Dispatches</p>
                <div className="h-1 w-full bg-slate-50 mt-4 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 w-2/3 rounded-full" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <Target className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600">
                    <ArrowUpRight className="h-3 w-3" /> TOTAL
                  </div>
                </div>
                <div className="text-2xl font-black text-slate-900">{summaryStats.totalReach.toLocaleString()}</div>
                <p className="text-xs text-slate-400 font-medium mt-1">Aggregated Reach</p>
                <div className="h-1 w-full bg-slate-50 mt-4 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-1/2 rounded-full" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                    <Mail className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-none text-[10px] font-bold">STAGED</Badge>
                </div>
                <div className="text-2xl font-black text-slate-900">{summaryStats.totalReady.toLocaleString()}</div>
                <p className="text-xs text-slate-400 font-medium mt-1">Dispatches Ready</p>
                <div className="h-1 w-full bg-slate-50 mt-4 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 w-3/4 rounded-full" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="text-[10px] font-bold text-emerald-600">OPTIMAL</div>
                </div>
                <div className="text-2xl font-black text-slate-900">{summaryStats.successRate}%</div>
                <p className="text-xs text-slate-400 font-medium mt-1">Campaign Health</p>
                <div className="h-1 w-full bg-slate-50 mt-4 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-full rounded-full" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Discovery & Search Row */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Search campaigns by name or subject..."
                className="pl-10 bg-white border-none shadow-sm rounded-xl focus-visible:ring-indigo-500 h-11 text-sm font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="bg-white border-none shadow-sm rounded-xl px-4 gap-2 h-11 text-sm font-bold text-slate-600">
                    <FilterIcon className="h-4 w-4 text-slate-400" />
                    Status: <span className="text-indigo-600 capitalize">{statusFilter}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl border-none shadow-xl">
                  {['all', 'created', 'ready', 'sending', 'completed', 'failed'].map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className="rounded-lg font-bold text-xs uppercase tracking-wider py-2 cursor-pointer focus:bg-indigo-50 focus:text-indigo-700"
                    >
                      {status}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="h-6 w-[1px] bg-slate-200 mx-2 hidden md:block" />

              <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">
                Showing {filteredCampaigns.length} Results
              </p>
            </div>
          </div>

          {filteredCampaigns.length === 0 ? (
            <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm rounded-2xl">
              <CardContent className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-6 text-slate-400">
                  <Mail className="h-10 w-10" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 mb-2">No Outreach Campaigns Found</h3>
                <p className="text-slate-500 max-w-sm mb-8 font-medium italic">
                  {searchQuery || statusFilter !== 'all'
                    ? "No campaigns match your current search or filter criteria. Try adjusting your parameters."
                    : "Your outreach ecosystem is currently empty. Initialize your first campaign to start driving engagement."}
                </p>
                {!searchQuery && statusFilter === 'all' && (
                  <Button onClick={() => router.push('/drafts/new')} className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 font-bold px-8 py-6 rounded-xl gap-3 text-lg">
                    <Plus className="h-5 w-5" />
                    Start Your First Outreach
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {filteredCampaigns.map((campaign) => (
                <Card key={campaign.id} className="border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white rounded-2xl overflow-hidden hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-500 group border-t-4 border-t-transparent hover:border-t-indigo-500 flex flex-col">
                  <CardHeader className="p-6 pb-4">
                    <div className="flex justify-between items-start mb-4">
                      {getStatusBadge(campaign.status)}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl hover:bg-slate-50 text-slate-400">
                            <MoreHorizontal className="h-5 w-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl border-none shadow-2xl">
                          <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Management</div>
                          <DropdownMenuItem onClick={() => router.push(`/drafts/edit/${campaign.id}`)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer focus:bg-indigo-50 focus:text-indigo-700">
                            <Edit className="h-4 w-4" /> Edit Campaign
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateDraft(campaign.id)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer focus:bg-indigo-50 focus:text-indigo-700">
                            <Copy className="h-4 w-4" /> Duplicate Outreach
                          </DropdownMenuItem>

                          <DropdownMenuSeparator className="my-1 mx-2" />
                          <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</div>

                          {(campaign.status === 'failed' || campaign.status === 'created' || campaign.status === 'draft') && (
                            <DropdownMenuItem onClick={() => retryUpload(campaign.id)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer text-orange-600 focus:bg-orange-50 focus:text-orange-700">
                              <Upload className="h-4 w-4" /> Upload To Gmail
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem onClick={() => setTestDraftId(campaign.id)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer text-indigo-600 focus:bg-indigo-50 focus:text-indigo-700">
                            <Mail className="h-4 w-4" /> Send Test Pulse
                          </DropdownMenuItem>

                          {(campaign.status === 'ready' || campaign.status === 'uploaded') && (
                            <>
                              <DropdownMenuItem onClick={() => launchDrafts(campaign.id)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer text-emerald-600 focus:bg-emerald-50 focus:text-emerald-700">
                                <Play className="h-4 w-4" /> Standard Launch
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => resumeNow(campaign.id)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer text-blue-600 focus:bg-blue-50 focus:text-blue-700">
                                <Rocket className="h-4 w-4" /> Hyper-Resume
                              </DropdownMenuItem>
                            </>
                          )}

                          <DropdownMenuSeparator className="my-1 mx-2" />
                          <DropdownMenuItem onClick={() => deleteDraft(campaign.id)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer text-red-500 focus:bg-red-50 focus:text-red-700">
                            <Trash2 className="h-4 w-4" /> Burn Campaign
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{campaign.name}</h3>
                    <p className="text-xs text-slate-400 font-bold tracking-tight mt-1 items-center flex gap-1">
                      <Activity className="h-3 w-3" /> ID: #{campaign.id} • Created {format(new Date(campaign.created_at), 'MMM d')}
                    </p>
                  </CardHeader>

                  <CardContent className="p-6 pt-0 space-y-6 flex-1">
                    <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 group-hover:bg-indigo-50/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 p-1.5 rounded-lg bg-white shadow-sm">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                        </div>
                        <div>
                          <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Subject Line</span>
                          <p className="text-sm font-bold text-slate-700 line-clamp-2 leading-snug">{campaign.subject}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Reach</span>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                            <Target className="h-3 w-3" />
                          </div>
                          <span className="text-sm font-black text-slate-800">{campaign.recipients_count?.toLocaleString() || 0}</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Personas</span>
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                            <UsersIcon className="h-3 w-3" />
                          </div>
                          <span className="text-sm font-black text-slate-800">{campaign.users_count || 0}</span>
                        </div>
                      </div>
                    </div>

                    {campaign.status === 'uploading' && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                          <span className="text-indigo-600 animate-pulse">Syncing to Google...</span>
                          <span className="text-slate-400">{campaign.total_drafts} / {campaign.recipients_count}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, (campaign.total_drafts / (campaign.recipients_count || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-50 grid grid-cols-3 gap-2 text-center">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Opens</span>
                        <div className="text-sm font-black text-emerald-600">{campaign.opens_count || 0}</div>
                      </div>
                      <div className="space-y-1 border-l border-slate-50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Clicks</span>
                        <div className="text-sm font-black text-blue-600">{campaign.clicks_count || 0}</div>
                      </div>
                      <div className="space-y-1 border-l border-slate-50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Bounces</span>
                        <div className="text-sm font-black text-red-500">{campaign.bounces_count || 0}</div>
                      </div>
                    </div>
                  </CardContent>

                  <div className="p-4 bg-slate-50/50 flex gap-2">
                    <Button
                      onClick={() => router.push(`/drafts/${campaign.id}/analytics`)}
                      variant="outline"
                      className="flex-1 rounded-xl h-10 gap-2 border-none shadow-sm bg-white hover:bg-slate-50 font-bold text-xs"
                    >
                      <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                      Analytics
                    </Button>
                    <Button
                      onClick={() => launchDrafts(campaign.id)}
                      disabled={loading || (campaign.status !== 'ready' && campaign.status !== 'uploaded')}
                      className="flex-1 rounded-xl h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 font-bold text-xs text-white"
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      Launch
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Resume Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border-none">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-slate-900">Schedule Resume</h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl mb-6">
              <p className="text-xs text-indigo-700 font-bold leading-relaxed">
                🚀 HYPER-SYNC: Launches ALL Gmail drafts at controlled intervals.
                Optimizes deliverability by mimicking human sending patterns.
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  Repetitions
                </label>
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={scheduleConfig.repetitions}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, repetitions: parseInt(e.target.value) || 1 }))}
                  className="rounded-xl border-slate-200 focus-visible:ring-indigo-500 h-11"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">
                  Interval (ms)
                </label>
                <Input
                  type="number"
                  min="100"
                  max="60000"
                  step="100"
                  value={scheduleConfig.interval_ms}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, interval_ms: parseInt(e.target.value) || 1000 }))}
                  className="rounded-xl border-slate-200 focus-visible:ring-indigo-500 h-11"
                />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                  <span>Estimated Duration:</span>
                  <span className="text-indigo-600">~{(scheduleConfig.repetitions * scheduleConfig.interval_ms / 1000).toFixed(1)}s</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={() => setShowScheduleModal(false)}
                  variant="ghost"
                  className="flex-1 rounded-xl font-bold h-12"
                >
                  Cancel
                </Button>
                <Button
                  onClick={startScheduledResume}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold h-12 text-white shadow-lg shadow-indigo-100"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Start Orbit
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <TestDraftDialog
        open={!!testDraftId}
        draftId={testDraftId}
        onClose={() => setTestDraftId(null)}
      />

      {/* Live Process Monitor Terminal */}
      <ConsoleMonitor />
    </div>
  );
};

export default DraftsPage;
};

export default DraftsPage;