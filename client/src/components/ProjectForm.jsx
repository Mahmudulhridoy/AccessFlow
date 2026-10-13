import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { alertBox, btnDark, btnLight, card, input, label } from "../utils/ui";
import AppLayout from "./AppLayout";

export default function ProjectForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api
      .get(`/projects/${id}`)
      .then((res) => {
        setName(res.data.project.name);
        setUrl(res.data.project.url);
      })
      .catch(() => setError("Could not load this project"))
      .finally(() => setLoading(false));
  }, [id, editing]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = editing
        ? await api.put(`/projects/${id}`, { name, url })
        : await api.post("/projects", { name, url });
      navigate(`/projects/${res.data.project.id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong, try again");
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title="My Projects">
      <section className={`${card} max-w-lg`}>
        <h1 className="text-[22px] font-bold">
          {editing ? "Edit project" : "New project"}
        </h1>
        {loading ? (
          <p className="mt-4 text-muted">Loading...</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            {error && (
              <p role="alert" className={alertBox}>
                {error}
              </p>
            )}
            <div>
              <label htmlFor="name" className={label}>
                Project name
              </label>
              <input
                id="name"
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label htmlFor="url" className={label}>
                Page URL
              </label>
              <input
                id="url"
                type="url"
                required
                aria-describedby="url-hint"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={input}
              />
              <p id="url-hint" className="mt-1 text-xs text-muted">
                A public page, including http:// or https://
              </p>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting} className={btnDark}>
                {submitting ? "Saving..." : "Save"}
              </button>
              <Link
                to={editing ? `/projects/${id}` : "/dashboard"}
                className={btnLight}
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </section>
    </AppLayout>
  );
}
