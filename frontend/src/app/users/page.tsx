'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usersApi, serviceAccountsApi } from '@/lib/api';
import {
  Search,
  CheckCircle,
  XCircle,
  Activity,
  Zap,
  Shield,
  Clock,
  Filter,
  MoreHorizontal,
  ChevronRight,
  RefreshCw,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const loadData = useCallback(async () => {
    try {
      const [usersRes, accountsRes] = await Promise.all([
        usersApi.list(selectedAccount ? { service_account_id: selectedAccount } : undefined),
        serviceAccountsApi.list(),
      ]);
      setUsers(usersRes.data);
      setAccounts(accountsRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(search.toLowerCase()) ||
    (user.full_name && user.full_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <div className="flex-1 overflow-auto bg-slate-50/50">
        <div className="p-8 max-w-[1600px] mx-auto space-y-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                  <Shield className="h-6 w-6" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Sender Health Nodes</h1>
              </div>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest pl-14">Real-time status of your sending ecosystem</p>
            </div>

            <div className="flex items-center gap-3 pl-14 md:pl-0">
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('table')}
                  className="h-9 w-9 rounded-lg"
                >
                  <ListIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  className="h-9 w-9 rounded-lg"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
              <Button onClick={loadData} variant="outline" className="h-11 rounded-xl border-slate-200 font-bold text-xs uppercase tracking-widest gap-2 bg-white">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Sync Nodes
              </Button>
            </div>
          </div>

          {/* Filters Area */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
              <Input
                placeholder="Locate node by email or identity..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 h-12 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-indigo-500/20"
              />
            </div>

            <select
              className="h-12 px-4 border border-slate-200 rounded-xl bg-white font-bold text-xs uppercase tracking-widest focus:ring-2 focus:ring-indigo-500/20 outline-none"
              value={selectedAccount || ''}
              onChange={e => setSelectedAccount(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">All Accounts Ecosystem</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Main Nodes Monitor */}
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white border border-slate-100 rounded-2xl animate-pulse" />)}
            </div>
          ) : filteredUsers.length === 0 ? (
            <Card className="border-none shadow-sm bg-white rounded-2xl py-20 text-center">
              <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
                <Zap className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase">Ecosystem Offline</h3>
              <p className="text-slate-400 font-medium italic mt-2">No active sending nodes detected. Sync your service accounts to initialize the network.</p>
            </Card>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredUsers.map(user => (
                <Card key={user.id} className="border-none shadow-sm bg-white rounded-2xl overflow-hidden hover:shadow-lg transition-all group relative border-t-4 border-t-indigo-500">
                  <CardHeader className="p-5 pb-2">
                    <div className="flex justify-between items-start mb-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-inner ${user.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        <Zap className={`h-5 w-5 ${user.is_active ? 'animate-pulse' : ''}`} />
                      </div>
                      <Badge variant="secondary" className={`${user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'} border-none text-[8px] font-black uppercase tracking-tighter px-2`}>
                        {user.is_active ? 'ACTIVE NODE' : 'OFFLINE'}
                      </Badge>
                    </div>
                    <h3 className="font-black text-slate-900 text-sm truncate uppercase tracking-tight">{user.email.split('@')[0]}</h3>
                    <p className="text-[10px] font-bold text-slate-400 truncate tracking-tighter">{user.email}</p>
                  </CardHeader>
                  <CardContent className="p-5 pt-4 space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span>Daily Quota</span>
                        <span className="text-indigo-600">{user.emails_sent_today} / {user.quota_limit}</span>
                      </div>
                      <Progress
                        value={(user.emails_sent_today / user.quota_limit) * 100}
                        className="h-1.5 bg-slate-100"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 border-t border-slate-50 pt-3">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last Active: Just Now</span>
                      <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> Warmup: 100%</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Node Identity</th>
                      <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Current Load</th>
                      <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Efficiency</th>
                      <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Status Pulse</th>
                      <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400 w-[100px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors group">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shadow-inner ${user.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                              <Shield className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-black text-slate-900 text-[13px] leading-none uppercase tracking-tight">{user.full_name || user.email.split('@')[0]}</p>
                              <p className="text-[10px] font-bold text-slate-400 mt-1 tracking-tighter">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="w-48 space-y-1.5">
                            <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                              <span>Sent Today</span>
                              <span className="text-indigo-600">{user.emails_sent_today} / {user.quota_limit}</span>
                            </div>
                            <Progress value={(user.emails_sent_today / user.quota_limit) * 100} className="h-1 bg-slate-100" />
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-none text-[10px] font-black px-2 py-0.5">98.4% DELIVERY</Badge>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${user.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${user.is_active ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {user.is_active ? 'Online Pulse' : 'Offline'}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-white hover:shadow-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

