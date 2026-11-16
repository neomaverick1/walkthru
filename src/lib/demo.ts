// Sample data for the demo: five Wisconsin properties and their inspections, with real photos.
// Dates are set relative to today, so the demo always looks current.
import SIZES from './demo-sizes.json';
import { replaceAll, DEFAULT_SETTINGS, type State } from './store';
import { buildRooms } from './templates';
import { draftSummary } from './summary';
import type { Contact, Inspection, Issue, Mark, Photo, Property, Rating, Room, TemplateId } from './types';

const DAY = 86_400_000;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (daysFromToday: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.getTime() + daysFromToday * DAY;
};

let photoSeq = 0;
function makePhoto(photos: Record<string, Photo>, name: string, takenAt: number, marks: Mark[] = []): string {
  const [width, height] = (SIZES as Record<string, number[]>)[name] ?? [1400, 933];
  const id = `demo-${name}-${++photoSeq}`;
  photos[id] = { id, src: `demo/${name}.jpg`, width, height, takenAt, marks, check: { sharpness: 180, brightness: 0.55, verdict: 'ok' } };
  return id;
}

const circle = (x: number, y: number, rx: number, ry: number, color = '#FF3B30'): Mark => ({ id: `m${++photoSeq}`, kind: 'circle', color, points: [[x - rx, y - ry], [x + rx, y + ry]] });
const arrow = (x0: number, y0: number, x1: number, y1: number, color = '#FF3B30'): Mark => ({ id: `m${++photoSeq}`, kind: 'arrow', color, points: [[x0, y0], [x1, y1]] });
const label = (x: number, y: number, text: string, color = '#FFFFFF'): Mark => ({ id: `m${++photoSeq}`, kind: 'text', color, points: [[x, y]], text });

