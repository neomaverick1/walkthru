// Drafts the report's opening paragraph from the findings. The inspector can edit it before signing.
import { compareInspections } from './compare';
import { effectiveRating, inspectionStats, RESPONSIBILITY_LABEL, SEVERITY_LABEL } from './score';
import { templateInfo } from './templates';
import type { Inspection, Property } from './types';
import { money, plural, shortDate } from './util';

function conditionPhrase(score: number | null): string {
  if (score === null) return 'has not been rated yet';
  if (score >= 93) return 'is in exceptional condition';
  if (score >= 82) return 'is in good condition';
  if (score >= 68) return 'is in fair condition';
  if (score >= 50) return 'needs work in several areas';
  return 'is in poor condition';
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function draftSummary(x: Inspection, p: Property, before?: Inspection, currency = 'USD'): string {
  const st = inspectionStats(x);
  const t = templateInfo(x.template);
  const parts: string[] = [];
  const spaces = plural(x.rooms.length, 'space');
  const checks = plural(st.done, 'check');
  const score = st.score === null ? '' : `, scoring ${st.score} out of 100 across ${spaces} and ${checks}`;

  if (x.template === 'str-review') {
    parts.push(`${p.name} ${conditionPhrase(st.score)}${st.score !== null && st.score >= 88 ? ' and ready for guests' : ''}${score}.`);
  } else if (x.template === 'pre-listing') {
    parts.push(`${p.name} ${conditionPhrase(st.score)} for listing${score}.`);
  } else if (x.template === 'move-out' && before) {
    parts.push(`The home was returned and ${conditionPhrase(st.score)}${score}.`);
  } else {
    parts.push(`${p.name} ${conditionPhrase(st.score)}${score}.`);
  }

  if (x.template === 'move-out' && before) {
    const { changes } = compareInspections(before, x);
    const worse = changes.filter((c) => c.kind === 'worse');
    parts.push(
      worse.length
        ? `Compared with the move-in inspection on ${shortDate(before.completedAt ?? before.scheduledAt)}, ${plural(worse.length, 'item')} ${worse.length === 1 ? 'is' : 'are'} in worse condition.`
        : `Nothing is in worse condition than at move-in on ${shortDate(before.completedAt ?? before.scheduledAt)}.`,
    );
  }

  const top = st.issues.slice(0, 3).map((i) => `${lower(i.item.name)} in the ${lower(i.room.name)} (${lower(SEVERITY_LABEL[i.issue.severity])}${i.issue.cost ? `, ${money(i.issue.cost, currency)}` : ''})`);
  if (st.issues.length) {
    const lead = x.template === 'str-review' ? 'before the next stay' : x.template === 'pre-listing' ? 'before listing' : '';
    parts.push(
      `${st.issues.length === 1 ? 'One item needs' : `${plural(st.issues.length, 'item')} need`} attention${lead ? ` ${lead}` : ''}${top.length ? `: ${top.join('; ')}${st.issues.length > 3 ? '; and more listed below' : ''}` : ''}.`,
    );
    if (st.safety) parts.push(`${st.safety === 1 ? 'One is a safety item and should' : `${st.safety} are safety items and should`} be fixed right away.`);
  } else if (st.done) {
    parts.push('No issues were found.');
  }

  if (t.responsibility && st.issues.length && x.template !== 'routine') {
    const wear = st.issues.filter((i) => i.issue.responsibility === 'wear').length;
    const bits = [
      st.tenantCost ? `tenant charges come to about ${money(st.tenantCost, currency)}` : '',
      st.ownerCost ? `owner repairs to about ${money(st.ownerCost, currency)}` : '',
      wear ? `${plural(wear, 'item')} ${wear === 1 ? 'is' : 'are'} normal wear` : '',
    ].filter(Boolean);
    if (bits.length) {
      const sentence = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0];
      parts.push(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`);
    }
  } else if (st.cost) {
    parts.push(`Estimated cost of all work: ${money(st.cost, currency)}.`);
  }

  const wifi = x.rooms.flatMap((r) => r.items).find((i) => i.tool === 'speedtest' && i.value !== undefined);
  if (wifi) parts.push(`Wi-Fi measured ${Math.round(wifi.value!)} Mbps${effectiveRating(wifi) === 'poor' || effectiveRating(wifi) === 'fair' ? ', below the 50 Mbps standard' : ''}.`);

  if (st.shotsMissing === 0 && x.rooms.some((r) => r.shots.length)) parts.push('Every required photo was taken.');
  else if (st.shotsMissing) parts.push(`${plural(st.shotsMissing, 'required photo')} ${st.shotsMissing === 1 ? 'is' : 'are'} still missing.`);

  return parts.join(' ');
}

export const responsibilityText = (r: keyof typeof RESPONSIBILITY_LABEL) => RESPONSIBILITY_LABEL[r];
