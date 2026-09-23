import { strict as assert } from "node:assert";
import { matchesMutationIdentity, MutationIdentity } from "../../types/job";
import {
  beginSubscription,
  invalidateSubscriptions,
  isCurrentSubscription,
} from "../../background/subscriptionGeneration";
import { createAnimationFrameCoalescer } from "../animationFrameCoalescer";
import { isBroadMainDetailPane } from "../linkedinJobExtractor";

const requestA: MutationIdentity = {
  requestId: "A1",
  source: "linkedin",
  externalJobId: "job-a",
};
const requestB: MutationIdentity = {
  requestId: "B1",
  source: "linkedin",
  externalJobId: "job-b",
};

assert.equal(matchesMutationIdentity(requestA, requestA), true);
assert.equal(matchesMutationIdentity(requestA, requestB), false);
assert.equal(
  matchesMutationIdentity({ ...requestB, requestId: "A1" }, requestA),
  false,
  "request ID alone must not correlate a response for another job"
);

const state = { subscriptionGeneration: 0 };
const generationA = beginSubscription(state);
const generationB = beginSubscription(state);
assert.equal(isCurrentSubscription(state, generationA), false);
assert.equal(isCurrentSubscription(state, generationB), true);

const waitingSubscribe = beginSubscription(state);
invalidateSubscriptions(state);
assert.equal(
  isCurrentSubscription(state, waitingSubscribe),
  false,
  "unsubscribe must invalidate an awaiting subscribe"
);

const waitingAtDisconnect = beginSubscription(state);
invalidateSubscriptions(state);
assert.equal(
  isCurrentSubscription(state, waitingAtDisconnect),
  false,
  "port disconnect must invalidate an awaiting subscribe"
);

let queuedFrame: FrameRequestCallback | null = null;
let callbackCount = 0;
const coalescer = createAnimationFrameCoalescer(
  () => {
    callbackCount += 1;
  },
  (callback) => {
    queuedFrame = callback;
    return 1;
  },
  () => {
    queuedFrame = null;
  }
);

coalescer.schedule();
coalescer.schedule();
coalescer.schedule();
assert(queuedFrame, "one animation frame should be queued");
(queuedFrame as FrameRequestCallback)(0);
assert.equal(callbackCount, 1, "a mutation burst must extract once per frame");

const broadMain = {
  tagName: "MAIN",
  matches: () => false,
} as unknown as Element;
const verifiedMain = {
  tagName: "MAIN",
  matches: (selector: string) => selector === ".jobs-details__main-content",
} as unknown as Element;
assert.equal(isBroadMainDetailPane(broadMain), true);
assert.equal(isBroadMainDetailPane(verifiedMain), false);

console.log("Day 4.1 concurrency/lifecycle tests passed.");
