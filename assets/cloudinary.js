(function (global) {
  function getConfig() {
    return global.ATMINIMAS_CONFIG || {};
  }

  function cloudName() {
    var name = getConfig().CLOUDINARY_CLOUD_NAME;
    if (!name) {
      throw new Error("Nustatyk CLOUDINARY_CLOUD_NAME faile assets/supabase-config.js");
    }
    return name;
  }

  function buildPath(resourceType, transform, publicId) {
    var parts = ["https://res.cloudinary.com", cloudName(), resourceType, "upload"];
    if (transform) parts.push(transform);
    parts.push(publicId);
    return parts.join("/");
  }

  function imageUrl(publicId, transform) {
    if (!publicId) return "";
    var t = transform || getConfig().CLOUDINARY_THUMB_TRANSFORM || "";
    return buildPath("image", t, publicId);
  }

  function galleryImageUrl(publicId) {
    return imageUrl(publicId, getConfig().CLOUDINARY_GALLERY_TRANSFORM);
  }

  function bgImageUrl(publicId) {
    return imageUrl(publicId, getConfig().CLOUDINARY_BG_TRANSFORM);
  }

  function videoUrl(publicId, transform) {
    if (!publicId) return "";
    var t = transform || getConfig().CLOUDINARY_VIDEO_TRANSFORM || "";
    var base = buildPath("video", t, publicId);
    if (!/\.[a-z0-9]+$/i.test(publicId)) {
      return base + ".mp4";
    }
    return base;
  }

  global.CloudinaryHelper = {
    imageUrl: imageUrl,
    galleryImageUrl: galleryImageUrl,
    bgImageUrl: bgImageUrl,
    videoUrl: videoUrl
  };
})(window);


