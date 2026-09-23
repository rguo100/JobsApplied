export interface SubscriptionGenerationState {
  subscriptionGeneration: number;
}

export function beginSubscription(state: SubscriptionGenerationState): number {
  state.subscriptionGeneration += 1;
  return state.subscriptionGeneration;
}

export function invalidateSubscriptions(state: SubscriptionGenerationState): void {
  state.subscriptionGeneration += 1;
}

export function isCurrentSubscription(
  state: SubscriptionGenerationState | undefined,
  generation: number
): boolean {
  return !!state && state.subscriptionGeneration === generation;
}
