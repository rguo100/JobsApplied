import { strict as assert } from "node:assert";
import {
  isInvalidCredentialError,
  evictCachedAuthToken,
  performSilentSyncWithRecovery,
  performInteractiveAuthWithRecovery,
} from "../../utils/authRecovery";

console.log("Running Auth Token Recovery unit tests...");

// ============================================================================
// Test 1: Helper handles missing chrome.identity and errors gracefully
// ============================================================================
async function testHelperGracefulDegradation() {
  const originalChrome = (globalThis as unknown as { chrome?: unknown }).chrome;

  try {
    // 1a: undefined chrome
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    const resNoChrome = await evictCachedAuthToken("token-1");
    assert.equal(resNoChrome, false, "Must return false when chrome is undefined");

    // 1b: chrome without identity
    (globalThis as unknown as { chrome?: unknown }).chrome = {};
    const resNoIdentity = await evictCachedAuthToken("token-2");
    assert.equal(resNoIdentity, false, "Must return false when chrome.identity is missing");

    // 1c: chrome.identity with lastError
    const evictedTokens: string[] = [];
    (globalThis as unknown as { chrome?: unknown }).chrome = {
      runtime: { lastError: { message: "Failed to remove token" } },
      identity: {
        removeCachedAuthToken: ({ token }: { token: string }, cb: () => void) => {
          evictedTokens.push(token);
          cb();
        },
      },
    };
    const resLastError = await evictCachedAuthToken("token-3");
    assert.equal(resLastError, false, "Must return false when chrome.runtime.lastError is set");
    assert.deepEqual(evictedTokens, ["token-3"]);

    // 1d: chrome.identity throwing synchronously
    (globalThis as unknown as { chrome?: unknown }).chrome = {
      runtime: {},
      identity: {
        removeCachedAuthToken: () => {
          throw new Error("Unexpected extension crash");
        },
      },
    };
    const resThrown = await evictCachedAuthToken("token-4");
    assert.equal(resThrown, false, "Must return false when removeCachedAuthToken throws");

    // 1e: successful eviction
    const successfulEvictions: string[] = [];
    (globalThis as unknown as { chrome?: unknown }).chrome = {
      runtime: {},
      identity: {
        removeCachedAuthToken: ({ token }: { token: string }, cb: () => void) => {
          successfulEvictions.push(token);
          cb();
        },
      },
    };
    const resSuccess = await evictCachedAuthToken("valid-eviction-token");
    assert.equal(resSuccess, true, "Must return true when removeCachedAuthToken succeeds");
    assert.deepEqual(successfulEvictions, ["valid-eviction-token"]);

    // 1f: empty or invalid token types
    assert.equal(await evictCachedAuthToken(""), false);
    assert.equal(await evictCachedAuthToken(null as unknown as string), false);
  } finally {
    (globalThis as unknown as { chrome?: unknown }).chrome = originalChrome;
  }

  console.log("✓ PASS: Test 1: Helper handles missing chrome.identity and runtime errors gracefully");
}

// ============================================================================
// Test 2: Invalid credential error classification
// ============================================================================
function testInvalidCredentialClassification() {
  // Positive cases
  assert.equal(isInvalidCredentialError({ code: "auth/invalid-credential" }), true);
  assert.equal(
    isInvalidCredentialError({
      code: "auth/invalid-credential",
      message: "Firebase: Unsuccessful check authorization response from Google",
    }),
    true
  );
  assert.equal(
    isInvalidCredentialError(
      new Error(
        'Unsuccessful check authorization response from Google: {"error_description":"Invalid Value"}'
      )
    ),
    true
  );
  assert.equal(isInvalidCredentialError("Firebase: Error (auth/invalid-credential)."), true);
  assert.equal(isInvalidCredentialError({ message: "auth/invalid-credential" }), true);

  // Negative cases (unrelated errors must NOT be classified as invalid-credential)
  assert.equal(isInvalidCredentialError({ code: "auth/network-request-failed" }), false);
  assert.equal(isInvalidCredentialError({ code: "auth/too-many-requests" }), false);
  assert.equal(isInvalidCredentialError({ code: "permission-denied" }), false);
  assert.equal(isInvalidCredentialError(new Error("Network timeout")), false);
  assert.equal(isInvalidCredentialError(null), false);
  assert.equal(isInvalidCredentialError(undefined), false);

  console.log("✓ PASS: Test 2: isInvalidCredentialError accurately identifies credential rejection");
}

// ============================================================================
// Test 3: Silent sync evicts invalid token and leaves user signed out without error banner
// ============================================================================
async function testSilentSyncInvalidTokenRecovery() {
  const evictedTokens: string[] = [];
  const diagnostics: string[] = [];

  const invalidToken = "stale-cached-token-123";

  const result = await performSilentSyncWithRecovery({
    getCachedToken: async () => invalidToken,
    authenticateWithToken: async (token) => {
      assert.equal(token, invalidToken);
      const err = new Error("Unsuccessful check authorization response from Google: Invalid Value");
      (err as unknown as { code: string }).code = "auth/invalid-credential";
      throw err;
    },
    evictToken: async (token) => {
      evictedTokens.push(token);
      return true;
    },
    recordDiagnostic: (stage) => diagnostics.push(stage),
  });

  assert.equal(result.recoveredFromInvalidToken, true, "Must flag recovery from invalid token");
  assert.equal(result.error, null, "Must clear error so no fatal banner is presented");
  assert.equal(result.authenticated, false, "User must remain signed out");
  assert.deepEqual(evictedTokens, [invalidToken], "Exact rejected token must be evicted");
  assert.ok(
    diagnostics.includes("silent_sync_invalid_token_recovered_clean_signed_out"),
    "Diagnostic must be recorded"
  );

  console.log("✓ PASS: Test 3: Silent sync evicts invalid token and leaves user signed out without error banner");
}

