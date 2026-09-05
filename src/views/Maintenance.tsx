import { MAINTENANCE } from '../maintenance';
import { Mark } from '../ui/Mark';

/** Shown instead of the entire app while MAINTENANCE.on is true. */
export function Maintenance() {
  return (
    <div class="app signin">
      <div class="halo halo--signin" />
      <main class="signin__panel rise">
        <Mark size={52} />
        <h1>{MAINTENANCE.heading}</h1>
        <p class="lead signin__tag">{MAINTENANCE.body}</p>
        <p class="small faint">{MAINTENANCE.eta}</p>
      </main>
    </div>
  );
}
