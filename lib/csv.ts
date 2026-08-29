/** Minimal RFC-4180-ish CSV parser. Handles quoted fields, embedded commas,
 *  escaped quotes ("") and \r\n. Returns { headers, rows } (rows are objects). */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const s = text.replace(/^﻿/, "");
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      field = "";
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    records.push(row);
  }

  const nonEmpty = records.filter((r) => r.some((x) => x.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    return obj;
  });
  return { headers, rows };
}

/** Guess which header maps to each known field. */
export function autoMap(headers: string[], fields: { key: string; aliases: string[] }[]): Record<string, string> {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map: Record<string, string> = {};
  for (const f of fields) {
    const hit = headers.find((h) => {
      const n = norm(h);
      return n === norm(f.key) || f.aliases.some((a) => n === norm(a) || n.includes(norm(a)));
    });
    if (hit) map[f.key] = hit;
  }
  return map;
}
