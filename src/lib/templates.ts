// Inspection templates: which rooms a walkthrough covers, what to check in each, and which photos to take.
import type { Item, Property, Room, RoomKind, Shot, TemplateId } from './types';
import { uid } from './util';

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  short: string;
  description: string;
  /** Rentals split costs between tenant and owner; a listing walkthrough doesn't. */
  responsibility: boolean;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'move-in',
    name: 'Move-in inspection',
    short: 'Move-in',
    description: 'Record the condition of every room, the meters and the keys before a tenant moves in.',
    responsibility: true,
  },
  {
    id: 'move-out',
    name: 'Move-out inspection',
    short: 'Move-out',
    description: 'Walk the same rooms when the tenant leaves and compare against move-in for the deposit.',
    responsibility: true,
  },
  {
    id: 'str-review',
    name: 'Short-term rental quality review',
    short: 'Quality review',
    description: 'Luxury-standard review for vacation rentals: guest readiness, amenities, safety and a required photo list.',
    responsibility: false,
  },
  {
    id: 'pre-listing',
    name: 'Pre-listing walkthrough',
    short: 'Pre-listing',
    description: 'For agents and sellers: what to fix, clean or stage before the home goes on the market.',
    responsibility: false,
  },
  {
    id: 'routine',
    name: 'Routine inspection',
    short: 'Routine',
    description: 'A quick check during a tenancy: leaks, smoke alarms, damage and lease compliance.',
    responsibility: true,
  },
];

export const templateInfo = (id: TemplateId) => TEMPLATES.find((t) => t.id === id)!;

type ItemSpec = string | { name: string; hint?: string; type?: Item['type']; unit?: string; tool?: Item['tool'] };

const item = (s: ItemSpec): Item => {
  const spec = typeof s === 'string' ? { name: s } : s;
  return { id: uid(), name: spec.name, hint: spec.hint, type: spec.type ?? 'rate', unit: spec.unit, tool: spec.tool, note: '', photos: [] };
};

const shot = (label: string): Shot => ({ id: uid(), label });

const room = (name: string, kind: RoomKind, items: ItemSpec[], shots: string[] = []): Room => ({
  id: uid(),
  name,
  kind,
  items: items.map(item),
  shots: shots.map(shot),
  note: '',
});

// ---------------------------------------------------------------------------------------------------------------
// Condition checklists, shared by move-in, move-out and pre-listing

const SURFACES: ItemSpec[] = [
  { name: 'Walls & paint', hint: 'Scuffs, holes, nail pops, marks' },
  { name: 'Ceiling', hint: 'Stains, cracks, peeling' },
  { name: 'Flooring', hint: 'Stains, scratches, tears, loose boards' },
];
const OPENINGS: ItemSpec[] = [
  { name: 'Doors & hardware', hint: 'Swing, latch, stops, knobs' },
  { name: 'Windows & screens', hint: 'Open, close, lock, cracked glass, torn screens' },
  { name: 'Window coverings', hint: 'Blinds, shades, curtains, rods' },
];
const POWER: ItemSpec[] = [
  { name: 'Lights & switches', hint: 'Every fixture works, covers present' },
  { name: 'Outlets', hint: 'Covers present, test with a charger' },
];

