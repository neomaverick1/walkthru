import { templateInfo } from './templates';
import type { Inspection, Property, PropertyKind } from './types';

export const PROPERTY_KIND: Record<PropertyKind, string> = {
  house: 'House',
  condo: 'Condo',
  cabin: 'Cabin',
  townhome: 'Townhome',
  'luxury-rental': 'Luxury rental',
};

/** The PDF's file name: home, kind of inspection and report number */
export const reportFileName = (x: Inspection, p: Property) => `${p.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')}-${templateInfo(x.template).short.replace(/\s+/g, '-')}-${x.number}.pdf`;
