import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
        .from('business_memberships')
        .select('business_id, role')
        .eq('user_id', user.id)
        .single()

    if (!membership) {
        return NextResponse.json({ error: 'No business found' }, { status: 400 })
    }

    const businessId = membership.business_id
    const results = []

    try {
        // 1. Crear Item de prueba
        const itemName = `Test Item ${Date.now()}`
        const { data: item, error: createError } = await supabase
            .from('inventory_items')
            .insert({
                business_id: businessId,
                name: itemName,
                category: 'Test',
                unit: 'pz',
                stock_current: 10,
                stock_min: 5,
                track_mode: 'auto'
            })
            .select()
            .single()

        if (createError) throw new Error(`Create failed: ${createError.message}`)
        results.push({ step: 'Create Item', success: true, item })

        // 2. Ajuste Manual (Entry)
        const { data: move1, error: move1Error } = await supabase.rpc('apply_inventory_movement', {
            p_item_id: item.id,
            p_business_id: businessId,
            p_type: 'purchase', // Requiere rol INVENTORY/ADMIN/OWNER
            p_delta: 5,
            p_reason: 'Test Entry',
            p_actor_user_id: user.id
        })

        if (move1Error) throw new Error(`Movement 1 failed: ${move1Error.message}`)
        results.push({ step: 'Manual Entry (+5)', success: true, new_stock: move1.new_stock })

        // 3. Simular Venta (Auto Sale)
        const { data: move2, error: move2Error } = await supabase.rpc('apply_inventory_movement', {
            p_item_id: item.id,
            p_business_id: businessId,
            p_type: 'auto_sale', // Requiere rol CASHIER/ADMIN/OWNER
            p_delta: -3,
            p_reason: 'Test Sale',
            p_actor_user_id: user.id,
            p_ref_order_id: '00000000-0000-0000-0000-000000000000' // Fake UUID
        })

        if (move2Error) throw new Error(`Movement 2 failed: ${move2Error.message}`)
        results.push({ step: 'Auto Sale (-3)', success: true, new_stock: move2.new_stock, is_low: move2.is_low })

        // 4. Verificar Idempotencia (Repetir Venta)
        // Deberia fallar por constraint unique (mismo item, misma orden)
        const { error: idempotencyError } = await supabase.rpc('apply_inventory_movement', {
            p_item_id: item.id,
            p_business_id: businessId,
            p_type: 'auto_sale',
            p_delta: -3,
            p_reason: 'Test Sale Retry',
            p_actor_user_id: user.id,
            p_ref_order_id: '00000000-0000-0000-0000-000000000000'
        })

        if (idempotencyError) {
            results.push({ step: 'Idempotency Check', success: true, message: 'Correctly blocked duplicate' })
        } else {
            results.push({ step: 'Idempotency Check', success: false, message: 'Failed to block duplicate' })
        }

        // 5. Cleanup
        await supabase.from('inventory_items').delete().eq('id', item.id)
        results.push({ step: 'Cleanup', success: true })

    } catch (e: any) {
        results.push({ step: 'Error', success: false, error: e.message })
    }

    return NextResponse.json({ results })
}
