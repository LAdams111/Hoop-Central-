#!/usr/bin/env node
/**
 * Fetch NCAA roster pages from sports-reference.com and POST HTML to your Hoop Central API.
 * Run from your machine so the server never hits sports-reference (avoids 429).
 * Data is stored in the same tables as NBA so it shows on the site the same way.
 *
 * Usage:
 *   API_URL=https://hoop-central-production.up.railway.app node scripts/ncaa-local-import.mjs
 *   # Optional: limit schools/years (default: 5 schools, 2 seasons)
 *   SCHOOLS=duke,north-carolina,kentucky node scripts/ncaa-local-import.mjs
 *   YEARS=2024,2023 node scripts/ncaa-local-import.mjs
 */

const API_BASE = process.env.API_URL || `http://localhost:${process.env.PORT || "5000"}`;
const BASE_URL = "https://www.sports-reference.com";
const DELAY_MS = 10_000; // 10s between requests to avoid 429

const DEFAULT_SCHOOLS = ["duke", "north-carolina", "kentucky", "kansas", "ucla"];
const DEFAULT_YEARS = [2024, 2023];

function getSchools() {
  if (process.env.SCHOOLS) return process.env.SCHOOLS.split(",").map((s) => s.trim()).filter(Boolean);
  return DEFAULT_SCHOOLS;
}

function getYears() {
  if (process.env.YEARS) return process.env.YEARS.split(",").map((y) => parseInt(y.trim(), 10)).filter((n) => !isNaN(n));
  return DEFAULT_YEARS;
}

async function fetchRoster(slug, year) {
  const url = `${BASE_URL}/cbb/schools/${slug}/${year}.html`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.sports-reference.com/",
    },
  });
  if (!res.ok) return { ok: false, status: res.status, html: null };
  const html = await res.text();
  return { ok: true, status: res.status, html };
}

async function main() {
  const schools = getSchools();
  const years = getYears();
  console.log("API:", API_BASE);
  console.log("Schools:", schools.join(", "));
  console.log("Years:", years.join(", "));
  console.log("Delay between requests:", DELAY_MS / 1000, "s\n");

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalAdded = 0;
  let totalMatched = 0;
  let errors = 0;

  for (const slug of schools) {
    for (const year of years) {
      try {
        const { ok, status, html } = await fetchRoster(slug, year);
        if (!ok || !html) {
          console.log(slug, year, "-> fetch", status);
          errors++;
          await new Promise((r) => setTimeout(r, DELAY_MS));
          continue;
        }

        const post = await fetch(`${API_BASE}/api/ncaa/import-html`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schoolSlug: slug, year, html }),
        });

        if (!post.ok) {
          console.error(slug, year, "-> API", post.status, await post.text());
          errors++;
          await new Promise((r) => setTimeout(r, DELAY_MS));
          continue;
        }

        const result = await post.json();
        totalInserted += result.statsInserted ?? 0;
        totalUpdated += result.statsUpdated ?? 0;
        totalAdded += result.playersAdded ?? 0;
        totalMatched += result.playersMatched ?? 0;
        if ((result.errors || []).length) errors += result.errors.length;
        console.log(
          slug,
          year,
          "-> inserted:",
          result.statsInserted ?? 0,
          "updated:",
          result.statsUpdated ?? 0,
          "new players:",
          result.playersAdded ?? 0,
          "matched:",
          result.playersMatched ?? 0
        );
      } catch (err) {
        console.error(slug, year, err.message);
        errors++;
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\nDone. Total: inserted", totalInserted, "updated", totalUpdated, "new players", totalAdded, "matched", totalMatched, "errors", errors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
