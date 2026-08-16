"use client";

import { useMemo, useState } from "react";

type Prize = {
  id: string;
  name: string;
  image_url: string;
  quantity_remaining: number;
  win_chance_percent: number;
  description?: string;
  value_nok?: number;
  is_consolation?: boolean;
  quantity_total?: number;
  sort_order?: number;
  active?: boolean;
  level?: string;
};

type Winner = {
  id: string;
  ticket_number?: string;
  fulfillment_status?: string | null;
  fulfillment_method?: string | null;

  shipping_name?: string | null;
  shipping_address?: string | null;
  shipping_postal_code?: string | null;
  shipping_city?: string | null;

  claimed_at?: string | null;

  prizes?: {
    name?: string;
  } | null;

  orders?: {
    customer_name?: string;
    phone?: string;
  } | null;
};

type WinnerFilter =
  | "pending"
  | "shipping"
  | "pickup"
  | "processed";

type Campaign = {
  id: string;
  name: string;
  ticket_price: number;
  max_tickets: number;
  start_date?: string | null;
  end_date?: string | null;
  status: "draft" | "active" | "ended";
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [message, setMessage] = useState("");

  const [updatingWinnerId, setUpdatingWinnerId] =
    useState<string | null>(null);

  const [editingPrizeId, setEditingPrizeId] =
    useState<string | null>(null);

  const [winnerFilter, setWinnerFilter] =
    useState<WinnerFilter>("pending");

  const [winnerSearch, setWinnerSearch] = useState("");

  const [selectedWinner, setSelectedWinner] =
    useState<Winner | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    value_nok: 0,
    quantity_total: 1,
    win_chance_percent: 1,
    sort_order: 1,
    active: true,
    is_consolation: false,
    image_url: "",
    level: "Premie",
  });

  function isProcessed(winner: Winner) {
    const status = (
      winner.fulfillment_status || ""
    ).toLowerCase();

    return [
      "fulfilled",
      "delivered",
      "utlevert",
      "collected",
      "shipped",
      "sent",
      "sendt",
    ].includes(status);
  }

  function methodText(method?: string | null) {
    const value = (method || "").toLowerCase();

    if (value === "shipping") return "Skal sendes";
    if (value === "pickup") return "Skal hentes";

    return "Ikke valgt";
  }

  const statistics = useMemo(() => {
    const pending = winners.filter(
      (winner) => !isProcessed(winner),
    );

    const shipping = pending.filter(
      (winner) =>
        winner.fulfillment_method === "shipping",
    );

    const pickup = pending.filter(
      (winner) =>
        winner.fulfillment_method === "pickup",
    );

    const processed = winners.filter(isProcessed);

    return {
      winners: winners.length,
      pending: pending.length,
      shipping: shipping.length,
      pickup: pickup.length,
      processed: processed.length,
      prizesRemaining: prizes.reduce(
        (sum, prize) =>
          sum +
          Number(
            prize.quantity_remaining || 0,
          ),
        0,
      ),
    };
  }, [winners, prizes]);

  const campaignPlan = useMemo(() => {
    const maxTickets = Math.max(0, Number(campaign?.max_tickets || 0));
    const ticketPrice = Math.max(0, Number(campaign?.ticket_price || 0));

    const activePrizes = prizes.filter((prize) => prize.active !== false);
    const totalPrizes = activePrizes.reduce(
      (sum, prize) =>
        sum +
        Number(
          prize.quantity_total ??
            prize.quantity_remaining ??
            0,
        ),
      0,
    );

    const totalPrizeValue = activePrizes.reduce(
      (sum, prize) =>
        sum +
        Number(prize.value_nok || 0) *
          Number(
            prize.quantity_total ??
              prize.quantity_remaining ??
              0,
          ),
      0,
    );

    const winChance =
      maxTickets > 0
        ? (totalPrizes / maxTickets) * 100
        : 0;

    const oneIn =
      totalPrizes > 0 && maxTickets > 0
        ? maxTickets / totalPrizes
        : 0;

    return {
      maxRevenue: ticketPrice * maxTickets,
      totalPrizes,
      totalPrizeValue,
      winChance,
      oneIn,
    };
  }, [campaign, prizes]);

  const filteredWinners = useMemo(() => {
    let result = [...winners];

    if (winnerFilter === "pending") {
      result = result.filter(
        (winner) => !isProcessed(winner),
      );
    }

    if (winnerFilter === "shipping") {
      result = result.filter(
        (winner) =>
          !isProcessed(winner) &&
          winner.fulfillment_method ===
            "shipping",
      );
    }

    if (winnerFilter === "pickup") {
      result = result.filter(
        (winner) =>
          !isProcessed(winner) &&
          winner.fulfillment_method ===
            "pickup",
      );
    }

    if (winnerFilter === "processed") {
      result = result.filter(isProcessed);
    }

    const search =
      winnerSearch.trim().toLowerCase();

    if (search) {
      result = result.filter((winner) => {
        const values = [
          winner.orders?.customer_name,
          winner.orders?.phone,
          winner.shipping_name,
          winner.shipping_address,
          winner.shipping_postal_code,
          winner.shipping_city,
          winner.ticket_number,
          winner.prizes?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return values.includes(search);
      });
    }

    return result;
  }, [
    winners,
    winnerFilter,
    winnerSearch,
  ]);

  async function load(
    showSuccessMessage = false,
  ) {
    const prizeResponse = await fetch(
      "/api/admin/prizes",
      {
        headers: {
          "x-admin-password": password,
        },
      },
    );

    const prizeData =
      await prizeResponse.json();

    if (!prizeResponse.ok) {
      setLoggedIn(false);
      setMessage(
        prizeData.error || "Feil passord",
      );

      return false;
    }

    const winnerResponse = await fetch(
      "/api/admin/winners",
      {
        headers: {
          "x-admin-password": password,
        },
      },
    );

    const winnerData =
      await winnerResponse.json();

    if (!winnerResponse.ok) {
      setLoggedIn(false);

      setMessage(
        winnerData.error ||
          "Kunne ikke hente vinnere",
      );

      return false;
    }

    const campaignResponse = await fetch(
      "/api/admin/campaign",
      {
        headers: {
          "x-admin-password": password,
        },
      },
    );

    const campaignData =
      await campaignResponse.json();

    if (!campaignResponse.ok) {
      setLoggedIn(false);
      setMessage(
        campaignData.error ||
          "Kunne ikke hente kampanjeinnstillinger",
      );
      return false;
    }

    setPrizes(prizeData);
    setWinners(winnerData);
    setCampaign(campaignData);
    setLoggedIn(true);

    setMessage(
      showSuccessMessage
        ? "Oversikten er oppdatert."
        : "",
    );

    return true;
  }

  async function saveCampaign() {
    if (!campaign || savingCampaign) return;

    if (Number(campaign.ticket_price) <= 0) {
      setMessage("Loddprisen må være høyere enn 0 kr.");
      return;
    }

    if (Number(campaign.max_tickets) <= 0) {
      setMessage("Antall lodd må være høyere enn 0.");
      return;
    }

    if (
      campaign.start_date &&
      campaign.end_date &&
      campaign.end_date < campaign.start_date
    ) {
      setMessage("Sluttdato kan ikke være før startdato.");
      return;
    }

    setSavingCampaign(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/admin/campaign",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": password,
          },
          body: JSON.stringify(campaign),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error ||
            "Kunne ikke lagre kampanjeinnstillingene",
        );
        return;
      }

      setCampaign(result.campaign);
      setMessage("Kampanjeinnstillingene er lagret.");
    } finally {
      setSavingCampaign(false);
    }
  }

  async function updateStatus(
    id: string,
    fulfillmentStatus:
      | "shipped"
      | "fulfilled",
  ) {
    setUpdatingWinnerId(id);
    setMessage("");

    const response = await fetch(
      "/api/admin/winners",
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json",

          "x-admin-password": password,
        },

        body: JSON.stringify({
          id,
          fulfillmentStatus,
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      setUpdatingWinnerId(null);

      setMessage(
        result.error ||
          "Kunne ikke oppdatere status",
      );

      return;
    }

    setWinners((current) =>
      current.map((winner) =>
        winner.id === id
          ? {
              ...winner,
              fulfillment_status:
                fulfillmentStatus,
            }
          : winner,
      ),
    );

    if (selectedWinner?.id === id) {
      setSelectedWinner((current) =>
        current
          ? {
              ...current,
              fulfillment_status:
                fulfillmentStatus,
            }
          : current,
      );
    }

    setUpdatingWinnerId(null);

    setMessage(
      fulfillmentStatus === "fulfilled"
        ? "Premien er markert som utlevert."
        : "Premien er markert som sendt.",
    );
  }

  async function remove(id: string) {
    if (
      !confirm(
        "Vil du fjerne denne premien?",
      )
    ) {
      return;
    }

    const response = await fetch(
      `/api/admin/prizes?id=${id}`,
      {
        method: "DELETE",

        headers: {
          "x-admin-password": password,
        },
      },
    );

    const result = await response.json();

    if (!response.ok) {
      setMessage(
        result.error ||
          "Kunne ikke fjerne premien",
      );

      return;
    }

    await load();
  }

  async function upload(file: File) {
    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      "/api/admin/upload",
      {
        method: "POST",

        headers: {
          "x-admin-password": password,
        },

        body: formData,
      },
    );

    const result = await response.json();

    if (!response.ok) {
      setMessage(
        result.error ||
          "Opplasting feilet",
      );

      return;
    }

    setForm((current) => ({
      ...current,
      image_url: result.url,
    }));
  }

  function resetForm() {
    setForm({
      name: "",
      description: "",
      value_nok: 0,
      quantity_total: 1,
      win_chance_percent: 1,
      sort_order: 1,
      active: true,
      is_consolation: false,
      image_url: "",
      level: "Premie",
    });

    setEditingPrizeId(null);
  }

  function startEditingPrize(
    prize: Prize,
  ) {
    setEditingPrizeId(prize.id);

    setForm({
      name: prize.name || "",
      description:
        prize.description || "",

      value_nok: Number(
        prize.value_nok || 0,
      ),

      quantity_total: Number(
        prize.quantity_total ||
          prize.quantity_remaining ||
          1,
      ),

      win_chance_percent: Number(
        prize.win_chance_percent || 0,
      ),

      sort_order: Number(
        prize.sort_order || 0,
      ),

      active: prize.active !== false,

      is_consolation: Boolean(
        prize.is_consolation,
      ),

      image_url:
        prize.image_url || "",

      level:
        prize.level || "Premie",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    setMessage(
      "Du redigerer nå premien.",
    );
  }

  async function save() {
    const isEditing =
      Boolean(editingPrizeId);

    const response = await fetch(
      "/api/admin/prizes",
      {
        method: isEditing
          ? "PATCH"
          : "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-admin-password": password,
        },

        body: JSON.stringify({
          ...form,
          id: editingPrizeId,
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      setMessage(
        result.error ||
          (isEditing
            ? "Kunne ikke oppdatere premien"
            : "Kunne ikke lagre"),
      );

      return;
    }

    setMessage(
      isEditing
        ? "Premien er oppdatert."
        : "Premien er lagret.",
    );

    resetForm();
    await load();
  }

  function statusInfo(
    status?: string | null,
  ) {
    const normalized = (
      status || ""
    ).toLowerCase();

    if (
      [
        "fulfilled",
        "delivered",
        "utlevert",
        "collected",
      ].includes(normalized)
    ) {
      return {
        text: "Utlevert",
        color: "#166534",
        background: "#dcfce7",
      };
    }

    if (
      [
        "shipped",
        "sent",
        "sendt",
      ].includes(normalized)
    ) {
      return {
        text: "Sendt",
        color: "#92400e",
        background: "#fef3c7",
      };
    }

    return {
      text: "Ubehandlet",
      color: "#9f1239",
      background: "#ffe4e6",
    };
  }

  function formatDate(value?: string | null) {
    if (!value) return "Ikke registrert";

    try {
      return new Intl.DateTimeFormat(
        "nb-NO",
        {
          dateStyle: "short",
          timeStyle: "short",
        },
      ).format(new Date(value));
    } catch {
      return value;
    }
  }

  function printCurrentList() {
    const popup = window.open(
      "",
      "_blank",
      "width=1000,height=800",
    );

    if (!popup) {
      alert(
        "Nettleseren blokkerte utskriftsvinduet.",
      );

      return;
    }

    const title =
      winnerFilter === "shipping"
        ? "Premier som skal sendes"
        : winnerFilter === "pickup"
          ? "Premier som skal hentes"
          : winnerFilter ===
              "processed"
            ? "Behandlede premier"
            : "Alle ubehandlede premier";

    const rows = filteredWinners
      .map((winner) => {
        const name =
          winner.shipping_name ||
          winner.orders?.customer_name ||
          "";

        const address =
          winner.fulfillment_method ===
          "shipping"
            ? `${winner.shipping_address || ""}<br>
               ${winner.shipping_postal_code || ""} ${winner.shipping_city || ""}`
            : "";

        return `
          <tr>
            <td>${winner.prizes?.name || ""}</td>
            <td>${name}</td>
            <td>${winner.orders?.phone || ""}</td>
            <td>${methodText(winner.fulfillment_method)}</td>
            <td>${address}</td>
            <td>${winner.ticket_number || ""}</td>
          </tr>
        `;
      })
      .join("");

    popup.document.write(`
      <!DOCTYPE html>
      <html lang="no">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
            color: #17354a;
          }

          h1 {
            margin-bottom: 5px;
          }

          p {
            color: #617988;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 25px;
          }

          th {
            text-align: left;
            background: #eef8fe;
          }

          th,
          td {
            padding: 10px;
            border-bottom: 1px solid #d9eaf4;
            vertical-align: top;
          }
        </style>
      </head>

      <body>

        <h1>${title}</h1>

        <p>
          Bergenstjerne Fotballklubb ·
          ${filteredWinners.length} premier
        </p>

        <table>

          <thead>
            <tr>
              <th>Premie</th>
              <th>Navn</th>
              <th>Telefon</th>
              <th>Levering</th>
              <th>Adresse</th>
              <th>Loddnr.</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>

        </table>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>

      </body>
      </html>
    `);

    popup.document.close();
  }

  const filterButtons = [
    {
      id: "pending" as const,
      label: "Ubehandlede",
      count: statistics.pending,
    },
    {
      id: "shipping" as const,
      label: "Skal sendes",
      count: statistics.shipping,
    },
    {
      id: "pickup" as const,
      label: "Skal hentes",
      count: statistics.pickup,
    },
    {
      id: "processed" as const,
      label: "Behandlede",
      count: statistics.processed,
    },
  ];

  return (
    <main className="container adminWrap">
      <div
        style={{
          marginBottom: 25,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: 1,
            color: "#2c8fc5",
            textTransform: "uppercase",
          }}
        >
          Bergenstjerne FK
        </div>

        <h1
          style={{
            margin: "6px 0",
            fontSize: "clamp(32px,5vw,48px)",
          }}
        >
          Administrasjon
        </h1>

        <p
          style={{
            margin: 0,
            color: "#617988",
          }}
        >
          Premier, vinnere og
          premieutlevering
        </p>
      </div>

      {!loggedIn ? (
        <div
          className="panel"
          style={{
            maxWidth: 500,
          }}
        >
          <h2>Logg inn</h2>

          <label>
            Adminpassord

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter"
                ) {
                  load();
                }
              }}
            />
          </label>

          <button
            className="btn primary wide"
            style={{
              marginTop: 14,
            }}
            onClick={() => load()}
          >
            Åpne kontrollpanelet
          </button>

          <p>{message}</p>
        </div>
      ) : (
        <>
          {campaign && (
            <div
              className="panel"
              style={{
                marginBottom: 20,
                padding: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 950,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      color: "#2c8fc5",
                    }}
                  >
                    Aktiv kampanje
                  </div>
                  <h2 style={{ margin: "5px 0 4px" }}>
                    Kampanjeinnstillinger
                  </h2>
                  <p
                    style={{
                      margin: 0,
                      color: "#617988",
                    }}
                  >
                    Styr pris, antall lodd, salgsperiode og status.
                  </p>
                </div>

                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: 999,
                    fontWeight: 900,
                    fontSize: 13,
                    color:
                      campaign.status === "active"
                        ? "#166534"
                        : campaign.status === "ended"
                          ? "#475569"
                          : "#92400e",
                    background:
                      campaign.status === "active"
                        ? "#dcfce7"
                        : campaign.status === "ended"
                          ? "#e2e8f0"
                          : "#fef3c7",
                  }}
                >
                  {campaign.status === "active"
                    ? "Aktiv"
                    : campaign.status === "ended"
                      ? "Avsluttet"
                      : "Kladd"}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 12,
                  marginTop: 22,
                }}
              >
                <label>
                  Kampanjenavn
                  <input
                    value={campaign.name}
                    onChange={(event) =>
                      setCampaign({
                        ...campaign,
                        name: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Pris per lodd
                  <input
                    type="number"
                    min="1"
                    value={campaign.ticket_price}
                    onChange={(event) =>
                      setCampaign({
                        ...campaign,
                        ticket_price: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  Maks antall lodd
                  <input
                    type="number"
                    min="1"
                    value={campaign.max_tickets}
                    onChange={(event) =>
                      setCampaign({
                        ...campaign,
                        max_tickets: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  Status
                  <select
                    value={campaign.status}
                    onChange={(event) =>
                      setCampaign({
                        ...campaign,
                        status: event.target.value as Campaign["status"],
                      })
                    }
                  >
                    <option value="draft">Kladd</option>
                    <option value="active">Aktiv</option>
                    <option value="ended">Avsluttet</option>
                  </select>
                </label>

                <label>
                  Startdato
                  <input
                    type="date"
                    value={campaign.start_date || ""}
                    onChange={(event) =>
                      setCampaign({
                        ...campaign,
                        start_date: event.target.value || null,
                      })
                    }
                  />
                </label>

                <label>
                  Sluttdato
                  <input
                    type="date"
                    value={campaign.end_date || ""}
                    onChange={(event) =>
                      setCampaign({
                        ...campaign,
                        end_date: event.target.value || null,
                      })
                    }
                  />
                </label>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(150px,1fr))",
                  gap: 10,
                  marginTop: 22,
                }}
              >
                {[
                  [
                    "Maks omsetning",
                    `${campaignPlan.maxRevenue.toLocaleString("nb-NO")} kr`,
                  ],
                  [
                    "Premier totalt",
                    campaignPlan.totalPrizes.toLocaleString("nb-NO"),
                  ],
                  [
                    "Samlet premieverdi",
                    `${campaignPlan.totalPrizeValue.toLocaleString("nb-NO")} kr`,
                  ],
                  [
                    "Beregnet vinnersjanse",
                    `${campaignPlan.winChance.toLocaleString("nb-NO", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} %`,
                  ],
                  [
                    "Omtrent",
                    campaignPlan.oneIn > 0
                      ? `1 gevinst per ${Math.round(
                          campaignPlan.oneIn,
                        ).toLocaleString("nb-NO")} lodd`
                      : "Legg inn premier",
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      background: "#f5fafe",
                      border: "1px solid #e0edf5",
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 900,
                        textTransform: "uppercase",
                        color: "#617988",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 950,
                        color: "#143246",
                        marginTop: 5,
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: 20,
                }}
              >
                <div
                  style={{
                    color: "#617988",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Vinnersjansen beregnes automatisk fra antall premier og
                  maks antall lodd.
                </div>

                <button
                  className="btn primary"
                  onClick={saveCampaign}
                  disabled={savingCampaign}
                >
                  {savingCampaign
                    ? "Lagrer..."
                    : "Lagre kampanje"}
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(150px,1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              [
                "Vinnere",
                statistics.winners,
              ],
              [
                "Ubehandlede",
                statistics.pending,
              ],
              [
                "Skal sendes",
                statistics.shipping,
              ],
              [
                "Skal hentes",
                statistics.pickup,
              ],
              [
                "Premier igjen",
                statistics.prizesRemaining,
              ],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="panel"
                style={{
                  padding: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 950,
                    color: "#143246",
                  }}
                >
                  {value}
                </div>

                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#617988",
                    marginTop: 4,
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="adminGrid">
            <div className="panel">
              <h2>
                {editingPrizeId
                  ? "Rediger premie"
                  : "Ny premie"}
              </h2>

              <label>
                Navn

                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name:
                        event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Beskrivelse

                <textarea
                  value={
                    form.description
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description:
                        event.target.value,
                    })
                  }
                  placeholder="Kort beskrivelse av premien"
                />
              </label>

              <label>
                Verdi i kroner

                <input
                  type="number"
                  min="0"
                  value={form.value_nok}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      value_nok: Number(
                        event.target.value,
                      ),
                    })
                  }
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    form.is_consolation
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      is_consolation:
                        event.target.checked,
                    })
                  }
                  style={{
                    width: 20,
                    margin: 0,
                  }}
                />

                Dette er trøstepremien
              </label>

              <label>
                Antall

                <input
                  type="number"
                  min="1"
                  value={
                    form.quantity_total
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      quantity_total:
                        Number(
                          event.target
                            .value,
                        ),
                    })
                  }
                />
              </label>

              <label>
                Vinnersjanse i prosent

                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={
                    form.win_chance_percent
                  }
                  onChange={(event) =>
                    setForm({
                      ...form,
                      win_chance_percent:
                        Number(
                          event.target
                            .value,
                        ),
                    })
                  }
                />
              </label>

              <label>
                Bilde

                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file =
                      event.target.files?.[0];

                    if (file) {
                      upload(file);
                    }
                  }}
                />
              </label>

              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="Forhåndsvisning"
                  style={{
                    width: 130,
                    height: 130,
                    objectFit: "contain",
                    marginTop: 12,
                    background: "#fff",
                    borderRadius: 16,
                    border:
                      "1px solid #d9eaf4",
                  }}
                />
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 16,
                }}
              >
                <button
                  className="btn green"
                  onClick={save}
                >
                  {editingPrizeId
                    ? "Oppdater premie"
                    : "Lagre premie"}
                </button>

                {editingPrizeId && (
                  <button
                    className="btn secondary"
                    onClick={() => {
                      resetForm();

                      setMessage(
                        "Redigering avbrutt.",
                      );
                    }}
                  >
                    Avbryt
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className="panel"
            style={{
              marginTop: 20,
            }}
          >
            <h2>Premier</h2>

            <div className="adminList">
              {prizes.map((prize) => (
                <div
                  className="row"
                  key={prize.id}
                >
                  <img
                    src={prize.image_url}
                    alt={prize.name}
                  />

                  <div>
                    <b>{prize.name}</b>

                    {prize.is_consolation && (
                      <span>
                        {" "}
                        · Trøstepremie
                      </span>
                    )}

                    <br />

                    <small>
                      {
                        prize.quantity_remaining
                      }{" "}
                      igjen ·{" "}
                      {
                        prize.win_chance_percent
                      }
                      %
                    </small>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="small"
                      onClick={() =>
                        startEditingPrize(
                          prize,
                        )
                      }
                    >
                      Rediger
                    </button>

                    <button
                      className="small danger"
                      onClick={() =>
                        remove(prize.id)
                      }
                    >
                      Fjern
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="panel"
            style={{
              marginTop: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 14,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  Premieutlevering
                </h2>

                <p
                  style={{
                    margin:
                      "5px 0 0",
                    color: "#617988",
                  }}
                >
                  Behandle vinnere,
                  sending og henting.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                }}
              >
                <button
                  className="btn secondary"
                  onClick={() =>
                    load(true)
                  }
                >
                  Oppdater
                </button>

                <button
                  className="btn primary"
                  onClick={
                    printCurrentList
                  }
                >
                  Skriv ut liste
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 20,
              }}
            >
              {filterButtons.map(
                (filter) => {
                  const active =
                    winnerFilter ===
                    filter.id;

                  return (
                    <button
                      key={filter.id}
                      onClick={() =>
                        setWinnerFilter(
                          filter.id,
                        )
                      }
                      style={{
                        border: active
                          ? "1px solid #2c8fc5"
                          : "1px solid #d9eaf4",

                        background: active
                          ? "#2c8fc5"
                          : "#fff",

                        color: active
                          ? "#fff"
                          : "#143246",

                        padding:
                          "11px 15px",

                        borderRadius: 999,
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {filter.label}{" "}
                      <span
                        style={{
                          opacity: 0.8,
                        }}
                      >
                        ({filter.count})
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            <div
              style={{
                marginTop: 16,
              }}
            >
              <input
                value={winnerSearch}
                onChange={(event) =>
                  setWinnerSearch(
                    event.target.value,
                  )
                }
                placeholder="Søk etter navn, telefon, premie eller loddnummer"
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: 10,
                marginTop: 18,
              }}
            >
              {filteredWinners.length ===
              0 ? (
                <div
                  style={{
                    padding: 25,
                    textAlign:
                      "center",
                    color: "#617988",
                    background:
                      "#f8fcff",
                    borderRadius: 16,
                  }}
                >
                  Ingen vinnere i denne
                  kategorien.
                </div>
              ) : (
                filteredWinners.map(
                  (winner) => {
                    const status =
                      statusInfo(
                        winner.fulfillment_status,
                      );

                    return (
                      <button
                        key={winner.id}
                        onClick={() =>
                          setSelectedWinner(
                            winner,
                          )
                        }
                        style={{
                          width: "100%",
                          border:
                            "1px solid #d9eaf4",
                          borderRadius: 16,
                          background: "#fff",
                          padding: 15,
                          cursor: "pointer",
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(160px,2fr) minmax(130px,1fr) minmax(120px,1fr) auto",
                          gap: 12,
                          alignItems:
                            "center",
                          textAlign: "left",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 950,
                              fontSize: 16,
                            }}
                          >
                            {winner.orders
                              ?.customer_name ||
                              winner.shipping_name ||
                              "Navn mangler"}
                          </div>

                          <div
                            style={{
                              color:
                                "#617988",
                              fontSize: 13,
                              marginTop: 4,
                            }}
                          >
                            {winner.orders
                              ?.phone ||
                              "Telefon mangler"}
                          </div>
                        </div>

                        <div>
                          <strong>
                            {winner.prizes
                              ?.name ||
                              "Ukjent premie"}
                          </strong>
                        </div>

                        <div>
                          {methodText(
                            winner.fulfillment_method,
                          )}
                        </div>

                        <span
                          style={{
                            padding:
                              "7px 11px",
                            borderRadius:
                              999,
                            fontSize: 12,
                            fontWeight: 900,
                            color:
                              status.color,
                            background:
                              status.background,
                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {status.text}
                        </span>
                      </button>
                    );
                  },
                )
              )}
            </div>
          </div>

          {message && (
            <div
              className="panel"
              style={{
                marginTop: 16,
                fontWeight: 800,
              }}
            >
              {message}
            </div>
          )}
        </>
      )}

      {selectedWinner && (
        <div
          className="modal"
          onClick={() =>
            setSelectedWinner(null)
          }
        >
          <div
            className="modalCard"
            onClick={(event) =>
              event.stopPropagation()
            }
            style={{
              maxWidth: 650,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                gap: 15,
                alignItems:
                  "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#617988",
                    fontWeight: 800,
                  }}
                >
                  VINNER
                </div>

                <h2
                  style={{
                    margin:
                      "3px 0 0",
                  }}
                >
                  {selectedWinner.orders
                    ?.customer_name ||
                    selectedWinner.shipping_name ||
                    "Navn mangler"}
                </h2>
              </div>

              <button
                className="small"
                onClick={() =>
                  setSelectedWinner(
                    null,
                  )
                }
              >
                Lukk
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                marginTop: 22,
              }}
            >
              <Detail
                label="Premie"
                value={
                  selectedWinner.prizes
                    ?.name ||
                  "Ukjent premie"
                }
              />

              <Detail
                label="Telefon"
                value={
                  selectedWinner.orders
                    ?.phone ||
                  "Ikke registrert"
                }
              />

              <Detail
                label="Levering"
                value={methodText(
                  selectedWinner.fulfillment_method,
                )}
              />

              {selectedWinner.fulfillment_method ===
                "shipping" && (
                <>
                  <Detail
                    label="Mottaker"
                    value={
                      selectedWinner.shipping_name ||
                      selectedWinner.orders
                        ?.customer_name ||
                      "Ikke registrert"
                    }
                  />

                  <Detail
                    label="Adresse"
                    value={
                      selectedWinner.shipping_address ||
                      "Ikke registrert"
                    }
                  />

                  <Detail
                    label="Poststed"
                    value={`${selectedWinner.shipping_postal_code || ""} ${selectedWinner.shipping_city || ""}`.trim() || "Ikke registrert"}
                  />
                </>
              )}

              <Detail
                label="Loddnummer"
                value={
                  selectedWinner.ticket_number ||
                  "Ikke registrert"
                }
              />

              <Detail
                label="Registrert"
                value={formatDate(
                  selectedWinner.claimed_at,
                )}
              />
            </div>

            {!isProcessed(
              selectedWinner,
            ) && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 24,
                }}
              >
                {selectedWinner.fulfillment_method ===
                  "shipping" && (
                  <button
                    className="btn primary"
                    disabled={
                      updatingWinnerId ===
                      selectedWinner.id
                    }
                    onClick={() =>
                      updateStatus(
                        selectedWinner.id,
                        "shipped",
                      )
                    }
                  >
                    Merk som sendt
                  </button>
                )}

                {selectedWinner.fulfillment_method ===
                  "pickup" && (
                  <button
                    className="btn green"
                    disabled={
                      updatingWinnerId ===
                      selectedWinner.id
                    }
                    onClick={() =>
                      updateStatus(
                        selectedWinner.id,
                        "fulfilled",
                      )
                    }
                  >
                    Merk som utlevert
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        background: "#f5fafe",
        border: "1px solid #e0edf5",
        borderRadius: 14,
        padding: 13,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "#617988",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontWeight: 850,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}