ALTER TABLE "transactions" ADD COLUMN "original_amount" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "original_currency" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "currency" text DEFAULT 'UZS' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "voice_language" text DEFAULT 'auto' NOT NULL;