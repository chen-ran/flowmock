// Writes examples/demo-corpus.generated.ndjson: the test fixtures as a
// portable corpus, so FlowMock can be tried without any upstream access.
//
//   pnpm --filter @flowmock/server run generate:demo-corpus

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { startTestServer } from '../__tests__/support/flowmock.ts';
import { seedFixture } from '../__tests__/support/seed.ts';
import { ALL_FIXTURES } from '@flowmock/test-fixtures';

const output = fileURLToPath(new URL('../../../examples/demo-corpus.generated.ndjson', import.meta.url));

const server = await startTestServer();
try {
  for (const fixture of ALL_FIXTURES) await seedFixture(server.services, fixture);
  await writeFile(output, await (await server.admin('/export')).text());
  console.log(`wrote ${ALL_FIXTURES.length} recordings to ${output}`);
} finally {
  await server.stop();
}
