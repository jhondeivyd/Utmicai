-- =====================================================================
-- UtmCai — schema do banco (Supabase / PostgreSQL)
-- Cole tudo no SQL Editor do Supabase e clique em "Run".
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Perfis (quem é super admin) ----------
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Workspaces (uma por cliente / operação) ----------
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  public_key text not null unique default encode(gen_random_bytes(9), 'hex'),     -- usado no script das páginas
  webhook_token text not null unique default encode(gen_random_bytes(16), 'hex'), -- usado nas URLs de webhook
  currency text not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  -- Meta Ads
  meta_ad_account_ids text,          -- ex: act_123,act_456
  meta_access_token text,            -- token de usuário do sistema (Business Manager)
  meta_last_sync_at timestamptz,
  -- Pixel / CAPI
  pixel_id text,
  capi_token text,
  capi_test_event_code text,
  -- Notificações
  telegram_bot_token text,
  telegram_chat_id text,
  -- Integrações
  stripe_webhook_secret text,
  generic_mapping jsonb,
  created_at timestamptz not null default now()
);

create table if not exists members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ---------- Cliques (registados pelo script nas páginas) ----------
create table if not exists clicks (
  id text primary key,                 -- cid gerado pelo script (uc + 18 chars)
  workspace_id uuid not null references workspaces(id) on delete cascade,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text, utm_id text,
  fbclid text, fbc text, fbp text,
  ip text, user_agent text, landing_url text, referrer text,
  created_at timestamptz not null default now()
);
create index if not exists clicks_ws_created on clicks(workspace_id, created_at desc);

-- ---------- Vendas ----------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,              -- stripe | kashpay | generic
  external_id text not null,           -- id da venda no checkout
  payment_ref text,                    -- ex: payment_intent do Stripe (para reembolsos)
  status text not null check (status in ('approved','pending','refunded','chargeback','canceled')),
  amount numeric(14,2) not null default 0,
  currency text,
  product_name text,
  customer_email text, customer_name text, customer_phone text, customer_ip text,
  click_id text references clicks(id) on delete set null,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  campaign_id text, campaign_name text, adset_id text, adset_name text, ad_id text, ad_name text, placement text,
  approved_at timestamptz,
  capi_sent_at timestamptz, capi_error text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, external_id)
);
create index if not exists sales_ws_created on sales(workspace_id, created_at desc);
create index if not exists sales_payment_ref on sales(workspace_id, payment_ref);

-- ---------- Gasto do Meta Ads (diário, por anúncio) ----------
create table if not exists ad_spend (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  account_id text not null,
  campaign_id text, campaign_name text,
  adset_id text, adset_name text,
  ad_id text not null, ad_name text,
  spend numeric(14,2) not null default 0,
  impressions bigint default 0,
  clicks bigint default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, date, ad_id)
);

-- ---------- Log bruto de webhooks (para debug) ----------
create table if not exists webhook_logs (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  provider text,
  payload jsonb,
  result text,
  created_at timestamptz not null default now()
);
create index if not exists webhook_logs_ws on webhook_logs(workspace_id, created_at desc);

-- =====================================================================
-- Segurança (RLS): cada utilizador só lê os dados das workspaces dele.
-- Todas as escritas passam pelo servidor (service role).
-- =====================================================================
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where user_id = auth.uid()), false)
$$;

create or replace function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or exists (select 1 from members where workspace_id = ws and user_id = auth.uid())
$$;

alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table members enable row level security;
alter table clicks enable row level security;
alter table sales enable row level security;
alter table ad_spend enable row level security;
alter table webhook_logs enable row level security;

drop policy if exists p_profiles on profiles;
create policy p_profiles on profiles for select using (user_id = auth.uid() or is_admin());
drop policy if exists p_workspaces on workspaces;
create policy p_workspaces on workspaces for select using (is_member(id));
drop policy if exists p_members on members;
create policy p_members on members for select using (user_id = auth.uid() or is_admin());
drop policy if exists p_clicks on clicks;
create policy p_clicks on clicks for select using (is_member(workspace_id));
drop policy if exists p_sales on sales;
create policy p_sales on sales for select using (is_member(workspace_id));
drop policy if exists p_spend on ad_spend;
create policy p_spend on ad_spend for select using (is_member(workspace_id));
drop policy if exists p_logs on webhook_logs;
create policy p_logs on webhook_logs for select using (is_member(workspace_id));

-- Os tokens (Meta, CAPI, Telegram, Stripe) nunca vão para o navegador:
-- o painel lê as workspaces só no servidor e mostra só se estão preenchidos.
revoke all on workspaces from anon, authenticated;
grant select (id, name, public_key, webhook_token, currency, timezone, meta_ad_account_ids,
  meta_last_sync_at, pixel_id, telegram_chat_id, created_at) on workspaces to authenticated;

-- Cria o perfil automaticamente quando um utilizador é criado
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- =====================================================================
-- DEPOIS de criar a sua conta (Authentication → Users → Add user),
-- rode esta linha com o SEU e-mail para virar super admin:
--   update profiles set is_admin = true where email = 'seu@email.com';
-- =====================================================================
