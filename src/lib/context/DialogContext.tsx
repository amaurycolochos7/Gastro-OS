'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface ConfirmOptions {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'primary'
}

interface AlertOptions {
    title: string
    message: string
    buttonText?: string
    variant?: 'danger' | 'warning' | 'success' | 'primary'
}

interface DialogContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>
    alert: (options: AlertOptions) => Promise<void>
}

const DialogContext = createContext<DialogContextType | null>(null)

export function useDialog() {
    const context = useContext(DialogContext)
    if (!context) {
        throw new Error('useDialog must be used within DialogProvider')
    }
    return context
}

export function DialogProvider({ children }: { children: ReactNode }) {
    const [confirmState, setConfirmState] = useState<{
        options: ConfirmOptions
        resolve: (value: boolean) => void
    } | null>(null)

    const [alertState, setAlertState] = useState<{
        options: AlertOptions
        resolve: () => void
    } | null>(null)

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({ options, resolve })
        })
    }, [])

    const alert = useCallback((options: AlertOptions): Promise<void> => {
        return new Promise((resolve) => {
            setAlertState({ options, resolve })
        })
    }, [])

    const handleConfirm = (result: boolean) => {
        confirmState?.resolve(result)
        setConfirmState(null)
    }

    const handleAlertClose = () => {
        alertState?.resolve()
        setAlertState(null)
    }

    const getButtonClass = (variant: string = 'primary') => {
        switch (variant) {
            case 'danger': return 'btn btn-danger'
            case 'warning': return 'btn btn-warning'
            case 'success': return 'btn btn-success'
            default: return 'btn btn-primary'
        }
    }

    return (
        <DialogContext.Provider value={{ confirm, alert }}>
            {children}

            {/* Confirm Modal */}
            {confirmState && (
                <div className="modal-overlay" style={{ zIndex: 300 }}>
                    <div className="dialog-box">
                        <h3 className="dialog-title">{confirmState.options.title}</h3>
                        <p className="dialog-message">{confirmState.options.message}</p>
                        <div className="dialog-actions">
                            <button
                                className="btn btn-secondary"
                                onClick={() => handleConfirm(false)}
                            >
                                {confirmState.options.cancelText || 'Cancelar'}
                            </button>
                            <button
                                className={getButtonClass(confirmState.options.variant)}
                                onClick={() => handleConfirm(true)}
                            >
                                {confirmState.options.confirmText || 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Alert Modal */}
            {alertState && (
                <div className="modal-overlay" style={{ zIndex: 300 }}>
                    <div className="dialog-box">
                        <h3 className="dialog-title">{alertState.options.title}</h3>
                        <p className="dialog-message">{alertState.options.message}</p>
                        <div className="dialog-actions">
                            <button
                                className={getButtonClass(alertState.options.variant)}
                                onClick={handleAlertClose}
                            >
                                {alertState.options.buttonText || 'Aceptar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    )
}
