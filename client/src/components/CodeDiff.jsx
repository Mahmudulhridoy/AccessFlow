import CodeBlock from './CodeBlock';

// Broken HTML from the scanned page next to the AI's corrected example. The two are not a literal patch: the AI sees the
// rule and a snippet, so the example shows the idea of the fix. The existing AI disclaimer under every finding says so.
export default function CodeDiff({ before, after }) {
  if (!after) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <CodeBlock tone="bad" title="Before: from your page" code={before || '(no snippet was saved for this element)'} />
      <CodeBlock tone="good" title="After: AI suggestion" code={after} copyLabel="Copy fix" />
    </div>
  );
}
