'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    XMarkIcon,
    KeyIcon,
    ShieldCheckIcon,
    ClipboardDocumentIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    LinkIcon,
} from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/Toast';

interface AccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountInfo: {
        uuid?: string | null;
        email?: string | null;
    };
    onAccountUpdated: () => void;
}

type ModalView =
    | 'main'            // Show options based on account type
    | 'unlink-stremio'  // Confirm: keep UUID only
    | 'unlink-uuid'     // Confirm: keep Stremio only
    | 'set-credentials' // Add/change UUID + password
    | 'link-stremio'    // Link Stremio via OAuth (redirects to login)
    | 'success';        // Show result (e.g., UUID)

/**
 * Account management modal for the PanelSwitcher dropdown.
 * Allows users to manage their auth methods (UUID/Stremio linking).
 */
export function AccountModal({ isOpen, onClose, accountInfo, onAccountUpdated }: AccountModalProps) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const [view, setView] = useState<ModalView>('main');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [resultUuid, setResultUuid] = useState<string | null>(null);
    const [resultMessage, setResultMessage] = useState<string>('');
    const [copied, setCopied] = useState(false);

    const hasUuid = !!accountInfo.uuid;
    const hasStremio = !!accountInfo.email;
    const hasBoth = hasUuid && hasStremio;

    const resetState = () => {
        setView('main');
        setPassword('');
        setConfirmPassword('');

        setError(null);
        setIsLoading(false);
        setResultUuid(null);
        setResultMessage('');
        setCopied(false);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    // Keep UUID only — remove Stremio
    const handleUnlinkStremio = async () => {
        if (!password) {
            setError('Password is required');
            return;
        }
        setError(null);
        setIsLoading(true);
        try {
            const result = await api.unlinkStremio(password);
            setResultUuid(result.uuid);
            setResultMessage(result.message);
            setView('success');
            onAccountUpdated();
            toast.success('Stremio unlinked — UUID only');
        } catch (err: any) {
            setError(err.message || 'Failed to unlink Stremio');
        } finally {
            setIsLoading(false);
        }
    };

    // Keep Stremio only — remove UUID
    const handleUnlinkUuid = async () => {
        setError(null);
        setIsLoading(true);
        try {
            const result = await api.unlinkUuid();
            setResultMessage(result.message);
            setView('success');
            onAccountUpdated();
            toast.success('UUID removed — Stremio only');
        } catch (err: any) {
            setError(err.message || 'Failed to remove UUID');
        } finally {
            setIsLoading(false);
        }
    };

    // Set/change UUID + password
    const handleSetCredentials = async () => {
        if (!password || password.length < 4) {
            setError('Password must be at least 4 characters');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        setError(null);
        setIsLoading(true);
        try {
            const result = await api.setCredentials(password);
            setResultUuid(result.uuid);
            setResultMessage(result.message);
            setView('success');
            onAccountUpdated();
            toast.success(hasUuid ? 'Password updated' : 'UUID & password set');
        } catch (err: any) {
            setError(err.message || 'Failed to set credentials');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyUuid = (uuid: string) => {
        navigator.clipboard.writeText(uuid);
        setCopied(true);
        toast.success('UUID copied to clipboard');
        setTimeout(() => setCopied(false), 2000);
    };

    // Link Stremio — redirect to login page with admin Stremio mode
    const handleLinkStremio = () => {
        // The login page already supports Stremio login for admin accounts.
        // When they log in with Stremio there, it links to their account.
        window.location.href = '/login?mode=admin&linkStremio=1';
    };

    const renderMain = () => (
        <div className="space-y-3">
            {/* Current status */}
            <div
                className="rounded-xl p-4 space-y-2"
                style={{ backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-surface-border)' }}
            >
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hasUuid ? 'var(--color-success)' : 'var(--color-text-subtle)' }} />
                    <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                        UUID: {hasUuid ? <span className="font-mono text-xs opacity-70">{accountInfo.uuid}</span> : <span style={{ color: 'var(--color-text-muted)' }}>Not set</span>}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hasStremio ? 'var(--color-success)' : 'var(--color-text-subtle)' }} />
                    <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                        Stremio: {hasStremio ? (
                            <span className="opacity-70">
                                {accountInfo.email}
                            </span>
                        ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>Unlinked</span>
                        )}
                    </span>
                </div>
            </div>

            {/* Actions based on account type */}
            {hasBoth && (
                <>
                    <button
                        onClick={() => { setView('unlink-uuid'); setError(null); setPassword(''); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                        style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-surface-border)'; }}
                    >
                        <ShieldCheckIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                        <div className="text-left">
                            <p className="text-sm font-medium">Keep Stremio Only</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Remove UUID & password</p>
                        </div>
                    </button>

                    <button
                        onClick={() => { setView('unlink-stremio'); setError(null); setPassword(''); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                        style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-warning)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-surface-border)'; }}
                    >
                        <KeyIcon className="w-5 h-5" style={{ color: 'var(--color-warning)' }} />
                        <div className="text-left">
                            <p className="text-sm font-medium">Keep UUID Only</p>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Unlink Stremio account</p>
                        </div>
                    </button>
                </>
            )}

            {/* Stremio-only: add credentials */}
            {hasStremio && !hasUuid && (
                <button
                    onClick={() => { setView('set-credentials'); setError(null); setPassword(''); setConfirmPassword(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                    style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-surface-border)'; }}
                >
                    <KeyIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                    <div className="text-left">
                        <p className="text-sm font-medium">Add UUID & Password</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Enable credential-based login</p>
                    </div>
                </button>
            )}

            {/* UUID-only: link Stremio */}
            {hasUuid && !hasStremio && (
                <button
                    onClick={handleLinkStremio}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                    style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-surface-border)'; }}
                >
                    <LinkIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                    <div className="text-left">
                        <p className="text-sm font-medium">Link Stremio</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Connect your Stremio account</p>
                    </div>
                </button>
            )}

            {/* Change password (always shown when UUID exists) */}
            {hasUuid && (
                <button
                    onClick={() => { setView('set-credentials'); setError(null); setPassword(''); setConfirmPassword(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                    style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-text-muted)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-surface-border)'; }}
                >
                    <KeyIcon className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                    <div className="text-left">
                        <p className="text-sm font-medium">Change Password</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Update your UUID password</p>
                    </div>
                </button>
            )}
        </div>
    );

    const renderUnlinkStremio = () => (
        <div className="space-y-4">
            <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ backgroundColor: 'var(--color-warning-muted, rgba(245, 158, 11, 0.1))' }}
            >
                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
                <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Keep UUID Only</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        This will unlink your Stremio account. You&apos;ll only be able to log in with your UUID and password.
                    </p>
                    <p className="text-xs mt-2 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                        Your UUID: {accountInfo.uuid}
                    </p>
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    Enter your password to confirm
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="Password"
                    className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                    style={{
                        backgroundColor: 'var(--color-bg-subtle)',
                        color: 'var(--color-text)',
                        border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUnlinkStremio(); }}
                />
                {error && (
                    <p className="mt-1.5 text-xs" style={{ color: 'var(--color-error)' }}>{error}</p>
                )}
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => setView('main')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleUnlinkStremio}
                    disabled={isLoading || !password}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                        backgroundColor: 'var(--color-warning)',
                        color: '#fff',
                        opacity: (isLoading || !password) ? 0.6 : 1,
                    }}
                >
                    {isLoading ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        'Confirm'
                    )}
                </button>
            </div>
        </div>
    );

    const renderUnlinkUuid = () => (
        <div className="space-y-4">
            <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ backgroundColor: 'var(--color-primary-muted)' }}
            >
                <ShieldCheckIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
                <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Keep Stremio Only</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        This will remove your UUID and password. You&apos;ll only be able to log in via Stremio ({accountInfo.email}).
                    </p>
                </div>
            </div>

            {error && (
                <p className="text-sm text-center" style={{ color: 'var(--color-error)' }}>{error}</p>
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => setView('main')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleUnlinkUuid}
                    disabled={isLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                        backgroundColor: 'var(--color-primary)',
                        color: 'var(--color-bg)',
                        opacity: isLoading ? 0.6 : 1,
                    }}
                >
                    {isLoading ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        'Confirm'
                    )}
                </button>
            </div>
        </div>
    );

    const renderSetCredentials = () => (
        <div className="space-y-4">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {hasUuid
                    ? 'Choose a new password for your account.'
                    : 'A UUID will be generated for you. Choose a password to enable credential-based login.'}
            </p>

            <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    New Password
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    placeholder="At least 4 characters"
                    className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                    style={{
                        backgroundColor: 'var(--color-bg-subtle)',
                        color: 'var(--color-text)',
                        border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
                    }}
                />
            </div>

            <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    Confirm Password
                </label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                    placeholder="Repeat password"
                    className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                    style={{
                        backgroundColor: 'var(--color-bg-subtle)',
                        color: 'var(--color-text)',
                        border: `1px solid ${error?.includes('match') ? 'var(--color-error)' : 'var(--color-surface-border)'}`,
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSetCredentials(); }}
                />
            </div>

            {error && (
                <p className="text-xs" style={{ color: 'var(--color-error)' }}>{error}</p>
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => setView('main')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{ backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)' }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSetCredentials}
                    disabled={isLoading || !password || !confirmPassword}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                        backgroundColor: 'var(--color-primary)',
                        color: 'var(--color-bg)',
                        opacity: (isLoading || !password || !confirmPassword) ? 0.6 : 1,
                    }}
                >
                    {isLoading ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        hasUuid ? 'Update Password' : 'Set Credentials'
                    )}
                </button>
            </div>
        </div>
    );

    const renderSuccess = () => (
        <div className="space-y-4 text-center">
            <div
                className="w-12 h-12 mx-auto rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--color-success-muted)' }}
            >
                <CheckIcon className="w-6 h-6" style={{ color: 'var(--color-success)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text)' }}>{resultMessage}</p>

            {resultUuid && (
                <div
                    className="rounded-xl p-3 flex items-center justify-between gap-2"
                    style={{ backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-surface-border)' }}
                >
                    <div className="text-left min-w-0">
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Your UUID</p>
                        <p className="text-sm font-mono truncate" style={{ color: 'var(--color-text)' }}>{resultUuid}</p>
                    </div>
                    <button
                        onClick={() => handleCopyUuid(resultUuid)}
                        className="flex-shrink-0 p-2 rounded-lg transition-all"
                        style={{ backgroundColor: 'var(--color-surface-hover)' }}
                    >
                        {copied ? (
                            <CheckIcon className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                        ) : (
                            <ClipboardDocumentIcon className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                        )}
                    </button>
                </div>
            )}

            <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bg)' }}
            >
                Done
            </button>
        </div>
    );

    const getTitle = () => {
        switch (view) {
            case 'main': return 'Account';
            case 'unlink-stremio': return 'Keep UUID Only';
            case 'unlink-uuid': return 'Keep Stremio Only';
            case 'set-credentials': return hasUuid ? 'Change Password' : 'Add Credentials';
            case 'link-stremio': return 'Link Stremio';
            case 'success': return 'Success';
            default: return 'Account';
        }
    };

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100]"
                        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                        onClick={handleClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div
                            className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl pointer-events-auto"
                            style={{
                                backgroundColor: 'var(--color-surface)',
                                border: '1px solid var(--color-surface-border)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                                <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                                    {getTitle()}
                                </h3>
                                <button
                                    onClick={handleClose}
                                    className="p-1.5 rounded-lg transition-all"
                                    style={{ color: 'var(--color-text-muted)' }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-hover)'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="px-6 py-5">
                                {view === 'main' && renderMain()}
                                {view === 'unlink-stremio' && renderUnlinkStremio()}
                                {view === 'unlink-uuid' && renderUnlinkUuid()}
                                {view === 'set-credentials' && renderSetCredentials()}
                                {view === 'success' && renderSuccess()}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    if (!mounted) return null;
    return createPortal(modalContent, document.body);
}
