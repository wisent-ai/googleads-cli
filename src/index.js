export const GOOGLE_ADS_PLATFORM = 'google'
export const GOOGLE_ADS_DEFAULT_API_VERSION = 'v24'

export function googleAdsCustomerId(value) {
  if (value === undefined || value === null) throw new Error('Google Ads customer id is required')
  const id = String(value).replaceAll('-', '').trim()
  // A Google Ads customer id is ten digits, written with or without dashes:
  // https://support.google.com/google-ads/answer/1704344
  if (!/^\d{10}$/u.test(id)) throw new Error(`Google Ads customer id must be ten digits, got ${JSON.stringify(value)}`)
  return id
}

function requireText(value, label) {
  if (value === undefined || value === null) throw new Error(`${label} is required`)
  const text = String(value).trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}

// A field or metric the API answer omits is reported as null, never as a
// value it did not state.
function field(value) {
  if (value === undefined || value === null) return null
  return String(value)
}

function lowered(value) {
  const text = field(value)
  if (text === null) return null
  return text.toLowerCase()
}

function metric(value) {
  if (value === undefined || value === null) return null
  return Number(value)
}

// searchStream answers a JSON array of batches, each with its results.
function rowsFromStream(payload) {
  if (!Array.isArray(payload)) {
    throw new Error(`Google Ads searchStream answered something other than a list of batches: ${JSON.stringify(payload)}`)
  }
  return payload.flatMap((batch) => {
    if (batch === null || typeof batch !== 'object' || Array.isArray(batch)) {
      throw new Error(`Google Ads searchStream answered a batch that is not an object: ${JSON.stringify(batch)}`)
    }
    if (batch.results === undefined) return []
    if (!Array.isArray(batch.results)) {
      throw new Error(`Google Ads searchStream answered results that are not a list: ${JSON.stringify(batch)}`)
    }
    return batch.results
  })
}

export function normalizeGoogleAdsCampaign(row) {
  const campaign = row.campaign
  const metrics = row.metrics
  return {
    id: field(campaign?.id),
    name: field(campaign?.name),
    status: lowered(campaign?.status),
    channelType: lowered(campaign?.advertisingChannelType),
    impressions: metric(metrics?.impressions),
    clicks: metric(metrics?.clicks),
    costMicros: metric(metrics?.costMicros),
    conversions: metric(metrics?.conversions),
    conversionValue: metric(metrics?.conversionsValue),
  }
}

// The GAQL condition keeping one campaign's rows, or none without a campaign
// id; an id that is not numeric is refused before any request.
function campaignClause(campaignId) {
  if (campaignId === undefined) return ''
  const campaign = requireText(campaignId, 'campaignId')
  if (!/^\d+$/u.test(campaign)) throw new Error(`campaignId must be the campaign's numeric id, got ${JSON.stringify(campaignId)}`)
  return ` AND campaign.id = ${campaign}`
}

