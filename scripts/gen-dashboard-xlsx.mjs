import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
workbook.creator = 'NetSage AI';
workbook.created = new Date();

const headerFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F4E78' },
};
const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

// --- Overview sheet ---
const overview = workbook.addWorksheet('Overview');
overview.columns = [
  { header: 'KPI', key: 'kpi', width: 30 },
  { header: 'Value', key: 'value', width: 20 },
];
styleHeaderRow(overview.getRow(1));
overview.addRows([
  { kpi: 'Total Cases', value: 4821 },
  { kpi: 'AI Accuracy %', value: 92.6 },
  { kpi: 'Human Corrections', value: 356 },
  { kpi: 'Critical Issues', value: 47 },
  { kpi: 'Open Cases', value: 213 },
  { kpi: 'Resolved Cases', value: 4608 },
]);

// --- Issue Distribution sheet ---
const issues = workbook.addWorksheet('Issue Distribution');
issues.columns = [
  { header: 'Category', key: 'category', width: 20 },
  { header: 'Count', key: 'count', width: 15 },
  { header: '% of Total', key: 'pct', width: 15 },
];
styleHeaderRow(issues.getRow(1));
const issueData = [
  ['VLAN', 812, 16.8],
  ['DHCP', 645, 13.4],
  ['DNS', 398, 8.3],
  ['Routing', 720, 14.9],
  ['ACL', 511, 10.6],
  ['NAT', 429, 8.9],
  ['Trunk', 567, 11.8],
  ['STP', 384, 8.0],
  ['Wireless', 355, 7.3],
];
issueData.forEach(([category, count, pct]) => issues.addRow({ category, count, pct }));

// --- Severity Breakdown sheet ---
const severity = workbook.addWorksheet('Severity Breakdown');
severity.columns = [
  { header: 'Severity', key: 'severity', width: 15 },
  { header: 'Count', key: 'count', width: 15 },
];
styleHeaderRow(severity.getRow(1));
[
  ['Critical', 47],
  ['High', 389],
  ['Medium', 1642],
  ['Low', 2743],
].forEach(([sev, count]) => severity.addRow({ severity: sev, count }));

// --- AI Accuracy Trend sheet (weekly, ~12 rows) ---
const trend = workbook.addWorksheet('AI Accuracy Trend');
trend.columns = [
  { header: 'Week Start', key: 'date', width: 18 },
  { header: 'AI Accuracy %', key: 'accuracy', width: 18 },
];
styleHeaderRow(trend.getRow(1));
const startDate = new Date('2026-06-08');
const accuracyValues = [88.2, 88.9, 89.4, 90.1, 90.5, 91.0, 91.3, 91.8, 92.0, 92.2, 92.4, 92.6];
for (let i = 0; i < 12; i++) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + i * 7);
  trend.addRow({ date: d.toISOString().slice(0, 10), accuracy: accuracyValues[i] });
}

await workbook.xlsx.writeFile(new URL('../dashboard.xlsx', import.meta.url).pathname);
console.log('Wrote dashboard.xlsx');
