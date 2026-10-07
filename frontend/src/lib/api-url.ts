const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

if (
  process.env.NODE_ENV === "production" &&
  (!configuredApiUrl || /localhost|127\.0\.0\.1/i.test(configuredApiUrl))
) {
  throw new Error(
    "NEXT_PUBLIC_API_URL must be set to the deployed API URL in production",
  );
}

export const API_URL = configuredApiUrl ?? "http://localhost:3001/api";
