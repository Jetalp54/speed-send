import React from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Trash2,
    RefreshCw,
    CheckCircle,
    XCircle,
    AlertTriangle
} from 'lucide-react';

export interface ServiceAccount {
    id: number;
    name: string;
    status: 'active' | 'inactive' | string;
    client_email?: string;
    domain?: string;
    total_users?: number;
    quota_used_today?: number;
    quota_limit?: number;
    last_synced?: string | null;
    admin_email?: string;
}

interface AccountCardProps {
    account: ServiceAccount;
    onSync: (id: number) => void;
    onDelete: (id: number) => void;
    isSyncing?: boolean;
    isDeleting?: boolean;
}

export function AccountCard({
    account,
    onSync,
    onDelete,
    isSyncing = false,
    isDeleting = false
}: AccountCardProps) {
    const isActive = account.status === 'active';
    const hasUsers = (account.total_users ?? 0) > 0;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            {account.name}
                            {isActive ? (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                            )}
                        </CardTitle>
                        <CardDescription>{account.client_email}</CardDescription>
                        <div className="mt-2 text-sm">
                            <span className="font-medium mr-1">Synced Users:</span>
                            <span
                                className={
                                    hasUsers
                                        ? 'text-green-600 font-semibold'
                                        : 'text-amber-600 flex items-center gap-1 inline-flex'
                                }
                            >
                                {account.total_users || 0}
                                {!hasUsers && <AlertTriangle className="h-3 w-3" />}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onSync(account.id)}
                            disabled={isSyncing || isDeleting}
                            title="Sync workspace users from Google"
                        >
                            <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing...' : 'Sync Users'}
                        </Button>
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onDelete(account.id)}
                            disabled={isSyncing || isDeleting}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <p className="text-muted-foreground">Domain</p>
                        <p className="font-medium truncate" title={account.domain}>{account.domain || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Total Users</p>
                        <p className="font-medium">{account.total_users || 0}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Quota Used</p>
                        <p className="font-medium">
                            {account.quota_used_today || 0} / {account.quota_limit || 0}
                        </p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Last Synced</p>
                        <p className="font-medium">
                            {account.last_synced
                                ? new Date(account.last_synced).toLocaleString()
                                : 'Never'}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
