const VIPPS_BASE_URL =
  process.env.VIPPS_BASE_URL || "https://apitest.vipps.no";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Mangler miljøvariabelen ${name}`);
  }

  return value;
}

export async function getVippsToken(): Promise<string> {
  const response = await fetch(`${VIPPS_BASE_URL}/accesstoken/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      client_id: requiredEnv("VIPPS_CLIENT_ID"),
      client_secret: requiredEnv("VIPPS_CLIENT_SECRET"),
      "Ocp-Apim-Subscription-Key": requiredEnv(
        "VIPPS_SUBSCRIPTION_KEY",
      ),
      "Merchant-Serial-Number": requiredEnv("VIPPS_MSN"),
    },
    body: "",
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Vipps token error: ${response.status} ${details}`,
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
  };

  if (!data.access_token) {
    throw new Error("Vipps returnerte ikke access_token.");
  }

  return data.access_token;
}

export function vippsHeaders(
  accessToken: string,
  idempotencyKey?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "Ocp-Apim-Subscription-Key": requiredEnv(
      "VIPPS_SUBSCRIPTION_KEY",
    ),
    "Merchant-Serial-Number": requiredEnv("VIPPS_MSN"),
    "Vipps-System-Name": "Bergenstjerne-Lodd",
    "Vipps-System-Version": "1.0.0",
  };

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  return headers;
}