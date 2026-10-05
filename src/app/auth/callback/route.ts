import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Esta ruta intercambia un código de un solo uso y redirige según el
// usuario — nunca debe cachearse ni evaluarse de forma estática.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const url = new URL(request.url)
    const { searchParams } = url

    // Next.js self-hosteado (fuera de Vercel) arma `request.url` con la
    // dirección interna del contenedor en vez del dominio real, incluso
    // detrás de un proxy que sí manda los headers correctos (confirmado
    // en vivo). Hay que armar el origin a mano con esos headers.
    const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    const forwardedProto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin
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
