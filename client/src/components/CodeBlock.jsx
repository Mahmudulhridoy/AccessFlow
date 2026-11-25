import { useState } from 'react';
import { copyText } from '../utils/clipboard';
import { useToast } from './Toast';

// A tiny HTML highlighter. It builds React elements (never raw HTML strings), so page content cannot inject markup.
const TAG = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>?/g;
const ATTR = /([^\s=/>]+)(?:(=)("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

function tagNodes(tag, key) {
  const m = /^<(\/?)([a-zA-Z][\w:-]*)([\s\S]*?)(\/?>?)$/.exec(tag);
  if (!m) return [tag];
  const [, slash, name, rest, close] = m;
  const out = [<span key={`${key}a`} className="text-white/50">{`<${slash}`}</span>, <span key={`${key}b`} className="text-[#ff9db0]">{name}</span>];
  let last = 0;
  let i = 0;
  for (const a of rest.matchAll(ATTR)) {
    out.push(rest.slice(last, a.index));
    out.push(<span key={`${key}n${i}`} className="text-[#ffd479]">{a[1]}</span>);
    if (a[2]) {
      out.push(<span key={`${key}e${i}`} className="text-white/50">=</span>);
      out.push(<span key={`${key}v${i}`} className="text-[#8be9b1]">{a[3]}</span>);
    }
    last = a.index + a[0].length;
    i += 1;
  }
  out.push(rest.slice(last));
  out.push(<span key={`${key}c`} className="text-white/50">{close}</span>);
  return out;
}

export function highlightHtml(code) {
  const out = [];
  let last = 0;
  let i = 0;
  for (const m of code.matchAll(TAG)) {
    if (m.index > last) out.push(code.slice(last, m.index));
    out.push(m[0].startsWith('<!--') ? <span key={`t${i}`} className="text-white/45">{m[0]}</span> : <span key={`t${i}`}>{tagNodes(m[0], `t${i}`)}</span>);
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CopyButton({ text, label = 'Copy', done = 'Copied to clipboard', className = '' }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const click = async (e) => {
    e.stopPropagation();
    const ok = await copyText(text);
    toast(ok ? done : 'Could not copy. Select the text and copy it by hand.', { tone: ok ? 'success' : 'error' });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <button
      type="button"
      onClick={click}
      className={`no-print inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 text-[12px] font-semibold text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${className}`}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

export default function CodeBlock({ code, tone = 'neutral', title, copyLabel }) {
  const ring = tone === 'bad' ? 'ring-[#d92d20]/60' : tone === 'good' ? 'ring-[#12b76a]/60' : 'ring-white/10';
  return (
    <div className={`min-w-0 overflow-hidden rounded-xl bg-navy ring-1 ${ring}`}>
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
          <p className="text-[12px] font-bold text-white/80">{title}</p>
          {copyLabel && <CopyButton text={code} label={copyLabel} done="Fixed code copied" className="!min-h-7 !border-white/20 !bg-white/10 !text-white hover:!bg-white/20" />}
        </div>
      )}
      <pre className="print-full max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-relaxed text-white"><code>{highlightHtml(code)}</code></pre>
    </div>
  );
}
