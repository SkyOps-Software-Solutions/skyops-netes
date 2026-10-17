import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  RefreshCw,
  Terminal,
  Trash2,
  X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { AppNotification, NotificationType } from '../../types/index';

interface NotificationCenterProps {
  onOpenPodLogs?: (clusterId: string, namespace: string, podName: string, container?: string) => void;
  onOpenIncident?: (incidentId: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onOpenPodLogs,
  onOpenIncident
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD' | 'LOG_ALERT' | 'INCIDENT'>('ALL');
  const [loading, setLoading] = useState(false);
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);

  const prevUnreadRef = useRef(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotifications = async (isManual = false) => {
    try {
      if (isManual) setLoading(true);
      const res = await api.getNotifications({
        limit: 100,
        type: activeTab === 'LOG_ALERT' || activeTab === 'INCIDENT' ? activeTab : undefined
      });

      setNotifications(res.notifications);
      setTotalUnread(res.totalUnread);

      // Check for newly arrived unread notifications to display toast banner
      if (res.totalUnread > prevUnreadRef.current && prevUnreadRef.current !== 0) {
        const latest = res.notifications.find((n) => !n.read);
        if (latest) {
          showToast(latest);
        }
      }
      prevUnreadRef.current = res.totalUnread;
    } catch (err) {
      console.warn('Failed to fetch notifications:', err);
    } finally {
      if (isManual) setLoading(false);
    }
  };

  const showToast = (notif: AppNotification) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setActiveToast(notif);
    toastTimeoutRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 7000);
  };

  // Initial fetch and 10s auto-polling
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setTotalUnread((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setTotalUnread(0);
    } catch (err) {
      console.warn('Failed to mark all notifications as read:', err);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await api.deleteNotification(id);
      const target = notifications.find((n) => n.id === id);
      if (target && !target.read) {
        setTotalUnread((prev) => Math.max(0, prev - 1));
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.warn('Failed to delete notification:', err);
    }
  };

  const handleClearRead = async () => {
    try {
      await api.clearReadNotifications();
      setNotifications((prev) => prev.filter((n) => !n.read));
    } catch (err) {
      console.warn('Failed to clear read notifications:', err);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'UNREAD') return !n.read;
    if (activeTab === 'LOG_ALERT') return n.type === 'LOG_ALERT';
    if (activeTab === 'INCIDENT') return n.type === 'INCIDENT';
    return true;
  });

  const formatRelativeTime = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getSeverityBadge = (sev: string) => {
    switch (sev.toUpperCase()) {
      case 'CRITICAL':
      case 'FATAL':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/80';
      case 'HIGH':
      case 'ERROR':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      case 'MEDIUM':
      case 'WARN':
        return 'bg-yellow-950/80 text-yellow-300 border-yellow-800/80';
      default:
        return 'bg-sky-950/80 text-sky-300 border-sky-800/80';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Notification Center (Log alerts, Kubernetes events & incidents)"
        className={`relative p-2 rounded-lg border transition-all cursor-pointer ${
          isOpen
            ? 'bg-zinc-800 text-sky-400 border-sky-500/50 shadow-md'
            : totalUnread > 0
            ? 'bg-zinc-900/90 text-zinc-200 border-zinc-700/80 hover:bg-zinc-800 hover:text-white'
            : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
        }`}
        aria-label="Notification Center"
      >
        <Bell className="w-4 h-4" />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-rose-600 rounded-full border-2 border-zinc-950 shadow-sm animate-pulse">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Floating In-App Toast Banner */}
      {activeToast && !isOpen && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full bg-zinc-900/95 border border-sky-500/40 rounded-xl shadow-2xl p-4 backdrop-blur-md animate-in slide-in-from-bottom-5 font-sans">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Terminal className="w-4 h-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-100">{activeToast.title}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${getSeverityBadge(activeToast.severity)}`}>
                    {activeToast.severity}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {activeToast.podName && <span>Pod: <code className="text-zinc-200 font-mono">{activeToast.podName}</code> &bull; </span>}
                  <span>{formatRelativeTime(activeToast.createdAt)}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="text-zinc-500 hover:text-zinc-300 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeToast.redactedExcerpt && (
            <div className="mt-2.5 p-2 bg-zinc-950/80 border border-zinc-800 rounded font-mono text-[11px] text-rose-300 truncate">
              {activeToast.redactedExcerpt}
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-2 text-xs">
            {activeToast.podName && onOpenPodLogs && (
              <button
                onClick={() => {
                  setActiveToast(null);
                  onOpenPodLogs(
                    activeToast.clusterId || '',
                    activeToast.namespace || 'default',
                    activeToast.podName || '',
                    activeToast.container
                  );
                }}
                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>View Logs</span>
              </button>
            )}
            <button
              onClick={() => {
                handleMarkAsRead(activeToast.id);
                setActiveToast(null);
              }}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[420px] max-w-[90vw] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden font-sans flex flex-col text-xs">
          {/* Header */}
          <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-400">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-sm text-zinc-100">Notifications</span>
              {totalUnread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-800/80 text-rose-300 text-[10px] font-bold">
                  {totalUnread} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchNotifications(true)}
                disabled={loading}
                title="Refresh notifications"
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar & Quick Actions */}
          <div className="px-3 py-2 border-b border-zinc-800/80 bg-zinc-900/90 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  activeTab === 'ALL'
                    ? 'bg-zinc-800 text-sky-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('UNREAD')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  activeTab === 'UNREAD'
                    ? 'bg-zinc-800 text-sky-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Unread ({totalUnread})
              </button>
              <button
                onClick={() => setActiveTab('LOG_ALERT')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  activeTab === 'LOG_ALERT'
                    ? 'bg-zinc-800 text-sky-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Log Alerts
              </button>
              <button
                onClick={() => setActiveTab('INCIDENT')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  activeTab === 'INCIDENT'
                    ? 'bg-zinc-800 text-sky-400 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Incidents
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              {totalUnread > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  title="Mark all notifications as read"
                  className="text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Mark all read</span>
                </button>
              )}
              {notifications.some((n) => n.read) && (
                <button
                  onClick={handleClearRead}
                  title="Clear all read notifications"
                  className="text-zinc-500 hover:text-rose-400 flex items-center gap-1 cursor-pointer ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-zinc-800/60">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 space-y-2">
                <Bell className="w-8 h-8 mx-auto text-zinc-700" />
                <p className="font-semibold text-zinc-400">
                  {activeTab === 'UNREAD' ? "You're all caught up!" : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-zinc-600 max-w-xs mx-auto">
                  {activeTab === 'UNREAD'
                    ? 'No unread alerts or incident notifications.'
                    : 'Cluster events and live log alerts will appear here when triggered.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3.5 transition-colors flex flex-col gap-2 ${
                    !n.read ? 'bg-sky-950/20 hover:bg-sky-950/30' : 'bg-transparent hover:bg-zinc-800/40'
                  }`}
                >
                  {/* Top line: severity, title, timestamp, actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="mt-0.5">
                        {!n.read ? (
                          <span className="w-2 h-2 rounded-full bg-sky-400 block" title="Unread" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-transparent block" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-zinc-100 text-xs truncate max-w-[220px]">
                            {n.title}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${getSeverityBadge(
                              n.severity
                            )}`}
                          >
                            {n.severity}
                          </span>
                          {n.type === 'LOG_ALERT' && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                              LOG
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-0.5">
                          <Clock className="w-3 h-3 text-zinc-600" />
                          <span>{formatRelativeTime(n.createdAt)}</span>
                          {n.clusterName && (
                            <>
                              <span>&bull;</span>
                              <span className="truncate max-w-[120px]">{n.clusterName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!n.read && (
                        <button
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                          title="Mark as read"
                          className="p-1 text-zinc-400 hover:text-sky-400 rounded hover:bg-zinc-800"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(n.id, e)}
                        title="Delete notification"
                        className="p-1 text-zinc-500 hover:text-rose-400 rounded hover:bg-zinc-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Context chips */}
                  {(n.namespace || n.podName || n.container) && (
                    <div className="flex items-center gap-1 flex-wrap text-[10px] font-mono text-zinc-400">
                      {n.namespace && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-300">
                          ns: {n.namespace}
                        </span>
                      )}
                      {n.podName && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-300">
                          pod: {n.podName}
                        </span>
                      )}
                      {n.container && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-400">
                          c: {n.container}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Message body */}
                  <p className="text-[11px] text-zinc-300 leading-relaxed">{n.message}</p>

                  {/* Redacted Excerpt Box */}
                  {n.redactedExcerpt && (
                    <div className="p-2 bg-zinc-950 border border-zinc-800 rounded font-mono text-[10px] text-rose-300/90 leading-tight break-all max-h-16 overflow-hidden">
                      {n.redactedExcerpt}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {n.podName && onOpenPodLogs && (
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          onOpenPodLogs(
                            n.clusterId || '',
                            n.namespace || 'default',
                            n.podName || '',
                            n.container
                          );
                        }}
                        className="px-2 py-0.5 rounded bg-sky-950/80 hover:bg-sky-900/80 text-sky-300 border border-sky-800/80 font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>Inspect Pod Logs &rarr;</span>
                      </button>
                    )}

                    {n.incidentId && onOpenIncident && (
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          onOpenIncident(n.incidentId!);
                        }}
                        className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>View Incident</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
