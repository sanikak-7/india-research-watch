"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./funding.css";

type Sector = { name: string; short: string; funding: string; growth: string; patents: string; citations: string; institutes: string; color: string; x: number; y: number; blurb: string };
type FundingSource = { name: string; color: string; values: (number | null)[] };
type WorkforceSector = { sector: string; displayLabel: string; totalWorkforce: number; womenWorkforce: number };

type IndicatorSeries = { name: string; color: string; values: (number | null)[]; format: (value: number) => string };

// Keep the workforce source separate so the annual figures can be updated in one place.
const WORKFORCE_DATA_FILE = "/data/rd-workforce-by-performing-sector-2023-24.csv";

const sectors: Sector[] = [
  { name:"Transportation", short:"Transport", funding:"₹39,286.45 Cr", growth:"+35.7%", patents:"—", citations:"—", institutes:"—", color:"#ff6b4a", x:50,y:5, blurb:"India's largest industry R&D group by combined public and private expenditure." },
  { name:"Drugs & Pharmaceuticals", short:"Pharma", funding:"₹25,849.93 Cr", growth:"+15.3%", patents:"—", citations:"—", institutes:"—", color:"#7b61ff", x:70,y:13, blurb:"Combined public and private industry R&D expenditure in pharmaceuticals." },
  { name:"Biotechnology", short:"Biotech", funding:"₹10,322.83 Cr", growth:"+5.8%", patents:"—", citations:"—", institutes:"—", color:"#e7b84a", x:88,y:28, blurb:"Combined public and private industry R&D expenditure in biotechnology." },
  { name:"Information Technology", short:"IT", funding:"₹9,587.44 Cr", growth:"+50.6%", patents:"—", citations:"—", institutes:"—", color:"#f0904c", x:91,y:51, blurb:"Combined public and private industry R&D expenditure in information technology." },
  { name:"Electricals & Electronics", short:"Electronics", funding:"₹7,071.76 Cr", growth:"+30.0%", patents:"—", citations:"—", institutes:"—", color:"#b5d76f", x:82,y:72, blurb:"Combined public and private industry R&D expenditure in electricals and electronics." },
  { name:"Fuels", short:"Fuels", funding:"₹6,368.46 Cr", growth:"+21.8%", patents:"—", citations:"—", institutes:"—", color:"#57c7bb", x:65,y:88, blurb:"Combined public and private industry R&D expenditure in fuels." },
  { name:"Chemicals other than Fertilizers", short:"Chemicals", funding:"₹3,367.99 Cr", growth:"+10.1%", patents:"—", citations:"—", institutes:"—", color:"#64a8ff", x:36,y:90, blurb:"Combined public and private industry R&D expenditure in chemicals other than fertilizers." },
  { name:"Industrial Equipment", short:"Equipment", funding:"₹1,880.35 Cr", growth:"+9.1%", patents:"—", citations:"—", institutes:"—", color:"#3bcf9c", x:13,y:72, blurb:"Combined public and private industry R&D expenditure in industrial equipment." },
  { name:"Agricultural Machinery", short:"Agri machinery", funding:"₹1,846.83 Cr", growth:"+14.1%", patents:"—", citations:"—", institutes:"—", color:"#d983e7", x:7,y:50, blurb:"Combined public and private industry R&D expenditure in agricultural machinery." },
  { name:"Metallurgical Industries", short:"Metals", funding:"₹1,264.02 Cr", growth:"−16.5%", patents:"—", citations:"—", institutes:"—", color:"#6ea6d8", x:10,y:28, blurb:"Combined public and private industry R&D expenditure in metallurgical industries." },
  { name:"Rubber", short:"Rubber", funding:"₹1,148.43 Cr", growth:"+16.5%", patents:"—", citations:"—", institutes:"—", color:"#ed7690", x:28,y:13, blurb:"Combined public and private industry R&D expenditure in rubber." },
  { name:"Food Processing Industries", short:"Food processing", funding:"₹893.43 Cr", growth:"+10.3%", patents:"—", citations:"—", institutes:"—", color:"#5cbdde", x:50,y:18, blurb:"Combined public and private industry R&D expenditure in food processing." }
];

