/**
 * Maintenance switch. When `on` is true the app renders a single explanatory
 * screen and never touches Firebase — no auth, no Firestore, no reads. Flip it
 * off and redeploy to bring the app back; it is one line on purpose.
 */
export const MAINTENANCE = {
  on: true,
  heading: 'Back shortly',
  body: 'RepoCircle is getting ready for its first circles. It will be open shortly — nothing you do here will be lost.',
  eta: 'Back around midday IST',
} as const;
