import { execFileSync } from 'node:child_process'
import { constants, readFileSync, statSync } from 'node:fs'

// A credential crosses into this CLI only as a reference ROLE#FIELD: the
// FIELD of the secret that plays ROLE, so a renamed or rotated item does not
// change any invocation. Stado reads it (`stado credentials get --role ROLE
// --field FIELD`); with --credentials-file the value comes from that file
// instead. The value never appears in argv, the environment or output
// (cli.md rule 15). Every reference of an invocation is parsed before any is
// read, so a malformed one is misuse whatever the order of the flags.
export function credentialReference(reference, flag) {
  const [role, field, ...rest] = reference.split('#')
  if (!role || !field || rest.length) {
    throw Object.assign(new Error(`${flag} must be a credential reference ROLE#FIELD, not ${JSON.stringify(reference)}`), { usage: true })
  }
  return { role, field, flag }
}

export function readCredential({ role, field, flag }, credentialsFile) {
  if (credentialsFile) return fromFile(credentialsFile, role, field, flag)
  return fromStado(role, field, flag)
}

function fromStado(role, field, flag) {
  const command = ['credentials', 'get', '--role', role, '--field', field]
  let printed
  try {
    printed = execFileSync('stado', command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    // execFileSync's message carries the command and everything it wrote to stderr.
    throw new Error(`${flag}: stado ${command.join(' ')} failed: ${error.message}`)
  }
  return printed.replace(/\n$/, '')
}

// The file without Stado: a JSON object { "ROLE": { "FIELD": "value" } },
// owned by the user running the CLI and closed to group and others, the way
// ssh treats a private key.
function fromFile(path, role, field, flag) {
  const status = statSync(path)
  if (status.uid !== process.getuid()) {
    throw new Error(`--credentials-file ${path} is owned by uid ${status.uid}, not by you (uid ${process.getuid()})`)
  }
  if (status.mode & (constants.S_IRWXG | constants.S_IRWXO)) {
    throw new Error(`--credentials-file ${path} is open to group or others; close it to them (chmod go= ${path})`)
  }
  const text = readFileSync(path, 'utf8')
  let document
  try {
    document = JSON.parse(text)
  } catch (error) {
    throw new Error(`--credentials-file ${path} is not JSON: ${error.message}`)
  }
  if (!isObject(document)) throw new Error(`--credentials-file ${path} must hold a JSON object of roles, { "ROLE": { "FIELD": "value" } }`)
  if (!Object.hasOwn(document, role)) throw new Error(`${flag}: --credentials-file ${path} has no role ${role}`)
  const fields = document[role]
  if (!isObject(fields) || !Object.hasOwn(fields, field)) throw new Error(`${flag}: --credentials-file ${path} role ${role} has no field ${field}`)
  const value = fields[field]
  if (typeof value !== 'string' || !value) throw new Error(`${flag}: --credentials-file ${path} role ${role} field ${field} is not a non-empty string`)
  return value
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
