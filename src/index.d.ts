export const GOOGLE_ADS_PLATFORM: 'google'
export const GOOGLE_ADS_DEFAULT_API_VERSION: string
export function googleAdsCustomerId(value: unknown): string
/** A field or metric the API answer omits is null. */
export type GoogleAdsCampaign = {
  id: string | null
  name: string | null
  status: string | null
  channelType: string | null
  impressions: number | null
  clicks: number | null
  costMicros: number | null
  conversions: number | null
  conversionValue: number | null
}
export function normalizeGoogleAdsCampaign(row: Record<string, unknown>): GoogleAdsCampaign
export function createGoogleAdsClient(options: {
  developerToken: string
  accessToken: string
  loginCustomerId?: string
  apiVersion?: string
  fetch?: typeof fetch
}): {
  listAccessibleCustomers(): Promise<string[]>
  search(customerId: string, query: string): Promise<Array<Record<string, unknown>>>
  /** dateFrom and dateTo are given together or not at all. */
  listCampaigns(customerId: string, range: { dateFrom?: string; dateTo?: string }): Promise<GoogleAdsCampaign[]>
  reportMetrics(customerId: string, dateFrom: string, dateTo: string): Promise<Array<GoogleAdsCampaign & { date: string | null }>>
}
