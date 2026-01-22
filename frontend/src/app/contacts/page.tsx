'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL } from '@/lib/api';
import { UploadModal } from '@/components/data-lists/UploadModal';
import {
  Contact,
  Search,
  Plus,
  Upload,
  Trash2,
  Edit2,
  MoreVertical,
  Download,
  Users,
  Copy,
  RefreshCw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';

type ContactList = {
  id: number;
  name: string;
  description?: string;
  contacts: any[]; // simplified for now
};

export default function ContactsPage() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [editing, setEditing] = useState<ContactList | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emailsText, setEmailsText] = useState('');

  // View State
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const loadLists = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/v1/contacts/lists`);
      if (!response.ok) throw new Error('Failed to fetch contact lists');
      const data = await response.json();
      setLists(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load contact lists:', error);
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const filtered = useMemo(() => {
    return lists.filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()));
  }, [lists, search]);

  const startNew = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setEmailsText('');
    setShowEditor(true);
  };

  const startEdit = (list: ContactList) => {
    setEditing(list);
    setName(list.name);
    setDescription(list.description || '');
    setEmailsText(list.contacts.map((c: any) => c.email).join('\n'));
    setShowEditor(true);
  };

  const save = async () => {
    if (!name.trim()) return;

    try {
      setLoading(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
      };

      let listId_local;

      if (editing) {
        await fetch(`${API_URL}/api/v1/contacts/lists/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        listId_local = editing.id;
      } else {
        const response = await fetch(`${API_URL}/api/v1/contacts/lists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        listId_local = result.id;
      }

      // Handle Manual Recipients
      if (emailsText.trim()) {
        const contacts = Array.from(new Set(
          emailsText.split(/\n|,|\s+/).map(s => s.trim()).filter(s => s.includes('@'))
        )).map(email => {
          const parts = email.split('@');
          return { email, first_name: parts[0] };
        });

        if (contacts.length > 0) {
          // Simplified bulk add loop
          for (const contact of contacts) {
            await fetch(`${API_URL}/api/v1/contacts/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contact_list_id: listId_local,
                email: contact.email,
                first_name: contact.first_name
              }),
            });
          }
        }
      }

      await loadLists();
      setShowEditor(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save list.');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this list?')) return;
    try {
      setLoading(true);
      await fetch(`${API_URL}/api/v1/contacts/lists/${id}`, { method: 'DELETE' });
      await loadLists();
      if (editing?.id === id) setShowEditor(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Async Upload
  const handleUpload = async (file: File, listName: string) => {
    try {
      setShowUpload(false);
      setLoading(true);

      const listRes = await fetch(`${API_URL}/api/v1/contacts/lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: listName, description: "Imported via CSV" }),
      });
      if (!listRes.ok) throw new Error("Failed to create list");
      const listData = await listRes.json();

      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(`${API_URL}/api/v1/contacts-enterprise/import/async?list_id=${listData.id}`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Failed to upload file");
      alert(`Import Started. Check back in a few minutes.`);
      await loadLists();
    } catch (e: any) {
      console.error(e);
      alert(`Import failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background font-sans">
      <Sidebar />
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
        <div className="p-8 max-w-7xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                Contact Lists
              </h1>
              <p className="text-muted-foreground mt-1">
                Organize your recipients into segmented lists.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={loadLists} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="secondary" onClick={() => setShowUpload(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Bulk Import
              </Button>
              <Button onClick={startNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create List
              </Button>
            </div>
          </div>

          {/* Content Grid */}
          <div className={`grid gap-6 ${showEditor ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>

            {/* Main List View */}
            <div className={showEditor ? "lg:col-span-2" : "lg:col-span-1"}>
              <div className="mb-4 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search lists..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map(list => (
                  <Card key={list.id} className="group hover:shadow-md transition-all border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                          <Users className="h-5 w-5" />
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEdit(list)}>
                              <Edit2 className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              navigator.clipboard.writeText(list.contacts.map((c: any) => c.email).join('\n'));
                            }}>
                              <Copy className="h-4 w-4 mr-2" /> Copy Emails
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => remove(list.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <CardTitle className="mt-3 text-base font-semibold">{list.name}</CardTitle>
                      <CardDescription className="line-clamp-1 h-5 text-xs">
                        {list.description || "No description"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-4 pt-0">
                      <div className="flex items-center justify-between text-sm mt-2">
                        <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-normal">
                          {list.contacts?.length || 0} contacts
                        </Badge>
                        <span className="text-xs text-muted-foreground">ID: {list.id}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <div className="mx-auto h-12 w-12 text-slate-300">
                    <Users className="h-full w-full" />
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">No lists found</h3>
                  <p className="mt-1 text-sm text-slate-500">Get started by creating a new list.</p>
                </div>
              )}
            </div>

            {/* Editor Panel (Slide Over / Sidebar style) */}
            {showEditor && (
              <Card className="h-fit bg-white dark:bg-slate-900 border-l-4 border-l-blue-500 shadow-xl">
                <CardHeader>
                  <CardTitle>{editing ? 'Edit List' : 'New List'}</CardTitle>
                  <CardDescription>
                    {editing ? `Updating ${editing.name}` : 'Create a new contact segment'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>List Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. VIP Customers" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Waitlist signups..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Quick Add Emails</Label>
                    <Textarea
                      value={emailsText}
                      onChange={e => setEmailsText(e.target.value)}
                      placeholder="paste@emails.com"
                      rows={8}
                      className="font-mono text-xs resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Paste emails separated by newlines. Valid emails only.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-4 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl">
                  <Button variant="ghost" onClick={() => setShowEditor(false)}>Cancel</Button>
                  <Button onClick={save} disabled={loading}>
                    {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    Save List
                  </Button>
                </CardFooter>
              </Card>
            )}

          </div>

          {showUpload && (
            <UploadModal
              onClose={() => setShowUpload(false)}
              onUpload={handleUpload}
            />
          )}

        </div>
      </div>
    </div>
  );
}
