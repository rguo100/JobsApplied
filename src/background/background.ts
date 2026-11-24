import { auth, isFirebaseConfigured } from "../firebase/config";
import { onAuthStateChanged, GoogleAuthProvider, signInWithCredential } from "firebase/auth/web-extension";
import { isInvalidCredentialError, evictCachedAuthToken } from "../utils/authRecovery";
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
import { linkLinkedInPostingToAtsJob } from "../services/atsJobService";
import type { LinkedInApplyStartedMessage } from "../content/linkedinApplyDiscovery";
import type {
  GreenhouseAssociationResponse,
  GreenhouseConfirmLinkMessage,
  GreenhouseDetectedMessage,
  GreenhouseProfileGetMessage,
  GreenhouseProfileResponse,
  GreenhouseProfileSaveMessage,
} from "../types/greenhouse";
import {
  getApplicantProfile,
  upsertApplicantProfile,
} from "../services/applicantProfileService";
import type { ApplicantProfileInput } from "../types/applicantProfile";
import {
  createDiscoverySession,
  DiscoverySession,
  markSessionLinked,
  removeExpiredSessions,
  resolveAssociation,
} from "./discoverySession";

const DISCOVERY_STORAGE_KEY = "appliedyet.discoverySessions.v1";

function diagnosticRequestId(message: unknown): string {
  if (message && typeof message === "object" && "requestId" in message && typeof message.requestId === "string") {
    return message.requestId;
  }
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`;
}

function logMessageStage(requestId: string, stage: string, details: Record<string, unknown> = {}): void {
  console.info("[AppliedYet Background] Greenhouse message.", { requestId, stage, ...details });
}

async function readDiscoverySessions(): Promise<DiscoverySession[]> {
  const stored = await chrome.storage.session.get(DISCOVERY_STORAGE_KEY);
  const sessions = Array.isArray(stored[DISCOVERY_STORAGE_KEY])
    ? (stored[DISCOVERY_STORAGE_KEY] as DiscoverySession[])
    : [];
  const active = removeExpiredSessions(sessions, Date.now());
  if (active.length !== sessions.length) {
    await chrome.storage.session.set({ [DISCOVERY_STORAGE_KEY]: active });
  }
  return active;
}

async function writeDiscoverySessions(sessions: DiscoverySession[]): Promise<void> {
  await chrome.storage.session.set({
    [DISCOVERY_STORAGE_KEY]: removeExpiredSessions(sessions, Date.now()),
  });
}

function createSessionId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function requireAuthenticatedUid(requestId?: string): Promise<string> {
  const startedAt = Date.now();
  if (auth) await auth.authStateReady();
  if (requestId) {
    logMessageStage(requestId, "auth-ready", {
      durationMs: Date.now() - startedAt,
      signedIn: Boolean(auth?.currentUser),
    });
  }
  if (!auth?.currentUser) await attemptSilentSync();
  if (!auth?.currentUser) {
    throw new Error("Sign in through AppliedYet before linking this job.");
  }
  return auth.currentUser.uid;
}

async function linkDiscoverySession(
  sessions: DiscoverySession[],
  session: DiscoverySession,
  targetTabId: number,
  message: GreenhouseDetectedMessage | GreenhouseConfirmLinkMessage
): Promise<GreenhouseAssociationResponse> {
  try {
    const uid = await requireAuthenticatedUid();
    await linkLinkedInPostingToAtsJob(uid, session.sourceJob.externalJobId, {
      atsJobId: message.atsJobId,
      canonicalUrl: message.canonicalUrl,
      company: session.sourceJob.company,
      title: message.title || session.sourceJob.title,
    });
    const updated = markSessionLinked(session, targetTabId, message.atsJobId);
    await writeDiscoverySessions(
      sessions.map((candidate) =>
        candidate.sessionId === session.sessionId ? updated : candidate
      )
    );
    return {
      status: "linked",
      atsJobId: message.atsJobId,
      linkedInPostingId: session.sourceJob.externalJobId,
    };
  } catch (error) {
    return {
      status: "error",
      atsJobId: message.atsJobId,
      error: error instanceof Error ? error.message : "Could not link this job.",
    };
  }
}

async function handleDiscoveryMessage(
  message:
    | LinkedInApplyStartedMessage
    | GreenhouseDetectedMessage
    | GreenhouseConfirmLinkMessage
    | GreenhouseProfileGetMessage
    | GreenhouseProfileSaveMessage,
  sender: chrome.runtime.MessageSender,
  requestId = diagnosticRequestId(message)
): Promise<GreenhouseAssociationResponse | GreenhouseProfileResponse | { success: boolean }> {
  if (message.type === "GREENHOUSE_PROFILE_GET") {
    try {
      const uid = await requireAuthenticatedUid(requestId);
      logMessageStage(requestId, "profile-read-started");
      const profile = await getApplicantProfile(uid);
      logMessageStage(requestId, "profile-read-completed", { exists: Boolean(profile) });
      if (!profile) return { status: "ok", profile: null };
      const {
        firstName,
        lastName,
        email,
        phone,
        city,
        region,
        country,
        linkedinUrl,
        githubUrl,
        portfolioUrl,
      } = profile;
      const safeProfile: ApplicantProfileInput = {
        firstName,
        lastName,
        email,
        ...(phone ? { phone } : {}),
        ...(city ? { city } : {}),
        ...(region ? { region } : {}),
        ...(country ? { country } : {}),
        ...(linkedinUrl ? { linkedinUrl } : {}),
        ...(githubUrl ? { githubUrl } : {}),
        ...(portfolioUrl ? { portfolioUrl } : {}),
      };
      return { status: "ok", profile: safeProfile };
    } catch (error) {
      logMessageStage(requestId, "profile-read-failed", {
        code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
      });
      const text = error instanceof Error ? error.message : "Could not load profile.";
      return text.includes("Sign in")
        ? { status: "signed_out", error: text }
        : { status: "error", error: text };
    }
  }

  if (message.type === "GREENHOUSE_PROFILE_SAVE") {
    try {
      const uid = await requireAuthenticatedUid(requestId);
      logMessageStage(requestId, "profile-write-started");
      await upsertApplicantProfile(uid, message.profile);
      logMessageStage(requestId, "profile-write-completed");
      return { status: "ok", profile: message.profile };
    } catch (error) {
      logMessageStage(requestId, "profile-write-failed", {
        code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
      });
      const text = error instanceof Error ? error.message : "Could not save profile.";
      return text.includes("Sign in")
        ? { status: "signed_out", error: text }
        : { status: "error", error: text };
    }
  }

  if (message.type === "LINKEDIN_APPLY_STARTED") {
    if (sender.tab?.id === undefined) return { success: false };
    const sessions = await readDiscoverySessions();
    sessions.push(
      createDiscoverySession(createSessionId(), sender.tab.id, message.job, Date.now())
    );
    await writeDiscoverySessions(sessions);
    return { success: true };
  }

  const targetTabId = sender.tab?.id;
  if (targetTabId === undefined) {
    return { status: "unlinked", atsJobId: message.atsJobId };
  }
  const sessions = await readDiscoverySessions();

  if (message.type === "GREENHOUSE_CONFIRM_LINK") {
    const session = sessions.find((candidate) => candidate.sessionId === message.sessionId);
    if (!session) {
      return {
        status: "unlinked",
        atsJobId: message.atsJobId,
        error: "The LinkedIn discovery session expired.",
      };
    }
    return linkDiscoverySession(sessions, session, targetTabId, message);
  }

  const resolution = resolveAssociation(
    sessions,
    targetTabId,
    sender.tab?.openerTabId,
    message.atsJobId,
    Date.now()
  );
  if (resolution.kind === "linked" && resolution.session) {
    return {
      status: "linked",
      atsJobId: message.atsJobId,
      linkedInPostingId: resolution.session.sourceJob.externalJobId,
    };
  }
  if (resolution.kind === "automatic" && resolution.session) {
    return linkDiscoverySession(
      sessions,
      resolution.session,
      targetTabId,
      message
    );
  }
  if (resolution.kind === "ambiguous") {
    return {
      status: "needs_confirmation",
      atsJobId: message.atsJobId,
      candidates: resolution.candidates.map((session) => ({
        sessionId: session.sessionId,
        linkedInPostingId: session.sourceJob.externalJobId,
        title: session.sourceJob.title,
        company: session.sourceJob.company,
      })),
    };
  }
  return { status: "unlinked", atsJobId: message.atsJobId };
}

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
let silentSyncInFlight: Promise<boolean> | null = null;

function attemptSilentSync(): Promise<boolean> {
  if (silentSyncInFlight) return silentSyncInFlight;
  silentSyncInFlight = performSilentSync().finally(() => {
    silentSyncInFlight = null;
  });
  return silentSyncInFlight;
}

async function performSilentSync(): Promise<boolean> {
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
      try {
        const credential = GoogleAuthProvider.credential(null, token);
        await signInWithCredential(auth, credential);
        return true;
      } catch (signErr) {
        if (isInvalidCredentialError(signErr)) {
          console.warn(
            "[AppliedYet Background] Silent auth rejected invalid credential, evicting cached token"
          );
          await evictCachedAuthToken(token);
        } else {
          console.warn("[AppliedYet Background] Silent auth sync error:", signErr);
        }
        return false;
      }
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

// Short-lived LinkedIn → Greenhouse discovery messages use one-off requests so
// they survive either page replacing its content script during navigation.
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      ![
        "LINKEDIN_APPLY_STARTED",
        "GREENHOUSE_JOB_DETECTED",
        "GREENHOUSE_CONFIRM_LINK",
        "GREENHOUSE_PROFILE_GET",
        "GREENHOUSE_PROFILE_SAVE",
      ].includes(String(message.type))
    ) {
      return false;
    }
    const requestId = diagnosticRequestId(message);
    logMessageStage(requestId, "received", { type: String(message.type) });
    handleDiscoveryMessage(
      message as
        | LinkedInApplyStartedMessage
        | GreenhouseDetectedMessage
        | GreenhouseConfirmLinkMessage
        | GreenhouseProfileGetMessage
        | GreenhouseProfileSaveMessage,
      sender,
      requestId
    )
      .then((response) => {
        sendResponse(response);
        logMessageStage(requestId, "response-delivered", {
          status: "status" in response ? response.status : "success",
        });
      })
      .catch((error) => {
        sendResponse({
          status: "error",
          atsJobId: "atsJobId" in message ? String(message.atsJobId) : "",
          error: error instanceof Error ? error.message : "Discovery failed.",
        });
        logMessageStage(requestId, "response-delivered-after-error");
      });
    return true;
  });
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
