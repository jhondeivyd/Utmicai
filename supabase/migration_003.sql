-- =====================================================================
-- UtmCai — migração 003: forma de pagamento, bid cap e "última atualização"
-- =====================================================================
alter table sales add column if not exists payment_method text;            -- card | pix | boleto | mbway | paypal | outro
create index if not exists sales_ws_method on sales(workspace_id, payment_method);
alter table ad_entities add column if not exists bid_amount numeric(14,2); -- bid cap do conjunto
alter table action_logs add column if not exists snapshot jsonb;            -- métricas no momento da alteração
alter table rule_logs add column if not exists snapshot jsonb;
alter table rule_logs add column if not exists level text;
create index if not exists action_logs_entity on action_logs(workspace_id, entity_id, created_at desc);
create index if not exists rule_logs_entity on rule_logs(workspace_id, entity_id, created_at desc);
select 'ok' as migracao_003;
