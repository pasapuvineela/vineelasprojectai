// db/schema.ts
// Drizzle ORM schema for NetSage AI. All application persistence lives here.
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Users & sessions
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  // scrypt hash stored as "salt:hash" hex string
  passwordHash: text("password_hash").notNull(),
  role: text().notNull().default("engineer"), // "engineer" | "admin"
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text().primaryKey(), // random session token
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// Packet Tracer case library (seeded reference cases + user-submitted cases)
// ---------------------------------------------------------------------------
export const cases = pgTable("cases", {
  id: serial().primaryKey(),
  title: text().notNull(),
  symptom: text().notNull(),
  showOutput: text("show_output").notNull(),
  topologyNotes: text("topology_notes").default(""),
  rootCause: text("root_cause").notNull(),
  fix: text().notNull(),
  osiLayer: integer("osi_layer").notNull(),
  severity: text().notNull(), // Critical | High | Medium | Low
  category: text().notNull(), // VLAN | DHCP | DNS | Routing | ACL | NAT | Trunk | STP | Wireless
  deviceType: text("device_type").default("Router"),
  protocol: text().default(""),
  isSeed: boolean("is_seed").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// Diagnoses produced by the AI engine, pending human review
// ---------------------------------------------------------------------------
export const diagnoses = pgTable("diagnoses", {
  id: serial().primaryKey(),
  caseId: integer("case_id").references(() => cases.id),
  engineerId: integer("engineer_id").notNull().references(() => users.id),
  symptom: text().notNull(),
  showOutput: text("show_output").notNull(),
  topologyNotes: text("topology_notes").default(""),

  rootCause: text("root_cause").notNull(),
  osiLayer: integer("osi_layer").notNull(),
  osiLayerName: text("osi_layer_name").notNull(),
  confidenceScore: integer("confidence_score").notNull(), // 0-100
  confidenceLabel: text("confidence_label").notNull(), // Low | Medium | High
  severity: text().notNull(), // Critical | High | Medium | Low
  category: text().notNull(),

  evidenceUsed: jsonb("evidence_used").notNull(), // string[]
  recommendedCommands: jsonb("recommended_commands").notNull(), // string[]
  fixSteps: jsonb("fix_steps").notNull(), // string[]
  reasoning: jsonb().notNull(), // string[] reasoning trail
  similarCaseIds: jsonb("similar_case_ids").notNull(), // number[]

  ruleFindings: jsonb("rule_findings").notNull(), // RuleFinding[]
  healthScore: integer("health_score").notNull(), // 0-100
  riskLevel: text("risk_level").notNull(), // Critical | High | Medium | Low

  status: text().notNull().default("pending_review"), // pending_review | accepted | edited | rejected
  createdAt: timestamp("created_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// Human review / correction log ("Responsible AI" audit trail)
// ---------------------------------------------------------------------------
export const correctionLogs = pgTable("correction_logs", {
  id: serial().primaryKey(),
  diagnosisId: integer("diagnosis_id").notNull().references(() => diagnoses.id),
  reviewerId: integer("reviewer_id").notNull().references(() => users.id),
  action: text().notNull(), // accepted | edited | rejected
  aiPrediction: jsonb("ai_prediction").notNull(), // snapshot of AI output at review time
  humanCorrection: jsonb("human_correction"), // edited fields, if any
  finalDecision: jsonb("final_decision").notNull(), // resulting root cause/fix after review
  comment: text().default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const notifications = pgTable("notifications", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text().notNull(), // critical_issue | review_pending | new_diagnosis
  title: text().notNull(),
  body: text().default(""),
  diagnosisId: integer("diagnosis_id").references(() => diagnoses.id),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
