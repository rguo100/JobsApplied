import { auth, isFirebaseConfigured } from "../firebase/config";
import { onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from "firebase/auth/web-extension";
import {
  subscribeToApplication,
  markJobAsApplied,
  deleteApplication,
} from "../services/applicationService";
import { ExtensionMessage, Job } from "../types/job";
import { Application } from "../types/application";
import {
  beginSubscription,
  invalidateSubscriptions,
  isCurrentSubscription,
} from "./subscriptionGeneration";

// Track active content script ports and their subscriptions
interface PortSubscription {
  source: string;
  externalJobId: string;
  unsubscribe: () => void;
}

interface PortState {
  subscriptionGeneration: number;
  subscription: PortSubscription | null;
}

const activePorts = new Map<chrome.runtime.Port, PortState>();

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

    activePorts.set(port, {
      subscriptionGeneration: 0,
      subscription: null,
    });

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
        const initialState = activePorts.get(port);
        if (!initialState) return;
        const generation = beginSubscription(initialState);

        // Verify auth
        if (!auth?.currentUser) {
          const synced = await attemptSilentSync();
          const currentState = activePorts.get(port);
          if (!isCurrentSubscription(currentState, generation)) {
            return;
          }
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

        const currentState = activePorts.get(port);
        if (!currentState || !isCurrentSubscription(currentState, generation)) {
          return;
        }

        // Only the latest subscribe request may replace the active listener.
        currentState.subscription?.unsubscribe();
        currentState.subscription = null;

        const uid = auth.currentUser.uid;
        const unsubscribe = subscribeToApplication(
          uid,
          source,
          externalJobId,
          (application: Application | null) => {
            if (!isCurrentSubscription(activePorts.get(port), generation)) return;
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
            if (!isCurrentSubscription(activePorts.get(port), generation)) return;
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

        const stateAfterSetup = activePorts.get(port);
        if (!stateAfterSetup || !isCurrentSubscription(stateAfterSetup, generation)) {
          unsubscribe();
          return;
        }
        stateAfterSetup.subscription = {
          source,
          externalJobId,
          unsubscribe,
        };
        return;
      }

      if (msg.type === "APPLICATION_UNSUBSCRIBE") {
        const state = activePorts.get(port);
        if (state) {
          invalidateSubscriptions(state);
          state.subscription?.unsubscribe();
          state.subscription = null;
        }
        return;
      }

      if (msg.type === "MARK_JOB_APPLIED") {
        const job = msg.job as Job;
        const { requestId, source, externalJobId } = msg;
        if (!auth?.currentUser) {
          const synced = await attemptSilentSync();
          if (!synced || !auth?.currentUser) {
            port.postMessage({
              type: "MARK_JOB_APPLIED_RESPONSE",
              requestId,
              source,
              externalJobId,
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
            requestId,
            source,
            externalJobId,
            success: true,
          } as ExtensionMessage);
        } catch (err) {
          port.postMessage({
            type: "MARK_JOB_APPLIED_RESPONSE",
            requestId,
            source,
            externalJobId,
            success: false,
            error: err instanceof Error ? err.message : "Failed to mark job as applied.",
          } as ExtensionMessage);
        }
        return;
      }

      if (msg.type === "DELETE_APPLICATION") {
        const { requestId, source, externalJobId } = msg;
        if (!auth?.currentUser) {
          const synced = await attemptSilentSync();
          if (!synced || !auth?.currentUser) {
            port.postMessage({
              type: "DELETE_APPLICATION_RESPONSE",
              requestId,
              source,
              externalJobId,
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
            requestId,
            source,
            externalJobId,
            success: true,
          } as ExtensionMessage);
        } catch (err) {
          port.postMessage({
            type: "DELETE_APPLICATION_RESPONSE",
            requestId,
            source,
            externalJobId,
            success: false,
            error: err instanceof Error ? err.message : "Failed to remove application.",
          } as ExtensionMessage);
        }
        return;
      }
    });

    port.onDisconnect.addListener(() => {
      const state = activePorts.get(port);
      if (state) {
        invalidateSubscriptions(state);
        state.subscription?.unsubscribe();
        state.subscription = null;
      }
      activePorts.delete(port);
    });
  });
}
