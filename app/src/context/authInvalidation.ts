type AuthInvalidationHandler = () => void;

let authInvalidationHandler: AuthInvalidationHandler | null = null;

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
