'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Mail,
  Settings,
  Activity,
  Building2,
  Contact,
  BarChart3,
  FileEdit,
  ChevronLeft,
  ChevronRight,
  Zap,
  Globe,
} from 'lucide-react';
import { Button } from './ui/button';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Campaigns', href: '/campaigns', icon: Mail },
  { name: 'Accounts', href: '/accounts', icon: Building2 },
  { name: 'Contacts', href: '/contacts', icon: Contact },
  { name: 'Drafts', href: '/drafts', icon: FileEdit },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'System Reports', href: '/reports', icon: Activity },
  { name: 'Tracking Domains', href: '/settings/domains', icon: Globe },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className={cn(
      "flex h-screen flex-col border-r transition-all duration-300 relative bg-white dark:bg-slate-900",
      collapsed ? "w-20" : "w-72"
    )}>

      {/* Brand Header */}
      <div className="flex h-20 items-center justify-between px-6 border-b border-slate-100 dark:border-slate-800">
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
              SpeedSend
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase">
              Enterprise
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-full flex justify-center">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
              S
            </div>
          </div>
        )}
      </div>

      {/* Collapse Toggle (Absolute) */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 h-6 w-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 shadow-sm hover:text-blue-600 transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 px-3 py-6 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 transition-colors",
                isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-600"
              )} />

              {!collapsed && (
                <span className="truncate">{item.name}</span>
              )}

              {isActive && !collapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800">
        {!collapsed ? (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-1.5 rounded-md bg-amber-100 text-amber-600">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">Pro Plan</p>
                <p className="text-[10px] text-muted-foreground">v2.1.0 (Stable)</p>
              </div>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-emerald-500 h-full w-[95%]" />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>System Health</span>
              <span className="text-emerald-600 font-medium">98%</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="System Online" />
          </div>
        )}
      </div>
    </div>
  );
}
