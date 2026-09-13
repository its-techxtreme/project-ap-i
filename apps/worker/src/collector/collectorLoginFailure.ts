/** Hard IG login/2FA/CAPTCHA only. Do not match playwright-profiles or search shortfalls. */
export function isCollectorLoginFailure(message: string): boolean {
  const text = message.trim()
  if (!text) return false
  if (/playwright-profiles|collector:search:|search failed for|search never found|search niche shortfall/i.test(text)) {
    return false
  }
  return (
    /login_required|accounts\/login|two-?factor|enter the code|captcha|checkpoint|suspicious login|challenge_required|approve this login/i.test(
      text,
    )
  )
}
