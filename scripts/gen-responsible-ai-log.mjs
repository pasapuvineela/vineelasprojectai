import fs from 'fs';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  BorderStyle,
  ShadingType,
} from 'docx';

const headerCellShading = { fill: '1F4E78', type: ShadingType.CLEAR, color: 'auto' };

function headerCell(text) {
  return new TableCell({
    shading: headerCellShading,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: 'FFFFFF' })],
      }),
    ],
  });
}

function bodyCell(text) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: String(text) })] })],
  });
}

const columns = [
  'Diagnosis ID',
  'AI Prediction (Root Cause)',
  'Reviewer',
  'Action',
  'Human Correction',
  'Final Decision',
  'Timestamp',
];

const rows = [
  [
    'DX-10231',
    'VLAN mismatch on trunk port Gi0/1',
    'M. Alvarez',
    'Accept',
    'None',
    'VLAN mismatch confirmed on Gi0/1',
    '2026-08-11 09:14',
  ],
  [
    'DX-10247',
    'DHCP failure: exhausted pool on VLAN 20',
    'J. Kim',
    'Edit',
    'Pool exhaustion was on VLAN 30, not 20',
    'DHCP pool exhaustion on VLAN 30',
    '2026-08-12 14:02',
  ],
  [
    'DX-10259',
    'ACL blocking ICMP between R1 and R2',
    'S. Patel',
    'Accept',
    'None',
    'ACL 101 blocks ICMP as predicted',
    '2026-08-13 10:47',
  ],
  [
    'DX-10262',
    'NAT overload misconfiguration on outside interface',
    'M. Alvarez',
    'Reject',
    'Issue was static NAT overlap, not overload config',
    'Static NAT overlap on 203.0.113.5',
    '2026-08-14 16:23',
  ],
  [
    'DX-10275',
    'STP loop caused by missing BPDU guard',
    'J. Kim',
    'Accept',
    'None',
    'Confirmed STP loop, BPDU guard absent',
    '2026-08-16 08:55',
  ],
  [
    'DX-10281',
    'DNS resolution failure due to incorrect forwarder',
    'S. Patel',
    'Edit',
    'Forwarder IP correct; issue was firewall blocking port 53',
    'DNS failure caused by port 53 block',
    '2026-08-18 11:31',
  ],
  [
    'DX-10296',
    'Routing error: missing default route on R3',
    'M. Alvarez',
    'Accept',
    'None',
    'Default route missing on R3 confirmed',
    '2026-08-20 13:09',
  ],
  [
    'DX-10304',
    'Trunk misconfiguration: native VLAN mismatch',
    'J. Kim',
    'Accept',
    'None',
    'Native VLAN mismatch on trunk confirmed',
    '2026-08-21 15:42',
  ],
];

const table = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ children: columns.map(headerCell) }),
    ...rows.map((r) => new TableRow({ children: r.map(bodyCell) })),
  ],
});

const doc = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          text: 'Responsible AI Correction Log',
          heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
          children: [
            new TextRun({
              text:
                'This document logs human review and correction of AI-generated network diagnoses produced by NetSage AI. ' +
                'Each entry records the AI system\'s predicted root cause for a reported Cisco Packet Tracer network issue, ' +
                'the reviewer who evaluated it, and the action taken: Accept (AI prediction confirmed as-is), Edit (AI prediction ' +
                'partially correct and revised by the reviewer), or Reject (AI prediction overturned in favor of the reviewer\'s ' +
                'own diagnosis). The Final Decision column reflects the diagnosis ultimately recorded for the case, supporting ' +
                'transparency, accountability, and continuous improvement of the underlying AI model.',
            }),
          ],
        }),
        new Paragraph({ text: '' }),
        table,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(new URL('../responsible_ai_log.docx', import.meta.url).pathname, buffer);
console.log('Wrote responsible_ai_log.docx');
