'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layout,
  Trash2,
  Plus,
  Send,
  Search,
  Target,
  Zap,
  Mail,
  User,
  ArrowRight,
  Sparkles,
  Eye,
  Code,
  MessageSquare,
  Save,
  LineChart,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { TestDraftDialog } from '@/components/drafts/TestDraftDialog';
import { TemplatePreview } from '@/components/drafts/TemplatePreview';

interface User {
  id: number;
  email: string;
}

interface Account {
  id: number;
  email: string;
}

interface ContactList {
  id: number;
  name: string;
  description: string;
  contact_count: number;
}

interface DraftConfig {
  name: string;
  subject: string;
  body_html: string;
  body_format: 'html' | 'text';
  body_template: string;
  from_name: string;
  selected_account_ids: number[];
  selected_user_ids: number[];
  selected_list_ids: number[];
  use_custom_headers: boolean;
  custom_headers: string;
  distribution_strategy: 'round_robin' | 'even_split';
  emails_per_user: number;
}

const TEMPLATE_TAGS = [
  { tag: '[smtp]', label: 'Sender Email', group: 'System' },
  { tag: '[from]', label: 'Friendly From', group: 'System' },
  { tag: '[subject]', label: 'Subject Line', group: 'System' },
  { tag: '[to]', label: 'Recipient Email', group: 'System' },
  { tag: '[rndn_5]', label: 'Random Digits (5)', group: 'Random' },
  { tag: '[rnda_8]', label: 'Random Alphanumeric (8)', group: 'Random' },
  { tag: '[rndlu_10]', label: 'Random Letters (10)', group: 'Random' },
];

