// src/lib/ai/categoryPatterns.ts
// Keyword/regex heuristics used to score each troubleshooting category.
import type { Category } from "./types.js";

export interface Pattern {
  regex: RegExp;
  weight: number;
}

// Each category has a list of weighted regex patterns. A match against the
// combined (symptom + show-output + topology notes) text adds its weight to
// that category's score, and the matched line/phrase becomes evidence.
export const CATEGORY_PATTERNS: Record<Category, Pattern[]> = {
  VLAN: [
    { regex: /native vlan mismatch/i, weight: 30 },
    { regex: /vlan.*not found in current vlan database/i, weight: 30 },
    { regex: /access vlan.*(inactive|does not exist)/i, weight: 25 },
    { regex: /\bvlan\b/i, weight: 8 },
    { regex: /err-disabled/i, weight: 15 },
  ],
  DHCP: [
    { regex: /%DHCP/i, weight: 30 },
    { regex: /dhcp.*(fail|timeout|no address available)/i, weight: 25 },
    { regex: /duplicate address/i, weight: 20 },
    { regex: /\bdhcp\b/i, weight: 8 },
    { regex: /ip address.*169\.254/i, weight: 20 },
  ],
  DNS: [
    { regex: /% ?unrecognized host|% ?unknown host/i, weight: 28 },
    { regex: /no ip name-server/i, weight: 25 },
    { regex: /\bdns\b/i, weight: 10 },
    { regex: /name resolution/i, weight: 15 },
  ],
  Routing: [
    { regex: /% network not in table/i, weight: 28 },
    { regex: /no route to host/i, weight: 25 },
    { regex: /\bospf\b|\beigrp\b|\brip\b|\bbgp\b/i, weight: 12 },
    { regex: /routing table|ip route/i, weight: 10 },
    { regex: /network unreachable/i, weight: 22 },
  ],
  ACL: [
    { regex: /access-list/i, weight: 20 },
    { regex: /%SEC-6-IPACCESSLOGP/i, weight: 25 },
    { regex: /denied.*access-list|access-list.*deny/i, weight: 25 },
  ],
  NAT: [
    { regex: /\bnat\b/i, weight: 18 },
    { regex: /nat.*(fail|no translation)/i, weight: 26 },
    { regex: /pool.*exhaust/i, weight: 22 },
  ],
  Trunk: [
    { regex: /trunk/i, weight: 15 },
    { regex: /native vlan mismatch/i, weight: 28 },
    { regex: /not trunking|trunking.*disabled/i, weight: 22 },
  ],
  STP: [
    { regex: /spanning-tree/i, weight: 15 },
    { regex: /%SPANTREE/i, weight: 28 },
    { regex: /topology change|loop guard|bpdu/i, weight: 20 },
    { regex: /err-disabled.*loop/i, weight: 25 },
  ],
  Wireless: [
    { regex: /wlan|ssid|wpa2?|access point|\bap\b/i, weight: 14 },
    { regex: /authentication failed|association failed/i, weight: 25 },
    { regex: /signal strength|interference/i, weight: 18 },
  ],
};
