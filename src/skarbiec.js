import { execFileSync } from 'node:child_process'

// A credential crosses into this CLI only as a Skarbiec reference
// (`ITEM#FIELD`); the value is read from the `skarbiec` executable and never
// appears in argv, the environment or output (cli.md rule 15).
// `SKARBIEC_BIN` names another executable; the default is `skarbiec` on PATH.
export function readCredential(reference, flag) {
  const text = String(reference ?? '')
  const separator = text.lastIndexOf('#')
  if (separator <= 0 || separator === text.length - 1) {
    throw Object.assign(new Error(`${flag} must be a Skarbiec reference ITEM#FIELD, not ${JSON.stringify(text)}`), { usage: true })
  }
  const item = text.slice(0, separator)
  const field = text.slice(separator + 1)
  const binary = process.env.SKARBIEC_BIN || 'skarbiec'
  let value
  try {
    value = execFileSync(binary, ['get', item, '--field', field], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const detail = String(error.stderr ?? '').trim() || error.message
    throw new Error(`${flag}: skarbiec get ${item} --field ${field} failed: ${detail}`)
  }
  const secret = value.replace(/\n$/, '')
  if (!secret) throw new Error(`${flag}: Skarbiec item ${item} field ${field} is empty`)
  return secret
}
