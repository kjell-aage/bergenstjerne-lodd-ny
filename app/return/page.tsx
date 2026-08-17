"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";

type Prize = {
  id?: string;
  name?: string;
  image_url?: string;
  description?: string;
  value_nok?: number;
  is_consolation?: boolean;
};

type Ticket = {
  id: string;
  symbols: string[];
  prize: Prize | null;
};

type ApiResult = {
  status?: string;
  tickets?: Ticket[];
  error?: string;
};

function ScratchTicket({
  ticket,
  number,
}: {
  ticket: Ticket;
  number: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [revealed, setRevealed] = useState(false);

  const reveal = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }

    setRevealed(true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const context = canvas.getContext("2d");

    if (!context) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.scale(ratio, ratio);

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#d8dde2");
    gradient.addColorStop(0.5, "#98a3ad");
    gradient.addColorStop(1, "#d8dde2");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#143246";
    context.font = "700 22px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("SKRAP HER", width / 2, height / 2 - 12);
    context.font = "15px Arial";
    context.fillText("Finn tre like symboler", width / 2, height / 2 + 20);
  }, []);

  function scratch(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || revealed) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(x, y, 34, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  return (
    <article style={styles.ticketCard}>
      <div style={styles.ticketHeader}>
        <div>
          <strong>Lodd {number}</strong>
          <div style={styles.ticketId}>{ticket.id}</div>
        </div>
        <span style={styles.badge}>Bergenstjerne FK</span>
      </div>

      <div style={styles.scratchArea}>
        <div style={styles.symbolGrid}>
          {(ticket.symbols || []).map((symbol, index) => (
            <div style={styles.symbolBox} key={`${ticket.id}-${index}`}>
              <img
                src={symbol}
                alt={`Symbol ${index + 1}`}
                style={styles.symbolImage}
              />
            </div>
          ))}
        </div>

        {!revealed && (
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            onPointerDown={(event) => {
              drawingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              scratch(event);
            }}
            onPointerMove={scratch}
            onPointerUp={() => {
              drawingRef.current = false;
            }}
            onPointerCancel={() => {
              drawingRef.current = false;
            }}
          />
        )}
      </div>

      {!revealed ? (
        <button type="button" style={styles.smallButton} onClick={reveal}>
          Vis hele loddet
        </button>
      ) : ticket.prize ? (
        <div style={styles.winBox}>
          <strong>Gratulerer! Du vant {ticket.prize.name || "en premie"}.</strong>
          {ticket.prize.description && <p>{ticket.prize.description}</p>}
        </div>
      ) : (
        <div style={styles.noWinBox}>
          Ikke gevinst denne gangen – takk for at du støtter Bergenstjerne FK!
        </div>
      )}
    </article>
  );
}

function ReturnContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || "";

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [message, setMessage] = useState("Kontrollerer betalingen hos Vipps …");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const issueTickets = useCallback(async () => {
    const response = await fetch("/api/tickets/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
      cache: "no-store",
    });

    const result: ApiResult = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Kunne ikke opprette loddene.");
    }

    setTickets(result.tickets || []);
    setMessage("Betalingen er godkjent. Loddene dine er klare!");
    setLoading(false);
  }, [reference]);

  const checkPayment = useCallback(async () => {
    if (!reference) {
      setError("Betalingsreferansen mangler i adressen.");
      setLoading(false);
      return;
    }

    try {
      setError("");

      const response = await fetch(
        `/api/vipps/status/${encodeURIComponent(reference)}`,
        { cache: "no-store" },
      );

      const result: ApiResult = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Kunne ikke kontrollere betalingen.");
      }

      if (result.status === "CAPTURED") {
        setTickets(result.tickets || []);
        setMessage("Betalingen er godkjent. Loddene dine er klare!");
        setLoading(false);
        return;
      }

      if (result.status === "AUTHORIZED_AND_CAPTURED") {
        setMessage("Betalingen er godkjent. Gjør loddene klare …");
        await issueTickets();
        return;
      }

      if (attempt >= 29) {
        setError(
          "Betalingen er ikke ferdig registrert ennå. Vent litt og prøv på nytt.",
        );
        setLoading(false);
        return;
      }

      setMessage("Venter på bekreftelse fra Vipps …");
      window.setTimeout(() => setAttempt((value) => value + 1), 2000);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Det oppstod en feil under kontroll av betalingen.",
      );
      setLoading(false);
    }
  }, [attempt, issueTickets, reference]);

  useEffect(() => {
    void checkPayment();
  }, [checkPayment]);

  function retry() {
    setLoading(true);
    setError("");
    setMessage("Kontrollerer betalingen hos Vipps …");
    setAttempt((value) => value + 1);
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <img
          src="/bergenstjerne-logo.jpeg"
          alt="Bergenstjerne Fotballklubb"
          style={styles.logo}
        />
        <p style={styles.eyebrow}>BERGENSTJERNE FOTBALLKLUBB</p>
        <h1 style={styles.title}>Dine skrapelodd</h1>
        <p style={styles.lead}>{message}</p>
        {reference && <p style={styles.reference}>Referanse: {reference}</p>}
      </section>

      {loading && <div style={styles.loader} aria-label="Laster" />}

      {error && (
        <section style={styles.errorBox}>
          <strong>Noe gikk galt</strong>
          <p>{error}</p>
          <button type="button" style={styles.retryButton} onClick={retry}>
            Prøv på nytt
          </button>
        </section>
      )}

      {!loading && !error && tickets.length === 0 && (
        <section style={styles.infoBox}>
          Betalingen er registrert, men vi fant ingen lodd på ordren. Prøv på nytt.
          <br />
          <button type="button" style={styles.retryButton} onClick={retry}>
            Hent loddene
          </button>
        </section>
      )}

      {tickets.length > 0 && (
        <section style={styles.ticketList}>
          {tickets.map((ticket, index) => (
            <ScratchTicket key={ticket.id} ticket={ticket} number={index + 1} />
          ))}
        </section>
      )}

      <footer style={styles.footer}>
        <strong style={styles.footerTitle}>TUSEN TAKK FOR STØTTEN!</strong>
        <span style={styles.footerText}>
          Du er med på å skape fotballglede for alle i Bergenstjerne FK.
        </span>
      </footer>
    </main>
  );
}

