import type { Application } from "../types/application";

type SaveApplicationInput = Omit<Application, "createdAt" | "updatedAt"> & {
  createdAt?: Application["createdAt"];
  updatedAt?: Application["updatedAt"];
};

export function createApplicationSavePayload<TServerTimestamp>(
  application: SaveApplicationInput,
  existingApplication: Application | null,
  createServerTimestamp: () => TServerTimestamp
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    source: application.source,
    externalJobId: application.externalJobId,
    company: application.company,
    title: application.title,
    location: application.location,
    url: application.url,
    status: application.status,
    updatedAt: createServerTimestamp(),
  };

  if (!existingApplication) {
    payload.createdAt = createServerTimestamp();
    payload.appliedAt =
      application.status === "applied" ? createServerTimestamp() : null;
  } else if (!existingApplication.appliedAt && application.status === "applied") {
    payload.appliedAt = createServerTimestamp();
  }

  return payload;
}
