import Link from 'next/link'

const TERMS_VERSION = 'v2026-02-12'

export const metadata = {
    title: 'Términos y Condiciones — GastroOS',
}

export default function TermsPage() {
    return (
        <div style={{
            maxWidth: '720px',
            margin: '0 auto',
            padding: '2rem 1.5rem',
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            color: 'var(--color-text, #1a1a2e)',
            lineHeight: 1.7,
        }}>
            <Link href="/" style={{ color: 'var(--color-primary, #6c5ce7)', textDecoration: 'none', fontSize: '0.875rem' }}>
                ← Volver al inicio
            </Link>

            <h1 style={{ fontSize: '1.75rem', marginTop: '1.5rem', marginBottom: '0.25rem' }}>
                Términos y Condiciones de Uso
            </h1>
            <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '2rem' }}>
                Versión {TERMS_VERSION} — Última actualización: 12 de febrero de 2026
            </p>

            <section>
                <h2>1. Aceptación de los Términos</h2>
                <p>
                    Al registrarte y utilizar GastroOS (&quot;el Servicio&quot;), aceptas estos Términos y Condiciones
                    en su totalidad. Si no estás de acuerdo, no utilices el Servicio.
                </p>
            </section>

            <section>
                <h2>2. Descripción del Servicio</h2>
                <p>
                    GastroOS es una plataforma de gestión para negocios gastronómicos que incluye
                    punto de venta, gestión de menú, inventario, equipo de trabajo y caja registradora.
                    El Servicio se proporciona &quot;tal cual&quot; y puede estar sujeto a cambios.
                </p>
            </section>

            <section>
                <h2>3. Cuentas de Usuario</h2>
                <p>
                    Eres responsable de mantener la confidencialidad de tu contraseña y de todas las
                    actividades que ocurran bajo tu cuenta. Debes notificarnos inmediatamente de cualquier
                    uso no autorizado.
                </p>
            </section>

            <section>
                <h2>4. Uso Aceptable</h2>
                <p>Te comprometes a:</p>
                <ul>
                    <li>Proporcionar información veraz y actualizada</li>
                    <li>No utilizar el Servicio para actividades ilegales</li>
                    <li>No intentar acceder a datos de otros negocios</li>
                    <li>No interferir con el funcionamiento del Servicio</li>
                </ul>
            </section>

            <section>
                <h2>5. Datos y Privacidad</h2>
                <p>
                    Tus datos de negocio te pertenecen. Utilizamos medidas de seguridad razonables
                    para proteger tu información, incluyendo aislamiento por negocio (multi-tenant),
                    cifrado en tránsito y políticas de acceso a nivel de base de datos.
                </p>
                <p>
                    No vendemos ni compartimos tus datos con terceros, excepto cuando sea requerido
                    por ley o sea necesario para la operación del Servicio (ej. proveedor de hosting).
                </p>
            </section>

            <section>
                <h2>6. Límites del Servicio</h2>
                <p>
                    El Servicio puede incluir límites en el número de productos, ventas diarias o
                    usuarios según tu plan. Estos límites están sujetos a cambios con previo aviso.
                </p>
            </section>

            <section>
                <h2>7. Disponibilidad</h2>
                <p>
                    No garantizamos disponibilidad ininterrumpida del Servicio. Realizaremos esfuerzos
                    razonables para mantener el Servicio operativo, pero puede haber interrupciones
                    por mantenimiento o causas fuera de nuestro control.
                </p>
            </section>

            <section>
                <h2>8. Limitación de Responsabilidad</h2>
                <p>
                    En la máxima medida permitida por la ley, GastroOS no será responsable por
                    daños indirectos, incidentales o consecuentes derivados del uso del Servicio.
                </p>
            </section>

            <section>
                <h2>9. Modificaciones</h2>
                <p>
                    Nos reservamos el derecho de modificar estos términos. Los cambios serán
                    comunicados mediante el Servicio y requerirán nueva aceptación para continuar
                    utilizándolo.
                </p>
            </section>

            <section>
                <h2>10. Contacto</h2>
                <p>
                    Para preguntas sobre estos términos, contacta a soporte a través de los canales
                    disponibles en la aplicación.
                </p>
            </section>

            <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid #eee' }} />
            <p style={{ color: '#888', fontSize: '0.8rem', textAlign: 'center' }}>
                GastroOS — Versión de términos: {TERMS_VERSION}
            </p>
        </div>
    )
}