export default function NewDraftPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // UI State
  const [activeTab, setActiveTab] = useState('creative');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [tagGuideOpen, setTagGuideOpen] = useState(false);

  const [config, setConfig] = useState<DraftConfig>({
    name: `Campaign ${new Date().toLocaleDateString()}`,
    subject: '',
    body_html: '',
    body_format: 'html',
    body_template: '',
    from_name: '',
    selected_account_ids: [],
    selected_user_ids: [],
    selected_list_ids: [],
    use_custom_headers: false,
    custom_headers: '',
    distribution_strategy: 'round_robin',
    emails_per_user: 1
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsRes, contactListsRes] = await Promise.all([
          apiClient.request('/api/v1/accounts'),
          apiClient.request('/api/v1/contacts/lists')
        ]);

        setAccounts(accountsRes.data || []);
        setContactLists(contactListsRes.data || []);
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
        toast({ title: 'Error', message: 'Failed to load accounts or lists', type: 'error' });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (config.selected_account_ids.length > 0) {
      const fetchUsers = async () => {
        try {
          const responses = await Promise.all(
            config.selected_account_ids.map(id =>
              apiClient.request(`/api/v1/accounts/${id}/users`)
            )
          );
          const allUsers = responses.flatMap(res => res.data || []);
          setUsers(allUsers);
        } catch (error) {
          console.error('Failed to fetch users:', error);
        }
      };
      fetchUsers();
    } else {
      setUsers([]);
    }
  }, [config.selected_account_ids]);

  const totalReach = useMemo(() => {
    return contactLists
      .filter(list => config.selected_list_ids.includes(list.id))
      .reduce((sum, list) => sum + (list.contact_count || 0), 0);
  }, [contactLists, config.selected_list_ids]);

  const handleCreate = async () => {
    if (!config.name || !config.subject || config.selected_user_ids.length === 0 || config.selected_list_ids.length === 0) {
      toast({ title: 'Missing Info', message: 'Please fill in all mandatory fields.', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiClient.request('/api/v1/drafts', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      if (response.error) throw new Error(response.error);
      toast({ title: 'Success', message: 'Campaign draft successfully initialized.', type: 'success' });
      router.push('/drafts');
    } catch (error: any) {
      toast({ title: 'Error', message: error.message || 'Failed to create campaign', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const insertTag = (tag: string) => {
    const target = config.body_format === 'html' ? 'body_html' : 'body_template';
    setConfig(prev => ({
      ...prev,
      [target]: prev[target as keyof DraftConfig] + tag
    }));
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Action Bar */}
      <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <Input
                value={config.name}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                className="h-8 border-none bg-transparent p-0 text-lg font-bold focus-visible:ring-0 w-64"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                High Velocity Outreach <ChevronRight className="h-3 w-3" /> New Campaign
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-2">
              <Eye className="h-4 w-4" /> Full Preview
            </Button>
            <Button variant="outline" onClick={() => setTestDialogOpen(true)} className="gap-2">
              <Send className="h-4 w-4" /> Send Test
            </Button>
            <Button onClick={handleCreate} disabled={submitting} className="gap-2 px-6">
              {submitting ? <Layout className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Initialize Campaign
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 container grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left & Center: Configuration Workspace */}
        <div className="lg:col-span-8 flex flex-col gap-6 h-[calc(100vh-10rem)] overflow-y-auto pr-2 custom-scrollbar">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="creative" className="gap-2">
                <Sparkles className="h-4 w-4" /> Creative Outreach
              </TabsTrigger>
              <TabsTrigger value="strategy" className="gap-2">
                <Target className="h-4 w-4" /> Distribution Strategy
              </TabsTrigger>
            </TabsList>

            <TabsContent value="creative" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Creative Content</CardTitle>
                      <CardDescription>Design your message and define identity parameters.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 bg-muted p-1 rounded-md">
                      <Button
                        variant={config.body_format === 'html' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setConfig(prev => ({ ...prev, body_format: 'html' }))}
                        className="h-8"
                      >HTML</Button>
                      <Button
                        variant={config.body_format === 'text' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setConfig(prev => ({ ...prev, body_format: 'text' }))}
                        className="h-8"
                      >Text</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Identity Name</Label>
                      <Input
                        placeholder="e.g. John from SpeedSend"
                        value={config.from_name}
                        onChange={(e) => setConfig(prev => ({ ...prev, from_name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subject Line</Label>
                      <Input
                        placeholder="Enter headline..."
                        value={config.subject}
                        onChange={(e) => setConfig(prev => ({ ...prev, subject: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 relative">
                    <div className="flex justify-between items-center mb-1">
                      <Label>Message Body ({config.body_format.toUpperCase()})</Label>
                      <Button variant="ghost" size="sm" onClick={() => setTagGuideOpen(!tagGuideOpen)} className="h-7 gap-1 text-xs">
                        <HelpCircle className="h-3 w-3" /> Tag Guide
                      </Button>
                    </div>
                    <Textarea
                      placeholder={config.body_format === 'html' ? "Enter HTML source..." : "Enter plain text message..."}
                      className="min-h-[300px] font-mono text-sm leading-relaxed"
                      value={config.body_format === 'html' ? config.body_html : config.body_template}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        [config.body_format === 'html' ? 'body_html' : 'body_template']: e.target.value
                      }))}
                    />
                    {tagGuideOpen && (
                      <div className="absolute top-10 right-4 w-64 bg-card border rounded-lg shadow-xl p-4 z-10 animate-in slide-in-from-right-2">
                        <h4 className="text-xs font-bold uppercase mb-3 flex items-center gap-2">
                          <Code className="h-3 w-3" /> Tag Insertion
                        </h4>
                        <div className="space-y-2">
                          {TEMPLATE_TAGS.map(tag => (
                            <button
                              key={tag.tag}
                              onClick={() => insertTag(tag.tag)}
                              className="flex justify-between items-center w-full p-2 text-[11px] rounded hover:bg-muted transition-colors"
                            >
                              <code className="text-primary font-bold">{tag.tag}</code>
                              <span className="text-muted-foreground">{tag.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Header Personalization</Label>
                        <p className="text-[11px] text-muted-foreground">Inject custom MIME headers for better deliverability.</p>
                      </div>
                      <Switch
                        checked={config.use_custom_headers}
                        onCheckedChange={(val) => setConfig(prev => ({ ...prev, use_custom_headers: val }))}
                      />
                    </div>
                    {config.use_custom_headers && (
                      <Textarea
                        placeholder="X-Custom-Header: value..."
                        className="h-24 font-mono text-xs"
                        value={config.custom_headers}
                        onChange={(e) => setConfig(prev => ({ ...prev, custom_headers: e.target.value }))}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="strategy" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" /> Workspace Source
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Service Accounts</Label>
                      <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 h-40 overflow-y-auto bg-muted/50">
                        {accounts.map(account => (
                          <div key={account.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`acc-${account.id}`}
                              checked={config.selected_account_ids.includes(account.id)}
                              onCheckedChange={(checked) => {
                                setConfig(prev => ({
                                  ...prev,
                                  selected_account_ids: checked
                                    ? [...prev.selected_account_ids, account.id]
                                    : prev.selected_account_ids.filter(id => id !== account.id)
                                }));
                              }}
                            />
                            <label htmlFor={`acc-${account.id}`} className="text-xs font-medium cursor-pointer">{account.email}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Persona Assignment ({users.length} available)</Label>
                      <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 h-48 overflow-y-auto bg-muted/50">
                        {users.map(user => (
                          <div key={user.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`usr-${user.id}`}
                              checked={config.selected_user_ids.includes(user.id)}
                              onCheckedChange={(checked) => {
                                setConfig(prev => ({
                                  ...prev,
                                  selected_user_ids: checked
                                    ? [...prev.selected_user_ids, user.id]
                                    : prev.selected_user_ids.filter(id => id !== user.id)
                                }));
                              }}
                            />
                            <label htmlFor={`usr-${user.id}`} className="text-xs font-medium cursor-pointer">{user.email}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Destination Segments
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-2 border rounded-lg p-3 h-96 overflow-y-auto bg-muted/50">
                      {contactLists.map(list => (
                        <div key={list.id} className="flex items-center justify-between p-2 rounded hover:bg-background transition-colors group">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`list-${list.id}`}
                              checked={config.selected_list_ids.includes(list.id)}
                              onCheckedChange={(checked) => {
                                setConfig(prev => ({
                                  ...prev,
                                  selected_list_ids: checked
                                    ? [...prev.selected_list_ids, list.id]
                                    : prev.selected_list_ids.filter(id => id !== list.id)
                                }));
                              }}
                            />
                            <label htmlFor={`list-${list.id}`} className="text-xs font-medium cursor-pointer">{list.name}</label>
                          </div>
                          <Badge variant="secondary" className="text-[10px] opacity-60 group-hover:opacity-100">{list.contact_count} rec.</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Load Balancing</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <Label>Delivery Mode</Label>
                    <Select
                      value={config.distribution_strategy}
                      onValueChange={(val: any) => setConfig(prev => ({ ...prev, distribution_strategy: val }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="round_robin">Round Robin (Cyclic)</SelectItem>
                        <SelectItem value="even_split">Even Split (Linear)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Round robin ensures uniform saturation across active personas.</p>
                  </div>
                  <div className="space-y-4">
                    <Label>Burst Density (Daily Cap)</Label>
                    <Input
                      type="number"
                      value={config.emails_per_user}
                      onChange={(e) => setConfig(prev => ({ ...prev, emails_per_user: parseInt(e.target.value) }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Global dispatch limit per assigned persona per session.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Pane: Real-Time Insights & Mini Preview */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-primary">Intelligence Hub</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-3xl font-black tracking-tighter text-foreground">{totalReach.toLocaleString()}</p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Total Net Reach</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{(config.selected_user_ids.length * config.emails_per_user).toLocaleString()}</p>
                  <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Cap Forecast</p>
                </div>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, (config.selected_user_ids.length * config.emails_per_user / (totalReach || 1)) * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="h-[calc(100vh-22rem)] flex flex-col overflow-hidden">
            <CardHeader className="border-b bg-muted/30">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Live Context Render</CardTitle>
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-primary border-primary/20">Simulation</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-auto bg-muted/10">
              <div className="p-6">
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground w-12">From:</span>
                    <span className="text-xs font-medium">{config.from_name || 'System Identity'} &lt;sender@workspace.com&gt;</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground w-12">Sub:</span>
                    <span className="text-xs font-bold">{config.subject || 'Simulation Subject...'}</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-4 min-h-[400px] shadow-sm">
                  {config.body_format === 'html' ? (
                    <div
                      className="text-sm prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: config.body_html || '<div class="opacity-20 flex flex-col items-center justify-center pt-24"><Sparkles class="h-12 w-12 mb-4" /><p class="font-bold uppercase tracking-widest text-[10px]">Awaiting Creative...</p></div>' }}
                    />
                  ) : (
                    <pre className="text-sm font-mono whitespace-pre-wrap text-foreground/80">
                      {config.body_template || 'Awaiting plain text creative input...'}
                    </pre>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <TestDraftDialog
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        draftId={null}
        config={config}
        availableUsers={users}
      />

      <TemplatePreview
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        headers={config.custom_headers}
        body={config.body_format === 'html' ? config.body_html : config.body_template}
        isLoading={false}
      />

      <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: hsl(var(--muted-foreground) / 0.2);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--muted-foreground) / 0.4);
                }
            `}</style>
    </div>
  );
}