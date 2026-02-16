'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SubscriptionGuardProps {
    businessId: string
}

/**
 * Componente cliente que monitorea cambios en la suscripción cada 5s.
 * - suspended → /account/suspended
 * - expired/canceled/past_due → /billing/upgrade
 * - business eliminado → /account/blocked
 * Invisible — no renderiza nada en la UI.
 */
export function SubscriptionGuard({ businessId }: SubscriptionGuardProps) {
    const supabase = createClient()
    const isRedirecting = useRef(false)

    useEffect(() => {
        const check = async () => {
            if (isRedirecting.current) return

            try {
                // Verificar si el negocio fue eliminado
                const { data: biz } = await supabase
                    .from('businesses')
                    .select('deleted_at')
                    .eq('id', businessId)
                    .maybeSingle()

                if (biz?.deleted_at) {
                    isRedirecting.current = true
                    window.location.href = '/account/blocked'
                    return
                }

                // Verificar suscripción activa
                const { data: status } = await supabase.rpc('get_subscription_status', {
                    p_business_id: businessId,
                })

                if (status && !status.is_active) {
                    isRedirecting.current = true

                    if (status.status === 'suspended') {
                        window.location.href = '/account/suspended'
                    } else {
                        window.location.href = '/billing/upgrade'
                    }
                    return
                }
            } catch {
                // Si hay error de red, no redirigir — esperar al siguiente ciclo
            }
        }

        // Primera verificación rápida a los 3s
        const initialTimeout = setTimeout(check, 3000)

        // Verificaciones periódicas cada 5s para respuesta rápida
        const interval = setInterval(check, 5000)

        return () => {
            clearTimeout(initialTimeout)
            clearInterval(interval)
        }
    }, [businessId])

    return null // Invisible
}
