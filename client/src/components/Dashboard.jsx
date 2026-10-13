import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { alertBox, btnDark, card } from "../utils/ui";
import AppLayout from "./AppLayout";
import StatCard from "./StatCard";

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/projects")
      .then((res) => setProjects(res.data.projects))
      .catch(() => setError("Could not load your projects"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout title="My Projects">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold">Dashboard</h1>
        <Link to="/projects/new" className={btnDark}>
          New project
        </Link>
      </div>

      {error && (
        <p role="alert" className={`${alertBox} mt-5`}>
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="folder"
          label="Total Projects"
          note="Up to 10 allowed"
          value={loading ? "-" : projects.length}
        />
      </div>

      <section className={`${card} mt-5`}>
        <h2 className="text-base font-bold">Your projects</h2>
        {loading && <p className="mt-4 text-muted">Loading...</p>}
        {!loading && !error && projects.length === 0 && (
          <p className="mt-4 text-muted">
            You don't have any projects yet. Create one to start scanning a
            page.
          </p>
        )}
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="block rounded-[10px] border border-line p-4 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1 break-all text-[13px] text-muted">{p.url}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppLayout>
  );
}
