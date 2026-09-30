import { BadRequestException } from '@nestjs/common';
import {
  PersonLinkType,
  PersonSectionType,
} from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { ProfileEditPayload } from './dto/profile.dto';

const PROFILE_FIELDS = new Set([
  'fullName',
  'headline',
  'biography',
  'phone',
  'contactAddress',
  'expertise',
  'links',
  'sections',
  'removeAvatar',
]);
const ADMIN_PROFILE_FIELDS = new Set([...PROFILE_FIELDS, 'roleTitle']);
const STAFF_PROFILE_FIELDS = new Set([
  'fullName',
  'roleTitle',
  'phone',
  'contactAddress',
  'removeAvatar',
]);
export type ProfileEditScope = 'ADMIN' | 'RESEARCH' | 'MODERATOR';

export function parseProfilePayload(
  raw: unknown,
  removeAvatar = false,
  opts?: { adminFields?: boolean; scope?: ProfileEditScope },
): ProfileEditPayload {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new BadRequestException('profile must be valid JSON');
    }
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new BadRequestException('profile must be a JSON object');
  }

  const source = value as Record<string, unknown>;
  if (typeof raw === 'string' && 'removeAvatar' in source) {
    throw new BadRequestException(
      'Profile image removal must use the removeAvatar form field',
    );
  }
  const scope = opts?.scope ?? 'RESEARCH';
  const editableFields =
    scope === 'MODERATOR' || scope === 'ADMIN'
      ? STAFF_PROFILE_FIELDS
      : opts?.adminFields
        ? ADMIN_PROFILE_FIELDS
        : PROFILE_FIELDS;
  const unsupported = Object.keys(source).find((key) => {
    if (editableFields.has(key)) return false;
    // Stored drafts include empty research fields from profilePayloadToJson.
    // Accept only that normalized shape, never research fields in submissions.
    if (
      typeof raw !== 'string' &&
      (scope === 'MODERATOR' || scope === 'ADMIN')
    ) {
      if (key === 'biography' || key === 'headline')
        return source[key] !== null;
      if (key === 'expertise' || key === 'links' || key === 'sections') {
        const value = source[key];
        return !Array.isArray(value) || value.length !== 0;
      }
    }
    return true;
  });
  if (unsupported) {
    throw new BadRequestException(`profile.${unsupported} cannot be edited`);
  }

  if (scope === 'MODERATOR' || scope === 'ADMIN') {
    return {
      fullName: requiredText(source.fullName, 'fullName', 2, 120),
      headline: null,
      biography: null,
      roleTitle: optionalText(source.roleTitle, 'roleTitle', 200),
      phone: optionalText(source.phone, 'phone', 80),
      contactAddress: optionalText(
        source.contactAddress,
        'contactAddress',
        2_000,
      ),
      expertise: [],
      links: [],
      sections: [],
      removeAvatar:
        typeof raw === 'string' ? removeAvatar : source.removeAvatar === true,
    };
  }

  return {
    fullName: requiredText(source.fullName, 'fullName', 2, 120),
    headline: optionalText(source.headline, 'headline', 300),
    biography: optionalText(source.biography, 'biography', 8_000),
    phone: optionalText(source.phone, 'phone', 80),
    contactAddress: optionalText(
      source.contactAddress,
      'contactAddress',
      2_000,
    ),
    ...(opts?.adminFields
      ? { roleTitle: optionalText(source.roleTitle, 'roleTitle', 200) }
      : {}),
    expertise: stringArray(source.expertise, 'expertise', 20, 120),
    links: links(source.links),
    sections: sections(source.sections),
    removeAvatar:
      typeof raw === 'string' ? removeAvatar : source.removeAvatar === true,
  };
}

export function profilePayloadToJson(
  payload: ProfileEditPayload,
): Prisma.InputJsonObject {
  return {
    fullName: payload.fullName,
    headline: payload.headline,
    biography: payload.biography,
    phone: payload.phone,
    contactAddress: payload.contactAddress,
    ...(payload.roleTitle !== undefined
      ? { roleTitle: payload.roleTitle }
      : {}),
    expertise: payload.expertise,
    links: payload.links.map(({ label, type, url }) => ({ label, type, url })),
    sections: payload.sections.map(({ subsections, title, type }) => ({
      title,
      type,
      subsections: subsections.map(({ entries, heading }) => ({
        heading,
        entries: entries.map(({ content, label }) => ({ content, label })),
      })),
    })),
    removeAvatar: payload.removeAvatar,
  };
}