const orbitSectors = sectors.map((sector, index) => {
  const angle = (index / sectors.length) * Math.PI * 2 - Math.PI / 2;
  const radius = 42;
  return { ...sector, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
});

const fundingYears = ["1970-71", "1980-81", "1990-91", "2001-02", "2010-11", "2013-14", "2014-15", "2015-16", "2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25*", "2025-26*"];
const fundingSources = [
  { name: "Central Sector", color: "#d9ed78", values: [112.47,580.49,3058.27,11536.33,33095.18,38879.89,43094.90,46887.17,50219.42,56920.02,65423.90,69317.09,61281.48,79355.80,81183.38,85711.50,89130.71,92725.43] },
  { name: "State Sector", color: "#6fc8b5", values: [12.58,59.34,365.92,1494.33,4457.81,5951.15,6327.32,6447.94,6866.96,7264.81,8029.21,8554.79,8476.35,8394.24,9193.28,9796.10,10582.52,11432.07] },
  { name: "Private Sector", color: "#f48762", values: [14.59,120.69,549.98,3292.69,19337.02,30514.80,32538.39,36022.15,39124.71,41855.88,42489.95,44753.54,46388.13,82974.99,95422.17,118351.68,141355.00,168834.00] },
  { name: "Higher Education", color: "#a58cf4", values: [null,null,null,714.80,3306.74,4010.05,5512.83,6095.18,6888.17,7784.33,8797.08,9941.59,11235.00,24085.80,27579.29,30908.53,35127.90,40015.52] }
];

const rAndDTable3Years = [
  "1995-96", "1996-97", "1997-98", "1998-99", "1999-00", "2000-01", "2001-02", "2002-03", "2003-04", "2004-05", "2005-06", "2006-07", "2007-08", "2008-09", "2009-10", "2010-11", "2011-12", "2012-13", "2013-14", "2014-15", "2015-16", "2016-17", "2017-18", "2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25*", "2025-26*"
];

const rAndDTable3Series: IndicatorSeries[] = [
  {
    name: "R&D expenditure",
    color: "#d9ed78",
    values: [7483.88,8913.61,10611.34,12473.17,14397.60,16198.80,17038.15,18088.16,20086.34,24117.24,29932.58,34238.39,39437.77,47353.38,53041.30,60196.75,65961.33,73982.79,79355.89,87473.44,95452.44,103099.26,113825.03,124740.14,132567.01,127380.96,194810.83,213378.12,244767.81,276196.13,313007.02],
    format: value => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} Cr`
  },
  {
    name: "R&D as % of GDP",
    color: "#64d3c7",
    values: [0.61,0.63,0.67,0.69,0.71,0.74,0.72,0.71,0.71,0.74,0.81,0.80,0.79,0.84,0.82,0.77,0.76,0.74,0.71,0.70,0.69,0.67,0.67,0.66,0.66,0.64,0.83,0.82,0.84,0.87,0.90],
    format: value => `${value.toFixed(2)}%`
  }
];

const parseCsv = (text: string) => {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const fields = header.split(",");
  return lines.filter(Boolean).map(line => Object.fromEntries(fields.map((field, index) => [field, line.split(",")[index] ?? ""])));
};

const numberOrNull = (value: string) => value === "" ? null : Number(value);
const formatCr = (value: number) => `\u20b9${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} Cr`;

async function loadWebsiteData() {
  const responses = await Promise.all([
    fetch("/data/industry-rd-expenditure-fy2023-24.csv"),
    fetch("/data/funding-by-sector.csv"),
    fetch("/data/national-rd-trend.csv"),
    fetch(WORKFORCE_DATA_FILE)
  ]);
  if (!responses.every(response => response.ok)) throw new Error("Unable to load website data");
  const [industryRows, fundingRows, trendRows, workforceRows] = await Promise.all(responses.map(response => response.text())).then(files => files.map(parseCsv));
  const sectors = industryRows.map(row => ({
    name: row.sector, short: row.short_name, funding: formatCr(Number(row.combined_expenditure_cr)), growth: `${Number(row.yoy_growth_pct) >= 0 ? "+" : ""}${row.yoy_growth_pct}%`,
    patents: row.patents_granted || "—", citations: row.scientific_citations || "—", institutes: row.key_institutions || "—", color: row.color, x: 0, y: 0, blurb: row.description
  }));
  const sources = [
    ["Central Sector", "#d9ed78", "central_sector_cr"], ["State Sector", "#6fc8b5", "state_sector_cr"],
    ["Private Sector", "#f48762", "private_sector_cr"], ["Higher Education", "#a58cf4", "higher_education_cr"]
  ] as const;
  return {
    sectors,
    fundingYears: fundingRows.map(row => row.financial_year),
    fundingSources: sources.map(([name, color, column]) => ({ name, color, values: fundingRows.map(row => numberOrNull(row[column])) })),
    rAndDTable3Years: trendRows.map(row => row.financial_year),
    rAndDTable3Series: [
      { name: "R&D expenditure", color: "#d9ed78", values: trendRows.map(row => numberOrNull(row.rd_expenditure_cr)), format: formatCr },
      { name: "R&D as % of GDP", color: "#64d3c7", values: trendRows.map(row => numberOrNull(row.rd_gdp_pct)), format: (value: number) => `${value.toFixed(2)}%` }
    ] as IndicatorSeries[],
    workforceSectors: workforceRows.map(row => ({
      sector: row.sector,
      displayLabel: row.display_label,
      totalWorkforce: Number(row.total_workforce),
      womenWorkforce: Number(row.women_workforce)
    })) as WorkforceSector[]
  };
}

function FundingSources({ fundingYears, fundingSources }: { fundingYears: string[]; fundingSources: FundingSource[] }) {
  const [point, setPoint] = useState(15);
  const max = 180000, width = 920, height = 400, left = 62, right = 30, top = 28, bottom = 58;
  const x = (i: number) => left + i * ((width - left - right) / (fundingYears.length - 1));
  const y = (value: number) => top + (max - value) * ((height - top - bottom) / max);
  const path = (values: (number | null)[]) => values.reduce((d, value, i) => value === null ? d : `${d}${i && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)} `, "");
  return <section className="funding-page">
    <div className="funding-intro"><div><span className="section-label">National R&D expenditure</span><h1>Who funds<br/><em>India&apos;s research?</em></h1></div><p>Track how each funding sector has contributed to India&apos;s R&D expenditure over the years.</p></div>
    <div className="chart-shell"><div className="chart-top"><div><span className="section-label">Funding trajectory</span><h2>Expenditure by sector</h2></div><div className="legend">{fundingSources.map(source => <span key={source.name}><i style={{background:source.color}}/>{source.name}</span>)}</div></div>
      <div className="chart-area"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart of national research and development expenditure by funding sector"><defs>{fundingSources.map(source=><linearGradient key={source.name} id={`fade-${source.name}`} x1="0" x2="1"><stop stopColor={source.color}/><stop offset="1" stopColor={source.color}/></linearGradient>)}</defs>{[0,45000,90000,135000,180000].map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="gridline"/><text x={left-12} y={y(value)+4} className="axis-label" textAnchor="end">{value === 0 ? "0" : `₹${value/1000}k`}</text></g>)}{fundingSources.map(source=><path key={source.name} d={path(source.values)} stroke={source.color} className="fund-line"/>)}{fundingYears.map((year,i)=><g key={year}><line x1={x(i)} x2={x(i)} y1={height-bottom} y2={height-bottom+5} className="tick"/><text x={x(i)} y={height-25} className="year-label" textAnchor="end" transform={`rotate(-45 ${x(i)} ${height-25})`}>{year}</text></g>)}{fundingSources.map(source => { const value=source.values[point]; return value === null ? null : <circle key={source.name} cx={x(point)} cy={y(value)} r="5" fill={source.color} className="chart-dot"/>; })}</svg></div>
      <div className="year-picker" aria-label="Select year">{fundingYears.map((year,i)=><button key={year} className={point===i?"selected":""} onClick={()=>setPoint(i)}>{year}</button>)}</div>
      <div className="chart-readout"><div><span>Selected year</span><strong>{fundingYears[point]}</strong></div>{fundingSources.map(source=><div key={source.name}><span><i style={{background:source.color}}/>{source.name}</span><strong>{source.values[point] === null ? "Not available" : `₹${source.values[point]?.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})} Cr`}</strong></div>)}</div>
    </div>
    <p className="source-note">Source: S&T Indicators Tables 2025–26, Table 1 (p. 18), Department of Science & Technology. *2024–25 and 2025–26 are estimates based on sector-wise CAGR.</p>
  </section>;
}

function Table3Trend({ rAndDTable3Years, rAndDTable3Series }: { rAndDTable3Years: string[]; rAndDTable3Series: IndicatorSeries[] }) {
  const [point, setPoint] = useState(28);
  const width = 920, height = 400, left = 66, right = 54, top = 28, bottom = 70;
  const maxExpenditure = 320000;
  const maxShare = 1;
  const x = (i: number) => left + i * ((width - left - right) / (rAndDTable3Years.length - 1));
  const yExpenditure = (value: number) => top + (maxExpenditure - value) * ((height - top - bottom) / maxExpenditure);
  const yShare = (value: number) => top + (maxShare - value) * ((height - top - bottom) / maxShare);
  const path = (values: (number | null)[], mapY: (value: number) => number) => values.reduce((d, value, i) => value === null ? d : `${d}${i && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${mapY(value).toFixed(1)} `, "");
  const tickValues = [0, 80000, 160000, 240000, 320000];
  const shareTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];

  return <section className="chart-shell indicator-chart">
    <div className="chart-top">
      <div>
        <span className="section-label">National R&D trend</span>
        <h2>Expenditure and GDP share</h2>
      </div>
      <div className="legend">
        {rAndDTable3Series.map(series => <span key={series.name}><i style={{ background: series.color }}/>{series.name}</span>)}
      </div>
    </div>
    <div className="chart-area">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart of national research and development expenditure and R&D as a percentage of GDP over time">
        <defs>
          {rAndDTable3Series.map(series => <linearGradient key={series.name} id={`trend-${series.name}`} x1="0" x2="1"><stop stopColor={series.color}/><stop offset="1" stopColor={series.color}/></linearGradient>)}
        </defs>
        {tickValues.map(value => <g key={value}>
          <line x1={left} x2={width - right} y1={yExpenditure(value)} y2={yExpenditure(value)} className="gridline" />
          <text x={left - 12} y={yExpenditure(value) + 4} className="axis-label" textAnchor="end">{value === 0 ? "0" : `₹${value / 1000}k`}</text>
        </g>)}
        {shareTicks.map(value => <text key={value} x={width - right + 12} y={yShare(value) + 4} className="axis-label" textAnchor="start">{value === 0 ? "0%" : `${value.toFixed(1)}%`}</text>)}
        <line x1={left} x2={left} y1={top} y2={height - bottom} className="axis-border" />
        <line x1={width - right} x2={width - right} y1={top} y2={height - bottom} className="axis-border" />
        {rAndDTable3Series.map(series => <path key={series.name} d={path(series.values, series.name === "R&D expenditure" ? yExpenditure : yShare)} stroke={series.color} className="fund-line" />)}
        {rAndDTable3Years.map((year, i) => <g key={year}>
          <line x1={x(i)} x2={x(i)} y1={height - bottom} y2={height - bottom + 5} className="tick" />
          <text x={x(i)} y={height - 34} className="year-label" textAnchor="end" transform={`rotate(-45 ${x(i)} ${height - 34})`}>{year}</text>
        </g>)}
        {rAndDTable3Series.map(series => {
          const value = series.values[point];
          if (value === null) {
            return null;
          }
          return <circle key={series.name} cx={x(point)} cy={series.name === "R&D expenditure" ? yExpenditure(value) : yShare(value)} r="5" fill={series.color} className="chart-dot" />;
        })}
      </svg>
    </div>
    <div className="year-picker indicator-years" aria-label="Select year">
      {rAndDTable3Years.map((year, i) => <button key={year} className={point === i ? "selected" : ""} onClick={() => setPoint(i)}>{year}</button>)}
    </div>
    <div className="chart-readout indicator-readout">
      <div><span>Selected year</span><strong>{rAndDTable3Years[point]}</strong></div>
      {rAndDTable3Series.map(series => {
        const value = series.values[point];
        return <div key={series.name}><span><i style={{ background: series.color }}/>{series.name}</span><strong>{value === null ? "Not available" : series.format(value)}</strong></div>;
      })}
    </div>
    <p className="source-note">Source: S&T Indicators Tables 2025–26, Table 3 (p. 20), Department of Science & Technology. R&D / GDP values are percentages shown in the table and 2024–25 and 2025–26 are estimates.</p>
  </section>;
}

function WorkforceChart({ workforceSectors }: { workforceSectors: WorkforceSector[] }) {
  const [hoveredSector, setHoveredSector] = useState<number | null>(null);
  const width = 1000, height = 460, left = 76, right = 28, top = 34, bottom = 108;
  const maxWorkforce = Math.ceil(Math.max(...workforceSectors.map(sector => sector.totalWorkforce)) / 100000) * 100000;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const groupWidth = plotWidth / workforceSectors.length;
  const barWidth = Math.min(48, groupWidth * 0.24);
  const totalColor = "#cad2ce";
  const womenColor = "#d9ed78";
  const y = (value: number) => top + (maxWorkforce - value) * (plotHeight / maxWorkforce);
  const ticks = Array.from({ length: 6 }, (_, index) => (maxWorkforce / 5) * index);
  const activeSector = hoveredSector === null ? null : workforceSectors[hoveredSector];
  const percentage = (sector: WorkforceSector) => (sector.womenWorkforce / sector.totalWorkforce) * 100;
  const formatWorkforce = (value: number) => value.toLocaleString("en-IN");

  return <section className="workforce-page">
    <div className="workforce-intro">
      <span className="section-label">R&D workforce</span>
      <h1>R&amp;D Workforce by Performing Sector, <em>2023–24</em></h1>
      <p>Full-time-equivalent personnel employed in R&amp;D establishments, as of 1 April 2024</p>
    </div>
    <div className="chart-shell workforce-chart">
      <div className="chart-top">
        <div>
          <span className="section-label">Workforce composition</span>
          <h2>People powering research</h2>
        </div>
        <div className="legend" aria-label="Workforce chart legend">
          <span><i style={{ background: totalColor }} />Total workforce</span>
          <span><i style={{ background: womenColor }} />Women workforce</span>
        </div>
      </div>
      <div className="workforce-plot">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grouped bar chart comparing total full-time-equivalent R&D workforce and women workforce across India's R&D performing sectors">
          <title>R&amp;D Workforce by Performing Sector, 2023–24</title>
          <desc>Each sector has adjacent bars for its total workforce and women workforce. Women workforce is a subset of total workforce.</desc>
          {ticks.map(value => <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="gridline" />
            <text x={left - 12} y={y(value) + 4} className="axis-label" textAnchor="end">{value === 0 ? "0" : `${value / 1000}k`}</text>
          </g>)}
          <text x={left} y={18} className="axis-label">FTE personnel</text>
          {workforceSectors.map((sector, index) => {
            const groupCenter = left + groupWidth * (index + .5);
            const totalX = groupCenter - barWidth - 4;
            const womenX = groupCenter + 4;
            const labelLines = sector.displayLabel.replace(" (", "\n(").split("\n");
            const tooltipLabel = `${sector.displayLabel}. Total workforce: ${formatWorkforce(sector.totalWorkforce)}. Women workforce: ${formatWorkforce(sector.womenWorkforce)}. Women are ${percentage(sector).toFixed(1)}% of the sector's workforce.`;
            return <g key={sector.sector} className="workforce-group" tabIndex={0} role="graphics-symbol" aria-label={tooltipLabel} onPointerEnter={() => setHoveredSector(index)} onPointerLeave={() => setHoveredSector(null)} onFocus={() => setHoveredSector(index)} onBlur={() => setHoveredSector(null)}>
              <title>{tooltipLabel}</title>
              <rect x={totalX} y={y(sector.totalWorkforce)} width={barWidth} height={height - bottom - y(sector.totalWorkforce)} rx="2" fill={totalColor} />
              <rect x={womenX} y={y(sector.womenWorkforce)} width={barWidth} height={height - bottom - y(sector.womenWorkforce)} rx="2" fill={womenColor} />
              <line x1={groupCenter} x2={groupCenter} y1={height - bottom} y2={height - bottom + 5} className="tick" />
              <text x={groupCenter} y={height - bottom + 23} className="year-label workforce-label" textAnchor="middle">
                {labelLines.map((line, lineIndex) => <tspan key={line} x={groupCenter} dy={lineIndex === 0 ? 0 : 12}>{line}</tspan>)}
              </text>
            </g>;
          })}
        </svg>
        {activeSector && <div className="workforce-tooltip" role="status" aria-live="polite" style={{ left: `${((left + groupWidth * (hoveredSector! + .5)) / width) * 100}%`, top: `${Math.max(12, ((y(activeSector.totalWorkforce) - 12) / height) * 100)}%` }}>
          <strong>{activeSector.displayLabel}</strong>
          <span>Total workforce <b>{formatWorkforce(activeSector.totalWorkforce)}</b></span>
          <span>Women workforce <b>{formatWorkforce(activeSector.womenWorkforce)}</b></span>
          <span>Women&apos;s share <b>{percentage(activeSector).toFixed(1)}%</b></span>
        </div>}
      </div>
    </div>
    <p className="workforce-note">FTE measures the amount of labor devoted to R&amp;D rather than the number of unique employees. Total workforce includes personnel engaged in R&amp;D, auxiliary activities, and administrative activities. Women workforce is a subset of total workforce.</p>
    <p className="source-note workforce-source"><a href="https://www.nstmis-dst.org/Pdfs/ST%20INDICATORS%20TABLES%202025-26.pdf" target="_blank" rel="noreferrer">Source: NSTMIS, Department of Science and Technology, Government of India, S&amp;T Indicators Tables: Research and Development Statistics 2025–26, Tables 21–22.</a></p>
  </section>;
}

