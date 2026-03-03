/**
 * Parse player bio from an individual player page. Use comment-stripped HTML.
 * Extract from page text / #meta: height, weight, position, hometown, high_school, birth_date.
 */

import * as cheerio from "cheerio";
import { stripComments } from "./request";

export interface PlayerBio {
  height?: string;
  weight?: string;
  position?: string;
  hometown?: string;
  high_school?: string;
  birth_date?: string;
}

function getValueAfter(lines: string[], label: string): string | undefined {
  for (const line of lines) {
    const idx = line.indexOf(label);
    if (idx === -1) continue;
    const value = line.slice(idx + label.length).replace(/^[\s:]+/, "").trim();
    if (value && value.length < 200) return value;
  }
  return undefined;
}

export function parsePlayerBio(html: string): PlayerBio {
  const cleaned = stripComments(html);
  const $ = cheerio.load(cleaned);
  const out: PlayerBio = {};
  const bodyText = $("body").text();
  const lines = bodyText.split(/\n/).map((s) => s.trim()).filter(Boolean);

  const height = getValueAfter(lines, "Height:");
  if (height) out.height = height;
  const weight = getValueAfter(lines, "Weight:");
  if (weight) out.weight = weight;
  const position = getValueAfter(lines, "Position:");
  if (position) out.position = position;
  const hometown = getValueAfter(lines, "Hometown:");
  if (hometown) out.hometown = hometown;
  const highSchool = getValueAfter(lines, "High School:");
  if (highSchool) out.high_school = highSchool;
  const birthDate = getValueAfter(lines, "Birth Date:");
  if (birthDate) out.birth_date = birthDate;

  return out;
}
