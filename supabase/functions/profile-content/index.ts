import {
  adminClient,
  handleOptions,
  json,
  readJson,
  RequestError,
  safeProfileLayout,
  safeStoryBlocks,
  sessionNeedsMfa,
} from "../_shared/core.ts";
import { trustedClientIp } from "../_shared/request-ip.ts";

// Nauji kodai kuriami mažosiomis raidėmis, tačiau seni įrašai gali turėti
// didžiųjų raidžių. Juos priimame skaitymui, kad anksčiau pagaminti QR veiktų.
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_TYPES = new Set(["image", "video", "captions"]);
const MEDIA_FILE_PATTERNS: Record<string, RegExp> = {
  image: /^photo-[1-8](?:-[0-9a-f]{32})?\.(?:jpg|jpeg|png|webp)$/,
  video: /^video\.(?:mp4|mov)$/,
  captions: /^captions\.vtt$/,
};

type MediaItem = {
  type?: unknown;
  path?: unknown;
  alt?: unknown;
  caption?: unknown;
  language?: unknown;
  order?: unknown;
};

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function safePath(
  raw: unknown,
  ownerId: string | null,
  profileId: string,
  mediaType: string,
) {
  const path = String(raw || "").trim();
  const parts = path.split("/");
  if (
    !path ||
    path.length > 700 ||
    path.includes("\\") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) return "";
  if (ownerId) {
    if (
      parts.length !== 3 ||
      parts[0] !== ownerId ||
      parts[1] !== profileId ||
      !MEDIA_FILE_PATTERNS[mediaType]?.test(parts[2])
    ) return "";
  } else if (
    parts.length !== 2 ||
    parts[0] !== profileId ||
    UUID_PATTERN.test(parts[0]) ||
    mediaType !== "image" ||
    !MEDIA_FILE_PATTERNS.image.test(parts[1])
  ) {
    return "";
  }
  return path;
}

async function optionalUser(
  client: ReturnType<typeof adminClient>,
  request: Request,
) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  return error || !data.user || await sessionNeedsMfa(client, token, data.user)
    ? null
    : data.user;
}

async function accessAttemptKey(request: Request, profileId: string) {
  const address = trustedClientIp(request);
  if (!address) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `memorial-access|${profileId}|${address}`,
    ),
  );
  return Array.from(
    new Uint8Array(digest),
    (part) => part.toString(16).padStart(2, "0"),
  ).join("");
}

async function isAdmin(client: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function signedMedia(
  client: ReturnType<typeof adminClient>,
  value: unknown,
  ownerId: string | null,
  profileId: string,
  includePath: boolean,
) {
  if (!Array.isArray(value)) return [];
  const candidates = value.slice(0, 10).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as MediaItem;
    const type = cleanText(item.type, 20);
    const path = safePath(item.path, ownerId, profileId, type);
    if (!MEDIA_TYPES.has(type) || !path) return [];
    return [{
      type,
      path,
      alt: cleanText(item.alt, 180),
      caption: cleanText(item.caption, 240) || null,
      language: cleanText(item.language, 12) || undefined,
      order: Number.isFinite(Number(item.order))
        ? Math.min(10, Math.max(1, Math.trunc(Number(item.order))))
        : 1,
    }];
  });

  if (!candidates.length) return [];
  const paths = [...new Set(candidates.map((item) => item.path))];
  const { data, error } = await client.storage.from("atminimas")
    .createSignedUrls(paths, 3600);
  const byPath = new Map((data || []).map((item) => [item.path, item]));
  const signed = candidates.map((item) => {
    const result = byPath.get(item.path);
    if (error || result?.error || !result?.signedUrl) {
      console.error("profile-content signing failed", {
        profileId,
        path: item.path,
        error: error || result?.error || "Missing signed URL",
      });
      if (!includePath) return null;
      return {
        type: item.type,
        path: item.path,
        ...(item.alt ? { alt: item.alt } : {}),
        ...(item.caption ? { caption: item.caption } : {}),
        ...(item.language ? { language: item.language } : {}),
        order: item.order,
        unavailable: true,
      };
    }
    return {
      type: item.type,
      url: result.signedUrl,
      ...(includePath ? { path: item.path } : {}),
      ...(item.alt ? { alt: item.alt } : {}),
      ...(item.caption ? { caption: item.caption } : {}),
      ...(item.language ? { language: item.language } : {}),
      order: item.order,
    };
  });
  return signed.filter(Boolean);
}