function Methodology() {
  return <section className="methodology-page">
    <div className="methodology-intro"><span className="section-label">About the data</span><h1>Methodology &amp; <em>sources</em></h1><p>India Research Watch brings together official R&amp;D statistics and bibliometric data to provide a clear, comparable view of India&apos;s research landscape.</p></div>
    <div className="methodology-grid">
      <article className="methodology-card methodology-card-primary"><span className="section-label">Primary sources</span><h2>Official R&amp;D statistics</h2><p>The core expenditure, funding and workforce indicators are drawn from publications of the National Science and Technology Management Information System (NSTMIS), Department of Science &amp; Technology, Government of India. These reports are the site&apos;s main sources for national and sector-level R&amp;D statistics.</p><ul><li><a href="https://www.nstmis-dst.org/Pdfs/RD%20STATISTICS%20AT%20A%20GLANCE%202025-26.pdf" target="_blank" rel="noreferrer">R&amp;D Statistics at a Glance 2025–26 <ArrowUpRight size={14} /></a></li><li><a href="https://www.nstmis-dst.org/Pdfs/ST%20INDICATORS%20TABLES%202025-26.pdf" target="_blank" rel="noreferrer">S&amp;T Indicators Tables 2025–26 <ArrowUpRight size={14} /></a></li></ul></article>
      <article className="methodology-card"><span className="section-label">Research output</span><h2>OpenAlex</h2><p>OpenAlex is used to source research-output data, including India-affiliated scholarly works and their citation indicators. A work is included when OpenAlex records at least one authorship institution in India; it is counted once and assigned to its primary topic and subfield to avoid overlap between categories.</p><a className="methodology-link" href="https://openalex.org/" target="_blank" rel="noreferrer">Explore OpenAlex <ArrowUpRight size={14} /></a></article>
      <article className="methodology-card methodology-card-note"><span className="section-label">How to read the data</span><p>Financial figures are reported in current ₹ crore unless stated otherwise. Values marked with an asterisk are estimates, as identified in the source tables. Citation measures for recent publications should be interpreted with care because they continue to accumulate over time.</p></article>
    </div>
  </section>;
}

