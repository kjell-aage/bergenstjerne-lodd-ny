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
  fulfillment_status?: string;
  prizes?: {
    name?: string;
  } | null;
  orders?: {
    customer_name?: string;
    phone?: string;
  } | null;
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [message, setMessage] = useState("");
  const [updatingWinnerId, setUpdatingWinnerId] = useState<string | null>(null);
  const [editingPrizeId, setEditingPrizeId] = useState<string | null>(null);

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

  const statistics = useMemo(() => {
    const normalized = winners.map((winner) =>
      (winner.fulfillment_status || "").toLowerCase()
    );

    const delivered = normalized.filter((status) =>
      ["fulfilled", "delivered", "utlevert", "collected"].includes(status)
    ).length;

    const shipped = normalized.filter((status) =>
      ["shipped", "sent", "sendt"].includes(status)
    ).length;

    const pending = Math.max(0, winners.length - delivered - shipped);

    return {
      winners: winners.length,
      pending,
      shipped,
      delivered,
      prizesRemaining: prizes.reduce(
        (sum, prize) => sum + Number(prize.quantity_remaining || 0),
        0
      ),
    };
  }, [prizes, winners]);

  async function load(showSuccessMessage = false) {
    const prizeResponse = await fetch("/api/admin/prizes", {
      headers: {
        "x-admin-password": password,
      },
    });

    const prizeData = await prizeResponse.json();

    if (!prizeResponse.ok) {
      setLoggedIn(false);
      setMessage(prizeData.error || "Feil passord");
      return false;
    }

    const winnerResponse = await fetch("/api/admin/winners", {
      headers: {
        "x-admin-password": password,
      },
    });

    const winnerData = await winnerResponse.json();

    if (!winnerResponse.ok) {
      setLoggedIn(false);
      setMessage(winnerData.error || "Kunne ikke hente vinnere");
      return false;
    }

    setPrizes(prizeData);
    setWinners(winnerData);
    setLoggedIn(true);

    if (showSuccessMessage) {
      setMessage("Oversikten er oppdatert.");
    } else {
      setMessage("");
    }

    return true;
  }

  async function updateStatus(
    id: string,
    fulfillmentStatus: "shipped" | "fulfilled"
  ) {
    setUpdatingWinnerId(id);
    setMessage("");

    const response = await fetch("/api/admin/winners", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({
        id,
        fulfillmentStatus,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setUpdatingWinnerId(null);
      setMessage(result.error || "Kunne ikke oppdatere status");
      return;
    }

    setWinners((current) =>
      current.map((winner) =>
        winner.id === id
          ? { ...winner, fulfillment_status: fulfillmentStatus }
          : winner
      )
    );

    setUpdatingWinnerId(null);
    setMessage(
      fulfillmentStatus === "fulfilled"
        ? "Premien er markert som utlevert."
        : "Premien er markert som sendt."
    );
  }

  async function remove(id: string) {
    if (!confirm("Slette premien?")) return;

    const response = await fetch(`/api/admin/prizes?id=${id}`, {
      method: "DELETE",
      headers: {
        "x-admin-password": password,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Kunne ikke slette premien");
      return;
    }

    await load();
  }

  async function upload(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      headers: {
        "x-admin-password": password,
      },
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Opplasting feilet");
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

  function startEditingPrize(prize: Prize) {
    setEditingPrizeId(prize.id);
    setForm({
      name: prize.name || "",
      description: prize.description || "",
      value_nok: Number(prize.value_nok || 0),
      quantity_total: Number(prize.quantity_total || prize.quantity_remaining || 1),
      win_chance_percent: Number(prize.win_chance_percent || 0),
      sort_order: Number(prize.sort_order || 0),
      active: prize.active !== false,
      is_consolation: Boolean(prize.is_consolation),
      image_url: prize.image_url || "",
      level: prize.level || "Premie",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    setMessage("Du redigerer nå premien.");
  }

  async function save() {
    const isEditing = Boolean(editingPrizeId);

    const response = await fetch("/api/admin/prizes", {
      method: isEditing ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({
        ...form,
        id: editingPrizeId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(
        result.error ||
          (isEditing ? "Kunne ikke oppdatere premien" : "Kunne ikke lagre")
      );
      return;
    }

    setMessage(
      isEditing ? "Premien er oppdatert." : "Premien er lagret."
    );

    resetForm();
    await load();
  }

  function statusInfo(status?: string) {
    const normalized = (status || "").toLowerCase();

    if (
      ["fulfilled", "delivered", "utlevert", "collected"].includes(normalized)
    ) {
      return {
        text: "✅ Utlevert",
        color: "#166534",
        background: "#dcfce7",
      };
    }

    if (["shipped", "sent", "sendt"].includes(normalized)) {
      return {
        text: "📦 Sendt",
        color: "#92400e",
        background: "#fef3c7",
      };
    }

    return {
      text: "⏳ Ikke behandlet",
      color: "#991b1b",
      background: "#fee2e2",
    };
  }

  const statCards = [
    ["🏆", "Vinnere", statistics.winners],
    ["⏳", "Ikke behandlet", statistics.pending],
    ["📦", "Sendt", statistics.shipped],
    ["✅", "Utlevert", statistics.delivered],
    ["🎁", "Premier igjen", statistics.prizesRemaining],
  ] as const;

  return (
    <main className="container adminWrap">
      <h1>Admin – premier</h1>

      {!loggedIn ? (
        <div className="panel">
          <h2>Logg inn</h2>

          <label>
            Adminpassord
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  load();
                }
              }}
            />
          </label>

          <button
            className="btn primary"
            style={{ marginTop: 12 }}
            onClick={() => load()}
          >
            Åpne admin
          </button>

          <p>{message}</p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            {statCards.map(([icon, label, value]) => (
              <div
                className="panel"
                key={label}
                style={{ padding: 16, textAlign: "center" }}
              >
                <div style={{ fontSize: 28 }}>{icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
                <div style={{ fontSize: 14, color: "#52646f" }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="adminGrid">
            <div className="panel">
              <h2>{editingPrizeId ? "Rediger premie" : "Ny premie"}</h2>

              <label>
                Navn
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>

              <label>
                Beskrivelse
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="Kort beskrivelse av premien"
                />
              </label>

              <label>
                Verdi i kroner (valgfritt)
                <input
                  type="number"
                  min="0"
                  value={form.value_nok}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      value_nok: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={form.is_consolation}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      is_consolation: event.target.checked,
                    })
                  }
                  style={{ width: 20, marginRight: 8 }}
                />
                Dette er trøstepremien
              </label>

              <label>
                Antall
                <input
                  type="number"
                  min="1"
                  value={form.quantity_total}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      quantity_total: Number(event.target.value),
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
                  value={form.win_chance_percent}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      win_chance_percent: Number(event.target.value),
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
                    const file = event.target.files?.[0];
                    if (file) upload(file);
                  }}
                />
              </label>

              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="Forhåndsvisning av premien"
                  style={{ width: 130, height: 130, objectFit: "contain" }}
                />
              )}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn green"
                  onClick={save}
                >
                  {editingPrizeId ? "💾 Oppdater premie" : "Lagre premie"}
                </button>

                {editingPrizeId && (
                  <button
                    className="btn"
                    onClick={() => {
                      resetForm();
                      setMessage("Redigering avbrutt.");
                    }}
                  >
                    Avbryt
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <h2>Premier</h2>

            <div className="adminList">
              {prizes.map((prize) => (
                <div className="row" key={prize.id}>
                  <img src={prize.image_url} alt={prize.name} />

                  <div style={{ flex: 1 }}>
                    <b>{prize.name}</b>
                    {prize.is_consolation && <span> · Trøstepremie</span>}
                    <br />
                    <small>
                      {prize.quantity_remaining} igjen ·{" "}
                      {prize.win_chance_percent} %
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
                      onClick={() => startEditingPrize(prize)}
                    >
                      ✏️ Rediger
                    </button>

                    <button
                      className="small danger"
                      onClick={() => remove(prize.id)}
                    >
                      Slett
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <h2 style={{ margin: 0 }}>Vinnere ({winners.length})</h2>

              <button className="small" onClick={() => load(true)}>
                🔄 Oppdater
              </button>
            </div>

            {winners.length === 0 ? (
              <p>Ingen vinnere er registrert ennå.</p>
            ) : (
              <div style={{ width: "100%", overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    minWidth: 850,
                    borderCollapse: "collapse",
                    background: "#fff",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        borderBottom: "2px solid #dbe7ef",
                        background: "#f3f8fb",
                      }}
                    >
                      <th style={{ padding: 12 }}>Premie</th>
                      <th style={{ padding: 12 }}>Navn</th>
                      <th style={{ padding: 12 }}>Telefon</th>
                      <th style={{ padding: 12 }}>Loddnr</th>
                      <th style={{ padding: 12 }}>Status</th>
                      <th style={{ padding: 12 }}>Handling</th>
                    </tr>
                  </thead>

                  <tbody>
                    {winners.map((winner) => {
                      const status = statusInfo(winner.fulfillment_status);
                      const isUpdating = updatingWinnerId === winner.id;

                      return (
                        <tr
                          key={winner.id}
                          style={{ borderBottom: "1px solid #e5edf2" }}
                        >
                          <td style={{ padding: 12 }}>
                            <strong>
                              {winner.prizes?.name || "Ukjent premie"}
                            </strong>
                          </td>

                          <td style={{ padding: 12 }}>
                            {winner.orders?.customer_name || "Navn mangler"}
                          </td>

                          <td style={{ padding: 12 }}>
                            {winner.orders?.phone ? (
                              <a href={`tel:${winner.orders.phone}`}>
                                {winner.orders.phone}
                              </a>
                            ) : (
                              "Telefon mangler"
                            )}
                          </td>

                          <td
                            style={{
                              padding: 12,
                              fontFamily: "monospace",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {winner.ticket_number || "Mangler"}
                          </td>

                          <td style={{ padding: 12 }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontWeight: 700,
                                fontSize: 13,
                                color: status.color,
                                background: status.background,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isUpdating ? "Oppdaterer …" : status.text}
                            </span>
                          </td>

                          <td style={{ padding: 12, whiteSpace: "nowrap" }}>
                            <button
                              className="small"
                              disabled={isUpdating}
                              onClick={() =>
                                updateStatus(winner.id, "shipped")
                              }
                            >
                              📦 Sendt
                            </button>

                            <button
                              className="small green"
                              disabled={isUpdating}
                              style={{ marginLeft: 8 }}
                              onClick={() =>
                                updateStatus(winner.id, "fulfilled")
                              }
                            >
                              ✅ Utlevert
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {message && (
            <div
              className="panel"
              style={{
                marginTop: 14,
                padding: 12,
                fontWeight: 700,
              }}
            >
              {message}
            </div>
          )}
        </>
      )}
    </main>
  );
}