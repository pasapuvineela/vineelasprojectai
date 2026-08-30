CREATE TABLE "cases" (
	"id" serial PRIMARY KEY,
	"title" text NOT NULL,
	"symptom" text NOT NULL,
	"show_output" text NOT NULL,
	"topology_notes" text DEFAULT '',
	"root_cause" text NOT NULL,
	"fix" text NOT NULL,
	"osi_layer" integer NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"device_type" text DEFAULT 'Router',
	"protocol" text DEFAULT '',
	"is_seed" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "correction_logs" (
	"id" serial PRIMARY KEY,
	"diagnosis_id" integer NOT NULL,
	"reviewer_id" integer NOT NULL,
	"action" text NOT NULL,
	"ai_prediction" jsonb NOT NULL,
	"human_correction" jsonb,
	"final_decision" jsonb NOT NULL,
	"comment" text DEFAULT '',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" serial PRIMARY KEY,
	"case_id" integer,
	"engineer_id" integer NOT NULL,
	"symptom" text NOT NULL,
	"show_output" text NOT NULL,
	"topology_notes" text DEFAULT '',
	"root_cause" text NOT NULL,
	"osi_layer" integer NOT NULL,
	"osi_layer_name" text NOT NULL,
	"confidence_score" integer NOT NULL,
	"confidence_label" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"evidence_used" jsonb NOT NULL,
	"recommended_commands" jsonb NOT NULL,
	"fix_steps" jsonb NOT NULL,
	"reasoning" jsonb NOT NULL,
	"similar_case_ids" jsonb NOT NULL,
	"rule_findings" jsonb NOT NULL,
	"health_score" integer NOT NULL,
	"risk_level" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '',
	"diagnosis_id" integer,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY,
	"user_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'engineer' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "correction_logs" ADD CONSTRAINT "correction_logs_diagnosis_id_diagnoses_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id");--> statement-breakpoint
ALTER TABLE "correction_logs" ADD CONSTRAINT "correction_logs_reviewer_id_users_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_case_id_cases_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id");--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_engineer_id_users_id_fkey" FOREIGN KEY ("engineer_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_diagnosis_id_diagnoses_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");