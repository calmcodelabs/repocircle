// Field limits shared by UI validation and tests.
// MUST stay in sync with firestore.rules — the rules are the enforcement,
// these constants exist so the client can pre-validate with identical numbers.
export const LIMITS = {
  GROUP_NAME_MIN: 3,
  GROUP_NAME_MAX: 50,
  GROUP_DESC_MAX: 280,
  TITLE_MIN: 4,
  TITLE_MAX: 120,
  DETAIL_MAX: 500,
  TAGS_MAX: 8,
  TAG_MAX_LEN: 24,
  COLLAB_NOTE_MAX: 280,
  CLAIM_NOTE_MAX: 140,
  INVITE_MAX_DAYS: 30,
  INVITE_LABEL_MAX: 40,
  EVENT_SUMMARY_MAX: 200,
  AUDIT_DETAIL_MAX: 200,
  MEMBER_TAG_MAX: 10,
} as const;
