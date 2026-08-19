import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_CONFIG,
  aggregateWorks,
  buildConfig,
  downloadYear,
  fetchJsonWithRetries,
  rowsToCsv,
  safeQuery,
  validateSectorTotal
} from "../scripts/openalex-india-research-output.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/openalex-pages.json", import.meta.url), "utf8"));
const config = { ...DEFAULT_CONFIG, startYear: 2024, endYear: 2025, excludeRetracted: true };

function fixturePages() {
  const pagesByYear = new Map();
  for (const year of [2024, 2025]) {
    const pages = fixture[String(year)];
    pages.apiReportedCount = pages.flatMap(page => page.results).length;
    pagesByYear.set(year, pages);
  }
  return pagesByYear;
}

test("aggregate assigns each work once and reports quality checks", () => {
  const { rows, qualities } = aggregateWorks({ pagesByYear: fixturePages(), config });
  assert.equal(rows.length, 4);
  const regular = rows.find(row => row.year === 2024 && row.primaryTopicId.endsWith("T1"));
  assert.deepEqual(
    { publications: regular.publicationCount, citations: regular.totalCitations, top10: regular.top10PercentCount, top1: regular.top1PercentCount },
    { publications: 1, citations: 10, top10: 1, top1: 0 }
  );
  const partialClassification = rows.find(row => row.primaryTopicId.endsWith("T2"));
  assert.equal(partialClassification.primarySubfieldName, "Unclassified");
  assert.equal(partialClassification.top1PercentCount, 1);
  const unclassified = rows.find(row => row.year === 2024 && row.primaryTopicName === "Unclassified");
  assert.equal(unclassified.publicationCount, 1);
  const quality2024 = qualities.find(quality => quality.year === 2024);
  assert.deepEqual(
    {
      unique: quality2024.unique_works_retrieved,
      duplicates: quality2024.duplicate_openalex_work_ids,
      missingTopic: quality2024.papers_missing_primary_topic,
      missingSubfield: quality2024.papers_missing_primary_subfield,
      missingPercentile: quality2024.papers_missing_citation_percentile_information,
      retracted: quality2024.retracted_works_excluded,
      sectorTotal: quality2024.sector_publication_total,
      validation: quality2024.validation
    },
    { unique: 3, duplicates: 1, missingTopic: 1, missingSubfield: 2, missingPercentile: 1, retracted: 1, sectorTotal: 3, validation: "passed" }
  );
  assert.equal(quality2024.unclassified_share, 2 / 3);
});

test("CSV has the documented columns and deterministic decimal shares", () => {
  const { rows } = aggregateWorks({ pagesByYear: fixturePages(), config });
  const [header, firstRow] = rowsToCsv(rows).trim().split("\n");
  assert.equal(header, "year,primary_topic_id,primary_topic_name,primary_subfield_id,primary_subfield_name,publication_count,total_citations,mean_citations_per_paper,top_10_percent_count,top_10_percent_share,top_1_percent_count,top_1_percent_share");
  assert.match(firstRow, /0\.000000$/);
});

test("configuration accepts environment and CLI year overrides", () => {
  const built = buildConfig({
    env: { START_YEAR: "2010", END_YEAR: "2012", OPENALEX_API_KEY: "test" },
    argv: ["--end-year", "2013"]
  });
  assert.equal(built.startYear, 2010);
  assert.equal(built.endYear, 2013);
  assert.match(safeQuery(built, 2010, "*").filter, /authorships\.institutions\.country_code:IN/);
  assert.match(safeQuery(built, 2010, "*").filter, /type:article\|review\|conference-paper/);
});

test("retry logic retries rate limits and returns the later successful payload", async () => {
  let calls = 0;
  const payload = await fetchJsonWithRetries("https://example.test", {
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 429, headers: new Headers({ "retry-after": "0" }), text: async () => "slow down" }
        : { ok: true, status: 200, json: async () => ({ results: [] }) };
    },
    wait: async () => {},
    log: () => {}
  });
  assert.equal(calls, 2);
  assert.deepEqual(payload, { results: [] });
});

test("sector validation rejects double counts and unassigned works", () => {
  assert.throws(
    () => validateSectorTotal({ year: 2024, sector_publication_total: 3, unique_works_retrieved: 2 }),
    /exceeds unique works.*double counting/
  );
  assert.throws(
    () => validateSectorTotal({ year: 2024, sector_publication_total: 1, unique_works_retrieved: 2 }),
    /does not equal unique works/
  );
});

test("year cache resumes after an interrupted page sequence", async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), "openalex-cache-test-"));
  let requests = 0;
  const localConfig = { ...config, cacheDir, apiKey: "test-key", maxRetries: 0 };
  const fetchImpl = async () => {
    requests += 1;
    if (requests === 2) throw new Error("simulated interruption");
    return {
      ok: true,
      status: 200,
      json: async () => requests === 1
        ? { results: [{ id: "https://openalex.org/W100", publication_year: 2024 }], meta: { count: 2, next_cursor: "next" } }
        : { results: [{ id: "https://openalex.org/W101", publication_year: 2024 }], meta: { count: 2, next_cursor: null } }
    };
  };
  try {
    await assert.rejects(
      () => downloadYear(localConfig, 2024, { fetchImpl, rateLimit: async () => {}, log: () => {} }),
      /simulated interruption/
    );
    assert.equal(requests, 2);
    await downloadYear(localConfig, 2024, { fetchImpl, rateLimit: async () => {}, log: () => {} });
    assert.equal(requests, 3);
    await downloadYear(localConfig, 2024, { fetchImpl, rateLimit: async () => {}, log: () => {} });
    assert.equal(requests, 3);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
});
