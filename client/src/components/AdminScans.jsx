import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/axios";
import {
  ACTIVE_STATUSES,
  ERROR_CODES,
  STATUS_LABELS,
  statusBadge,
} from "../utils/scanStatus";
import { alertBox, card, input, label } from "../utils/ui";
import AppLayout from "./AppLayout";
import StatCard from "./StatCard";

export default function AdminScans() {
  const [summary, setSummary] = useState(null);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/admin/scans/summary")
      .then((res) => setSummary(res.data))
      .catch(() => setError("Could not load the summary"));
  }, []);

  useEffect(() => {
    api
      .get("/admin/scans", {
        params: {
          status: status || undefined,
          errorCode: errorCode || undefined,
          page,
        },
      })
      .then((res) => {
        setData(res.data);
        setError("");
      })
      .catch(() => setError("Could not load scans"));
  }, [status, errorCode, page]);

  const count = (list) =>
    summary
      ? summary.byStatus
          .filter((r) => list.includes(r.status))
          .reduce((s, r) => s + r.count, 0)
      : "-";

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;
  const chartData = summary
    ? summary.byErrorCode.map((r) => ({ name: r.errorCode, count: r.count }))
    : [];

  return (
    <AppLayout title="Platform overview">
      <h1 className="text-[22px] font-bold">Scan monitoring</h1>

      {error && (
        <p role="alert" className={`${alertBox} mt-4`}>
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="globe"
          label="Total Scans"
          value={summary ? summary.total : "-"}
          note="All users"
        />
        <StatCard
          icon="check"
          label="Completed"
          value={count(["COMPLETED", "COMPLETED_WITH_WARNINGS"])}
          note="Including warnings"
        />
        <StatCard
          icon="xc"
          label="Failed Scans"
          value={count(["FAILED"])}
          note="See errors below"
        />
        <StatCard
          icon="clock"
          label="In Progress"
          value={count(ACTIVE_STATUSES)}
          note="Queued or running"
        />
      </div>

      <section className={`${card} mt-5`}>
        <h2 className="text-base font-bold">Errors by code</h2>
        {chartData.length === 0 ? (
          <p className="mt-3 text-muted">No scan errors yet.</p>
        ) : (
          <>
            <div className="mt-3 h-64 w-full">
              <ResponsiveContainer>
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8eaf2" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6c5ce7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[13px] text-muted">
              {chartData.map((d) => `${d.name}: ${d.count}`).join(", ")}
            </p>
          </>
        )}
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="text-base font-bold">All scans</h2>

        <div className="mt-3 flex flex-wrap gap-4">
          <div>
            <label htmlFor="status" className={label}>
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={`${input} w-48`}
            >
              <option value="">All</option>
              {Object.entries(STATUS_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="errorCode" className={label}>
              Error code
            </label>
            <select
              id="errorCode"
              value={errorCode}
              onChange={(e) => {
                setErrorCode(e.target.value);
                setPage(1);
              }}
              className={`${input} w-48`}
            >
              <option value="">All</option>
              {ERROR_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!data ? (
          <p className="mt-4 text-muted">Loading...</p>
        ) : data.scans.length === 0 ? (
          <p className="mt-4 text-muted">No scans match these filters.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <caption className="sr-only">Scans across all users</caption>
              <thead>
                <tr className="bg-page text-[#434769]">
                  {[
                    "Scan",
                    "Project",
                    "Owner",
                    "URL",
                    "Status",
                    "Error",
                    "Started",
                  ].map((h) => (
                    <th key={h} scope="col" className="p-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.scans.map((s) => (
                  <tr key={s.id} className="border-b border-line">
                    <td className="p-3">#{s.id}</td>
                    <td className="p-3">{s.project.name}</td>
                    <td className="p-3">{s.project.user.email}</td>
                    <td className="max-w-xs break-all p-3">{s.scannedUrl}</td>
                    <td className="p-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(s.status)}`}
                      >
                        {STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="p-3">{s.errorCode || "-"}</td>
                    <td className="whitespace-nowrap p-3">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="mt-4 flex items-center gap-4 text-[13px]">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="min-h-11 rounded-[10px] border border-[#cfd3e6] px-4 disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="min-h-11 rounded-[10px] border border-[#cfd3e6] px-4 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </AppLayout>
  );
}
