// Ported from Floway apps/web/src/i18n/translation.tsx (MIT). See NOTICE.md.
import type { i18n as I18n } from 'i18next';
import type { ComponentProps, ReactElement } from 'react';
import { Trans as I18nextTrans, useTranslation as useI18nextTranslation } from 'react-i18next';

import type { NumberFormat } from './number-format.ts';
import type { UiTranslation } from './resources.ts';

// React consumers reach react-i18next's hooks and component through this
// module; initialization remains in ./init.ts. alwaysFormat sends every
// interpolation through ./number-format.ts, which throws on a number that names
// no format. That throw happens during render, so a bare {{seconds}} handed a
// number takes the whole route down to the error boundary. react-i18next types
// interpolation values as unknown, so nothing before the browser could see it
// coming.
//
// Everything below derives what a key needs from the English strings
// themselves. An app's English locale is as const, so each string survives
// into the type system as a literal, and the placeholders in it are parsed
// there: a bare {{name}} takes a string, {{name, format}} takes a number, and
// the set of format names comes from ./number-format.ts's own table. Nothing
// here is maintained by hand, so a string and its call site cannot disagree.
//
// The catalogue is the app's English translation merged with this package's
// own ui namespace, which ./init.ts merges into every bundle the same way.
type Catalogue<AppTranslation> = AppTranslation & UiTranslation;

// The locale is a tree of nested objects; a key is the path to a string in it.
// Carrying the string alongside its key is what lets the map below recover it
// without walking the tree a second time.
type Leaf<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? { key: `${Prefix}${K}`; text: T[K] }
    : Leaf<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

// Flattening the union into one object type up front is what keeps this
// affordable: every later lookup is an indexed access into a resolved map
// rather than an Extract that re-scans a thousand-member union per call site.
type Texts<T> = { [E in Leaf<Catalogue<T>> as E extends { key: infer Key extends string } ? Key : never]: E extends { text: infer Text } ? Text : never };

// i18next resolves foo to foo_one / foo_other from count, so the base is a key
// the app may ask for even though no string is stored under it. The other form
// is the one every language has, and the parity check requires it, so it is the
// form the values are read from.
// https://www.unicode.org/reports/tr35/tr35-numbers.html#Language_Plural_Rules
type PluralBase<K> = K extends `${infer Base}_other` ? Base : never;

type PluralKey<T> = PluralBase<keyof Texts<T>>;

export type TranslationKey<AppTranslation = unknown> = keyof Texts<AppTranslation> | PluralKey<AppTranslation>;

// One entry per {{…}} in the string. The scan is left to right: the head
// swallows everything up to the first {{, the body runs to the first }}, and the
// tail is scanned again.
type Interpolations<S> = S extends `${string}{{${infer Body}}}${infer Rest}`
  ? Interpolation<Body> | Interpolations<Rest>
  : never;

type Interpolation<Body extends string> = Body extends `${infer Name}, ${infer Format}`
  ? { name: Name; value: Format extends NumberFormat ? number : never }
  : { name: Body; value: string };

type ValuesOf<S> = { [E in Interpolations<S> as E['name']]: E['value'] };

// Inferring the map first lets the lookup index a resolved type; indexing the
// generic mapped type directly is not provably safe to the checker.
type TextOf<T, K> = Texts<T> extends infer Map ? K extends keyof Map ? Map[K] : never : never;

type ValuesFor<T, K> = K extends keyof Texts<T>
  ? ValuesOf<TextOf<T, K>>
  : `${K & string}_other` extends keyof Texts<T>
    ? ValuesOf<TextOf<T, `${K & string}_other`>> & { count: number }
    : never;

// Schema and server messages can carry a key whose type is only string. Its
// resource and values are unknowable here, so that genuinely dynamic boundary
// remains permissive. A non-catalogue literal is still rejected as a typo.
type IsDynamicKey<K> = string extends K ? true : false;
type AcceptedKey<T, K extends string> = K extends TranslationKey<T>
  ? K
  : IsDynamicKey<K> extends true ? K : never;

type UnionToIntersection<U> = (
  U extends unknown ? (value: U) => void : never
) extends (value: infer I) => void ? I : never;

// A template key whose expression is a union of literals resolves to a union of
// keys, and the strings behind them need not agree on what they interpolate. A
// caller cannot correlate two separate function arguments, so the values
// object satisfies every possible member. A branch with no placeholders adds an
// empty object; incompatible requirements correctly make the call impossible
// until the caller narrows the key.
type ValuesArgument<T, K> = UnionToIntersection<K extends unknown ? ValuesFor<T, K> : never>;
type RequiresValues<T, K> = keyof ValuesArgument<T, K> extends never ? false : true;

// i18next also accepts a plain string second argument as the fallback text for
// a key with no string behind it. It is only offered where the key needs no
// values, since the two cannot be passed together.
type Arguments<T, K> = IsDynamicKey<K> extends true
  ? [values?: Record<string, unknown> | string]
  : RequiresValues<T, K> extends true
    ? [values: ValuesArgument<T, K>]
    : [values?: string];

export interface TFunction<AppTranslation = unknown> {
  <const K extends string>(key: AcceptedKey<AppTranslation, K>, ...values: Arguments<AppTranslation, K>): string;
}

type TransMemberValues<T, K> = K extends PluralKey<T> ? Omit<ValuesFor<T, K>, 'count'> : ValuesFor<T, K>;
type TransValuesArgument<T, K> = UnionToIntersection<K extends unknown ? TransMemberValues<T, K> : never>;
type TransValues<T, K> = keyof TransValuesArgument<T, K> extends never
  ? { values?: undefined }
  : { values: TransValuesArgument<T, K> };

type IsPlural<T, K> = K extends PluralKey<T> ? true : false;
type TransCount<T, K> = true extends (K extends unknown ? IsPlural<T, K> : never)
  ? { count: number }
  : { count?: never };

export type TransProps<AppTranslation, K extends TranslationKey<AppTranslation>> = {
  i18nKey: K;
  components?: ComponentProps<typeof I18nextTrans>['components'];
} & TransCount<AppTranslation, K> & TransValues<AppTranslation, K>;

// An app instantiates the boundary once with its own English translation type:
//
//   export const { useTranslation, Trans } = createTranslation<typeof en['translation']>();
//
// react-i18next types t from its own resource declarations, which nothing here
// registers; the two signatures describe the same runtime function and are not
// assignable in either direction.
export const createTranslation = <AppTranslation = unknown>() => ({
  useTranslation: (): { t: TFunction<AppTranslation>; i18n: I18n } => {
    const { t, i18n } = useI18nextTranslation();
    return { t: t as unknown as TFunction<AppTranslation>, i18n };
  },
  Trans: <const K extends TranslationKey<AppTranslation>>(props: TransProps<AppTranslation, K>): ReactElement =>
    <I18nextTrans {...props as unknown as ComponentProps<typeof I18nextTrans>} />,
});
