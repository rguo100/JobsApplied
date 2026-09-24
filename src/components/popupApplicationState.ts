import type { Application } from "../types/application";

/** The popup tracks Firestore document existence; status is workflow metadata only. */
export function isPopupApplicationTracked(
  application: Application | null
): application is Application {
  return application !== null;
}
