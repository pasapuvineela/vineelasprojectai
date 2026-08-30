"""
rule_checker.py
================

Deterministic, dependency-free (stdlib only) rule-based checker for Cisco
Packet Tracer / IOS "show" command output and configuration text.

This module is a standalone Python analogue of the rule engine that lives
in this repository's TypeScript codebase (src/lib/ai/). It exists to be
runnable independently for testing/demoing rule logic, offline analysis,
or scripting, without any external dependencies.

Usage:
    python3 rule_checker.py

Or import it:
    from rule_checker import run_rule_checks, compute_health_score, compute_risk_level
    findings = run_rule_checks(raw_show_output_text)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class RuleFinding:
    """A single detected issue produced by a rule-check function."""

    rule_id: str            # stable machine-readable identifier, e.g. "DUP_IP"
    title: str              # short human-readable title
    severity: str           # one of "Critical", "High", "Medium", "Low"
    description: str        # explanation of what was detected and why it matters
    evidence: str = ""      # the raw text snippet(s) that triggered the finding

    def __str__(self) -> str:
        ev = self.evidence.strip().replace("\n", " | ")
        return f"[{self.severity:^8}] {self.rule_id}: {self.title}\n    {self.description}\n    Evidence: {ev}"


# Severity ranking used for scoring / sorting. Higher number = worse.
_SEVERITY_WEIGHT = {
    "Critical": 40,
    "High": 25,
    "Medium": 12,
    "Low": 5,
}

_SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"]


# ---------------------------------------------------------------------------
# Individual rule-check functions
#
# Each function takes the raw show-output text and returns a list of
# RuleFinding objects (empty list if the rule did not trigger). Regexes are
# intentionally tolerant of extra whitespace and case differences, since
# Packet Tracer / IOS output formatting can vary slightly between devices
# and IOS versions.
# ---------------------------------------------------------------------------


def check_duplicate_ip(text: str) -> List[RuleFinding]:
    """Detect duplicate IP address conflicts reported by DHCP or ARP."""
    findings: List[RuleFinding] = []

    # Matches syslog lines like:
    # %DHCP-4-DUPADDR: Detected duplicate IP address 192.168.10.5 on interface FastEthernet0/2
    for m in re.finditer(
        r"%DHCP-\d-DUPADDR:.*duplicate IP address\s+(\d{1,3}(?:\.\d{1,3}){3}).*",
        text,
        re.IGNORECASE,
    ):
        findings.append(
            RuleFinding(
                rule_id="DUP_IP",
                title="Duplicate IP address detected",
                severity="High",
                description=(
                    f"IP address {m.group(1)} was reported as a duplicate/conflict. "
                    "This usually means a statically configured host is using an "
                    "address that is also inside an active DHCP scope, or two hosts "
                    "were manually assigned the same address."
                ),
                evidence=m.group(0),
            )
        )

    # Matches: %IP-4-DUPADDR: Duplicate address 10.0.0.5 on Vlan1, sourced by 0000.0000.0001
    for m in re.finditer(
        r"%IP-\d-DUPADDR:\s*Duplicate address\s+(\d{1,3}(?:\.\d{1,3}){3}).*",
        text,
        re.IGNORECASE,
    ):
        findings.append(
            RuleFinding(
                rule_id="DUP_IP",
                title="Duplicate IP address detected (ARP conflict)",
                severity="High",
                description=(
                    f"Address {m.group(1)} is claimed by more than one interface/host on the "
                    "local segment, as reported via ARP-based duplicate detection."
                ),
                evidence=m.group(0),
            )
        )

    return findings


def check_wrong_subnet_mask(text: str) -> List[RuleFinding]:
    """Detect interfaces on the same network using mismatched subnet masks."""
    findings: List[RuleFinding] = []

    # Collect (ip, mask) pairs from lines such as:
    # ip address 192.168.10.1 255.255.255.0
    pairs = re.findall(
        r"ip address\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,3}(?:\.\d{1,3}){3})",
        text,
        re.IGNORECASE,
    )

    def mask_to_prefix(mask: str) -> int:
        try:
            return sum(bin(int(o)).count("1") for o in mask.split("."))
        except ValueError:
            return -1

    def net(ip: str, mask: str) -> str:
        ip_parts = [int(o) for o in ip.split(".")]
        mask_parts = [int(o) for o in mask.split(".")]
        return ".".join(str(a & b) for a, b in zip(ip_parts, mask_parts))

    # Group interfaces that appear to be on the same /24-ish network but with
    # differing mask lengths -- a classic misconfiguration.
    seen = {}
    for ip, mask in pairs:
        prefix = mask_to_prefix(mask)
        key = net(ip, mask)
        if key in seen and seen[key][1] != mask:
            findings.append(
                RuleFinding(
                    rule_id="WRONG_MASK",
                    title="Inconsistent subnet mask on same network",
                    severity="Medium",
                    description=(
                        f"Address {ip}/{prefix} appears to share network {key} with a "
                        f"previously seen interface using mask {seen[key][1]} instead of "
                        f"{mask}. Mismatched masks on the same broadcast domain can split "
                        "hosts into unreachable subnets or falsely widen the domain."
                    ),
                    evidence=f"ip address {ip} {mask}",
                )
            )
        seen[key] = (ip, mask)

    # Also flag obviously non-standard / suspicious masks (not a clean bit run)
    for ip, mask in pairs:
        octets = [int(o) for o in mask.split(".")]
        bits = "".join(f"{o:08b}" for o in octets)
        if "01" in bits.lstrip("1").rstrip("0") and bits.count("1") not in (0, 32):
            # A discontinuous mask (e.g. 255.255.0.255) is virtually always a typo.
            if re.search(r"^1*0*$", bits) is None:
                findings.append(
                    RuleFinding(
                        rule_id="WRONG_MASK",
                        title="Non-contiguous subnet mask",
                        severity="High",
                        description=(
                            f"Mask {mask} configured for {ip} is not a valid contiguous "
                            "subnet mask and is almost certainly a typo."
                        ),
                        evidence=f"ip address {ip} {mask}",
                    )
                )

    return findings


def check_interface_down(text: str) -> List[RuleFinding]:
    """Detect interfaces that are administratively down / shutdown."""
    findings: List[RuleFinding] = []

    # "show ip interface brief" style rows:
    # GigabitEthernet0/1    192.168.1.1    YES manual administratively down down
    for m in re.finditer(
        r"^(?P<iface>\S+)\s+(?P<ip>\d{1,3}(?:\.\d{1,3}){3}|unassigned)\s+\S+\s+\S+\s+administratively down\s+down",
        text,
        re.IGNORECASE | re.MULTILINE,
    ):
        findings.append(
            RuleFinding(
                rule_id="IFACE_DOWN",
                title="Interface administratively down",
                severity="High",
                description=(
                    f"Interface {m.group('iface')} is administratively down, meaning it has "
                    "been shut down in configuration (the 'shutdown' command is active) "
                    "rather than experiencing a physical/link problem."
                ),
                evidence=m.group(0).strip(),
            )
        )

    # Also match plain "is administratively down" from 'show interfaces'
    for m in re.finditer(
        r"^(?P<iface>\S+ \S+) is administratively down, line protocol is down",
        text,
        re.IGNORECASE | re.MULTILINE,
    ):
        findings.append(
            RuleFinding(
                rule_id="IFACE_DOWN",
                title="Interface administratively down",
                severity="High",
                description=(
                    f"Interface {m.group('iface')} is administratively down. Run 'no shutdown' "
                    "on that interface if it should be active."
                ),
                evidence=m.group(0).strip(),
            )
        )

    return findings


def check_gateway_mismatch(text: str) -> List[RuleFinding]:
    """Detect a host/client default gateway that does not match any configured router interface subnet."""
    findings: List[RuleFinding] = []

    gw_match = re.search(
        r"Default Gateway[.\s:]+(\d{1,3}(?:\.\d{1,3}){3})", text, re.IGNORECASE
    )
    if not gw_match:
        return findings
    gateway = gw_match.group(1)

    router_ips = re.findall(
        r"ip address\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,3}(?:\.\d{1,3}){3})",
        text,
        re.IGNORECASE,
    )

    def in_same_network(ip_a: str, ip_b: str, mask: str) -> bool:
        a = [int(o) for o in ip_a.split(".")]
        b = [int(o) for o in ip_b.split(".")]
        m = [int(o) for o in mask.split(".")]
        return all((a[i] & m[i]) == (b[i] & m[i]) for i in range(4))

    if router_ips:
        matched = any(in_same_network(gateway, ip, mask) for ip, mask in router_ips)
        if not matched:
            findings.append(
                RuleFinding(
                    rule_id="GATEWAY_MISMATCH",
                    title="Default gateway mismatch",
                    severity="Critical",
                    description=(
                        f"Client default gateway {gateway} does not belong to any subnet "
                        "configured on a router/switch interface shown in this output. "
                        "The client will not be able to reach off-subnet destinations."
                    ),
                    evidence=f"Default Gateway: {gateway}",
                )
            )

    return findings


def check_missing_vlan(text: str) -> List[RuleFinding]:
    """Detect an access port assigned to a VLAN number that isn't in the VLAN database, or 'inactive VLAN' state."""
    findings: List[RuleFinding] = []

    for m in re.finditer(
        r"(?P<iface>\S+) is up, line protocol is down \(inactive VLAN\)",
        text,
        re.IGNORECASE,
    ):
        findings.append(
            RuleFinding(
                rule_id="MISSING_VLAN",
                title="Port references a missing/inactive VLAN",
                severity="Medium",
                description=(
                    f"Interface {m.group('iface')} is in the 'inactive VLAN' state, meaning "
                    "it is assigned to a VLAN ID that does not currently exist in the VLAN "
                    "database (it may have been deleted, or never created)."
                ),
                evidence=m.group(0),
            )
        )

    # Cross-check: switchport access vlan <N> references not present in "show vlan brief"
    assigned_vlans = set(
        re.findall(r"switchport access vlan\s+(\d+)", text, re.IGNORECASE)
    )
    vlan_brief_ids = set(
        re.findall(r"^\s*(\d+)\s+\S+\s+active", text, re.IGNORECASE | re.MULTILINE)
    )
    if assigned_vlans and vlan_brief_ids:
        for vid in sorted(assigned_vlans - vlan_brief_ids):
            findings.append(
                RuleFinding(
                    rule_id="MISSING_VLAN",
                    title="Access port assigned to undefined VLAN",
                    severity="Medium",
                    description=(
                        f"A port is configured with 'switchport access vlan {vid}', but VLAN "
                        f"{vid} does not appear as active in 'show vlan brief' output."
                    ),
                    evidence=f"switchport access vlan {vid}",
                )
            )

    return findings


