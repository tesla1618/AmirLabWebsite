import { BadRequestException } from '@nestjs/common';
import {
  PersonLinkType,
  PersonSectionType,
} from '../../generated/prisma/enums';
import { parseProfilePayload, profilePayloadToJson } from './profile-payload';

const profile = {
  fullName: 'Jane Researcher',
  headline: 'Research Assistant',
  biography: 'Works on machine learning systems.',
  phone: null,
  contactAddress: null,
  expertise: ['Machine learning'],
  links: [
    {
      type: PersonLinkType.WEBSITE,
      label: 'Website',
      url: 'https://example.org/profile',
    },
  ],
  sections: [
    {
      type: PersonSectionType.ACADEMIC_BACKGROUND,
      title: 'Education',
      subsections: [
        {
          heading: 'Degrees',
          entries: [{ label: 'Degree', content: 'B.Sc. in Computer Science' }],
        },
      ],
    },
  ],
};

describe('parseProfilePayload', () => {
  it('normalizes editable profile fields and keeps image intent separate', () => {
    expect(parseProfilePayload(JSON.stringify(profile), true)).toEqual({
      ...profile,
      links: [{ ...profile.links[0], url: 'https://example.org/profile' }],
      removeAvatar: true,
    });
  });

  it('normalizes legacy string profile entries to labeled entry records', () => {
    const legacy = {
      ...profile,
      sections: [
        {
          ...profile.sections[0],
          subsections: [{ heading: null, entries: ['Legacy profile detail'] }],
        },
      ],
    };
    expect(
      parseProfilePayload(legacy).sections[0].subsections[0].entries,
    ).toEqual([{ label: null, content: 'Legacy profile detail' }]);
  });

  it('round-trips the internal removal flag for reviewer approval', () => {
    expect(parseProfilePayload({ ...profile, removeAvatar: true })).toEqual({
      ...profile,
      links: [{ ...profile.links[0], url: 'https://example.org/profile' }],
      removeAvatar: true,
    });
  });

  it('rejects rank and role overposting', () => {
    expect(() =>
      parseProfilePayload(JSON.stringify({ ...profile, rank: 'ADVISOR' })),
    ).toThrow(BadRequestException);
    expect(() =>
      parseProfilePayload(
        JSON.stringify({ ...profile, roleTitle: 'Principal Investigator' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts public role titles only for admin profile updates', () => {
    expect(
      parseProfilePayload(
        JSON.stringify({ ...profile, roleTitle: 'Principal Investigator' }),
        false,
        { adminFields: true },
      ).roleTitle,
    ).toBe('Principal Investigator');
  });

  it('accepts only contact identity fields for moderator profiles', () => {
    expect(
      parseProfilePayload(
        JSON.stringify({
          contactAddress: 'Lab office',
          fullName: 'Lab Moderator',
          phone: '+880 1000 000000',
          roleTitle: 'Operations Moderator',
        }),
        false,
        { scope: 'MODERATOR' },
      ),
    ).toEqual({
      biography: null,
      contactAddress: 'Lab office',
      expertise: [],
      fullName: 'Lab Moderator',
      headline: null,
      links: [],
      phone: '+880 1000 000000',
      removeAvatar: false,
      roleTitle: 'Operations Moderator',
      sections: [],
    });
  });

  it('round-trips moderator avatar removal for review storage', () => {
    expect(
      parseProfilePayload(
        {
          fullName: 'Lab Moderator',
          removeAvatar: true,
        },
        false,
        { scope: 'MODERATOR' },
      ).removeAvatar,
    ).toBe(true);
  });

  it('rejects researcher-only fields for moderator profiles', () => {
    expect(() =>
      parseProfilePayload(
        JSON.stringify({
          fullName: 'Lab Moderator',
          expertise: ['Machine learning'],
        }),
        false,
        { scope: 'MODERATOR' },
      ),
    ).toThrow('profile.expertise cannot be edited');
  });

  it('accepts shared staff fields for administrator profiles', () => {
    expect(
      parseProfilePayload(
        JSON.stringify({
          contactAddress: 'Admin office',
          fullName: 'Administrator',
          phone: '+880 1000 000000',
          roleTitle: 'Lab Director',
        }),
        true,
        { scope: 'ADMIN' },
      ),
    ).toEqual(
      expect.objectContaining({
        contactAddress: 'Admin office',
        fullName: 'Administrator',
        phone: '+880 1000 000000',
        removeAvatar: true,
        roleTitle: 'Lab Director',
      }),
    );
    expect(() =>
      parseProfilePayload(
        JSON.stringify({
          fullName: 'Administrator',
          expertise: ['Operations'],
        }),
        false,
        { scope: 'ADMIN' },
      ),
    ).toThrow('profile.expertise cannot be edited');
  });

  describe.each(['ADMIN', 'MODERATOR'] as const)(
    '%s stored staff drafts',
    (scope) => {
      it('round-trips normalized fields and avatar intent for approval', () => {
        const payload = parseProfilePayload(
          JSON.stringify({ fullName: 'Staff Member', roleTitle: 'Operations' }),
          true,
          { scope },
        );
        expect(
          parseProfilePayload(profilePayloadToJson(payload), false, { scope }),
        ).toEqual(payload);
      });

      it.each([
        ['biography', null, 'Research biography'],
        ['headline', null, 'Research headline'],
        ['expertise', [], ['Research']],
        ['links', [], [{}]],
        ['sections', [], [{}]],
      ])(
        'rejects submitted and nonempty stored %s',
        (key, empty, populated) => {
          expect(() =>
            parseProfilePayload(
              JSON.stringify({ fullName: 'Staff Member', [key]: empty }),
              false,
              { scope },
            ),
          ).toThrow(BadRequestException);
          expect(() =>
            parseProfilePayload(
              { fullName: 'Staff Member', [key]: populated },
              false,
              { scope },
            ),
          ).toThrow(BadRequestException);
        },
      );
    },
  );

  it('rejects executable or non-web profile links', () => {
    expect(() =>
      parseProfilePayload(
        JSON.stringify({
          ...profile,
          links: [
            {
              type: PersonLinkType.WEBSITE,
              label: 'Unsafe',
              url: 'javascript:alert(1)',
            },
          ],
        }),
      ),
    ).toThrow('must use HTTP or HTTPS');
  });
});
