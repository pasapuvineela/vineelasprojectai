// src/lib/ai/types.ts
// Shared types for the deterministic diagnosis engine.

export type Category =
  | "VLAN"
  | "DHCP"
  | "DNS"
  | "Routing"
  | "ACL"
  | "NAT"
  | "Trunk"
  | "STP"
  | "Wireless";

export type Severity = "Critical" | "High" | "Medium" | "Low";
export type ConfidenceLabel = "Low" | "Medium" | "High";

export const OSI_LAYERS: Record<number, string> = {
  1: "Physical",
  2: "Data Link",
  3: "Network",
  4: "Transport",
  5: "Session",
  6: "Presentation",
  7: "Application",
};

export interface DiagnosisInput {
  symptom: string;
  showOutput: string;
  topologyNotes?: string;
}

export interface RuleFinding {
  ruleId: string;
  title: string;
  severity: Severity;
  description: string;
  evidence: string[];
}

export interface CategoryScore {
  category: Category;
  score: number;
  matchedEvidence: string[];
}

export interface DiagnosisResult {
  rootCause: string;
  osiLayer: number;
  osiLayerName: string;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  severity: Severity;
  category: Category;
  evidenceUsed: string[];
  recommendedCommands: string[];
  fixSteps: string[];
  reasoning: string[];
  ruleFindings: RuleFinding[];
  healthScore: number;
  riskLevel: Severity;
  similarCaseIds: number[];
}
