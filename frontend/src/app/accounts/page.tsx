'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { serviceAccountsApi, healthCheck, API_URL } from '@/lib/api';
import { Plus, Wifi, WifiOff } from 'lucide-react';
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

  // Helper to format error messages safely
  const formatError = (err: any) => {
    if (typeof err === 'string') return err;
    if (err.message && typeof err.message === 'string') return err.message;
    // Handle Pydantic array errors or other objects
    if (Array.isArray(err)) return err.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
    if (typeof err === 'object') return JSON.stringify(err);
    return String(err);
  };

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await serviceAccountsApi.list();
      if (response.error) throw response.error; // Throw pure error object

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
      // 1. Create Account
      const response = await serviceAccountsApi.create({
        name,
        json_content: jsonContent,
        admin_email: name
      });

      if (response.error) throw response.error;

      const newAccount = response.data;
      if (!newAccount) throw new Error("Server returned success but no account data.");

      showToast(`Account "${newAccount.name}" added successfully!`, 'success');

      // Refresh list
      await loadAccounts();

      // 2. Auto-trigger sync
      if (newAccount.id) {
        handleSync(newAccount.id, true);
      }

    } catch (error: any) {
      console.error('Upload failed:', error);
      showToast(`Failed to add account: ${formatError(error)}`, 'error');
      // Rethrow to keep dialog state consistent
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

      console.log(`Syncing account ${id} with admin email: ${adminEmail}`);

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
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Service Accounts</h1>
            <p className="text-muted-foreground">Manage Google Workspace service accounts</p>
            {backendStatus !== null && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                {backendStatus ? (
                  <span className="text-green-600 flex items-center gap-1">
                    <Wifi className="h-4 w-4" /> Connected
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center gap-1">
                    <WifiOff className="h-4 w-4" /> Offline
                    <Button variant="link" size="sm" onClick={checkBackend} className="h-auto p-0 ml-2">Retry</Button>
                  </span>
                )}
              </div>
            )}
          </div>
          <Button onClick={() => setIsUploadOpen(true)} disabled={!backendStatus}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4">
            {[1, 2].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
          </div>
        ) : accounts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <p className="mb-4">No service accounts found.</p>
              <Button variant="outline" onClick={() => setIsUploadOpen(true)}>Add your first account</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
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
  );
}
