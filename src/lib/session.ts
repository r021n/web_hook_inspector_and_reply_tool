export function generateSessionId(): string {
    return crypto.randomUUID();
}

export function isValidSessionId(sessionId: string): boolean {
    if(!sessionId || typeof sessionId !== 'string') {
        return false;
    }
    return /^[a-zA-Z0-9_-]{8,64}$/.test(sessionId);
}