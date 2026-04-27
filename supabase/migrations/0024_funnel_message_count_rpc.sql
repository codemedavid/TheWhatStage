-- Atomic increment for conversations.funnel_message_count.
-- Replaces the read-then-write pattern in incrementFunnelMessageCount(),
-- which lost increments under concurrent webhook deliveries for the same lead.
create or replace function increment_funnel_message_count(p_conversation_id uuid)
returns integer
language sql
volatile
as $$
  update conversations
  set    funnel_message_count = funnel_message_count + 1
  where  id = p_conversation_id
  returning funnel_message_count;
$$;
