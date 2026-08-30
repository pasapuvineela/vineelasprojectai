// src/lib/diagnoses.ts
// Server functions for creating and reviewing AI diagnoses.
import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { cases, correctionLogs, diagnoses, notifications, users } from "../../db/schema.js";
import { getSessionUser, requireRole } from "./auth.js";
import { diagnose } from "./ai/diagnose.js";

export const createDiagnosisFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { symptom: string; showOutput: string; topologyNotes?: string }) => data,
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("You must be signed in to run a diagnosis.");

    const caseLibrary = await db.select().from(cases);

    const result = diagnose(
      {
        symptom: data.symptom,
        showOutput: data.showOutput,
        topologyNotes: data.topologyNotes ?? "",
      },
      caseLibrary,
    );

    const [diagnosis] = await db
      .insert(diagnoses)
      .values({
        engineerId: user.id,
        symptom: data.symptom,
        showOutput: data.showOutput,
        topologyNotes: data.topologyNotes ?? "",
        rootCause: result.rootCause,
        osiLayer: result.osiLayer,
        osiLayerName: result.osiLayerName,
        confidenceScore: result.confidenceScore,
        confidenceLabel: result.confidenceLabel,
        severity: result.severity,
        category: result.category,
        evidenceUsed: result.evidenceUsed,
        recommendedCommands: result.recommendedCommands,
        fixSteps: result.fixSteps,
        reasoning: result.reasoning,
        similarCaseIds: result.similarCaseIds,
        ruleFindings: result.ruleFindings,
        healthScore: result.healthScore,
        riskLevel: result.riskLevel,
        status: "pending_review",
      })
      .returning();

    if (result.severity === "Critical" || result.severity === "High") {
      const admins = await db.select().from(users).where(eq(users.role, "admin"));
      if (admins.length > 0) {
        await db.insert(notifications).values(
          admins.map((admin) => ({
            userId: admin.id,
            type: "new_diagnosis" as const,
            title: `New ${result.severity} severity diagnosis pending review`,
            body: `${result.rootCause} (${result.category})`,
            diagnosisId: diagnosis.id,
          })),
        );
      }
    }

    return diagnosis;
  });

export const listMyDiagnosesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) throw new Error("You must be signed in.");

  return db
    .select()
    .from(diagnoses)
    .where(eq(diagnoses.engineerId, user.id))
    .orderBy(desc(diagnoses.createdAt));
});

export const listAllDiagnosesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!requireRole(user, ["admin"])) {
    throw new Error("Only admins may view all diagnoses.");
  }

  return db.select().from(diagnoses).orderBy(desc(diagnoses.createdAt));
});

export const getDiagnosisFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw new Error("You must be signed in.");

    const [row] = await db.select().from(diagnoses).where(eq(diagnoses.id, data.id));
    if (!row) return null;

    if (row.engineerId !== user.id && !requireRole(user, ["admin"])) {
      throw new Error("You do not have access to this diagnosis.");
    }

    return row;
  });

type DiagnosisRecord = typeof diagnoses.$inferSelect;

export const reviewDiagnosisFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      diagnosisId: number;
      action: "accept" | "edit" | "reject";
      comment?: string;
      humanCorrection?: Partial<DiagnosisRecord>;
    }) => data,
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!requireRole(user, ["admin"])) {
      throw new Error("Only admins may review diagnoses.");
    }

    const [existing] = await db.select().from(diagnoses).where(eq(diagnoses.id, data.diagnosisId));
    if (!existing) throw new Error("Diagnosis not found.");

    const statusMap = { accept: "accepted", edit: "edited", reject: "rejected" } as const;
    const newStatus = statusMap[data.action];

    const finalDecision =
      data.action === "edit" && data.humanCorrection
        ? { ...existing, ...data.humanCorrection }
        : existing;

    await db.insert(correctionLogs).values({
      diagnosisId: existing.id,
      reviewerId: user!.id,
      action: newStatus,
      aiPrediction: existing,
      humanCorrection: data.humanCorrection ?? null,
      finalDecision,
      comment: data.comment ?? "",
    });

    const updateValues: Partial<DiagnosisRecord> = { status: newStatus };
    if (data.action === "edit" && data.humanCorrection) {
      Object.assign(updateValues, data.humanCorrection);
    }

    const [updated] = await db
      .update(diagnoses)
      .set(updateValues)
      .where(eq(diagnoses.id, existing.id))
      .returning();

    return updated;
  });
