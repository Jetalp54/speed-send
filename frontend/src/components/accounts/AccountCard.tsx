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
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Shield
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

    // Calculate visualization metrics
    const quotaUsed = account.quota_used_today || 0;
    const quotaLimit = account.quota_limit || 1;
    const quotaPercent = Math.min((quotaUsed / quotaLimit) * 100, 100);
    const quotaColor = quotaPercent > 90 ? 'text-red-500' : quotaPercent > 70 ? 'text-amber-500' : 'text-emerald-500';
    const quotaBg = quotaPercent > 90 ? 'bg-red-500' : quotaPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500';

    return (
        <Card className="border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group bg-white dark:bg-slate-900">
            {/* Status accent bar */}
            <div className={`absolute top-0 left-0 w-1 h-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />

            <CardHeader className="pb-3 pl-6">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                            <Shield className="h-5 w-5 text-slate-500" />
                        </div>

                        <div>
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                {account.name}
                                {isActive && (
                                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                        Active
                                    </span>
                                )}
                            </CardTitle>
                            <CardDescription className="text-xs truncate max-w-[200px]" title={account.client_email}>
                                {account.client_email}
                            </CardDescription>
                        </div>
                    </div>

                    <div className="flex gap-1 shrink-0 ml-4">
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                            onClick={() => onSync(account.id)}
                            disabled={isSyncing || isDeleting}
                            title="Sync Users"
                        >
                            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => onDelete(account.id)}
                            disabled={isSyncing || isDeleting}
                            title="Delete Account"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pl-6">
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm mt-2">
                    {/* Access (Users) */}
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Workspace Users</p>
                        <div className="flex items-center gap-2">
                            <span className={`text-xl font-bold ${hasUsers ? 'text-slate-900 dark:text-slate-50' : 'text-amber-500'}`}>
                                {account.total_users || 0}
                            </span>
                            {!hasUsers && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                        </div>
                    </div>

                    {/* Quota */}
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Daily Quota</p>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${quotaBg} transition-all duration-500`}
                                    style={{ width: `${quotaPercent}%` }}
                                />
                            </div>
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                {Math.round(quotaPercent)}%
                            </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            {quotaUsed.toLocaleString()} / {quotaLimit.toLocaleString()} sent
                        </p>
                    </div>

                    {/* Domain */}
                    <div className="col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 -mx-6 px-6 py-2 -mb-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Domain</span>
                            <span className="text-xs font-medium">{account.domain || 'N/A'}</span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Last Synced</span>
                            <span className="text-xs font-medium text-slate-500">{account.last_synced ? new Date(account.last_synced).toLocaleDateString() : 'Never'}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
