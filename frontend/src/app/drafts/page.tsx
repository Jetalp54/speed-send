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
  Eye
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { serviceAccountsApi, usersApi, dataListsApi, API_URL, apiClient } from '@/lib/api';

interface DraftCampaign {
  id: number;
  name: string;
  subject: string;
  from_name?: string;
  body_html: string;
  created_at: string;
  total_drafts: number;
  drafts_by_user: { [key: string]: number };
  status: 'draft' | 'uploaded' | 'launched';
  recipients_count: number;
  users_count: number;
  emails_per_user: number;
}

const DraftsPage: React.FC = () => {
  const [draftCampaigns, setDraftCampaigns] = useState<DraftCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  const duplicateDraft = async (draftId: number) => {
    try {
      const originalDraft = draftCampaigns.find(d => d.id === draftId);
      if (!originalDraft) return;

      const response = await apiClient.request('/api/v1/drafts', {
        method: 'POST',
        body: JSON.stringify({
          name: `${originalDraft.name} (Copy)`,
          subject: originalDraft.subject,
          from_name: originalDraft.from_name,
          body_html: originalDraft.body_html
        })
      });
      if (response.error) throw new Error(response.error);

      setDraftCampaigns(prev => [...prev, response.data]);
    } catch (err: any) {
      setError(`Failed to duplicate draft: ${err.response?.data?.detail || err.message}`);
    }
  };

  const deleteDraft = async (draftId: number) => {
    if (!confirm('Are you sure you want to delete this draft?')) return;

    try {
      const response = await apiClient.request(`/api/v1/drafts/${draftId}`, { method: 'DELETE' });
      if (response.error) throw new Error(response.error);
      setDraftCampaigns(prev => prev.filter(d => d.id !== draftId));
    } catch (err: any) {
      setError(`Failed to delete draft: ${err.response?.data?.detail || err.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft' },
      uploaded: { color: 'bg-blue-100 text-blue-800', label: 'Uploaded' },
      launched: { color: 'bg-green-100 text-green-800', label: 'Launched' }
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
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
                    <DropdownMenuItem onClick={() => duplicateDraft(campaign.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => launchDrafts(campaign.id)}
                      disabled={loading || campaign.status !== 'uploaded'}
                      className="text-green-600"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Launch
                    </DropdownMenuItem>
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
    </div>
  );
};

export default DraftsPage;