def check_missing_trunk(text: str) -> List[RuleFinding]:
    """Detect trunk negotiation problems: both ends auto/negotiating, or VLAN pruned from allowed list."""
    findings: List[RuleFinding] = []

    if re.search(r"Administrative Mode:\s*dynamic auto", text, re.IGNORECASE) and re.search(
        r"Operational Mode:\s*static access", text, re.IGNORECASE
    ):
        findings.append(
            RuleFinding(
                rule_id="MISSING_TRUNK",
                title="Trunk failed to negotiate, fell back to access mode",
                severity="Medium",
                description=(
                    "The port's administrative mode is 'dynamic auto' but it operationally "
                    "settled as a static access link. Two 'dynamic auto' ends never "
                    "initiate trunk negotiation on their own; at least one side must be "
                    "explicitly configured with 'switchport mode trunk'."
                ),
                evidence="Administrative Mode: dynamic auto / Operational Mode: static access",
            )
        )

    if re.search(r"NATIVE_VLAN_MISMATCH", text, re.IGNORECASE):
        m = re.search(r"%CDP-\d-NATIVE_VLAN_MISMATCH:.*", text, re.IGNORECASE)
        findings.append(
            RuleFinding(
                rule_id="MISSING_TRUNK",
                title="Native VLAN mismatch on trunk",
                severity="Medium",
                description=(
                    "CDP has detected that the two ends of a trunk link are configured "
                    "with different native VLANs, which can leak untagged traffic between "
                    "VLANs and trigger CDP warnings."
                ),
                evidence=m.group(0) if m else "NATIVE_VLAN_MISMATCH",
            )
        )

    return findings


