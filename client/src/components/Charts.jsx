import {
  Bar, BarChart, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Pie, PieChart, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

// Chart text and backgrounds use CSS variables, so the charts follow light and dark mode without any extra code.
const TICK = (size) => ({ fontSize: size, style: { fill: 'var(--color-muted)' } });

// Every chart repeats its numbers as text underneath, so the information is not only in the picture.

export function ChartCard({ title, subtitle, children }) {
  return (
    <figure className="m-0 rounded-2xl border border-line bg-white p-5 shadow-sm">
      <figcaption>
        <p className="text-[15px] font-bold">{title}</p>
        {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
      </figcaption>
      {children}
    </figure>
  );
}

function Legend({ data }) {
  return (
    <ul className="mt-3 grid gap-1.5 text-[13px]">
      {data.map((d) => (
        <li key={d.name} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden="true" />
          <span className="text-muted">{d.name}</span>
          <b className="ml-auto">{d.value}</b>
        </li>
      ))}
    </ul>
  );
}

export function Donut({ data, centerValue, centerLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = total === 0 ? [{ name: 'None', value: 1, color: 'var(--chart-grid)' }] : data.filter((d) => d.value > 0);
  return (
    <>
      <div className="relative mx-auto mt-2 h-44 w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={total ? 2 : 0} stroke="none">
              {shown.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            {total > 0 && <Tooltip />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-hidden="true">
          <div>
            <p className="text-3xl font-bold leading-none">{centerValue}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{centerLabel}</p>
          </div>
        </div>
      </div>
      <Legend data={data} />
    </>
  );
}

export function HBars({ data, height = 170 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <>
      <div className="mt-2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} tick={TICK(12)} />
            <Tooltip cursor={{ fill: 'var(--chart-hover)' }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={14} background={{ fill: 'var(--chart-grid)', radius: 6 }}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        {total === 0 ? 'Nothing to show.' : data.map((d) => `${d.name}: ${d.value}`).join(' · ')}
      </p>
    </>
  );
}

export function TrendBars({ data }) {
  return (
    <>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={TICK(11)} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={TICK(11)} />
            <Tooltip cursor={{ fill: 'var(--chart-hover)' }} />
            <Bar dataKey="issues" fill="#6c5ce7" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[12px] text-muted">{data.map((d) => `${d.name}: ${d.issues}`).join(' · ')}</p>
    </>
  );
}

/** Four WCAG principles on one radar. The numbers are repeated underneath so the shape is never the only signal. */
export function PrincipleRadar({ data, extra }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <>
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="68%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="var(--color-line)" />
            <PolarAngleAxis dataKey="name" tick={TICK(12)} />
            <PolarRadiusAxis angle={90} domain={[0, max]} allowDecimals={false} tick={false} axisLine={false} />
            <Radar dataKey="value" name="Issues" stroke="#6c5ce7" fill="#6c5ce7" fillOpacity={0.35} strokeWidth={2} dot={{ r: 3, fill: '#6c5ce7' }} />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {total === 0 ? 'Nothing to show.' : data.map((d) => `${d.name}: ${d.value}`).join(' · ')}
        {extra > 0 && ` · Best practice (no WCAG principle): ${extra}`}
      </p>
    </>
  );
}

/** A percentage line over time (helpful rate per day). */
export function RateLine({ data }) {
  return (
    <>
      <div className="mt-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={TICK(11)} />
            <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={TICK(11)} />
            <Tooltip formatter={(v, _n, item) => [`${v}% of ${item.payload.total} rating${item.payload.total === 1 ? '' : 's'}`, 'Helpful']} />
            <Line type="monotone" dataKey="rate" stroke="#12b76a" strokeWidth={2.5} dot={{ r: 3, fill: '#12b76a' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[12px] text-muted">{data.map((d) => `${d.name}: ${d.rate}% (${d.total})`).join(' · ')}</p>
    </>
  );
}
