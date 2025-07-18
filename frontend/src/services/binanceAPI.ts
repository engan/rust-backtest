// Definerer strukturen for et behandlet candlestick-objekt
export interface Kline {
  timestamp: number // Starttidspunkt for intervallet (millisekunder)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// NYTT: Definerer en type for returverdien fra filter-funksjonen
export interface SymbolFilters {
  tickSize: number;
  stepSize: number;
}

// Definerer (delvis) strukturen på rådata fra Binance API
// [Open time, Open, High, Low, Close, Volume, Close time, Quote asset volume, Number of trades, Taker buy base asset volume, Taker buy quote asset volume, Ignore]
type BinanceRawKline = [
  number, // Open time
  string, // Open
  string, // High
  string, // Low
  string, // Close
  string, // Volume
  number, // Close time
  string, // Quote asset volume
  number, // Number of trades
  string, // Taker buy base asset volume
  string, // Taker buy quote asset volume
  string, // Ignore.
]

// Base-URL for Binance Spot API v3
// const BINANCE_API_BASE_URL = 'https://api.binance.com/api/v3'
const PROXY_API_BASE_URL = '/binance-proxy' // Pek på proxy-stien definert i vite.config.ts
const MAX_KLINE_LIMIT_PER_REQUEST = 1000 // Binances grense per kall
const REQUEST_DELAY_MS = 300 // Pause mellom kall for å unngå rate limit (juster ved behov)

// --- Hjelpefunksjon for delay ---
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Intern hjelpefunksjon for å formatere rådata ---
function formatKline(k: BinanceRawKline): Kline {
  return {
    timestamp: k[0], // Open time
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }
}

// --- Intern hjelpefunksjon for å hente ÉN chunk ---
async function _fetchSingleChunkOfKlines(
  symbol: string,
  rawInterval: string,
  limit: number, // <= MAX_KLINE_LIMIT_PER_REQUEST
  endTime?: number, // Henter data FØR dette tidspunktet
): Promise<Kline[]> {
  // --- Formater intervall ---
  let interval = rawInterval.trim() // Fjern evt. mellomrom
  if (interval.endsWith('min')) {
    // Erstatt 'min' med 'm' KUN hvis det er på slutten
    interval = interval.slice(0, -3) + 'm'
  }
  // '1M' for måned vil ikke bli endret av dette.
  // Håndterer ikke andre mulige skrivefeil (f.eks. "MIN", "mins", "minute").
  console.debug(`Using formatted interval: ${interval}`) // Logg det formaterte intervallet
  // --- Slutt formatering ---

  const params = new URLSearchParams({
    symbol: symbol.toUpperCase(),
    interval: interval,
    limit: Math.min(limit, MAX_KLINE_LIMIT_PER_REQUEST).toString(), // Sikrer maks 1000
  })

  if (endTime) {
    // Be om data som slutter rett før forrige chunks starttid
    params.append('endTime', (endTime - 1).toString())
  }

  // const url = `${BINANCE_API_BASE_URL}/klines?${params.toString()}`;
  const url = `${PROXY_API_BASE_URL}/klines?${params.toString()}` // Bruk proxy-base
  console.debug(`Fetching chunk: ${url}`) // Endret til debug for mindre støy

  const response = await fetch(url)

  if (!response.ok) {
    // Enkel rate limit håndtering (kan gjøres mer robust)
    if (response.status === 429 || response.status === 418) {
      console.warn(`Rate limit hit (Status ${response.status}), waiting 5 seconds...`)
      await delay(5000)
      // Kast en spesiell feil slik at ytre løkke kan prøve igjen
      throw new Error('RATE_LIMIT_RETRY')
    }
    let errorBody = null
    try {
      errorBody = await response.json()
    } catch (e) {
      /* ignore */
    }
    throw new Error(
      `Binance API error: ${response.status} ${response.statusText}. ${errorBody ? `Msg: ${errorBody.msg}` : ''}`,
    )
  }

  const rawData: BinanceRawKline[] = await response.json()
  return rawData.map(formatKline)
}

/**
 * Henter historiske Klines (candlesticks) fra Binance API, og håndterer
 * henting av mer enn 1000 barer ved å gjøre flere kall.
 *
 * @param symbol Handelsparet (f.eks. 'SOLUSDT').
 * @param interval Tidsrammen (f.eks. '1m', '5m', '1h', '1d').
 * @param totalLimit Totalt antall klines ønsket (kan være > 1000).
 * @returns Et Promise som resolver til en array av Kline-objekter, sortert eldst først.
 * @throws Kaster en Error hvis API-kallet feiler eller data ikke kan parses.
 */
export async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  totalLimit: number = 1000, // Representerer nå totalt ønsket antall
): Promise<Kline[]> {
  let allKlines: Kline[] = []
  let currentEndTime: number | undefined = undefined // Start med å hente de nyeste
  let fetchedCount = 0
  const maxIterations = Math.ceil(totalLimit / MAX_KLINE_LIMIT_PER_REQUEST) + 5 // Sikkerhetsgrense
  let iterations = 0

  // console.log(`Starting fetch for ${totalLimit} total klines for ${symbol} ${interval}...`)

  while (fetchedCount < totalLimit && iterations < maxIterations) {
    iterations++
    const limitForThisRequest = Math.min(MAX_KLINE_LIMIT_PER_REQUEST, totalLimit - fetchedCount)

    if (limitForThisRequest <= 0) break // Burde ikke skje, men som sikkerhet

    try {
      const chunk = await _fetchSingleChunkOfKlines(
        symbol,
        interval,
        limitForThisRequest,
        currentEndTime,
      )

      if (chunk.length === 0) {
        console.log('No more data returned from Binance API.')
        break // Ingen mer data tilgjengelig bakover i tid
      }

      // Legg til chunk i starten av den totale listen
      allKlines = [...chunk, ...allKlines]
      fetchedCount = allKlines.length // Oppdater basert på faktisk lengde

      // Sett neste endTime til start-tiden for den eldste baren i denne chunken
      currentEndTime = chunk[0].timestamp

      // console.log(`Fetched chunk ${iterations}, total klines so far: ${fetchedCount}`)

      // Pause FØR neste request (hvis det trengs en til)
      if (fetchedCount < totalLimit) {
        await delay(REQUEST_DELAY_MS)
      }
    } catch (error: any) {
      if (error.message === 'RATE_LIMIT_RETRY') {
        console.log('Retrying last chunk due to rate limit...')
        iterations-- // Sørg for at vi ikke teller retry som en vanlig iterasjon mot maxIterations
        continue // Prøv samme iterasjon på nytt
      } else if (error instanceof Error && error.message.includes('Binance API error: 400')) {
        // Logg URL som feilet
        console.warn(
          `Received HTTP 400 Bad Request (likely invalid timestamp/range for older data). Stopping fetch. Error: ${error.message}`,
        )
        // Logg URLen som ble forsøkt
        const failedParams = new URLSearchParams({
          /* ... bygg params på nytt som i _fetch ... */
        })
        if (currentEndTime) failedParams.append('endTime', (currentEndTime - 1).toString())
        // console.warn(`Failed URL attempt: ${BINANCE_API_BASE_URL}/klines?${failedParams.toString()}`);
        console.warn(`Failed URL attempt: ${PROXY_API_BASE_URL}/klines?${failedParams.toString()}`)
        break // Avslutt løkken pent, vi har sannsynligvis hentet alt gyldig data
      } else {
        // Andre ukjente feil
        console.error('Failed to fetch Binance klines chunk with unexpected error:', error)
        // Kast feilen videre for å stoppe prosessen og informere bruker
        throw error
      }
    }
  }

  if (iterations >= maxIterations) {
    console.warn(`Reached max iterations (${maxIterations}) while fetching klines.`)
  }

  console.log(`Finished fetching. Total klines retrieved: ${allKlines.length}`)
  return allKlines
}

