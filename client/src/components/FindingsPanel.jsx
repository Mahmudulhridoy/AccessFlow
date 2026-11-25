import { useState } from 'react';
import api from '../api/axios';
import { alertBox, btnLight } from '../utils/ui';
import FindingsView from './FindingsView';
import { FindingsSkeleton } from './Skeleton';

// Loads a scan's findings only when the user asks for them, so a long scan history does not fire many requests.
export default function FindingsPanel({ scanId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || data || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/scans/${scanId}/findings`);
      setData(res.data);
    } catch {
      setError('Could not load the findings for this scan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      <button type="button" onClick={toggle} aria-expanded={open} className={btnLight}>
        {open ? 'Hide accessibility findings' : 'View accessibility findings'}
      </button>
      {open && (
        <div aria-live="polite" className="mt-3">
          {loading && <FindingsSkeleton />}
          {error && <p role="alert" className={alertBox}>{error}</p>}
          {data && <FindingsView data={data} />}
        </div>
      )}
    </div>
  );
}
