// db/seed.ts
// Seeds demo users (one admin, one engineer) and the case library from cases.csv.
// Run with: npx tsx db/seed.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "./index.js";
import { users, cases } from "./schema.js";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Minimal RFC4180-ish CSV parser (handles quoted fields with embedded commas/quotes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // ignore
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

async function main() {
  console.log("Seeding NetSage AI database...");

  // --- Demo users ---
  const adminEmail = "admin@netsage.ai";
  const engineerEmail = "engineer@netsage.ai";

  const existing = await db.select().from(users);
  const existingEmails = new Set(existing.map((u) => u.email));

  const toInsertUsers = [];
  if (!existingEmails.has(adminEmail)) {
    toInsertUsers.push({
      name: "Ava Administrator",
      email: adminEmail,
      passwordHash: hashPassword("Admin123!"),
      role: "admin",
    });
  }
  if (!existingEmails.has(engineerEmail)) {
    toInsertUsers.push({
      name: "Eli Engineer",
      email: engineerEmail,
      passwordHash: hashPassword("Engineer123!"),
      role: "engineer",
    });
  }
  if (toInsertUsers.length > 0) {
    await db.insert(users).values(toInsertUsers);
    console.log(`Inserted ${toInsertUsers.length} demo user(s).`);
  } else {
    console.log("Demo users already exist, skipping.");
  }

  // --- Case library from cases.csv ---
  const existingCases = await db.select().from(cases);
  if (existingCases.length > 0) {
    console.log(`Cases table already has ${existingCases.length} rows, skipping case import.`);
  } else {
    const csvPath = path.resolve(process.cwd(), "cases.csv");
    if (!fs.existsSync(csvPath)) {
      console.warn(`cases.csv not found at ${csvPath}, skipping case import.`);
    } else {
      const text = fs.readFileSync(csvPath, "utf-8");
      const rows = parseCsv(text);
      const [header, ...data] = rows;
      const idx = (name: string) => header.indexOf(name);
      const iSymptom = idx("symptom");
      const iShowOutput = idx("show_output");
      const iRootCause = idx("root_cause");
      const iFix = idx("fix");
      const iOsiLayer = idx("osi_layer");
      const iSeverity = idx("severity");
      const iCategory = idx("category");

      const caseRows = data
        .filter((r) => r.length >= header.length && r[iSymptom])
        .map((r) => ({
          title: r[iSymptom].slice(0, 80),
          symptom: r[iSymptom],
          showOutput: r[iShowOutput],
          topologyNotes: "",
          rootCause: r[iRootCause],
          fix: r[iFix],
          osiLayer: parseInt(r[iOsiLayer], 10) || 1,
          severity: r[iSeverity],
          category: r[iCategory],
          deviceType: "Router/Switch",
          protocol: "",
          isSeed: true,
        }));

      if (caseRows.length > 0) {
        await db.insert(cases).values(caseRows);
        console.log(`Inserted ${caseRows.length} case(s) from cases.csv.`);
      }
    }
  }

  console.log("Seeding complete.");
  console.log(`Demo admin login: ${adminEmail} / Admin123!`);
  console.log(`Demo engineer login: ${engineerEmail} / Engineer123!`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
