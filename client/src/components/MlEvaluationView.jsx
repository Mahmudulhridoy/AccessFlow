import { card } from '../utils/ui';

const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : 'n/a');
const ci = (arr) => (Array.isArray(arr) ? ` (95% CI ${pct(arr[0])} to ${pct(arr[1])})` : '');
const MODEL_LABELS = {
  majority_class: 'Majority class (baseline)',
  axe_impact_mapping: 'Axe impact → priority rule (baseline)',
  logistic_regression: 'Logistic regression',
  decision_tree: 'Decision tree',
  random_forest: 'Random Forest',
};

function Tile({ label, value, note }) {
  return (
    <div className="rounded-[10px] border border-line bg-white px-3.5 py-2.5">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {note && <p className="text-[12px] text-muted">{note}</p>}
    </div>
  );
}

function Th({ children, scope = 'col' }) {
  return <th scope={scope} className="border-b border-line px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-muted">{children}</th>;
}
const td = 'border-b border-line px-3 py-2';

function StatusBanner({ ev }) {
  if (ev.status === 'SYNTHETIC_DEVELOPMENT_ONLY') {
    return (
      <p role="note" className="mt-4 rounded-[10px] bg-[#fee4e2] p-3 text-[#912018]">
        <b>Development model on synthetic data.</b> {ev.metricsWithheldReason} No performance is reported for this model.
      </p>
    );
  }
  if (ev.status === 'EXPLORATORY') {
    return (
      <p role="note" className="mt-4 rounded-[10px] bg-amber-50 p-3 text-amber-900">
        <b>Exploratory result.</b> The dataset did not pass every quality gate ({ev.eligibilityReason || 'reason not recorded'}).
        Treat these numbers as indicative only, not as validated model performance.
      </p>
    );
  }
  return null;
}

