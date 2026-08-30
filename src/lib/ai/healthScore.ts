// healthScore.ts
// Derives an overall network "health" score (0-100, higher is healthier)
// from the set of rule findings surfaced for a case. Purely additive
// penalty model so it stays deterministic and easy to explain.

import type { RuleFinding, Severity } from "./ruleChecker";

const PENALTY: Record<Severity, number> = {
  Critical: 30,
  High: 20,
  Medium: 10,
  Low: 5,
};

// Starts at 100 (perfectly healthy) and subtracts a fixed penalty per
// finding based on its severity, floored at 0.
export function computeHealthScore(findings: RuleFinding[]): number {
  let score = 100;
  for (const finding of findings) {
    score -= PENALTY[finding.severity];
  }
  return Math.max(0, score);
}

export type RiskLevel = "Critical" | "High" | "Medium" | "Low";

// Maps a health score back onto a coarse risk label for dashboards/alerts.
export function riskLevelFromScore(score: number): RiskLevel {
  if (score < 40) return "Critical";
  if (score < 60) return "High";
  if (score < 80) return "Medium";
  return "Low";
}
