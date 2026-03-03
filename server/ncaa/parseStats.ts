/**
 * Parse per-game stats table. Use comment-stripped HTML.
 * Selector: #per_game tbody tr. Skip rows without a player link (team totals).
 * Return object keyed by player name (trimmed, for merge).
 */

import * as cheerio from "cheerio";
import { stripComments } from "./request";

export interface PerGameStats {
  games: number;
  games_started: number | null;
  pts_per_g: number;
  trb_per_g: number;
  ast_per_g: number;
  stl_per_g: number;
  blk_per_g: number;
  fg_pct: number;
  fg3_pct: number | null;
  ft_pct: number | null;
}

export type StatsByPlayerName = Record<string, PerGameStats>;

function toNum(val: unknown): number | null {
  if (val == null) return null;
  const s = String(val).trim().replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(val: unknown): number {
  const n = toNum(val);
  return n != null ? Math.floor(n) : 0;
}

export function parseStats(html: string): StatsByPlayerName {
  const cleaned = stripComments(html);
  const $ = cheerio.load(cleaned);
  const stats: StatsByPlayerName = {};

  $("#per_game tbody tr").each((_, el) => {
    const $row = $(el);
    const $playerLink = $row.find('td[data-stat="player"] a[href*="/cbb/players/"]');
    if (!$playerLink.length) return;
    const nameRaw = $playerLink.first().text().trim();
    if (!nameRaw || /team totals|totals/i.test(nameRaw)) return;
    const name = nameRaw.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").trim();
    if (!name) return;

    const games = toInt($row.find('td[data-stat="g"]').text());
    const gs = toNum($row.find('td[data-stat="gs"]').text());
    let pts = toNum($row.find('td[data-stat="pts_per_g"]').text()) ?? toNum($row.find('td[data-stat="pts"]').text()) ?? 0;
    let trb = toNum($row.find('td[data-stat="trb_per_g"]').text()) ?? toNum($row.find('td[data-stat="trb"]').text()) ?? 0;
    let ast = toNum($row.find('td[data-stat="ast_per_g"]').text()) ?? toNum($row.find('td[data-stat="ast"]').text()) ?? 0;
    let stl = toNum($row.find('td[data-stat="stl_per_g"]').text()) ?? toNum($row.find('td[data-stat="stl"]').text()) ?? 0;
    let blk = toNum($row.find('td[data-stat="blk_per_g"]').text()) ?? toNum($row.find('td[data-stat="blk"]').text()) ?? 0;
    let fg = toNum($row.find('td[data-stat="fg_pct"]').text()) ?? 0;
    if (fg > 1) fg /= 100;
    let fg3 = toNum($row.find('td[data-stat="fg3_pct"]').text());
    if (fg3 != null && fg3 > 1) fg3 /= 100;
    let ft = toNum($row.find('td[data-stat="ft_pct"]').text());
    if (ft != null && ft > 1) ft /= 100;

    stats[name.trim()] = {
      games,
      games_started: gs != null ? Math.floor(gs) : null,
      pts_per_g: pts,
      trb_per_g: trb,
      ast_per_g: ast,
      stl_per_g: stl,
      blk_per_g: blk,
      fg_pct: fg,
      fg3_pct: fg3,
      ft_pct: ft,
    };
  });

  return stats;
}