def check_missing_route(text: str) -> List[RuleFinding]:
    """Detect a missing default route or 'network not in table' errors."""
    findings: List[RuleFinding] = []

    if re.search(r"Gateway of last resort is not set", text, re.IGNORECASE) and re.search(
        r"0\.0\.0\.0/0", text
    ) is None:
        findings.append(
            RuleFinding(
                rule_id="MISSING_ROUTE",
                title="No default route configured",
                severity="Critical",
                description=(
                    "'Gateway of last resort is not set' and no 0.0.0.0/0 route is present. "
                    "Any traffic destined for a network not explicitly in the routing table "
                    "(e.g. the internet) will be dropped."
                ),
                evidence="Gateway of last resort is not set",
            )
        )

    for m in re.finditer(
        r"%\s*Network not in table|Unrecognized host or address, not found",
        text,
        re.IGNORECASE,
    ):
        findings.append(
            RuleFinding(
                rule_id="MISSING_ROUTE",
                title="Destination network unreachable / not in routing table",
                severity="High",
                description=(
                    "The device attempted to reach a destination for which it has no route "
                    "and no default route to fall back on."
                ),
                evidence=m.group(0),
            )
        )

    return findings


def check_acl_misconfig(text: str) -> List[RuleFinding]:
    """Detect ACLs lacking a trailing permit (implicit deny-all) or unapplied to any interface."""
    findings: List[RuleFinding] = []

    # Find each named/numbered ACL block and inspect its statement lines.
    for acl_match in re.finditer(
        r"(?:Extended|Standard) IP access list (\S+)\n((?:\s+\d+.*\n?)+)",
        text,
        re.IGNORECASE,
    ):
        acl_name = acl_match.group(1)
        body = acl_match.group(2)
        lines = [ln.strip() for ln in body.strip().splitlines() if ln.strip()]
        has_permit_any_any = any(re.search(r"permit\s+ip\s+any\s+any", ln, re.IGNORECASE) for ln in lines)
        has_any_permit = any(re.search(r"\bpermit\b", ln, re.IGNORECASE) for ln in lines)

        if not has_any_permit:
            findings.append(
                RuleFinding(
                    rule_id="ACL_MISCONFIG",
                    title=f"ACL '{acl_name}' has no permit statements",
                    severity="Critical",
                    description=(
                        f"Access list {acl_name} contains only deny statements. Combined with "
                        "the implicit 'deny any any' at the end of every ACL, this blocks all "
                        "traffic that matches the list, which is rarely the intent."
                    ),
                    evidence="\n".join(lines),
                )
            )
        elif not has_permit_any_any and len(lines) <= 2:
            findings.append(
                RuleFinding(
                    rule_id="ACL_MISCONFIG",
                    title=f"ACL '{acl_name}' may be missing a catch-all permit",
                    severity="Medium",
                    description=(
                        f"Access list {acl_name} has specific deny entries but no trailing "
                        "'permit ip any any'. Remember every ACL ends with an implicit deny, "
                        "so unmatched traffic will silently be dropped."
                    ),
                    evidence="\n".join(lines),
                )
            )

    # Detect ACL defined but never applied to an interface
    if re.search(r"Inbound\s+access list is not set", text, re.IGNORECASE) and re.search(
        r"Outgoing\s+access list is not set", text, re.IGNORECASE
    ):
        if re.search(r"access list \S+", text, re.IGNORECASE) or re.search(
            r"access-list \d+", text, re.IGNORECASE
        ):
            findings.append(
                RuleFinding(
                    rule_id="ACL_MISCONFIG",
                    title="ACL exists but is not applied to any interface",
                    severity="High",
                    description=(
                        "An access list was found in the configuration/output, but the "
                        "interface being inspected shows no inbound or outgoing access list "
                        "set. It must be applied with 'ip access-group <name|number> in|out'."
                    ),
                    evidence="Inbound access list is not set / Outgoing access list is not set",
                )
            )

    return findings


