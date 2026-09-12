CREATE TABLE "signal_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"signal_id" text NOT NULL,
	"account_id" text NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"message" text,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "trading_halts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"reason" text NOT NULL,
	"halted_by" text,
	"halted_at" timestamp DEFAULT now() NOT NULL,
	"lifted_at" timestamp,
	"lifted_by" text
);
--> statement-breakpoint
ALTER TABLE "signal_dispatches" ADD CONSTRAINT "signal_dispatches_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signal_dispatches" ADD CONSTRAINT "signal_dispatches_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_halts" ADD CONSTRAINT "trading_halts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_halts" ADD CONSTRAINT "trading_halts_halted_by_user_id_fk" FOREIGN KEY ("halted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_halts" ADD CONSTRAINT "trading_halts_lifted_by_user_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "signal_dispatches_signal_account_uidx" ON "signal_dispatches" USING btree ("signal_id","account_id");--> statement-breakpoint
CREATE INDEX "signal_dispatches_status_idx" ON "signal_dispatches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trading_halts_workspace_lifted_idx" ON "trading_halts" USING btree ("workspace_id","lifted_at");