export function createGoogleAdsClient(options) {
  const developerToken = requireText(options.developerToken, 'developerToken')
  const accessToken = requireText(options.accessToken, 'accessToken')
  const apiVersion = requireText(options.apiVersion ?? GOOGLE_ADS_DEFAULT_API_VERSION, 'apiVersion')
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required')
  const origin = `https://googleads.googleapis.com/${apiVersion}`
  const headers = new Headers()
  headers.set('authorization', `Bearer ${accessToken}`)
  headers.set('developer-token', developerToken)
  headers.set('content-type', 'application/json')
  if (options.loginCustomerId !== undefined) headers.set('login-customer-id', googleAdsCustomerId(options.loginCustomerId))

  // Every answer is read strictly: a body that is not JSON is refused with
  // its status, the parse cause and the text, and a refusal without a JSON
  // error message carries its body.
  async function request(path, init) {
    const response = await fetchImpl(`${origin}${path}`, { ...init, headers })
    const text = await response.text()
    let body
    try {
      body = JSON.parse(text)
    } catch (error) {
      throw new Error(`Google Ads API returned HTTP ${response.status} with a body that is not JSON (${error.message}): ${text}`)
    }
    if (!response.ok) {
      const stated = body?.error?.message
      throw new Error(typeof stated === 'string' ? stated : `Google Ads API returned HTTP ${response.status}: ${text}`)
    }
    return body
  }

  async function search(customerId, query) {
    const id = googleAdsCustomerId(customerId)
    const body = await request(`/customers/${id}/googleAds:searchStream`, {
      method: 'POST',
      body: JSON.stringify({ query: requireText(query, 'query') }),
    })
    return rowsFromStream(body)
  }

  return {
    async listAccessibleCustomers() {
      const body = await request('/customers:listAccessibleCustomers', { method: 'GET' })
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error(`Google Ads listAccessibleCustomers answered something other than an object: ${JSON.stringify(body)}`)
      }
      // An account with access to no customer is answered without resourceNames.
      if (body.resourceNames === undefined) return []
      if (!Array.isArray(body.resourceNames)) {
        throw new Error(`Google Ads listAccessibleCustomers answered resourceNames that are not a list: ${JSON.stringify(body)}`)
      }
      return body.resourceNames.map((name) => String(name).replace('customers/', ''))
    },
    search,
    async listCampaigns(customerId, range) {
      const { dateFrom, dateTo } = range
      if ((dateFrom === undefined) !== (dateTo === undefined)) {
        throw new Error('listCampaigns takes dateFrom and dateTo together, or neither')
      }
      let dateClause = ''
      if (dateFrom !== undefined) {
        dateClause = ` AND segments.date BETWEEN '${requireText(dateFrom, 'dateFrom')}' AND '${requireText(dateTo, 'dateTo')}'`
      }
      const rows = await search(customerId, `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status != 'REMOVED'${dateClause} ORDER BY campaign.name`)
      return rows.map(normalizeGoogleAdsCampaign)
    },
    async reportMetrics(customerId, dateFrom, dateTo) {
      const from = requireText(dateFrom, 'dateFrom')
      const to = requireText(dateTo, 'dateTo')
      const rows = await search(customerId, `SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' ORDER BY segments.date, campaign.name`)
      return rows.map((row) => ({ date: field(row.segments?.date), ...normalizeGoogleAdsCampaign(row) }))
    },
    // Every campaign that is not removed with the budget that caps it: the
    // daily amount (or the total of a campaign total budget), how it is spent
    // through the day, and whether campaigns share it, so the spend `metrics`
    // reports can be read against what was allowed.
    async listBudgets(customerId) {
      const rows = await search(customerId, `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.delivery_method, campaign_budget.explicitly_shared FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name`)
      return rows.map((row) => ({
        campaignId: field(row.campaign?.id),
        campaignName: field(row.campaign?.name),
        campaignStatus: lowered(row.campaign?.status),
        budgetId: field(row.campaignBudget?.id),
        budgetName: field(row.campaignBudget?.name),
        amountMicros: metric(row.campaignBudget?.amountMicros),
        totalAmountMicros: metric(row.campaignBudget?.totalAmountMicros),
        deliveryMethod: lowered(row.campaignBudget?.deliveryMethod),
        shared: row.campaignBudget?.explicitlyShared === undefined ? null : Boolean(row.campaignBudget.explicitlyShared),
      }))
    },
    // What people typed that showed an ad, over a date range, the costliest
    // first: the term, whether it was added or excluded as a keyword, the
    // campaign and ad group it ran under, and its metrics. With a campaign id,
    // only that campaign's terms.
    async searchTerms(customerId, dateFrom, dateTo, campaignId) {
      const from = requireText(dateFrom, 'dateFrom')
      const to = requireText(dateTo, 'dateTo')
      const rows = await search(customerId, `SELECT search_term_view.search_term, search_term_view.status, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM search_term_view WHERE segments.date BETWEEN '${from}' AND '${to}'${campaignClause(campaignId)} ORDER BY metrics.cost_micros DESC`)
      return rows.map((row) => ({
        searchTerm: field(row.searchTermView?.searchTerm),
        status: lowered(row.searchTermView?.status),
        campaignId: field(row.campaign?.id),
        campaignName: field(row.campaign?.name),
        adGroupId: field(row.adGroup?.id),
        adGroupName: field(row.adGroup?.name),
        impressions: metric(row.metrics?.impressions),
        clicks: metric(row.metrics?.clicks),
        costMicros: metric(row.metrics?.costMicros),
        conversions: metric(row.metrics?.conversions),
        conversionValue: metric(row.metrics?.conversionsValue),
      }))
    },
    // The keywords bid on over a date range, the costliest first: the text,
    // match type, status and quality score, the campaign and ad group, and
    // the metrics, so a keyword spending without converting is seen beside
    // the search terms it matched. With a campaign id, only that campaign's.
    async keywords(customerId, dateFrom, dateTo, campaignId) {
      const from = requireText(dateFrom, 'dateFrom')
      const to = requireText(dateTo, 'dateTo')
      const rows = await search(customerId, `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM keyword_view WHERE segments.date BETWEEN '${from}' AND '${to}'${campaignClause(campaignId)} ORDER BY metrics.cost_micros DESC`)
      return rows.map((row) => ({
        criterionId: field(row.adGroupCriterion?.criterionId),
        keyword: field(row.adGroupCriterion?.keyword?.text),
        matchType: lowered(row.adGroupCriterion?.keyword?.matchType),
        status: lowered(row.adGroupCriterion?.status),
        qualityScore: metric(row.adGroupCriterion?.qualityInfo?.qualityScore),
        campaignId: field(row.campaign?.id),
        campaignName: field(row.campaign?.name),
        adGroupId: field(row.adGroup?.id),
        adGroupName: field(row.adGroup?.name),
        impressions: metric(row.metrics?.impressions),
        clicks: metric(row.metrics?.clicks),
        costMicros: metric(row.metrics?.costMicros),
        conversions: metric(row.metrics?.conversions),
        conversionValue: metric(row.metrics?.conversionsValue),
      }))
    },
    // The search terms that spent without converting over a date range: the
    // first place to look for negative keywords. See wastedSpend.
    async wasted(customerId, dateFrom, dateTo, campaignId) {
      return wastedSpend(await this.searchTerms(customerId, dateFrom, dateTo, campaignId))
    },
    // Each campaign's spend over a date range against its daily budget. See budgetPacing.
    async pacing(customerId, dateFrom, dateTo) {
      const [budgets, campaigns] = await Promise.all([
        this.listBudgets(customerId),
        this.listCampaigns(customerId, { dateFrom, dateTo }),
      ])
      return budgetPacing(budgets, campaigns, dateFrom, dateTo)
    },
  }
}

