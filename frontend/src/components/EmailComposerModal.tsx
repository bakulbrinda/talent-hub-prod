import { useState } from 'react';
import { X, Sparkles, Send, Loader2, Mail, Code } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

export interface EmailComposerEmployee {
  name: string;
  department: string;
  band: string;
  rating?: number;
  ctc?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  employee?: EmailComposerEmployee;
}

const USE_CASE_SUGGESTIONS = [
  'Low performer with high pay — needs improvement plan',
  'Star performer ready for promotion',
  'Retention risk — below market pay',
  'Outstanding contribution recognition',
  'Performance improvement plan (PIP) initiation',
  'Salary review discussion',
];

export default function EmailComposerModal({ open, onClose, employee }: Props) {
  const qc = useQueryClient();
  const [useCase, setUseCase] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<'compose' | 'preview'>('compose');
  const [showRawHtml, setShowRawHtml] = useState(false);

  const handleClose = () => {
    setUseCase('');
    setSubject('');
    setBody('');
    setRecipientEmail('');
    setStep('compose');
    onClose();
  };

  const handleGenerate = async () => {
    if (!useCase.trim()) return;
    setGenerating(true);
    try {
      const r = await api.post('/email/ai-compose', {
        useCase,
        employeeName: employee?.name,
        department: employee?.department,
        band: employee?.band,
        rating: employee?.rating,
        ctc: employee?.ctc,
      });
      setSubject(r.data.data.subject);
      setBody(r.data.data.body);
      setStep('preview');
    } catch {
      toast.error('Failed to generate email — check AI configuration');
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!recipientEmail.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await api.post('/email/send-custom', { recipientEmail, subject, body, useCase });
      toast.success('Email sent', { description: `Sent to ${recipientEmail}` });
      qc.invalidateQueries({ queryKey: ['mail-logs'] });
      handleClose();
    } catch {
      toast.error('Failed to send email — check SMTP configuration');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Compose HR Email</h2>
            {employee && (
              <span className="text-xs text-muted-foreground">
                — {employee.name} · {employee.department} · {employee.band}
              </span>
            )}
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Use case */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Reason for communication
            </label>
            <textarea
              value={useCase}
              onChange={e => setUseCase(e.target.value)}
              placeholder="Describe the situation (e.g. Low performer with high pay needing a structured improvement plan)"
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {USE_CASE_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => setUseCase(s)}
                  className={cn(
                    'text-[11px] px-2 py-1 rounded-full border transition-colors',
                    useCase === s
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          {step === 'compose' && (
            <button
              onClick={handleGenerate}
              disabled={generating || !useCase.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Generating with Claude AI…' : 'Generate email with Claude AI'}
            </button>
          )}

          {/* Subject + Body (after generation) */}
          {step === 'preview' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Subject</label>
                  <button
                    onClick={() => { setSubject(''); setBody(''); setStep('compose'); }}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Sparkles className="w-3 h-3" /> Regenerate
                  </button>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email body</label>
                  <button
                    onClick={() => setShowRawHtml(v => !v)}
                    className={cn(
                      'flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors',
                      showRawHtml
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Code className="w-3 h-3" /> {showRawHtml ? 'Preview' : 'Edit HTML'}
                  </button>
                </div>
                {showRawHtml ? (
                  <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  />
                ) : (
                  <div
                    className="w-full min-h-[200px] max-h-72 overflow-y-auto px-4 py-3 rounded-lg border border-border bg-background text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: body }}
                  />
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                  Recipient email address
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={e => setRecipientEmail(e.target.value)}
                  placeholder="employee@company.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0">
            <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !recipientEmail.trim() || !subject.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
