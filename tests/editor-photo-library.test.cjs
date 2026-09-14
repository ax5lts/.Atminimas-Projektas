const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');

test('mixed gallery uploads only new photos, preserves order, and clears the last photo', async () => {
  const requests = [];
  const window = { crypto: webcrypto,
    ATMINIMAS_CONFIG: { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test' },
    AtminimasAuth: { userId: () => 'owner', accessToken: () => 'token' } };
  vm.runInNewContext(fs.readFileSync('assets/atminimas-duomenys.js', 'utf8'), {
    window, URLSearchParams, fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({}) };
    }
  });
  const old = { type: 'image', order: 1, path: 'owner/person/photo-1.jpg' };
  const video = { type: 'video', path: 'owner/person/video.mp4' };
  const input = { vardas: 'Test', photo_caption_1: 'Kept caption' };
  const first = await window.AtminimasApi.updateAtminimas('person', input, {
    existingMedia: [old, video], photoItems: [{ media: old }, { file: { name: 'new.webp', type: 'image/webp' } }]
  });
  const uploads = requests.filter(r => r.url.includes('/storage/'));
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].options.headers['x-upsert'], 'false');
  assert.match(first.media[1].path, /^owner\/person\/photo-2-[a-f0-9]{32}\.webp$/);
  assert.equal(first.media[0].path, old.path);
  requests.length = 0;
  const second = await window.AtminimasApi.updateAtminimas('person', input, {
    existingMedia: first.media, photoItems: [{ media: first.media[1] }, { media: old }]
  });
  assert.equal(requests.length, 1, 'reordering sends metadata only');
  assert.equal(second.media[0].order, 1);
  assert.equal(second.media[0].path, first.media[1].path);
  const empty = await window.AtminimasApi.updateAtminimas('person', input, {
    existingMedia: second.media, photoItems: []
  });
  assert.equal(empty.media.length, 1);
  assert.equal(empty.media[0].type, 'video');
});
