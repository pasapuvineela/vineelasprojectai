// src/lib/ai/recommendations.ts
// Templated recommendation content per category: next commands to run,
// config commands, verification commands, and prevention tips.
import type { Category, Severity } from "./types.js";

export interface CategoryTemplate {
  osiLayer: number;
  rootCause: string;
  recommendedCommands: string[];
  fixSteps: string[];
  preventionTips: string[];
}

export const CATEGORY_TEMPLATES: Record<Category, CategoryTemplate> = {
  VLAN: {
    osiLayer: 2,
    rootCause: "A switchport references a VLAN that is missing from the VLAN database or is inactive, isolating the port from its intended broadcast domain.",
    recommendedCommands: ["show vlan brief", "show interfaces switchport", "show mac address-table"],
    fixSteps: [
      "Run `show vlan brief` to confirm whether the target VLAN exists and is active.",
      "If missing, create it: `vlan <id>` then `name <label>` in global config.",
      "Re-apply the access VLAN on the port: `switchport access vlan <id>`.",
      "Verify the port is up with `show interfaces switchport`.",
    ],
    preventionTips: ["Document VLAN IDs centrally", "Audit VLAN database before provisioning new ports"],
  },
  DHCP: {
    osiLayer: 7,
    rootCause: "The DHCP client is not receiving a lease — likely an exhausted pool, misconfigured helper address, or a duplicate address conflict.",
    recommendedCommands: ["show ip dhcp binding", "show ip dhcp pool", "show ip dhcp conflict"],
    fixSteps: [
      "Check pool utilization with `show ip dhcp pool`.",
      "Look for conflicts using `show ip dhcp conflict` and clear stale entries.",
      "Confirm `ip helper-address` is set on the client-facing interface if the DHCP server is remote.",
      "Renew the client lease and confirm binding appears in `show ip dhcp binding`.",
    ],
    preventionTips: ["Size DHCP pools with growth headroom", "Reserve static leases for infrastructure devices"],
  },
  DNS: {
    osiLayer: 7,
    rootCause: "Name resolution is failing because no DNS server is configured, unreachable, or the domain lookup is misdirected.",
    recommendedCommands: ["show run | include name-server", "show hosts", "ping <dns-server-ip>"],
    fixSteps: [
      "Verify a name server is configured: `ip name-server <ip>`.",
      "Confirm reachability to the DNS server with `ping`.",
      "Enable domain lookup if disabled: `ip domain-lookup`.",
      "Clear the host cache and retest: `clear host *`.",
    ],
    preventionTips: ["Configure redundant DNS servers", "Monitor DNS server reachability"],
  },
  Routing: {
    osiLayer: 3,
    rootCause: "The destination network is absent from the routing table due to a missing static route or a routing protocol adjacency failure.",
    recommendedCommands: ["show ip route", "show ip protocols", "show ip interface brief"],
    fixSteps: [
      "Inspect the routing table with `show ip route` for the missing prefix.",
      "If static, add it: `ip route <network> <mask> <next-hop>`.",
      "If dynamic, check protocol neighbors/adjacencies with `show ip protocols` or `show ip ospf neighbor`.",
      "Re-verify end-to-end reachability with `traceroute`.",
    ],
    preventionTips: ["Standardize route summarization", "Alert on routing adjacency flaps"],
  },
  ACL: {
    osiLayer: 3,
    rootCause: "An access control list entry is denying traffic that should be permitted, usually due to implicit deny or an overly broad rule ordering.",
    recommendedCommands: ["show access-lists", "show ip interface | include access list", "show run | section access-list"],
    fixSteps: [
      "Identify the offending ACL with `show access-lists` and check hit counters.",
      "Reorder or add a permit statement above the blocking deny.",
      "Re-apply the ACL to the interface if edited: `ip access-group <name> in|out`.",
      "Retest and confirm hit counts increase on the permit line.",
    ],
    preventionTips: ["Comment ACL entries", "Review ACLs before deployment with a peer"],
  },
  NAT: {
    osiLayer: 3,
    rootCause: "NAT is failing to translate traffic — likely pool exhaustion, a missing NAT statement, or interfaces not marked inside/outside.",
    recommendedCommands: ["show ip nat translations", "show ip nat statistics", "show run | include nat"],
    fixSteps: [
      "Check active translations with `show ip nat translations`.",
      "Confirm interfaces are marked correctly: `ip nat inside` / `ip nat outside`.",
      "Verify the NAT pool has free addresses via `show ip nat statistics`.",
      "Clear stale translations if needed: `clear ip nat translation *`.",
    ],
    preventionTips: ["Size NAT pools for peak concurrent users", "Monitor NAT statistics for exhaustion"],
  },
  Trunk: {
    osiLayer: 2,
    rootCause: "A switch-to-switch link is not operating as a trunk, or the native VLAN differs between the two ends, causing VLAN leakage or connectivity loss.",
    recommendedCommands: ["show interfaces trunk", "show interfaces switchport", "show cdp neighbors"],
    fixSteps: [
      "Confirm trunk state with `show interfaces trunk` on both switches.",
      "Match native VLANs: `switchport trunk native vlan <id>` on both ends.",
      "Ensure trunk encapsulation matches (`switchport trunk encapsulation dot1q`).",
      "Verify allowed VLAN list includes required VLANs.",
    ],
    preventionTips: ["Standardize native VLAN across the topology", "Use trunk config templates"],
  },
  STP: {
    osiLayer: 2,
    rootCause: "A redundant Layer 2 path is causing a spanning-tree loop or a port has been err-disabled by a loop-protection mechanism.",
    recommendedCommands: ["show spanning-tree", "show spanning-tree detail", "show interfaces status err-disabled"],
    fixSteps: [
      "Identify the topology change with `show spanning-tree detail`.",
      "Check for err-disabled ports: `show interfaces status err-disabled`.",
      "Re-enable the port after resolving the loop: `shutdown` then `no shutdown`.",
      "Confirm root bridge election is stable and expected.",
    ],
    preventionTips: ["Enable BPDU guard on access ports", "Document intended root bridge placement"],
  },
  Wireless: {
    osiLayer: 1,
    rootCause: "Wireless clients are failing to associate or authenticate, typically from an SSID/security mismatch or RF interference.",
    recommendedCommands: ["show wlan summary", "show dot11 associations", "show controllers dot11Radio"],
    fixSteps: [
      "Confirm SSID broadcast and security settings match the client profile.",
      "Check association status with `show dot11 associations`.",
      "Inspect RF for interference/signal strength with `show controllers dot11Radio`.",
      "Adjust channel/power settings if interference is present.",
    ],
    preventionTips: ["Perform periodic RF site surveys", "Standardize WPA2/WPA3 security profiles"],
  },
};

export function severityFromScore(score: number): Severity {
  if (score >= 70) return "Critical";
  if (score >= 45) return "High";
  if (score >= 20) return "Medium";
  return "Low";
}
