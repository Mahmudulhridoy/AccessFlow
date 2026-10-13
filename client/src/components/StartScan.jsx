import { useState } from "react";
import api from "../api/axios";
import { alertBox, btnDark } from "../utils/ui";

export default function StartScan({ projectId, onStarted }) {
  const [confirmed, setConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const handleStart = async () => {
    setError("");
    setStarting(true);
    try {
      const res = await api.post(`/projects/${projectId}/scans`, {
        permissionConfirmed: confirmed,
      });
      onStarted(res.data.scan);
      setConfirmed(false);
    } catch (err) {
      setError(err.response?.data?.error || "Could not start the scan");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="mt-4">
      {error && (
        <p role="alert" className={`${alertBox} mb-3`}>
          {error}
        </p>
      )}
      <label className="flex min-h-11 items-center gap-2.5 font-medium">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="h-[18px] w-[18px]"
        />
        I am allowed to test this website
      </label>
      <button
        onClick={handleStart}
        disabled={!confirmed || starting}
        className={`${btnDark} mt-2 w-full`}
      >
        {starting ? "Starting..." : "Start scan"}
      </button>
    </div>
  );
}
