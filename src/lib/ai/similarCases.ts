// src/lib/ai/similarCases.ts
// Finds similar past cases from the case library by simple keyword overlap.
import { db } from "../../../db/index.js";
import { cases } from "../../../db/schema.js";
import type { Category } from "./types.js";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

export async function findSimilarCases(
  category: Category,
  text: string,
  limit = 5,
): Promise<Array<{ id: number; title: string; rootCause: string; overlap: number }>> {
  const candidates = await db.select().from(cases);
  const inputTokens = tokenize(text);

  const scored = candidates
    .filter((c) => c.category === category)
    .map((c) => {
      const caseTokens = tokenize(`${c.symptom} ${c.showOutput} ${c.rootCause}`);
      let overlap = 0;
      for (const t of inputTokens) if (caseTokens.has(t)) overlap++;
      return { id: c.id, title: c.title, rootCause: c.rootCause, overlap };
    })
    .filter((c) => c.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap);

  return scored.slice(0, limit);
}
