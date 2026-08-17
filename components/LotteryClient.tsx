"use client";

import { useEffect, useRef, useState } from "react";

type Prize = {
  id: string;
  name: string;
  image_url: string;
  quantity_remaining: number;
  description?: string | null;
  value_nok?: number | null;
  is_consolation?: boolean;
};

type Ticket = {
  id: string;
  symbols: string[];
  prize: Prize | null;
};

const GRASROT_URL =
  "https://www.norsk-tipping.no/grasrotandelen/mottaker/993068187?fromSearch=true";

export default function LotteryClient({
  initialPrizes,
  campaignId,
  ticketPrice,
}: {
  initialPrizes: Prize[];
  campaignId: string;
  ticketPrice: number;
}) {
  const [count, setCount] = useState(10);
  const [packageType, setPackageType] =
    useState<"regular" | "grass">("regular");

  const [grassConfirmed, setGrassConfirmed] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isPaying, setIsPaying] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const [claimMethod, setClaimMethod] =
    useState<"" | "pickup" | "shipping">("");

  const [shipping, setShipping] = useState({
    name: "",
    address: "",
    postalCode: "",
    city: "",
  });

  const [claimSaved, setClaimSaved] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ticketCount = packageType === "grass" ? 5 : count;
  const price =
    packageType === "grass"
      ? 75
      : count * ticketPrice;

  useEffect(() => {
    const stored = sessionStorage.getItem("bst_tickets");

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed) && parsed.length) {
        setTickets(parsed);
        sessionStorage.removeItem("bst_tickets");
      }
    } catch {}
  }, []);

  async function saveClaim() {
    const current = tickets[index];

    if (!current?.prize || !claimMethod) return;

    const res = await fetch("/api/winners/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticketId: current.id,
        method: claimMethod,
        shippingName: shipping.name,
        shippingAddress: shipping.address,
        shippingPostalCode: shipping.postalCode,
        shippingCity: shipping.city,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Kunne ikke lagre valget.");
      return;
    }

    setClaimSaved(true);
  }

  async function buy() {
    if (isPaying) return;

    const cleanName = name.trim();
    const cleanPhone = phone.replace(/\D/g, "");

    if (cleanName.length < 2) {
      alert("Skriv inn navn.");
      return;
    }

    if (!/^\d{8}$/.test(cleanPhone)) {
      alert("Skriv inn et gyldig norsk telefonnummer med 8 siffer.");
      return;
    }

    if (packageType === "grass" && !grassConfirmed) {
      alert(
        "Bekreft at Bergenstjerne Fotballklubb er valgt som grasrotmottaker.",
      );
      return;
    }

    try {
      setIsPaying(true);

      const res = await fetch("/api/vipps/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          count: ticketCount,
          amount: price,
          packageType,
          campaignId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(
          data.error ||
            "Kunne ikke starte Vipps-betalingen.",
        );

        setIsPaying(false);
        return;
      }

      if (!data.redirectUrl) {
        alert("Vipps returnerte ingen betalingslenke.");

        setIsPaying(false);
        return;
      }

      window.location.href = data.redirectUrl;
    } catch (error) {
      console.error("VIPPS START ERROR:", error);

      alert(
        "Noe gikk galt da Vipps-betalingen skulle startes.",
      );

      setIsPaying(false);
    }
  }

  useEffect(() => {
    if (!tickets.length) return;

    const canvas = canvasRef.current;

    if (!canvas) return;

    const card = canvas.parentElement!;

    const r = card.getBoundingClientRect();

    const dpr = Math.max(
      1,
      window.devicePixelRatio || 1,
    );

    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);

    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const g = ctx.createLinearGradient(
      0,
      0,
      r.width,
      r.height,
    );

    g.addColorStop(0, "#edf1f4");
    g.addColorStop(0.22, "#aeb8bf");
    g.addColorStop(0.5, "#f5f7f8");
    g.addColorStop(0.75, "#9da7ae");
    g.addColorStop(1, "#e6ebee");

    ctx.fillStyle = g;

    ctx.fillRect(
      0,
      0,
      r.width,
      r.height,
    );

    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = `rgba(255,255,255,${
        Math.random() * 0.25
      })`;

      ctx.fillRect(
        Math.random() * r.width,
        Math.random() * r.height,
        1.2,
        1.2,
      );
    }

    ctx.fillStyle = "#fff";

    ctx.font = `900 ${Math.max(
      27,
      r.width * 0.052,
    )}px Arial`;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(
      "SKRAP HER",
      r.width / 2,
      r.height / 2,
    );

    ctx.globalCompositeOperation =
      "destination-out";

    let down = false;

    let last: {
      x: number;
      y: number;
    } | null = null;

    const pos = (e: PointerEvent) => {
      const b = canvas.getBoundingClientRect();

      return {
        x: e.clientX - b.left,
        y: e.clientY - b.top,
      };
    };

    const erase = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.lineWidth = Math.max(
        45,
        r.width * 0.055,
      );

      ctx.beginPath();

      ctx.moveTo(a.x, a.y);

      ctx.lineTo(b.x, b.y);

      ctx.stroke();
    };

    const check = () => {
      const image = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const data = image.data;

      const W = canvas.width;
      const H = canvas.height;

      const padX = W * 0.035;
      const padY = H * 0.035;

      const gapX = W * 0.024;
      const gapY = H * 0.024;

      const cellW =
        (W - padX * 2 - gapX * 2) / 3;

      const cellH =
        (H - padY * 2 - gapY * 2) / 3;

      let allClear = true;

      for (let row = 0; row < 3; row++) {
        for (
          let col = 0;
          col < 3;
          col++
        ) {
          const x0 = Math.floor(
            padX +
              col * (cellW + gapX) +
              cellW * 0.12,
          );

          const y0 = Math.floor(
            padY +
              row * (cellH + gapY) +
              cellH * 0.12,
          );

          const x1 = Math.floor(
            x0 + cellW * 0.76,
          );

          const y1 = Math.floor(
            y0 + cellH * 0.76,
          );

          let clear = 0;
          let total = 0;

          const step = Math.max(
            5,
            Math.floor(
              Math.min(cellW, cellH) / 28,
            ),
          );

          for (
            let y = y0;
            y < y1;
            y += step
          ) {
            for (
              let x = x0;
              x < x1;
              x += step
            ) {
              const alpha =
                data[(y * W + x) * 4 + 3];

              total++;

              if (alpha < 25) {
                clear++;
              }
            }
          }

          if (
            !total ||
            clear / total < 0.68
          ) {
            allClear = false;
          }
        }
      }

      if (allClear) {
        ctx.clearRect(
          0,
          0,
          r.width,
          r.height,
        );

        setRevealed(true);
      }
    };

    canvas.onpointerdown = (e) => {
      e.preventDefault();

      down = true;

      last = pos(e);

      canvas.setPointerCapture?.(
        e.pointerId,
      );

      erase(last, last);
    };

    canvas.onpointermove = (e) => {
      if (!down) return;

      e.preventDefault();

      const p = pos(e);

      erase(last || p, p);

      last = p;

      check();
    };

    canvas.onpointerup =
      canvas.onpointercancel = () => {
        down = false;
        last = null;

        check();
      };
  }, [tickets, index]);

  function revealCurrentTicket() {
    const canvas = canvasRef.current;

    if (canvas) {
      const ctx =
        canvas.getContext("2d");

      if (ctx) {
        ctx.clearRect(
          0,
          0,
          canvas.width,
          canvas.height,
        );
      }
    }

    setRevealed(true);
  }

  if (tickets.length) {
    const current = tickets[index];

    return (
      <div className="modal">
        <div className="modalCard">
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
            }}
          >
            <b>
              Lodd {index + 1} av{" "}
              {tickets.length}
            </b>

            <button
              className="small"
              onClick={() =>
                setTickets([])
              }
            >
              Lukk
            </button>
          </div>

          <p
            style={{
              textAlign: "center",
              fontWeight: 700,
              margin: "12px 0",
              fontSize: "18px",
            }}
          >
            3 like symboler gir premie
          </p>

          <div className="scratchCard">
            <div className="nineGrid">
              {current.symbols.map(
                (url, i) => (
                  <div
                    className="nineSymbol"
                    key={i}
                  >
                    <img
                      src={
                        url ||
                        "/football.svg"
                      }
                      alt="Skrapesymbol"
                    />
                  </div>
                ),
              )}
            </div>

            <canvas
              ref={canvasRef}
            ></canvas>
          </div>

          {!revealed && (
            <div
              style={{
                textAlign: "center",
                marginTop: 12,
              }}
            >
              <button
                className="btn scratchAllBtn"
                onClick={
                  revealCurrentTicket
                }
              >
                Skrap alt
              </button>
            </div>
          )}

          {revealed && (
            <div className="result">
              {current.prize ? (
                <div className="winCard">
                  <h2>
                    🎉 Gratulerer!
                  </h2>

                  <img
                    src={
                      current.prize
                        .image_url
                    }
                    alt={
                      current.prize.name
                    }
                  />

                  <h3>
                    Du vant{" "}
                    {
                      current.prize
                        .name
                    }
                  </h3>

                  {current.prize
                    .description && (
                    <p>
                      {
                        current.prize
                          .description
                      }
                    </p>
                  )}

                  {!claimSaved ? (
                    <div className="claimBox">
                      <h3>
                        Hvordan vil du
                        motta premien?
                      </h3>

                      <div className="claimChoices">
                        <button
                          className={`claimChoice ${
                            claimMethod ===
                            "pickup"
                              ? "active"
                              : ""
                          }`}
                          onClick={() =>
                            setClaimMethod(
                              "pickup",
                            )
                          }
                        >
                          Jeg henter
                          premien
                        </button>

                        <button
                          className={`claimChoice ${
                            claimMethod ===
                            "shipping"
                              ? "active"
                              : ""
                          }`}
                          onClick={() =>
                            setClaimMethod(
                              "shipping",
                            )
                          }
                        >
                          Send premien i
                          posten
                        </button>
                      </div>

                      {claimMethod ===
                        "pickup" && (
                        <p className="pickupText">
                          Vi har registrert
                          at du ønsker å
                          hente premien.
                          Har du spørsmål,
                          kan du kontakte
                          oss på{" "}
                          <a href="mailto:post@bergensi.no">
                            post@bergensi.no
                          </a>
                          .
                        </p>
                      )}

                      {claimMethod ===
                        "shipping" && (
                        <div className="shippingForm">
                          <label>
                            Navn
                            <input
                              value={
                                shipping.name
                              }
                              onChange={(
                                e,
                              ) =>
                                setShipping(
                                  {
                                    ...shipping,
                                    name: e
                                      .target
                                      .value,
                                  },
                                )
                              }
                            />
                          </label>

                          <label>
                            Adresse
                            <input
                              value={
                                shipping.address
                              }
                              onChange={(
                                e,
                              ) =>
                                setShipping(
                                  {
                                    ...shipping,
                                    address:
                                      e
                                        .target
                                        .value,
                                  },
                                )
                              }
                            />
                          </label>

                          <label>
                            Postnummer
                            <input
                              inputMode="numeric"
                              value={
                                shipping.postalCode
                              }
                              onChange={(
                                e,
                              ) =>
                                setShipping(
                                  {
                                    ...shipping,
                                    postalCode:
                                      e
                                        .target
                                        .value,
                                  },
                                )
                              }
                            />
                          </label>

                          <label>
                            Poststed
                            <input
                              value={
                                shipping.city
                              }
                              onChange={(
                                e,
                              ) =>
                                setShipping(
                                  {
                                    ...shipping,
                                    city: e
                                      .target
                                      .value,
                                  },
                                )
                              }
                            />
                          </label>
                        </div>
                      )}

                      {claimMethod && (
                        <button
                          className="btn primary"
                          onClick={
                            saveClaim
                          }
                        >
                          Bekreft valget
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="claimSaved">
                      ✓ Valget er
                      registrert.
                      Bergenstjerne
                      Fotballklubb har
                      fått beskjed.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <h2>
                    Ingen premie denne
                    gangen
                  </h2>

                  <p>
                    Takk for at du
                    støtter Bergenstjerne
                    Fotballklubb! 💙
                  </p>
                </>
              )}

              <button
                className="btn primary"
                onClick={() => {
                  if (
                    index <
                    tickets.length - 1
                  ) {
                    setIndex(
                      index + 1,
                    );

                    setRevealed(false);

                    setClaimMethod("");

                    setClaimSaved(false);

                    setShipping({
                      name: "",
                      address: "",
                      postalCode: "",
                      city: "",
                    });
                  } else {
                    setTickets([]);
                  }
                }}
              >
                {index <
                tickets.length - 1
                  ? "Neste lodd"
                  : "Ferdig"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <header>
        <div className="container">
          <nav>
            <div className="brand">
              Bergenstjerne
              Fotballklubb
            </div>

            <div className="navlinks">
              <a href="#kjop">
                Kjøp lodd
              </a>

              <a href="#premier">
                Premier
              </a>

              <a href="/admin">
                Admin
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container heroGrid">
            <div>
              <span className="badge">
                Ingen skal stå utenfor
              </span>

              <h1>
                Skrap. Vinn.
                <br />
                <em>
                  Bygg fellesskap.
                </em>
              </h1>

              <p className="lead">
                Kjøp digitale
                skrapelodd og støtt
                Bergenstjerne
                Fotballklubb.
                Overskuddet går til
                sosiale aktiviteter,
                nødvendig utstyr og
                tiltak som styrker et
                trygt og inkluderende
                fellesskap for
                medlemmene våre.
              </p>

              <a
                className="btn primary"
                href="#kjop"
              >
                Kjøp lodd nå
              </a>
            </div>

            <div className="logoCard">
              <img
                src="/bergenstjerne-logo.jpeg"
                alt="Bergenstjerne Fotballklubb"
              />
            </div>
          </div>
        </section>

        <section id="kjop">
          <div className="container">
            <div className="title">
              <h2>
                Kjøp digitale
                skrapelodd
              </h2>

              <p>
                Vanlige lodd koster {ticketPrice}
                kr per stykk. Etter
                godkjent Vipps-betaling
                får du loddene direkte
                på skjermen.
              </p>
            </div>

            <div className="buy">
              <div className="buyTabs">
                <button
                  className={`buyTab ${
                    packageType ===
                    "regular"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setPackageType(
                      "regular",
                    )
                  }
                >
                  Vanlig kjøp
                </button>

                <button
                  className={`buyTab ${
                    packageType ===
                    "grass"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setPackageType(
                      "grass",
                    )
                  }
                >
                  ⭐ Grasrotpakken
                </button>
              </div>

              <div
                className={`buyPanel ${
                  packageType ===
                  "regular"
                    ? "active"
                    : ""
                }`}
              >
                <div className="packages">
                  {[1, 5, 10, 20].map(
                    (n) => (
                      <button
                        className={`package ${
                          count === n
                            ? "active"
                            : ""
                        }`}
                        key={n}
                        onClick={() =>
                          setCount(n)
                        }
                      >
                        <strong>
                          {n} lodd
                        </strong>

                        <span>
                          {n * ticketPrice} kr
                        </span>
                      </button>
                    ),
                  )}
                </div>

                <div className="qty">
                  <button
                    onClick={() =>
                      setCount(
                        Math.max(
                          1,
                          count - 1,
                        ),
                      )
                    }
                  >
                    −
                  </button>

                  <div className="qtyMid">
                    <span>
                      Valgfritt antall
                    </span>

                    <strong>
                      {count}
                    </strong>

                    <span>
                      {count * ticketPrice} kr
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      setCount(
                        count + 1,
                      )
                    }
                  >
                    +
                  </button>
                </div>
              </div>

              <div
                className={`buyPanel ${
                  packageType ===
                  "grass"
                    ? "active"
                    : ""
                }`}
              >
                <div className="grassPackage">
                  <h3>
                    Grasrotpakken
                  </h3>

                  <div className="offer">
                    5 lodd – betal kun
                    75 kr
                  </div>

                  <p>
                    Betal for tre lodd
                    og få to ekstra når
                    du velger
                    Bergenstjerne
                    Fotballklubb som
                    grasrotmottaker.
                  </p>

                  <a
                    className="btn green"
                    href={GRASROT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Velg Bergenstjerne
                    Fotballklubb hos
                    Norsk Tipping
                  </a>

                  <label className="confirmBox">
                    <input
                      type="checkbox"
                      checked={
                        grassConfirmed
                      }
                      onChange={(e) =>
                        setGrassConfirmed(
                          e.target
                            .checked,
                        )
                      }
                    />

                    <span>
                      Jeg bekrefter at
                      Bergenstjerne
                      Fotballklubb er
                      valgt som
                      grasrotmottaker.
                    </span>
                  </label>
                </div>
              </div>

              <div className="formGrid">
                <label>
                  Navn
                  <input
                    value={name}
                    onChange={(e) =>
                      setName(
                        e.target.value,
                      )
                    }
                    placeholder="Fornavn og etternavn"
                  />
                </label>

                <label>
                  Telefonnummer
                  <input
                    value={phone}
                    onChange={(e) =>
                      setPhone(
                        e.target.value,
                      )
                    }
                    inputMode="numeric"
                    placeholder="8 siffer"
                  />
                </label>
              </div>

              <div className="summary">
                <div>
                  <b>
                    {ticketCount} lodd
                  </b>

                  {packageType ===
                    "grass" && (
                    <div>
                      Grasrotpakken
                    </div>
                  )}
                </div>

                <strong>
                  {price} kr
                </strong>
              </div>

              <button
                className="vippsBtn"
                onClick={buy}
                disabled={isPaying}
              >
                {isPaying
                  ? "Åpner Vipps..."
                  : "Betal med Vipps"}
              </button>

              <p className="vippsNote">
                Du sendes sikkert videre
                til Vipps. Digitale
                skrapelodd opprettes
                først når betalingen er
                godkjent.
              </p>
            </div>
          </div>
        </section>

        <section className="supportSection">
          <div className="container">
            <div className="supportCard">
              <div className="supportHeart">💙</div>

              <div className="supportContent">
                <h2>Dette støtter du</h2>

                <p className="supportIntro">
                  Bergenstjerne Fotballklubb tilbyr tilrettelagt fotball for
                  barn, ungdom og voksne.
                </p>

                <p>
                  Hos oss handler fotball om <strong>mestring, vennskap,
                  aktivitet og tilhørighet</strong>. Inntektene fra loddsalget
                  går direkte tilbake til spillerne og bidrar til utstyr,
                  cuper, turneringer, reiser og sosiale aktiviteter.
                </p>

                <p className="supportClosing">
                  Ditt bidrag gjør det mulig for flere å oppleve fotballglede
                  og fellesskap. ⚽💙
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="premier">
          <div className="container">
            <div className="title">
              <h2>Premier</h2>

              <p>
                Se noen av premiene du
                kan vinne.
              </p>
            </div>

            <div className="prizeGrid">
              {initialPrizes.map(
                (p) => (
                  <div
                    className="prizeCard"
                    key={p.id}
                  >
                    <img
                      src={p.image_url}
                      alt={p.name}
                    />

                    <h3>{p.name}</h3>

                    {p.description && (
                      <p>
                        {
                          p.description
                        }
                      </p>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="container">
          Bergenstjerne FK · Org.nr.
          934 990 730 · Vipps #2005
        </div>
      </footer>
    </>
  );
}