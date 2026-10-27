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
  /** Every campaign not removed with the budget that caps it. */
  listBudgets(customerId: string): Promise<GoogleAdsBudget[]>
  /** The search terms that showed an ad between the dates, costliest first; campaignId keeps one campaign's. */
  searchTerms(customerId: string, dateFrom: string, dateTo: string, campaignId?: string): Promise<GoogleAdsSearchTerm[]>
  /** The keywords bid on between the dates, costliest first; campaignId keeps one campaign's. */
  keywords(customerId: string, dateFrom: string, dateTo: string, campaignId?: string): Promise<GoogleAdsKeyword[]>
  /** The search terms that spent without converting, costliest first. */
  wasted(customerId: string, dateFrom: string, dateTo: string, campaignId?: string): Promise<GoogleAdsWaste>
  /** Each campaign's spend between the dates against its daily budget over those days, hottest first. */
  pacing(customerId: string, dateFrom: string, dateTo: string): Promise<GoogleAdsPace[]>
}
/** Terms that cost money and converted nothing; `unknown` names the terms whose cost or conversions were not stated. */
export type GoogleAdsWaste = { terms: GoogleAdsSearchTerm[]; costMicros: number; unknown: Array<string | null> }
export function wastedSpend(terms: GoogleAdsSearchTerm[]): GoogleAdsWaste
/** `pace` is spent over allowed; null without a daily budget or a stated cost. */
export type GoogleAdsPace = {
  campaignId: string | null
  campaignName: string | null
  days: number
  allowedMicros: number | null
  spentMicros: number | null
  pace: number | null
}
export function budgetPacing(budgets: GoogleAdsBudget[], campaigns: GoogleAdsCampaign[], from: string, to: string): GoogleAdsPace[]
/** A field or metric the API answer omits is null. */
export type GoogleAdsSearchTerm = {
  searchTerm: string | null
  /** added, excluded, added_excluded or none, as the API states it, lowercased. */
  status: string | null
  campaignId: string | null
  campaignName: string | null
  adGroupId: string | null
  adGroupName: string | null
  impressions: number | null
  clicks: number | null
  costMicros: number | null
  conversions: number | null
  conversionValue: number | null
}
/** A field the API answer omits is null. */
export type GoogleAdsBudget = {
  campaignId: string | null
  campaignName: string | null
  campaignStatus: string | null
  budgetId: string | null
  budgetName: string | null
  amountMicros: number | null
  totalAmountMicros: number | null
  /** standard or accelerated, lowercased. */
  deliveryMethod: string | null
  shared: boolean | null
}
/** A field or metric the API answer omits is null. */
export type GoogleAdsKeyword = {
  criterionId: string | null
  keyword: string | null
  /** exact, phrase or broad, lowercased. */
  matchType: string | null
  status: string | null
  qualityScore: number | null
  campaignId: string | null
  campaignName: string | null
  adGroupId: string | null
  adGroupName: string | null
  impressions: number | null
  clicks: number | null
  costMicros: number | null
  conversions: number | null
  conversionValue: number | null
}
