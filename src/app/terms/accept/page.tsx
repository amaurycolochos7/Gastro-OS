'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const TERMS_VERSION = 'v2026-02-12'

export default function AcceptTermsPage() {
    const router = useRouter()
    const [accepting, setAccepting] = useState(false)
    const [error, setError] = useState('')
    const [isUpdate, setIsUpdate] = useState(false)
    const [loaded, setLoaded] = useState(false)

    // Check if this is a re-acceptance (version changed)
    useEffect(() => {
        const check = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: profile } = await supabase
                .from('profiles')
                .select('accepted_terms_version')
                .eq('user_id', user.id)
                .maybeSingle()
            if (profile?.accepted_terms_version && profile.accepted_terms_version !== TERMS_VERSION) {
                setIsUpdate(true)
            }
            setLoaded(true)
        }
        check()
    }, [])

    const handleAccept = async () => {
        setAccepting(true)
        setError('')

        const supabase = createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            router.push('/login')
            return
        }

        const { error: upsertError } = await supabase
            .from('profiles')
            .upsert({
                user_id: user.id,
                accepted_terms_at: new Date().toISOString(),
                accepted_terms_version: TERMS_VERSION,
            })

        if (upsertError) {
            console.error('[AcceptTerms] Error:', upsertError)
            setError('Error al guardar aceptación. Intenta de nuevo.')
            setAccepting(false)
            return
        }

        router.push('/dashboard')
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-page, #f0f0f5)',
            padding: '1rem',
        }}>
            <div style={{
                background: 'var(--bg-card, #fff)',
                borderRadius: '16px',
                padding: '2.5rem',
                maxWidth: '440px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            }}>


                <h1 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    marginBottom: '0.5rem',
                    color: 'var(--color-text, #1a1a2e)',
                }}>
                    Términos y Condiciones
                </h1>

                <p style={{
                    color: 'var(--color-text-muted, #888)',
                    fontSize: '0.95rem',
                    marginBottom: '1.5rem',
                    lineHeight: 1.5,
                }}>
                    {isUpdate
                        ? 'Hemos actualizado nuestros términos y condiciones. Por favor revísalos y confirma para continuar.'
                        : 'Para continuar usando GastroOS, necesitas aceptar nuestros términos y condiciones.'}
                </p>

                <Link
                    href="/terms"
                    target="_blank"
                    style={{
                        display: 'inline-block',
                        color: 'var(--color-primary, #6c5ce7)',
                        textDecoration: 'underline',
                        fontSize: '0.9rem',
                        marginBottom: '1.5rem',
                    }}
                >
                    Leer términos completos (versión {TERMS_VERSION})
                </Link>

                {error && (
                    <div style={{
                        background: '#fee',
                        color: '#c33',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        marginBottom: '1rem',
                    }}>
                        {error}
                    </div>
                )}

                <button
                    onClick={handleAccept}
                    disabled={accepting}
                    style={{
                        width: '100%',
                        padding: '0.875rem',
                        background: 'var(--color-primary, #6c5ce7)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '1rem',
                        fontWeight: 600,
                        cursor: accepting ? 'not-allowed' : 'pointer',
                        opacity: accepting ? 0.7 : 1,
                        transition: 'opacity 0.2s',
                    }}
                >
                    {accepting ? 'Guardando...' : 'Acepto los Términos y Condiciones'}
                </button>

                <p style={{
                    color: '#aaa',
                    fontSize: '0.75rem',
                    marginTop: '1rem',
                }}>
                    Versión {TERMS_VERSION}
                </p>
            </div>
        </div>
    )
}
