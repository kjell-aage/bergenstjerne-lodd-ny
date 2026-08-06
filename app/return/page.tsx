"use client";

import { useEffect, useState } from "react";

export default function ReturnPage() {
  const [message,setMessage]=useState("Kontrollerer betalingen...");
  const [tickets,setTickets]=useState<any[]>([]);

  useEffect(()=>{
    const reference=new URLSearchParams(window.location.search).get("reference");
    if(!reference){setMessage("Mangler betalingsreferanse.");return}
    let tries=0;
    const run=async()=>{
      tries++;
      const r=await fetch(`/api/vipps/status/${reference}`);
      const d=await r.json();
      if(d.status==="CAPTURED"){
        sessionStorage.setItem("bst_tickets",JSON.stringify(d.tickets));
        setTickets(d.tickets);
        setMessage("Betalingen er godkjent. Loddene er klare.");
        return;
      }
      if(["ABORTED","EXPIRED","TERMINATED"].includes(d.status)){setMessage("Betalingen ble ikke fullført.");return}
      if(tries<20)setTimeout(run,2000);else setMessage("Betalingen behandles fortsatt. Oppdater siden om litt.");
    };
    run();
  },[]);

  return <main className="container" style={{padding:"60px 0",textAlign:"center"}}>
    <h1>{message}</h1>
    {tickets.length>0 && <><p>{tickets.length} lodd er opprettet.</p><a className="btn primary" href="/">Gå til skrapeloddene</a></>}
  </main>;
}
