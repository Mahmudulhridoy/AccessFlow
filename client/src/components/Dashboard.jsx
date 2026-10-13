import { useAuth } from '../context/AuthContext';
import AppLayout from './AppLayout';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <AppLayout title="Dashboard">
      <h1 className="text-[22px] font-bold">Dashboard</h1>
      <p className="mt-2 text-muted">Signed in as {user.email}</p>
    </AppLayout>
  );
}