// ============================================================================
// Test 4: Unrelated errors during silent sync do NOT evict token
// ============================================================================
async function testSilentSyncUnrelatedErrorsDoNotEvict() {
  const evictedTokens: string[] = [];
  const cachedToken = "good-token-but-offline";
  const networkError = new Error("Network request failed");
  (networkError as unknown as { code: string }).code = "auth/network-request-failed";

  const result = await performSilentSyncWithRecovery({
    getCachedToken: async () => cachedToken,
    authenticateWithToken: async () => {
      throw networkError;
    },
    evictToken: async (token) => {
      evictedTokens.push(token);
      return true;
    },
  });

  assert.equal(result.recoveredFromInvalidToken, false);
  assert.equal(result.error, networkError, "Original network error must be preserved");
  assert.equal(result.authenticated, false);
  assert.equal(evictedTokens.length, 0, "Token must NOT be evicted for network error");

  console.log("✓ PASS: Test 4: Unrelated errors (network) do NOT evict token");
}

// ============================================================================
// Test 5: Interactive sign-in retries exactly once with a fresh token after invalid-credential
// ============================================================================
async function testInteractiveAuthRetriesOnce() {
  const tokenRequests = ["cached-stale-token", "fresh-interactive-token"];
  let requestIndex = 0;
  const authAttempts: string[] = [];
  const evictedTokens: string[] = [];
  const diagnostics: string[] = [];

  await performInteractiveAuthWithRecovery({
    requestInteractiveToken: async () => {
      const tok = tokenRequests[requestIndex++];
      return tok;
    },
    authenticateWithToken: async (token) => {
      authAttempts.push(token);
      if (token === "cached-stale-token") {
        const err = new Error("auth/invalid-credential");
        (err as unknown as { code: string }).code = "auth/invalid-credential";
        throw err;
      }
      // Fresh token succeeds!
    },
    evictToken: async (token) => {
      evictedTokens.push(token);
      return true;
    },
    recordDiagnostic: (stage) => diagnostics.push(stage),
  });

  assert.equal(requestIndex, 2, "Interactive token must be requested exactly twice (initial + 1 retry)");
  assert.deepEqual(authAttempts, ["cached-stale-token", "fresh-interactive-token"]);
  assert.deepEqual(evictedTokens, ["cached-stale-token"], "Only the rejected token must be evicted");
  assert.ok(diagnostics.includes("interactive_sign_in_retrying_after_invalid_token"));

  console.log("✓ PASS: Test 5: Interactive sign-in retries exactly once with fresh token after invalid-credential");
}

// ============================================================================
// Test 6: Interactive sign-in terminates cleanly if second attempt fails
// ============================================================================
async function testInteractiveAuthFailsAfterSingleRetry() {
  const tokenRequests = ["stale-token-1", "stale-token-2", "should-never-be-requested"];
  let requestIndex = 0;
  const authAttempts: string[] = [];
  const evictedTokens: string[] = [];

  let thrownError: unknown = null;
  try {
    await performInteractiveAuthWithRecovery({
      requestInteractiveToken: async () => {
        return tokenRequests[requestIndex++];
      },
      authenticateWithToken: async (token) => {
        authAttempts.push(token);
        const err = new Error(`Firebase rejected ${token}`);
        (err as unknown as { code: string }).code = "auth/invalid-credential";
        throw err;
      },
      evictToken: async (token) => {
        evictedTokens.push(token);
        return true;
      },
    });
  } catch (err) {
    thrownError = err;
  }

  assert.ok(thrownError instanceof Error);
  assert.equal(requestIndex, 2, "Under no circumstances should interactive auth retry more than once");
  assert.deepEqual(authAttempts, ["stale-token-1", "stale-token-2"]);
  assert.deepEqual(evictedTokens, ["stale-token-1"]);

  console.log("✓ PASS: Test 6: Interactive sign-in terminates cleanly if second attempt fails");
}

// ============================================================================
// Test 7: Prevents retry loop if Chrome Identity returns identical rejected token
// ============================================================================
async function testInteractiveAuthPreventsSameTokenReuse() {
  let requestCount = 0;
  let thrownError: unknown = null;

  try {
    await performInteractiveAuthWithRecovery({
      requestInteractiveToken: async () => {
        requestCount++;
        return "permanently-stuck-token";
      },
      authenticateWithToken: async () => {
        const err = new Error("auth/invalid-credential");
        (err as unknown as { code: string }).code = "auth/invalid-credential";
        throw err;
      },
      evictToken: async () => true,
    });
  } catch (err) {
    thrownError = err;
  }

  assert.ok(thrownError instanceof Error);
  assert.ok(
    (thrownError as Error).message.includes("returned the same rejected token"),
    "Must block reuse of the identical rejected token"
  );
  assert.equal(requestCount, 2);

  console.log("✓ PASS: Test 7: Prevents retry loop if Chrome Identity returns identical rejected token");
}

// Run all test scenarios
async function runAll() {
  await testHelperGracefulDegradation();
  testInvalidCredentialClassification();
  await testSilentSyncInvalidTokenRecovery();
  await testSilentSyncUnrelatedErrorsDoNotEvict();
  await testInteractiveAuthRetriesOnce();
  await testInteractiveAuthFailsAfterSingleRetry();
  await testInteractiveAuthPreventsSameTokenReuse();
  console.log("All Auth Token Recovery unit tests passed successfully.");
}

runAll().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
