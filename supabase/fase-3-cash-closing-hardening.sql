-- ========================================
-- FASE 3: Cash Closing Hardening
-- ========================================

-- 1. Schema Updates & Performance
-- ----------------------------------------

-- Audit Logs: Remove restriction on 'action' to allow 'close_register', etc.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;

-- Create index for audit logs performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created
ON audit_logs(business_id, created_at DESC);

-- Cash Registers: Ensure all hardening columns exist
ALTER TABLE cash_registers
ADD COLUMN IF NOT EXISTS summary_snapshot jsonb,
ADD COLUMN IF NOT EXISTS count_breakdown jsonb,
ADD COLUMN IF NOT EXISTS requires_review boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reviewed_by uuid,
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Indices for reporting/dashboard performance
CREATE INDEX IF NOT EXISTS idx_cash_registers_business_status
ON cash_registers(business_id, status);

-- ... (RPC close_cash_register body start) ...

  -- 5. Validation Rules (Calculate Review Requirement)
  IF ABS(v_difference) > v_threshold THEN
      v_requires_review := true;
  END IF;

  -- Check critical warnings in snapshot
  IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_summary->'warnings') w
      WHERE w->>'severity' = 'critical'
  ) THEN
      v_requires_review := true;
  END IF;

  -- 6. Enforce Mandatory Notes (DB Constraint Logic)
  IF v_requires_review AND (p_closing_notes IS NULL OR length(trim(p_closing_notes)) = 0) THEN
      RAISE EXCEPTION 'Closing notes are mandatory when review is required (Difference > % or Critical Warnings)', v_threshold;
  END IF;