function About() {
  return <section className="about-page">
    <div className="about-intro">
      <span className="section-label">About India Research Watch</span>
      <h1>Making research data<br/><em>easier to understand.</em></h1>
    </div>
    <div className="about-grid">
      <article className="about-card about-card-profile">
        <span className="section-label">The researcher</span>
        <h2>Hi, I&apos;m Sanika Khire.</h2>
        <p>I am a 12th-grade student at Manthan School, passionate about biology and research. I wanted to learn more about upcoming research in India and help make it more visible.</p>
      </article>
      <article className="about-card">
        <span className="section-label">Why this site exists</span>
        <p>I made this website to bring clarity and accessibility to complex data, making it easier for the public to understand. The dataset includes information on research funding, workforce, and funding sources.</p>
      </article>
      <article className="about-card about-card-contact">
        <span className="section-label">Help shape the data</span>
        <h2>Looking for something specific?</h2>
        <p>Let me know if you would like any specific data to be added.</p>
        <a href="mailto:sanikakhire7@gmail.com">sanikakhire7@gmail.com <ArrowUpRight size={15} /></a>
        <small>Thanks!</small>
      </article>
    </div>
  </section>;
}

export default function Home() {
  const [selected, setSelected] = useState<Sector | null>(null);
  const [hovered, setHovered] = useState<Sector | null>(null);
  const [activeTab, setActiveTab] = useState<"explorer" | "funding" | "workforce" | "methodology" | "about">("explorer");
  const [data, setData] = useState<Awaited<ReturnType<typeof loadWebsiteData>> | null>(null);
  const [dataError, setDataError] = useState(false);
  useEffect(() => {
    loadWebsiteData().then(setData).catch(() => setDataError(true));
  }, []);
  if (!data) return <main className="data-status">{dataError ? "The website data could not be loaded." : "Loading research data…"}</main>;
  const { sectors, fundingYears, fundingSources, rAndDTable3Years, rAndDTable3Series, workforceSectors } = data;
  const totalIndustryExpenditure = sectors.reduce((total, sector) => total + Number(sector.funding.replace(/[^0-9.]/g, "")), 0);
  const leadingSector = sectors[0];
  const orbitSectors = sectors.map((sector, index) => {
    const angle = (index / sectors.length) * Math.PI * 2 - Math.PI / 2;
    const radius = 42;
    return { ...sector, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  });
  const focus = hovered || selected;
  return <main>
    <nav><div className="brand"><span className="brand-mark">IRW</span><span>India Research Watch</span></div><div className="nav-links"><button className={activeTab === "explorer" ? "active" : ""} onClick={()=>setActiveTab("explorer")}>Explorer</button><button className={activeTab === "funding" ? "active" : ""} onClick={()=>setActiveTab("funding")}>Funding Sources</button><button className={activeTab === "workforce" ? "active" : ""} onClick={()=>setActiveTab("workforce")}>Workforce</button><Link href="/citations" className="nav-link">Citations</Link><button className={activeTab === "methodology" ? "active" : ""} onClick={()=>setActiveTab("methodology")}>Methodology</button><button className={activeTab === "about" ? "active" : ""} onClick={()=>setActiveTab("about")}>About</button></div><Menu className="mobile-menu" /></nav>
    {activeTab === "funding" ? <FundingSources fundingYears={fundingYears} fundingSources={fundingSources} /> : activeTab === "workforce" ? <WorkforceChart workforceSectors={workforceSectors} /> : activeTab === "methodology" ? <Methodology /> : activeTab === "about" ? <About /> : <>
    <section className="hero"><div className="eyebrow"><span/> National R&D intelligence platform</div><h1>Research that <em>shapes</em><br/>a nation.</h1><p>Explore India&apos;s investment in science — sector by sector, discovery by discovery.</p></section>
    <section className="explorer">
      <div className="explorer-head"><div><span className="section-label">The ecosystem</span><h2>Sector-wise R&D spending on Industry Groups.</h2></div><p>Select a sector to uncover its research story.<br/><span>12 sectors · FY 2023–24</span></p></div>
      <div className="orbit-wrap">
        <svg className="paths" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42"/>{orbitSectors.map(s=><line key={s.name} x1="50" y1="50" x2={s.x} y2={s.y} className={focus?.name===s.name?"lit":""}/>)}</svg>
        <div className="india">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/india-outline.svg" width="156" height="155" alt="Outline of India including the full Jammu and Kashmir region and Aksai Chin claimed by India" />
          <div><strong>INDIA</strong><span>R&amp;D landscape</span></div>
        </div>
        {orbitSectors.map((s) => <button key={s.name} className={`sector ${focus?.name===s.name?"focus":""}`} style={{left:`${s.x}%`,top:`${s.y}%`,"--sector":s.color} as React.CSSProperties} onMouseEnter={()=>setHovered(s)} onMouseLeave={()=>setHovered(null)} onClick={()=>setSelected(s)}><i></i><b>{s.short}</b></button>)}
        {focus && <div className="hover-card" style={{"--accent":focus.color} as React.CSSProperties}><span>FY 2023–24</span><strong>{focus.name}</strong><div><small>Combined expenditure</small><b>{focus.funding}</b><em>{focus.growth}</em></div></div>}
      </div>
      <p className="hint">Hover to preview <span>·</span> Click to explore <ArrowUpRight size={15}/></p>
    </section>
    <section className="snapshot"><div><span className="section-label">At a glance</span><h2>Industry research<br/>momentum.</h2></div><div className="big-stat"><span>Top {sectors.length} combined expenditure</span><strong>{formatCr(totalIndustryExpenditure)}</strong><p><i/> FY 2023–24 · public + private</p></div><div className="mini-stat"><strong>{sectors.length}</strong><span>Leading industry groups</span></div><div className="mini-stat"><strong>{formatCr(Number(leadingSector.funding.replace(/[^0-9.]/g, "")))}</strong><span>Largest group: {leadingSector.name}</span></div></section>
    <Table3Trend rAndDTable3Years={rAndDTable3Years} rAndDTable3Series={rAndDTable3Series} />
    {selected && <div className="overlay" onClick={()=>setSelected(null)}><aside onClick={e=>e.stopPropagation()} style={{"--accent":selected.color} as React.CSSProperties}><button className="close" onClick={()=>setSelected(null)}><X size={20}/></button><span className="section-label">Industry brief · FY 2023–24</span><h2>{selected.name}</h2><p className="aside-intro">{selected.blurb}</p><div className="fund"><span>Combined expenditure</span><strong>{selected.funding}</strong><em>{selected.growth} year-on-year</em></div><div className="metrics"><div><strong>{selected.patents}</strong><span>Patents granted</span></div><div><strong>{selected.citations}</strong><span>Scientific citations</span></div><div><strong>{selected.institutes}</strong><span>Key institutions</span></div></div><button className="report">View full sector report <ArrowUpRight size={17}/></button><p className="data-note">Expenditure comes from the workbook's Industry Combined sheet. Detail metrics await source data.</p></aside></div>}
    </>}
  </main>
}
