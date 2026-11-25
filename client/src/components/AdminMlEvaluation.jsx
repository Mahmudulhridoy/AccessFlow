import { useEffect, useState } from 'react';
import api from '../api/axios';
import { alertBox, card, input, label } from '../utils/ui';
import AppLayout from './AppLayout';
import MlEvaluationView from './MlEvaluationView';

export default function AdminMlEvaluation() {
  const [evaluations, setEvaluations] = useState(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/ml/evaluations')
      .then((res) => setEvaluations(res.data.evaluations))
      .catch(() => setError('Could not load ML evaluation records'));
  }, []);

  return (
    <AppLayout title="Platform overview">
      <h1 className="text-[22px] font-bold">ML model evaluation</h1>
      <p className="mt-1 text-muted">Read-only. These are the saved results of offline training runs; nothing here is computed in the browser.</p>

      {error && <p role="alert" className={`${alertBox} mt-4`}>{error}</p>}
      {!evaluations && !error && <p className="mt-4 text-muted">Loading...</p>}

      {evaluations && evaluations.length === 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="text-base font-bold">No evaluation records yet</h2>
          <p className="mt-2 text-muted">
            A model has not been trained and imported. Train a model on a labelled dataset, then import its
            <code> model_metadata.json </code> with <code>node scripts/import-ml-evaluation.js</code>. Until then, priorities shown to users come from
            the scanner-impact fallback, not from machine learning.
          </p>
        </section>
      )}

      {evaluations && evaluations.length > 1 && (
        <div className="mt-4">
          <label htmlFor="evaluation" className={label}>Evaluation record</label>
          <select id="evaluation" value={selected} onChange={(e) => setSelected(Number(e.target.value))} className={`${input} w-full max-w-md`}>
            {evaluations.map((ev, i) => (
              <option key={ev.id} value={i}>{ev.modelName} {ev.modelVersion} — {new Date(ev.evaluatedAt).toLocaleDateString()}{i === 0 ? ' (latest)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      {evaluations && evaluations[selected] && <MlEvaluationView ev={evaluations[selected]} />}
    </AppLayout>
  );
}