const condition: Record<string, ItemSpec[]> = {
  exterior: [
    { name: 'Roof (from the ground)', hint: 'Missing shingles, sagging, moss' },
    { name: 'Gutters & downspouts', hint: 'Attached, clear, draining away' },
    { name: 'Siding & trim', hint: 'Cracks, rot, loose pieces' },
    'Exterior paint',
    { name: 'Foundation (visible)', hint: 'Cracks, settling, moisture' },
    'Driveway & walkways',
    'Lawn & landscaping',
    'Fence & gates',
    'Deck, porch or patio',
    'Exterior lighting',
    { name: 'Front door & locks', hint: 'All keys work, deadbolt, weatherstrip' },
  ],
  entry: [...SURFACES, 'Front door (inside)', 'Closet', ...POWER.slice(0, 1), 'Smoke alarm'],
  living: [...SURFACES, ...OPENINGS, ...POWER, 'Fireplace', 'Furniture (if furnished)'],
  dining: [...SURFACES, 'Windows & screens', 'Light fixture', 'Outlets'],
  kitchen: [
    { name: 'Cabinets & drawers', hint: 'Doors aligned, hinges, shelf liners, inside clean' },
    { name: 'Countertops', hint: 'Burns, chips, cuts, seams' },
    { name: 'Sink & faucet', hint: 'Drips, drain speed, sprayer' },
    'Garbage disposal',
    { name: 'Refrigerator', hint: 'Cooling, seals, shelves, ice maker' },
    { name: 'Range & oven', hint: 'All burners, oven heats, clean inside' },
    'Range hood & fan',
    'Microwave',
    { name: 'Dishwasher', hint: 'Runs, drains, racks, no leaks' },
    ...SURFACES,
    'Lights',
    { name: 'GFCI outlets', hint: 'Test and reset' },
  ],
  bedroom: [...SURFACES, ...OPENINGS, { name: 'Closet & doors', hint: 'Doors on track, rod, shelf' }, 'Lights & ceiling fan', 'Outlets', 'Smoke alarm'],
  bathroom: [
    { name: 'Toilet', hint: 'Flushes, refills, secure to floor, seat' },
    { name: 'Sink & vanity', hint: 'Drain, stopper, cabinet base for water damage' },
    'Faucets',
    { name: 'Tub & shower', hint: 'Drains, chips, door or rod' },
    { name: 'Tile & grout', hint: 'Cracks, missing grout, mold' },
    'Caulking',
    'Mirror & medicine cabinet',
    'Towel bars & fixtures',
    { name: 'Exhaust fan', hint: 'Runs, not noisy, clean' },
    { name: 'GFCI outlets', hint: 'Test and reset' },
    'Flooring',
    'Walls & ceiling',
  ],
  laundry: ['Washer', 'Dryer', { name: 'Dryer vent', hint: 'Lint, kinks, outside flap' }, 'Hookups & drain', 'Utility sink', 'Flooring'],
  garage: [{ name: 'Garage door & opener', hint: 'Remotes, auto-reverse safety' }, 'Floor (oil stains, cracks)', 'Walls', 'Lights', 'Entry door'],
  systems: [
    { name: 'Heating & cooling', hint: 'Runs on both; filter date' },
    'Thermostat',
    { name: 'Water heater', hint: 'Age, leaks, temperature' },
    { name: 'Electrical panel', hint: 'Labeled, cover on, no scorch marks' },
    { name: 'Smoke alarms', hint: 'Test every one' },
    { name: 'Carbon monoxide alarms', hint: 'Required near bedrooms with gas appliances' },
    { name: 'Fire extinguisher', hint: 'Charged, mounted, in date' },
    { name: 'Plumbing leaks', hint: 'Under every sink, around the water heater' },
    'Water pressure',
  ],
};

const meters = (): Room =>
  room(
    'Meters & keys',
    'meters',
    [
      { name: 'Electric meter', type: 'reading', unit: 'kWh' },
      { name: 'Gas meter', type: 'reading', unit: 'ccf' },
      { name: 'Water meter', type: 'reading', unit: 'gal' },
      { name: 'Door keys', type: 'count', unit: 'keys' },
      { name: 'Mailbox keys', type: 'count', unit: 'keys' },
      { name: 'Garage remotes', type: 'count', unit: 'remotes' },
    ],
  );

