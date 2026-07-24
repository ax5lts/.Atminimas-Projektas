import {
  adminClient,
  handleOptions,
  json,
  safeProfileLayout,
} from "../_shared/core.ts";

const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_TYPES = new Set(["image", "video", "captions"]);
const MEDIA_FILE_PATTERNS: Record<string, RegExp> = {
  image: /^photo-[1-8]\.(?:jpg|jpeg|png|webp)$/,
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
  return error ? null : data.user;
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

async function signedMedia(
  client: ReturnType<typeof adminClient>,
  value: unknown,
  ownerId: string | null,
  profileId: string,
  includePath: boolean,
) {
  if (!Array.isArray(value)) return [];
  const candidates = value.slice(0, 10).flatMap((raw) => {
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

  const signed = await Promise.all(candidates.map(async (item) => {
    const { data, error } = await client.storage.from("atminimas")
      .createSignedUrl(item.path, 3600);
    if (error || !data?.signedUrl) {
      console.error("profile-content signing failed", {
        profileId,
        path: item.path,
        error,
      });
      return null;
    }
    return {
      type: item.type,
      url: data.signedUrl,
      ...(includePath ? { path: item.path } : {}),
      ...(item.alt ? { alt: item.alt } : {}),
      ...(item.caption ? { caption: item.caption } : {}),
      ...(item.language ? { language: item.language } : {}),
      order: item.order,
    };
  }));
  return signed.filter(Boolean);
}

Deno.serve(async (request: Request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const profileId = cleanText(
    new URL(request.url).searchParams.get("profile_id"),
    100,
  );
  if (!PROFILE_ID_PATTERN.test(profileId)) {
    return json({ error: "Atminimo puslapis nerastas" }, 404);
  }

  try {
    const client = adminClient();
    const { data: profile, error } = await client
      .from("profiliai")
      .select(
        "id,owner_id,vardas,pavarde,gimimo_data,mirties_data,epitafija,tekstas_200,layout_json,media_json,aktyvus,deleted_at",
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

    const media = await signedMedia(
      client,
      profile.media_json,
      ownerId,
      profileId,
      canManage,
    );
    return json({
      atminimas: {
        id: profile.id,
        vardas: profile.vardas,
        pavarde: profile.pavarde,
        gimimo_data: profile.gimimo_data,
        mirties_data: profile.mirties_data,
        epitafija: profile.epitafija,
        tekstas_200: profile.tekstas_200,
        layout_json: safeProfileLayout(profile.layout_json),
        media_json: media,
      },
      can_manage: canManage,
    });
  } catch (error) {
    console.error("profile-content failed", error);
    return json({ error: "Atminimo puslapio įkelti nepavyko" }, 500);
  }
});