export async function handleRequest(
  request: Request,
  providedClient?: ReturnType<typeof adminClient>,
) {
  const options = handleOptions(request);
  if (options) return options;
  if (!["GET", "POST"].includes(request.method)) {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // Codes are accepted only in a bounded JSON body, never in a shareable URL.
    const body = request.method === "POST"
      ? await readJson(request, 2_000)
      : {};
    const profileId = cleanText(
      request.method === "POST"
        ? body.profile_id
        : new URL(request.url).searchParams.get("profile_id"),
      100,
    );
    if (!PROFILE_ID_PATTERN.test(profileId)) {
      return json({ error: "Atminimo puslapis nerastas" }, 404);
    }
    const client = providedClient || adminClient();
    const { data: profile, error } = await client
      .from("profiliai")
      .select(
        "id,owner_id,vardas,pavarde,gimimo_data,mirties_data,epitafija,tekstas_200,story_blocks_json,layout_json,media_json,aktyvus,deleted_at,group_members,access_code_protected",
      )
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw error;
    if (!profile || profile.deleted_at) {
      return json({ error: "Atminimo puslapis nerastas" }, 404);
    }

    const user = await optionalUser(client, request);
    const ownerId = profile.owner_id ? String(profile.owner_id) : null;
    const owner = Boolean(user && ownerId && user.id === ownerId);
    const admin = Boolean(user && !owner && await isAdmin(client, user.id));
    const canManage = owner || admin;
    if (!profile.aktyvus && !canManage) {
      return json({ error: "Atminimo puslapis nerastas" }, 404);
    }

    if (profile.access_code_protected && !canManage) {
      const accessCode = typeof body.access_code === "string"
        ? body.access_code
        : "";
      if (request.method !== "POST" || !accessCode) {
        return json({
          error: "Šis atminimo puslapis apsaugotas prieigos kodu.",
          code: "access_code_required",
        }, 403);
      }
      if (!/^[0-9]{5,6}$/.test(accessCode)) {
        return json({
          error: "Neteisingas prieigos kodas.",
          code: "access_code_invalid",
        }, 403);
      }
      const attemptKey = await accessAttemptKey(request, profileId);
      if (!attemptKey) {
        return json({
          error: "Šiuo metu kodo patikrinti nepavyko. Bandykite vėliau.",
          code: "access_code_unavailable",
        }, 503);
      }
      const { data: decision, error: verificationError } = await client.rpc(
        "verify_memorial_access_code",
        {
          p_profile_id: profileId,
          p_access_code: accessCode,
          p_attempt_key: attemptKey,
        },
      );
      if (verificationError) throw verificationError;
      if (decision === "rate_limited") {
        return json(
          {
            error: "Per daug bandymų. Bandykite po 15 minučių.",
            code: "access_code_rate_limited",
          },
          429,
          { "Retry-After": "900" },
        );
      }
      if (decision !== "granted") {
        return json({
          error: "Neteisingas arba nebegaliojantis prieigos kodas.",
          code: "access_code_invalid",
        }, 403);
      }
    }

    const media = await signedMedia(
      client,
      profile.media_json,
      ownerId,
      profileId,
      canManage,
    );
    const members: Record<string, unknown>[] = [];
    if (
      Array.isArray(profile.group_members) && profile.group_members.length &&
      ownerId
    ) {
      const { data: children, error: childrenError } = await client.from(
        "profiliai",
      )
        .select(
          "id,owner_id,vardas,pavarde,gimimo_data,mirties_data,epitafija,tekstas_200,story_blocks_json,layout_json,media_json,deleted_at,access_code_protected",
        )
        .in("id", profile.group_members.slice(0, 7)).eq("owner_id", ownerId).is(
          "deleted_at",
          null,
        );
      if (childrenError) throw childrenError;
      for (const id of profile.group_members.slice(0, 7)) {
        const child = children?.find((item) => item.id === id);
        // A group does not override an individual member's separate code.
        if (!child || (child.access_code_protected && !canManage)) continue;
        members.push({
          id: child.id,
          vardas: child.vardas,
          pavarde: child.pavarde,
          gimimo_data: child.gimimo_data,
          mirties_data: child.mirties_data,
          epitafija: child.epitafija,
          tekstas_200: child.tekstas_200,
          story_blocks_json: safeStoryBlocks(child.story_blocks_json),
          layout_json: safeProfileLayout(child.layout_json),
          media_json: await signedMedia(
            client,
            child.media_json,
            ownerId,
            child.id,
            canManage,
          ),
        });
      }
    }
    return json({
      members,
      is_public: profile.aktyvus === true,
      access_code_protected: profile.access_code_protected === true,
      atminimas: {
        id: profile.id,
        vardas: profile.vardas,
        pavarde: profile.pavarde,
        gimimo_data: profile.gimimo_data,
        mirties_data: profile.mirties_data,
        epitafija: profile.epitafija,
        tekstas_200: profile.tekstas_200,
        story_blocks_json: safeStoryBlocks(profile.story_blocks_json),
        layout_json: safeProfileLayout(profile.layout_json),
        media_json: media,
      },
      can_manage: canManage,
    });
  } catch (error) {
    if (error instanceof RequestError) {
      return json({ error: error.message }, error.status);
    }
    console.error("profile-content failed", error);
    return json({ error: "Atminimo puslapio įkelti nepavyko" }, 500);
  }
}

if (import.meta.main) Deno.serve((request) => handleRequest(request));
