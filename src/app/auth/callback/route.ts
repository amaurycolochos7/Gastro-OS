import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Sin esto, Next.js puede evaluar esta ruta como estática en build time y
// hornear un `origin` de placeholder (0.0.0.0:3000) en todos los redirects,
// en vez de usar el host real de cada request (bug real, confirmado en vivo).
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
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
