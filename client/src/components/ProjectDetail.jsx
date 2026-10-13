import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { alertBox, btnDanger, btnLight, card } from "../utils/ui";
import AppLayout from "./AppLayout";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .get(`/projects/${id}`)
      .then((res) => setProject(res.data.project))
      .catch((err) =>
        setError(
          err.response?.status === 404
            ? "Project not found"
            : "Could not load the project",
        ),
      );
  }, [id]);

  const handleDelete = async () => {
    const ok = window.confirm(
      `Delete "${project.name}"? Its scans and results will be deleted too.`,
    );
    if (!ok) return;

    setError("");
    setDeleting(true);
    try {
      await api.delete(`/projects/${id}`);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Could not delete the project");
      setDeleting(false);
    }
  };

  if (!project) {
    return (
      <AppLayout title="My Projects">
        {error ? (
          <p role="alert" className={alertBox}>
            {error}
          </p>
        ) : (
          <p className="text-muted">Loading...</p>
        )}
        <Link
          to="/dashboard"
          className="mt-4 inline-block font-semibold underline"
        >
          Back to dashboard
        </Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="My Projects">
      <p className="text-muted">
        <Link to="/dashboard" className="underline">
          My Projects
        </Link>{" "}
        / {project.name}
      </p>

      {error && (
        <p role="alert" className={`${alertBox} mt-4`}>
          {error}
        </p>
      )}

      <section className={`${card} mt-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-bold">{project.name}</h1>
            <p className="mt-1 break-all text-muted">{project.url}</p>
          </div>
          <div className="flex gap-3">
            <Link to={`/projects/${project.id}/edit`} className={btnLight}>
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={btnDanger}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
