import { useEffect, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api.js';
import { EmptyState, ErrorBanner, Loading, NetAmount } from '../../components/ui.jsx';
import { categoryColor, formatDate, formatMoney } from '../../utils.js';

const major = (cents) => Math.round(cents) / 100;

function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

function ChartCard({ title, children, className = '' }) {
  return (
    <section className={`card chart-card ${className}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function AnalyticsTab({ trip }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/trips/${trip.id}/analytics`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [trip.id]);

  if (!data) return error ? <ErrorBanner message={error} /> : <Loading />;

  const { totals, me } = data;
  const fmt = (c) => formatMoney(c, trip.currency);
  const money = (v) => formatMoney(v * 100, trip.currency);
  const compact = (v) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v);

  if (totals.expenseCount === 0) {
    return <EmptyState title="Nothing to analyse yet">Add some expenses and the charts will appear here.</EmptyState>;
  }

  const categoryData = data.byCategory.map((c) => ({ name: c.category, value: major(c.totalCents), count: c.count }));
  const dailyData = data.byDate.map((d) => ({
    date: formatDate(d.date, { day: 'numeric', month: 'short' }),
    spent: major(d.totalCents),
    cumulative: major(d.cumulativeCents),
  }));
  const memberData = data.byMember.map((m) => ({ name: m.name, paid: major(m.paidCents), share: major(m.shareCents) }));
  const memberCategoryData = data.memberCategory.rows.map((r) => {
    const row = { name: r.name };
    for (const c of data.memberCategory.categories) row[c] = major(r[c] ?? 0);
    return row;
  });

  return (
    <div className="analytics">
      <div className="stat-grid">
        <Stat label="Total spent" value={fmt(totals.totalCents)} hint={`${totals.expenseCount} expenses`} />
        <Stat label="Per person" value={fmt(totals.perPersonCents)} hint={`${totals.memberCount} members`} />
        <Stat label="Daily average" value={fmt(totals.dailyAverageCents)} hint={`over ${totals.dayCount} day${totals.dayCount === 1 ? '' : 's'}`} />
        <Stat label="Average expense" value={fmt(totals.averageExpenseCents)} />
        <Stat
          label="Largest expense"
          value={fmt(data.largestExpense.amount_cents)}
          hint={data.largestExpense.description}
        />
        <Stat label="Settled so far" value={fmt(totals.settledCents)} hint={`${fmt(totals.outstandingCents)} still outstanding`} />
      </div>

      {me && (
        <section className="card my-summary">
          <div>
            <span className="stat-label">You paid</span>
            <strong>{fmt(me.paidCents)}</strong>
          </div>
          <div>
            <span className="stat-label">Your share</span>
            <strong>{fmt(me.shareCents)}</strong>
          </div>
          <div>
            <span className="stat-label">Your share of the trip</span>
            <strong>{totals.totalCents ? ((me.shareCents / totals.totalCents) * 100).toFixed(1) : 0}%</strong>
          </div>
          <div>
            <span className="stat-label">Net position</span>
            <strong>
              <NetAmount cents={me.netCents} currency={trip.currency} />
            </strong>
          </div>
        </section>
      )}

      <div className="grid-2">
        <ChartCard title="Spending by category">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {categoryData.map((c) => (
                  <Cell key={c.name} fill={categoryColor(c.name)} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Category breakdown">
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Count</th>
                <th className="num">Amount</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.byCategory.map((c) => (
                <tr key={c.category}>
                  <td>
                    <span className="dot" style={{ background: categoryColor(c.category) }} />
                    {c.category}
                  </td>
                  <td className="num">{c.count}</td>
                  <td className="num">{fmt(c.totalCents)}</td>
                  <td className="num">{((c.totalCents / totals.totalCents) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>

      <ChartCard title="Spending over time">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tickFormatter={compact} tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={compact} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => money(v)} />
            <Legend />
            <Area yAxisId="right" type="monotone" dataKey="cumulative" name="Running total" fill="#ccfbf1" stroke="#14b8a6" />
            <Bar yAxisId="left" dataKey="spent" name="Spent that day" fill="#0d9488" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#0f766e" dot={false} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid-2">
        <ChartCard title="Paid vs. share per person">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={memberData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => money(v)} />
              <Legend />
              <Bar dataKey="paid" name="Paid" fill="#0d9488" radius={[4, 4, 0, 0]} />
              <Bar dataKey="share" name="Share" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="What each person spent on">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={memberCategoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => money(v)} />
              {data.memberCategory.categories.map((c) => (
                <Bar key={c} dataKey={c} stackId="a" fill={categoryColor(c)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid-2">
        <ChartCard title="Top expenses">
          <table className="table">
            <tbody>
              {data.topExpenses.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className="dot" style={{ background: categoryColor(e.category) }} />
                    {e.description}
                    <div className="muted small">
                      {e.payer_name} · {formatDate(e.expense_date)}
                    </div>
                  </td>
                  <td className="num">{fmt(e.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard title="Member summary">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th className="num">Paid</th>
                <th className="num">Share</th>
                <th className="num">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.byMember.map((m) => (
                <tr key={m.userId}>
                  <td>{m.name}</td>
                  <td className="num">{fmt(m.paidCents)}</td>
                  <td className="num">{fmt(m.shareCents)}</td>
                  <td className="num">
                    <NetAmount cents={m.netCents} currency={trip.currency} labels={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>
    </div>
  );
}
