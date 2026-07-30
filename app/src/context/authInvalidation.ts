type AuthInvalidationHandler = () => void;

export interface AuthInvalidationActions {
    invalidateRequests: () => void;
    clearUser: () => void;
    stopLoading: () => void;
    clearCache: () => void;
}

let authInvalidationHandler: AuthInvalidationHandler | null = null;

export function createAuthInvalidationHandler(
    actions: AuthInvalidationActions,
): AuthInvalidationHandler {
    return () => {
        actions.invalidateRequests();
        actions.clearUser();
        actions.stopLoading();
        actions.clearCache();
    };
}

export function registerAuthInvalidationHandler(handler: AuthInvalidationHandler) {
    authInvalidationHandler = handler;

    return () => {
        if (authInvalidationHandler === handler) {
            authInvalidationHandler = null;
        }
    };
}

export function invalidateAuthSession() {
    authInvalidationHandler?.();
}
