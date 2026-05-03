'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
// Using apiClient from @/lib/api instead of direct axios
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sidebar } from '@/components/Sidebar';
import { serviceAccountsApi, usersApi, dataListsApi, contactsApi, API_URL, apiClient } from '@/lib/api';
import asString from '@/lib/asString';
import {
  Send,
  Users,
  AlertCircle,
  RefreshCw,
  Mail,
  Settings,
  Save,
  Eye,
  TestTube,
  CheckCircle,
  Loader2,
  Monitor,
  Tablet,
  Smartphone,
  Play
} from 'lucide-react';

// API Configuration - Use imported API URL from centralized config

// Types
interface Account {
  id: number;
  name?: string;
  client_email?: string;
  status?: string;
  domain?: string;
  total_users?: number;
  quota_used_today?: number;
  quota_limit?: number;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<Array<{
    id: number;
    email: string;
    is_active: boolean;
    service_account_id: number;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  }>>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [recipientsText, setRecipientsText] = useState('');
  const [config, setConfig] = useState({
    name: '',
    subject: '',
    body_html: '',
    body_plain: '',
    from_name: '',
    daily_limit: 100,
    workers: 1,
    delay_ms: 0,
    test_after_email: '',
    test_after_count: 0,
    header_type: 'existing', // 'existing' or '100_percent'
    custom_header: `MIME-Version: 1.0
To: [to]
Message-ID: <[rnda_20]@mail.sys.com>
Feedback-ID: [rndn_10]:[rndn_7]:[rndn_3].[rndn_2].[rndn_2].[rndn_2]:[rnda_8]
From: [from] <[smtp]>
Subject: [subject]
Date: [date]
List-Unsubscribe: <mailto:unsubscribe@[domain]?subject=unsubscribe>
Received: by [rnda_15].[rnda_10].com with SMTP id [rnda_20] for [to]; [date]`
  });
  const [testEmail, setTestEmail] = useState('');
  const [selectedTestUsers, setSelectedTestUsers] = useState<number[]>([]);
  const [notifications, setNotifications] = useState<Array<{ id: string, message: string, type: 'success' | 'error' | 'info' }>>([]);
  const [showTestModal, setShowTestModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean }>({ x: 0, y: 0, visible: false });
  const [recipientLists, setRecipientLists] = useState<Array<{ id: number, name: string, recipients: string[], created_at: string, geo_filter?: string, list_type?: string }>>([]);
  const [selectedRecipientListId, setSelectedRecipientListId] = useState<number | null>(null);
  const [newListName, setNewListName] = useState('');
  const [inlineListName, setInlineListName] = useState('');
  const [inlineGeo, setInlineGeo] = useState('');
  const [inlineType, setInlineType] = useState('custom');
  const LIST_TYPES = ['custom', 'openers', 'clickers', 'leaders', 'unsubscribers', 'delivery'];
  // Removed selectedListIds - not used in current implementation
  const [filterType, setFilterType] = useState<string>('');
  const [filterGeo, setFilterGeo] = useState<string>('');
  const [showRecipientModal, setShowRecipientModal] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string, name: string, subject: string, body: string, createdAt: string }>>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showVariablesModal, setShowVariablesModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile' | 'tablet'>('desktop');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [enableScheduling, setEnableScheduling] = useState(false);
  const [enableABTesting, setEnableABTesting] = useState(false);
  const [abTestSubject, setAbTestSubject] = useState('');
  const [abTestBody, setAbTestBody] = useState('');
  const [abTestSplit, setAbTestSplit] = useState(50);
  const [analytics, setAnalytics] = useState({
    totalSent: 0,
    totalDelivered: 0,
    totalOpened: 0,
    totalClicked: 0,
    totalBounced: 0,
    totalUnsubscribed: 0,
    sendRate: 0,
    deliveryRate: 0,
    openRate: 0,
    clickRate: 0
  });
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const filteredSelectedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const base = users.filter(u => selectedAccounts.includes(u.service_account_id));
    return q ? base.filter(u => (u.email || '').toLowerCase().includes(q)) : base;
  }, [users, selectedAccounts, userSearch]);

  // Derived collections
  const selectedUsers = useMemo(() => {
    return users.filter(u => selectedAccounts.includes(u.service_account_id));
  }, [users, selectedAccounts]);

  // Debug logging helpers
  // Debug logging helpers
  const appendLog = useCallback((line: string) => {
    const ts = new Date().toISOString();
    setLogs(prev => [...prev.slice(-499), `[${ts}] ${line}`]);
  }, []);

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Right-click detected!', e.clientX, e.clientY);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true
    });
    appendLog('Context menu opened');
  };

  const handleContextMenuAction = (action: 'test' | 'create') => {
    setContextMenu({ x: 0, y: 0, visible: false });
    appendLog(`Context menu action: ${action}`);

    if (action === 'test') {
      setShowTestModal(true);
      appendLog('Opening test email modal from context menu');
    } else if (action === 'create') {
      handleCreateCampaign();
      appendLog('Creating campaign from context menu');
    }
  };

  const closeContextMenu = () => {
    setContextMenu({ x: 0, y: 0, visible: false });
  };

  // Global click handler to close context menu
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) {
        closeContextMenu();
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [contextMenu.visible]);
  const appendErrorLog = (context: string, error: any) => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail ?? JSON.stringify(error?.response?.data ?? {});
    const url = error?.config?.url ?? '';
    appendLog(`${context} -> ERROR status=${status || 'n/a'} url=${url} detail=${detail}`);
  };

  // Derived state
  const recipients = recipientsText.split('\n').filter(email => email.trim() && email.includes('@'));
  const totalSenders = (users || []).filter(u => selectedAccounts.includes(u.service_account_id)).length;
  const queuedCount = recipients.length;
  const estDuration = Math.ceil(queuedCount / (config.workers * 10));

  // Utility Functions - Moved up to be used by other functions
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Backend health check
  const checkBackendHealth = useCallback(async () => {
    try {
      setBackendStatus('checking');
      const { data, error, status } = await apiClient.request('/health');

      if (status === 200 && !error) {
        setBackendStatus('connected');
        setConnectionError(null);
        console.log(' Backend health check passed');
        return true;
      } else {
        setBackendStatus('disconnected');
        setConnectionError('Backend returned unexpected status');
        return false;
      }
    } catch (error: any) {
      setBackendStatus('disconnected');
      if (error.code === 'ECONNREFUSED') {
        setConnectionError('Cannot connect to backend server. Please check if the server is running on port 8000.');
      } else if (error.response?.status === 404) {
        setConnectionError('Backend health endpoint not found. Please check server configuration.');
      } else {
        setConnectionError(`Backend connection failed: ${error.message}`);
      }
      console.error(' Backend health check failed:', error);
      return false;
    }
  }, []);







  // Removed selectedListIds useEffect - not used in current implementation

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 's':
            event.preventDefault();
            saveTemplate();
            break;
          case 'p':
            event.preventDefault();
            if (config.subject.trim() && config.body_html.trim()) {
              setShowPreviewModal(true);
            }
            break;
          case 't':
            event.preventDefault();
            setShowTestModal(true);
            break;
          case 'Enter':
            if (!event.shiftKey) {
              event.preventDefault();
              handleCreateCampaign();
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config.subject, config.body_html, config.name]);

  // API Functions
  const loadAccounts = useCallback(async () => {
    try {
      console.log(' Loading Google Workspace accounts...');
      const { data, error } = await apiClient.request('/api/v1/accounts/');

      if (error) throw new Error(error);

      if (data && Array.isArray(data)) {
        setAccounts(data);
        console.log(' Accounts loaded successfully:', data.length, 'accounts');
        showNotification(`Loaded ${data.length} Google Workspace accounts`, 'success');
      } else {
        console.warn(' Invalid response format:', data);
        setAccounts([]);
        showNotification('No accounts found. Please add Google Workspace service accounts first.', 'info');
      }
    } catch (error: any) {
      console.error(' Failed to load accounts:', error);
      setAccounts([]);

      let errorMessage = 'Failed to load accounts';
      if (error.response?.status === 404) {
        errorMessage = 'Backend API not found. Please check if the server is running.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Backend server error. Please check server logs.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Cannot connect to backend server. Please check if the server is running on port 8000.';
      } else if (error.message) {
        errorMessage = `Failed to load accounts: ${error.message}`;
      }

      showNotification(errorMessage, 'error');
    }
  }, [showNotification]);

  const loadUsers = useCallback(async () => {
    try {
      appendLog(' Loading Google Workspace users...');
      console.log(' Loading Google Workspace users...');
      const { data, error } = await apiClient.request('/api/v1/users/');

      if (error) throw new Error(error);

      if (data && Array.isArray(data)) {
        // FORCE FILTER admin users on frontend as well (double protection)
        const filteredUsers = data.filter((user: any) => {
          if (!user.email) return false;

          const email = user.email.toLowerCase();
          const localPart = email.split('@')[0];

          // Admin patterns to exclude (email and names)
          const adminPatterns = [
            'admin', 'administrator', 'postmaster', 'abuse', 'support',
            'noreply', 'no-reply', 'donotreply', 'do-not-reply',
            'system', 'automation', 'bot', 'nobot', 'no-bot',
            'test', 'testing', 'demo', 'sample'
          ];

          // Check if local part matches any admin pattern
          for (const pattern of adminPatterns) {
            if (localPart === pattern ||
              localPart.startsWith(pattern + '.') ||
              localPart.startsWith(pattern + '_')) {
              return false; // Exclude this user
            }
          }

          // Check user names for admin patterns
          const fullName = (user.full_name || '').toLowerCase();
          const firstName = (user.first_name || '').toLowerCase();
          const lastName = (user.last_name || '').toLowerCase();

          for (const pattern of adminPatterns) {
            if (fullName.includes(pattern) ||
              firstName.includes(pattern) ||
              lastName.includes(pattern)) {
              return false; // Exclude this user
            }
          }

          return true; // Include this user
        });

        setUsers(filteredUsers);
        appendLog(` Users loaded successfully: ${filteredUsers.length} users (${data.length - filteredUsers.length} admin users excluded)`);
        console.log(' Users loaded successfully:', filteredUsers.length, 'users (admin users excluded)');
        showNotification(`Loaded ${filteredUsers.length} Google Workspace users (admin users excluded)`, 'success');
      } else {
        appendLog(' Invalid response format from users API');
        console.warn(' Invalid response format:', data);
        setUsers([]);
        showNotification('No users found. Please sync accounts first.', 'info');
      }
    } catch (error: any) {
      const errorDetails = {
        status: error?.response?.status || 'No status',
        message: error?.response?.data?.detail || error?.message || 'Unknown error',
        url: error?.config?.url || 'No URL',
        data: error?.response?.data || 'No response data'
      };

      appendLog(` Failed to load users:`);
      appendLog(`   Status: ${errorDetails.status}`);
      appendLog(`   Message: ${errorDetails.message}`);
      appendLog(`   URL: ${errorDetails.url}`);
      if (errorDetails.data && typeof errorDetails.data === 'object') {
        appendLog(`   Response Data: ${JSON.stringify(errorDetails.data)}`);
      }

      console.error(' Failed to load users:', error);
      setUsers([]);

      let errorMessage = 'Failed to load users';
      if (error.response?.status === 404) {
        errorMessage = 'Users API not found. Please check backend configuration.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Backend server error while loading users.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Cannot connect to backend server.';
      } else if (error.message) {
        errorMessage = `Failed to load users: ${error.message}`;
      }

      showNotification(errorMessage, 'error');
    }
  }, [appendLog, showNotification]);

  const loadTemplates = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        const savedTemplates = localStorage.getItem('email_templates');
        if (savedTemplates) {
          setTemplates(JSON.parse(savedTemplates));
        }
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      setTemplates([]);
    }
  }, []);

  const loadRecipientLists = useCallback(async () => {
    try {
      // Use the correct contacts/lists endpoint instead of data-lists
      const { data, error } = await apiClient.request('/api/v1/contacts/lists');

      if (error) throw new Error(error);

      if (data && Array.isArray(data)) {
        setRecipientLists(data);
        console.log('Contact lists loaded successfully:', data.length, 'lists');
      } else {
        console.warn('Invalid response format:', data);
        setRecipientLists([]);
      }
    } catch (error: any) {
      console.error('Failed to load recipient lists:', error);
      showNotification('Failed to load recipient lists.', 'error');
      setRecipientLists([]);
    }
  }, [showNotification]);

  // Load data on mount
  useEffect(() => {
    const initializeData = async () => {
      try {
        // First check backend health
        const isHealthy = await checkBackendHealth();

        if (isHealthy) {
          await Promise.all([
            loadAccounts(),
            loadUsers(),
            loadTemplates(),
            loadRecipientLists()
          ]);

          // If an id query param exists, load campaign for editing
          try {
            const url = new URL(window.location.href);
            const idParam = url.searchParams.get('id');
            if (idParam) {
              const cid = parseInt(idParam);
              if (!isNaN(cid)) {
                setEditingId(cid);
                const { data: c, error } = await apiClient.request(`/api/v1/campaigns/${cid}/`);
                if (error) throw new Error(error);

                setConfig(prev => ({
                  ...prev,
                  name: c.name || '',
                  subject: c.subject || '',
                  body_html: c.body_html || '',
                  body_plain: c.body_plain || '',
                  from_name: c.from_name || prev.from_name,
                  test_after_email: c.test_after_email || '',
                  test_after_count: c.test_after_count || 0,
                  workers: c.concurrency || prev.workers,
                }));
                if (Array.isArray(c.recipients)) {
                  setRecipientsText(c.recipients.map((r: any) => r.email).join('\n'));
                }
                if (Array.isArray(c.sender_accounts)) {
                  setSelectedAccounts(c.sender_accounts.map((a: any) => a.id).filter(Boolean));
                }
                appendLog(` Loaded campaign ${cid} for editing`);
              }
            }
          } catch (e) {
            console.warn('Edit preload failed:', e);
          }
        } else {
          showNotification('Backend server is not available. Please check server status.', 'error');
        }
      } catch (error) {
        console.error('Failed to initialize data:', error);
        showNotification('Failed to load initial data', 'error');
      }
    };

    initializeData();
  }, [checkBackendHealth, loadAccounts, loadUsers, loadTemplates, loadRecipientLists, showNotification, appendLog]);

  // Refresh lists whenever the Manage Lists modal opens
  useEffect(() => {
    if (showRecipientModal) {
      loadRecipientLists();
      // Prefill list name from campaign name when opening the modal
      const defaultName = (config.name && config.name.trim()) ? config.name.trim() : `List ${new Date().toLocaleDateString()}`;
      setNewListName(defaultName);
    }
  }, [showRecipientModal, config.name, loadRecipientLists]);

  // Keep inline list name tracked to campaign name by default
  useEffect(() => {
    if (!inlineListName) {
      setInlineListName(config.name || '');
    }
  }, [config.name]);

  // No need for localStorage sync since we're using database

  const saveTemplate = () => {
    if (!config.name.trim() || !config.subject.trim() || !config.body_html.trim()) {
      showNotification('Please fill in all required fields before saving template', 'error');
      return;
    }

    const templateName = prompt('Enter template name:');
    if (!templateName) return;

    try {
      const newTemplate = {
        id: `template_${Date.now()}`,
        name: templateName,
        subject: config.subject,
        body: config.body_html,
        createdAt: new Date().toISOString()
      };

      const updatedTemplates = [...templates, newTemplate];
      setTemplates(updatedTemplates);

      if (typeof window !== 'undefined') {
        localStorage.setItem('email_templates', JSON.stringify(updatedTemplates));
      }

      showNotification('Template saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save template:', error);
      showNotification('Failed to save template', 'error');
    }
  };

  const loadTemplate = (template: any) => {
    setConfig(prev => ({
      ...prev,
      subject: template.subject,
      body_html: template.body
    }));
    showNotification(`Template "${template.name}" loaded`, 'info');
    setShowTemplateModal(false);
  };

  const deleteTemplate = (templateId: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      const updatedTemplates = templates.filter(t => t.id !== templateId);
      setTemplates(updatedTemplates);

      if (typeof window !== 'undefined') {
        localStorage.setItem('email_templates', JSON.stringify(updatedTemplates));
      }

      showNotification('Template deleted', 'success');
    }
  };

  const saveRecipientList = async (overrideName?: string) => {
    const effectiveName = (overrideName ?? newListName).trim();
    if (!effectiveName) {
      showNotification('Please enter a name for the recipient list', 'error');
      return;
    }

    try {
      const existingByName = recipientLists.find(l => l.name === effectiveName);

      if (existingByName) {
        // Update existing list
        await dataListsApi.update(existingByName.id, {
          recipients: recipients,
          geo_filter: inlineGeo,
          list_type: inlineType,
        });
        setSelectedRecipientListId(existingByName.id);
      } else {
        // Create new list
        const response = await dataListsApi.create({
          name: effectiveName,
          recipients: recipients,
          geo_filter: inlineGeo,
          list_type: inlineType,
          tags: [],
        });
        setSelectedRecipientListId(response.data.id);
      }

      // Reload lists from database
      await loadRecipientLists();
      showNotification(`Recipient list "${effectiveName}" saved`, 'success');
      setShowRecipientModal(false);
    } catch (error) {
      console.error('Failed to save recipient list:', error);
      showNotification('Failed to save recipient list', 'error');
    }
  };

  const loadRecipientList = (list: any) => {
    setRecipientsText(list.recipients.join('\n'));
    setSelectedRecipientListId(list.id);
    setInlineGeo(list.geo_filter || '');
    setInlineType(list.list_type || 'custom');
    showNotification(`Recipient list "${list.name}" loaded`, 'info');
    setShowRecipientModal(false);
  };

  const deleteRecipientList = async (listId: number) => {
    if (confirm('Are you sure you want to delete this recipient list?')) {
      try {
        await dataListsApi.delete(listId);
        await loadRecipientLists();
        showNotification('Recipient list deleted', 'success');
      } catch (error) {
        console.error('Failed to delete recipient list:', error);
        showNotification('Failed to delete recipient list', 'error');
      }
    }
  };

  // Enhanced validation
  const validateForm = () => {
    const errors: string[] = [];

    if (!config.name.trim()) {
      errors.push('Campaign name is required');
    }

    if (config.header_type !== '100_percent') {
      if (!config.subject.trim()) {
        errors.push('Email subject is required');
      }
      if (!config.body_html.trim()) {
        errors.push('Email body is required');
      }
    } else {
      if (!config.custom_header.trim()) {
        errors.push('Custom Header is required in 100% Header mode');
      }
    }

    if (selectedAccounts.length === 0) {
      errors.push('Please select at least one account');
    }

    if (recipients.length === 0) {
      errors.push('Please add at least one recipient');
    }

    if (config.daily_limit <= 0) {
      errors.push('Daily limit must be greater than 0');
    }

    if (config.workers <= 0) {
      errors.push('Workers must be greater than 0');
    }

    if (config.delay_ms < 0) {
      errors.push('Delay cannot be negative');
    }

    return errors;
  };

  // Preview functionality
  const generatePreview = () => {
    const sampleData = {
      name: 'John Doe',
      email: 'john@example.com',
      company: 'Example Corp',
      date: new Date().toLocaleDateString()
    };

    let previewHtml = config.body_html;
    let previewSubject = config.subject;

    // Replace variables in preview
    Object.entries(sampleData).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      previewHtml = previewHtml.replace(regex, value);
      previewSubject = previewSubject.replace(regex, value);
    });

    return { html: previewHtml, subject: previewSubject };
  };

  // Analytics functions
  const loadAnalytics = async () => {
    try {
      // This would typically fetch from a real analytics API
      // For now, we'll simulate some data
      const mockAnalytics = {
        totalSent: Math.floor(Math.random() * 1000) + 500,
        totalDelivered: Math.floor(Math.random() * 900) + 450,
        totalOpened: Math.floor(Math.random() * 300) + 150,
        totalClicked: Math.floor(Math.random() * 50) + 25,
        totalBounced: Math.floor(Math.random() * 20) + 5,
        totalUnsubscribed: Math.floor(Math.random() * 10) + 2,
        sendRate: Math.floor(Math.random() * 20) + 80,
        deliveryRate: Math.floor(Math.random() * 10) + 90,
        openRate: Math.floor(Math.random() * 20) + 20,
        clickRate: Math.floor(Math.random() * 5) + 3
      };

      setAnalytics(mockAnalytics);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  // Real-time analytics simulation
  useEffect(() => {
    if (showAnalytics) {
      const interval = setInterval(() => {
        setAnalytics(prev => ({
          ...prev,
          totalSent: prev.totalSent + Math.floor(Math.random() * 5),
          totalDelivered: prev.totalDelivered + Math.floor(Math.random() * 4),
          totalOpened: prev.totalOpened + Math.floor(Math.random() * 2),
          totalClicked: prev.totalClicked + Math.floor(Math.random() * 1),
          sendRate: Math.min(100, prev.sendRate + Math.random() * 2),
          deliveryRate: Math.min(100, prev.deliveryRate + Math.random() * 1),
          openRate: Math.min(100, prev.openRate + Math.random() * 0.5),
          clickRate: Math.min(100, prev.clickRate + Math.random() * 0.2)
        }));
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [showAnalytics]);

  // Utility Functions
  // showNotification moved up

  const stripHtml = (html: string) => {
    if (typeof window === 'undefined') return html.replace(/<[^>]*>/g, '');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  };

  // Event Handlers
  const handleAccountToggle = (accountId: number) => {
    setSelectedAccounts(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccounts.length === (accounts || []).length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts((accounts || []).map(a => a.id));
    }
  };

  const handleSendTest = async () => {
    appendLog('🧪 Starting test email process...');

    if (!testEmail.trim()) {
      appendLog(' Test email address is required');
      showNotification('Please enter a test email address', 'error');
      return;
    }

    if (selectedTestUsers.length === 0) {
      appendLog(' No users selected for test email');
      showNotification('Please select at least one user to send from', 'error');
      return;
    }

    appendLog(` Sending test email to: ${testEmail} from ${selectedTestUsers.length} users`);

    if (config.header_type !== '100_percent') {
      if (!config.subject.trim()) {
        showNotification('Please enter a subject', 'error');
        return;
      }

      if (!config.body_html.trim()) {
        showNotification('Please enter email content', 'error');
        return;
      }
    } else {
      if (!config.custom_header.trim()) {
        showNotification('Custom Header is required in 100% Header mode', 'error');
        return;
      }
    }

    setLoading(true);
    try {
      // Send test emails from all selected users
      const testPromises = selectedTestUsers.map(async (userId) => {
        const user = (users || []).find(u => u.id === userId);
        if (!user) return null;

        return apiClient.request('/api/v1/test-email/', {
          method: 'POST',
          timeoutMs: 60000, // 60 second timeout for Gmail API calls
          body: JSON.stringify({
            recipient_email: testEmail,
            subject: config.header_type === '100_percent' ? '' : config.subject,
            body_html: asString(config.body_html),
            body_plain: asString(stripHtml(config.body_html)),
            from_name: config.header_type === '100_percent' ? '' : config.from_name,
            sender_account_id: user.service_account_id,
            sender_user_id: userId,
            header_type: config.header_type,
            custom_header: config.custom_header
          })
        }).then(({ data, error }) => {
          if (error) throw new Error(error);
          return { data };
        });
      });

      const results = await Promise.allSettled(testPromises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      appendLog(`📊 Test email results: ${successful} successful, ${failed} failed`);

      // Log detailed failure reasons
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const user = users.find(u => u.id === selectedTestUsers[index]);
          const error = result.reason;
          const errorDetails = {
            user: user?.email || 'Unknown',
            status: error?.response?.status || 'No status',
            message: error?.response?.data?.detail || error?.message || 'Unknown error',
            url: error?.config?.url || 'No URL',
            data: error?.response?.data || 'No response data'
          };

          appendLog(` Test email failed for ${errorDetails.user}:`);
          appendLog(`   Status: ${errorDetails.status}`);
          appendLog(`   Message: ${errorDetails.message}`);
          appendLog(`   URL: ${errorDetails.url}`);
          if (errorDetails.data && typeof errorDetails.data === 'object') {
            appendLog(`   Response Data: ${JSON.stringify(errorDetails.data)}`);
          }
        } else if (result.status === 'fulfilled') {
          const user = users.find(u => u.id === selectedTestUsers[index]);
          appendLog(` Test email sent successfully for ${user?.email || 'Unknown'}`);
        }
      });

      if (successful > 0) {
        appendLog(` Test emails sent successfully: ${successful} successful, ${failed} failed`);
        showNotification(`Test emails sent: ${successful} successful, ${failed} failed`, 'success');
      } else {
        appendLog(` All test emails failed to send - see detailed errors above`);
        showNotification('All test emails failed to send', 'error');
      }

      setShowTestModal(false);
    } catch (error: any) {
      const errorDetails = {
        status: error?.response?.status || 'No status',
        message: error?.response?.data?.detail || error?.message || 'Unknown error',
        url: error?.config?.url || 'No URL',
        data: error?.response?.data || 'No response data'
      };

      appendLog(` Test email error: ${errorDetails.message}`);
      appendLog(`   Status: ${errorDetails.status}`);
      appendLog(`   URL: ${errorDetails.url}`);
      if (errorDetails.data && typeof errorDetails.data === 'object') {
        appendLog(`   Response Data: ${JSON.stringify(errorDetails.data)}`);
      }

      showNotification(`Test failed: ${errorDetails.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async () => {
    // Enhanced validation
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      showNotification(validationErrors.join(', '), 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: config.name,
        subject: config.header_type === '100_percent' ? '' : config.subject,
        body_html: asString(config.body_html), // Always send HTML body even in 100% Header mode
        body_plain: asString(stripHtml(config.body_html)), // Always send plain text fallback
        from_name: config.header_type === '100_percent' ? '' : config.from_name,
        recipients: recipients.map(email => ({ email, variables: {} })),
        sender_account_ids: selectedAccounts,
        sender_rotation: 'round_robin',
        custom_headers: {},
        attachments: [],
        rate_limit: config.daily_limit,
        concurrency: config.workers,
        test_after_email: config.test_after_email,
        test_after_count: config.test_after_count,
        header_type: config.header_type,
        custom_header: config.custom_header
      };
      if (editingId) {
        const url = `/api/v1/campaigns/${editingId}/`;
        appendLog(`PATCH ${url}`);
        const { error } = await apiClient.request(url, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        if (error) throw new Error(error);
        showNotification(`Campaign updated successfully! ID: ${editingId}`, 'success');
        router.push('/campaigns');
      } else {
        const url = '/api/v1/campaigns/';
        appendLog(`POST ${url} (recipients=${payload.recipients.length}, senders=${payload.sender_account_ids.length})`);
        const { data, error, status } = await apiClient.request(url, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (error) throw new Error(error);
        appendLog(`POST ${url} -> ${status} id=${data?.id}`);
        showNotification(`Campaign created successfully! ID: ${data.id}`, 'success');
        router.push('/campaigns');
      }
    } catch (error: any) {
      let errorMessage = 'Unknown error';
      if (error.response) {
        // Backend returned an error response
        if (typeof error.response.data === 'string' && error.response.data.startsWith('<')) {
          // It's likely an HTML error page, strip HTML to get a readable message
          errorMessage = stripHtml(error.response.data).substring(0, 200); // Truncate for display
        } else if (error.response.data && error.response.data.detail) {
          // FastAPI standard error format
          errorMessage = error.response.data.detail;
        } else if (error.response.data && typeof error.response.data === 'object') {
          // Other JSON error format
          errorMessage = JSON.stringify(error.response.data);
        } else {
          errorMessage = error.response.statusText || `Error status: ${error.response.status}`;
        }
      } else if (error.message) {
        // Network error or other client-side error
        errorMessage = error.message;
      }

      const errorDetails = {
        status: error?.response?.status || 'No status',
        message: errorMessage,
        url: error?.config?.url || 'No URL',
        data: error?.response?.data || 'No response data'
      };

      appendLog(` Campaign creation failed:`);
      appendLog(`   Status: ${errorDetails.status}`);
      appendLog(`   Message: ${errorDetails.message}`);
      appendLog(`   URL: ${errorDetails.url}`);
      if (errorDetails.data && typeof errorDetails.data === 'object') {
        appendLog(`   Response Data: ${JSON.stringify(errorDetails.data)}`);
      }

      showNotification(`Campaign creation failed: ${errorDetails.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex h-screen bg-background"
      onContextMenu={handleContextMenu}
    >
      <Sidebar />

      <div className="flex-1 overflow-auto">
        <div className="min-h-screen bg-gray-50 p-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Google Workspace Campaign <span className="ml-2 text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 align-middle">v2.1 UI</span></h1>
              <p className="text-gray-600 mt-2">PowerMTA-style sending via Google Workspace API — multi-domain, high-speed delivery</p>
            </div>
            <div className="flex items-center gap-4">
              {/* Backend Status Indicator */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${backendStatus === 'connected' ? 'bg-green-500' :
                  backendStatus === 'checking' ? 'bg-yellow-500 animate-pulse' :
                    'bg-red-500'
                  }`}></div>
                <span className="text-sm text-gray-600">
                  {backendStatus === 'connected' ? 'Backend Connected' :
                    backendStatus === 'checking' ? 'Checking...' :
                      'Backend Disconnected'}
                </span>
              </div>

              <div className="text-sm text-gray-600">
                Active accounts <span className="font-semibold text-blue-600">{(accounts || []).length}</span>
              </div>
              <div className="text-xs text-gray-500 hidden md:block">
                Shortcuts: Ctrl+S (Save), Ctrl+P (Preview), Ctrl+T (Test), Ctrl+Enter (Create)
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const isHealthy = await checkBackendHealth();
                  if (isHealthy) {
                    await Promise.all([loadAccounts(), loadUsers()]);
                  }
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              {backendStatus === 'disconnected' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    console.log(' Running backend diagnostics...');
                    showNotification('Running backend diagnostics...', 'info');

                    // Test multiple endpoints
                    const endpoints = [
                      { name: 'Health', url: '/health' },
                      { name: 'Accounts', url: '/api/v1/accounts/' },
                      { name: 'Users', url: '/api/v1/users/' }
                    ];

                    for (const endpoint of endpoints) {
                      try {
                        const { status, data, error } = await apiClient.request(endpoint.url);
                        console.log(` ${endpoint.name}:`, status, data || error);
                      } catch (error: any) {
                        console.error(` ${endpoint.name}:`, error.message);
                      }
                    }

                    showNotification('Diagnostics complete. Check browser console for details.', 'info');
                  }}
                >
                  Diagnose
                </Button>
              )}
            </div>
          </div>

          {/* Connection Error Display */}
          {backendStatus === 'disconnected' && connectionError && (
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Backend Connection Error</AlertTitle>
              <AlertDescription>
                {connectionError}
                <div className="mt-2 text-sm">
                  <strong>Troubleshooting steps:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Check if the backend server is running on port 8000</li>
                    <li>Verify Docker containers are running: <code>docker-compose ps</code></li>
                    <li>Check backend logs: <code>docker-compose logs backend</code></li>
                    <li>Restart backend: <code>docker-compose restart backend</code></li>
                  </ul>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Notifications */}
          {notifications.map(notification => (
            <Alert key={notification.id} className={`mb-4 ${notification.type === 'success' ? 'border-green-200 bg-green-50' :
              notification.type === 'error' ? 'border-red-200 bg-red-50' :
                'border-blue-200 bg-blue-50'
              }`}>
              <AlertDescription className={
                notification.type === 'success' ? 'text-green-800' :
                  notification.type === 'error' ? 'text-red-800' :
                    'text-blue-800'
              }>
                {notification.message}
              </AlertDescription>
            </Alert>
          ))}

          {/* Main Content - 3 columns: Left (Debug+Accounts), Center (Config+Composer+Recipients), Right (Stats+Actions) */}
          <div
            className="grid grid-cols-1 xl:grid-cols-3 gap-6"
            onContextMenu={handleContextMenu}
            onClick={closeContextMenu}
          >

            {/* LEFT COLUMN: Debug Log + Google Accounts + Users */}
            <div className="space-y-6">
              {/* Debug Log Panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">Debug Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between mb-2">
                    <div className="text-xs text-muted-foreground">Backend: {API_URL}</div>
                    <Button size="sm" variant="outline" onClick={() => setLogs([])}>Clear</Button>
                  </div>
                  <div className="h-48 overflow-auto rounded border bg-black text-green-300 text-xs p-2 font-mono">
                    {logs.length === 0 ? (
                      <div className="text-gray-400">No logs yet. Right-click anywhere on the page or create a campaign to see request details here.</div>
                    ) : (
                      logs.map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Google Workspace Accounts Panel */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Google Workspace Accounts ({(accounts || []).length})
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSelectAllAccounts}
                      >
                        {selectedAccounts.length === (accounts || []).length ? 'Deselect All' : 'Select All'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {(accounts || []).map(account => (
                      <div key={account.id} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                        <Checkbox
                          checked={selectedAccounts.includes(account.id)}
                          onCheckedChange={() => handleAccountToggle(account.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {account.name || account.client_email}
                            </p>
                            <Badge variant={account.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {account.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 truncate">
                            Service Account: {account.client_email}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-blue-600 font-medium">
                              {account.total_users || 0} Workspace Users
                            </span>
                            <span className="text-xs text-gray-500">
                              Domain: {account.domain || 'N/A'}
                            </span>
                            <span className="text-xs text-green-600">
                              Quota: {account.quota_used_today || 0}/{account.quota_limit || 500}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(accounts || []).length === 0 && (
                      <div className="text-center py-4">
                        {backendStatus === 'disconnected' ? (
                          <div className="text-red-600">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                            <p className="font-medium">Backend Connection Failed</p>
                            <p className="text-sm">Cannot load Google Workspace accounts</p>
                          </div>
                        ) : (
                          <div className="text-gray-500">
                            <Users className="h-8 w-8 mx-auto mb-2" />
                            <p className="font-medium">No Google Workspace Accounts</p>
                            <p className="text-sm">Add service accounts first in the Accounts page</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              onClick={() => window.location.href = '/accounts'}
                            >
                              Go to Accounts
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Users of Selected Accounts */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-indigo-600" />
                      Users of Selected Accounts ({(filteredSelectedUsers || []).length})
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={loadUsers}
                        disabled={loading}
                        className="flex items-center gap-1"
                      >
                        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        Total loaded: {(users || []).length}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {(selectedUsers || []).length === 0 ? (
                    <div className="text-sm text-gray-500">Select one or more accounts to see their users.</div>
                  ) : (
                    <div className="max-h-48 overflow-auto divide-y rounded border">
                      {/* Search */}
                      <div className="p-2 sticky top-0 bg-white flex items-center gap-2">
                        <Input
                          placeholder="Search users by email..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{(filteredSelectedUsers || []).length} found</span>
                      </div>
                      <div className="p-2 border-b flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const allUserIds = (filteredSelectedUsers || []).map(u => u.id);
                            setSelectedUserIds(allUserIds);
                          }}
                          className="text-xs"
                        >
                          Select All
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedUserIds([])}
                          className="text-xs"
                        >
                          Deselect All
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {selectedUserIds.length} selected
                        </span>
                      </div>
                      {(filteredSelectedUsers || []).slice(0, 300).map(u => (
                        <div key={`${u.service_account_id}-${u.email}`} className="px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUserIds([...selectedUserIds, u.id]);
                                } else {
                                  setSelectedUserIds(selectedUserIds.filter(id => id !== u.id));
                                }
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="truncate">{u.email}</span>
                          </div>
                          <span className={"text-xs " + (u.is_active ? 'text-green-600' : 'text-red-600')}>{u.is_active ? 'active' : 'inactive'}</span>
                        </div>
                      ))}
                      {(filteredSelectedUsers || []).length > 300 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">+{(filteredSelectedUsers || []).length - 300} more...</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Test After Feature */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-orange-600" />
                    Test After Feature
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Send a test email after every X number of emails are sent during the campaign.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="test-after-email">Test Email Address</Label>
                      <Input
                        id="test-after-email"
                        type="email"
                        placeholder="test@example.com"
                        value={config.test_after_email}
                        onChange={(e) => setConfig(prev => ({ ...prev, test_after_email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="test-after-count">Send Test After Every X Emails</Label>
                      <Input
                        id="test-after-count"
                        type="number"
                        min="0"
                        placeholder="0 = disabled"
                        value={config.test_after_count}
                        onChange={(e) => setConfig(prev => ({ ...prev, test_after_count: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  {config.test_after_count > 0 && config.test_after_email && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="text-sm text-blue-800">
                        <strong>Active:</strong> Test email will be sent to <code>{config.test_after_email}</code> after every <strong>{config.test_after_count}</strong> emails are sent.
                      </div>
                    </div>
                  )}

                  {config.test_after_count === 0 && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                      <div className="text-sm text-gray-600">
                        Test After feature is disabled. Set a count above 0 to enable.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>

            {/* CENTER COLUMN: Campaign Config + Email Composer + Recipients */}
            <div className="space-y-6">

              {/* Campaign Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Campaign Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="campaign-name">Campaign Name</Label>
                      <Input
                        id="campaign-name"
                        placeholder="Enter campaign name"
                        value={config.name}
                        onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="from-name">From Name</Label>
                      <Input
                        id="from-name"
                        placeholder="Enter sender name"
                        value={config.from_name}
                        onChange={(e) => setConfig(prev => ({ ...prev, from_name: e.target.value }))}
                        disabled={config.header_type === '100_percent'}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="Enter email subject"
                      value={config.subject}
                      onChange={(e) => setConfig(prev => ({ ...prev, subject: e.target.value }))}
                      disabled={config.header_type === '100_percent'}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="daily-limit">Daily Limit</Label>
                      <Input
                        id="daily-limit"
                        type="number"
                        value={config.daily_limit}
                        onChange={(e) => setConfig(prev => ({ ...prev, daily_limit: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="workers">Workers</Label>
                      <Input
                        id="workers"
                        type="number"
                        value={config.workers}
                        onChange={(e) => setConfig(prev => ({ ...prev, workers: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="delay">Delay (ms)</Label>
                      <Input
                        id="delay"
                        type="number"
                        value={config.delay_ms}
                        onChange={(e) => setConfig(prev => ({ ...prev, delay_ms: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  {/* Header Type Selection */}
                  <div>
                    <Label htmlFor="header-type">Header Type</Label>
                    <select
                      id="header-type"
                      className="w-full p-2 border rounded-md"
                      value={config.header_type}
                      onChange={(e) => setConfig(prev => ({ ...prev, header_type: e.target.value }))}
                    >
                      <option value="existing">Existing Header</option>
                      <option value="100_percent">100% Header</option>
                    </select>
                    <p className="text-sm text-gray-500 mt-1">
                      {config.header_type === 'existing'
                        ? 'Uses the standard email header format'
                        : 'Uses the new 100% optimized header format'
                      }
                    </p>
                  </div>

                  {/* Custom Header Editor - Only show when 100% Header is selected */}
                  {config.header_type === '100_percent' && (
                    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                      <div>
                        <Label htmlFor="custom-header">Custom Header Format</Label>
                        <Textarea
                          id="custom-header"
                          placeholder="Enter your custom header format..."
                          value={config.custom_header}
                          onChange={(e) => setConfig(prev => ({ ...prev, custom_header: e.target.value }))}
                          className="font-mono text-sm"
                          rows={8}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Use tags like [to], [from], [subject], [date], [smtp], [rndn_N], [rnda_N]
                        </p>
                      </div>

                      {/* Available Tags Reference */}
                      <div className="bg-white p-3 rounded border">
                        <h4 className="font-medium text-sm mb-2">Available Tags:</h4>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><code className="bg-gray-100 px-1 rounded">[to]</code> - Recipient email</div>
                          <div><code className="bg-gray-100 px-1 rounded">[from]</code> - Sender name</div>
                          <div><code className="bg-gray-100 px-1 rounded">[subject]</code> - Email subject</div>
                          <div><code className="bg-gray-100 px-1 rounded">[date]</code> - Current date</div>
                          <div><code className="bg-gray-100 px-1 rounded">[smtp]</code> - SMTP username</div>
                          <div><code className="bg-gray-100 px-1 rounded">[domain]</code> - Sender domain</div>
                          <div><code className="bg-gray-100 px-1 rounded">[rndn_N]</code> - Random 0-9 of N length</div>
                          <div><code className="bg-gray-100 px-1 rounded">[rnda_N]</code> - Random A-Z a-z 0-9 of N length</div>
                        </div>

                        <div className="mt-3 pt-2 border-t">
                          <h5 className="font-medium text-xs mb-1">Special Header Fields:</h5>
                          <div className="text-xs space-y-1">
                            <div><strong>Message-ID:</strong> Unique message identifier</div>
                            <div><strong>Feedback-ID:</strong> Feedback tracking identifier</div>
                            <div><strong>List-Unsubscribe:</strong> Unsubscribe link for compliance</div>
                            <div><strong>Received:</strong> SMTP server received header</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Google Workspace Specific Options */}
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-medium text-gray-900">Google Workspace Settings</h4>

                    {/* Gmail API Features */}
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="use-gmail-labels"
                          defaultChecked
                        />
                        <Label htmlFor="use-gmail-labels">Use Gmail Labels for Organization</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="track-opens"
                          defaultChecked
                        />
                        <Label htmlFor="track-opens">Track Email Opens (Gmail API)</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="track-clicks"
                          defaultChecked
                        />
                        <Label htmlFor="track-clicks">Track Link Clicks (Gmail API)</Label>
                      </div>
                    </div>

                    {/* Sender Rotation */}
                    <div className="space-y-3">
                      <Label htmlFor="sender-rotation">Sender Rotation Strategy</Label>
                      <select
                        id="sender-rotation"
                        className="w-full p-2 border rounded-md"
                        defaultValue="round_robin"
                      >
                        <option value="round_robin">Round Robin (Recommended)</option>
                        <option value="random">Random Selection</option>
                        <option value="least_used">Least Used Sender</option>
                        <option value="domain_based">Domain-Based Rotation</option>
                      </select>
                    </div>
                  </div>

                  {/* Advanced Options */}
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="font-medium text-gray-900">Advanced Options</h4>

                    {/* Scheduling */}
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-scheduling"
                          checked={enableScheduling}
                          onCheckedChange={setEnableScheduling}
                        />
                        <Label htmlFor="enable-scheduling">Schedule Campaign</Label>
                      </div>

                      {enableScheduling && (
                        <div className="grid grid-cols-2 gap-4 ml-6">
                          <div>
                            <Label htmlFor="schedule-date">Date</Label>
                            <Input
                              id="schedule-date"
                              type="date"
                              value={scheduleDate}
                              onChange={(e) => setScheduleDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="schedule-time">Time</Label>
                            <Input
                              id="schedule-time"
                              type="time"
                              value={scheduleTime}
                              onChange={(e) => setScheduleTime(e.target.value)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* A/B Testing */}
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="enable-ab-testing"
                          checked={enableABTesting}
                          onCheckedChange={setEnableABTesting}
                        />
                        <Label htmlFor="enable-ab-testing">A/B Testing</Label>
                      </div>

                      {enableABTesting && (
                        <div className="space-y-3 ml-6">
                          <div>
                            <Label htmlFor="ab-test-split">Test Split (%)</Label>
                            <Input
                              id="ab-test-split"
                              type="number"
                              min="10"
                              max="90"
                              value={abTestSplit}
                              onChange={(e) => setAbTestSplit(parseInt(e.target.value) || 50)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="ab-test-subject">Alternative Subject</Label>
                            <Input
                              id="ab-test-subject"
                              placeholder="Alternative subject line"
                              value={abTestSubject}
                              onChange={(e) => setAbTestSubject(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label htmlFor="ab-test-body">Alternative Body</Label>
                            <Textarea
                              id="ab-test-body"
                              placeholder="Alternative email body"
                              value={abTestBody}
                              onChange={(e) => setAbTestBody(e.target.value)}
                              rows={4}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Email Composer */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Email Composer
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowVariablesModal(true)}
                      >
                        Manage Variables
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={saveTemplate}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Template
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowTemplateModal(true)}
                      >
                        Load Template
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="email-body">Email Body (HTML)</Label>
                      <Textarea
                        id="email-body"
                        placeholder="Enter your email content here... You can use HTML tags for formatting."
                        value={config.body_html}
                        onChange={(e) => setConfig(prev => ({ ...prev, body_html: e.target.value }))}
                        rows={12}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recipients Panel (moved to center column per sketch) */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Recipients ({recipients.length})
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowRecipientModal(true)}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Load Lists
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="recipients">Email Addresses (one per line)</Label>
                    <Textarea
                      id="recipients"
                      placeholder="recipient1@example.com&#10;recipient2@example.com&#10;recipient3@example.com"
                      value={recipientsText}
                      onChange={(e) => setRecipientsText(e.target.value)}
                      rows={8}
                      className="mt-1"
                    />
                  </div>

                  <div className="text-center">
                    <Button variant="outline" onClick={() => setShowRecipientModal(true)} className="w-full">
                      <Users className="h-4 w-4 mr-2" />
                      Load from Data Lists
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Create and manage lists in the Contacts page
                    </p>
                  </div>

                  {recipients.length > 0 && (
                    <div className="text-sm text-gray-600">
                      <p>Valid recipients: {recipients.length}</p>
                      <p>Invalid entries: {recipientsText.split('\n').length - recipients.length}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* RIGHT COLUMN: Stats & Actions */}
            <div className="space-y-6">

              {/* Google Workspace Stats Panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Google Workspace Stats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">{queuedCount}</div>
                      <div className="text-sm text-gray-600">Recipients</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div className="text-lg font-semibold text-green-600">{totalSenders}</div>
                        <div className="text-xs text-gray-600">Workspace Users</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold text-purple-600">{estDuration}m</div>
                        <div className="text-xs text-gray-600">Est. Duration</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Service Accounts:</span>
                        <span className="font-medium">{selectedAccounts.length}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Daily Quota:</span>
                        <span className="font-medium">{config.daily_limit}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Concurrent Senders:</span>
                        <span className="font-medium">{config.workers}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Gmail API Rate:</span>
                        <span className="font-medium text-green-600">250 req/sec</span>
                      </div>
                    </div>

                    {/* Google Workspace Specific Info */}
                    <div className="pt-3 border-t">
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex justify-between">
                          <span>Gmail API Quota:</span>
                          <span className="text-green-600">1B requests/day</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Send Rate:</span>
                          <span className="text-blue-600">~{Math.min(queuedCount, config.daily_limit)} emails</span>
                        </div>
                        <div className="flex justify-between">
                          <span>PowerMTA Mode:</span>
                          <span className="text-purple-600">⚡ Enabled</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Google Workspace Actions Panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    Gmail API Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={() => setShowTestModal(true)}
                    variant="outline"
                    className="w-full"
                    disabled={loading || selectedAccounts.length === 0}
                  >
                    <TestTube className="h-4 w-4 mr-2" />
                    Send Test Email
                  </Button>

                  <Button
                    onClick={() => setShowPreviewModal(true)}
                    variant="outline"
                    className="w-full"
                    disabled={(config.header_type !== '100_percent' && !config.subject.trim()) || !config.body_html.trim()}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview Email
                  </Button>

                  <Button
                    onClick={() => {
                      setShowAnalytics(true);
                      loadAnalytics();
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    View Analytics
                  </Button>

                  <Button
                    onClick={handleCreateCampaign}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={loading || selectedAccounts.length === 0 || recipients.length === 0}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Create Campaign
                      </>
                    )}
                  </Button>

                  <div className="text-xs text-gray-500 text-center">
                    Emails will be sent via Google Workspace users.<br />
                    PowerMTA-style high-speed delivery enabled.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Test Email Modal */}
          {showTestModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold mb-4">Send Test Email</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="test-email">Test Email Address</Label>
                    <Input
                      id="test-email"
                      type="email"
                      placeholder="test@example.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                    />
                  </div>

                  {/* User Selection */}
                  <div>
                    <Label>Select Users to Send From</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedTestUsers((selectedUsers || []).map(u => u.id))}
                        >
                          Select All ({(selectedUsers || []).length})
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedTestUsers([])}
                        >
                          Clear All
                        </Button>
                      </div>

                      <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
                        {(selectedUsers || []).map(user => (
                          <label key={user.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedTestUsers.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTestUsers(prev => [...prev, user.id]);
                                } else {
                                  setSelectedTestUsers(prev => prev.filter(id => id !== user.id));
                                }
                              }}
                            />
                            <span className="truncate">{user.email}</span>
                            <span className={`text-xs ${user.is_active ? 'text-green-600' : 'text-red-600'}`}>
                              {user.is_active ? 'active' : 'inactive'}
                            </span>
                          </label>
                        ))}
                        {selectedUsers.length === 0 && (
                          <div className="text-sm text-gray-500">No users available. Select accounts first.</div>
                        )}
                      </div>

                      {selectedTestUsers.length > 0 && (
                        <div className="text-sm text-blue-600">
                          Selected {selectedTestUsers.length} user(s) for testing
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleSendTest}
                      disabled={loading || !testEmail.trim() || selectedTestUsers.length === 0}
                      className="flex-1"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        `Send Test (${selectedTestUsers.length} users)`
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowTestModal(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Template Modal */}
          {showTemplateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
                <h3 className="text-lg font-semibold mb-4">Load Template</h3>
                <div className="space-y-4">
                  <div className="max-h-64 overflow-y-auto">
                    {templates.map(template => (
                      <div key={template.id} className="flex items-center justify-between p-3 border rounded mb-2">
                        <div>
                          <div className="font-medium">{template.name}</div>
                          <div className="text-sm text-gray-500">{template.subject}</div>
                          <div className="text-xs text-gray-400">{new Date(template.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => loadTemplate(template)}
                          >
                            Load
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteTemplate(template.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                    {templates.length === 0 && (
                      <div className="text-center py-4 text-gray-500">
                        No templates saved yet
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => setShowTemplateModal(false)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recipient Lists Modal */}
          {showRecipientModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
                <h3 className="text-lg font-semibold mb-4">Manage Recipient Lists</h3>

                <div className="space-y-4">
                  {/* Save Current List */}
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-2">Save Current Recipients</h4>
                    <div className="flex gap-2">
                      <Input
                        placeholder="List name"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                      />
                      <Button onClick={() => saveRecipientList()} disabled={!newListName.trim()}>
                        Save
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Tip: You can save an empty list and fill it later.
                    </div>
                  </div>

                  {/* Load Existing Lists */}
                  <div>
                    <h4 className="font-medium mb-2">Load Existing Lists</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(recipientLists || []).map(list => (
                        <div key={list.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <div className="font-medium">{list.name}</div>
                            <div className="text-sm text-gray-500">{(list.recipients || []).length} recipients</div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => loadRecipientList(list)}
                            >
                              Load
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteRecipientList(list.id)}
                            >
                              Delete
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                // Append list into current recipients textarea (dedupe)
                                const existing = new Set(recipientsText.split('\n').map(s => s.trim()).filter(Boolean));
                                list.recipients.forEach(r => existing.add(r));
                                setRecipientsText(Array.from(existing).join('\n'));
                                setShowRecipientModal(false);
                              }}
                            >
                              Add to Editor
                            </Button>
                          </div>
                        </div>
                      ))}
                      {(recipientLists || []).length === 0 && (
                        <div className="text-center py-4 text-gray-500">
                          No saved lists
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => setShowRecipientModal(false)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Variables Modal */}
          {showVariablesModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold mb-4">Email Variables</h3>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <p className="mb-2">Available variables you can use in your email:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><code>{'{{name}}'}</code> - Recipient&apos;s name</li>
                      <li><code>{'{{email}}'}</code> - Recipient&apos;s email</li>
                      <li><code>{'{{company}}'}</code> - Company name</li>
                      <li><code>{'{{date}}'}</code> - Current date</li>
                    </ul>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => setShowVariablesModal(false)}>
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview Modal */}
          {showPreviewModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg w-full max-w-6xl h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b">
                  <h3 className="text-lg font-semibold">Email Preview</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 rounded-lg p-1">
                      <Button
                        size="sm"
                        variant={previewMode === 'desktop' ? 'default' : 'ghost'}
                        onClick={() => setPreviewMode('desktop')}
                      >
                        <Monitor className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={previewMode === 'tablet' ? 'default' : 'ghost'}
                        onClick={() => setPreviewMode('tablet')}
                      >
                        <Tablet className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant={previewMode === 'mobile' ? 'default' : 'ghost'}
                        onClick={() => setPreviewMode('mobile')}
                      >
                        <Smartphone className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setShowPreviewModal(false)}
                    >
                      Close
                    </Button>
                  </div>
                </div>

                <div className="flex-1 p-6 overflow-auto">
                  <div className={`mx-auto bg-white border rounded-lg shadow-lg ${previewMode === 'desktop' ? 'max-w-4xl' :
                    previewMode === 'tablet' ? 'max-w-2xl' :
                      'max-w-sm'
                    }`}>
                    <div className="p-4 border-b bg-gray-50">
                      <div className="text-sm text-gray-600 mb-1">From: {config.from_name} &lt;{selectedAccounts.length > 0 ? users.find(u => selectedAccounts.includes(u.service_account_id))?.email || 'sender@example.com' : 'sender@example.com'}&gt;</div>
                      <div className="text-sm text-gray-600 mb-1">To: john@example.com</div>
                      <div className="font-medium">{generatePreview().subject}</div>
                    </div>
                    <div
                      className="p-4"
                      dangerouslySetInnerHTML={{ __html: generatePreview().html }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Analytics Modal */}
          {showAnalytics && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg w-full max-w-4xl h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b">
                  <h3 className="text-lg font-semibold">Campaign Analytics</h3>
                  <Button
                    variant="outline"
                    onClick={() => setShowAnalytics(false)}
                  >
                    Close
                  </Button>
                </div>

                <div className="flex-1 p-6 overflow-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Key Metrics */}
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{analytics.totalSent}</div>
                      <div className="text-sm text-blue-800">Total Sent</div>
                      <div className="text-xs text-blue-600 mt-1">{analytics.sendRate}% success rate</div>
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{analytics.totalDelivered}</div>
                      <div className="text-sm text-green-800">Delivered</div>
                      <div className="text-xs text-green-600 mt-1">{analytics.deliveryRate}% delivery rate</div>
                    </div>

                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{analytics.totalOpened}</div>
                      <div className="text-sm text-purple-800">Opened</div>
                      <div className="text-xs text-purple-600 mt-1">{analytics.openRate}% open rate</div>
                    </div>

                    <div className="bg-orange-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{analytics.totalClicked}</div>
                      <div className="text-sm text-orange-800">Clicked</div>
                      <div className="text-xs text-orange-600 mt-1">{analytics.clickRate}% click rate</div>
                    </div>
                  </div>

                  {/* Detailed Stats */}
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold mb-4">Engagement Metrics</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm">Open Rate</span>
                          <span className="font-medium">{analytics.openRate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Click Rate</span>
                          <span className="font-medium">{analytics.clickRate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Delivery Rate</span>
                          <span className="font-medium">{analytics.deliveryRate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Send Rate</span>
                          <span className="font-medium">{analytics.sendRate}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold mb-4">Issues & Bounces</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm">Bounced</span>
                          <span className="font-medium text-red-600">{analytics.totalBounced}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Unsubscribed</span>
                          <span className="font-medium text-red-600">{analytics.totalUnsubscribed}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Bounce Rate</span>
                          <span className="font-medium text-red-600">
                            {analytics.totalSent > 0 ? ((analytics.totalBounced / analytics.totalSent) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Unsubscribe Rate</span>
                          <span className="font-medium text-red-600">
                            {analytics.totalSent > 0 ? ((analytics.totalUnsubscribed / analytics.totalSent) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Updates Indicator */}
                  <div className="mt-6 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span>Real-time updates active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            onClick={() => handleContextMenuAction('test')}
          >
            <TestTube className="h-4 w-4" />
            Send Test Email
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            onClick={() => handleContextMenuAction('create')}
          >
            <Send className="h-4 w-4" />
            Create Campaign
          </button>
        </div>
      )}
    </div>
  );
}
