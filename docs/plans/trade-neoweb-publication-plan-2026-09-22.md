# Plan: offentlig utviklingsversjon på trade.neoweb.no

**Status:** Avventer oppstart. Denne planen ligger i `docs/plans/` og er ikke en aktiv implementeringsplan.
**Dato:** 22. september 2026
**Mål:** Gjøre den offentlige Vue-appen tilgjengelig på `trade.neoweb.no` via GitHub og Vercel, med en fungerende backtest og en ærlig fremstilling av hvilke analysefunksjoner som krever en egen tjeneste.

## Beslutning for første publisering

Første versjon skal være en offentlig utviklingsdemo. Backtest kjøres i besøkendes nettleser med den allerede distribuerte Rust/WASM-motoren. Markedsdata hentes fra Binance gjennom en begrenset serverfunksjon. `List of Trades` og `Performance Analysis` følger backtestresultatet. Optimalisering og Monte Carlo kan vise importerte rapporter, men knapper som starter nye jobber skal ikke gi inntrykk av å virke før en produksjonsklar jobbtjeneste er på plass.

Supabase og brukerkontoer er ikke nødvendig for denne versjonen. Nettleserlagring er tilstrekkelig for midlertidige innstillinger og rapporter, med tydelig forventning om at data kan forsvinne når brukeren rydder nettleseren eller bytter enhet.

## Dagens situasjon og grenser

- Det offentlige repoet `engan/rust-backtest` inneholder Vue-frontenden og ferdigkompilert WASM under `frontend/src/rust/pkg/`. PineScript og Rust-kildene ligger i et separat privat repo.
- WASM er et nedlastbart program. Kildekoden er ikke publisert direkte, men strategilogikken kan undersøkes eller delvis rekonstrueres fra binærfilen. En offentlig nettleserbacktest gir derfor ikke sterk beskyttelse av algoritmen.
- `frontend/vite.config.ts` sender lokale forespørsler til Binance og til Rust-serveren på `127.0.0.1:8787`. Disse Vite-proxyene finnes ikke i en statisk produksjonsbygg.
- `functions/binance-proxy/[[path]].ts` er en Cloudflare Pages Function og blir ikke automatisk en Vercel Function.
- `frontend/src/services/researchAPI.ts` bruker `/research-api` til å opprette og følge optimaliserings- og Monte Carlo-jobber. Den private Rust-serveren har minnebasert jobbstatus og skriver rapporter til lokale filer. Den kan ikke bare flyttes uendret til en kortlevd serverfunksjon.
- Vue-routeren bruker nettleserhistorikk. Direkte åpning eller oppfriskning av `/optimize`, `/monte-carlo` og `/performance` trenger en Vercel-rewrite til appens `index.html`.
- README beskriver nå at lisensvilkårene for frontend og WASM er uavklart. Det mangler fortsatt en faktisk lisensfil og en eierbeslutning før en ny offentlig distribusjonskanal tas i bruk.
- En foreløpig gjennomgang fant ingen innsporede `.env`-filer eller API-nøkler. Dette må kontrolleres på nytt mot nøyaktig den commit-en som skal publiseres.

## Fase 1 – lås innholdet som skal publiseres

- [ ] Bestem om alle nåværende frontendendringer skal med, og lag en gjennomgått commit fra den eksisterende uryddige arbeidskopien uten å ta med utilsiktede filer. Bruk eksplisitt staging.
- [ ] Kontroller Git-historikk, sporede filer og produksjonsbygget for hemmeligheter, persondata, interne endepunkter, utilsiktede rapporter og kildekode som ikke skal være offentlig.
- [ ] Beslutningspunkt: Er det akseptabelt at WASM-motoren kan lastes ned av alle? Hvis ikke, må backtesten flyttes til en privat server før offentlig lansering.
- [ ] Avklar og skriv konsistente rettigheter for frontend, eksempelfiler og den kompilerte WASM-motoren. Oppdater README og legg til faktisk lisensfil der det trengs.
- [ ] Oppdater README slik at arkitekturen, funksjonsstatusen og instruksjonene stemmer med den versjonen som publiseres.

**Port:** Det finnes en konkret publiseringscommit og en dokumentert oversikt over hva som vil bli offentlig. Ingen privat Pine- eller Rust-kildefil er med.

## Fase 2 – gjør første versjon produksjonsklar

