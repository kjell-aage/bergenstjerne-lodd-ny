"use client";

import { useEffect, useState } from "react";

export default function ReturnPage() {
  const [message, setMessage] = useState(
    "Kontrollerer betalingen..."
  );

  const [tickets, setTickets] = useState<any[]>([]);

  useEffect(() => {
    const referenceFromUrl = new URLSearchParams(
      window.location.search
    ).get("reference");

    if (!referenceFromUrl) {
      setMessage("Mangler betalingsreferanse.");
      return;
    }

    // Etter denne linjen vet TypeScript sikkert
    // at betalingsreferansen alltid er en string.
    const reference: string = referenceFromUrl;

    let cancelled = false;
    let tries = 0;

    async function issueTickets() {
      try {
        setMessage(
          "Betalingen er godkjent. Oppretter loddene..."
        );

        const response = await fetch(
          "/api/tickets/issue",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reference,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Kunne ikke opprette loddene."
          );
        }

        if (cancelled) return;

        const issuedTickets = data.tickets || [];

        sessionStorage.setItem(
          "bst_tickets",
          JSON.stringify(issuedTickets)
        );

        setTickets(issuedTickets);

        setMessage(
          "Betalingen er godkjent. Loddene dine er klare."
        );
      } catch (error) {
        console.error(
          "TICKET ISSUE ERROR:",
          error
        );

        if (!cancelled) {
          setMessage(
            "Betalingen er mottatt, men vi klarte ikke å opprette loddene akkurat nå. Oppdater siden om litt."
          );
        }
      }
    }

    async function checkPayment() {
      tries += 1;

      try {
        const response = await fetch(
          `/api/vipps/status/${encodeURIComponent(
            reference
          )}`,
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Kunne ikke kontrollere betalingen."
          );
        }

        if (cancelled) return;

        if (data.status === "CAPTURED") {
          const existingTickets =
            data.tickets || [];

          sessionStorage.setItem(
            "bst_tickets",
            JSON.stringify(existingTickets)
          );

          setTickets(existingTickets);

          setMessage(
            "Betalingen er godkjent. Loddene dine er klare."
          );

          return;
        }

        if (
          data.status ===
          "AUTHORIZED_AND_CAPTURED"
        ) {
          await issueTickets();
          return;
        }

        if (
          [
            "ABORTED",
            "EXPIRED",
            "TERMINATED",
          ].includes(data.status)
        ) {
          setMessage(
            "Betalingen ble ikke fullført."
          );

          return;
        }

        if (tries < 20) {
          setTimeout(checkPayment, 2000);
        } else {
          setMessage(
            "Betalingen behandles fortsatt. Oppdater siden om litt."
          );
        }
      } catch (error) {
        console.error(
          "VIPPS STATUS ERROR:",
          error
        );

        if (tries < 20) {
          setTimeout(checkPayment, 2000);
        } else if (!cancelled) {
          setMessage(
            "Vi klarte ikke å kontrollere betalingen. Oppdater siden om litt."
          );
        }
      }
    }

    checkPayment();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="container"
      style={{
        padding: "60px 20px",
        textAlign: "center",
      }}
    >
      <h1>{message}</h1>

      {tickets.length > 0 && (
        <>
          <p>
            <strong>{tickets.length}</strong>{" "}
            {tickets.length === 1
              ? "lodd er"
              : "lodd er"}{" "}
            opprettet.
          </p>

          <a
            className="btn primary"
            href="/"
          >
            Gå til skrapeloddene
          </a>
        </>
      )}
    </main>
  );
}