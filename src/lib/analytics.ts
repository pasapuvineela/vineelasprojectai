// src/lib/analytics.ts
// Aggregate metrics for the admin analytics dashboard.
// Dataset sizes are small (demo tool), so aggregation is done in JS rather
// than with complex SQL — simpler and easier to reason about/test.
import { createServerFn } from "@tanstack/react-start";
import { db } from "../../db/index.js";
import { correctionLogs, diagnoses } from "../../db/schema.js";
import { requireRole, getSessionUser } from "./auth.js";

function startOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export const getAnalyticsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!requireRole(user, ["admin"])) {
    throw new Error("Only admins may view analytics.");
  }

  const allDiagnoses = await db.select().from(diagnoses);
  const allCorrections = await db.select().from(correctionLogs);

  const total = allDiagnoses.length;
  const averageConfidence =
    total > 0
      ? Math.round(
          (allDiagnoses.reduce((sum, d) => sum + d.confidenceScore, 0) / total) * 10,
        ) / 10
      : 0;

  const categoryCounts = countBy(allDiagnoses, (d) => d.category);
  const severityCounts = countBy(allDiagnoses, (d) => d.severity);
  const osiLayerCounts = countBy(allDiagnoses, (d) => `L${d.osiLayer} ${d.osiLayerName}`);

  const mostCommonCategory =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const mostAffectedOsiLayer =
    Object.entries(osiLayerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const reviewed = allCorrections.length;
  const accepted = allCorrections.filter((c) => c.action === "accepted").length;
  const humanAgreementRate = reviewed > 0 ? Math.round((accepted / reviewed) * 1000) / 10 : 0;

  // AI accuracy trend, grouped by ISO week of the diagnosis's correction.
  const trendBuckets: Record<string, { total: number; accepted: number }> = {};
  for (const log of allCorrections) {
    const created = log.createdAt ? new Date(log.createdAt) : new Date();
    const bucket = startOfWeek(created);
    trendBuckets[bucket] ??= { total: 0, accepted: 0 };
    trendBuckets[bucket].total += 1;
    if (log.action === "accepted") trendBuckets[bucket].accepted += 1;
  }
  const aiAccuracyTrend = Object.entries(trendBuckets)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, { total: t, accepted: a }]) => ({
      week,
      total: t,
      accepted: a,
      acceptedRate: t > 0 ? Math.round((a / t) * 1000) / 10 : 0,
    }));

  return {
    totalDiagnoses: total,
    averageConfidence,
    mostCommonCategory,
    mostAffectedOsiLayer,
    humanAgreementRate,
    issueDistributionByCategory: categoryCounts,
    severityDistribution: severityCounts,
    osiLayerDistribution: osiLayerCounts,
    aiAccuracyTrend,
  };
});
