'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  apiClient,
  serviceAccountsApi,
  usersApi,
  campaignsApi,
  API_URL
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sidebar } from '@/components/Sidebar';
import { Loader2, RefreshCw, X, Save } from 'lucide-react';


// Interfaces from the new campaign page, adapted for the edit page
interface Account {
  id: number;
  name: string;
  client_email: string;
  domain: string;
  status: string;
  total_users: number;
  quota_used_today: number;
  quota_limit: number;
}

interface User {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  service_account_id: number;
}

interface RecipientList {
  id: number;
  name: string;
  contacts: Array<{ email: string }>;
}

interface Campaign {
  id: number;
  name: string;
  subject: string;
  from_name: string;
  body_html: string;
  sender_accounts: Account[];
  recipients: Array<{ email: string }>;
  test_after_count?: number;
  test_after_email?: string;
}

export default function EditCampaignPage() {
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [recipientsText, setRecipientsText] = useState('');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [testAfterCount, setTestAfterCount] = useState(100);
  const [testAfterEmail, setTestAfterEmail] = useState('');

  const [notifications, setNotifications] = useState<Array<{ id: string, message: string, type: 'success' | 'error' | 'info' }>>([]);
  const [userSearch, setUserSearch] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const [showTestModal, setShowTestModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [recipientLists, setRecipientLists] = useState<RecipientList[]>([]);

  const [testSender, setTestSender] = useState<string>('');
  const [testRecipient, setTestRecipient] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  const appendLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString();
    setLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 499)]);
  }, []);

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Load all necessary data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      appendLog('🚀 Initializing campaign edit page...');
      try {
        // Fetch accounts, users, and campaign data in parallel
        const [accRes, usersRes, campRes] = await Promise.all([
          serviceAccountsApi.list(),
          usersApi.list(),
          campaignsApi.get(id)
        ]);

        const users = usersRes.data || [];
        const adminCount = users.filter((u: User) => u.email.includes('admin')).length;
        setAllUsers(users);
        appendLog(`✅ Users loaded: ${users.length} total, ${adminCount} admins excluded.`);

        setAccounts(accRes.data || []);
        appendLog(`✅ Accounts loaded: ${accRes.data?.length || 0}`);

        const campaign: Campaign = campRes.data;
        setName(campaign.name || '');
        setSubject(campaign.subject || '');
        setFromName(campaign.from_name || '');
        setBodyHtml(campaign.body_html || '');
        setRecipientsText(campaign.recipients.map(r => r.email).join('\n'));
        setSelectedAccounts(campaign.sender_accounts.map(a => a.id));
        setTestAfterCount(campaign.test_after_count || 100);
        setTestAfterEmail(campaign.test_after_email || '');
        appendLog(`✅ Campaign #${id} loaded successfully.`);

      } catch (error) {
        showNotification('Failed to load initial page data.', 'error');
        appendLog('❌ Critical error: Failed to load page data.');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    if (id) loadInitialData();
  }, [id, appendLog, showNotification]);

  const loadRecipientLists = useCallback(async () => {
    try {
      const response = await apiClient.request('/api/v1/contacts/lists');
      setRecipientLists(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      showNotification('Failed to load recipient lists.', 'error');
    }
  }, [showNotification]);

  useEffect(() => {
    if (showRecipientModal) loadRecipientLists();
  }, [showRecipientModal, loadRecipientLists]);

  const handleAccountSelection = (accountId: number, isSelected: boolean) => {
    setSelectedAccounts(prev =>
      isSelected ? [...prev, accountId] : prev.filter(id => id !== accountId)
    );
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccounts.length === accounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(accounts.map(acc => acc.id));
    }
  };

  const filteredUsers = useMemo(() => {
    const nonAdminUsers = allUsers.filter(user => !user.email.includes('admin'));
    if (selectedAccounts.length === 0) return [];
    return nonAdminUsers.filter(user =>
      selectedAccounts.includes(user.service_account_id) &&
      user.email.toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [allUsers, selectedAccounts, userSearch]);

  const recipients = useMemo(() => recipientsText.split('\n').filter(email => email.trim() && email.includes('@')), [recipientsText]);

  const handleUpdateCampaign = async () => {
    setSaving(true);
    try {
      const payload = {
        name,
        subject,
        from_name: fromName,
        body_html: bodyHtml,
        recipients: recipients.map(email => ({ email, variables: {} })),
        sender_account_ids: selectedAccounts,
        test_after_count: testAfterCount,
        test_after_email: testAfterEmail,
      };
      const response = await apiClient.request(`/api/v1/campaigns/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      if (response.error) throw new Error(response.error);
      showNotification('Campaign saved successfully!', 'success');
      router.push(`/campaigns`);
    } catch (error: any) {
      showNotification(`Campaign save failed: ${error?.response?.data?.detail || 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testSender || !testRecipient) {
      showNotification('Please select a sender and enter a recipient.', 'error');
      return;
    }
    setIsSendingTest(true);
    try {
      const response = await apiClient.request('/api/v1/campaigns/test', {
        method: 'POST',
        body: JSON.stringify({
          from_email: testSender,
          to_email: testRecipient,
          from_name: fromName,
          subject: subject,
          body_html: bodyHtml,
        })
      });
      if (response.error) throw new Error(response.error);
      showNotification('Test email sent successfully!', 'success');
      setShowTestModal(false);
    } catch (error: any) {
      showNotification(`Failed to send test email: ${error?.response?.data?.detail || error.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  const loadRecipientList = (list: RecipientList) => {
    const emails = list.contacts.map(c => c.email).join('\n');
    setRecipientsText(prev => prev ? `${prev}\n${emails}` : emails);
    setShowRecipientModal(false);
  };

  if (loading && log.length < 2) {
    return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="animate-spin h-10 w-10" /></div>
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="bg-black text-white font-mono p-4 rounded-md mb-6 text-xs h-32 overflow-y-scroll flex flex-col-reverse">
          <div>{log.map((line, i) => <p key={i}>{line}</p>)}</div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-4 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Google Workspace Accounts ({accounts.length})</CardTitle>
                <Button variant="outline" size="sm" onClick={handleSelectAllAccounts}>Select All</Button>
              </CardHeader>
              <CardContent className="max-h-64 overflow-auto">
                {accounts.map(account => (
                  <div key={account.id} className="flex items-center space-x-2 my-2">
                    <Checkbox
                      id={`acc-${account.id}`}
                      checked={selectedAccounts.includes(account.id)}
                      onCheckedChange={(checked) => handleAccountSelection(account.id, !!checked)}
                    />
                    <Label htmlFor={`acc-${account.id}`} className="flex items-center gap-2">
                      <span>{account.client_email}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${account.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{account.status}</span>
                    </Label>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Users of Selected Accounts ({filteredUsers.length})</CardTitle>
                <Button variant="outline" size="icon" onClick={() => { /* Re-load users maybe? For now, it's loaded on start */ }}><RefreshCw className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="Search users by email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
                <div className="max-h-64 overflow-auto mt-2 text-sm border rounded-md">
                  {filteredUsers.map(user => (
                    <div key={user.id} className="p-1 truncate">{user.email}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="xl:col-span-5 space-y-6">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <Input placeholder="Campaign Name" value={name} onChange={e => setName(e.target.value)} />
                <Input placeholder="From Name" value={fromName} onChange={e => setFromName(e.target.value)} />
                <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recipients ({recipients.length})</CardTitle>
                <Button variant="outline" onClick={() => setShowRecipientModal(true)}>Load Lists</Button>
              </CardHeader>
              <CardContent>
                <Textarea placeholder="Enter one email per line" value={recipientsText} onChange={e => setRecipientsText(e.target.value)} rows={8} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Email Composer</CardTitle></CardHeader>
              <CardContent>
                <Textarea placeholder="Email Body (HTML)" rows={12} value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} />
              </CardContent>
            </Card>
          </div>

          <div className="xl:col-span-3 space-y-6">
            <Card>
              <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setShowTestModal(true)}>Send Test Email</Button>
                <Button variant="outline" className="w-full" onClick={() => setShowPreviewModal(true)}>Preview Email</Button>
                <Button className="w-full" onClick={handleUpdateCampaign} disabled={saving || loading || recipients.length === 0}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Campaign'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Test After</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Label>Send test after N emails</Label>
                <Input type="number" value={testAfterCount} onChange={e => setTestAfterCount(parseInt(e.target.value) || 0)} />
                <Label>Test Recipient Email</Label>
                <Input placeholder="test.recipient@example.com" value={testAfterEmail} onChange={e => setTestAfterEmail(e.target.value)} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Modals are the same as the new campaign page */}
        {showTestModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-lg">
              <CardTitle>Send Test Email</CardTitle>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Send From</Label>
                  <Select onValueChange={setTestSender} value={testSender}>
                    <SelectTrigger><SelectValue>{testSender ? testSender : <span className="text-muted-foreground">Select a user to send from...</span>}</SelectValue></SelectTrigger>
                    <SelectContent>
                      {filteredUsers.map(u => <SelectItem key={u.id} value={u.email}>{u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Recipient Email</Label>
                  <Input placeholder="recipient@example.com" value={testRecipient} onChange={e => setTestRecipient(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="ghost" onClick={() => setShowTestModal(false)}>Cancel</Button>
                <Button onClick={handleSendTestEmail} disabled={isSendingTest}>{isSendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}</Button>
              </div>
            </div>
          </div>
        )}

        {showPreviewModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-1 w-full max-w-4xl h-4/5">
              <div className="flex justify-between items-center p-4 border-b">
                <CardTitle>Email Preview</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowPreviewModal(false)}><X className="h-4 w-4" /></Button>
              </div>
              <iframe srcDoc={bodyHtml} className="w-full h-full border-0" />
            </div>
          </div>
        )}

        {showRecipientModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
              <h3 className="text-lg font-semibold mb-4">Load Recipients from Contact List</h3>
              {recipientLists.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recipientLists.map(list => (
                    <div key={list.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="font-medium">{list.name}</div>
                        <div className="text-sm text-gray-500">{list.contacts.length} recipients</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => loadRecipientList(list)}>Load</Button>
                    </div>
                  ))}
                </div>
              ) : <p>No lists found. You can create new lists in the Contacts page.</p>}
              <div className="flex justify-end mt-4">
                <Button onClick={() => setShowRecipientModal(false)}>Close</Button>
              </div>
            </div>
          </div>
        )}

        {notifications.map(notification => (
          <Alert key={notification.id} className={`fixed top-5 right-5 max-w-sm z-50 ${notification.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' :
            notification.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' :
              'border-blue-200 bg-blue-50 text-blue-800'
            }`}>
            <AlertDescription>{notification.message}</AlertDescription>
          </Alert>
        ))}
      </main>
    </div>
  );
}
