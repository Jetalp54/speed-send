'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usersApi, serviceAccountsApi } from '@/lib/api';
import { Search, CheckCircle, XCircle } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);

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

      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Workspace Users</h1>
            <p className="text-muted-foreground">View all users from your Google Workspace accounts</p>
          </div>

          {/* Filters */}
          <div className="mb-6 flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <select
              className="px-4 py-2 border rounded-md bg-background"
              value={selectedAccount || ''}
              onChange={e => setSelectedAccount(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">All Accounts</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* Users Table */}
          <Card>
            <CardHeader>
              <CardTitle>Users ({filteredUsers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="animate-pulse">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No users found. Sync your service accounts to fetch users.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Email</th>
                        <th className="text-left py-3 px-4">Name</th>
                        <th className="text-left py-3 px-4">Sent Today</th>
                        <th className="text-left py-3 px-4">Quota</th>
                        <th className="text-left py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map(user => (
                        <tr key={user.id} className="border-b hover:bg-accent">
                          <td className="py-3 px-4 font-medium">{user.email}</td>
                          <td className="py-3 px-4">{user.full_name || '-'}</td>
                          <td className="py-3 px-4">{user.emails_sent_today}</td>
                          <td className="py-3 px-4">
                            {user.emails_sent_today} / {user.quota_limit}
                            <div className="w-24 h-1 bg-secondary rounded-full mt-1">
                              <div
                                className="h-1 bg-primary rounded-full"
                                style={{
                                  width: `${Math.min((user.emails_sent_today / user.quota_limit) * 100, 100)}%`
                                }}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {user.is_active ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

