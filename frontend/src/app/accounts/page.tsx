'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { serviceAccountsApi, healthCheck, API_URL } from '@/lib/api';
import { Plus, Wifi, WifiOff, ShieldCheck } from 'lucide-react';
import { AccountCard, ServiceAccount } from '@/components/accounts/AccountCard';
import { UploadAccountDialog } from '@/components/accounts/UploadAccountDialog';
import { Toast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<boolean | null>(null);

  // Action states
  const [syncingIds, setSyncingIds] = useState<number[]>([]);
  const [deletingIds, setDeletingIds] = useState<number[]>([]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const checkBackend = useCallback(async () => {
    console.log('Checking backend service status...', API_URL);
    const isHealthy = await healthCheck();
    setBackendStatus(isHealthy);
  }, []);

  const formatError = (err: any) => {
    if (typeof err === 'string') return err;
    if (err.message && typeof err.message === 'string') return err.message;
    if (Array.isArray(err)) return err.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
    if (typeof err === 'object') return JSON.stringify(err);
    return String(err);
  };

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await serviceAccountsApi.list();
      if (response.error) throw response.error;
      setAccounts(Array.isArray(response.data) ? response.data : []);
    } catch (error: any) {
      console.error('Failed to load accounts:', error);
      showToast(`Failed to load accounts: ${formatError(error)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkBackend();
    loadAccounts();
  }, [checkBackend, loadAccounts]);

  const handleUpload = async (name: string, jsonContent: string) => {
    try {
      const response = await serviceAccountsApi.create({
        name,
        json_content: jsonContent,
        admin_email: name
      });
      if (response.error) throw response.error;
      const newAccount = response.data;
      showToast(`Account "${newAccount.name}" added successfully!`, 'success');
      await loadAccounts();
      if (newAccount.id) handleSync(newAccount.id, true);
    } catch (error: any) {
      console.error('Upload failed:', error);
      showToast(`Failed to add account: ${formatError(error)}`, 'error');
      throw error;
    }
  };

  const handleSync = async (id: number, isAuto = false) => {
    const account = accounts.find(a => a.id === id);
    if (!account) return;
    setSyncingIds(prev => [...prev, id]);
    try {
      let adminEmail = account.admin_email;
      if ((!adminEmail || !adminEmail.includes('@')) && account.domain) {
        adminEmail = `admin@${account.domain}`;
      }
      if (!adminEmail) adminEmail = account.name;

      const response = await serviceAccountsApi.sync(id, adminEmail);
      if (response.error) throw response.error;

      showToast(`Successfully synced users for ${account.name}`, 'success');
      loadAccounts();
    } catch (error: any) {
      console.error('Sync failed:', error);
      const msg = formatError(error);
      if (!isAuto) {
        showToast(`Sync failed: ${msg}`, 'error');
      } else {
        showToast(`Account added, but auto-sync failed: ${msg}. Please try syncing manually.`, 'error');
      }
    } finally {
      setSyncingIds(prev => prev.filter(pid => pid !== id));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this account? This will remove all associated users and drafts.")) return;
    setDeletingIds(prev => [...prev, id]);
    try {
      const response = await serviceAccountsApi.delete(id);
      if (response.error) throw response.error;
      showToast("Account deleted successfully", 'success');
      await loadAccounts();
    } catch (error: any) {
      console.error("Delete failed:", error);
      showToast(`Failed to delete: ${formatError(error)}`, 'error');
    } finally {
      setDeletingIds(prev => prev.filter(pid => pid !== id));
    }
  };

  return (
    <div className="flex h-screen bg-background font-sans">
      <Sidebar />
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                Service Accounts
              </h1>
              <p className="text-muted-foreground mt-1">
                Connect and manage your Google Workspace accounts.
              </p>

              {backendStatus !== null && (
                <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${backendStatus
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                  }`}>
                  {backendStatus ? (
                    <>
                      <Wifi className="h-3 w-3" />
                      <span>Engine Online</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3" />
                      <span>Engine Offline</span>
                      <button onClick={checkBackend} className="ml-2 underline hover:no-underline">Retry</button>
                    </>
                  )}
                </div>
              )}
            </div>

            <Button
              onClick={() => setIsUploadOpen(true)}
              disabled={!backendStatus}
              className="shadow-lg hover:shadow-xl transition-all"
              size="lg"
            >
              <Plus className="mr-2 h-5 w-5" />
              Connect New Account
            </Button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => <div key={i} className="h-48 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-xl" />)}
            </div>
          ) : accounts.length === 0 ? (
            <Card className="border-dashed border-2 shadow-sm bg-white dark:bg-slate-900">
              <CardContent className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground">
                <div className="h-20 w-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                  <ShieldCheck className="h-10 w-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">No accounts connected</h3>
                <p className="mb-8 max-w-sm mx-auto">
                  Add a Google Service Account JSON to start sending campaigns.
                </p>
                <Button onClick={() => setIsUploadOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add your first account
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {accounts.map(account => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onSync={handleSync}
                  onDelete={handleDelete}
                  isSyncing={syncingIds.includes(account.id)}
                  isDeleting={deletingIds.includes(account.id)}
                />
              ))}
            </div>
          )}

          <UploadAccountDialog
            open={isUploadOpen}
            onOpenChange={setIsUploadOpen}
            onUpload={handleUpload}
          />

          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
