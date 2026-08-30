// src/lib/reports.ts
// DB-facing helpers for CSV/XLSX/PDF exports. This file only fetches and
// shapes data + builds plain-text CSV; it deliberately avoids importing
// exceljs/pdf-lib. Actual XLSX/PDF file generation happens in API routes
// under src/routes/api/ (built separately), which should import
// `buildCasesRows` / `buildDiagnosesRows` from here to get shaped data.
import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cases, diagnoses } from "../../db/schema.js";
import { getSessionUser, requireRole } from "./auth.js";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

export async function buildCasesRows() {
  return db.select().from(cases).orderBy(desc(cases.createdAt));
}

export async function buildDiagnosesRows() {
  return db.select().from(diagnoses).orderBy(desc(diagnoses.createdAt));
}

export const exportCasesCsvFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!requireRole(user, ["admin"])) {
    throw new Error("Only admins may export the case library.");
  }

  const rows = await buildCasesRows();
  const headers = [
    "id",
    "title",
    "symptom",
    "showOutput",
    "topologyNotes",
    "rootCause",
    "fix",
    "osiLayer",
    "severity",
    "category",
    "deviceType",
    "protocol",
    "isSeed",
    "createdAt",
  ];
  const body = rows.map((r) => [
    r.id,
    r.title,
    r.symptom,
    r.showOutput,
    r.topologyNotes,
    r.rootCause,
    r.fix,
    r.osiLayer,
    r.severity,
    r.category,
    r.deviceType,
    r.protocol,
    r.isSeed,
    r.createdAt,
  ]);

  return toCsv(headers, body);
});

export const exportDiagnosesCsvFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!requireRole(user, ["admin"])) {
    throw new Error("Only admins may export diagnoses.");
  }

  const rows = await buildDiagnosesRows();
  const headers = [
    "id",
    "engineerId",
    "symptom",
    "rootCause",
    "osiLayer",
    "osiLayerName",
    "confidenceScore",
    "confidenceLabel",
    "severity",
    "category",
    "healthScore",
    "riskLevel",
    "status",
    "createdAt",
  ];
  const body = rows.map((r) => [
    r.id,
    r.engineerId,
    r.symptom,
    r.rootCause,
    r.osiLayer,
    r.osiLayerName,
    r.confidenceScore,
    r.confidenceLabel,
    r.severity,
    r.category,
    r.healthScore,
    r.riskLevel,
    r.status,
    r.createdAt,
  ]);

  return toCsv(headers, body);
});
