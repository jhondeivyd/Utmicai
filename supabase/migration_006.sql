-- UtmCai — migração 006: ligar o Facebook por login (OAuth)
alter table workspaces add column if not exists meta_token_expires_at timestamptz;
alter table workspaces add column if not exists meta_account_name text;
select 'ok' as migracao_006;
