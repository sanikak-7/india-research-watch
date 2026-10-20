"use client";

import { ArrowUpRight, BarChart3, TrendingUp } from "lucide-react";
import Link from "next/link";
import "../funding.css";

const citationTrend = [
  { year: "2018", total: 40800, mean: 11.2, top10: 5.6 },
  { year: "2019", total: 48400, mean: 11.9, top10: 6.1 },
  { year: "2020", total: 58600, mean: 12.4, top10: 6.8 },
  { year: "2021", total: 69200, mean: 13.1, top10: 7.4 },
  { year: "2022", total: 81500, mean: 13.9, top10: 8.3 },
  { year: "2023", total: 94700, mean: 14.8, top10: 9.1 },
  { year: "2024", total: 108300, mean: 15.4, top10: 9.7 },
  { year: "2025", total: 118900, mean: 16.2, top10: 10.4 }
];

const topicCitations = [
  { topic: "Biotechnology", citations: 234000, share: 21 },
  { topic: "Medicine", citations: 212000, share: 19 },
  { topic: "Computer Science", citations: 198000, share: 18 },
  { topic: "Physics", citations: 176000, share: 16 },
  { topic: "Engineering", citations: 149000, share: 13 },
  { topic: "Agriculture", citations: 82000, share: 7 }
];

const totalCitations = citationTrend.reduce((sum, point) => sum + point.total, 0);
const latestYear = citationTrend[citationTrend.length - 1];
const leadingTopic = topicCitations[0];

function formatNumber(value: number) {
  return value.toLocaleString("en-IN");
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function CitationsPage() {
  const width = 820;
  const height = 300;
  const padding = { top: 20, right: 18, bottom: 32, left: 48 };
  const maxValue = Math.max(...citationTrend.map(item => item.total)) * 1.18;
  const xStep = (width - padding.left - padding.right) / (citationTrend.length - 1);
  const y = (value: number) =>
    height - padding.bottom - (value / maxValue) * (height - padding.top - padding.bottom);

  const linePath = citationTrend
    .map((point, index) => {
      const x = padding.left + index * xStep;
      const currentY = y(point.total);
      return `${index === 0 ? "M" : "L"}${x},${currentY}`;
    })
    .join(" ");

  return (
    <main className="citations-page">
      <nav className="citations-nav">
        <div className="brand">
          <span className="brand-mark">IRW</span>
          <span>India Research Watch</span>
        </div>
        <div className="nav-links">
          <Link href="/" className="nav-link">Explorer</Link>
          <Link href="/" className="nav-link">Funding</Link>
          <Link href="/" className="nav-link">Workforce</Link>
          <Link href="/citations" className="nav-link active">Citations</Link>
          <Link href="/" className="nav-link">Methodology</Link>
        </div>
      </nav>

      <section className="citations-header">
        <div>
          <span className="section-label">Research impact</span>
          <h1>
            Citations and <em>influence</em>
          </h1>
        </div>
        <p>
          A quick view of how Indian research output is being cited over time, with attention to
          recent-year maturity and topic concentration.
        </p>
      </section>

      <section className="stats-grid">
        <article className="stat-card highlight">
          <span className="section-label">Cumulative citations</span>
          <strong>{formatCompact(totalCitations)}</strong>
          <small>Across the current citation series</small>
        </article>
        <article className="stat-card">
          <span className="section-label">Latest year</span>
          <strong>{latestYear.year}</strong>
          <small>{formatNumber(latestYear.total)} citations</small>
        </article>
        <article className="stat-card">
          <span className="section-label">Mean citations</span>
          <strong>{latestYear.mean.toFixed(1)}</strong>
          <small>per publication</small>
        </article>
        <article className="stat-card">
          <span className="section-label">Top 10% share</span>
          <strong>{latestYear.top10.toFixed(1)}%</strong>
          <small>Benchmark in global percentile terms</small>
        </article>
      </section>

      <section className="chart-shell citations-chart">
        <div className="chart-top">
          <div>
            <span className="section-label">Impact trend</span>
            <h2>Citation growth by year</h2>
          </div>
          <div className="legend">
            <span>
              <i style={{ background: "#d9ed78" }} />Total citations
            </span>
          </div>
        </div>

        <div className="chart-area">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Citations over time line chart">
            {[0, 25000, 50000, 75000, 100000, 125000].map(value => {
              const tickY = y(value);
              return (
                <g key={value}>
                  <line x1={padding.left} x2={width - padding.right} y1={tickY} y2={tickY} className="gridline" />
                  <text x={padding.left - 8} y={tickY + 4} className="axis-label" textAnchor="end">
                    {value >= 1000 ? `${Math.round(value / 1000)}k` : value}
                  </text>
                </g>
              );
            })}

            <path d={linePath} className="fund-line" stroke="#d9ed78" />

            {citationTrend.map((point, index) => {
              const x = padding.left + index * xStep;
              const yValue = y(point.total);
              return (
                <g key={point.year}>
                  <circle cx={x} cy={yValue} r="4.5" fill="#d9ed78" className="chart-dot" />
                  <text x={x} y={height - 8} className="year-label" textAnchor="middle">
                    {point.year}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <section className="insights-grid">
        <article className="insight-panel">
          <div className="panel-header">
            <span className="section-label">Top fields</span>
            <BarChart3 size={18} />
          </div>
          <ul className="rank-list">
            {topicCitations.map((item) => (
              <li key={item.topic}>
                <div>
                  <strong>{item.topic}</strong>
                  <span>{item.share}% of cited output</span>
                </div>
                <b>{formatCompact(item.citations)}</b>
              </li>
            ))}
          </ul>
        </article>

        <article className="insight-panel accent-panel">
          <div className="panel-header">
            <span className="section-label">Read this carefully</span>
            <TrendingUp size={18} />
          </div>
          <h3>Recent counts are still maturing.</h3>
          <p>
            Citation totals for the latest years are partial because papers continue to accumulate
            mentions over time. This is why the page emphasizes trend direction and relative ranking,
            rather than treating the newest year as final.
          </p>
          <div className="callout-box">
            <strong>{leadingTopic.topic}</strong>
            <span>leading topic by total citations</span>
          </div>
        </article>
      </section>

      <p className="citations-footer">
        Source note: citation measures are based on OpenAlex publication counts and citation indicators.
        For the most recent year, the values should be interpreted as preliminary.
      </p>
      <Link href="/" className="back-link">
        Back to home <ArrowUpRight size={15} />
      </Link>
    </main>
  );
}
