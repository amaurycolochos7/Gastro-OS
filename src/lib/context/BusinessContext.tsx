'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Role } from '@/lib/types'

interface BusinessContextType {
    businessId: string | null
    businessName: string | null
    role: Role | null
    userId: string | null
    loading: boolean
}

const BusinessContext = createContext<BusinessContextType>({
    businessId: null,
    businessName: null,
    role: null,
    userId: null,
    loading: true,
})

export function useBusiness() {
    return useContext(BusinessContext)
}

export function BusinessProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<BusinessContextType>({
        businessId: null,
        businessName: null,
        role: null,
        userId: null,
        loading: true,
    })

    useEffect(() => {
        const loadBusinessData = async () => {
            const supabase = createClient()

            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setState(prev => ({ ...prev, loading: false }))
                return
            }

            const { data: membership } = await supabase
                .from('business_memberships')
                .select('business_id, role, businesses(name)')
                .eq('user_id', user.id)
                .single()

            if (membership) {
                const business = membership.businesses as unknown as { name: string }
                setState({
                    businessId: membership.business_id,
                    businessName: business?.name || null,
                    role: membership.role as Role,
                    userId: user.id,
                    loading: false,
                })
            } else {
                setState(prev => ({ ...prev, loading: false }))
            }
        }

        loadBusinessData()
    }, [])

    return (
        <BusinessContext.Provider value={state}>
            {children}
        </BusinessContext.Provider>
    )
}
