// src/lib/ai/diagnose.ts
// Main entry point for the deterministic NetSage diagnosis engine.
// Combines rule checks, category scoring, health scoring, recommendations,
// and similar-case retrieval into one explainable result object.
import { runRuleChecks, computeHealthScore, computeRiskLevel } from "./ruleChecker.js";
import { scoreCategories } from "./scoring.js";
import { getRecommendations } from "./recommendations.js";
import { findSimilarCases, type CaseLike } from "./similarCases.js";
import { OSI_LAYERS } from "./types.js";
import type { DiagnosisInput, DiagnosisResult, ConfidenceLabel } from "./types.js";

// Maps each fault category to the OSI layer most associated with it.
const CATEGORY_OSI_LAYER: Record<string, number> = {
  VLAN: 2,
  Trunk: 2,
  STP: 2,
  Wireless: 1,
  DHCP: 7,
  DNS: 7,
  Routing: 3,
  ACL: 3,
  NAT: 3,
};

function confidenceLabel(score: number): ConfidenceLabel {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

export function diagnose(input: DiagnosisInput, caseLibrary: CaseLike[]): DiagnosisResult {
  const combinedText = `${input.symptom}\n${input.showOutput}\n${input.topologyNotes ?? ""}`;

  // 1. Run deterministic rule checks over the raw show-output text.
  const ruleFindings = runRuleChecks(combinedText);

  // 2. Score each fault category using keyword patterns + rule findings.
  const categoryScores = scoreCategories(combinedText, ruleFindings);
  const top = categoryScores[0];
  const category = top?.category ?? "Routing";
  const rawScore = top?.score ?? 0;
  const confidenceScore = Math.max(0, Math.min(100, rawScore));
  const label = confidenceLabel(confidenceScore);

  // 3. OSI layer for the winning category.
  const osiLayer = CATEGORY_OSI_LAYER[category] ?? 3;
  const osiLayerName = OSI_LAYERS[osiLayer] ?? "Network";

  // 4. Severity: worst rule finding severity, defaulting to Medium.
  const severityOrder = ["Critical", "High", "Medium", "Low"] as const;
  const severity =
    severityOrder.find((s) => ruleFindings.some((f) => f.severity === s)) ?? "Medium";

  // 5. Health score + risk level derived from rule findings.
  const healthScore = computeHealthScore(ruleFindings);
  const riskLevel = computeRiskLevel(healthScore, ruleFindings);

  // 6. Evidence: rule finding evidence lines + matched keyword lines.
  const evidenceUsed = [
    ...ruleFindings.flatMap((f) => f.evidence),
    ...(top?.matchedEvidence ?? []),
  ];
  const uniqueEvidence = [...new Set(evidenceUsed)].slice(0, 12);

  // 7. Recommendations for the winning category.
  const { commands: recommendedCommands, fixSteps } = getRecommendations(category);

  // 8. Root cause sentence combining category + top rule finding(s).
  const relevantFindings = ruleFindings.filter((f) => uniqueEvidence.some((e) => f.evidence.includes(e)));
  const rootCause =
    relevantFindings.length > 0
      ? `${category} issue: ${relevantFindings.map((f) => f.description).join(" ")}`
      : `Likely ${category.toLowerCase()}-related fault based on keyword analysis of the symptom and show output. No specific rule-based finding matched; recommend manual verification.`;

  // 9. Explainable reasoning trail — every claim cites evidence.
  const reasoning: string[] = [];
  reasoning.push(
    `Scanned symptom text and show-command output for keywords across ${categoryScores.length} fault categories.`,
  );
  reasoning.push(
    `Category "${category}" scored highest (${confidenceScore}/100) based on ${top?.matchedEvidence.length ?? 0} matched line(s)/keyword(s).`,
  );
  if (ruleFindings.length > 0) {
    for (const f of ruleFindings) {
      reasoning.push(`Rule check "${f.title}" fired: ${f.description} Evidence: ${f.evidence[0] ?? "n/a"}`);
    }
  } else {
    reasoning.push("No deterministic rule check fired; classification is based on keyword matching only, so confidence is capped.");
  }
  reasoning.push(`Derived network health score of ${healthScore}/100 -> risk level "${riskLevel}".`);

  // 10. Similar cases via keyword-overlap retrieval.
  const similarCaseIds = findSimilarCases(input.symptom, input.showOutput, caseLibrary, 3);
  if (similarCaseIds.length > 0) {
    reasoning.push(`Found ${similarCaseIds.length} similar prior case(s) in the case library by keyword overlap.`);
  }

  return {
    rootCause,
    osiLayer,
    osiLayerName,
    confidenceScore,
    confidenceLabel: label,
    severity,
    category,
    evidenceUsed: uniqueEvidence,
    recommendedCommands,
    fixSteps,
    reasoning,
    ruleFindings,
    healthScore,
    riskLevel,
    similarCaseIds,
  };
}