function Detail({ ev }) {
  const labels = ev.labels;
  const m = ev.metrics;
  const cmp = ev.comparison;
  const order = Object.keys(cmp.testMetrics);
  const gates = ev.readinessGates ? Object.entries(ev.readinessGates) : [];

  return (
    <>
      <div role="group" aria-label="Test-set metrics (macro average)" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Precision (macro)" value={pct(m.precisionMacro)} />
        <Tile label="Recall (macro)" value={pct(m.recallMacro)} />
        <Tile label="F1-score (macro)" value={pct(m.f1Macro)} note={ci(m.ci?.macro_f1_95ci).trim()} />
        <Tile label="High-priority recall" value={pct(m.highRecall)} note={ci(m.ci?.high_recall_95ci).trim()} />
      </div>
      <p className="mt-2 text-[13px] text-muted">Computed once on the held-out test split (whole websites kept together). Confidence intervals come from a bootstrap over websites.</p>

      <h3 className="mt-6 text-sm font-bold">Per-class results</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[13px]">
          <caption className="sr-only">Precision, recall, F1-score and support for each priority class</caption>
          <thead><tr><Th>Class</Th><Th>Precision</Th><Th>Recall</Th><Th>F1-score</Th><Th>Test examples</Th></tr></thead>
          <tbody>
            {labels.map((l) => (
              <tr key={l}>
                <th scope="row" className={`${td} text-left font-semibold`}>{l}</th>
                <td className={td}>{pct(ev.perClass[l]?.precision)}</td>
                <td className={td}>{pct(ev.perClass[l]?.recall)}</td>
                <td className={td}>{pct(ev.perClass[l]?.['f1-score'])}</td>
                <td className={td}>{ev.perClass[l]?.support ?? 'n/a'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-sm font-bold">Confusion matrix (test split)</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="text-[13px]">
          <caption className="sr-only">Rows are the human label, columns are the model's prediction</caption>
          <thead>
            <tr><td className="px-3 py-2" /><Th scope="colgroup">Predicted →</Th>{labels.slice(1).map((l) => <td key={l} />)}</tr>
            <tr><Th>True ↓</Th>{labels.map((l) => <Th key={l}>{l}</Th>)}</tr>
          </thead>
          <tbody>
            {ev.confusionMatrix.map((row, i) => {
              const total = row.reduce((a, b) => a + b, 0) || 1;
              return (
                <tr key={labels[i]}>
                  <th scope="row" className={`${td} text-left font-semibold`}>{labels[i]}</th>
                  {row.map((n, j) => (
                    <td key={j} className={`${td} text-center ${i === j ? 'bg-[#efedff] font-bold' : ''}`}>
                      {n} <span className="text-[11px] text-muted">({Math.round((n / total) * 100)}%)</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 text-sm font-bold">Baseline classifier comparison</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[13px]">
          <caption className="sr-only">Cross-validation and test-set scores for every model that was compared</caption>
          <thead>
            <tr><Th>Model</Th><Th>CV macro-F1 (train)</Th><Th>Test precision</Th><Th>Test recall</Th><Th>Test F1</Th><Th>Test High recall</Th></tr>
          </thead>
          <tbody>
            {order.map((name) => {
              const t = cmp.testMetrics[name];
              const isSel = name === cmp.selected;
              return (
                <tr key={name} className={isSel ? 'bg-[#efedff]' : ''}>
                  <th scope="row" className={`${td} text-left font-semibold`}>
                    {MODEL_LABELS[name] || name}{isSel ? ' — selected' : ''}
                  </th>
                  <td className={td}>{pct(cmp.cv?.[name]?.cv_macro_f1_mean)}</td>
                  <td className={td}>{pct(t.precision_macro)}</td>
                  <td className={td}>{pct(t.recall_macro)}</td>
                  <td className={td}>{pct(t.f1_macro)}</td>
                  <td className={td}>{pct(t.high_recall)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        The model was chosen by cross-validation on the training split, not by test scores.
        {cmp.beatsAxeImpactBaseline === true && ' On the test split it scores higher macro-F1 than the axe-impact baseline.'}
        {cmp.beatsAxeImpactBaseline === false && ' On the test split it does NOT beat the axe-impact baseline in macro-F1.'}
      </p>

      {gates.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-bold">Dataset quality gates</h3>
          <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
            {gates.map(([k, ok]) => (
              <li key={k}>{ok ? 'Passed' : 'Failed'}: {k.replaceAll('_', ' ')}</li>
            ))}
          </ul>
          {typeof ev.selfConsistency?.weighted_kappa === 'number' && (
            <p className="mt-2 text-[13px] text-muted">Annotator self-consistency (weighted kappa): {ev.selfConsistency.weighted_kappa.toFixed(2)} on {ev.selfConsistency.n} re-labelled findings.</p>
          )}
        </>
      )}
    </>
  );
}

export default function MlEvaluationView({ ev }) {
  const d = ev.dataset;
  const counts = d.classCounts || {};
  return (
    <section className={`${card} mt-5`} aria-labelledby={`ev-${ev.id}`}>
      <h2 id={`ev-${ev.id}`} className="text-base font-bold">{ev.modelName} — version {ev.modelVersion}</h2>
      <StatusBanner ev={ev} />

      <dl className="mt-4 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
        <div><dt className="inline font-semibold">Algorithm: </dt><dd className="inline">{MODEL_LABELS[ev.algorithm] || ev.algorithm || 'n/a'}</dd></div>
        <div><dt className="inline font-semibold">Evaluation date: </dt><dd className="inline">{new Date(ev.evaluatedAt).toLocaleString()}</dd></div>
        <div><dt className="inline font-semibold">Dataset version: </dt><dd className="inline">{d.version}</dd></div>
        <div><dt className="inline font-semibold">Dataset origin: </dt><dd className="inline">{d.origin === 'REAL_ANNOTATED' ? 'Real collected pages, human-labelled' : 'Synthetic fixture (not real data)'}</dd></div>
        <div><dt className="inline font-semibold">Findings: </dt><dd className="inline">{d.size}{d.domains?.train != null ? ` from ${d.domains.train + (d.domains.test ?? 0)} websites` : ''}</dd></div>
        <div><dt className="inline font-semibold">Feature version: </dt><dd className="inline">{ev.featureVersion || 'n/a'}</dd></div>
      </dl>

      <div className="mt-3 overflow-x-auto">
        <table className="text-[13px]">
          <caption className="sr-only">Number of labelled findings per class in the training and test splits</caption>
          <thead><tr><Th>Split</Th>{ev.labels.map((l) => <Th key={l}>{l}</Th>)}</tr></thead>
          <tbody>
            {['train', 'test'].map((s) => (
              <tr key={s}>
                <th scope="row" className={`${td} text-left font-semibold capitalize`}>{s}</th>
                {ev.labels.map((l) => <td key={l} className={td}>{counts[s]?.[l] ?? 'n/a'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ev.metricsWithheld ? null : <Detail ev={ev} />}
    </section>
  );
}
