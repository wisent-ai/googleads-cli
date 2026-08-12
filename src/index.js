export const GOOGLE_ADS_PLATFORM = 'google'
export const GOOGLE_ADS_DEFAULT_API_VERSION = 'v24'

export function googleAdsCustomerId(value) {
  const id = String(value ?? '').replaceAll('-', '').trim()
  if (!/^\d{10}$/u.test(id)) throw new Error('Google Ads customer id must contain 10 digits')
  return id
}

function requireText(value, label) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${label} is required`)
  return text
}

function rowsFromStream(payload) {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((batch) => Array.isArray(batch?.results) ? batch.results : [])
}

export function normalizeGoogleAdsCampaign(row = {}) {
  const campaign = row.campaign && typeof row.campaign === 'object' ? row.campaign : {}
  const metrics = row.metrics && typeof row.metrics === 'object' ? row.metrics : {}
  return {
    id: String(campaign.id ?? ''),
    name: String(campaign.name ?? ''),
    status: String(campaign.status ?? '').toLowerCase(),
    channelType: String(campaign.advertisingChannelType ?? '').toLowerCase(),
    impressions: Number(metrics.impressions ?? 0),
    clicks: Number(metrics.clicks ?? 0),
    costMicros: Number(metrics.costMicros ?? 0),
    conversions: Number(metrics.conversions ?? 0),
    conversionValue: Number(metrics.conversionsValue ?? 0),
  }
}

export function createGoogleAdsClient(options = {}) {
  const developerToken = requireText(options.developerToken, 'developerToken')
  const accessToken = requireText(options.accessToken, 'accessToken')
  const apiVersion = String(options.apiVersion || GOOGLE_ADS_DEFAULT_API_VERSION)
  const fetchImpl = options.fetch || globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required')
  const origin = `https://googleads.googleapis.com/${apiVersion}`

  async function request(path, init = {}) {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${accessToken}`)
    headers.set('developer-token', developerToken)
    headers.set('content-type', 'application/json')
    if (options.loginCustomerId) headers.set('login-customer-id', googleAdsCustomerId(options.loginCustomerId))
    const response = await fetchImpl(`${origin}${path}`, { ...init, headers })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const message = body?.error?.message || `Google Ads API returned HTTP ${response.status}`
      throw new Error(message)
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
      return Array.isArray(body.resourceNames) ? body.resourceNames.map((name) => String(name).replace('customers/', '')) : []
    },
    search,
    async listCampaigns(customerId, options = {}) {
      const dateClause = options.dateFrom && options.dateTo
        ? ` AND segments.date BETWEEN '${options.dateFrom}' AND '${options.dateTo}'`
        : ''
      const rows = await search(customerId, `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE campaign.status != 'REMOVED'${dateClause} ORDER BY campaign.name`)
      return rows.map(normalizeGoogleAdsCampaign)
    },
    async reportMetrics(customerId, dateFrom, dateTo) {
      const from = requireText(dateFrom, 'dateFrom')
      const to = requireText(dateTo, 'dateTo')
      const rows = await search(customerId, `SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' ORDER BY segments.date, campaign.name`)
      return rows.map((row) => ({ date: String(row.segments?.date ?? ''), ...normalizeGoogleAdsCampaign(row) }))
    },
  }
}
