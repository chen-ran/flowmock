import { z } from 'zod';

import type { Rng } from './random.ts';

// 95th percentile of the standard normal distribution.
const Z95 = 1.6448536269514722;

const nonNegative = z.number().nonnegative();

// A fixed number, or a named distribution. Normal and lognormal accept the
// p50/p95 parameterization that latency budgets are usually written in.
export const distributionSchema = z.union([
  nonNegative,
  z.object({ dist: z.literal('fixed'), value: nonNegative }).strict(),
  z.object({ dist: z.literal('uniform'), min: nonNegative, max: nonNegative }).strict()
    .refine(value => value.max >= value.min, { message: 'max must be >= min' }),
  z.object({ dist: z.literal('normal'), mean: nonNegative, sd: nonNegative }).strict(),
  z.object({ dist: z.literal('normal'), p50: nonNegative, p95: nonNegative }).strict()
    .refine(value => value.p95 >= value.p50, { message: 'p95 must be >= p50' }),
  z.object({ dist: z.literal('lognormal'), p50: z.number().positive(), p95: z.number().positive() }).strict()
    .refine(value => value.p95 >= value.p50, { message: 'p95 must be >= p50' }),
]);

export type Distribution = z.infer<typeof distributionSchema>;

export const sampleDistribution = (distribution: Distribution, rng: Rng, minimum = 0): number => {
  const value = (() => {
    if (typeof distribution === 'number') return distribution;
    switch (distribution.dist) {
    case 'fixed':
      return distribution.value;
    case 'uniform':
      return distribution.min + rng.next() * (distribution.max - distribution.min);
    case 'normal':
      return 'mean' in distribution
        ? distribution.mean + distribution.sd * rng.normal()
        : distribution.p50 + ((distribution.p95 - distribution.p50) / Z95) * rng.normal();
    case 'lognormal': {
      const mu = Math.log(distribution.p50);
      const sigma = (Math.log(distribution.p95) - mu) / Z95;
      return Math.exp(mu + sigma * rng.normal());
    }
    }
  })();
  return Math.max(minimum, value);
};

// The distribution's median, used when a plan is previewed without sampling.
export const distributionMedian = (distribution: Distribution): number => {
  if (typeof distribution === 'number') return distribution;
  switch (distribution.dist) {
  case 'fixed': return distribution.value;
  case 'uniform': return (distribution.min + distribution.max) / 2;
  case 'normal': return 'mean' in distribution ? distribution.mean : distribution.p50;
  case 'lognormal': return distribution.p50;
  }
};