- [ ] Opprett et Vercel-prosjekt koblet til det offentlige GitHub-repoet, med `frontend/` som prosjektets rotkatalog, buildkommando `pnpm run build` og outputkatalog `dist`. Verifiser de faktiske prosjektinnstillingene i Vercel før deploy.
- [ ] Implementer en Vercel-kompatibel Binance-proxy innenfor Vercel-prosjektets valgte rotkatalog (`frontend/api/` dersom `frontend/` er prosjektrot). Tillat bare de nødvendige offentlige Binance-endepunktene (`klines` og `exchangeInfo`), `GET`, forventede parametere og begrensede svar. Ikke videresend innkommende autentiseringsheadere eller vilkårlige stier.
- [ ] Behold samme `/binance-proxy`-kontrakt mellom lokal utvikling og produksjon, eller endre klienten og begge miljøene samlet. Test paginering, historisk sluttid, symbolfiltre og håndtering av Binance-feil/rate limits.
- [ ] Legg til Vercel-rewrite for Vue-rutene, uten å fange opp API- eller statiske asset-stier. Test direkte navigasjon og oppfriskning av alle sider.
- [ ] Gi Optimize og Monte Carlo en tydelig offentlig status når research-serveren ikke finnes. Behold rapportimport dersom den fungerer uten server. Lokal utvikling skal fortsatt kunne starte ekte jobber mot privat Rust-server.
- [ ] Kontroller at rapporteksport og analyse ikke krever Supabase eller en nettleserøkt fra `localhost`.

**Port:** Produksjonsbygget kan serveres lokalt i en Vercel-lignende forhåndsvisning; Backtest fungerer gjennom proxyen, alle ruter kan åpnes direkte, og utilgjengelige jobbknapper feiler ikke stille.

## Fase 3 – verifiser før domenet kobles på

- [ ] Kjør frontend typekontroll, produksjonsbygg, relevante enhetstester, `git diff --check` og paritetstestene for de to Rust-strategiene mot TradingView-fixturene.
- [ ] Verifiser en Vercel-forhåndsvisning i nettleser: hent Binance-data, kjør SMA og EMA/VWAP, åpne `List of Trades` og `Performance Analysis`, og test rapporteksport/-import.
- [ ] Test både et lite og et stort datasett, samt feiltilfeller som ukjent symbol, Binance-feil og avbrutt nettverk. Kontroller at tung WASM-kjøring og datahenting er forståelig for brukeren.
- [ ] Kontroller i nettverksfanen at WASM, JavaScript, CSS, API-responser og direkte rutebesøk leveres fra riktig Vercel-miljø. Gjør en siste kontroll av hva en anonym besøkende faktisk kan laste ned.
- [ ] Gå gjennom tekst som omtaler TradingView-paritet og resultater, slik at verifiserte oppsett skilles fra strategier og markedsperioder som ikke er sammenlignet.

**Port:** En anonym forhåndsvisning oppfører seg som planlagt, og testresultater, deploy-URL og kjente begrensninger er notert før produksjonsdomenet brukes.

## Fase 4 – publiser trade.neoweb.no

- [ ] Koble den verifiserte Git-commiten til Vercel Production. Kontroller at produksjonsbygget faktisk er det samme som ble testet i forhåndsvisning.
- [ ] Legg `trade.neoweb.no` til Vercel-prosjektet, og opprett DNS-posten Vercel oppgir hos den som administrerer `neoweb.no`.
- [ ] Verifiser DNS, HTTPS, `/`, `/performance`, `/optimize`, `/monte-carlo`, Binance-proxy og en komplett backtest på det faktiske domenet.
- [ ] Legg inn en kort README-lenke til den levende demoen og en tydelig beskrivelse av hvilke sider som kan beregne nye resultater.
- [ ] Behold en enkel tilbakestillingsvei: forrige fungerende Vercel-deploy og mulighet til å ta domenet tilbake til den hvis en kritisk feil oppstår.

**Port:** Domenet serverer den kontrollerte produksjonsbyggen, og en ny anonym nettleserøkt kan gjennomføre hele Backtest-flyten.

## Senere spor: full Optimize og Monte Carlo på nett

Dette er en egen implementeringsfase og skal ikke omtales som ferdig ved første publisering.

- [ ] Velg hvor den private Rust-jobbtjenesten skal kjøre. Vurder en vedvarende container/tjeneste for dagens lange jobber og statusoppdateringer, eller redesign jobbflyten for en passende kø og serverless kjøring.
- [ ] Legg inn autentisering/tilgangskontroll og grenser for jobbantall, kandidater, simuleringer, datamengde, samtidighet og lagring før offentlig jobboppretting åpnes.
- [ ] Løs varig jobbstatus og rapportlagring slik at resultater kan hentes etter restart og på tvers av instanser. Velg database eller objektlagring først når denne jobbflyten krever det; Supabase er ett mulig valg, ikke et krav for første versjon.
- [ ] Test hele kjeden fra Optimize-kandidat til Monte Carlo-rapport under realistisk last, inkludert avbrudd, omstart og feil fra datakilde.

## Beslutninger som tas når planen aktiveres

1. Skal første offentlige versjon ha fungerende Backtest for alle, eller bare en kuratert demo uten kjørbar motor? Dette avgjør WASM-eksponeringen.
2. Skal Optimize og Monte Carlo være synlige med import/eksempelrapport, eller skjules frem til jobbtjenesten er klar? Begge valg må kommuniseres ærlig i grensesnittet.
3. Hvilke rettigheter ønsker eieren å gi til frontendkoden og den kompilerte motoren? README og lisens må samsvare.

Ingen av sjekkboksene over er krysset av. Arbeidet aktiveres først når publiseringsomfanget og WASM-beslutningen er tatt.