def check_nat_misconfig(text: str) -> List[RuleFinding]:
    """Detect NAT interfaces not marked inside/outside, missing overload, or pool exhaustion."""
    findings: List[RuleFinding] = []

    has_nat_config = re.search(r"ip nat (inside|outside) source", text, re.IGNORECASE) or re.search(
        r"ip nat inside source static", text, re.IGNORECASE
    )
    has_inside_iface = re.search(r"\bip nat inside\b", text, re.IGNORECASE)
    has_outside_iface = re.search(r"\bip nat outside\b", text, re.IGNORECASE)

    if has_nat_config and not (has_inside_iface and has_outside_iface):
        findings.append(
            RuleFinding(
                rule_id="NAT_MISCONFIG",
                title="NAT rule defined without inside/outside interface roles",
                severity="High",
                description=(
                    "A NAT translation rule is configured, but one or both of "
                    "'ip nat inside' / 'ip nat outside' were not found applied to any "
                    "interface. Without both roles assigned, NAT will never trigger."
                ),
                evidence="ip nat inside/outside interface designation missing",
            )
        )

    if re.search(r"ip nat inside source list \S+ interface \S+", text, re.IGNORECASE) and not re.search(
        r"overload", text, re.IGNORECASE
    ):
        findings.append(
            RuleFinding(
                rule_id="NAT_MISCONFIG",
                title="Dynamic NAT missing 'overload' (PAT) keyword",
                severity="Medium",
                description=(
                    "A dynamic NAT rule bound to an interface address is configured without "
                    "the 'overload' keyword, which limits translation to one internal host "
                    "at a time instead of allowing many hosts to share the address via PAT."
                ),
                evidence="ip nat inside source list ... interface ... (no overload)",
            )
        )

    for m in re.finditer(
        r"%NAT-\d-ADDR_ALLOC_FAILURE:.*", text, re.IGNORECASE
    ):
        findings.append(
            RuleFinding(
                rule_id="NAT_MISCONFIG",
                title="NAT address pool exhausted",
                severity="Medium",
                description=(
                    "The NAT pool has run out of available addresses/ports for new "
                    "translations. Enlarge the pool or move to PAT overload."
                ),
                evidence=m.group(0),
            )
        )

    return findings


