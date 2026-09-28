import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, Loader2, Download, AlertCircle, Mail } from 'lucide-react';
import { api } from '../../api/client';
import { Invoice } from '../../types/index';
import { InvoicesTable } from '../billing/InvoicesTable';
import { Button } from '../common/UI';
import { SKYOPS_CONTACT_EMAIL } from '../../config/contact';

export const InvoicesManager: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getInvoices();
      setInvoices(res.invoices || []);
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
      setError(err?.message || 'Failed to load billing invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  return (
    <div className="space-y-6 max-w-5xl font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2 font-mono">
            <FileText className="w-4 h-4 text-sky-400" />
            Billing Invoices & Payment Receipts
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Download GST-compliant tax invoices, payment settlements, and subscription charge records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchInvoices}
            disabled={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            className="font-mono text-xs"
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Support notice */}
      <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-zinc-400">
        <span>Need custom billing details, company GSTIN on invoices, or wire transfer receipts?</span>
        <a
          href={`mailto:${SKYOPS_CONTACT_EMAIL}?subject=Billing%20%26%20Invoice%20Support`}
          className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1.5 transition-colors shrink-0"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>{SKYOPS_CONTACT_EMAIL}</span>
        </a>
      </div>

      {/* Invoices Table */}
      <div className="space-y-3">
        <InvoicesTable invoices={invoices} loading={loading} />
      </div>
    </div>
  );
};
