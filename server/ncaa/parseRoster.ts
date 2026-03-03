/**
 * Parse roster table from a team season page. Use comment-stripped HTML.
 * Selector: #roster tbody tr. Player name and link from [data-stat="player"] a.
 */

import * as cheerio from "cheerio";
import { stripComments } from "./request";

export interface RosterPlayer {
  name: string;
  player_url: string;
  jersey_number: number;
  class: string;
}

const BASE_URL = "https://www.sports-reference.com";

function toInt(val: unknown): number {
  if (val == null) return 0;
  const s = String(val).trim().replace(/,/g, "");
  if (s === "" || s === "-") return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseRoster(html: string): RosterPlayer[] {
  const cleaned = stripComments(html);
  const $ = cheerio.load(cleaned);
  const out: RosterPlayer[] = [];

  $("#roster tbody tr").each((_, el) => {
    const $row = $(el);
    const $th = $row.find("th");
    if (!$th.length) return;
    const $link = $th.find('a[href*="/cbb/players/"]');
    if (!$link.length) return;
    const nameRaw = $link.text().trim();
    if (!nameRaw || /player|team totals/i.test(nameRaw)) return;
    const name = nameRaw.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
    if (!name) return;

    let href = $link.attr("href") ?? "";
    if (href && !href.startsWith("http")) href = BASE_URL + href;

    const jersey = toInt($row.find('td[data-stat="number"]').text() || $row.find("td").eq(1).text());
    const playerClass = $row.find('td[data-stat="class"]').text().trim() || $row.find("td").eq(2).text().trim() || "";

    out.push({
      name,
      player_url: href,
      jersey_number: jersey,
      class: playerClass,
    });
  });

  return out;
}
