ALTER TABLE "strategies" ADD COLUMN "allow_entry" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "allow_exit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "allow_modify" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "webhook_secret" text;