/**
 * The search terms of `terms` that cost money and converted nothing, the
 * costliest first, with what they cost together. A term whose cost or
 * conversions the answer omits is not counted as wasted: it is listed under
 * `unknown`, since spend nobody stated is not spend known to be wasted. A term
 * already excluded as a negative keyword is left out, it can waste no more.
 */
export function wastedSpend(terms) {
  const unknown = terms.filter((term) => term.costMicros === null || term.conversions === null)
  const wasted = terms
    .filter((term) => term.costMicros !== null && term.conversions !== null)
    // Spent something (a cost that is not nothing) and converted nothing.
    .filter((term) => Boolean(term.costMicros) && !term.conversions && term.status !== 'excluded')
    .sort((left, right) => right.costMicros - left.costMicros)
  const none = terms.length - terms.length
  return {
    terms: wasted,
    costMicros: wasted.reduce((sum, term) => sum + term.costMicros, none),
    unknown: unknown.map((term) => term.searchTerm),
  }
}

/** The whole days from `from` through `to`, both YYYY-MM-DD, counting both. */
function daysIn(from, to) {
  const start = Date.parse(`${requireText(from, 'dateFrom')}T00:00:00Z`)
  const end = Date.parse(`${requireText(to, 'dateTo')}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error(`pacing needs two dates, the first not after the second, got ${JSON.stringify(from)} and ${JSON.stringify(to)}`)
  }
  const day = Date.parse('1970-01-02T00:00:00Z') - Date.parse('1970-01-01T00:00:00Z')
  return (end - start) / day + day / day
}

/**
 * How each campaign's spend over `from`..`to` stands against its daily
 * budget over the same days: `allowedMicros` (the daily amount times the
 * days), `spentMicros`, and `pace`, spent over allowed (above 1 runs hot,
 * below runs cold), the hottest first. A campaign on a total budget, or
 * whose budget or cost the answer omits, has `pace` null: there is no daily
 * allowance to hold it to.
 */
export function budgetPacing(budgets, campaigns, from, to) {
  const days = daysIn(from, to)
  const spent = new Map(campaigns.map((campaign) => [campaign.id, campaign.costMicros]))
  return budgets
    .map((budget) => {
      const spentMicros = spent.has(budget.campaignId) ? spent.get(budget.campaignId) : null
      const allowedMicros = budget.amountMicros === null ? null : budget.amountMicros * days
      const pace = spentMicros === null || !allowedMicros ? null : spentMicros / allowedMicros
      return { campaignId: budget.campaignId, campaignName: budget.campaignName, days, allowedMicros, spentMicros, pace }
    })
    .sort((left, right) => (right.pace === null ? -Infinity : right.pace) - (left.pace === null ? -Infinity : left.pace))
}
