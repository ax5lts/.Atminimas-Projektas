import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import { signedMedia } from "./index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ownerId = "11111111-1111-4111-8111-111111111111";
const profileId = "test-profile";
const photoPath = `${ownerId}/${profileId}/photo-1.webp`;
const secondPath = `${ownerId}/${profileId}/photo-2.jpg`;
const media = [
  {
    type: "image",
    path: photoPath,
    order: 2,
    alt: "Nuotrauka",
    caption: "Prisiminimas",
  },
  { type: "image", path: secondPath, order: 1 },
];

function mockClient(
  respond: (body: { paths: string[]; expiresIn: number }) => Response,
) {
  const requests: Array<{ paths: string[]; expiresIn: number }> = [];
  const client = createClient("https://test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        requests.push(body);
        return respond(body);
      },
    },
  });
  return { client, requests };
}

Deno.test("profile media signs all unique paths once and preserves original metadata", async () => {
  const { client, requests } = mockClient(({ paths }) =>
    Response.json(
      // Matching by path must work independently of upstream response order.
      [...paths].reverse().map((path) => ({
        path,
        error: null,
        signedURL: `/object/sign/atminimas/${path}?token=test`,
      })),
    )
  );
  const result = await signedMedia(
    client,
    [...media, media[0]],
    ownerId,
    profileId,
    false,
  );
  assert(requests.length === 1, "profile media should use one Storage request");
  assert(
    requests[0].paths.length === 2,
    "duplicate paths should only be signed once",
  );
  assert(
    requests[0].expiresIn === 3600,
    "signed URL lifetime must be preserved",
  );
  assert(
    result.length === 3,
    "existing media metadata entries should be preserved",
  );
  assert(
    result[0]?.order === 2 && result[1]?.order === 1,
    "original media order should be preserved",
  );
  assert(
    result[0]?.alt === "Nuotrauka" && result[0]?.caption === "Prisiminimas",
    "descriptions must be preserved",
  );
  assert(
    result[0] && "url" in result[0] && result[0].url?.includes(photoPath),
    "signed URL must match its media path",
  );
  assert(
    result.every((item) => item && !("path" in item)),
    "public results must not expose private storage paths",
  );
});

Deno.test("profile media drops invalid legacy entries before accessing or signing paths", async () => {
  const { client, requests } = mockClient(({ paths }) =>
    Response.json(
      paths.map((path) => ({
        path,
        error: null,
        signedURL: `/object/sign/atminimas/${path}?token=test`,
      })),
    )
  );
  const result = await signedMedia(
    client,
    [
      null,
      false,
      [],
      "invalid",
      {},
      { type: "image", path: `other/${profileId}/photo-1.webp` },
      ...media,
    ],
    ownerId,
    profileId,
    true,
  );
  assert(
    result.length === 2,
    "malformed rows should not prevent valid media from loading",
  );
  assert(
    requests[0].paths.length === 2,
    "invalid or unauthorized paths must never be signed",
  );
  assert(
    result[0]?.path === photoPath,
    "managers should retain paths for editing",
  );
  const empty = await signedMedia(
    client,
    [null, {}, []],
    ownerId,
    profileId,
    false,
  );
  assert(
    empty.length === 0 && requests.length === 1,
    "empty media should skip Storage entirely",
  );
});

Deno.test("profile media isolates per-file signing failures for visitors and managers", async () => {
  const { client } = mockClient(() =>
    Response.json([
      {
        path: photoPath,
        error: null,
        signedURL: `/object/sign/atminimas/${photoPath}?token=test`,
      },
      { path: secondPath, error: "Object not found", signedURL: null },
    ])
  );
  const publicMedia = await signedMedia(
    client,
    media,
    ownerId,
    profileId,
    false,
  );
  assert(
    publicMedia.length === 1,
    "visitors should retain the available image",
  );
  const managedMedia = await signedMedia(
    client,
    media,
    ownerId,
    profileId,
    true,
  );
  assert(
    managedMedia.length === 2,
    "managers should retain unavailable entries for repair",
  );
  assert(
    managedMedia[1] && "unavailable" in managedMedia[1] &&
      managedMedia[1].unavailable === true &&
      managedMedia[1]?.path === secondPath,
    "unavailable entry needs its original path",
  );
});

Deno.test("profile media handles a batch failure without exposing paths to visitors", async () => {
  const { client } = mockClient(() =>
    Response.json({ message: "Storage unavailable" }, { status: 503 })
  );
  const publicMedia = await signedMedia(
    client,
    media,
    ownerId,
    profileId,
    false,
  );
  assert(publicMedia.length === 0, "visitors should receive no unsigned media");
  const managedMedia = await signedMedia(
    client,
    media,
    ownerId,
    profileId,
    true,
  );
  assert(
    managedMedia.length === 2 &&
      managedMedia.every((item) =>
        item && "unavailable" in item && item.unavailable
      ),
    "managers should retain repairable entries",
  );
});
