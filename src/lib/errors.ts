/** A provider was selected but its required configuration is missing or invalid. */
export class ProviderConfigError extends Error {
  override name = "ProviderConfigError";
}

/** A real provider skeleton exists but its API mapping has not been implemented yet. */
export class ProviderNotWiredError extends Error {
  override name = "ProviderNotWiredError";
}

/** Tool arguments failed validation. */
export class ValidationError extends Error {
  override name = "ValidationError";
}

/** An upstream API call failed. */
export class UpstreamError extends Error {
  override name = "UpstreamError";
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
