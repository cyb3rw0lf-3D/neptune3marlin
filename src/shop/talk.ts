import { COMEBACK_NOTES, JOBS } from './jobs';
import { CUSTOMERS } from './model';

/** What every customer can say, in their own voice. */
export const CUSTOMER_LINES = {
  approve: 'Sounds good. Go ahead.',
  comebackOk: 'Please make it right this time.',
  extraYes: 'Yes, please take care of that too.',
  extraNo: 'Not today, thanks. Maybe next time.',
  extraRefer: 'Okay, I will get that looked at. Thanks for telling me.',
  thanks: 'Thank you so much. See you next time!',
} as const;

/** Mistake-code prefixes for each lesson, to find the comebacks a job can have. */
const PREFIX: Record<string, string> = {
  'oil-change': 'oil.',
  'tire-service': 'tires.',
  brakes: 'brakes.',
  battery: 'battery.',
  obd2: 'obd.',
  'spark-plugs': 'plugs.',
};

/** Every line a customer can speak, with its voice: used to pre-record them. */
export function customerLines(): { text: string; speaker: string }[] {
  const out = new Map<string, { text: string; speaker: string }>();
  const add = (text: string, speaker: string) => out.set(`${speaker}|${text}`, { text, speaker });
  for (const c of CUSTOMERS) for (const line of Object.values(CUSTOMER_LINES)) add(line, c.voice);
  for (const job of JOBS) {
    const voice = CUSTOMERS.find((c) => c.id === job.customer)?.voice ?? job.customer;
    add(job.complaint, voice);
    for (const q of job.questions) add(q.a, voice);
    const prefix = PREFIX[job.lesson];
    if (prefix)
      for (const [code, note] of Object.entries(COMEBACK_NOTES)) if (code.startsWith(prefix)) add(note, voice);
  }
  return [...out.values()];
}