/**
 * NYTT NAVN OG RETURTYPE: Henter både tickSize og stepSize for et symbol.
 * @param symbol Handelsparet (f.eks. 'SOLUSDT').
 * @returns Et objekt med `tickSize` og `stepSize`.
 * @throws Kaster en Error hvis symbolet eller filtrene ikke finnes.
 */
export async function fetchSymbolFilters(symbol: string): Promise<SymbolFilters> {
  const url = `${PROXY_API_BASE_URL}/exchangeInfo`;
  console.log(`Fetching exchange info from: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange info: ${response.statusText}`);
    }
    const data = await response.json();

    const upperCaseSymbol = symbol.toUpperCase();
    const symbolInfo = data.symbols.find((s: any) => s.symbol === upperCaseSymbol);

    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found in exchange info.`);
    }

    // --- Hent PRICE_FILTER (tickSize) ---
    const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
    if (!priceFilter || !priceFilter.tickSize) {
      throw new Error(`tickSize (PRICE_FILTER) not found for symbol ${symbol}.`);
    }
    const tickSize = parseFloat(priceFilter.tickSize);

    // --- NYTT: Hent LOT_SIZE (stepSize) ---
    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    if (!lotSizeFilter || !lotSizeFilter.stepSize) {
      throw new Error(`stepSize (LOT_SIZE) not found for symbol ${symbol}.`);
    }
    const stepSize = parseFloat(lotSizeFilter.stepSize);

    console.log(`Found filters for ${symbol}: tickSize=${tickSize}, stepSize=${stepSize}`);
    return { tickSize, stepSize };

  } catch (error) {
    console.error("Error fetching or parsing exchange info:", error);
    console.warn("Could not fetch symbol filters dynamically. Falling back to defaults.");
    // Returner fornuftige standardverdier ved feil
    return { tickSize: 0.01, stepSize: 0.01 }; 
  }
}

// --- Viktige Merknader ---
// 1. Rate Limits: Binance har strenge rate limits. Ved henting av store mengder
//    data (f.eks. all historikk) må du lage logikk for å hente i chunks (maks 1000
//    om gangen) med pauser mellom kallene. Start gjerne med å hente de siste
//    1000 punktene ved å kun spesifisere 'limit=1000'.
// 2. Feilhåndtering: Forbedre gjerne feilhåndteringen ytterligere.
// 3. CORS: Direkte kall fra frontend *kan* i noen tilfeller gi CORS-feil,
//    spesielt i produksjon. Under lokal utvikling med Vite (`localhost`) fungerer
//    det ofte greit. Hvis du får CORS-feil, må du vurdere en enkel backend-proxy.
// 4. Full Historikk: For å hente *all* historikk må du iterativt kalle API-et
//    bakover i tid. Start med å hente de siste 1000, bruk `startTime` fra den
//    *tidligste* mottatte kline som `endTime` for neste kall, og fortsett til
//    du har hentet nok data eller API-et ikke returnerer mer.
