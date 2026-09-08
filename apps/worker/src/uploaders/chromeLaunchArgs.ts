/** Shared Chromium flags for collector and upload profiles. */
export function chromeLaunchArgs(): string[] {
  return [
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--autoplay-policy=user-gesture-required',
  ]
}
