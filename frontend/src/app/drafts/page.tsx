'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// axios removed

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
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
  Mail
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { TestDraftDialog } from '@/components/drafts/TestDraftDialog';
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
}

const DraftsPage: React.FC = () => {
  const [draftCampaigns, setDraftCampaigns] = useState<DraftCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedDraftForSchedule, setSelectedDraftForSchedule] = useState<number | null>(null);
  const [scheduleConfig, setScheduleConfig] = useState({ repetitions: 20, interval_seconds: 1 });
  const [testDraftId, setTestDraftId] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchDraftCampaigns();
  }, []);

  const fetchDraftCampaigns = async () => {
    try {
      const response = await apiClient.request('/api/v1/drafts');
      if (response.error) throw new Error(response.error);
      setDraftCampaigns(response.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch draft campaigns.');
    }
  };

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
      alert(`✅ Scheduled resume started: ${scheduleConfig.repetitions} iterations, ${scheduleConfig.interval_seconds}s interval`);
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
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Draft Management</h1>
          <p className="text-gray-600 mt-2">Manage your saved draft campaigns</p>
        </div>
        <Button onClick={() => router.push('/drafts/new')} className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Create New Draft
        </Button>
      </div>

      {error && (
        <Alert className="mb-4 border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {draftCampaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Draft Campaigns</h3>
              <p className="text-gray-500 mb-4">You haven&apos;t created any draft campaigns yet.</p>
              <Button onClick={() => router.push('/drafts/new')} className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Create Your First Draft
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {draftCampaigns.map((campaign) => (
            <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-medium">{campaign.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(campaign.status)}
                    <span className="text-sm text-gray-500">
                      {campaign.total_drafts} drafts
                    </span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push(`/drafts/edit/${campaign.id}`)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>

                    {(campaign.status === 'failed' || campaign.status === 'created' || campaign.status === 'draft') && (
                      <DropdownMenuItem
                        onClick={() => retryUpload(campaign.id)}
                        disabled={loading}
                        className="text-orange-600"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {campaign.status === 'failed' ? 'Retry Upload' : 'Upload Drafts'}
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuItem onClick={() => duplicateDraft(campaign.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setTestDraftId(campaign.id)}
                      className="text-indigo-600"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Test
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => launchDrafts(campaign.id)}
                      disabled={loading || (campaign.status !== 'ready' && campaign.status !== 'uploaded')}
                      className="text-green-600"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Launch
                    </DropdownMenuItem>
                    {(campaign.status === 'ready' || campaign.status === 'uploaded') && (
                      <>
                        <DropdownMenuItem
                          onClick={() => resumeNow(campaign.id)}
                          disabled={loading}
                          className="text-blue-600"
                        >
                          <Rocket className="h-4 w-4 mr-2" />
                          Resume Now
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openScheduleModal(campaign.id)}
                          disabled={loading}
                          className="text-purple-600"
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Schedule Resume
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={() => deleteDraft(campaign.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Subject: {campaign.subject}</p>
                    {campaign.from_name && (
                      <p className="text-sm text-gray-600">From: {campaign.from_name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Recipients:</span>
                      <span className="ml-1 font-medium">{campaign.recipients_count || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Users:</span>
                      <span className="ml-1 font-medium">{campaign.users_count || 0}</span>
                    </div>
                  </div>
                  {/* Debug info */}
                  <div className="text-xs text-gray-400">
                    Debug: recipients_count={campaign.recipients_count}, users_count={campaign.users_count}
                  </div>

                  {campaign.drafts_by_user && Object.keys(campaign.drafts_by_user).length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Drafts by User:</p>
                      <div className="max-h-24 overflow-y-auto">
                        {Object.entries(campaign.drafts_by_user).map(([user, count]) => (
                          <div key={user} className="flex justify-between text-xs text-gray-600">
                            <span className="truncate">{user}</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 text-right">
                    Created {format(new Date(campaign.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Schedule Resume Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Schedule Resume</h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Auto-launch ALL Gmail drafts at regular intervals (PowerMTA-style).
              Perfect for warming up accounts and spreading out email blasts.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Repetitions
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={scheduleConfig.repetitions}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, repetitions: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="20"
                />
                <p className="text-xs text-gray-500 mt-1">
                  How many times to repeat the resume process (1-1000)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interval (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  max="3600"
                  value={scheduleConfig.interval_seconds}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, interval_seconds: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Seconds between each repetition (1-3600)
                </p>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                <p className="text-sm text-blue-700">
                  <strong>Total duration:</strong> ~{scheduleConfig.repetitions * scheduleConfig.interval_seconds} seconds
                  <br />
                  <strong>Example:</strong> 20 reps × 1s = launches all drafts 20 times over 20 seconds
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={startScheduledResume}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Clock className="h-4 w-4" />
                  Start Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TestDraftDialog
        open={!!testDraftId}
        draftId={testDraftId}
        onClose={() => setTestDraftId(null)}
      />
    </div>
  );
};

export default DraftsPage;