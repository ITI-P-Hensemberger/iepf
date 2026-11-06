// The avatar's gradient, derived from the email: the same person always gets the same colors,
// and the hue spans the whole color wheel so that almost everyone gets different ones.
function hash(value: string) {
  let result = 2166136261
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

export function avatarGradient(email: string | null | undefined) {
  if (!email) return 'linear-gradient(135deg, #0f172a, #64748b)'
  const seed = hash(email.trim().toLowerCase())
  const hue = seed % 360
  // A second hue nearby, on either side, so gradients differ in direction too.
  const shift = 30 + ((seed >>> 9) % 40)
  const second = (hue + (seed & 1 ? shift : 360 - shift)) % 360
  return `linear-gradient(135deg, hsl(${hue} 70% 38%), hsl(${second} 75% 55%))`
}
