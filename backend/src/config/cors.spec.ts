import { isAllowedCorsOrigin } from './cors';

describe('isAllowedCorsOrigin', () => {
  const configuredOrigins = ['http://localhost:3000', 'https://amirlab.org'];

  it('allows configured origins', () => {
    expect(
      isAllowedCorsOrigin('http://localhost:3000', configuredOrigins),
    ).toBe(true);
  });

  it('allows HTTPS Vercel preview origins for this project', () => {
    expect(
      isAllowedCorsOrigin(
        'https://preview-branch-7f3a9c1e-itsfuads-projects.vercel.app',
        configuredOrigins,
      ),
    ).toBe(true);
  });

  it.each([
    'http://preview-branch-7f3a9c1e-itsfuads-projects.vercel.app',
    'https://itsfuads-projects.vercel.app',
    'https://preview-branch-7f3a9c1e-itsfuads-projects.vercel.app:8443',
    'https://preview-branch-7f3a9c1e-itsfuads-projects.vercel.app.evil.test',
  ])('rejects invalid preview origins: %s', (origin) => {
    expect(isAllowedCorsOrigin(origin, configuredOrigins)).toBe(false);
  });
});
