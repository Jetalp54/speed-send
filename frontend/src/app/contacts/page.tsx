'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { API_URL, contactsApi } from '@/lib/api';
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
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Filter,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortBy, setSortBy] = useState<'name' | 'contacts' | 'newest'>('newest');

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

  const filteredAndSorted = useMemo(() => {
    let result = lists.filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()));

    return result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'contacts') return (b.contacts?.length || 0) - (a.contacts?.length || 0);
      return b.id - a.id; // newest
    });
  }, [lists, search, sortBy]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === filteredAndSorted.length ? [] : filteredAndSorted.map(l => l.id));
  };

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

      // Handle Manual Recipients (Sync Logic: Add & Remove)
      if (emailsText.trim() || (editing && editing.contacts.length > 0)) {
        // Parse current emails from text area
        const currentEmails = new Set(
          emailsText.split(/\n|,|\s+/).map(s => s.trim()).filter(s => s.includes('@'))
        );

        // Parse existing emails (if editing)
        const existingEmailsMap = new Map();
        if (editing && editing.contacts) {
          editing.contacts.forEach((c: any) => existingEmailsMap.set(c.email, c.id));
        }

        // Calculate Diff
        const toAdd: { email: string; first_name: string }[] = [];
        const toDeleteIds: number[] = [];

        // Find emails to ADD (in text but not in existing)
        currentEmails.forEach(email => {
          if (!existingEmailsMap.has(email)) {
            const parts = email.split('@');
            toAdd.push({ email, first_name: parts[0] });
          }
        });

        // Find emails to DELETE (in existing but not in text)
        existingEmailsMap.forEach((id, email) => {
          if (!currentEmails.has(email)) {
            toDeleteIds.push(id);
          }
        });

        console.log(`Syncing List: Adding ${toAdd.length}, Deleting ${toDeleteIds.length}`);

        // Execute DELETES
        for (const contactId of toDeleteIds) {
          await fetch(`${API_URL}/api/v1/contacts/${contactId}`, {
            method: 'DELETE',
          });
        }

        // Execute ADDS
        if (toAdd.length > 0) {
          for (const contact of toAdd) {
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
      const response = await contactsApi.deleteList(id);
      if (response.error) throw new Error(response.error);
      await loadLists();
      if (editing?.id === id) setShowEditor(false);
    } catch (error) {
      console.error("Delete failed", error);
    } finally {
      setLoading(false);
    }
  };

  // Async Upload
  const handleUpload = async (file: File, listName: string, metadata: { type: string, isp: string, geo: string }) => {
    try {
      setShowUpload(false);
      setLoading(true);

      const desc = `Imported via CSV | Type: ${metadata.type} | ISP: ${metadata.isp} | Geo: ${metadata.geo}`;

      const listRes = await fetch(`${API_URL}/api/v1/contacts/lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: listName, description: desc }),
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
                User Sender
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
              <div className="mb-6 flex flex-col md:flex-row items-center gap-4">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search by list name, tags, or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-11 bg-white border-slate-200 rounded-xl focus:ring-indigo-500/20"
                  />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="h-11 px-4 rounded-xl border-slate-200 font-bold text-xs uppercase tracking-widest gap-2">
                        <Filter className="h-4 w-4" />
                        Sort: {sortBy}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl">
                      <DropdownMenuItem onClick={() => setSortBy('newest')} className="rounded-lg font-bold text-xs uppercase cursor-pointer">Newest First</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortBy('name')} className="rounded-lg font-bold text-xs uppercase cursor-pointer">Alphabetical</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSortBy('contacts')} className="rounded-lg font-bold text-xs uppercase cursor-pointer">Most Contacts</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {selectedIds.length > 0 && (
                    <Button variant="destructive" className="h-11 rounded-xl font-bold text-xs uppercase tracking-widest gap-2 animate-in slide-in-from-right-4">
                      <Trash2 className="h-4 w-4" />
                      Delete ({selectedIds.length})
                    </Button>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow className="hover:bg-transparent border-slate-100">
                      <TableHead className="w-[50px] pl-4">
                        <Checkbox
                          checked={selectedIds.length === filteredAndSorted.length && filteredAndSorted.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-4">Segment / Identity</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-4">Population</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-4">Geography</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-4">ISP / Carrier</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-4">Est. Health</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 py-4">Last Activity</TableHead>
                      <TableHead className="text-right pr-4 text-[10px] font-black uppercase tracking-widest text-slate-400 py-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSorted.map(list => (
                      <TableRow
                        key={list.id}
                        className={`group transition-colors border-slate-100 hover:bg-indigo-50/20 ${selectedIds.includes(list.id) ? 'bg-indigo-50/40' : ''}`}
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={selectedIds.includes(list.id)}
                            onCheckedChange={() => toggleSelect(list.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 min-w-[40px] rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500 ${selectedIds.includes(list.id) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                              <Users className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-black text-slate-900 leading-none group-hover:text-indigo-600 transition-colors uppercase text-[13px] tracking-tight">{list.name}</p>
                                {list.name.includes('_open') && <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-50 border-none text-[8px] font-black px-1.5 py-0 h-4 uppercase">OPENERS</Badge>}
                                {list.name.includes('_click') && <Badge className="bg-indigo-50 text-indigo-600 hover:bg-indigo-50 border-none text-[8px] font-black px-1.5 py-0 h-4 uppercase">CLICKERS</Badge>}
                                {list.name.includes('_unsub') && <Badge className="bg-rose-50 text-rose-600 hover:bg-rose-50 border-none text-[8px] font-black px-1.5 py-0 h-4 uppercase">UNSUB</Badge>}
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 line-clamp-1 italic">{list.description || 'Staging Environment List'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-none font-bold text-[10px] tabular-nums">
                            {list.contacts?.length || 0} LEADS
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-700 uppercase">{list.contacts?.[0]?.geo_country || 'US'}</span>
                            <span className="text-[9px] font-bold text-slate-400 truncate max-w-[80px]">{list.contacts?.[0]?.geo_city || 'Global'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter truncate max-w-[100px]">
                            {list.contacts?.[0]?.isp || 'Standard'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '92%' }} />
                            </div>
                            <span className="text-[10px] font-black text-emerald-600">92%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="h-3 w-3" />
                            <span className="text-[10px] font-bold uppercase">Ready to Deploy</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" onClick={() => startEdit(list)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-slate-400">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl">
                                <DropdownMenuItem className="font-bold text-[10px] uppercase tracking-widest gap-2 cursor-pointer rounded-lg" onClick={() => navigator.clipboard.writeText(list.contacts.map((c: any) => c.email).join('\n'))}>
                                  <Copy className="h-3.5 w-3.5" /> Copy Emails
                                </DropdownMenuItem>
                                <DropdownMenuItem className="font-bold text-[10px] uppercase tracking-widest gap-2 cursor-pointer rounded-lg">
                                  <Download className="h-3.5 w-3.5" /> Export CSV
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="font-bold text-[10px] uppercase tracking-widest gap-2 cursor-pointer rounded-lg text-rose-600 focus:text-rose-700 focus:bg-rose-50" onClick={() => remove(list.id)}>
                                  <Trash2 className="h-3.5 w-3.5" /> Burn List
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {filteredAndSorted.length === 0 && (
                  <div className="text-center py-32">
                    <div className="h-20 w-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200">
                      <Users className="h-10 w-10" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 uppercase">Awaiting Population</h3>
                    <p className="text-slate-400 text-sm font-medium max-w-xs mx-auto mt-1 italic">Initialize your outreach by importing your first lead database.</p>
                    <Button variant="outline" onClick={startNew} className="mt-8 rounded-xl border-slate-200 font-bold px-8">Create Manual Entry</Button>
                  </div>
                )}
              </div>
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
                  <div className="space-y-2">
                    <Label>Tags / Segment (ISP, Geo)</Label>
                    <Input
                      placeholder="e.g. Gmail, US, High-Value"
                      onChange={(e) => {
                        // Append tags to description for now as a simple solution
                        const currentDesc = description.split(' | Tags:')[0];
                        setDescription(e.target.value ? `${currentDesc} | Tags: ${e.target.value}` : currentDesc);
                      }}
                    />
                    <p className="text-[10px] text-muted-foreground">Appended to list description.</p>
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
