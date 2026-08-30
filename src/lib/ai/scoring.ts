// src/lib/ai/scoring.ts
// Scores each category against the combined input text and picks a winner.
import { CATEGORY_PATTERNS } from "./categoryPatterns.js";
import type { Category, CategoryScore, RuleFinding } from "./types.js";

// Rule-checker findings nudge the category score too (e.g. a missing-VLAN
// finding boosts the VLAN category), so the "AI" and the rule checker agree.
const RULE_TO_CATEGORY: Record<string, Category> = {
  DUP_IP: "DHCP",
  WRONG_MASK: "Routing",
  IFACE_DOWN: "STP",
  GATEWAY_MISMATCH: "Routing",
  MISSING_VLAN: "VLAN",
  MISSING_TRUNK: "Trunk",
  MISSING_ROUTE: "Routing",
  WRONG_ACL: "ACL",
  BAD_NAT: "NAT",
  MISSING_DNS: "DNS",
};

export function scoreCategories(text: string, ruleFindings: RuleFinding[]): CategoryScore[] {
  const scores: CategoryScore[] = (Object.keys(CATEGORY_PATTERNS) as Category[]).map((category) => {
    const patterns = CATEGORY_PATTERNS[category];
    let score = 0;
    const matchedEvidence: string[] = [];
    for (const { regex, weight } of patterns) {
      const lines = text.split("\n").filter((l) => regex.test(l));
      if (lines.length > 0) {
        score += weight;
        matchedEvidence.push(...lines.map((l) => l.trim()).filter(Boolean));
      } else if (regex.test(text)) {
        // Matched within symptom/topology prose rather than a discrete line.
        score += Math.round(weight * 0.6);
      }
    }
    return { category, score, matchedEvidence: [...new Set(matchedEvidence)] };
  });

  for (const finding of ruleFindings) {
    const category = RULE_TO_CATEGORY[finding.ruleId];
    const entry = scores.find((s) => s.category === category);
    if (entry) {
      entry.score += 18;
      entry.matchedEvidence.push(...finding.evidence);
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}
