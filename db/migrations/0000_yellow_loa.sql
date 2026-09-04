CREATE TYPE "public"."broker_account_status" AS ENUM('connected', 'disconnected', 'needs_reauth', 'syncing', 'whitelist_pending');--> statement-breakpoint
CREATE TYPE "public"."broker_provider" AS ENUM('metaapi', 'zerodha', 'dhan', 'motilal');--> statement-breakpoint
CREATE TYPE "public"."execution_type" AS ENUM('bought', 'sold');--> statement-breakpoint
CREATE TYPE "public"."market" AS ENUM('forex', 'indian_options', 'indian_equity');--> statement-breakpoint
CREATE TYPE "public"."pending_limit_order_status" AS ENUM('pending', 'filled', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."position_side" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."position_sizing_method" AS ENUM('FIXED_PERCENTAGE', 'FIXED_QUANTITY', 'FIXED_RISK_AMOUNT');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."stop_loss_type" AS ENUM('PERCENTAGE', 'PIPS', 'PRICE');--> statement-breakpoint
CREATE TYPE "public"."strategy_rule_type" AS ENUM('trailing', 'partial');--> statement-breakpoint
CREATE TYPE "public"."signal_action" AS ENUM('BUY', 'SELL', 'CLOSELONG', 'CLOSESHORT', 'MODIFY', 'CLOSELONGPARTIAL', 'CLOSESHORTPARTIAL', 'CLOSESHORTBUY', 'CLOSELONGSELL', 'CLOSESHORTSELL', 'CLOSELONGBUY');--> statement-breakpoint
CREATE TYPE "public"."signal_source" AS ENUM('tradingview', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."signal_status" AS ENUM('received', 'rejected', 'pending_confirmation');--> statement-breakpoint
CREATE TYPE "public"."signal_value_type" AS ENUM('PRICE', 'POINTS', 'PERCENTAGE');--> statement-breakpoint
CREATE TYPE "public"."strategy_handle_type" AS ENUM('AUTO', 'MANUAL', 'BY_STRATEGY');--> statement-breakpoint
CREATE TYPE "public"."strategy_notification_event" AS ENUM('entry', 'partial', 'exit');--> statement-breakpoint
CREATE TYPE "public"."strategy_permission" AS ENUM('view', 'view_execute', 'edit_execute', 'co_owner');--> statement-breakpoint
CREATE TYPE "public"."strategy_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."trailing_type" AS ENUM('EMA', 'ATR', 'LAST_4_CANDLES', 'LAST_CANDLE');--> statement-breakpoint
CREATE TYPE "public"."ai_lane" AS ENUM('routing', 'main_loop', 'deep_synthesis', 'sub_agent', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('groq', 'openai', 'google', 'keiro');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('ok', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."ai_user_memory_source" AS ENUM('inferred', 'stated');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broker_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"provider" "broker_provider" NOT NULL,
	"external_account_id" text NOT NULL,
	"label" text NOT NULL,
	"status" "broker_account_status" DEFAULT 'disconnected' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position_sync_enabled" boolean DEFAULT true NOT NULL,
	"static_ip" text,
	"balance" numeric(18, 2),
	"equity" numeric(18, 2),
	"currency" text DEFAULT 'USD',
	"last_sync_at" timestamp,
	"credentials_encrypted" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "basket_positions" (
	"basket_id" text NOT NULL,
	"position_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baskets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_limit_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"signal_id" text,
	"account_id" text NOT NULL,
	"market" "market" NOT NULL,
	"symbol" text NOT NULL,
	"side" "position_side" NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"limit_price" numeric(18, 6) NOT NULL,
	"external_order_id" text NOT NULL,
	"tag" text,
	"risk_percent" numeric(8, 4),
	"comment" text,
	"basket_id" text,
	"basket_name" text,
	"status" "pending_limit_order_status" DEFAULT 'pending' NOT NULL,
	"result_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deadline_at" timestamp NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "position_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"external_order_id" text,
	"occurred_at" timestamp NOT NULL,
	"type" "execution_type" NOT NULL,
	"side" "position_side" NOT NULL,
	"quantity" numeric(18, 6) NOT NULL,
	"price" numeric(18, 6) NOT NULL,
	"fee" numeric(18, 6) DEFAULT '0',
	"source" text
);
--> statement-breakpoint
CREATE TABLE "position_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"account_id" text NOT NULL,
	"market" "market" NOT NULL,
	"symbol" text NOT NULL,
	"side" "position_side" NOT NULL,
	"entry_price" numeric(18, 6) NOT NULL,
	"exit_price" numeric(18, 6),
	"quantity" numeric(18, 6) NOT NULL,
	"filled_quantity" numeric(18, 6),
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"close_reason" text,
	"pnl" numeric(18, 2),
	"pnl_pct" numeric(8, 4),
	"rr" numeric(8, 4),
	"sl" numeric(18, 6),
	"target" numeric(18, 6),
	"tag" text,
	"comment" text,
	"strategy_id" text,
	"external_position_id" text,
	"is_paper" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_rule_fires" (
	"id" text PRIMARY KEY NOT NULL,
	"position_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"rule_type" "strategy_rule_type" NOT NULL,
	"fired_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"market" "market" NOT NULL,
	"max_risk_pct" numeric(6, 3) DEFAULT '1',
	"max_risk_pips" numeric(10, 2),
	"stop_loss_type" "stop_loss_type" DEFAULT 'PERCENTAGE' NOT NULL,
	"risk_reward_ratio" numeric(6, 2) DEFAULT '2',
	"partial_booking_r" numeric(6, 2) DEFAULT '1',
	"available_capital" numeric(18, 2),
	"sizing_method" "position_sizing_method" DEFAULT 'FIXED_PERCENTAGE' NOT NULL,
	"max_concurrent_positions" numeric(6, 0),
	"max_positions_per_symbol" numeric(6, 0) DEFAULT '1',
	"daily_trade_limit" numeric(6, 0) DEFAULT '10',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"source" "signal_source" NOT NULL,
	"action" "signal_action" NOT NULL,
	"side" "position_side",
	"symbol" text NOT NULL,
	"market" "market" NOT NULL,
	"price" numeric(18, 6),
	"sl" numeric(18, 6),
	"target" numeric(18, 6),
	"value_type" "signal_value_type",
	"tag" text,
	"quantity" numeric(18, 6),
	"status" "signal_status" DEFAULT 'received' NOT NULL,
	"result_message" text,
	"parsed_fields" jsonb,
	"raw_payload" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"market" "market" NOT NULL,
	"handle_type" "strategy_handle_type" DEFAULT 'AUTO' NOT NULL,
	"default_symbol" text,
	"status" "strategy_status" DEFAULT 'active' NOT NULL,
	"cool_down_period" integer,
	"max_triggers_per_day" integer,
	"is_global" boolean DEFAULT false NOT NULL,
	"paper_trading" boolean DEFAULT false NOT NULL,
	"signals_hidden" boolean DEFAULT false NOT NULL,
	"config" jsonb,
	"chart_symbol" text,
	"chart_interval" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_access" (
	"strategy_id" text NOT NULL,
	"user_id" text NOT NULL,
	"permission" "strategy_permission" DEFAULT 'view' NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_accounts" (
	"strategy_id" text NOT NULL,
	"account_id" text NOT NULL,
	"multiplier" numeric(8, 4) DEFAULT '1' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_notification_channels" (
	"strategy_id" text NOT NULL,
	"event" "strategy_notification_event" NOT NULL,
	"telegram_connection_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_notification_prefs" (
	"strategy_id" text NOT NULL,
	"event" "strategy_notification_event" NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"telegram" boolean DEFAULT false NOT NULL,
	"push" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_partial_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"rr_level" numeric(6, 2) NOT NULL,
	"exit_pct" numeric(5, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_risk_settings" (
	"strategy_id" text PRIMARY KEY NOT NULL,
	"sizing_method" "position_sizing_method",
	"total_capital" numeric(18, 2),
	"available_capital" numeric(18, 2),
	"max_concurrent_positions" numeric(6, 0),
	"max_positions_per_symbol" numeric(6, 0),
	"daily_trade_limit" numeric(6, 0),
	"allow_multiple_same_side" boolean DEFAULT false NOT NULL,
	"max_risk_pct" numeric(6, 3),
	"max_risk_pips" numeric(10, 2),
	"stop_loss_type" "stop_loss_type",
	"default_stop_loss_pct" numeric(6, 3),
	"risk_reward_ratio" numeric(6, 2),
	"partial_booking_r" numeric(6, 2),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_trailing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"rr_level" numeric(6, 2) NOT NULL,
	"trailing_type" "trailing_type" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"signal_alerts" boolean DEFAULT true NOT NULL,
	"broker_disconnected" boolean DEFAULT true NOT NULL,
	"strategy_paused" boolean DEFAULT true NOT NULL,
	"security_alerts" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_rss_feeds" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"evidence" jsonb,
	"provider" "ai_provider",
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_prefs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lane" "ai_lane" NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"lane" "ai_lane" NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"steps" integer,
	"status" "ai_run_status" NOT NULL,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"pinned_symbol" text,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"date" date NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_user_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"source" "ai_user_memory_source" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument_fundamentals" (
	"symbol" text PRIMARY KEY NOT NULL,
	"exchange" text NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"industry" text,
	"market_cap" numeric(20, 2),
	"pe" numeric(12, 4),
	"pb" numeric(12, 4),
	"roe" numeric(8, 4),
	"revenue_growth" numeric(8, 4),
	"profit_margin" numeric(8, 4),
	"debt_to_equity" numeric(10, 4),
	"dividend_yield" numeric(8, 4),
	"beta" numeric(8, 4),
	"ret_1y" numeric(10, 4),
	"refreshed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broker_accounts" ADD CONSTRAINT "broker_accounts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basket_positions" ADD CONSTRAINT "basket_positions_basket_id_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."baskets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basket_positions" ADD CONSTRAINT "basket_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_limit_orders" ADD CONSTRAINT "pending_limit_orders_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_limit_orders" ADD CONSTRAINT "pending_limit_orders_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_limit_orders" ADD CONSTRAINT "pending_limit_orders_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_limit_orders" ADD CONSTRAINT "pending_limit_orders_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_executions" ADD CONSTRAINT "position_executions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_notes" ADD CONSTRAINT "position_notes_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_notes" ADD CONSTRAINT "position_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_rule_fires" ADD CONSTRAINT "strategy_rule_fires_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_settings" ADD CONSTRAINT "trading_settings_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_access" ADD CONSTRAINT "strategy_access_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_access" ADD CONSTRAINT "strategy_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_access" ADD CONSTRAINT "strategy_access_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_accounts" ADD CONSTRAINT "strategy_accounts_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_accounts" ADD CONSTRAINT "strategy_accounts_account_id_broker_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."broker_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_notification_channels" ADD CONSTRAINT "strategy_notification_channels_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_notification_channels" ADD CONSTRAINT "strategy_notification_channels_telegram_connection_id_telegram_connections_id_fk" FOREIGN KEY ("telegram_connection_id") REFERENCES "public"."telegram_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_notification_prefs" ADD CONSTRAINT "strategy_notification_prefs_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_partial_rules" ADD CONSTRAINT "strategy_partial_rules_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_risk_settings" ADD CONSTRAINT "strategy_risk_settings_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_trailing_rules" ADD CONSTRAINT "strategy_trailing_rules_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_rss_feeds" ADD CONSTRAINT "user_rss_feeds_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_thread_id_ai_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_prefs" ADD CONSTRAINT "ai_model_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_threads" ADD CONSTRAINT "ai_threads_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_threads" ADD CONSTRAINT "ai_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_daily" ADD CONSTRAINT "ai_usage_daily_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_user_memory" ADD CONSTRAINT "ai_user_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "broker_accounts_workspace_provider_external_uidx" ON "broker_accounts" USING btree ("workspace_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "broker_accounts_workspace_idx" ON "broker_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "basket_positions_uidx" ON "basket_positions" USING btree ("basket_id","position_id");--> statement-breakpoint
CREATE INDEX "basket_positions_position_idx" ON "basket_positions" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "baskets_workspace_idx" ON "baskets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pending_limit_orders_status_deadline_idx" ON "pending_limit_orders" USING btree ("status","deadline_at");--> statement-breakpoint
CREATE INDEX "pending_limit_orders_account_idx" ON "pending_limit_orders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "position_executions_position_idx" ON "position_executions" USING btree ("position_id","occurred_at");--> statement-breakpoint
CREATE INDEX "position_notes_position_idx" ON "position_notes" USING btree ("position_id","created_at");--> statement-breakpoint
CREATE INDEX "positions_workspace_market_closed_idx" ON "positions" USING btree ("workspace_id","market","closed_at");--> statement-breakpoint
CREATE INDEX "positions_account_idx" ON "positions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_account_external_uidx" ON "positions" USING btree ("account_id","external_position_id");--> statement-breakpoint
CREATE INDEX "positions_strategy_account_symbol_idx" ON "positions" USING btree ("strategy_id","account_id","symbol","status");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_rule_fires_uidx" ON "strategy_rule_fires" USING btree ("position_id","rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_settings_workspace_market_uidx" ON "trading_settings" USING btree ("workspace_id","market");--> statement-breakpoint
CREATE INDEX "signals_strategy_received_idx" ON "signals" USING btree ("strategy_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "strategies_slug_uidx" ON "strategies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_access_uidx" ON "strategy_access" USING btree ("strategy_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_accounts_uidx" ON "strategy_accounts" USING btree ("strategy_id","account_id");--> statement-breakpoint
CREATE INDEX "strategy_accounts_account_idx" ON "strategy_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_notification_channels_uidx" ON "strategy_notification_channels" USING btree ("strategy_id","event","telegram_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategy_notification_prefs_uidx" ON "strategy_notification_prefs" USING btree ("strategy_id","event");--> statement-breakpoint
CREATE INDEX "strategy_partial_rules_strategy_idx" ON "strategy_partial_rules" USING btree ("strategy_id","sort_order");--> statement-breakpoint
CREATE INDEX "strategy_trailing_rules_strategy_idx" ON "strategy_trailing_rules" USING btree ("strategy_id","sort_order");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_occurred_idx" ON "audit_log" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_workspace_user_uidx" ON "notification_preferences" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_connections_workspace_chat_uidx" ON "telegram_connections" USING btree ("workspace_id","chat_id");--> statement-breakpoint
CREATE INDEX "telegram_connections_workspace_idx" ON "telegram_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_rss_feeds_user_url_uidx" ON "user_rss_feeds" USING btree ("user_id","url");--> statement-breakpoint
CREATE INDEX "user_rss_feeds_user_idx" ON "user_rss_feeds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_messages_thread_created_idx" ON "ai_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_model_prefs_user_lane_uidx" ON "ai_model_prefs" USING btree ("user_id","lane");--> statement-breakpoint
CREATE INDEX "ai_runs_workspace_created_idx" ON "ai_runs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_threads_workspace_user_idx" ON "ai_threads" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_threads_last_message_idx" ON "ai_threads" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_daily_workspace_date_uidx" ON "ai_usage_daily" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_user_memory_user_key_uidx" ON "ai_user_memory" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "instrument_fundamentals_sector_idx" ON "instrument_fundamentals" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "instrument_fundamentals_market_cap_idx" ON "instrument_fundamentals" USING btree ("market_cap");