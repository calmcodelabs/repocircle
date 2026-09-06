/**
 * Maintenance switch. When `on` is true the app renders a single explanatory
 * screen and never touches Firebase — no auth, no Firestore, no reads. Flip it
 * off and redeploy to bring the app back; it is one line on purpose.
 */
export const MAINTENANCE = {
  on: false,
  heading: 'Back shortly',
  body: 'RepoCircle is paused for a few hours while we sort out a hosting limit. Nothing you have created is lost — your circle, repos and comments are all safe.',
  eta: 'Expected back around midday IST',
} as const;