CREATE INDEX IF NOT EXISTS idx_payments_register_paid
ON payments(cash_register_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_movements_register_created
ON cash_movements(cash_register_id, created_at DESC);

-- Cash Movements: Enforce reason is not empty
ALTER TABLE cash_movements
DROP CONSTRAINT IF EXISTS cash_movements_reason_check;

ALTER TABLE cash_movements
ADD CONSTRAINT cash_movements_reason_check CHECK (length(trim(reason)) > 0);


-- 2. Functions
-- ----------------------------------------

-- RPC: Get Summary with Warnings (Source of Truth)
DROP FUNCTION IF EXISTS get_cash_register_summary(uuid);

CREATE OR REPLACE FUNCTION get_cash_register_summary(
  p_cash_register_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_register record;
  v_sales_by_method jsonb;
  v_cash_in numeric := 0;
  v_cash_out numeric := 0; -- Operative cash out ONLY
  v_voids_by_method jsonb;
  v_refunds_by_method jsonb;
  v_expected_cash numeric := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_orphan_count integer := 0;
  v_pending_count integer := 0;
  v_period_end timestamptz;
BEGIN
  -- 1. Get Register
  SELECT * INTO v_register FROM cash_registers WHERE id = p_cash_register_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash register not found'; END IF;

  v_period_end := COALESCE(v_register.closed_at, NOW());

  -- 2. Calculate Totals (using aggregation for cleaner code)
  -- Sales by method
  SELECT jsonb_object_agg(method, total)
  INTO v_sales_by_method
  FROM (
    SELECT method, COALESCE(SUM(amount), 0) as total
    FROM payments
    WHERE cash_register_id = p_cash_register_id
    AND status = 'paid'
    GROUP BY method
  ) t;

  -- Cash IN/OUT
  SELECT
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' AND reason != 'Retiro de Cierre' THEN amount ELSE 0 END), 0) -- Exclude final withdrawal from operational calc
  INTO v_cash_in, v_cash_out
  FROM cash_movements
  WHERE cash_register_id = p_cash_register_id
  AND deleted_at IS NULL;

  -- Voids/Refunds by method
  SELECT jsonb_object_agg(method, total) INTO v_voids_by_method
  FROM (
        SELECT method, COALESCE(SUM(amount), 0) as total
        FROM payments WHERE cash_register_id = p_cash_register_id AND status = 'void' GROUP BY method
  ) t;

  SELECT jsonb_object_agg(method, total) INTO v_refunds_by_method
  FROM (
        SELECT method, COALESCE(SUM(amount), 0) as total
        FROM payments WHERE cash_register_id = p_cash_register_id AND status = 'refunded' GROUP BY method
  ) t;

  -- 4. Return Structure (Formula: expected_cash = opening_amount + cash_sales + cash_in - cash_out - cash_refunds - cash_voids)
  -- Note: We trust the app passed 'cash' method correctly.
  v_expected_cash := v_register.opening_amount
    + COALESCE((v_sales_by_method->>'cash')::numeric, 0)
    + v_cash_in
    - v_cash_out
    - COALESCE((v_refunds_by_method->>'cash')::numeric, 0)
    - COALESCE((v_voids_by_method->>'cash')::numeric, 0);

  -- 3. Warnings
  -- Orphan payments
  SELECT COUNT(*) INTO v_orphan_count
  FROM payments
  WHERE business_id = v_register.business_id
    AND cash_register_id IS NULL
    AND status = 'paid'
    AND paid_at BETWEEN v_register.opened_at AND v_period_end;

  IF v_orphan_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'orphan_payment_cash_register',
      'severity', 'info',
      'message', format('%s pagos sin caja asignada en este periodo', v_orphan_count),
      'count', v_orphan_count
    );
  END IF;

  -- Pending payments
  SELECT COUNT(*) INTO v_pending_count
  FROM payments
  WHERE cash_register_id = p_cash_register_id AND status = 'pending';

  IF v_pending_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'pending_payments',
      'severity', 'warn',
      'message', format('%s pagos pendientes en esta caja', v_pending_count),
      'count', v_pending_count
    );
  END IF;

  -- 4. Return Structure
  RETURN jsonb_build_object(
    'version', 1,
    'generated_at', NOW(),
    'register_id', p_cash_register_id,
    'period', jsonb_build_object('opened_at', v_register.opened_at, 'closed_at', v_register.closed_at),
    'totals', jsonb_build_object(
        'sales_by_method', COALESCE(v_sales_by_method, '{}'::jsonb),
        'cash_in', v_cash_in,
        'cash_out', v_cash_out,
        'refunds_by_method', COALESCE(v_refunds_by_method, '{}'::jsonb),
        'voids_by_method', COALESCE(v_voids_by_method, '{}'::jsonb)
    ),
    'expected_cash', v_expected_cash,
    'start_amount', v_register.opening_amount,
    'warnings', v_warnings
  );
END;
$$;


-- RPC: Close Cash Register
DROP FUNCTION IF EXISTS close_cash_register(uuid, numeric, numeric, text, uuid); -- Drop old signature if exists

