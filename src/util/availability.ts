import { AVAILABILITY_LABEL, type Member } from '../data/types';

/** One human line for a member's availability, shared by Members and Profile. */
export function availabilityText(m: Member): string {
  const a = m.availability;
  const base =
    a.status === 'custom' ? a.note || 'custom' : (AVAILABILITY_LABEL[a.status] ?? 'available');
  return a.until ? `${base} until ${a.until.toDate().toLocaleDateString()}` : base;
}
