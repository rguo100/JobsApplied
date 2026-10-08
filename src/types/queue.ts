import type { Timestamp } from "firebase/firestore";

export type ApplicationQueueStatus =
  | "draft"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

export type ApplicationQueueItemStatus =
  | "queued"
  | "opening"
  | "filling"
  | "needs_review"
  | "ready_to_submit"
  | "submitting"
  | "verifying"
  | "confirmed"
  | "failed"
  | "uncertain"
  | "paused";

export interface ApplicationQueue {
  queueId: string;
  status: ApplicationQueueStatus;
  activeItemId: string | null;
  pauseReason: string | null;
  createdAt: Timestamp;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  updatedAt: Timestamp;
}

interface ApplicationQueueItemBase {
  itemId: string;
  atsJobId: string;
  linkedInPostingIds: string[];
  submissionAttemptId: string;
  order: number;
  status: ApplicationQueueItemStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StandardApplicationQueueItem extends ApplicationQueueItemBase {
  intentionalRepeat: false;
  repeatOfItemId: null;
  repeatConfirmedAt: null;
}

export interface RepeatApplicationQueueItem extends ApplicationQueueItemBase {
  intentionalRepeat: true;
  repeatOfItemId: string | null;
  repeatConfirmedAt: Timestamp;
}

/** Default builders may deduplicate by atsJobId; explicit repeats remain distinct items. */
export type ApplicationQueueItem =
  | StandardApplicationQueueItem
  | RepeatApplicationQueueItem;
