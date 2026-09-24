import type { Application } from "../types/application";

export interface DashboardDataState {
  ownerUid: string | null;
  applications: Application[];
  loading: boolean;
  error: string | null;
}

export interface PendingDelete {
  uid: string;
  application: Application;
}

export interface ApplicationSubscriptionSession {
  dispose: () => void;
}

export type SubscribeToApplications = (
  uid: string,
  onUpdate: (applications: Application[]) => void,
  onError: (error: Error) => void
) => () => void;

export function getDashboardDataForUid(
  state: DashboardDataState,
  currentUid: string | null
): DashboardDataState {
  if (state.ownerUid === currentUid) return state;
  return {
    ownerUid: currentUid,
    applications: [],
    loading: currentUid !== null,
    error: null,
  };
}

export function createApplicationSubscriptionSession(
  uid: string,
  subscribe: SubscribeToApplications,
  onUpdate: (applications: Application[]) => void,
  onError: (error: Error) => void
): ApplicationSubscriptionSession {
  let disposed = false;
  const unsubscribe = subscribe(
    uid,
    (applications) => {
      if (!disposed) onUpdate(applications);
    },
    (error) => {
      if (!disposed) onError(error);
    }
  );

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
  };
}

export function getPendingDeleteForUid(
  pendingDelete: PendingDelete | null,
  currentUid: string | null
): PendingDelete | null {
  return pendingDelete?.uid === currentUid ? pendingDelete : null;
}

export async function deletePendingApplicationForUid(
  pendingDelete: PendingDelete | null,
  currentUid: string | null,
  deleteApplication: (uid: string, source: string, externalJobId: string) => Promise<void>
): Promise<boolean> {
  const ownedPendingDelete = getPendingDeleteForUid(pendingDelete, currentUid);
  if (!ownedPendingDelete || !currentUid) return false;

  const { source, externalJobId } = ownedPendingDelete.application;
  await deleteApplication(currentUid, source, externalJobId);
  return true;
}
