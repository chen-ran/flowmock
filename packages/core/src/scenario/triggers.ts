import type { FaultRule, Trigger } from './schema.ts';
import { globMatches } from '../glob.ts';
import type { Rng } from '../random.ts';
import type { Protocol } from '@flowmock/protocols/common';

export interface TriggerContext {
  // 1-based call number inside the session.
  callIndex: number;
  protocol: Protocol;
  model: string | null;
  stream: boolean;
  hasTools: boolean;
  // Milliseconds since the scenario's epoch.
  elapsedMs: number;
}

const callIndexMatches = (rule: NonNullable<Trigger['callIndex']>, callIndex: number): boolean => {
  if (typeof rule === 'number') return callIndex === rule;
  if (Array.isArray(rule)) return rule.includes(callIndex);
  return (rule.from === undefined || callIndex >= rule.from) && (rule.to === undefined || callIndex <= rule.to);
};

const windowMatches = (window: NonNullable<Trigger['window']>, elapsedMs: number): boolean => {
  const position = window.periodMs === undefined ? elapsedMs : elapsedMs % window.periodMs;
  return position >= window.startMs && position < window.endMs;
};

// Every condition present must hold. The probability draw comes last so a
// rule's random stream advances only when its deterministic conditions pass.
export const triggerMatches = (trigger: Trigger, context: TriggerContext, rng: Rng): boolean => {
  if (trigger.callIndex !== undefined && !callIndexMatches(trigger.callIndex, context.callIndex)) return false;
  if (trigger.everyN !== undefined && context.callIndex % trigger.everyN !== 0) return false;
  if (trigger.window !== undefined && !windowMatches(trigger.window, context.elapsedMs)) return false;
  if (trigger.model !== undefined && !globMatches(trigger.model, context.model)) return false;
  if (trigger.stream !== undefined && trigger.stream !== context.stream) return false;
  if (trigger.hasTools !== undefined && trigger.hasTools !== context.hasTools) return false;
  if (trigger.protocol !== undefined && trigger.protocol !== context.protocol) return false;
  if (trigger.probability !== undefined && !(rng.next() < trigger.probability)) return false;
  return true;
};

// The first rule whose trigger fires, with its index. One fault per request
// keeps a scenario's effect predictable.
export const firstTriggeredFault = (
  rules: readonly FaultRule[],
  context: TriggerContext,
  rngFor: (ruleIndex: number) => Rng,
): { rule: FaultRule; index: number } | null => {
  for (const [index, rule] of rules.entries()) {
    if (triggerMatches(rule.when, context, rngFor(index))) return { rule, index };
  }
  return null;
};
