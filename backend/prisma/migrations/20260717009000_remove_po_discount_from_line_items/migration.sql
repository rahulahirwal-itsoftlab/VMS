UPDATE "purchase_orders"
SET "line_items" = (
  SELECT COALESCE(jsonb_agg(item - 'discount' ORDER BY ordinality), '[]'::jsonb)
  FROM jsonb_array_elements("purchase_orders"."line_items") WITH ORDINALITY AS line_items(item, ordinality)
)
WHERE jsonb_typeof("line_items") = 'array'
  AND "line_items"::text LIKE '%"discount"%';
