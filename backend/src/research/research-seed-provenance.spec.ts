import { firstKnownContributorSourceIdForSeed } from '../../scripts/seed-data';

describe('seed research submitter provenance', () => {
  it('selects first registered contributor in source order', () => {
    expect(
      firstKnownContributorSourceIdForSeed(
        ['unknown-first', 'registered-second', 'registered-third'],
        new Set(['registered-second', 'registered-third']),
      ),
    ).toBe('registered-second');
  });

  it('returns null when no contributor is registered', () => {
    expect(
      firstKnownContributorSourceIdForSeed(
        ['unknown-first', 'unknown-second'],
        new Set(['registered-person']),
      ),
    ).toBeNull();
  });
});
