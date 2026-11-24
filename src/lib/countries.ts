/** ISO 3166-1 alpha-2 codes offered at sign-up (names come from Intl.DisplayNames with fallback). */
export const COUNTRIES = [
  "US", "GB", "CA", "AU", "NZ", "IE", "DE", "FR", "NL", "BE", "AT", "CH", "SE", "NO", "DK", "FI", "ES", "PT", "IT", "PL",
  "CZ", "RO", "GR", "AR", "BR", "MX", "CL", "CO", "PE", "UY", "AE", "SA", "QA", "KW", "BH", "OM", "JO", "LB", "EG", "MA",
  "TN", "DZ", "IQ", "SY", "TR", "IN", "PK", "PH", "ID", "MY", "SG", "TH", "VN", "JP", "KR", "ZA", "NG", "KE",
] as const;

export const COUNTRY_FALLBACK: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia", NZ: "New Zealand", IE: "Ireland",
  DE: "Germany", FR: "France", NL: "Netherlands", BE: "Belgium", AT: "Austria", CH: "Switzerland", SE: "Sweden",
  NO: "Norway", DK: "Denmark", FI: "Finland", ES: "Spain", PT: "Portugal", IT: "Italy", PL: "Poland",
  CZ: "Czechia", RO: "Romania", GR: "Greece", AR: "Argentina", BR: "Brazil", MX: "Mexico", CL: "Chile",
  CO: "Colombia", PE: "Peru", UY: "Uruguay", AE: "United Arab Emirates", SA: "Saudi Arabia", QA: "Qatar",
  KW: "Kuwait", BH: "Bahrain", OM: "Oman", JO: "Jordan", LB: "Lebanon", EG: "Egypt", MA: "Morocco",
  TN: "Tunisia", DZ: "Algeria", IQ: "Iraq", SY: "Syria", TR: "Turkey", IN: "India", PK: "Pakistan",
  PH: "Philippines", ID: "Indonesia", MY: "Malaysia", SG: "Singapore", TH: "Thailand", VN: "Vietnam",
  JP: "Japan", KR: "South Korea", ZA: "South Africa", NG: "Nigeria", KE: "Kenya",
};

export function countryName(code: string, tag: string): string {
  try {
    const label = new Intl.DisplayNames([tag], { type: "region" }).of(code);
    if (label && label !== code) return label;
  } catch {
    /* fallback below */
  }
  return COUNTRY_FALLBACK[code] ?? code;
}
