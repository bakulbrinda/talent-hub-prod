/**
 * AI Assistant — Full-page conversational interface.
 * Route: /ai-assistant
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Trash2, Bot, User, Loader2, Info } from 'lucide-react';
import { cn } from '../lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  activeTools?: string[];
  error?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  get_org_summary:              'Analysing organisation overview…',
  get_employees:                'Querying employee data…',
  get_pay_equity_data:          'Analysing pay equity data…',
  get_band_analysis:            'Checking salary band structure…',
  get_performance_pay_alignment:'Analysing performance-pay alignment…',
  get_benefits_data:            'Fetching benefits utilisation data…',
  run_scenario:                 'Running compensation scenario…',
};

const STARTERS = [
  { label: 'Pay equity overview', prompt: 'Give me a full pay equity analysis — overall gender gap, which departments are worst, and your top 2 recommendations.' },
  { label: 'Underpaid top performers', prompt: 'Who are our high performers (rating ≥ 4) who are being paid below 90% compa-ratio? List them with names and departments.' },
  { label: 'Scenario: 10% raise for P2', prompt: 'What would a 10% salary increase for all P2 band employees cost? And how does that affect our total payroll percentage?' },
  { label: 'Band compliance audit', prompt: 'Which employees are outside their salary band? Show me a band-by-band breakdown of how many are below/within/above.' },
  { label: 'Attrition risk by pay', prompt: 'Which departments have the most employees with a compa-ratio below 80%? These are our highest flight-risk employees.' },
  { label: 'Benefits utilisation', prompt: 'Which benefits have the lowest utilisation? What benefits are employees actually using?' },
];

function parseSSEBuffer(buffer: string): Array<{ event: string; data: any }> {
  const results: Array<{ event: string; data: any }> = [];
  const blocks = buffer.split('\n\n');
  for (const block of blocks) {
    if (!block.trim() || block.startsWith(':')) continue;
    const evtMatch  = block.match(/^event: (.+)/m);
    const dataMatch = block.match(/^data: (.+)/m);
    if (evtMatch && dataMatch) {
      try { results.push({ event: evtMatch[1], data: JSON.parse(dataMatch[1]) }); } catch { /* skip */ }
    }
  }
  return results;
}

export default function AIAssistantPage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || streaming) return;
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setStreaming(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true, activeTools: [] }]);

    const token = sessionStorage.getItem('accessToken');
    const ctrl  = new AbortController();
    abortRef.current = ctrl;

    try {
      const resp = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg }),
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const parsed = parseSSEBuffer(part + '\n\n');
          for (const { event: evt, data } of parsed) {
            if (evt === 'text') {
              setMessages(prev => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: last.content + data.text };
                return msgs;
              });
            } else if (evt === 'tool') {
              setMessages(prev => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === 'assistant') {
                  const tools = [...(last.activeTools || [])];
                  if (!tools.includes(data.toolName)) tools.push(data.toolName);
                  msgs[msgs.length - 1] = { ...last, activeTools: tools };
                }
                return msgs;
              });
            } else if (evt === 'done') {
              setMessages(prev => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, isStreaming: false, activeTools: [] };
                return msgs;
              });
              setStreaming(false);
            } else if (evt === 'error') {
              setMessages(prev => {
                const msgs = [...prev];
                const last = msgs[msgs.length - 1];
                if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: `Error: ${data.message}`, isStreaming: false, error: true };
                return msgs;
              });
              setStreaming(false);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: 'Connection error. Please try again.', isStreaming: false, error: true };
          return msgs;
        });
        setStreaming(false);
      }
    }
  }, [streaming]);

  const clearChat = async () => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    const token = sessionStorage.getItem('accessToken');
    await fetch('/api/ai/chat/history', {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            AI Assistant
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ask anything about your org's compensation data — Claude queries live DB</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-green-200 bg-green-50 dark:bg-green-900/20 text-xs font-medium text-green-700 dark:text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Claude claude-sonnet-4-6
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              New conversation
            </button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Messages */}
        <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">Your AI Compensation Analyst</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    I have access to your live employee data, salary bands, performance ratings, and benefits.
                    Ask me anything — I'll pull real numbers.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                  {STARTERS.map(s => (
                    <button
                      key={s.label}
                      onClick={() => sendMessage(s.prompt)}
                      className="text-left px-3 py-2.5 rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-all text-xs"
                    >
                      <p className="font-medium text-foreground">{s.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-3',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm text-sm'
                      : msg.error
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-tl-sm text-sm'
                      : 'bg-muted/40 text-foreground border border-border/40 rounded-tl-sm text-sm'
                  )}>
                    {/* Tool call indicators */}
                    {msg.activeTools && msg.activeTools.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {msg.activeTools.map(tool => (
                          <div key={tool} className="flex items-center gap-2 text-xs text-muted-foreground bg-background/60 rounded-lg px-2.5 py-1.5">
                            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                            {TOOL_LABELS[tool] || tool}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.content ? (
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    ) : msg.isStreaming ? (
                      <span className="inline-flex gap-1 items-center h-5">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                      </span>
                    ) : null}
                    {msg.isStreaming && msg.content && (
                      <span className="inline-block w-0.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-4 border-t border-border">
            <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your compensation data… (Enter to send, Shift+Enter for newline)"
                disabled={streaming}
                rows={2}
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground disabled:opacity-50 resize-none"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
                className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors mb-0.5"
              >
                {streaming ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" /> : <Send className="w-4 h-4 text-primary-foreground" />}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar: capabilities info */}
        <div className="w-56 flex-shrink-0 space-y-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Live Data Access</p>
            </div>
            <ul className="space-y-2">
              {[
                'Employee salaries & bands',
                'Gender pay gap analysis',
                'Performance ratings',
                'Salary band compliance',
                'Benefits utilisation',
                'Scenario modelling',
                'Org-wide statistics',
              ].map(item => (
                <li key={item} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="text-green-500 mt-0.5">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Try asking</p>
            <div className="space-y-1.5">
              {[
                '"Who in Sales is below band?"',
                '"What\'s our biggest pay equity gap?"',
                '"Top 5 most underpaid employees"',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q.replace(/^"|"$/g, ''))}
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-muted/50 transition-colors border border-border/50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
