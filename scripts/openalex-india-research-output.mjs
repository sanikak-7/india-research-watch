import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip, createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = "https://api.openalex.org/works";
const PAGE_SIZE = 200;
const FIELD_LIST = [
  "id",
  "publication_year",
  "cited_by_count",
  "primary_topic",
  "citation_normalized_percentile",
  "type",
  "is_retracted"
];

export const DEFAULT_CONFIG = Object.freeze({
  startYear: 2000,
  endYear: 2026,
  countryCode: "IN",
  workTypes: ["article", "review", "conference-paper"],
  excludeRetracted: true,
  requestsPerSecond: 8,
  maxRetries: 5,
  cacheDir: resolve(ROOT, ".cache", "openalex-india-research-output"),
  outputPath: resolve(ROOT, "public", "data", "india-research-output-by-sector.csv"),
  metadataPath: resolve(ROOT, "public", "data", "india-research-output-by-sector-metadata.json"),
  qualityPath: resolve(ROOT, "public", "data", "india-research-output-by-sector-quality-report.json")
});

const UNCLASSIFIED_ID = "unclassified";
const UNCLASSIFIED_NAME = "Unclassified";

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function parseInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer; received ${value}.`);
  return parsed;
}

export function parseArgs(argv) {
  const options = { refresh: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--refresh") {
      options.refresh = true;
    } else if (["--start-year", "--end-year", "--cache-dir", "--output"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

export function buildConfig({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const args = parseArgs(argv);
  const startYear = parseInteger(args.startYear ?? env.START_YEAR ?? DEFAULT_CONFIG.startYear, "START_YEAR");
  const endYear = parseInteger(args.endYear ?? env.END_YEAR ?? DEFAULT_CONFIG.endYear, "END_YEAR");
  if (startYear > endYear) throw new Error("START_YEAR cannot be later than END_YEAR.");
  if (startYear < 1000 || endYear > 9999) throw new Error("Years must be four-digit calendar years.");

  const outputPath = args.output ? resolve(ROOT, args.output) : DEFAULT_CONFIG.outputPath;
  const config = {
    ...DEFAULT_CONFIG,
    startYear,
    endYear,
    cacheDir: args.cacheDir ? resolve(ROOT, args.cacheDir) : DEFAULT_CONFIG.cacheDir,
    outputPath,
    metadataPath: args.output
      ? resolve(dirname(outputPath), "india-research-output-by-sector-metadata.json")
      : DEFAULT_CONFIG.metadataPath,
    qualityPath: args.output
      ? resolve(dirname(outputPath), "india-research-output-by-sector-quality-report.json")
      : DEFAULT_CONFIG.qualityPath,
    apiKey: env.OPENALEX_API_KEY,
    mailto: env.OPENALEX_MAILTO,
    refresh: args.refresh,
    help: args.help
  };
  return config;
}

export function printUsage() {
  console.log(`Usage: npm run data:openalex -- [options]

Required environment:
  OPENALEX_API_KEY       Free key from https://openalex.org/settings/api

Optional environment:
  OPENALEX_MAILTO        Contact address sent to OpenAlex
  START_YEAR / END_YEAR  Override the default 2000–2026 range