def check_missing_dns(text: str) -> List[RuleFinding]:
    """Detect missing DNS server configuration on router or client."""
    findings: List[RuleFinding] = []

    if re.search(r"DNS Servers[.\s:]+0\.0\.0\.0", text, re.IGNORECASE):
        findings.append(
            RuleFinding(
                rule_id="MISSING_DNS",
                title="Client has no DNS server configured",
                severity="Medium",
                description=(
                    "The client's DNS server address is 0.0.0.0, meaning it received no "
                    "usable DNS server, most likely because the DHCP pool does not include "
                    "a 'dns-server' option."
                ),
                evidence="DNS Servers . . . : 0.0.0.0",
            )
        )

    if re.search(r"domain server \(255\.255\.255\.255\)", text, re.IGNORECASE) or re.search(
        r"Unrecognized host or address, not found", text, re.IGNORECASE
    ):
        findings.append(
            RuleFinding(
                rule_id="MISSING_DNS",
                title="Router has no DNS server configured",
                severity="Low",
                description=(
                    "The router attempted to resolve a hostname but has no 'ip name-server' "
                    "configured, so it broadcasts to 255.255.255.255 and fails."
                ),
                evidence="Translating ... domain server (255.255.255.255)",
            )
        )

    return findings


# ---------------------------------------------------------------------------
# Aggregation and scoring
# ---------------------------------------------------------------------------

# Ordered list of all rule-check functions. Order affects the order findings
# are reported in, not correctness.
_ALL_CHECKS = [
    check_duplicate_ip,
    check_wrong_subnet_mask,
    check_interface_down,
    check_gateway_mismatch,
    check_missing_vlan,
    check_missing_trunk,
    check_missing_route,
    check_acl_misconfig,
    check_nat_misconfig,
    check_missing_dns,
]


