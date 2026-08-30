// src/lib/ai/ruleChecker.ts
// Deterministic rule checker mirroring rule_checker.py (kept in sync by hand).
// Parses raw Cisco show-command text and flags concrete misconfigurations.
import type { RuleFinding, Severity } from "./types.js";

function findLines(text: string, regex: RegExp): string[] {
  return text.split("\n").filter((line) => regex.test(line)).map((l) => l.trim());
}

export function checkDuplicateIp(text: string): RuleFinding | null {
  const evidence = findLines(text, /duplicate address|DUPADDR/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "DUP_IP",
    title: "Duplicate IP address detected",
    severity: "High",
    description: "The same IP address appears to be assigned to more than one interface/host on the network.",
    evidence,
  };
}

export function checkWrongSubnetMask(text: string): RuleFinding | null {
  const evidence = findLines(text, /255\.255\.255\.(0|128|192|224|240|248|252|254)\b.*(mismatch|incorrect|wrong)/i);
  const genericMaskLines = findLines(text, /subnet mask mismatch|mask mismatch/i);
  const all = [...evidence, ...genericMaskLines];
  if (all.length === 0) return null;
  return {
    ruleId: "WRONG_MASK",
    title: "Subnet mask mismatch",
    severity: "High",
    description: "Interfaces on the same segment appear to use inconsistent subnet masks.",
    evidence: all,
  };
}

export function checkInterfaceDown(text: string): RuleFinding | null {
  const evidence = findLines(text, /administratively down|err-disabled|line protocol is down/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "IFACE_DOWN",
    title: "Interface administratively down or err-disabled",
    severity: "Critical",
    description: "One or more interfaces are shut down or placed into err-disabled state, blocking traffic.",
    evidence,
  };
}

export function checkGatewayMismatch(text: string): RuleFinding | null {
  const evidence = findLines(text, /gateway.*(unreachable|mismatch|incorrect)|default gateway is not set/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "GATEWAY_MISMATCH",
    title: "Default gateway mismatch or unreachable",
    severity: "High",
    description: "Host or router default gateway configuration does not match the local subnet or is unset.",
    evidence,
  };
}

export function checkMissingVlan(text: string): RuleFinding | null {
  const evidence = findLines(text, /vlan.*not found in current vlan database|access vlan does not exist|inactive/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "MISSING_VLAN",
    title: "Referenced VLAN missing from VLAN database",
    severity: "High",
    description: "A port references a VLAN that has not been created, leaving it inactive.",
    evidence,
  };
}

export function checkMissingTrunk(text: string): RuleFinding | null {
  const evidence = findLines(text, /native vlan mismatch|trunking.*disabled|not trunking|access.*(should be trunk)/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "MISSING_TRUNK",
    title: "Trunk misconfiguration",
    severity: "Medium",
    description: "A link between switches is not configured as a trunk, or has a native VLAN mismatch.",
    evidence,
  };
}

export function checkMissingRoute(text: string): RuleFinding | null {
  const evidence = findLines(text, /network unreachable|no route to host|% network not in table/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "MISSING_ROUTE",
    title: "Missing or incomplete route",
    severity: "High",
    description: "Destination network is not present in the routing table.",
    evidence,
  };
}

export function checkWrongAcl(text: string): RuleFinding | null {
  const evidence = findLines(text, /access-list.*deny|denied.*access-list|%SEC-6-IPACCESSLOGP/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "WRONG_ACL",
    title: "ACL blocking legitimate traffic",
    severity: "Medium",
    description: "An access control list entry is denying traffic that appears to be legitimate.",
    evidence,
  };
}

export function checkIncorrectNat(text: string): RuleFinding | null {
  const evidence = findLines(text, /nat.*(fail|no translation|pool.*exhaust)|translating.*outside/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "BAD_NAT",
    title: "NAT translation failure",
    severity: "Medium",
    description: "Network Address Translation is not producing valid translations (pool exhaustion or misconfigured statement).",
    evidence,
  };
}

export function checkMissingDns(text: string): RuleFinding | null {
  const evidence = findLines(text, /% ?unrecognized host|% ?unknown host|dns.*not.*configured|no ip name-server/i);
  if (evidence.length === 0) return null;
  return {
    ruleId: "MISSING_DNS",
    title: "Missing or invalid DNS configuration",
    severity: "Medium",
    description: "Name resolution is failing because no DNS server is configured or reachable.",
    evidence,
  };
}

const ALL_CHECKS = [
  checkDuplicateIp,
  checkWrongSubnetMask,
  checkInterfaceDown,
  checkGatewayMismatch,
  checkMissingVlan,
  checkMissingTrunk,
  checkMissingRoute,
  checkWrongAcl,
  checkIncorrectNat,
  checkMissingDns,
];

export function runRuleChecks(text: string): RuleFinding[] {
  return ALL_CHECKS.map((check) => check(text)).filter((f): f is RuleFinding => f !== null);
}

const SEVERITY_WEIGHT: Record<Severity, number> = { Critical: 40, High: 25, Medium: 12, Low: 5 };

export function computeHealthScore(findings: RuleFinding[]): number {
  const penalty = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function computeRiskLevel(healthScore: number, findings: RuleFinding[]): Severity {
  const hasCritical = findings.some((f) => f.severity === "Critical");
  if (hasCritical || healthScore < 40) return "Critical";
  if (healthScore < 60) return "High";
  if (healthScore < 80) return "Medium";
  return "Low";
}