export default function ReturnPage() {
  return (
    <Suspense
      fallback={
        <main style={styles.page}>
          <div style={styles.loader} aria-label="Laster" />
        </main>
      }
    >
      <ReturnContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #eef7fb 0%, #ffffff 55%)",
    color: "#143246",
    padding: "32px 16px 56px",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  hero: { maxWidth: 760, margin: "0 auto 28px", textAlign: "center" },
  logo: {
    display: "block",
    width: 92,
    height: 92,
    margin: "0 auto 14px",
    borderRadius: "50%",
    objectFit: "cover",
    boxShadow: "0 8px 22px rgba(20,50,70,0.18)",
  },
  eyebrow: { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1.5 },
  title: { margin: "8px 0", fontSize: "clamp(30px, 7vw, 48px)" },
  lead: { margin: "8px auto", fontSize: 18, lineHeight: 1.5 },
  reference: { margin: "10px 0 0", fontSize: 12, color: "#657682" },
  loader: {
    width: 44,
    height: 44,
    margin: "40px auto",
    border: "5px solid #dbe7ed",
    borderTopColor: "#143246",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  ticketList: { maxWidth: 760, margin: "0 auto", display: "grid", gap: 24 },
  ticketCard: {
    background: "#ffffff",
    border: "1px solid #dfe9ee",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 12px 30px rgba(20,50,70,0.10)",
  },
  ticketHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  ticketId: { marginTop: 4, fontSize: 11, color: "#7a8992" },
  badge: {
    background: "#143246",
    color: "white",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  scratchArea: {
    position: "relative",
    width: "100%",
    maxWidth: 520,
    aspectRatio: "1.45 / 1",
    margin: "0 auto 14px",
    overflow: "hidden",
    borderRadius: 16,
    background: "#eef3f6",
  },
  symbolGrid: {
    position: "absolute",
    inset: 0,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    padding: 12,
  },
  symbolBox: {
    minWidth: 0,
    minHeight: 0,
    display: "grid",
    placeItems: "center",
    background: "white",
    borderRadius: 10,
    border: "1px solid #dfe8ec",
  },
  symbolImage: {
    display: "block",
    width: "78%",
    height: "78%",
    objectFit: "contain",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    touchAction: "none",
    cursor: "crosshair",
  },
  smallButton: {
    display: "block",
    margin: "0 auto",
    border: 0,
    background: "transparent",
    color: "#143246",
    textDecoration: "underline",
    cursor: "pointer",
  },
  winBox: {
    marginTop: 14,
    padding: 16,
    borderRadius: 12,
    background: "#fff5c7",
    color: "#463800",
    textAlign: "center",
  },
  noWinBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    background: "#eef5f7",
    textAlign: "center",
  },
  errorBox: {
    maxWidth: 620,
    margin: "28px auto",
    padding: 20,
    borderRadius: 14,
    background: "#fff0f0",
    color: "#7c1d1d",
    textAlign: "center",
  },
  infoBox: {
    maxWidth: 620,
    margin: "28px auto",
    padding: 20,
    borderRadius: 14,
    background: "#eef5f7",
    textAlign: "center",
    lineHeight: 1.6,
  },
  retryButton: {
    marginTop: 10,
    padding: "11px 18px",
    border: 0,
    borderRadius: 10,
    background: "#143246",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
  },
  footer: {
    maxWidth: 760,
    margin: "34px auto 0",
    padding: "28px 20px",
    textAlign: "center",
    color: "white",
    background: "linear-gradient(135deg, #0b2d42 0%, #174d6b 100%)",
    border: "3px solid #e9c857",
    borderRadius: 18,
    boxShadow: "0 14px 32px rgba(20,50,70,0.22)",
  },
  footerTitle: {
    display: "block",
    color: "#f5d451",
    fontSize: "clamp(25px, 5vw, 38px)",
    fontWeight: 900,
    letterSpacing: 1,
    lineHeight: 1.1,
    textShadow: "0 2px 0 rgba(0,0,0,0.25)",
  },
  footerText: {
    display: "block",
    marginTop: 10,
    color: "white",
    fontSize: "clamp(16px, 2.5vw, 20px)",
    fontWeight: 700,
    lineHeight: 1.4,
  },
};