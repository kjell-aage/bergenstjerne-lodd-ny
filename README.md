# Bergenstjerne Lodd – komplett MVP

Inneholder:

- Next.js-prosjekt
- Supabase database og bildeopplasting
- Admin for premier
- Premiebildet brukes på skrapeloddet
- Vipps ePayment testflyt
- Capture før lodd opprettes

## Oppsett

1. Kjør `supabase/schema.sql` i Supabase SQL Editor.
2. Legg miljøvariablene fra `.env.example` i Vercel.
3. Sett et sterkt `ADMIN_PASSWORD` i Vercel.
4. Sett `NEXT_PUBLIC_SITE_URL` til riktig Vercel-adresse eller `https://lodd.bergensi.no`.
5. Last hele prosjektet opp i GitHub-roten.
6. Redeploy i Vercel.
7. Legg inn premier i `/admin`.
8. Test Vipps i testmiljø.

## Viktige begrensninger

- Admin bruker ett passord. Det bør senere erstattes med Supabase Auth.
- Webhook er ikke inkludert i denne MVP-en; retursiden poller status.
- Refusjon, rapporter og automatisk utsending er ikke ferdig.
- Test grundig før produksjon.


## Versjon 2.0
- 9 skrapefelt i 3 × 3.
- Tre like premiebilder gir gevinst.
- Dynamiske premier uten fast 1., 2. eller 3. plass.
- Beskrivelse, verdi og trøstepremie i admin.
- Grasrotpakken: 5 lodd for 60 kr.
- Garantert trøstepremie i første Grasrot-lodd når aktiv trøstepremie finnes.
- Kun navn og telefonnummer.
- Vipps-knapp i Vipps-oransje.
- Bytt GRASROT_URL når direkte Norsk Tipping-lenke er klar.

## Vinneroppfølging
- Vinner velger henting eller postsending.
- Ved henting vises telefon 913 38 157.
- Ved postsending lagres adressen på vinnerloddet.
- Varsel sendes til post@bergensi.no når RESEND_API_KEY og RESEND_FROM_EMAIL er konfigurert.


## Oppdatering – skraping
- Manuell skraping avsluttes først når alle ni symbolområdene er tydelig skrapt frem.
- Knappen «Skrap alt» avslører kun loddet som vises.
- Ingen automatisk avsløring basert på samlet prosent av hele loddet.
- Synlig tekst om garantert trøstepremie er fjernet.
- Ved henting vises kun post@bergensi.no som kontaktinformasjon.
