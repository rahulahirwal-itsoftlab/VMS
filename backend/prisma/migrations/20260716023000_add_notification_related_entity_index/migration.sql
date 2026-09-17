CREATE INDEX IF NOT EXISTS "notifications_entity_type_entity_id_idx"
  ON "notifications"("entity_type", "entity_id");
