import { chmod, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import webPush from 'web-push';

const envPath = new URL('../.env', import.meta.url);
const source = await readFile(envPath, 'utf8');
const env = parse(source);
const publicKey = env.VAPID_PUBLIC_KEY?.trim();
const privateKey = env.VAPID_PRIVATE_KEY?.trim();

if (Boolean(publicKey) !== Boolean(privateKey)) {
  throw new Error('Configure both VAPID keys together before continuing.');
}

// Reuse existing keys: rotating them invalidates browser subscriptions.
const keys =
  publicKey && privateKey
    ? { publicKey, privateKey }
    : webPush.generateVAPIDKeys();
const email = env.PUBLIC_SITE_EMAIL || env.ADMIN_EMAIL;
const subject = env.VAPID_SUBJECT?.trim() || (email ? `mailto:${email}` : '');
if (!subject) throw new Error('Set VAPID_SUBJECT or a site/admin email first.');
webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

const settings = {
  VAPID_PUBLIC_KEY: keys.publicKey,
  VAPID_PRIVATE_KEY: keys.privateKey,
  VAPID_SUBJECT: subject,
};
let updated = source;
for (const [name, value] of Object.entries(settings)) {
  const line = `${name}=${JSON.stringify(value)}`;
  const pattern = new RegExp(`^(?:export\\s+)?${name}\\s*=.*$`, 'm');
  updated = pattern.test(updated)
    ? updated.replace(pattern, () => line)
    : `${updated.trimEnd()}\n${line}\n`;
}
await chmod(envPath, 0o600);
await writeFile(envPath, updated);
console.log(
  'Browser push configured in backend/.env. VAPID keys were not printed.',
);
