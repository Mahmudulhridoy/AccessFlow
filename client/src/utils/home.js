export const homeFor = (user) => (user.role === 'ADMIN' ? '/admin/scans' : '/dashboard');
