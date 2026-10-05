export interface PasswordCheck {
    test: boolean
    label: string
}

export function validatePasswordChecks(pass: string): PasswordCheck[] {
    return [
        { test: pass.length >= 8, label: 'Mínimo 8 caracteres' },
        { test: /[A-Z]/.test(pass), label: 'Una mayúscula' },
        { test: /[0-9]/.test(pass), label: 'Un número' },
    ]
}
