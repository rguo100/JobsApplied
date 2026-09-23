import { auth, isFirebaseConfigured } from "../firebase/config";
import { onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from "firebase/auth/web-extension";
import {
  subscribeToApplication,
  markJobAsApplied,
  deleteApplication,
} from "../services/applicationService";
import { ExtensionMessage, Job } from "../types/job";
import { Application } from "../types/application";

// Track active content script ports and their subscriptions
interface PortSubscription {
  source: string;
  externalJobId: string;
  unsubscribe: () => void;
}

const activePorts = new Map<chrome.runtime.Port, PortSubscription | null>();

/**
 * Attempts silent token sync using cached Chrome identity credentials
 */
async function attemptSilentSync(): Promise<boolean> {
  if (!isFirebaseConfigured() || !auth) {
    return false;
  }
  if (auth.currentUser) {
    return true;
  }

  if (typeof chrome === "undefined" || !chrome.identity?.getAuthToken) {
    return false;
  }

  try {
    const token = await new Promise<string | undefined>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (tok) => {
        if (chrome.runtime.lastError || !tok) {
          resolve(undefined);
        } else {
          resolve(tok);
        }
      });
    });

    if (token) {
      const credential = GoogleAuthProvider.credential(null, token);
      await signInWithCredential(auth, credential);
      return true;
    }
  } catch (err) {
    console.warn("[AppliedYet Background] Silent auth sync error:", err);
  }
  return false;
}

// Initialize auth state tracking
if (auth) {
  onAuthStateChanged(auth, (user) => {
    // Broadcast updated auth status to all connected content script ports
    const isAuthenticated = !!user;
    const uid = user?.uid;
    for (const port of activePorts.keys()) {
      try {
        port.postMessage({
          type: "AUTH_STATE_RESPONSE",
          isAuthenticated,
          uid,
        } as ExtensionMessage);
      } catch {
        // Port may be closing
      }
    }
  });

  // Attempt initial silent sync in background
  attemptSilentSync();
}

/**
 * Listen for long-lived port connections from content script widget
 */
if (typeof chrome !== "undefined" && chrome.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "appliedyet-widget") {
      return;
    }

    activePorts.set(port, null);

    // Initial auth check
    const sendAuthStatus = async () => {
      let isAuthed = !!auth?.currentUser;
      if (!isAuthed) {
        isAuthed = await attemptSilentSync();
      }
      try {
        port.postMessage({
          type: "AUTH_STATE_RESPONSE",
          isAuthenticated: isAuthed,
          uid: auth?.currentUser?.uid,
        } as ExtensionMessage);
      } catch {
        // Port closed
      }
    };

    sendAuthStatus();

    port.onMessage.addListener(async (msg: ExtensionMessage) => {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "AUTH_STATE_REQUEST") {
        await sendAuthStatus();
        return;
      }

      if (msg.type === "APPLICATION_SUBSCRIBE") {
        const { source, externalJobId } = msg;

        // Clean up previous subscription for this port
        const existing = activePorts.get(port);
        if (existing) {
          existing.unsubscribe();
          activePorts.set(port, null);
        }

        // Verify auth
        if (!auth?.currentUser) {
          const synced = await attemptSilentSync();
          if (!synced || !auth?.currentUser) {
            try {
              port.postMessage({
                type: "AUTH_STATE_RESPONSE",
                isAuthenticated: false,
              } as ExtensionMessage);
            } catch {
              // Port closed
            }
            return;
          }
        }

        const uid = auth.currentUser.uid;
        const unsubscribe = subscribeToApplication(
          uid,
          source,
          externalJobId,
          (application: Application | null) => {
            try {
              port.postMessage({
                type: "APPLICATION_DATA",
                source,
                externalJobId,
                application,
              } as ExtensionMessage);
            } catch {
              // Port closed
            }
          },
          (error: Error) => {
            try {
              port.postMessage({
                type: "APPLICATION_ERROR",
                source,
                externalJobId,
                error: error.message || "Failed to load application status.",
              } as ExtensionMessage);
            } catch {
              // Port closed
            }
          }
        );

        activePorts.set(port, {
          source,
          externalJobId,
          unsubscribe,
        });
        return;
      }

      if (msg.type === "APPLICATION_UNSUBSCRIBE") {
        const existing = activePorts.get(port);
        if (existing) {
          existing.unsubscribe();
          activePorts.set(port, null);
        }
        return;
      }

      if (msg.type === "MARK_JOB_APPLIED") {
        const job = msg.job as Job;
        if (!auth?.currentUser) {
          const synced = await attemptSilentSync();
          if (!synced || !auth?.currentUser) {
            port.postMessage({
              type: "MARK_JOB_APPLIED_RESPONSE",
              success: false,
              error: "Not authenticated. Please sign in via the AppliedYet extension.",
            } as ExtensionMessage);
            return;
          }
        }

        try {
          await markJobAsApplied(auth.currentUser.uid, job);
          port.postMessage({
            type: "MARK_JOB_APPLIED_RESPONSE",
            success: true,
          } as ExtensionMessage);
        } catch (err) {
          port.postMessage({
            type: "MARK_JOB_APPLIED_RESPONSE",
            success: false,
            error: err instanceof Error ? err.message : "Failed to mark job as applied.",
          } as ExtensionMessage);
        }
        return;
      }

      if (msg.type === "DELETE_APPLICATION") {
        const { source, externalJobId } = msg;
        if (!auth?.currentUser) {
          const synced = await attemptSilentSync();
          if (!synced || !auth?.currentUser) {
            port.postMessage({
              type: "DELETE_APPLICATION_RESPONSE",
              success: false,
              error: "Not authenticated. Please sign in via the AppliedYet extension.",
            } as ExtensionMessage);
            return;
          }
        }

        try {
          await deleteApplication(auth.currentUser.uid, source, externalJobId);
          port.postMessage({
            type: "DELETE_APPLICATION_RESPONSE",
            success: true,
          } as ExtensionMessage);
        } catch (err) {
          port.postMessage({
            type: "DELETE_APPLICATION_RESPONSE",
            success: false,
            error: err instanceof Error ? err.message : "Failed to remove application.",
          } as ExtensionMessage);
        }
        return;
      }
    });

    port.onDisconnect.addListener(() => {
      const existing = activePorts.get(port);
      if (existing) {
        existing.unsubscribe();
      }
      activePorts.delete(port);
    });
  });
}
