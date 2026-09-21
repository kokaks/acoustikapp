-- 0002_realtime_notify.sql
-- Postgres LISTEN/NOTIFY so the Node backend can push live updates to every
-- connected employee without polling. The backend LISTENs on
-- 'replenishment_changes' and rebroadcasts over WebSocket.

create or replace function notify_replenishment_change() returns trigger as $$
declare
  payload json;
begin
  payload := json_build_object(
    'op', lower(tg_op),
    'id', coalesce(new.id, old.id),
    'product_id', coalesce(new.product_id, old.product_id),
    'status', coalesce(new.status, old.status)
  );
  perform pg_notify('replenishment_changes', payload::text);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger replenishment_items_notify
  after insert or update or delete on replenishment_items
  for each row execute function notify_replenishment_change();