Options:
  --start-year YEAR      Override START_YEAR
  --end-year YEAR        Override END_YEAR
  --cache-dir PATH       Override .cache/openalex-india-research-output
  --output PATH          Override the CSV output path
  --refresh              Delete this pipeline's cache and fetch again
  --help                 Show this help`);
}

function assertCredentials(config) {
  if (!config.apiKey) {
    throw new Error("OPENALEX_API_KEY is required. Create a free key at https://openalex.org/settings/api and set it in your environment.");
  }
  if (!config.mailto) console.warn("OPENALEX_MAILTO is not set; continuing without an OpenAlex contact address.");
}

function yearRange(config) {
  return Array.from({ length: config.endYear - config.startYear + 1 }, (_, index) => config.startYear + index);
}

export function safeQuery(config, year, cursor) {
  const filter = [
    `authorships.institutions.country_code:${config.countryCode}`,
    `publication_year:${year}`,
    `type:${config.workTypes.join("|")}`
  ];
  if (config.excludeRetracted) filter.push("is_retracted:false");
  return {
    filter: filter.join(","),
    cursor,
    per_page: String(PAGE_SIZE),
    select: FIELD_LIST.join(",")
  };
}

function requestUrl(config, year, cursor) {
  const query = new URLSearchParams(safeQuery(config, year, cursor));
  query.set("api_key", config.apiKey);
  if (config.mailto) query.set("mailto", config.mailto);
  return `${API_URL}?${query.toString()}`;
}

function retryAfterMilliseconds(headers, attempt) {
  const retryAfter = headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return Math.min(30_000, 500 * 2 ** attempt);
}

export function createRateLimiter(requestsPerSecond, now = () => Date.now(), wait = sleep) {
  const interval = Math.ceil(1000 / requestsPerSecond);
  let nextAllowedAt = 0;
  return async () => {
    const current = now();
    const delay = Math.max(0, nextAllowedAt - current);
    if (delay) await wait(delay);
    nextAllowedAt = Math.max(nextAllowedAt, current) + interval;
  };
}

export async function fetchJsonWithRetries(url, {
  fetchImpl = fetch,
  maxRetries = DEFAULT_CONFIG.maxRetries,
  rateLimit = async () => {},
  wait = sleep,
  log = console.log
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await rateLimit();
      const response = await fetchImpl(url);
      if (response.ok) return response.json();
      const retryable = response.status === 429 || response.status >= 500;
      const responseText = await response.text().catch(() => "");
      lastError = new Error(`OpenAlex returned HTTP ${response.status}: ${responseText.slice(0, 300)}`);
      if (!retryable) {
        lastError.retryable = false;
        throw lastError;
      }
      if (attempt === maxRetries) break;
      const delay = retryAfterMilliseconds(response.headers, attempt);
      log(`Retrying OpenAlex request after HTTP ${response.status} in ${Math.ceil(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries}).`);
      await wait(delay);
    } catch (error) {
      lastError = error;
      if (error.retryable === false) throw error;
      if (attempt === maxRetries) break;
      const delay = Math.min(30_000, 500 * 2 ** attempt);
      log(`Retrying OpenAlex request after ${error.message} in ${Math.ceil(delay / 1000)}s (attempt ${attempt + 1}/${maxRetries}).`);
      await wait(delay);
    }
  }
  throw lastError ?? new Error("OpenAlex request failed without an error response.");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function replaceFileWithRetry(temporaryPath, destinationPath, attempts = 12) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(temporaryPath, destinationPath);
      return;
    } catch (error) {
      lastError = error;
      const isTemporaryWindowsLock = ["EPERM", "EACCES", "EBUSY"].includes(error.code);
      if (!isTemporaryWindowsLock || attempt === attempts - 1) throw error;
      const delay = Math.min(5_000, 100 * 2 ** attempt);
      console.warn(`Waiting ${delay}ms to replace a locked checkpoint file (${error.code}, attempt ${attempt + 1}/${attempts}).`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await replaceFileWithRetry(temporaryPath, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeGzipJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await pipeline(
    Readable.from([JSON.stringify(value)]),
    createGzip(),
    createWriteStream(temporaryPath)
  );
  await replaceFileWithRetry(temporaryPath, path);
}

async function readGzipJson(path) {
  const buffers = [];
  const collector = new (class extends Writable {
    _write(chunk, _encoding, callback) {
      buffers.push(chunk);
      callback();
    }
  })();
  await pipeline(createReadStream(path), createGunzip(), collector);
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

function manifestPath(cacheDir, year) {
  return resolve(cacheDir, String(year), "manifest.json");
}

function pagePath(cacheDir, year, pageNumber) {
  return resolve(cacheDir, String(year), `page-${String(pageNumber).padStart(6, "0")}.json.gz`);
}

function initialManifest(config, year) {
  return {
    schema_version: 1,
    year,
    complete: false,
    next_cursor: "*",
    page_count: 0,
    api_reported_count: null,
    query: safeQuery(config, year, "<cursor>").filter,
    selected_fields: FIELD_LIST,
    updated_at: new Date().toISOString()
  };
}

async function reconcileManifestPages(config, year, manifest) {
  let reconciled = false;
  while (await exists(pagePath(config.cacheDir, year, manifest.page_count + 1))) {
    const cachedPage = await readGzipJson(pagePath(config.cacheDir, year, manifest.page_count + 1));
    if (!Array.isArray(cachedPage.results)) {
      throw new Error(`${year}: cached page ${manifest.page_count + 1} does not contain a results array.`);
    }
    manifest = {
      ...manifest,
      page_count: manifest.page_count + 1,
      api_reported_count: cachedPage.meta?.count ?? manifest.api_reported_count,
      next_cursor: cachedPage.meta?.next_cursor ?? null,
      complete: !cachedPage.meta?.next_cursor,
      updated_at: new Date().toISOString()
    };
    reconciled = true;
  }
  if (reconciled) {
    await writeJsonAtomic(manifestPath(config.cacheDir, year), manifest);
    console.log(`${year}: recovered ${manifest.page_count} cached pages after an interrupted checkpoint update.`);
  }
  return manifest;
}

export async function downloadYear(config, year, dependencies = {}) {
  const log = dependencies.log ?? console.log;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const rateLimit = dependencies.rateLimit ?? createRateLimiter(config.requestsPerSecond);
  const manifestFile = manifestPath(config.cacheDir, year);
  let manifest = (await exists(manifestFile)) ? await readJson(manifestFile) : initialManifest(config, year);
  manifest = await reconcileManifestPages(config, year, manifest);
  if (manifest.complete) {
    log(`${year}: cache complete (${manifest.page_count} pages).`);
    return manifest;
  }

  while (!manifest.complete) {
    const url = requestUrl(config, year, manifest.next_cursor);
    const payload = await fetchJsonWithRetries(url, {
      fetchImpl,
      maxRetries: config.maxRetries,
      rateLimit,
      wait: dependencies.wait,
      log
    });
    if (!Array.isArray(payload.results)) throw new Error(`${year}: OpenAlex response did not contain a results array.`);

    const nextPage = manifest.page_count + 1;
    await writeGzipJsonAtomic(pagePath(config.cacheDir, year, nextPage), {
      results: payload.results,
      meta: { count: payload.meta?.count ?? null, next_cursor: payload.meta?.next_cursor ?? null }
    });
    manifest = {
      ...manifest,
      page_count: nextPage,
      api_reported_count: payload.meta?.count ?? manifest.api_reported_count,
      next_cursor: payload.meta?.next_cursor ?? null,
      complete: !payload.meta?.next_cursor,
      updated_at: new Date().toISOString()
    };
    await writeJsonAtomic(manifestFile, manifest);
    log(`${year}: cached page ${nextPage}${manifest.complete ? " (complete)" : ""}; ${payload.results.length} works.`);
  }
  return manifest;
}

export function classifyWork(work) {
  const topic = work.primary_topic;
  if (!topic?.id) {
    return {
      primaryTopicId: UNCLASSIFIED_ID,
      primaryTopicName: UNCLASSIFIED_NAME,
      primarySubfieldId: UNCLASSIFIED_ID,
      primarySubfieldName: UNCLASSIFIED_NAME,
      hasMissingTopic: true,
      hasMissingSubfield: true,
      isUnclassified: true
    };
  }
  if (!topic.subfield?.id) {
    return {
      primaryTopicId: topic.id,
      primaryTopicName: topic.display_name ?? topic.id,
      primarySubfieldId: UNCLASSIFIED_ID,
      primarySubfieldName: UNCLASSIFIED_NAME,
      hasMissingTopic: false,
      hasMissingSubfield: true,
      isUnclassified: true
    };
  }
  return {
    primaryTopicId: topic.id,
    primaryTopicName: topic.display_name ?? topic.id,
    primarySubfieldId: topic.subfield.id,
    primarySubfieldName: topic.subfield.display_name ?? topic.subfield.id,
    hasMissingTopic: false,
    hasMissingSubfield: false,
    isUnclassified: false
  };
}

function percentileStatus(work) {
  const percentile = work.citation_normalized_percentile;
  const hasTop10 = typeof percentile?.is_in_top_10_percent === "boolean";
  const hasTop1 = typeof percentile?.is_in_top_1_percent === "boolean";
  return {
    missing: !hasTop10 || !hasTop1,
    inTop10: percentile?.is_in_top_10_percent === true,
    inTop1: percentile?.is_in_top_1_percent === true
  };
}

function createYearQuality(year, apiReportedCount = null) {
  return {
    year,
    api_reported_count: apiReportedCount,
    unique_works_retrieved: 0,
    duplicate_openalex_work_ids: 0,
    papers_missing_primary_topic: 0,
    papers_missing_primary_subfield: 0,
    papers_missing_citation_percentile_information: 0,
    papers_missing_cited_by_count: 0,
    retracted_works_excluded: 0,
    unclassified_publication_count: 0,
    unclassified_share: 0,
    sector_publication_total: 0,
    validation: "pending"
  };
}

function aggregateKey(year, classification) {
  return [year, classification.primaryTopicId, classification.primaryTopicName, classification.primarySubfieldId, classification.primarySubfieldName].join("\u001f");
}

export function validateSectorTotal(quality) {
  if (quality.sector_publication_total > quality.unique_works_retrieved) {
    throw new Error(`${quality.year}: sector publication total (${quality.sector_publication_total}) exceeds unique works (${quality.unique_works_retrieved}); this indicates double counting.`);
  }
  if (quality.sector_publication_total !== quality.unique_works_retrieved) {
    throw new Error(`${quality.year}: sector publication total (${quality.sector_publication_total}) does not equal unique works (${quality.unique_works_retrieved}).`);
  }
  return "passed";
}

export function aggregateWorks({ pagesByYear, config }) {
  const groups = new Map();
  const qualities = new Map();
  const seenIds = new Set();
  for (const year of yearRange(config)) {
    const pages = pagesByYear.get(year) ?? [];
    const quality = createYearQuality(year, pages.apiReportedCount ?? null);
    qualities.set(year, quality);
    for (const page of pages) {
      for (const work of page.results ?? []) {
        if (!work?.id) throw new Error(`${year}: encountered a work without an OpenAlex ID.`);
        if (seenIds.has(work.id)) {
          quality.duplicate_openalex_work_ids += 1;
          continue;
        }
        seenIds.add(work.id);
        if (work.is_retracted === true && config.excludeRetracted) {
          quality.retracted_works_excluded += 1;
          continue;
        }
        if (work.publication_year !== year) {
          throw new Error(`${year}: work ${work.id} returned publication_year ${work.publication_year}.`);
        }
        quality.unique_works_retrieved += 1;
        const classification = classifyWork(work);
        if (classification.hasMissingTopic) quality.papers_missing_primary_topic += 1;
        if (classification.hasMissingSubfield) quality.papers_missing_primary_subfield += 1;
        if (classification.isUnclassified) quality.unclassified_publication_count += 1;
        const percentile = percentileStatus(work);
        if (percentile.missing) quality.papers_missing_citation_percentile_information += 1;
        const citations = Number(work.cited_by_count);
        const citedByCount = Number.isFinite(citations) && citations >= 0 ? citations : 0;
        if (!Number.isFinite(citations) || citations < 0) quality.papers_missing_cited_by_count += 1;

        const key = aggregateKey(year, classification);
        const existing = groups.get(key) ?? {
          year,
          primaryTopicId: classification.primaryTopicId,
          primaryTopicName: classification.primaryTopicName,
          primarySubfieldId: classification.primarySubfieldId,
          primarySubfieldName: classification.primarySubfieldName,
          publicationCount: 0,
          totalCitations: 0,
          top10PercentCount: 0,
          top1PercentCount: 0
        };
        existing.publicationCount += 1;
        existing.totalCitations += citedByCount;
        if (percentile.inTop10) existing.top10PercentCount += 1;
        if (percentile.inTop1) existing.top1PercentCount += 1;
        groups.set(key, existing);
      }
    }
  }

  const rows = [...groups.values()]
    .map(group => ({
      ...group,
      meanCitationsPerPaper: group.totalCitations / group.publicationCount,
      top10PercentShare: group.top10PercentCount / group.publicationCount,
      top1PercentShare: group.top1PercentCount / group.publicationCount
    }))
    .sort((left, right) => left.year - right.year
      || left.primaryTopicName.localeCompare(right.primaryTopicName)
      || left.primarySubfieldName.localeCompare(right.primarySubfieldName));

  const rowsByYear = new Map();
  for (const row of rows) rowsByYear.set(row.year, (rowsByYear.get(row.year) ?? 0) + row.publicationCount);
  for (const quality of qualities.values()) {
    quality.sector_publication_total = rowsByYear.get(quality.year) ?? 0;
    quality.unclassified_share = quality.unique_works_retrieved
      ? quality.unclassified_publication_count / quality.unique_works_retrieved
      : 0;
    quality.validation = validateSectorTotal(quality);
  }
  return { rows, qualities: [...qualities.values()] };
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  return /[",\r\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function decimal(value, places = 6) {
  return Number(value).toFixed(places);
}

export function rowsToCsv(rows) {
  const header = [
    "year", "primary_topic_id", "primary_topic_name", "primary_subfield_id", "primary_subfield_name",
    "publication_count", "total_citations", "mean_citations_per_paper",
    "top_10_percent_count", "top_10_percent_share", "top_1_percent_count", "top_1_percent_share"
  ];
  const body = rows.map(row => [
    row.year, row.primaryTopicId, row.primaryTopicName, row.primarySubfieldId, row.primarySubfieldName,
    row.publicationCount, row.totalCitations, decimal(row.meanCitationsPerPaper, 4),
    row.top10PercentCount, decimal(row.top10PercentShare), row.top1PercentCount, decimal(row.top1PercentShare)
  ].map(csvEscape).join(","));
  return `${header.join(",")}\n${body.join("\n")}\n`;
}

async function loadPages(config, manifests) {
  const pagesByYear = new Map();
  for (const [year, manifest] of manifests) {
    const pages = [];
    for (let page = 1; page <= manifest.page_count; page += 1) {
      pages.push(await readGzipJson(pagePath(config.cacheDir, year, page)));
    }
    pages.apiReportedCount = manifest.api_reported_count;
    pagesByYear.set(year, pages);
  }
  return pagesByYear;
}

function safeConfig(config) {
  return {
    api_endpoint: API_URL,
    country_code: config.countryCode,
    start_year: config.startYear,
    end_year: config.endYear,
    included_work_types: config.workTypes,
    excluded_retracted_works: config.excludeRetracted,
    requests_per_second: config.requestsPerSecond,
    per_page: PAGE_SIZE,
    selected_fields: FIELD_LIST,
    uses_openalex_api_key: true,
    includes_openalex_mailto: Boolean(config.mailto)
  };
}

async function writeOutputs(config, rows, qualities) {
  const generatedAt = new Date().toISOString();
  const overall = qualities.reduce((totals, quality) => ({
    unique_works_retrieved: totals.unique_works_retrieved + quality.unique_works_retrieved,
    duplicate_openalex_work_ids: totals.duplicate_openalex_work_ids + quality.duplicate_openalex_work_ids,
    papers_missing_primary_topic: totals.papers_missing_primary_topic + quality.papers_missing_primary_topic,
    papers_missing_primary_subfield: totals.papers_missing_primary_subfield + quality.papers_missing_primary_subfield,
    papers_missing_citation_percentile_information: totals.papers_missing_citation_percentile_information + quality.papers_missing_citation_percentile_information,
    unclassified_publication_count: totals.unclassified_publication_count + quality.unclassified_publication_count,
    sector_publication_total: totals.sector_publication_total + quality.sector_publication_total
  }), { unique_works_retrieved: 0, duplicate_openalex_work_ids: 0, papers_missing_primary_topic: 0, papers_missing_primary_subfield: 0, papers_missing_citation_percentile_information: 0, unclassified_publication_count: 0, sector_publication_total: 0 });
  overall.unclassified_share = overall.unique_works_retrieved ? overall.unclassified_publication_count / overall.unique_works_retrieved : 0;
  const metadata = {
    schema_version: 1,
    generated_at: generatedAt,
    source: "OpenAlex Works API",
    methodology: "India affiliation is defined by at least one authorship institution with country_code IN. Each retained work is assigned only to its primary topic and primary subfield.",
    configuration: safeConfig(config),
    csv_columns: rowsToCsv([]).trim().split(",")
  };
  const quality = {
    schema_version: 1,
    generated_at: generatedAt,
    configuration: safeConfig(config),
    overall,
    years: qualities
  };
  await mkdir(dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, rowsToCsv(rows), "utf8");
  await writeJsonAtomic(config.metadataPath, metadata);
  await writeJsonAtomic(config.qualityPath, quality);
  return { metadata, quality };
}

export async function run(config, dependencies = {}) {
  assertCredentials(config);
  if (config.refresh && await exists(config.cacheDir)) {
    await rm(config.cacheDir, { recursive: true, force: true });
    console.log(`Removed cache at ${config.cacheDir}.`);
  }
  const manifests = new Map();
  const rateLimit = dependencies.rateLimit ?? createRateLimiter(config.requestsPerSecond);
  for (const year of yearRange(config)) {
    manifests.set(year, await downloadYear(config, year, { ...dependencies, rateLimit }));
  }
  const pagesByYear = await loadPages(config, manifests);
  const { rows, qualities } = aggregateWorks({ pagesByYear, config });
  const outputs = await writeOutputs(config, rows, qualities);
  console.log(`Wrote ${rows.length} annual topic/subfield rows to ${config.outputPath}.`);
  return { rows, qualities, ...outputs };
}

async function main() {
  const config = buildConfig();
  if (config.help) return printUsage();
  await run(config);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`OpenAlex pipeline failed: ${error.message}`);
    process.exitCode = 1;
  });
}
