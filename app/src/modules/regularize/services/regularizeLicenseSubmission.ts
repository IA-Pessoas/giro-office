import type {
  CreateRegularizeLicensePayload,
  RegularizeId,
  UpdateRegularizeLicensePayload,
} from "../types";

type SavedRegularizeLicense = {
  id: RegularizeId;
};

type RegularizeLicenseSubmissionDependencies = {
  createLicense: (payload: CreateRegularizeLicensePayload) => Promise<SavedRegularizeLicense>;
  updateLicense: (payload: UpdateRegularizeLicensePayload) => Promise<SavedRegularizeLicense>;
  uploadProtocol: (input: { id: RegularizeId; file: File }) => Promise<unknown>;
  onLicenseSaved: (input: {
    id: RegularizeId;
    operation: "create" | "update";
  }) => void;
};

export async function submitRegularizeLicense(
  payload: CreateRegularizeLicensePayload | UpdateRegularizeLicensePayload,
  protocolFile: File | undefined,
  dependencies: RegularizeLicenseSubmissionDependencies,
): Promise<void> {
  const isUpdate = "id" in payload;
  const savedLicense = isUpdate
    ? await dependencies.updateLicense(payload)
    : await dependencies.createLicense(payload);
  const operation = isUpdate ? "update" : "create";

  dependencies.onLicenseSaved({ id: savedLicense.id, operation });

  if (protocolFile) {
    await dependencies.uploadProtocol({ id: savedLicense.id, file: protocolFile });
  }
}
