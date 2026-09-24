import { strict as assert } from "node:assert";
import type { Application } from "../../types/application";
import {
  createApplicationSubscriptionSession,
  DashboardDataState,
  deletePendingApplicationForUid,
  getDashboardDataForUid,
  getPendingDeleteForUid,
  PendingDelete,
  SubscribeToApplications,
} from "../dashboardLifecycle";

function application(externalJobId: string, company: string): Application {
  const timestamp = { marker: externalJobId } as unknown as Application["createdAt"];
  return {
    source: "linkedin",
    externalJobId,
    company,
    title: "Engineer",
    location: "Toronto, ON",
    url: `https://www.linkedin.com/jobs/view/${externalJobId}/`,
    status: "applied",
    appliedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

type SubscriptionCallbacks = {
  update: (applications: Application[]) => void;
  error: (error: Error) => void;
};

const callbacks = new Map<string, SubscriptionCallbacks[]>();
const unsubscribeCounts = new Map<string, number>();
const subscribe: SubscribeToApplications = (uid, update, error) => {
  const entries = callbacks.get(uid) ?? [];
  entries.push({ update, error });
  callbacks.set(uid, entries);
  return () => unsubscribeCounts.set(uid, (unsubscribeCounts.get(uid) ?? 0) + 1);
};

let currentUid: string | null = "A";
let state: DashboardDataState = {
  ownerUid: "A",
  applications: [],
  loading: true,
  error: null,
};
const receiveFor = (uid: string) => (applications: Application[]) => {
  state = { ownerUid: uid, applications, loading: false, error: null };
};
const errorFor = (uid: string) => (error: Error) => {
  state = { ownerUid: uid, applications: [], loading: false, error: error.message };
};

const aSession = createApplicationSubscriptionSession("A", subscribe, receiveFor("A"), errorFor("A"));
const aCallbacks = callbacks.get("A")![0];
const aJobs = [application("A1", "A Company 1"), application("A2", "A Company 2")];
aCallbacks.update(aJobs);
assert.deepEqual(getDashboardDataForUid(state, currentUid).applications, aJobs);

// UID transition hides A synchronously, before B's first snapshot.
currentUid = "B";
assert.deepEqual(getDashboardDataForUid(state, currentUid).applications, []);
aSession.dispose();
assert.equal(unsubscribeCounts.get("A"), 1);

const bSession = createApplicationSubscriptionSession("B", subscribe, receiveFor("B"), errorFor("B"));
const bCallbacks = callbacks.get("B")![0];

// A callback retained by the test cannot mutate state after disposal.
aCallbacks.update([application("A3", "Late A")]);
assert.deepEqual(getDashboardDataForUid(state, currentUid).applications, []);

const bJobs = [application("B1", "B Company")];
bCallbacks.update(bJobs);
assert.deepEqual(getDashboardDataForUid(state, currentUid).applications, bJobs);

// A remains rejected even when it arrives after B.
aCallbacks.update([application("A4", "Later A")]);
assert.deepEqual(getDashboardDataForUid(state, currentUid).applications, bJobs);

// Retry disposes the prior B session exactly once and starts a new one.
bSession.dispose();
assert.equal(unsubscribeCounts.get("B"), 1);
const retriedBSession = createApplicationSubscriptionSession(
  "B",
  subscribe,
  receiveFor("B"),
  errorFor("B")
);
assert.equal(callbacks.get("B")!.length, 2);

// Component unmount/sign-out disposes the active listener exactly once.
retriedBSession.dispose();
retriedBSession.dispose();
assert.equal(unsubscribeCounts.get("B"), 2);

const pendingDelete: PendingDelete = {
  uid: "A",
  application: application("X", "User A Job"),
};
assert.equal(getPendingDeleteForUid(pendingDelete, "A"), pendingDelete);
assert.equal(getPendingDeleteForUid(pendingDelete, "B"), null);
assert.equal(getPendingDeleteForUid(pendingDelete, null), null);

const deleteCalls: Array<{ uid: string; source: string; externalJobId: string }> = [];
const deleteApplication = async (uid: string, source: string, externalJobId: string) => {
  deleteCalls.push({ uid, source, externalJobId });
};
assert.equal(
  await deletePendingApplicationForUid(pendingDelete, "B", deleteApplication),
  false
);
assert.equal(deleteCalls.length, 0, "stale User A delete must not execute for User B");
assert.equal(
  await deletePendingApplicationForUid(pendingDelete, "A", deleteApplication),
  true
);
assert.deepEqual(deleteCalls, [{ uid: "A", source: "linkedin", externalJobId: "X" }]);

currentUid = null;
assert.deepEqual(getDashboardDataForUid(state, currentUid).applications, []);

console.log("Dashboard UID/subscription/delete lifecycle tests passed.");
