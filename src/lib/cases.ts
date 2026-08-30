// src/lib/cases.ts
// Server functions for the Packet Tracer case library.
import { createServerFn } from "@tanstack/react-start";
import { and, eq, like } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cases } from "../../db/schema.js";
import { getSessionUser, requireRole } from "./auth.js";

export const listCasesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data?: {
      search?: string;
      deviceType?: string;
      protocol?: string;
      osiLayer?: number;
      category?: string;
    }) => data ?? {},
  )
  .handler(async ({ data }) => {
    const conditions = [];

    if (data.search) {
      const term = `%${data.search}%`;
      conditions.push(like(cases.symptom, term));
    }
    if (data.deviceType) conditions.push(eq(cases.deviceType, data.deviceType));
    if (data.protocol) conditions.push(eq(cases.protocol, data.protocol));
    if (typeof data.osiLayer === "number") conditions.push(eq(cases.osiLayer, data.osiLayer));
    if (data.category) conditions.push(eq(cases.category, data.category));

    const query = db.select().from(cases);
    const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query;

    return rows.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  });

export const getCaseFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const [row] = await db.select().from(cases).where(eq(cases.id, data.id));
    return row ?? null;
  });

export const createCaseFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      title: string;
      symptom: string;
      showOutput: string;
      topologyNotes?: string;
      rootCause: string;
      fix: string;
      osiLayer: number;
      severity: string;
      category: string;
      deviceType?: string;
      protocol?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!requireRole(user, ["admin"])) {
      throw new Error("Only admins may add cases to the library.");
    }

    const [row] = await db
      .insert(cases)
      .values({
        title: data.title,
        symptom: data.symptom,
        showOutput: data.showOutput,
        topologyNotes: data.topologyNotes ?? "",
        rootCause: data.rootCause,
        fix: data.fix,
        osiLayer: data.osiLayer,
        severity: data.severity,
        category: data.category,
        deviceType: data.deviceType ?? "Router",
        protocol: data.protocol ?? "",
        isSeed: false,
        createdBy: user!.id,
      })
      .returning();

    return row;
  });