/** A cursive-looking signature drawn from the name's letters, in a 600 × 200 box. */
export function signaturePath(name: string): string {
  const r = rng([...name].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  let x = 40;
  let y = 120;
  let d = `M ${x} ${y}`;
  const letters = name.replace(/\s+/g, '').length;
  const step = 470 / letters;
  for (let i = 0; i < letters; i++) {
    const tall = r() > 0.6;
    const nx = x + step * (0.8 + r() * 0.4);
    const ny = 118 + (r() - 0.5) * 18;
    const c1y = tall ? 40 + r() * 30 : 85 + r() * 20;
    const c2y = 150 + r() * 25;
    d += ` C ${(x + step * 0.2).toFixed(1)} ${c1y.toFixed(1)}, ${(nx - step * 0.6).toFixed(1)} ${c2y.toFixed(1)}, ${nx.toFixed(1)} ${ny.toFixed(1)}`;
    x = nx;
    y = ny;
  }
  d += ` M 70 ${(y + 30).toFixed(1)} C 220 ${(y + 48).toFixed(1)}, 380 ${(y + 20).toFixed(1)}, 540 ${(y + 34).toFixed(1)}`;
  return d;
}

interface Override {
  rating?: Rating;
  value?: number;
  note?: string;
  issue?: Issue;
  photos?: { name: string; marks?: Mark[] }[];
}
type Overrides = Record<string, Record<string, Override>>;

interface FillOptions {
  seed: number;
  /** Chances of excellent, good, fair for items without an override. */
  mix: [number, number, number];
  start: number;
  /** Rooms after this index are left for later (an inspection still in progress). */
  doneRooms?: number;
  /** In the first unfinished room, this many items are done. */
  partial?: number;
  shots: Record<string, string[]>;
  na?: string[];
  readings?: Record<string, number>;
  /** An earlier inspection of the same home: anything not called out comes back as it was then. */
  like?: Inspection;
}

function fill(x: Inspection, photos: Record<string, Photo>, o: FillOptions, over: Overrides) {
  const r = rng(o.seed);
  let t = o.start;
  x.rooms.forEach((room, ri) => {
    const doneLimit = o.doneRooms === undefined ? Infinity : o.doneRooms;
    if (ri > doneLimit) return;
    const partial = ri === doneLimit ? (o.partial ?? 0) : Infinity;
    const shots = o.shots[room.name] ?? [];
    if (ri < doneLimit) room.shots.forEach((s, i) => shots[i] && (s.photo = makePhoto(photos, shots[i], (t += 40_000))));
    else if (partial > 0 && room.shots[0] && shots[0]) room.shots[0].photo = makePhoto(photos, shots[0], (t += 40_000));
    room.items.forEach((item, ii) => {
      if (ii >= partial) return;
      t += 25_000 + r() * 50_000;
      const ov = over[room.name]?.[item.name];
      if (item.type !== 'rate') {
        const v = ov?.value ?? o.readings?.[item.name];
        if (v !== undefined) item.value = v;
        if (ov?.note) item.note = ov.note;
        return;
      }
      if (o.na?.some((n) => item.name.startsWith(n))) {
        item.rating = 'na';
        return;
      }
      const roll = r();
      const before = o.like?.rooms.find((p) => p.name === room.name)?.items.find((p) => p.name === item.name)?.rating;
      item.rating = ov?.rating ?? (before && before !== 'na' ? before : undefined) ?? (roll < o.mix[0] ? 'excellent' : roll < o.mix[0] + o.mix[1] ? 'good' : roll < o.mix[0] + o.mix[1] + o.mix[2] ? 'fair' : 'good');
      if (ov?.note) item.note = ov.note;
      if (ov?.issue) item.issue = ov.issue;
      if (ov?.photos) item.photos = ov.photos.map((p) => makePhoto(photos, p.name, (t += 20_000), p.marks ?? []));
    });
  });
  return t;
}

const issue = (severity: Issue['severity'], responsibility: Issue['responsibility'], action: Issue['action'], cost: number): Issue => ({ severity, responsibility, action, cost });

function inspection(id: string, number: string, p: Property, template: TemplateId, scheduledAt: number, attendees: Contact[], inspector: string): Inspection {
  return { id, number, propertyId: p.id, template, status: 'scheduled', scheduledAt, inspector, attendees, rooms: buildRooms(template, p), summary: '', signatures: [], updatedAt: Date.now() };
}

function sign(x: Inspection, when: number, people: { role: string; name: string }[]) {
  x.signatures = people.map((s, i) => ({ ...s, path: signaturePath(s.name), signedAt: when + i * 60_000 }));
}

const num = (t: number, seq: number) => {
  const d = new Date(t);
  return `WT-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
};

export function demoState(): Omit<State, 'ready'> {
  photoSeq = 0;
  const photos: Record<string, Photo> = {};
  const settings = { ...DEFAULT_SETTINGS, seeded: Date.now() };
  const inspector = settings.inspector;
  const created = at(-400, 9);

  // ---------------------------------------------------------------------------------------------------------
  const lodge: Property = {
    id: 'p-lodge',
    name: 'Lakeview Lodge',
    street: 'W2148 Juniper Ridge Road',
    city: 'Wisconsin Dells',
    state: 'WI',
    zip: '53965',
    kind: 'luxury-rental',
    beds: 3,
    baths: 2,
    sqft: 2600,
    contacts: [{ name: 'Dana Whitaker', role: 'Host', phone: '(608) 555-0186', email: 'dana@lakeviewlodge.example' }],
    notes: 'Lake-view timber lodge with hot tub and fire pit. Smart lock on the front door; backup key in the garage lockbox.',
    createdAt: created,
  };
  lodge.cover = makePhoto(photos, 'lodge-exterior', created);

  const maple: Property = {
    id: 'p-maple',
    name: '418 Maple Street',
    street: '418 Maple Street',
    city: 'Baraboo',
    state: 'WI',
    zip: '53913',
    kind: 'house',
    beds: 2,
    baths: 1.5,
    sqft: 1240,
    contacts: [
      { name: 'Chris Novak', role: 'Tenant', phone: '(608) 555-0119', email: 'chris.novak@example.com' },
      { name: 'Linda Park', role: 'Owner', phone: '(608) 555-0177' },
    ],
    notes: 'Lease ends this month. Security deposit $1,450.',
    createdAt: created,
  };
  maple.cover = makePhoto(photos, 'maple-exterior', created);

  const pine: Property = {
    id: 'p-pine',
    name: 'Pine Hollow Cabin',
    street: 'N5412 Pine Hollow Lane',
    city: 'Lake Delton',
    state: 'WI',
    zip: '53940',
    kind: 'cabin',
    beds: 2,
    baths: 1,
    sqft: 980,
    contacts: [{ name: 'Sam Ortega', role: 'Host', phone: '(608) 555-0154', email: 'sam@pinehollow.example' }],
    notes: 'Gravel drive, four-wheel drive recommended in winter. Wood stove in the great room.',
    createdAt: created,
  };
  pine.cover = makePhoto(photos, 'pine-exterior', created);

  const harbor: Property = {
    id: 'p-harbor',
    name: 'Harbor Loft 3B',
    street: '120 Riverwalk Avenue, Unit 3B',
    city: 'Stevens Point',
    state: 'WI',
    zip: '54481',
    kind: 'condo',
    beds: 2,
    baths: 2,
    sqft: 1180,
    contacts: [{ name: 'Priya Shah', role: 'Tenant', phone: '(715) 555-0133', email: 'priya.shah@example.com' }],
    createdAt: created,
  };
  harbor.cover = makePhoto(photos, 'harbor-exterior', created);

  const cedar: Property = {
    id: 'p-cedar',
    name: 'Cedar Bluff',
    street: '2710 Cedar Bluff Drive',
    city: 'Madison',
    state: 'WI',
    zip: '53711',
    kind: 'house',
    beds: 2,
    baths: 1.5,
    sqft: 1960,
    contacts: [
      { name: 'Morgan Lee', role: 'Listing agent', phone: '(608) 555-0102', email: 'morgan@lakeshore-realty.example' },
      { name: 'Erin Holt', role: 'Seller', phone: '(608) 555-0168' },
    ],
    notes: 'Listing photos booked for next Thursday.',
    createdAt: created,
  };
  cedar.cover = makePhoto(photos, 'cedar-exterior', created);

  const inspections: Inspection[] = [];

  // ---------------------------------------------------------------------------------------------------------
  // Lakeview Lodge: a finished luxury quality review
  {
    const start = at(-4, 13, 30);
    const x = inspection('i-lodge', num(start, 41), lodge, 'str-review', start, [lodge.contacts[0]], inspector);
    const end = fill(
      x,
      photos,
      {
        seed: 11,
        mix: [0.72, 0.26, 0.02],
        start,
        shots: {
          Arrival: ['lodge-exterior', 'lodge-entrance'],
          'Living room': ['lodge-living', 'lodge-living-2'],
          Kitchen: ['lodge-kitchen', 'lodge-kitchen-2'],
          'Dining area': ['lodge-dining'],
          'Primary bedroom': ['lodge-bed1', 'lodge-bed1-detail'],
          'Bedroom 2': ['lodge-bed2', 'lodge-bed2-detail'],
          'Bedroom 3': ['lodge-bed3', 'lodge-bed3-detail'],
          'Primary bathroom': ['lodge-bath1', 'lodge-bath1-detail'],
          'Bathroom 2': ['lodge-bath2', 'lodge-bath2-detail'],
          'Outdoor & amenities': ['lodge-view'],
        },
      },
      {
        Arrival: {
          'Entry & smart lock': { rating: 'excellent', note: 'Code works; lock battery at 80%. Backup key in the garage lockbox.' },
          'Parking as described': { rating: 'good', note: 'Three spaces on the paved drive. Plow service contracted for winter.' },
        },
        'Living room': {
          'Wi-Fi speed': { value: 182, note: 'Measured in the living room on the 5 GHz network.' },
          'Lighting & ambiance': { rating: 'excellent', note: 'Warm 2700K bulbs throughout; dimmers on the main lights.' },
          'Styling & decor': { rating: 'excellent' },
        },
        Kitchen: {
          'Coffee & tea setup': { rating: 'good', note: 'Pod machine only. Add a 12-cup drip maker for larger groups.' },
          'Cookware & utensils': { rating: 'excellent' },
        },
        'Bedroom 3': {
          'Blackout window coverings': {
            rating: 'fair',
            note: 'Morning light leaks around both sides of the curtains. Add side returns or a blackout liner.',
            issue: issue('minor', 'owner', 'replace', 180),
            photos: [{ name: 'lodge-bed3-window', marks: [arrow(0.18, 0.2, 0.42, 0.34), label(0.06, 0.16, 'Light gap')] }],
          },
        },
        'Primary bathroom': {
          'Fixtures, tile & grout': {
            rating: 'fair',
            note: 'Caulk along the base of the tub is discolored. Remove and re-caulk with mildew-resistant silicone.',
            issue: issue('minor', 'owner', 'repair', 140),
            photos: [{ name: 'lodge-bath-grout', marks: [circle(0.52, 0.905, 0.4, 0.06)] }],
          },
        },
        'Outdoor & amenities': {
          'Hot tub': {
            rating: 'poor',
            note: 'Cover hinge is cracked and the safety straps no longer latch. Replace the cover before the next stay.',
            issue: issue('safety', 'owner', 'replace', 450),
          },
          'Views as described': { rating: 'excellent', note: 'Lake view from the deck and the primary bedroom, as in the listing.' },
        },
        Safety: {
          'Fire extinguisher': { rating: 'excellent', note: 'Kitchen and garage. Both charged, tagged 08/2026.' },
          'Pool & hot tub safety': { rating: 'fair', note: 'See hot tub cover.' },
        },
        Hospitality: {
          'Thoughtful touches': { rating: 'excellent', note: 'Handwritten welcome note and a box of local cheese curds.' },
        },
      },
    );
    x.status = 'complete';
    x.startedAt = start;
    x.completedAt = end + 20 * 60_000;
    sign(x, x.completedAt, [
      { role: 'Inspector', name: inspector },
      { role: 'Host', name: lodge.contacts[0].name },
    ]);
    x.summary = draftSummary(x, lodge);
    inspections.push(x);
  }

  // ---------------------------------------------------------------------------------------------------------
  // 418 Maple Street: move-in last March, move-out in progress today
  const mapleShots = {
    Exterior: ['maple-exterior'],
    'Living room': ['maple-living'],
    Kitchen: ['maple-kitchen', 'maple-kitchen-appliances'],
    'Dining room': ['maple-dining'],
    'Primary bedroom': ['maple-bed1'],
    'Bedroom 2': ['maple-bed2'],
    Bathroom: ['maple-bath'],
    'Half bath': ['maple-halfbath'],
  };
  const tenants = [maple.contacts[0]];
  let moveIn: Inspection | undefined;
  {
    const start = at(-252, 9);
    const x = inspection('i-maple-in', num(start, 7), maple, 'move-in', start, tenants, inspector);
    const end = fill(
      x,
      photos,
      {
        seed: 7,
        mix: [0.34, 0.6, 0.06],
        start,
        shots: mapleShots,
        na: ['Fireplace', 'Furniture'],
        readings: { 'Electric meter': 48213, 'Gas meter': 3311, 'Water meter': 120480, 'Door keys': 2, 'Mailbox keys': 1, 'Garage remotes': 2 },
      },
      {
        'Living room': { 'Walls & paint': { rating: 'good', note: 'Freshly painted before move-in.', photos: [{ name: 'maple-living-wall' }] } },
        Kitchen: {
          Countertops: { rating: 'excellent', note: 'New quartz on the island; no marks.', photos: [{ name: 'maple-kitchen-counter' }] },
          'Range & oven': { rating: 'good', note: 'Cleaned; all burners light.' },
        },
        'Bedroom 2': { Flooring: { rating: 'good', note: 'Area rug included with the home, professionally cleaned.', photos: [{ name: 'maple-bed2-rug' }] } },
        'Primary bedroom': { 'Window coverings': { rating: 'good' } },
        Bathroom: { Caulking: { rating: 'good', photos: [{ name: 'maple-bath-caulk' }] } },
        Exterior: {
          'Exterior paint': { rating: 'fair', note: 'Peeling on the porch railing. Owner to repaint in spring.' },
          'Lawn & landscaping': { rating: 'good', note: 'Mowed and edged.' },
        },
      },
    );
    x.status = 'complete';
    x.startedAt = start;
    x.completedAt = end + 15 * 60_000;
    sign(x, x.completedAt, [
      { role: 'Inspector', name: inspector },
      { role: 'Tenant', name: tenants[0].name },
    ]);
    x.summary = draftSummary(x, maple);
    moveIn = x;
    inspections.push(x);
  }
  {
    const start = at(0, 9, 30);
    const x = inspection('i-maple-out', num(start, 52), maple, 'move-out', start, tenants, inspector);
    x.compareTo = moveIn?.id;
    x.status = 'in-progress';
    x.startedAt = start;
    fill(
      x,
      photos,
      { seed: 19, mix: [0.3, 0.62, 0.08], start, doneRooms: 7, partial: 7, shots: mapleShots, na: ['Fireplace', 'Furniture'], like: moveIn },
      {
        Exterior: {
          'Exterior paint': { rating: 'good', note: 'Porch railing repainted by the owner in May.' },
          'Lawn & landscaping': { rating: 'fair', note: 'Lawn about six inches tall; needs mowing and edging before the next tenant.', issue: issue('minor', 'tenant', 'clean', 85) },
        },
        'Living room': {
          'Walls & paint': {
            rating: 'fair',
            note: 'Three anchor holes above the media console and a scuff along the wall.',
            issue: issue('minor', 'tenant', 'repair', 150),
            photos: [{ name: 'maple-living-wall-out', marks: [circle(0.535, 0.36, 0.13, 0.13), arrow(0.25, 0.8, 0.36, 0.64)] }],
          },
        },
        Kitchen: {
          Countertops: {
            rating: 'fair',
            note: 'Heat ring burned into the island top, about three inches across.',
            issue: issue('moderate', 'tenant', 'repair', 180),
            photos: [{ name: 'maple-kitchen-counter-out', marks: [circle(0.4, 0.152, 0.1, 0.075)] }],
          },
          'Range & oven': { rating: 'fair', note: 'Oven needs a deep clean; grease on the door glass.', issue: issue('minor', 'tenant', 'clean', 75) },
        },
        'Primary bedroom': {
          'Window coverings': { rating: 'fair', note: 'Two slats broken on the left blind.', issue: issue('minor', 'tenant', 'replace', 45) },
        },
        'Bedroom 2': {
          Flooring: {
            rating: 'poor',
            note: 'Large coffee stain on the area rug, soaked through to the pad.',
            issue: issue('moderate', 'tenant', 'clean', 240),
            photos: [{ name: 'maple-bed2-rug-out', marks: [circle(0.765, 0.905, 0.1, 0.14)] }],
          },
        },
        Bathroom: {
          Caulking: {
            rating: 'fair',
            note: 'Mildew along the caulk line at the base of the pedestal sink.',
            issue: issue('minor', 'wear', 'clean', 60),
            photos: [{ name: 'maple-bath-caulk-out', marks: [circle(0.37, 0.716, 0.2, 0.06, '#FFCC00')] }],
          },
        },
      },
    );
    inspections.push(x);
  }

  // ---------------------------------------------------------------------------------------------------------
  // Pine Hollow Cabin: a quality review booked for tomorrow
  inspections.push(inspection('i-pine', num(at(1, 10), 53), pine, 'str-review', at(1, 10), [pine.contacts[0]], inspector));

  // ---------------------------------------------------------------------------------------------------------
  // Harbor Loft: a routine check two weeks ago, and the move-out next week
  {
    const start = at(-16, 15);
    const x = inspection('i-harbor-routine', num(start, 44), harbor, 'routine', start, [harbor.contacts[0]], inspector);
    const end = fill(
      x,
      photos,
      { seed: 23, mix: [0.3, 0.64, 0.06], start, shots: {} },
      {
        'Bathroom 2': {
          'Exhaust fan': { rating: 'poor', note: 'Fan is loud and barely pulls air. Moisture marks on the ceiling around it.', issue: issue('moderate', 'owner', 'replace', 210) },
        },
        'Lease compliance': {
          'Pets match the lease': { rating: 'good', note: 'One cat, approved on the lease.' },
          'HVAC filter changed': { rating: 'good', note: 'Filter dated last month.' },
        },
        Kitchen: { 'Range hood filter': { rating: 'fair', note: 'Greasy; showed the tenant how to clean it.', issue: issue('minor', 'tenant', 'clean', 0) } },
      },
    );
    x.status = 'complete';
    x.startedAt = start;
    x.completedAt = end + 10 * 60_000;
    sign(x, x.completedAt, [
      { role: 'Inspector', name: inspector },
      { role: 'Tenant', name: harbor.contacts[0].name },
    ]);
    x.summary = draftSummary(x, harbor);
    inspections.push(x);
  }
  inspections.push(inspection('i-harbor-out', num(at(5, 13, 30), 55), harbor, 'move-out', at(5, 13, 30), [harbor.contacts[0]], inspector));

  // ---------------------------------------------------------------------------------------------------------
  // Cedar Bluff: a pre-listing walkthrough for the agent
  {
    const start = at(-6, 10);
    const x = inspection('i-cedar', num(start, 47), cedar, 'pre-listing', start, cedar.contacts, inspector);
    const office: Room = buildRooms('pre-listing', { ...cedar, beds: 1 }).find((r) => r.kind === 'bedroom')!;
    office.name = 'Office';
    office.kind = 'office';
    office.items = office.items.filter((i) => !/smoke|closet/i.test(i.name));
    x.rooms.splice(
      x.rooms.findIndex((r) => r.name === 'Bathroom'),
      0,
      office,
    );
    const end = fill(
      x,
      photos,
      {
        seed: 31,
        mix: [0.38, 0.52, 0.1],
        start,
        na: ['Furniture'],
        shots: {
          Exterior: ['cedar-exterior'],
          'Living room': ['cedar-living'],
          Kitchen: ['cedar-kitchen', 'cedar-kitchen-2'],
          'Dining room': ['cedar-dining'],
          'Primary bedroom': ['cedar-bed1'],
          'Bedroom 2': ['cedar-bed2'],
          Office: ['cedar-office'],
          Bathroom: ['cedar-bath'],
          'Half bath': ['cedar-halfbath'],
        },
      },
      {
        Exterior: {
          'Curb appeal': { rating: 'good', note: 'Strong modern facade. Add two large planters by the door and fresh mulch.' },
          'Deck, porch or patio': { rating: 'fair', note: 'Deck boards graying. Power wash and seal before photos.', issue: issue('minor', 'owner', 'clean', 350) },
        },
        'Living room': {
          'Walls & paint': { rating: 'fair', note: 'Scuffs by the stairs and two picture-hanging holes. Patch and touch up.', issue: issue('minor', 'owner', 'repair', 120) },
          Fireplace: { rating: 'excellent', note: 'Gas insert, serviced this fall.' },
        },
        Kitchen: { 'Range hood & fan': { rating: 'poor', note: 'Fan light out and the grease filter is clogged.', issue: issue('minor', 'owner', 'replace', 60) } },
        Bathroom: { Caulking: { rating: 'fair', note: 'Re-caulk the tub before listing photos.', issue: issue('minor', 'owner', 'repair', 90) } },
        'Systems & safety': {
          'Smoke alarms': { rating: 'poor', note: 'Hallway alarm chirping (low battery). Replace before showings.', issue: issue('safety', 'owner', 'replace', 25) },
          'Water heater': { rating: 'fair', note: '2011 tank, 15 years old. Disclose the age; buyers may ask for a credit.', issue: issue('moderate', 'owner', 'monitor', 1600) },
        },
      },
    );
    x.status = 'complete';
    x.startedAt = start;
    x.completedAt = end + 12 * 60_000;
    sign(x, x.completedAt, [
      { role: 'Inspector', name: inspector },
      { role: 'Listing agent', name: cedar.contacts[0].name },
    ]);
    x.summary = draftSummary(x, cedar);
    inspections.push(x);
  }

  // The move-out summary needs its move-in.
  const out = inspections.find((i) => i.id === 'i-maple-out')!;
  out.summary = '';

  return {
    properties: Object.fromEntries([lodge, maple, pine, harbor, cedar].map((p) => [p.id, p])),
    inspections: Object.fromEntries(inspections.map((i) => [i.id, i])),
    photos,
    settings,
  };
}

export async function loadDemo() {
  await replaceAll(demoState());
}

