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
  const [sortBy, setSortBy] = useState('latest');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
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

  const filteredCampaigns = draftCampaigns
    .filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.subject.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'latest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'reach') return (b.recipients_count || 0) - (a.recipients_count || 0);
      if (sortBy === 'healthy') return (b.opens_count || 0) - (a.opens_count || 0);
      return 0;
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

  const deleteDraft = async (draft_id: number) => {
    if (!confirm('Are you sure you want to delete this draft?')) return;
    try {
      const response = await draftsApi.delete(draft_id);
      if (response.error) throw new Error(response.error as string);
      setDraftCampaigns(prev => prev.filter(d => d.id !== draft_id));
      setSelectedIds(prev => prev.filter(id => id !== draft_id));
    } catch (err: any) {
      setError(`Failed to delete draft: ${err.message}`);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCampaigns.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCampaigns.map(c => c.id));
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} campaigns?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedIds.map(id => draftsApi.delete(id)));
      setDraftCampaigns(prev => prev.filter(c => !selectedIds.includes(c.id)));
      setSelectedIds([]);
      alert(`✅ Successfully deleted ${selectedIds.length} campaigns.`);
    } catch (err: any) {
      setError(`Bulk delete failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const bulkLaunch = async () => {
    if (!confirm(`Ready to launch ${selectedIds.length} campaigns simultaneously?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedIds.map(id => apiClient.request(`/api/v1/drafts/${id}/launch-ultra`, { method: 'POST' })));
      setSelectedIds([]);
      fetchDraftCampaigns();
      alert(`🚀 Launch sequence initiated for ${selectedIds.length} campaigns.`);
    } catch (err: any) {
      setError(`Bulk launch failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const bulkDuplicate = async () => {
    if (!confirm(`Duplicate ${selectedIds.length} selected campaigns?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedIds.map(id => apiClient.request(`/api/v1/drafts/${id}/duplicate`, { method: 'POST' })));
      setSelectedIds([]);
      fetchDraftCampaigns();
      alert(`✅ Successfully duplicated ${selectedIds.length} campaigns.`);
    } catch (err: any) {
      setError(`Bulk duplication failed: ${err.message}`);
    } finally {
      setLoading(false);
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
            <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300 relative border-l-4 border-l-indigo-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 transition-transform group-hover:scale-110 duration-500">
                    <Activity className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-black px-2 py-0.5 animate-pulse">LIVE SYSTEM</Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-black text-slate-900 tabular-nums tracking-tighter">{summaryStats.activeDispatches}</div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">In Orbit</span>
                </div>
                <p className="text-[11px] text-slate-400 font-bold mt-1">Concurrently Sending Batches</p>
                <div className="mt-4 flex gap-1 h-1.5">
                  <div className="flex-1 bg-indigo-500 rounded-full" />
                  <div className="flex-1 bg-indigo-500/40 rounded-full" />
                  <div className="flex-1 bg-indigo-500/20 rounded-full" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300 relative border-l-4 border-l-blue-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 transition-transform group-hover:scale-110 duration-500">
                    <Target className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase">
                    <ArrowUpRight className="h-3 w-3" /> 12% MoM
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-black text-slate-900 tabular-nums tracking-tighter">{summaryStats.totalReach.toLocaleString()}</div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reached</span>
                </div>
                <p className="text-[11px] text-slate-400 font-bold mt-1">Aggregated Contact Ecosystem</p>
                <div className="mt-4 flex gap-1 h-1.5">
                  <div className="flex-1 bg-blue-500 rounded-full" />
                  <div className="flex-1 bg-blue-500/40 rounded-full" />
                  <div className="flex-1 bg-blue-500/20 rounded-full" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300 relative border-l-4 border-l-purple-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 transition-transform group-hover:scale-110 duration-500">
                    <Mail className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-none text-[10px] font-black px-2 py-0.5">READY</Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-black text-slate-900 tabular-nums tracking-tighter">{summaryStats.totalReady.toLocaleString()}</div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Staged</span>
                </div>
                <p className="text-[11px] text-slate-400 font-bold mt-1">Awaiting Google API Dispatch</p>
                <div className="mt-4 flex gap-1 h-1.5">
                  <div className="flex-1 bg-purple-500 rounded-full" />
                  <div className="flex-1 bg-purple-500/40 rounded-full" />
                  <div className="flex-1 bg-purple-500/20 rounded-full" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-white overflow-hidden group hover:translate-y-[-2px] transition-all duration-300 relative border-l-4 border-l-emerald-500">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-110 duration-500">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="text-[10px] font-black text-emerald-600 uppercase animate-pulse">OPTIMIZED</div>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-black text-slate-900 tabular-nums tracking-tighter">{summaryStats.successRate}%</div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Health Index</span>
                </div>
                <p className="text-[11px] text-slate-400 font-bold mt-1">Predictive Open/Reach Coefficient</p>
                <div className="mt-4 flex gap-1 h-1.5">
                  <div className="flex-1 bg-emerald-500 rounded-full" />
                  <div className="flex-1 bg-emerald-500/40 rounded-full" />
                  <div className="flex-1 bg-emerald-500/20 rounded-full" />
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
                    <TrendingUp className="h-4 w-4 text-slate-400" />
                    Sort: <span className="text-indigo-600 capitalize">{sortBy}</span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl border-none shadow-xl">
                  {[
                    { val: 'latest', label: 'Latest Outreach' },
                    { val: 'reach', label: 'Highest Reach' },
                    { val: 'healthy', label: 'Open Performance' }
                  ].map((s) => (
                    <DropdownMenuItem
                      key={s.val}
                      onClick={() => setSortBy(s.val)}
                      className="rounded-lg font-bold text-xs uppercase tracking-wider py-2 cursor-pointer focus:bg-indigo-50 focus:text-indigo-700"
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="h-6 w-[1px] bg-slate-200 mx-2 hidden md:block" />

              <Button
                onClick={toggleSelectAll}
                variant="ghost"
                className={`rounded-xl px-4 h-11 text-sm font-bold transition-all ${selectedIds.length === filteredCampaigns.length ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {selectedIds.length === filteredCampaigns.length ? 'Deselect All' : 'Select All'}
              </Button>

              <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">
                {selectedIds.length > 0 ? `${selectedIds.length} Selected` : `Showing ${filteredCampaigns.length} Results`}
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
                <Card
                  key={campaign.id}
                  className={`border-none shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-white rounded-2xl overflow-hidden hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-500 group border-t-4 flex flex-col relative ${selectedIds.includes(campaign.id) ? 'border-t-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/10' : 'border-t-transparent hover:border-t-indigo-500'}`}
                >
                  {/* Selection Overlay */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(campaign.id);
                    }}
                    className={`absolute top-4 left-4 z-20 w-6 h-6 rounded-lg border-2 cursor-pointer transition-all flex items-center justify-center ${selectedIds.includes(campaign.id) ? 'bg-indigo-600 border-indigo-600 shadow-md shadow-indigo-200' : 'bg-white border-slate-200 opacity-0 group-hover:opacity-100 hover:border-indigo-400'}`}
                  >
                    {selectedIds.includes(campaign.id) && <Activity className="h-3 w-3 text-white" />}
                  </div>

                  {/* Active Pulse Indicator */}
                  {(campaign.status === 'sending' || campaign.status === 'launched') && (
                    <div className="absolute top-0 right-0 p-4">
                      <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 animate-in fade-in zoom-in duration-700">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[8px] font-black text-emerald-600 uppercase tracking-tighter">Live Dispatch</span>
                      </div>
                    </div>
                  )}

                  <CardHeader className={`p-6 pb-4 transition-all duration-300 ${selectedIds.includes(campaign.id) ? 'pl-14' : 'group-hover:pl-14'}`}>
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
                              <DropdownMenuItem onClick={() => openScheduleModal(campaign.id)} className="rounded-lg gap-2 py-2.5 font-bold text-xs cursor-pointer text-blue-600 focus:bg-blue-50 focus:text-blue-700">
                                <Rocket className="h-4 w-4" /> Hyper-Resume (ms)
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

      {/* ULTRA: Floating Bulk Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Outreach</span>
              <span className="text-white font-black text-lg">{selectedIds.length} Campaigns</span>
            </div>

            <div className="h-10 w-[1px] bg-slate-700" />

            <div className="flex items-center gap-3">
              <Button
                onClick={bulkLaunch}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-12 gap-2 px-6"
              >
                <Rocket className="h-4 w-4" />
                Launch Selected
              </Button>
              <Button
                onClick={bulkDuplicate}
                variant="outline"
                className="bg-white/10 hover:bg-white/20 border-white/10 text-white font-bold rounded-xl h-12 gap-2"
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
              <Button
                onClick={bulkDelete}
                variant="destructive"
                className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 font-bold rounded-xl h-12 gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Burn
              </Button>
            </div>

            <div className="h-10 w-[1px] bg-slate-700" />

            <button
              onClick={() => setSelectedIds([])}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftsPage;