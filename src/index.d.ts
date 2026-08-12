export const GOOGLE_ADS_PLATFORM: 'google'
export const GOOGLE_ADS_DEFAULT_API_VERSION: string
export function googleAdsCustomerId(value: unknown): string
export type GoogleAdsCampaign = {
  id: string
  name: string
  status: string
  channelType: string
  impressions: number
  clicks: number
  costMicros: number
  conversions: number
  conversionValue: number
}
export function normalizeGoogleAdsCampaign(row?: Record<string, unknown>): GoogleAdsCampaign
export function createGoogleAdsClient(options: {
  developerToken: string
  accessToken: string
  loginCustomerId?: string
  apiVersion?: string
  fetch?: typeof fetch
}): {
  listAccessibleCustomers(): Promise<string[]>
  search(customerId: string, query: string): Promise<Array<Record<string, unknown>>>
  listCampaigns(customerId: string, options?: { dateFrom?: string; dateTo?: string }): Promise<GoogleAdsCampaign[]>
  reportMetrics(customerId: string, dateFrom: string, dateTo: string): Promise<Array<GoogleAdsCampaign & { date: string }>>
}
