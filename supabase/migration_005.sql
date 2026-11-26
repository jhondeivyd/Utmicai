-- UtmCai — migração 005: contas de teste (cadastro aberto) e dono de cada dashboard
alter table workspaces add column if not exists created_by uuid references auth.users(id) on delete set null;
insert into app_settings (key, value) values ('signup_open', 'true') on conflict (key) do update set value = 'true';
select 'ok' as migracao_005;