function homeRooms(p: Property, opts: { wideShots: boolean; meters: boolean }): Room[] {
  const shots = (s: string[]) => (opts.wideShots ? s : []);
  const rooms: Room[] = [
    room('Exterior', 'exterior', condition.exterior, shots(['Front of the home'])),
    room('Entry', 'entry', condition.entry),
    room('Living room', 'living', condition.living, shots(['Wide shot'])),
    room('Kitchen', 'kitchen', condition.kitchen, shots(['Wide shot', 'Appliances'])),
  ];
  if (p.kind === 'house' || p.kind === 'luxury-rental' || p.beds >= 3) rooms.push(room('Dining room', 'dining', condition.dining, shots(['Wide shot'])));
  for (let b = 1; b <= Math.max(1, p.beds); b++) {
    rooms.push(room(b === 1 ? 'Primary bedroom' : `Bedroom ${b}`, 'bedroom', condition.bedroom, shots(['Wide shot'])));
  }
  const fullBaths = Math.max(1, Math.floor(p.baths));
  for (let b = 1; b <= fullBaths; b++) rooms.push(room(fullBaths === 1 ? 'Bathroom' : b === 1 ? 'Primary bathroom' : `Bathroom ${b}`, 'bathroom', condition.bathroom, shots(['Wide shot'])));
  if (p.baths % 1 >= 0.5) rooms.push(room('Half bath', 'bathroom', condition.bathroom.filter((i) => !/tub/i.test(typeof i === 'string' ? i : i.name)), shots(['Wide shot'])));
  if (p.kind !== 'condo') rooms.push(room('Laundry', 'laundry', condition.laundry));
  if (p.kind === 'house' || p.kind === 'townhome') rooms.push(room('Garage', 'garage', condition.garage));
  rooms.push(room('Systems & safety', 'systems', condition.systems));
  if (opts.meters) rooms.push(meters());
  return rooms;
}

// ---------------------------------------------------------------------------------------------------------------
// Short-term rental quality review: guest-facing standards and a photo list for every space