function requiredText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`profile.${field} must be text`);
  }
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) {
    throw new BadRequestException(
      `profile.${field} must be ${minimum}-${maximum} characters`,
    );
  }
  return result;
}

function optionalText(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`profile.${field} must be text or null`);
  }
  const result = value.trim();
  if (result.length > maximum) {
    throw new BadRequestException(
      `profile.${field} must not exceed ${maximum} characters`,
    );
  }
  return result || null;
}

function stringArray(
  value: unknown,
  field: string,
  maximumItems: number,
  maximumLength: number,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new BadRequestException(
      `profile.${field} must contain at most ${maximumItems} items`,
    );
  }
  return value.map((item, index) =>
    requiredText(item, `${field}[${index}]`, 1, maximumLength),
  );
}

function links(value: unknown): ProfileEditPayload['links'] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new BadRequestException(
      'profile.links must contain at most 20 items',
    );
  }
  return value.map((item, index) => {
    if (!item || Array.isArray(item) || typeof item !== 'object') {
      throw new BadRequestException(`profile.links[${index}] is invalid`);
    }
    const source = item as Record<string, unknown>;
    if (
      !Object.values(PersonLinkType).includes(source.type as PersonLinkType)
    ) {
      throw new BadRequestException(`profile.links[${index}].type is invalid`);
    }
    const url = requiredText(source.url, `links[${index}].url`, 1, 2_000);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`profile.links[${index}].url is invalid`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException(
        `profile.links[${index}].url must use HTTP or HTTPS`,
      );
    }
    return {
      type: source.type as PersonLinkType,
      label: requiredText(source.label, `links[${index}].label`, 1, 120),
      url: parsed.toString(),
    };
  });
}

function sections(value: unknown): ProfileEditPayload['sections'] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) {
    throw new BadRequestException(
      'profile.sections must contain at most 30 items',
    );
  }
  return value.map((item, index) => {
    if (!item || Array.isArray(item) || typeof item !== 'object') {
      throw new BadRequestException(`profile.sections[${index}] is invalid`);
    }
    const source = item as Record<string, unknown>;
    if (
      !Object.values(PersonSectionType).includes(
        source.type as PersonSectionType,
      )
    ) {
      throw new BadRequestException(
        `profile.sections[${index}].type is invalid`,
      );
    }
    return {
      type: source.type as PersonSectionType,
      title: requiredText(source.title, `sections[${index}].title`, 1, 160),
      subsections: subsections(
        source.subsections,
        `sections[${index}].subsections`,
      ),
    };
  });
}

function profileEntries(
  value: unknown,
  field: string,
): ProfileEditPayload['sections'][number]['subsections'][number]['entries'] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new BadRequestException(`${field} must contain at most 200 items`);
  }
  return value.map((item, index) => {
    // Legacy profile payloads and seed records used plain strings. Accept them
    // at the boundary and normalize them into the entry object shape.
    if (typeof item === 'string') {
      return {
        label: null,
        content: requiredText(item, `${field}[${index}].content`, 1, 20_000),
      };
    }
    if (!item || Array.isArray(item) || typeof item !== 'object') {
      throw new BadRequestException(`${field}[${index}] is invalid`);
    }
    const source = item as Record<string, unknown>;
    return {
      label: optionalText(source.label, `${field}[${index}].label`, 160),
      content: requiredText(
        source.content,
        `${field}[${index}].content`,
        1,
        20_000,
      ),
    };
  });
}

function subsections(
  value: unknown,
  field: string,
): ProfileEditPayload['sections'][number]['subsections'] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    throw new BadRequestException(`${field} must contain 1-30 items`);
  }
  return value.map((item, index) => {
    if (!item || Array.isArray(item) || typeof item !== 'object') {
      throw new BadRequestException(`${field}[${index}] is invalid`);
    }
    const source = item as Record<string, unknown>;
    const entries = profileEntries(
      source.entries,
      `${field}[${index}].entries`,
    );
    if (!entries.length) {
      throw new BadRequestException(`${field}[${index}].entries is required`);
    }
    return {
      heading: optionalText(source.heading, `${field}[${index}].heading`, 160),
      entries,
    };
  });
}
