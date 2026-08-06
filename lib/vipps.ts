const baseUrl = process.env.VIPPS_BASE_URL || "https://apitest.vipps.no";

export async function getVippsToken(): Promise<string> {
  const response = await fetch(`${baseUrl}/accesstoken/get`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      client_id: process.env.VIPPS_CLIENT_ID || "",
      client_secret: process.env.VIPPS_CLIENT_SECRET || "",
      "Ocp-Apim-Subscription-Key": process.env.VIPPS_SUBSCRIPTION_KEY || "",
      "Merchant-Serial-Number": process.env.VIPPS_MSN || ""
    },
    body: ""
  });
  if (!response.ok) throw new Error(`Vipps token error: ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

export function vippsHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": process.env.VIPPS_SUBSCRIPTION_KEY || "",
    "Merchant-Serial-Number": process.env.VIPPS_MSN || "",
    "Vipps-System-Name": "bergenstjerne-lodd",
    "Vipps-System-Version": "1.0.0",
    "Vipps-System-Plugin-Name": "bergenstjerne-web",
    "Vipps-System-Plugin-Version": "1.0.0"
  };
}
