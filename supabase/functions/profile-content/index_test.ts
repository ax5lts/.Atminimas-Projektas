import { createClient } from "npm:@supabase/supabase-js@2.110.1";
import { handleRequest, signedMedia } from "./index.ts";

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

function contentFixture(options: {
  protectedPage?: boolean;
  decision?: string;
  children?: Record<string, unknown>[];
  user?: boolean;
} = {}) {
  const calls: Array<{ url: URL; body: Record<string, unknown> }> = [];
  const profile = {
    id: profileId,
    owner_id: ownerId,
    vardas: "Privatus vardas",
    aktyvus: true,
    deleted_at: null,
    media_json: media,
    access_code_protected: options.protectedPage === true,
    group_members: (options.children || []).map((child) => child.id),
  };
  const client = createClient("https://test.invalid", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (rawUrl, init) => {
        const url = new URL(String(rawUrl));
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        calls.push({ url, body });
        if (url.pathname === "/auth/v1/user") {
          return Response.json({ id: ownerId, factors: [] });
        }
        if (url.pathname === "/rest/v1/user_roles") {
          return Response.json([]);
        }
        if (url.pathname === "/rest/v1/profiliai") {
          return Response.json(
            url.searchParams.get("id")?.startsWith("in.")
              ? options.children || []
              : profile,
          );
        }
        if (
          url.pathname === "/rest/v1/rpc/verify_memorial_access_code"
        ) return Response.json(options.decision || "invalid");
        if (url.pathname === "/storage/v1/object/sign/atminimas") {
          return Response.json(
            (body.paths as string[]).map((path) => ({
              path,
              error: null,
              signedURL: `/object/sign/atminimas/${path}?token=test`,
            })),
          );
        }
        throw new Error(`Unexpected fixture request: ${url.pathname}`);
      },
    },
  });
  const request = (
    code?: string,
    headers: Record<string, string> = { "cf-connecting-ip": "198.51.100.2" },
  ) =>
    new Request(
      `https://edge.invalid/profile-content${
        code === undefined ? `?profile_id=${profileId}` : ""
      }`,
      {
        method: code === undefined ? "GET" : "POST",
        headers: {
          ...(options.user ? { authorization: "Bearer verified-owner" } : {}),
          ...headers,
        },
        ...(code === undefined ? {} : {
          body: JSON.stringify({ profile_id: profileId, access_code: code }),
        }),
      },
    );
  return { client, calls, request };
}

Deno.test("protected profile GET reveals no content or signed media, including codes in URLs", async () => {
  const fixture = contentFixture({ protectedPage: true });
  const response = await handleRequest(
    new Request(
      `https://edge.invalid/profile-content?profile_id=${profileId}&access_code=58371`,
    ),
    fixture.client,
  );
  assert(response.status === 403, "a code in a URL must never unlock content");
  const result = await response.json();
  assert(
    result.code === "access_code_required" && !result.atminimas &&
      !result.members,
    "locked response must contain no profile or group metadata",
  );
  assert(
    fixture.calls.length === 1,
    "locked response must not query children, verify URL codes, or sign files",
  );
});

Deno.test("only a granted server decision unlocks a protected profile", async () => {
  for (
    const [decision, status] of [
      ["invalid", 403],
      ["rate_limited", 429],
      ["not_protected", 403],
      ["not_found", 403],
      ["granted", 200],
    ] as const
  ) {
    const fixture = contentFixture({ protectedPage: true, decision });
    const response = await handleRequest(
      fixture.request("58371"),
      fixture.client,
    );
    assert(response.status === status, `unexpected status for ${decision}`);
    const verification = fixture.calls.find((call) =>
      call.url.pathname.endsWith("/verify_memorial_access_code")
    );
    assert(
      verification?.body.p_profile_id === profileId &&
        verification?.body.p_access_code === "58371",
      "verification must use the server-only RPC",
    );
    assert(
      /^[a-f0-9]{64}$/.test(String(verification?.body.p_attempt_key)),
      "limiter key must be a stable hash",
    );
    const storageCalls = fixture.calls.filter((call) =>
      call.url.pathname.startsWith("/storage/")
    );
    assert(
      storageCalls.length === (decision === "granted" ? 1 : 0),
      "denied requests must never sign private files",
    );
    if (decision === "rate_limited") {
      assert(
        response.headers.get("retry-after") === "900",
        "lockout should explain the retry interval",
      );
    }
    if (decision === "granted") {
      const result = await response.json();
      assert(
        result.atminimas.vardas === "Privatus vardas" &&
          result.access_code_protected,
        "successful unlock must preserve the protection flag",
      );
      assert(
        !JSON.stringify(result).includes("58371"),
        "responses must not echo access codes",
      );
    }
  }
});

Deno.test("code verification fails closed without a trusted client address", async () => {
  const fixture = contentFixture({ protectedPage: true, decision: "granted" });
  const response = await handleRequest(
    fixture.request("58371", {
      "x-forwarded-for": "198.51.100.9",
      "x-real-ip": "198.51.100.8",
    }),
    fixture.client,
  );
  assert(
    response.status === 503,
    "untrusted forwarding headers must not create limiter identities",
  );
  assert(
    fixture.calls.length === 1,
    "verification and signing must not run without a trusted address",
  );
});

Deno.test("group responses omit separately protected children without removing normal unpublished members", async () => {
  const children = [
    {
      id: "child-public",
      owner_id: ownerId,
      vardas: "Visible child",
      aktyvus: false,
      access_code_protected: false,
      media_json: [{
        type: "image",
        path: `${ownerId}/child-public/photo-1.jpg`,
      }],
    },
    {
      id: "child-private",
      owner_id: ownerId,
      vardas: "Hidden child",
      access_code_protected: true,
      media_json: [{
        type: "image",
        path: `${ownerId}/child-private/photo-1.jpg`,
      }],
    },
  ];
  const fixture = contentFixture({ children });
  const response = await handleRequest(fixture.request(), fixture.client);
  const result = await response.json();
  assert(
    response.status === 200 && result.members.length === 1 &&
      result.members[0].id === "child-public",
    "group membership must not bypass a child's own access code",
  );
  assert(
    !JSON.stringify(result).includes("Hidden child"),
    "protected child metadata must be omitted",
  );
  assert(
    !fixture.calls.some((call) =>
      JSON.stringify(call.body.paths || []).includes("child-private")
    ),
    "protected child files must never be signed",
  );
});

Deno.test("verified owners retain access to protected profiles without submitting a code", async () => {
  const fixture = contentFixture({ protectedPage: true, user: true });
  const response = await handleRequest(fixture.request(), fixture.client);
  const result = await response.json();
  assert(
    response.status === 200 && result.can_manage,
    "owners must retain their editing access",
  );
  assert(
    !fixture.calls.some((call) =>
      call.url.pathname.endsWith("/verify_memorial_access_code")
    ),
    "owners must not consume public code attempts",
  );
});

Deno.test("access-code POST bodies are bounded before database access", async () => {
  const fixture = contentFixture({ protectedPage: true });
  const response = await handleRequest(
    new Request("https://edge.invalid/profile-content", {
      method: "POST",
      body: JSON.stringify({
        profile_id: profileId,
        access_code: "5".repeat(3000),
      }),
    }),
    fixture.client,
  );
  assert(
    response.status === 413 && fixture.calls.length === 0,
    "oversized code requests must be rejected before database access",
  );
});
