// categories.ts
// Static knowledge base: the fault categories NetSage AI can recognize,
// the keywords/regexes that hint at each category, and the OSI layer(s)
// each category is typically associated with. This is intentionally plain
// data so the rest of the engine stays deterministic and explainable.

export interface OsiLayerInfo {
  layer: number; // primary numeric OSI layer (1-7)
  name: string; // human-readable label, may mention adjacent layers
}

export interface CategoryDefinition {
  category: string;
  // Plain keywords/phrases to look for (case-insensitive substring match).
  keywords: string[];
  // Regex patterns for more structural matches (e.g. "vlan 10").
  patterns: RegExp[];
  osi: OsiLayerInfo;
}

export const CATEGORY_NAMES = [
  "VLAN",
  "DHCP",
  "DNS",
  "Routing",
  "ACL",
  "NAT",
  "Trunk",
  "STP",
  "Wireless",
] as const;

export type CategoryName = (typeof CATEGORY_NAMES)[number];

export const CATEGORIES: CategoryDefinition[] = [
  {
    category: "VLAN",
    keywords: ["vlan", "native vlan mismatch", "vlan not found", "vlan database"],
    patterns: [/vlan/i, /native vlan mismatch/i, /vlan\s*not\s*found/i],
    osi: { layer: 2, name: "Layer 2 - Data Link" },
  },
  {
    category: "DHCP",
    keywords: ["dhcp", "no ip address", "exhausted", "dhcp pool", "ip helper-address"],
    patterns: [/dhcp/i, /no ip address/i, /exhaust(ed|ion)/i],
    osi: { layer: 3, name: "Layer 3/7 - Network / Application" },
  },
  {
    category: "DNS",
    keywords: ["dns", "domain name", "name resolution", "nslookup"],
    patterns: [/dns/i, /domain name/i, /name resolution/i],
    osi: { layer: 7, name: "Layer 7 - Application" },
  },
  {
    category: "Routing",
    keywords: ["route", "gateway", "ip route", "unreachable", "next hop"],
    patterns: [/route|gateway|ip route/i, /unreachable/i, /next[- ]hop/i],
    osi: { layer: 3, name: "Layer 3 - Network" },
  },
  {
    category: "ACL",
    keywords: ["access-list", "acl", "permit", "deny"],
    patterns: [/access-list|acl|permit|deny/i],
    osi: { layer: 3, name: "Layer 3/4 - Network / Transport" },
  },
  {
    category: "NAT",
    keywords: ["nat", "overload", "inside global", "inside local", "translating"],
    patterns: [/nat|overload|inside global/i],
    osi: { layer: 3, name: "Layer 3 - Network" },
  },
  {
    category: "Trunk",
    keywords: ["trunk", "encapsulation dot1q", "switchport mode trunk"],
    patterns: [/trunk|encapsulation dot1q|switchport mode trunk/i],
    osi: { layer: 2, name: "Layer 2 - Data Link" },
  },
  {
    category: "STP",
    keywords: ["spanning-tree", "stp", "blocking", "root bridge"],
    patterns: [/spanning-tree|stp|blocking|root bridge/i],
    osi: { layer: 2, name: "Layer 2 - Data Link" },
  },
  {
    category: "Wireless",
    keywords: ["ssid", "wpa", "wireless", "authentication failed"],
    patterns: [/ssid|wpa|wireless|authentication failed/i],
    osi: { layer: 1, name: "Layer 1/2 - Physical / Data Link" },
  },
];

// Convenience lookup by category name.
export function getCategoryDefinition(category: string): CategoryDefinition | undefined {
  return CATEGORIES.find((c) => c.category === category);
}

// Convenience lookup for the OSI layer info of a given category.
export function getOsiLayer(category: string): OsiLayerInfo {
  return getCategoryDefinition(category)?.osi ?? { layer: 0, name: "Unknown" };
}
