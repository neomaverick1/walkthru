// The data Walkthru keeps on the device. Everything is plain JSON except photo files, which live as blobs.

export type Rating = 'excellent' | 'good' | 'fair' | 'poor' | 'na';

export type TemplateId = 'move-in' | 'move-out' | 'str-review' | 'pre-listing' | 'routine';

export type PropertyKind = 'house' | 'condo' | 'cabin' | 'townhome' | 'luxury-rental';

export interface Contact {
  name: string;
  role: string; // "Tenant", "Host", "Owner", "Listing agent"
  phone?: string;
  email?: string;
}

export interface Property {
  id: string;
  name: string; // "Lakeview Lodge"
  street: string;
  city: string;
  state: string;
  zip: string;
  kind: PropertyKind;
  beds: number;
  baths: number;
  sqft?: number;
  cover?: string; // photo id
  contacts: Contact[];
  notes?: string;
  createdAt: number;
}

/** A drawing on top of a photo. Points are 0–1 of the photo's width and height, so marks survive resizing. */
export interface Mark {
  id: string;
  kind: 'arrow' | 'circle' | 'pen' | 'text';
  color: string;
  points: [number, number][];
  text?: string;
}

export interface PhotoCheck {
  sharpness: number; // variance of the Laplacian on a small gray copy; higher is sharper
  brightness: number; // 0–1 mean luminance
  verdict: 'ok' | 'blurry' | 'dark' | 'bright';
}

export interface Photo {
  id: string;
  /** Bundled demo photos have a URL; photos you take are stored as blobs under the same id. */
  src?: string;
  width: number;
  height: number;
  takenAt: number;
  check?: PhotoCheck;
  marks: Mark[];
  caption?: string;
}

export type Severity = 'minor' | 'moderate' | 'major' | 'safety';
export type Responsibility = 'tenant' | 'owner' | 'wear';
export type Action = 'clean' | 'repair' | 'replace' | 'monitor';

export interface Issue {
  severity: Severity;
  responsibility: Responsibility;
  action: Action;
  cost: number; // estimated, in the report's currency
}

export interface Item {
  id: string;
  name: string;
  hint?: string;
  /** "rate" items get a condition; "reading" items take a number (meters, Wi-Fi speed); "count" items count things (keys). */
  type: 'rate' | 'reading' | 'count';
  unit?: string;
  rating?: Rating;
  value?: number;
  note: string;
  photos: string[];
  issue?: Issue;
  tool?: 'speedtest';
}

/** A photo the template asks for, like "Wide shot from the doorway". */
export interface Shot {
  id: string;
  label: string;
  photo?: string;
}

export type RoomKind =
  | 'exterior'
  | 'entry'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bedroom'
  | 'bathroom'
  | 'laundry'
  | 'garage'
  | 'office'
  | 'outdoor'
  | 'systems'
  | 'meters'
  | 'safety'
  | 'hospitality';

export interface Room {
  id: string;
  name: string;
  kind: RoomKind;
  items: Item[];
  shots: Shot[];
  note: string;
}

export interface Signature {
  role: string;
  name: string;
  path: string; // SVG path data in a 600 × 200 box
  signedAt: number;
}

export interface Inspection {
  id: string;
  number: string; // "WT-2611-014"
  propertyId: string;
  template: TemplateId;
  status: 'scheduled' | 'in-progress' | 'complete';
  scheduledAt: number;
  startedAt?: number;
  completedAt?: number;
  inspector: string;
  attendees: Contact[];
  rooms: Room[];
  summary: string;
  signatures: Signature[];
  compareTo?: string; // the earlier inspection a move-out is compared with
  updatedAt: number;
}

export interface Settings {
  company: string;
  inspector: string;
  license: string;
  phone: string;
  email: string;
  accent: string;
  logo?: string; // data URL
  currency: string;
  disclaimer: string;
  seeded?: number;
}
