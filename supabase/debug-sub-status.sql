-- =============================================
-- Debug Script: Subscription Access
-- Ejecutar para diagnosticar por qué un negocio no entra
-- =============================================

-- 1. Vista General de Negocios Recientes
SELECT
  b.name as "Negocio",
  b.id as "ID",
  -- Subscription
  s.status as "Status DB",
  s.plan_code_snapshot as "Plan",
  s.trial_end as "Trial End",
  s.current_period_start as "Period Start",
  s.current_period_end as "Period End",
  -- Gate Logic Simulation (Simula get_subscription_status)
  CASE
    WHEN s.id IS NULL THEN 'NO SUBSCRIPTION'
    WHEN s.status = 'trialing' AND s.trial_end < now() THEN 'EXPIRED (Trial ended)'
    WHEN s.status IN ('trialing', 'active') THEN 'ACTIVE (Allowed)'
    ELSE 'BLOCKED (' || s.status || ')'
  END as "Gate Simulation",
  -- Membership
  (SELECT count(*) FROM business_memberships bm WHERE bm.business_id = b.id AND bm.role = 'OWNER') as "Owners",
  -- Timestamps
  s.updated_at as "Last Update"
FROM businesses b
LEFT JOIN subscriptions s ON s.business_id = b.id
ORDER BY s.updated_at DESC NULLS LAST
LIMIT 10;

-- 2. (OPCIONAL) BUSCAR POR EMAIL SI SOSPECHAS MÚLTIPLES NEGOCIOS
-- Descomenta y reemplaza el email para ver a qué negocios pertenece el usuario
/*
SELECT
  u.email,
  b.name as business_name,
  s.status as sub_status,
  s.trial_end
FROM business_memberships bm
JOIN businesses b ON b.id = bm.business_id
JOIN auth.users u ON u.id = bm.user_id
LEFT JOIN subscriptions s ON s.business_id = b.id
WHERE u.email = 'usuario@ejemplo.com';
*/