function strRooms(p: Property): Room[] {
  const rooms: Room[] = [
    room(
      'Arrival',
      'exterior',
      [
        { name: 'Curb appeal', hint: 'First impression from the street: landscaping, paint, clutter' },
        { name: 'Address & signage', hint: 'Easy to find at night' },
        { name: 'Parking as described', hint: 'Spaces, surface, snow plan in winter' },
        { name: 'Entry & smart lock', hint: 'Code works, battery level, backup key' },
        'Exterior lighting',
        { name: 'Porch & entry cleanliness', hint: 'Cobwebs, leaves, doormat' },
      ],
      ['Front of the home, wide', 'Entrance'],
    ),
    room(
      'Living room',
      'living',
      [
        { name: 'Cleanliness', hint: 'Dust on high and low surfaces, under cushions' },
        { name: 'Furniture condition', hint: 'Stains, tears, wobbly legs' },
        { name: 'Styling & decor', hint: 'Cohesive, uncluttered, nothing personal left out' },
        { name: 'Seating for every guest', hint: 'Matches the listing’s guest count' },
        { name: 'Lighting & ambiance', hint: 'Warm bulbs, lamps for evening, no dead bulbs' },
        { name: 'TV & streaming', hint: 'Remote works, logged-out apps or guest profiles' },
        { name: 'Climate control', hint: 'Heats and cools; instructions available' },
        { name: 'Wi-Fi speed', type: 'reading', unit: 'Mbps', tool: 'speedtest', hint: 'Luxury standard: 50 Mbps or faster' },
      ],
      ['Wide shot from the doorway', 'Second angle'],
    ),
    room(
      'Kitchen',
      'kitchen',
      [
        { name: 'Cleanliness', hint: 'Inside the fridge, oven, microwave and drawers' },
        { name: 'Appliances work', hint: 'Every burner, oven, dishwasher, ice maker' },
        { name: 'Cookware & utensils', hint: 'Matching sets, no scratched nonstick' },
        { name: 'Dishware for every guest', hint: 'Plates, bowls, glasses and wine glasses' },
        { name: 'Coffee & tea setup', hint: 'Machine, filters or pods, mugs' },
        { name: 'Pantry basics', hint: 'Oil, salt, pepper, sugar' },
        { name: 'Cleaning supplies', hint: 'Dish soap, sponges, detergent pods, paper towels' },
      ],
      ['Wide shot', 'Appliances'],
    ),
  ];
  if (p.beds >= 3 || p.kind === 'luxury-rental') {
    rooms.push(
      room(
        'Dining area',
        'dining',
        [{ name: 'Seats for every guest', hint: 'Matches the listing' }, 'Table & chairs condition', 'Lighting', 'Cleanliness'],
        ['Wide shot'],
      ),
    );
  }
  for (let b = 1; b <= Math.max(1, p.beds); b++) {
    rooms.push(
      room(
        b === 1 ? 'Primary bedroom' : `Bedroom ${b}`,
        'bedroom',
        [
          { name: 'Bed & mattress', hint: 'Firm, clean, protector on, no sagging' },
          { name: 'Linens', hint: 'Hotel quality, white or neutral, no stains or pilling' },
          { name: 'Pillows', hint: 'Two per guest, plus a spare set' },
          { name: 'Blackout window coverings', hint: 'Light seal at the edges' },
          { name: 'Closet & hangers', hint: 'Matching hangers, luggage rack' },
          { name: 'Nightstand lights & charging', hint: 'Both sides of the bed' },
          { name: 'Cleanliness', hint: 'Under the bed, baseboards, ceiling fan' },
        ],
        ['Wide shot from the doorway', 'Bed detail'],
      ),
    );
  }
  const baths = Math.max(1, Math.ceil(p.baths));
  for (let b = 1; b <= baths; b++) {
    rooms.push(
      room(
        baths === 1 ? 'Bathroom' : b === 1 ? 'Primary bathroom' : `Bathroom ${b}`,
        'bathroom',
        [
          { name: 'Cleanliness', hint: 'Hair, soap scum, grout, behind the toilet' },
          { name: 'Towels', hint: 'Two bath towels per guest, hand towels, bath mat' },
          { name: 'Toiletries', hint: 'Full-size shampoo, conditioner, body wash, hand soap' },
          { name: 'Hot water & pressure', hint: 'Hot within a minute' },
          { name: 'Ventilation', hint: 'Fan runs, no musty smell' },
          { name: 'Fixtures, tile & grout', hint: 'Chips, rust, missing grout' },
        ],
        ['Wide shot', 'Shower or tub'],
      ),
    );
  }
  rooms.push(
    room(
      'Outdoor & amenities',
      'outdoor',
      [
        { name: 'Outdoor furniture', hint: 'Clean cushions, no rust' },
        { name: 'Grill', hint: 'Clean grates, fuel, tools' },
        { name: 'Hot tub', hint: 'Clean, cover locks, chemistry logged' },
        { name: 'Fire pit', hint: 'Firewood, rules posted' },
        { name: 'Views as described', hint: 'Matches the listing photos' },
      ],
      ['The view'],
    ),
    room(
      'Safety',
      'safety',
      [
        { name: 'Smoke alarms', hint: 'Every bedroom and hallway, tested' },
        { name: 'Carbon monoxide alarms', hint: 'Tested' },
        { name: 'Fire extinguisher', hint: 'Charged, visible, in date' },
        { name: 'First aid kit', hint: 'Stocked' },
        { name: 'Emergency information', hint: 'Address, exits, local emergency numbers' },
        { name: 'Pool & hot tub safety', hint: 'Lockable cover, gate, signage' },
        { name: 'Stairs & railings', hint: 'Secure, lit' },
      ],
    ),
    room(
      'Hospitality',
      'hospitality',
      [
        { name: 'House manual', hint: 'Appliances, Wi-Fi, trash days, checkout steps' },
        { name: 'Check-in instructions', hint: 'Clear, with photos' },
        { name: 'Local recommendations', hint: 'Restaurants, coffee, activities' },
        { name: 'Thoughtful touches', hint: 'Welcome note, local treat, spare chargers' },
      ],
    ),
  );
  return rooms;
}

