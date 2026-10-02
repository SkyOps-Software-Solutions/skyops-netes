/**
 * Date and timestamp formatting utilities.
 * Completely eliminates "Invalid Date" errors across all Kubernetes event and timeline displays.
 */

export function safeEventTimestamp(evt?: {
  lastObserved?: number;
  timestamp?: number;
  lastTimestamp?: number;
  firstObserved?: number;
}): number {
  if (!evt) return Date.now();
  const raw = evt.lastObserved ?? evt.timestamp ?? evt.lastTimestamp ?? evt.firstObserved;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return Date.now();
}

export function formatEventTimestamp(ts?: number | string): string {
  if (ts === undefined || ts === null || ts === '') return 'Just now';
  const num = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (typeof num !== 'number' || Number.isNaN(num) || num <= 0) {
    return 'Just now';
  }
  const d = new Date(num);
  if (Number.isNaN(d.getTime())) {
    return 'Just now';
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatEventDateTime(ts?: number | string): string {
  if (ts === undefined || ts === null || ts === '') return 'Unknown';
  const num = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (typeof num !== 'number' || Number.isNaN(num) || num <= 0) {
    return 'Unknown';
  }
  const d = new Date(num);
  if (Number.isNaN(d.getTime())) {
    return 'Unknown';
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function formatTimeAgo(ts?: number | string): string {
  if (ts === undefined || ts === null || ts === '') return 'just now';
  const num = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (typeof num !== 'number' || Number.isNaN(num) || num <= 0) {
    return 'just now';
  }
  const diff = Math.floor((Date.now() - num) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatIncidentDetectedDateTime(ts?: number | string): string {
  if (ts === undefined || ts === null || ts === '') return 'Unknown';
  const num = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (typeof num !== 'number' || Number.isNaN(num) || num <= 0) {
    return 'Unknown';
  }
  const d = new Date(num);
  if (Number.isNaN(d.getTime())) {
    return 'Unknown';
  }
  const dayStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  let tzStr = '';
  try {
    const formatted = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).format(d);
    const parts = formatted.split(' ');
    tzStr = parts[parts.length - 1] || '';
  } catch {
    tzStr = '';
  }
  return `${dayStr} · ${timeStr}${tzStr ? ` ${tzStr}` : ''}`;
}

