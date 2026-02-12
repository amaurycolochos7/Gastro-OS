import { SupabaseClient } from '@supabase/supabase-js'

export type LimitType = 'products' | 'orders_day' | 'users'

export interface LimitResult {
    allowed: boolean
    current: number
    limit: number
}

const LIMIT_LABELS: Record<LimitType, string> = {
    products: 'productos',
    orders_day: 'órdenes por día',
    users: 'miembros del equipo',
}

export function getLimitLabel(type: LimitType): string {
    return LIMIT_LABELS[type]
}

export async function checkLimit(
    supabase: SupabaseClient,
    businessId: string,
    limitType: LimitType
): Promise<LimitResult> {
    // Get the limit from business config
    const { data: business } = await supabase
        .from('businesses')
        .select('limits_products, limits_orders_day, limits_users')
        .eq('id', businessId)
        .single()

    if (!business) return { allowed: false, current: 0, limit: 0 }

    const limitMap: Record<LimitType, number> = {
        products: business.limits_products ?? 100,
        orders_day: business.limits_orders_day ?? 200,
        users: business.limits_users ?? 3,
    }

    const limit = limitMap[limitType]

    // Count current usage
    let current = 0

    if (limitType === 'products') {
        const { count } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .is('deleted_at', null)
        current = count || 0
    } else if (limitType === 'orders_day') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { count } = await supabase
            .from('payments')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('status', 'paid')
            .gte('paid_at', today.toISOString())
            .is('deleted_at', null)
        current = count || 0
    } else if (limitType === 'users') {
        const { count } = await supabase
            .from('business_memberships')
            .select('*', { count: 'exact', head: true })
            .eq('business_id', businessId)
        current = count || 0
    }

    return { allowed: current < limit, current, limit }
}
