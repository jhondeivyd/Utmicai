-- =====================================================================
-- UtmCai — migração 002: gestão de anúncios, regras, custos e agendador
-- =====================================================================

-- ---------- Custos e impostos ----------
alter table workspaces add column if not exists tax_percent numeric(6,3) not null default 0;
alter table workspaces add column if not exists gateway_fee_percent numeric(6,3) not null default 0;
alter table workspaces add column if not exists fixed_cost_per_sale numeric(12,2) not null default 0;

create table if not exists product_costs (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  product_name text not null,
  cost numeric(12,2) not null default 0,
  primary key (workspace_id, product_name)
);

-- ---------- Métricas extra do Meta ----------
alter table ad_spend add column if not exists link_clicks bigint default 0;
alter table ad_spend add column if not exists lpv bigint default 0;            -- landing page views
alter table ad_spend add column if not exists ic bigint default 0;             -- initiate checkout
alter table ad_spend add column if not exists meta_purchases bigint default 0; -- compras reportadas pelo Meta
create index if not exists ad_spend_ws_date on ad_spend(workspace_id, date);

-- ---------- Campanhas / conjuntos / anúncios do Meta ----------
create table if not exists ad_entities (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  id text not null,
  level text not null check (level in ('campaign','adset','ad')),
  account_id text,
  campaign_id text,
  adset_id text,
  name text,
  status text,             -- ACTIVE | PAUSED | ...
  effective_status text,
  daily_budget numeric(14,2),
  lifetime_budget numeric(14,2),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists ad_entities_ws_level on ad_entities(workspace_id, level);

-- ---------- Regras automáticas ----------
create table if not exists rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  level text not null check (level in ('campaign','adset','ad')),
  time_window text not null default 'today',   -- today | yesterday | last_3d | last_7d
  conditions jsonb not null default '[]',      -- [{metric, op, value}]
  action text not null,                        -- pause | activate | budget_up | budget_down | budget_set | notify
  action_value numeric,
  cooldown_hours int not null default 6,
  dry_run boolean not null default false,
  notify boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists rule_logs (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  rule_id uuid references rules(id) on delete cascade,
  entity_id text, entity_name text,
  action text, detail text, ok boolean, dry_run boolean default false,
  created_at timestamptz not null default now()
);
create index if not exists rule_logs_ws on rule_logs(workspace_id, created_at desc);

create table if not exists action_logs (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_email text,
  entity_id text, entity_name text,
  action text, detail text, ok boolean,
  created_at timestamptz not null default now()
);
create index if not exists action_logs_ws on action_logs(workspace_id, created_at desc);

-- ---------- Segredo interno do agendador (nunca sai do servidor) ----------
create table if not exists app_settings (
  key text primary key,
  value text not null
);
insert into app_settings (key, value)
  values ('cron_token', encode(gen_random_bytes(24), 'hex'))
  on conflict (key) do nothing;

-- ---------- Permissões ----------
alter table product_costs enable row level security;
alter table ad_entities enable row level security;
alter table rules enable row level security;
alter table rule_logs enable row level security;
alter table action_logs enable row level security;
alter table app_settings enable row level security;

drop policy if exists p_costs on product_costs;
create policy p_costs on product_costs for select using (is_member(workspace_id));
drop policy if exists p_entities on ad_entities;
create policy p_entities on ad_entities for select using (is_member(workspace_id));
drop policy if exists p_rules on rules;
create policy p_rules on rules for select using (is_member(workspace_id));
drop policy if exists p_rule_logs on rule_logs;
create policy p_rule_logs on rule_logs for select using (is_member(workspace_id));
drop policy if exists p_action_logs on action_logs;
create policy p_action_logs on action_logs for select using (is_member(workspace_id));

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on product_costs, ad_entities, rules, rule_logs, action_logs to authenticated;
revoke all on app_settings from anon, authenticated;

-- =====================================================================
-- Agendador (pg_cron + pg_net): o próprio Supabase chama o UtmCai.
--  * gasto + campanhas do Meta: a cada hora
--  * regras automáticas: a cada 15 minutos
-- Substitua a URL abaixo se mudar de domínio.
-- =====================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('utmcai-meta-sync') where exists (select 1 from cron.job where jobname = 'utmcai-meta-sync');
  perform cron.unschedule('utmcai-rules') where exists (select 1 from cron.job where jobname = 'utmcai-rules');
end $$;

select cron.schedule('utmcai-meta-sync', '5 * * * *', $cron$
  select net.http_get(
    url := 'https://utmicai.vercel.app/api/cron/meta-sync?days=2&secret=' || (select value from public.app_settings where key = 'cron_token'),
    timeout_milliseconds := 60000
  );
$cron$);

select cron.schedule('utmcai-rules', '*/15 * * * *', $cron$
  select net.http_get(
    url := 'https://utmicai.vercel.app/api/cron/rules?secret=' || (select value from public.app_settings where key = 'cron_token'),
    timeout_milliseconds := 60000
  );
$cron$);

select jobname, schedule from cron.job where jobname like 'utmcai-%';
