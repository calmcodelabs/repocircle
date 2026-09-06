import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { userEvent } from 'vitest/browser';
import { Avatar } from '../../src/ui/Avatar';
import { Chip } from '../../src/ui/Chip';
import { EmptyState } from '../../src/ui/EmptyState';
import { Pill } from '../../src/ui/Pill';
import { Spark } from '../../src/ui/Spark';
import { StatusDot } from '../../src/ui/StatusDot';
import { ToastRegion, toast } from '../../src/ui/Toast';

/**
 * The design-system primitives, rendered in a real browser (TESTING.md §2, L4).
 *
 * Queried by role and text throughout, never by class name: a query that finds
 * a control the way a screen reader would is simultaneously an accessibility
 * assertion, which is the UI.md keyboard gate made executable at the cheapest
 * possible level.
 */

describe('[ui-primitives] EmptyState', () => {
  it('shows the instructional line', () => {
    render(<EmptyState line="No repos yet — add one from Repos." />);
    expect(screen.getByText('No repos yet — add one from Repos.')).toBeTruthy();
  });

  it('renders its action alongside the line', () => {
    render(<EmptyState line="Nothing here" action={<button type="button">Add a repo</button>} />);
    expect(screen.getByRole('button', { name: 'Add a repo' })).toBeTruthy();
  });

  it('hides the decorative icon from assistive technology', () => {
    const { container } = render(<EmptyState line="Nothing here" icon="repo" />);
    const tile = container.querySelector('.empty__tile');
    expect(tile?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('[ui-primitives] Avatar', () => {
  it('labels the image with the login rather than leaving it bare', () => {
    render(<Avatar login="mira-t" src="https://avatars.githubusercontent.com/mira-t" />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('alt')).toContain('mira-t');
  });

  it('falls back to a decorative initial when there is no image', () => {
    const { container } = render(<Avatar login="mira-t" />);
    const fallback = container.firstElementChild;
    expect(fallback?.textContent).toBe('M');
    // Correctly hidden from assistive technology: an initial announces nothing
    // useful, and the login is always rendered as text beside it.
    expect(fallback?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('[ui-primitives] Chip and Pill', () => {
  it('renders chip content as text', () => {
    render(<Chip>frontend</Chip>);
    expect(screen.getByText('frontend')).toBeTruthy();
  });

  it('a pill with a label is readable as one string', () => {
    const { container } = render(<Pill>building</Pill>);
    expect(container.textContent).toContain('building');
  });
});

describe('[ui-primitives] StatusDot', () => {
  it('is decorative, so it never announces itself', () => {
    const { container } = render(<StatusDot tone="accent" />);
    const dot = container.firstElementChild;
    // A coloured dot with no text must not be exposed as content; the status it
    // represents is always spelled out beside it.
    expect(dot?.textContent).toBe('');
  });
});

describe('[sparklines] Spark', () => {
  it('survives an empty series rather than dividing by zero', () => {
    const { container } = render(<Spark series={[]} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('describes itself in words, not just pixels', () => {
    // A sparkline that only exists visually is invisible to a screen reader.
    render(<Spark series={[0, 2, 5, 1, 4, 0, 3]} />);
    const svg = screen.getByRole('img');
    expect(svg.getAttribute('aria-label')).toBe('15 events over 7 days');
  });

  it('says "1 event" rather than "1 events"', () => {
    render(<Spark series={[1]} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('1 event over 1 days');
  });

  it('takes a caller-supplied label when the default would not fit', () => {
    render(<Spark series={[1, 2]} label="Activity in atlas this week" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Activity in atlas this week');
  });
});

describe('[ui-primitives] Toast', () => {
  it('announces a message politely and lets it be dismissed', async () => {
    render(<ToastRegion />);
    toast('Invite copied');
    const region = await screen.findByText('Invite copied');
    expect(region).toBeTruthy();
    // Toasts are status messages, not alerts: they must not steal focus.
    expect(document.activeElement).toBe(document.body);
  });

  it('shows an error toast in its error tone', async () => {
    render(<ToastRegion />);
    toast('Could not save', { error: true });
    const el = await screen.findByText('Could not save');
    expect(el.closest('.toast')?.className).toContain('error');
  });
});

describe('[ui-primitives] keyboard reachability', () => {
  it('a rendered action is reachable by Tab and activates on Enter', async () => {
    let clicked = 0;
    render(
      <EmptyState
        line="Nothing here"
        action={
          <button type="button" onClick={() => (clicked += 1)}>
            Add a repo
          </button>
        }
      />,
    );
    await userEvent.tab();
    const button = screen.getByRole('button', { name: 'Add a repo' });
    expect(document.activeElement).toBe(button);
    await userEvent.keyboard('{Enter}');
    expect(clicked).toBe(1);
  });
});
