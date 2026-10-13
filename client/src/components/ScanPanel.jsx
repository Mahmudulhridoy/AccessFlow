import { useEffect, useState } from "react";
import api from "../api/axios";
import {
  ACTIVE_STATUSES,
  STATUS_LABELS,
  statusBadge,
} from "../utils/scanStatus";
import { alertBox } from "../utils/ui";

export default function ScanPanel({ projectId, refreshKey }) {
  const [scans, setScans] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer;

    const load = async () => {
      try {
        const res = await api.get(`/projects/${projectId}/scans`);
        if (cancelled) return;
        setScans(res.data.scans);
        setError("");
        if (res.data.scans.some((s) => ACTIVE_STATUSES.includes(s.status))) {
          timer = setTimeout(load, 2000);
        }
      } catch {
        if (!cancelled) setError("Could not load scan status");
      }
    };

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, refreshKey]);

  if (error)
    return (
      <p role="alert" className={`${alertBox} mt-4`}>
        {error}
      </p>
    );
  if (!scans) return <p className="mt-4 text-muted">Loading scans...</p>;
  if (scans.length === 0)
    return <p className="mt-4 text-muted">No scans yet.</p>;

  return (
    <div className="mt-4">
      <p role="status" className="text-muted">
        Latest scan (#{scans[0].id}): {STATUS_LABELS[scans[0].status]}
      </p>
      <ul className="mt-3 space-y-3">
        {scans.map((s) => (
          <li key={s.id} className="rounded-[10px] border border-line p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">Scan #{s.id}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(s.status)}`}
              >
                {STATUS_LABELS[s.status]}
              </span>
            </div>
            <p className="mt-1 break-all text-[13px] text-muted">
              {s.scannedUrl}
            </p>
            <p className="text-[13px] text-muted">
              {new Date(s.createdAt).toLocaleString()}
            </p>
            {s.status === "FAILED" && (
              <p className="mt-2 text-[#912018]">{s.errorMessage}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
