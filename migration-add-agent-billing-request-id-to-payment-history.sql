-- Add agent_billing_request_id column to payment_history table to link payments to their originating requests
ALTER TABLE public.payment_history 
ADD COLUMN IF NOT EXISTS agent_billing_request_id UUID REFERENCES public.agent_billing_requests(id) ON DELETE SET NULL;

-- Add an index to make lookups faster
CREATE INDEX IF NOT EXISTS idx_payment_history_agent_billing_request_id 
ON public.payment_history(agent_billing_request_id);
