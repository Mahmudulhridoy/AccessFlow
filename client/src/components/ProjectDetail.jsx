import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { alertBox, card } from '../utils/ui';
import AppLayout from './AppLayout';
import ScanPanel from './ScanPanel';
import StartScan from './StartScan';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [scanRefresh, setScanRefresh] = useState(0);

  useEffect(() => {
    api
      .get(`/projects/${id}`)
      .then((res) => setProject(res.data.project))
      .catch((err) =>
        setError(err.response?.status === 404 ? 'Project not found' : 'Could not load the project')
      );
  }, [id]);

  const handleDelete = async () => {
    const ok = window.confirm(`Delete "${project.name}"? Its scans and results will be deleted too.`);
    if (!ok) return;

    setError('');
    setDeleting(true);
    try {
      await api.delete(`/projects/${id}`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete the project');
      setDeleting(false);
    }
  };

  if (!project) {
    return (
      <AppLayout title="My Projects">
        {error ? <p role="alert" className={alertBox}>{error}</p> : <p className="text-muted">Loading...</p>}
        <Link to="/dashboard" className="mt-4 inline-block font-semibold underline">Back to dashboard</Link>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="My Projects">
      <p className="text-muted">
        <Link to="/dashboard" className="underline">My Projects</Link> / {project.name}
      </p>

      {error && <p role="alert" className={`${alertBox} mt-4`}>{error}</p>}

      <section className="mt-4 rounded-3xl bg-gradient-to-br from-navy via-[#26215c] to-brand p-6 text-white shadow-lg md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-bold uppercase tracking-widest text-white/60">Project</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{project.name}</h1>
            <p className="mt-1 break-all text-white/75">{project.url}</p>
          </div>
          <div className="flex gap-3">
            <Link to={`/projects/${project.id}/edit`} className="inline-flex min-h-11 items-center rounded-[10px] bg-white/15 px-5 font-semibold ring-1 ring-white/25 hover:bg-white/25">Edit</Link>
            <button onClick={handleDelete} disabled={deleting} className="inline-flex min-h-11 items-center rounded-[10px] bg-[#b42318] px-5 font-semibold hover:bg-[#912018] disabled:opacity-60">
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <h2 className="text-lg font-bold">Scan history</h2>
          <ScanPanel projectId={project.id} refreshKey={scanRefresh} />
        </section>
        <section className={`${card} self-start xl:sticky xl:top-5`}>
          <h2 className="text-base font-bold">Scan this page</h2>
          <p className="mt-2 text-muted">Checks one public page against a selected set of accessibility rules (not all of WCAG).</p>
          <StartScan projectId={project.id} onStarted={() => setScanRefresh((n) => n + 1)} />
        </section>
      </div>
    </AppLayout>
  );
}
