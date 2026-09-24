/**
 * AppliedYet Auth Token Recovery Helpers
 * Handles invalid credential detection and eviction from Chrome Identity cache
 */

export interface AuthDiagnosticDetails {
  [key: string]: string | number | boolean | null | undefined;
}

export function isInvalidCredentialError(err: unknown): boolean {
  if (!err) return false;

  if (typeof err === "string") {
    const lower = err.toLowerCase();
    return (
      lower.includes("auth/invalid-credential") ||
      lower.includes("invalid-credential") ||
      lower.includes("invalid credential") ||
      (lower.includes("unsuccessful check authorization response") && lower.includes("invalid value"))
    );
  }

  if (typeof err === "object") {
    const candidate = err as { code?: unknown; message?: unknown };
    const codeStr = typeof candidate.code === "string" ? candidate.code.toLowerCase() : "";
    const msgStr = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

    if (codeStr === "auth/invalid-credential" || codeStr.includes("invalid-credential")) {
      return true;
    }

    if (
      msgStr.includes("auth/invalid-credential") ||
      msgStr.includes("invalid-credential") ||
      msgStr.includes("invalid credential") ||
      (msgStr.includes("unsuccessful check authorization response") && msgStr.includes("invalid value"))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Evict a specific OAuth access token from Chrome's Identity cache.
 * Must tolerate missing chrome.identity, callback errors, and never expose the token.
 */
export function evictCachedAuthToken(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!token || typeof token !== "string") {
      resolve(false);
      return;
    }

    if (
      typeof chrome === "undefined" ||
      !chrome.identity ||
      typeof chrome.identity.removeCachedAuthToken !== "function"
    ) {
      resolve(false);
      return;
    }

    try {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        if (chrome.runtime?.lastError) {
          console.warn(
            "[AppliedYet Auth] removeCachedAuthToken lastError:",
            chrome.runtime.lastError.message
          );
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (err) {
      console.warn(
        "[AppliedYet Auth] removeCachedAuthToken threw exception:",
        err instanceof Error ? err.message : String(err)
      );
      resolve(false);
    }
  });
}

export interface SilentSyncHooks {
  getCachedToken: () => Promise<string | null>;
  authenticateWithToken: (token: string, source: "silent_sync") => Promise<void>;
  evictToken: (token: string) => Promise<boolean>;
  recordDiagnostic?: (stage: string, details?: AuthDiagnosticDetails) => void;
}

export interface SilentSyncResult {
  recoveredFromInvalidToken: boolean;
  error: unknown | null;
  authenticated: boolean;
}

export async function performSilentSyncWithRecovery(
  hooks: SilentSyncHooks
): Promise<SilentSyncResult> {
  const cachedToken = await hooks.getCachedToken();
  if (!cachedToken) {
    return { recoveredFromInvalidToken: false, error: null, authenticated: false };
  }

  try {
    await hooks.authenticateWithToken(cachedToken, "silent_sync");
    return { recoveredFromInvalidToken: false, error: null, authenticated: true };
  } catch (err: unknown) {
    if (isInvalidCredentialError(err)) {
      await hooks.evictToken(cachedToken);
      hooks.recordDiagnostic?.("silent_sync_invalid_token_recovered_clean_signed_out");
      return { recoveredFromInvalidToken: true, error: null, authenticated: false };
    }
    return { recoveredFromInvalidToken: false, error: err, authenticated: false };
  }
}

export interface InteractiveAuthHooks {
  requestInteractiveToken: () => Promise<string>;
  authenticateWithToken: (token: string, source: "interactive") => Promise<void>;
  evictToken: (token: string) => Promise<boolean>;
  recordDiagnostic?: (stage: string, details?: AuthDiagnosticDetails) => void;
}

export async function performInteractiveAuthWithRecovery(
  hooks: InteractiveAuthHooks
): Promise<void> {
  const initialToken = await hooks.requestInteractiveToken();

  try {
    await hooks.authenticateWithToken(initialToken, "interactive");
  } catch (firstErr: unknown) {
    if (!isInvalidCredentialError(firstErr)) {
      throw firstErr;
    }

    // Invalid credential detected: evict rejected token and retry ONCE
    await hooks.evictToken(initialToken);
    hooks.recordDiagnostic?.("interactive_sign_in_retrying_after_invalid_token");

    const freshToken = await hooks.requestInteractiveToken();
    if (freshToken === initialToken) {
      hooks.recordDiagnostic?.("interactive_sign_in_retry_same_token_prevented");
      throw new Error("Chrome Identity returned the same rejected token. Please try again.");
    }

    // Second and final attempt. Any error thrown here is final and will not be retried.
    await hooks.authenticateWithToken(freshToken, "interactive");
  }
}
