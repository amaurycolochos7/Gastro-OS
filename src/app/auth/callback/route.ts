import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Sin esto, Next.js puede evaluar esta ruta como estática en build time y
// hornear un `origin` de placeholder (0.0.0.0:3000) en todos los redirects,
// en vez de usar el host real de cada request (bug real, confirmado en vivo).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    console.log('[auth/callback DEBUG] request.url=', request.url)
    console.log('[auth/callback DEBUG] host header=', request.headers.get('host'))
    console.log('[auth/callback DEBUG] x-forwarded-host=', request.headers.get('x-forwarded-host'))
    console.log('[auth/callback DEBUG] x-forwarded-proto=', request.headers.get('x-forwarded-proto'))
    const { searchParams, origin } = new URL(request.url)
    console.log('[auth/callback DEBUG] computed origin=', origin)
    const code = searchParams.get('code')
    const next = searchParams.get('next')

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
            // Si ya tiene un destino explícito, usarlo
            if (next) {
                return NextResponse.redirect(`${origin}${next}`)
            }

            // Verificar si es admin de plataforma → redirigir a /admin
            const { data: isAdmin } = await supabase.rpc('is_admin')
            if (isAdmin) {
                return NextResponse.redirect(`${origin}/admin`)
            }

            // Por defecto, ir al onboarding
            return NextResponse.redirect(`${origin}/onboarding`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
