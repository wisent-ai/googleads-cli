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
  }
}