def run_rule_checks(text: str) -> List[RuleFinding]:
    """Run every registered rule-check function against `text` and return the combined findings list."""
    findings: List[RuleFinding] = []
    for check in _ALL_CHECKS:
        try:
            findings.extend(check(text))
        except Exception:
            # A single malformed rule must never crash the whole checker; skip it.
            continue
    return findings


def compute_health_score(findings: List[RuleFinding]) -> int:
    """
    Compute an overall health score from 0 (severely broken) to 100 (perfectly healthy).

    Score starts at 100 and is reduced by each finding's severity weight, with
    diminishing penalty for many findings of the same severity (to avoid
    unrealistically flooring the score when a single root cause triggers many
    matching lines).
    """
    if not findings:
        return 100

    score = 100.0
    # Count how many findings of each severity we've already applied, so
    # repeated findings of the same severity have decreasing marginal impact.
    seen_count = {sev: 0 for sev in _SEVERITY_ORDER}

    # Sort worst-first so the biggest deductions are applied while the score
    # still has "room" to fall, then diminish.
    ordered = sorted(
        findings, key=lambda f: _SEVERITY_ORDER.index(f.severity) if f.severity in _SEVERITY_ORDER else 99
    )

    for f in ordered:
        sev = f.severity if f.severity in _SEVERITY_WEIGHT else "Medium"
        base_weight = _SEVERITY_WEIGHT[sev]
        occurrence = seen_count[sev]
        # Each additional finding of the same severity counts for half as much
        # as the previous one (geometric decay), so 1st=full, 2nd=half, 3rd=quarter...
        decayed_weight = base_weight / (2 ** occurrence)
        score -= decayed_weight
        seen_count[sev] += 1

    return max(0, min(100, round(score)))


def compute_risk_level(health_score: int, findings: List[RuleFinding]) -> str:
    """
    Translate a health score (and the presence of any Critical finding) into an
    overall risk level string: Critical, High, Medium, or Low.
    """
    has_critical = any(f.severity == "Critical" for f in findings)

    if has_critical or health_score < 40:
        return "Critical"
    if health_score < 65:
        return "High"
    if health_score < 85:
        return "Medium"
    return "Low"


# ---------------------------------------------------------------------------
# Demo / manual test entry point
# ---------------------------------------------------------------------------

_DEMO_SHOW_OUTPUT = """
Router#show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     192.168.1.1     YES manual administratively down  down
GigabitEthernet0/1     192.168.10.1    YES manual up                    up
Vlan10                 192.168.10.254  YES manual up                    up

Router#show run | include ip address
 ip address 192.168.10.1 255.255.255.0
 ip address 192.168.10.5 255.255.0.0

Router#show ip route
Gateway of last resort is not set

C    192.168.10.0/24 is directly connected, GigabitEthernet0/1

PC>ipconfig /all
Default Gateway . . . . . . . . : 192.168.1.254
DNS Servers . . . . . . . . . . : 0.0.0.0

Router#show access-lists
Extended IP access list BLOCK_WEB
    10 deny tcp any host 192.168.1.100 eq 80

Router#show ip nat translations
(no entries)

Router#show run | include ip nat
ip nat inside source list 1 interface GigabitEthernet0/0

%DHCP-4-DUPADDR: Detected duplicate IP address 192.168.10.5 on interface FastEthernet0/2
%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on FastEthernet0/24 (1), with Switch2 FastEthernet0/1 (99)
"""


def _print_report(findings: List[RuleFinding]) -> None:
    health = compute_health_score(findings)
    risk = compute_risk_level(health, findings)

    print("=" * 70)
    print("NetSage Rule Checker - Demo Report")
    print("=" * 70)
    print(f"Health Score : {health}/100")
    print(f"Risk Level   : {risk}")
    print(f"Findings     : {len(findings)}")
    print("-" * 70)

    if not findings:
        print("No issues detected.")
    else:
        for i, f in enumerate(findings, 1):
            print(f"\n{i}. {f}")

    print("=" * 70)


if __name__ == "__main__":
    demo_findings = run_rule_checks(_DEMO_SHOW_OUTPUT)
    _print_report(demo_findings)
