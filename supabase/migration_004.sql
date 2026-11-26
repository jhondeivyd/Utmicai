-- UtmCai — migração 004: dashboards, taxas, despesas, notificações, regras avançadas
alter table workspaces add column if not exists description text;
alter table workspaces add column if not exists view_type text not null default 'normal';      -- normal (líquido) | total (bruto)
alter table workspaces add column if not exists count_shipping boolean not null default false;
alter table workspaces add column if not exists count_interest boolean not null default true;
alter table workspaces add column if not exists meta_cache boolean not null default true;
alter table workspaces add column if not exists ads_tax_percent numeric(6,3) not null default 0; -- imposto sobre gastos em anúncios
alter table workspaces add column if not exists api_token text;
alter table workspaces add column if not exists notify jsonb not null default
  '{"pending":false,"approved":true,"value":"comissao","product":false,"campaign":false,"dashname":true,"hours":[12,23],"style":"detalhado"}'::jsonb;
alter table workspaces add column if not exists report_last jsonb not null default '{}'::jsonb;

alter table profiles add column if not exists full_name text;

-- Taxas (checkout, gateway, etc.)
create table if not exists fees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  percent numeric(6,3) not null default 0,
  fixed numeric(12,2) not null default 0,
  payment_method text not null default 'todas',   -- todas | card | pix | boleto | mbway | paypal
  base text not null default 'faturamento',        -- faturamento | liquido
  created_at timestamptz not null default now()
);
create index if not exists fees_ws on fees(workspace_id);

-- Custo de produto: por venda ou mensal
alter table product_costs add column if not exists kind text not null default 'venda';

-- Despesas adicionais
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null default current_date,
  kind text not null default 'unica',               -- unica | mensal
  category text not null default 'Outros',
  description text,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists expenses_ws_date on expenses(workspace_id, date);

-- Regras: campos extra do formulário
alter table rules add column if not exists name_filter text;
alter table rules add column if not exists apply_to text not null default 'active';     -- active | all | paused
alter table rules add column if not exists cond_level text not null default 'object';  -- object | campaign | account
alter table rules add column if not exists calc_period text not null default 'today';  -- today | yesterday | 3d | 7d | 14d | 30d | lifetime
alter table rules add column if not exists hour_from int;
alter table rules add column if not exists hour_to int;
alter table rules add column if not exists daily_limit int;
alter table rules add column if not exists product text;
alter table rules add column if not exists frequency_min int not null default 15;

alter table fees enable row level security;
alter table expenses enable row level security;

-- relatórios agendados (Telegram): verifica ao minuto 1 de cada hora
grant select, insert, update, delete on fees, expenses to service_role;
do $$
begin
  perform cron.unschedule('utmcai-reports') where exists (select 1 from cron.job where jobname = 'utmcai-reports');
end $$;
select cron.schedule('utmcai-reports', '1 * * * *', $cron$
  select net.http_get(
    url := 'https://utmicai.vercel.app/api/cron/reports?secret=' || (select value from public.app_settings where key = 'cron_token'),
    timeout_milliseconds := 60000
  );
$cron$);

select 'ok' as migracao_004;
