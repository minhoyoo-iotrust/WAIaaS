import type { Messages } from './en.js';
import { messages as en } from './en.js';
import { messages as ko } from './ko.js';

export type SupportedLocale = 'en' | 'ko';

const localeMap: Record<SupportedLocale, Messages> = { en, ko };

export function getMessages(locale: SupportedLocale = 'en'): Messages {
  return localeMap[locale] ?? en;
}

export type { Messages };
