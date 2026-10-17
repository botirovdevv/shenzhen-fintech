CREATE TABLE "card_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"card_id" text NOT NULL,
	"lithic_token" text NOT NULL,
	"amount" integer NOT NULL,
	"original_amount" integer,
	"original_currency" text,
	"merchant" text NOT NULL,
	"mcc" text,
	"category" text NOT NULL,
	"result" text NOT NULL,
	"reason" text NOT NULL,
	"transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_authorizations_lithic_token_unique" UNIQUE("lithic_token")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"lithic_token" text NOT NULL,
	"network" text NOT NULL,
	"last_four" text NOT NULL,
	"exp_month" text NOT NULL,
	"exp_year" text NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"block_over_budget" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "cards_lithic_token_unique" UNIQUE("lithic_token")
);
--> statement-breakpoint
ALTER TABLE "card_authorizations" ADD CONSTRAINT "card_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_authorizations" ADD CONSTRAINT "card_authorizations_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_authorizations" ADD CONSTRAINT "card_authorizations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_auth_user_time_idx" ON "card_authorizations" USING btree ("user_id","created_at");