// ---------------------------------------------------------------------------------------------------------------
// Routine inspection: short and focused

function routineRooms(p: Property): Room[] {
  const quick: ItemSpec[] = [
    { name: 'Overall condition', hint: 'Damage beyond normal wear' },
    { name: 'Leaks or water damage', hint: 'Ceilings, under sinks, around windows' },
    { name: 'Cleanliness & sanitation', hint: 'Trash, pests, odors' },
    { name: 'Smoke alarm', hint: 'Test it' },
  ];
  const rooms = [
    room('Exterior', 'exterior', ['Overall condition', 'Lawn & landscaping', { name: 'Trash & debris', hint: 'Lease requires the yard kept clear' }, 'Gutters', 'Exterior lighting']),
    room('Kitchen', 'kitchen', [quick[0], quick[1], quick[2], 'Appliances working', 'Range hood filter']),
    room('Living areas', 'living', [quick[0], quick[1], quick[2], quick[3]]),
  ];
  for (let b = 1; b <= Math.max(1, p.beds); b++) rooms.push(room(b === 1 ? 'Primary bedroom' : `Bedroom ${b}`, 'bedroom', [quick[0], quick[1], quick[3]]));
  for (let b = 1; b <= Math.max(1, Math.ceil(p.baths)); b++) rooms.push(room(b === 1 ? 'Bathroom' : `Bathroom ${b}`, 'bathroom', [quick[0], quick[1], 'Caulking & grout', 'Exhaust fan']));
  rooms.push(
    room('Lease compliance', 'systems', [
      { name: 'Occupants match the lease', hint: 'No unauthorized occupants' },
      { name: 'Pets match the lease' },
      { name: 'No unapproved alterations', hint: 'Paint, locks, satellite dishes' },
      { name: 'HVAC filter changed', hint: 'Note the date on the filter' },
      { name: 'Carbon monoxide alarms', hint: 'Test them' },
    ]),
  );
  return rooms;
}

export function buildRooms(template: TemplateId, p: Property): Room[] {
  switch (template) {
    case 'move-in':
    case 'move-out':
      return homeRooms(p, { wideShots: true, meters: true });
    case 'pre-listing':
      return homeRooms(p, { wideShots: true, meters: false }).map((r) =>
        r.kind === 'exterior'
          ? {
              ...r,
              items: [
                item({ name: 'Curb appeal', hint: 'What buyers see first: paint, lawn, front door, house numbers' }),
                ...r.items,
              ],
            }
          : r,
      );
    case 'routine':
      return routineRooms(p);
    case 'str-review':
      return strRooms(p);
  }
}

/** Items you can add to a room by hand, suggested by room kind. */
export function suggestions(kind: RoomKind): string[] {
  const list = condition[kind] ?? [...SURFACES, ...OPENINGS, ...POWER];
  return list.map((s) => (typeof s === 'string' ? s : s.name));
}

export const ROOM_KINDS: { kind: RoomKind; name: string }[] = [
  { kind: 'bedroom', name: 'Bedroom' },
  { kind: 'bathroom', name: 'Bathroom' },
  { kind: 'living', name: 'Living area' },
  { kind: 'kitchen', name: 'Kitchen' },
  { kind: 'dining', name: 'Dining room' },
  { kind: 'office', name: 'Office' },
  { kind: 'laundry', name: 'Laundry' },
  { kind: 'garage', name: 'Garage' },
  { kind: 'outdoor', name: 'Outdoor space' },
  { kind: 'entry', name: 'Hallway or entry' },
];

/** A new room added during a walkthrough, with the standard checks for its kind. */
export function newRoom(kind: RoomKind, name: string): Room {
  const base = condition[kind] ?? [...SURFACES, ...OPENINGS, ...POWER];
  return room(name, kind, base, ['Wide shot']);
}
