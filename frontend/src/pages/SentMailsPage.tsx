import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const fetchMailLogs = async (page: number) => {
  const r = await api.get(`/email/mail-logs?page=${page}&limit=20`);
  return r.data;
};

export default function SentMailsPage() {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mail-logs', page],
    queryFn: () => fetchMailLogs(page),
  });

  const logs: any[] = data?.data || [];
  const meta = data?.meta || { total: 0, totalPages: 1 };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sent Mails</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Log of all HR emails sent through the platform
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1.5fr_1fr_1fr_80px] gap-4 px-5 py-3 bg-muted/30 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <span>Sent At</span>
          <span>Subject</span>
          <span>Recipient</span>
          <span>Use Case</span>
          <span>Sent By</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Mail className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No emails sent yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log: any) => {
              const isExpanded = expandedId === log.id;
              return (
                <div key={log.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className={cn(
                      'w-full grid grid-cols-[1fr_1.5fr_1fr_1fr_80px] gap-4 px-5 py-3.5 text-left text-sm transition-colors hover:bg-muted/20',
                      isExpanded && 'bg-muted/10'
                    )}
                  >
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(log.sentAt).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <span className="font-medium text-foreground truncate flex items-center gap-1.5">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-primary flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                      {log.subject}
                    </span>
                    <span className="text-muted-foreground truncate">{log.recipientEmail}</span>
                    <span className="text-muted-foreground text-xs truncate">{log.useCase || '—'}</span>
                    <span className="text-muted-foreground text-xs truncate">{log.sentBy?.name || '—'}</span>
                  </button>

                  {/* Expanded body preview */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1 bg-muted/5">
                      <div
                        className="text-sm text-foreground border border-border rounded-lg p-4 bg-background max-h-72 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: log.body }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground">
              {meta.total} email{meta.total !== 1 ? 's' : ''} total
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">Page {page} of {meta.totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