CREATE OR REPLACE FUNCTION close_cash_register(
  p_cash_register_id uuid,
  p_counted_cash numeric,
  p_keep_float_amount numeric,
  p_closing_notes text DEFAULT NULL,
  p_count_breakdown jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_register record;
  v_business record;
  v_summary jsonb;
  v_expected_cash numeric;
  v_difference numeric;
  v_threshold numeric;
  v_withdrawn_cash numeric;
  v_requires_review boolean := false;
  v_user_id uuid;
  v_breakdown_total numeric := 0;
BEGIN
  v_user_id := auth.uid();

  -- 1. Lock record to prevent double closing and race conditions
  SELECT * INTO v_register
  FROM cash_registers
  WHERE id = p_cash_register_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Cash register not found'; END IF;
  IF v_register.status != 'open' THEN RAISE EXCEPTION 'Cash register is already closed'; END IF;

  -- 2. Validate Breakdown (if present)
  IF p_count_breakdown IS NOT NULL THEN
     -- Calculate total from breakdown: sum(key * value) for cash and coins
     -- JSON structure expected: { "cash": {"500": 2, "100": 5}, "coins": {"10": 2}, "total": 1520 }
     
     v_breakdown_total := v_breakdown_total + COALESCE((
        SELECT SUM(key::numeric * value::numeric) 
        FROM jsonb_each_text(p_count_breakdown->'cash')
     ), 0);
     
     v_breakdown_total := v_breakdown_total + COALESCE((
        SELECT SUM(key::numeric * value::numeric) 
        FROM jsonb_each_text(p_count_breakdown->'coins')
     ), 0);

     -- If breakdown has explicit 'total', check it matches input
     IF p_count_breakdown ? 'total' AND (p_count_breakdown->>'total')::numeric != p_counted_cash THEN
        RAISE EXCEPTION 'Breakdown total property (%) does not match counted cash input (%)', 
            (p_count_breakdown->>'total'), p_counted_cash;
     END IF;

     -- Check calculated total vs counted input
     IF v_breakdown_total != p_counted_cash THEN
          -- Strictly enforce equality
          RAISE EXCEPTION 'Calculated breakdown total (%) does not match counted cash (%)', v_breakdown_total, p_counted_cash;
     END IF;
  END IF;

  -- 3. Get Business Config
  SELECT * INTO v_business FROM businesses WHERE id = v_register.business_id;
  v_threshold := COALESCE(v_business.cash_difference_threshold, 20.00);

  -- 4. Generate Summary Snapshot (Source of Truth)
  v_summary := get_cash_register_summary(p_cash_register_id);
  v_expected_cash := (v_summary->>'expected_cash')::numeric;
  v_difference := p_counted_cash - v_expected_cash;

  -- 5. Validation Rules (Calculate Requires Review)
  v_requires_review := (ABS(v_difference) > v_threshold);

  -- Check critical warnings in snapshot
  IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_summary->'warnings') w
      WHERE w->>'severity' = 'critical'
  ) THEN
      v_requires_review := true;
  END IF;

  -- 6. Enforce Mandatory Notes (Strict Rule)
  IF v_requires_review AND (p_closing_notes IS NULL OR length(trim(p_closing_notes)) = 0) THEN
       RAISE EXCEPTION 'Closing notes are mandatory when review is required (Difference > % or Critical Warnings)', v_threshold;
  END IF;

  -- 7. Calculate Withdrawal
  v_withdrawn_cash := GREATEST(0, p_counted_cash - p_keep_float_amount);

  -- 8. Update Register
  -- Add final detailed fields to snapshot
  v_summary := v_summary || jsonb_build_object(
      'counted_cash', p_counted_cash,
      'difference', v_difference,
      'keep_float_amount', p_keep_float_amount,
      'withdrawn_cash', v_withdrawn_cash,
      'closing_notes', p_closing_notes
  );

  UPDATE cash_registers
  SET
    status = 'closed',
    closed_at = NOW(),
    closed_by = v_user_id,
    counted_cash = p_counted_cash,
    expected_cash_snapshot = v_expected_cash, -- Derived from snapshot
    keep_float_amount = p_keep_float_amount,
    withdrawn_cash = v_withdrawn_cash,
    closing_notes = p_closing_notes,
    requires_review = v_requires_review,
    count_breakdown = p_count_breakdown,
    summary_snapshot = v_summary,
    updated_at = NOW()
  WHERE id = p_cash_register_id;

  -- 9. Create Withdrawal Movement (Anti-double count: reason specific)
  IF v_withdrawn_cash > 0 THEN
    INSERT INTO cash_movements (
      business_id, cash_register_id, type, amount, reason, created_by
    ) VALUES (
      v_register.business_id, p_cash_register_id, 'out', v_withdrawn_cash, 'Retiro de Cierre', v_user_id
    );
  END IF;

  -- 10. Macro Audit Log
  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_register.business_id,
    v_user_id,
    'close_register', -- snake_case convention
    'cash_register',
    p_cash_register_id,
    jsonb_build_object(
        'summary_snapshot', v_summary,
        'actor', v_user_id,
        'requires_review', v_requires_review
    )
  );

  RETURN v_summary;
END;
$$;
