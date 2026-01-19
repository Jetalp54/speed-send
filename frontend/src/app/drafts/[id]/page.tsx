'use client';

import React, { useState, useEffect } from 'react';
import { apiClient, API_URL } from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

interface DraftCampaign {
  id: number;
  name: string;
  subject: string;
  created_at: string;
  total_drafts: number;
  drafts_by_user: { [key: string]: number };
}

const DraftCampaignDetailsPage: React.FC = () => {
  const [campaign, setCampaign] = useState<DraftCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();
  const { id } = params;

  useEffect(() => {
    if (id) {
      fetchCampaignDetails(id as string);
    }
  }, [id]);

  const fetchCampaignDetails = async (campaignId: string) => {
    try {
      const response = await apiClient.request(`/api/v1/drafts/${campaignId}`);
      if (response.error) throw new Error(response.error);
      setCampaign(response.data);
    } catch (err: any) {
      setError('Failed to fetch draft campaign details.');
    }
  };

  if (error) {
    return <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>;
  }

  if (!campaign) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Draft Campaign Details</h1>
        <Button onClick={() => router.push('/drafts')}>Back to Drafts</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          <p className="text-sm text-muted-foreground">Created on {format(new Date(campaign.created_at), 'PPpp')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold">Subject</h3>
            <p>{campaign.subject}</p>
          </div>
          <div>
            <h3 className="font-semibold">Total Drafts</h3>
            <p>{campaign.total_drafts}</p>
          </div>
          <div>
            <h3 className="font-semibold">Draft Distribution</h3>
            <ul className="list-disc pl-5">
              {Object.entries(campaign.drafts_by_user).map(([user, count]) => (
                <li key={user}>{user}: {count} drafts</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DraftCampaignDetailsPage;
