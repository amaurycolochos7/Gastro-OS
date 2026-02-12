'use server'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Crear cliente con service role para operaciones admin
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
)

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { name, email, phone, password, role, businessId, creatorUserId } = body

        // Validaciones basicas
        if (!name || !password || !role || !businessId) {
            return NextResponse.json(
                { error: 'Faltan campos requeridos' },
                { status: 400 }
            )
        }

        if (!email && !phone) {
            return NextResponse.json(
                { error: 'Se requiere email o telefono' },
                { status: 400 }
            )
        }

        // Crear el usuario con el admin client (sin verificacion de email)
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email || `${phone}@phone.local`,
            phone: phone || undefined,
            password,
            email_confirm: true, // Skip email verification
            phone_confirm: true, // Skip phone verification
            user_metadata: {
                full_name: name,
                phone: phone || null,
                created_by: creatorUserId
            }
        })

        if (createError) {
            console.error('Error creating user:', createError)
            return NextResponse.json(
                { error: createError.message },
                { status: 400 }
            )
        }

        // Crear la membresia del negocio
        const { error: membershipError } = await supabaseAdmin
            .from('business_memberships')
            .insert({
                user_id: newUser.user.id,
                business_id: businessId,
                role,
                status: 'active',
                invited_email: email || null
            })

        if (membershipError) {
            // Si falla la membresia, eliminar el usuario creado
            await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
            console.error('Error creating membership:', membershipError)
            return NextResponse.json(
                { error: 'Error al asignar rol' },
                { status: 400 }
            )
        }

        return NextResponse.json({
            success: true,
            user: {
                id: newUser.user.id,
                email: newUser.user.email,
                name
            }
        })

    } catch (error) {
        console.error('Server error:', error)
        return NextResponse.json(
            { error: 'Error del servidor' },
            { status: 500 }
        )
    }
}
