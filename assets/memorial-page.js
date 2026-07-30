(function () {
  var DEFAULT_LAYOUT = {
    header: { left: "8%", top: "3%", width: "84%" },
    text: { left: "8%", top: "16%", width: "84%" },
    "photo-1": { left: "10%", top: "44%", width: "80%", heightPct: "44" },
    "photo-2": { left: "8%", top: "60%", width: "26%", heightPct: "18" },
    "photo-3": { left: "37%", top: "60%", width: "26%", heightPct: "18" },
    "photo-4": { left: "66%", top: "60%", width: "26%", heightPct: "18" },
    video: { left: "8%", top: "75%", width: "84%", heightPct: "47" }
  };
  var LEGACY_STAGE_HEIGHT_PCT = 355;
  var MIN_STAGE_HEIGHT_PCT = 160;
  var MIN_STORY_HEADER_HEIGHT_PCT = 42;
  var STAGE_BOTTOM_GAP_PCT = 12;
  var MAX_STAGE_HEIGHT_PCT = 1200;
  var MAX_PIECE_HEIGHT_PCT = 180;

  var galleryIndex = 0;
  var galleryReturnFocus = null;
  var gallerySwipeStartX = null;
  var gallerySwipeStartY = null;

  function parseJson(value, fallback) {
    if (!value) return fallback;
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch (err) { return fallback; }
  }

  function applyMemorialBackground(value) {
    var background = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#f2ede4";
    var red = parseInt(background.slice(1, 3), 16);
    var green = parseInt(background.slice(3, 5), 16);
    var blue = parseInt(background.slice(5, 7), 16);
    var dark = (red * 299 + green * 587 + blue * 114) / 1000 < 128;
    var root = document.documentElement;
    root.style.backgroundColor = background;
    root.style.setProperty("--memorial-page-background", background);
    root.style.setProperty("--memorial-page-border", dark ? "rgba(255, 255, 255, 0.24)" : "rgba(61, 83, 72, 0.28)");
    root.style.setProperty("--memorial-site-ink", dark ? "#fffdf8" : "#233c33");
    root.style.setProperty("--memorial-site-hover", dark ? "#9ed4c3" : "#0f6d55");
    return background;
  }

  function formatDate(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function formatDates(start, end) {
    return [formatDate(start), formatDate(end)].filter(Boolean).join(" - ");
  }

  function excerptWords(value, max) {
    var list = String(value || "").trim().split(/\s+/).filter(Boolean);
    return list.length > max ? list.slice(0, max).join(" ") + "…" : list.join(" ");
  }

  function normalizeMedia(atminimas) {
    var saved = parseJson(atminimas.media_json, []);
    return Array.isArray(saved) ? saved : [];
  }

  function normalizeStoryBlocks(atminimas) {
    var saved = parseJson(atminimas.story_blocks_json, []);
    if (!Array.isArray(saved)) return [];
    function offset(raw, minimum, maximum) {
      var number = Number(raw);
      return Number.isFinite(number)
        ? Math.round(Math.max(minimum, Math.min(maximum, number)) * 1000) / 1000
        : 0;
    }
    return saved.slice(0, 40).reduce(function (result, item) {
      if (!item || typeof item !== "object") return result;
      if (item.type === "text") {
        var text = String(item.text || "").slice(0, 10000);
        result.push({
          type: "text",
          text: text,
          offsetX: offset(item.offsetX, -70, 70),
          offsetY: offset(item.offsetY, -320, 320)
        });
      } else if (item.type === "photo") {
        var photoOrder = Number(item.photoOrder);
        if (Number.isInteger(photoOrder) && photoOrder >= 1 && photoOrder <= 8) {
          result.push({
            type: "photo",
            photoOrder: photoOrder,
            align: item.align === "left" || item.align === "right" ? item.align : "full",
            offsetX: offset(item.offsetX, -70, 70),
            offsetY: offset(item.offsetY, -320, 320)
          });
        }
      }
      return result;
    }, []);
  }

  function orderedImages(media) {
    return media
      .filter(function (item) { return item.type === "image" && item.url; })
      .sort(function (left, right) { return Number(left.order || 0) - Number(right.order || 0); })
      .slice(0, 8);
  }

  function mergedPiece(layout, name) {
    return Object.assign({}, DEFAULT_LAYOUT[name] || {}, layout[name] || {});
  }

  function layoutNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
  }

  function legacyTopToWidthPct(value) {
    var legacyTop = parseFloat(value || "0");
    return Number.isFinite(legacyTop) ? legacyTop * LEGACY_STAGE_HEIGHT_PCT / 100 : 0;
  }

  function applyPieceStyle(element, saved) {
    if (!saved) return;
    if (saved.left) element.style.left = saved.left;
    var topPct = parseFloat(saved.topPct);
    if (!Number.isFinite(topPct)) topPct = legacyTopToWidthPct(saved.top);
    if (Number.isFinite(topPct)) {
      topPct = Math.max(0, Math.min(MAX_STAGE_HEIGHT_PCT - MAX_PIECE_HEIGHT_PCT - STAGE_BOTTOM_GAP_PCT, topPct));
      element.dataset.topPct = String(layoutNumber(topPct));
    }
    if (saved.width) element.style.width = saved.width;
    var savedHeightPct = parseFloat(saved.heightPct);
    if (Number.isFinite(savedHeightPct)) {
      savedHeightPct = Math.max(4, Math.min(MAX_PIECE_HEIGHT_PCT, savedHeightPct));
      element.dataset.heightPct = String(layoutNumber(savedHeightPct));
    } else if (saved.height) element.style.height = saved.height;
    if (saved.fit) element.dataset.fit = saved.fit;
  }

  function applyImageFit(image, saved) {
    if (!saved) return;
    image.style.objectFit = saved.fit === "crop" ? "cover" : "contain";
    if (saved.objectPosition) image.style.objectPosition = saved.objectPosition;
  }

  function applyResponsiveBuilderHeights(view) {
    var width = view.getBoundingClientRect().width || 560;
    var bottom = 0;
    view.querySelectorAll(".builder-piece").forEach(function (element) {
      var topPct = parseFloat(element.dataset.topPct || "0");
      if (Number.isFinite(topPct)) element.style.top = Math.round(width * topPct / 100) + "px";
      var heightPct = parseFloat(element.dataset.heightPct || "0");
      if (heightPct > 0) {
        heightPct = Math.max(4, Math.min(MAX_PIECE_HEIGHT_PCT, heightPct));
        element.style.height = Math.round(width * heightPct / 100) + "px";
      }
      bottom = Math.max(bottom, element.offsetTop + element.offsetHeight);
    });
    var heightPct = ((bottom + width * STAGE_BOTTOM_GAP_PCT / 100) / width) * 100;
    var minimumHeightPct = view.classList.contains("builder-view--story-blocks")
      ? MIN_STORY_HEADER_HEIGHT_PCT
      : MIN_STAGE_HEIGHT_PCT;
    heightPct = Math.max(minimumHeightPct, Math.min(MAX_STAGE_HEIGHT_PCT, heightPct));
    var savedHeightPct = parseFloat(view.dataset.savedHeightPct || "");
    if (Number.isFinite(savedHeightPct)) {
      heightPct = Math.max(heightPct, Math.max(MIN_STAGE_HEIGHT_PCT, Math.min(MAX_STAGE_HEIGHT_PCT, savedHeightPct)));
    }
    view.dataset.heightPct = String(layoutNumber(heightPct));
    view.style.height = Math.round(width * heightPct / 100) + "px";
  }

  function fitBuilderName(title) {
    var size = 58;
    title.style.fontSize = size + "px";
    while (size > 16 && title.scrollWidth > title.clientWidth) {
      size -= 2;
      title.style.fontSize = size + "px";
    }
  }

  function buildImagePiece(mediaItem, name, layout, className) {
    var saved = mergedPiece(layout, name);
    var wrap = document.createElement("button");
    wrap.type = "button";
    wrap.className = "builder-piece builder-photo " + (className || "");
    wrap.dataset.piece = name;
    wrap.dataset.galleryUrl = mediaItem.url;
    wrap.setAttribute("aria-label", "Atidaryti: " + (mediaItem.alt || "atminimo nuotrauka"));
    applyPieceStyle(wrap, saved);

    var image = document.createElement("img");
    image.src = mediaItem.url;
    image.alt = mediaItem.alt || "Atminimo nuotrauka";
    image.decoding = "async";
    image.loading = name === "photo-1" ? "eager" : "lazy";
    if (name === "photo-1") image.fetchPriority = "high";
    applyImageFit(image, saved);
    wrap.appendChild(image);
    if (mediaItem.caption) {
      var caption = document.createElement("span");
      caption.className = "builder-photo-caption";
      caption.textContent = mediaItem.caption;
      wrap.appendChild(caption);
    }
    return wrap;
  }

  function buildStorySection(text) {
    var section = document.createElement("section");
    section.className = "memorial-story";
    var heading = document.createElement("h2");
    heading.textContent = "Gyvenimo istorija";
    var content = document.createElement("div");
    content.className = "memorial-story__text";
    content.textContent = text;
    section.appendChild(heading);
    section.appendChild(content);
    return section;
  }

  function buildStoryBlocks(blocks, allImages) {
    var section = document.createElement("section");
    section.className = "memorial-story memorial-story-blocks";
    section.setAttribute("aria-labelledby", "memorial-story-blocks-title");
    var heading = document.createElement("h2");
    heading.id = "memorial-story-blocks-title";
    heading.textContent = "Gyvenimo istorija";
    section.appendChild(heading);
    var visibleBlocks = 0;
    var maximumPositiveOffsetY = 0;

    function applyStoryBlockPosition(element, block) {
      var offsetX = Number(block.offsetX) || 0;
      var offsetY = Number(block.offsetY) || 0;
      maximumPositiveOffsetY = Math.max(maximumPositiveOffsetY, offsetY);
      element.classList.add("memorial-story-block--positioned");
      element.style.setProperty("--story-offset-x", offsetX + "%");
      element.style.setProperty("--story-offset-y", offsetY + "px");
    }

    blocks.forEach(function (block) {
      if (block.type === "text") {
        if (!String(block.text || "").trim()) return;
        var text = document.createElement("div");
        text.className = "memorial-story-block memorial-story-block--text";
        applyStoryBlockPosition(text, block);
        text.textContent = block.text;
        section.appendChild(text);
        visibleBlocks += 1;
        return;
      }
      if (block.type !== "photo") return;
      var item = allImages.find(function (image) {
        return Number(image.order) === Number(block.photoOrder);
      });
      if (!item) return;
      var imageIndex = allImages.indexOf(item);
      var figure = document.createElement("figure");
      figure.className = "memorial-story-block memorial-story-block--photo memorial-story-block--photo-" +
        block.align;
      applyStoryBlockPosition(figure, block);
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "Atidaryti: " + (item.alt || "atminimo nuotrauka"));
      button.addEventListener("click", function () { openGallery(imageIndex, allImages); });
      var image = document.createElement("img");
      image.src = item.url;
      image.alt = item.alt || "Atminimo nuotrauka";
      image.loading = imageIndex === 0 ? "eager" : "lazy";
      image.decoding = "async";
      if (imageIndex === 0) image.fetchPriority = "high";
      button.appendChild(image);
      figure.appendChild(button);
      if (item.caption) {
        var caption = document.createElement("figcaption");
        caption.textContent = item.caption;
        figure.appendChild(caption);
      }
      section.appendChild(figure);
      visibleBlocks += 1;
    });
    section.style.setProperty("--story-offset-padding", maximumPositiveOffsetY + "px");
    section.hidden = visibleBlocks === 0;
    return section;
  }

  function buildStoryGallery(images, startIndex, allImages) {
    var section = document.createElement("section");
    section.className = "memorial-story-gallery";
    section.setAttribute("aria-label", "Prisiminimų nuotraukos");
    var heading = document.createElement("h2");
    heading.textContent = "Prisiminimų galerija";
    section.appendChild(heading);
    var grid = document.createElement("div");
    grid.className = "memorial-story-gallery__grid";
    images.forEach(function (item, index) {
      var figure = document.createElement("figure");
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "Atidaryti: " + (item.alt || "atminimo nuotrauka"));
      button.addEventListener("click", function () { openGallery(startIndex + index, allImages); });
      var image = document.createElement("img");
      image.src = item.url;
      image.alt = item.alt || "Atminimo nuotrauka";
      image.loading = "lazy";
      image.decoding = "async";
      button.appendChild(image);
      figure.appendChild(button);
      if (item.caption) {
        var caption = document.createElement("figcaption");
        caption.textContent = item.caption;
        figure.appendChild(caption);
      }
      grid.appendChild(figure);
    });
    section.appendChild(grid);
    return section;
  }

  function safeHttpsUrl(value) {
    try {
      var url = new URL(String(value || ""));
      if (url.protocol !== "https:" || url.username || url.password) return "";
      return url.href;
    } catch (_error) {
      return "";
    }
  }

  function buildMediaSources(images) {
    var sourced = images.map(function (item) {
      return { item: item, url: safeHttpsUrl(item.sourceUrl) };
    }).filter(function (source) { return source.url; });
    if (!sourced.length) return null;
    var section = document.createElement("section");
    section.className = "memorial-photo-sources";
    var heading = document.createElement("h2");
    heading.textContent = "Nuotraukų šaltiniai";
    var list = document.createElement("ol");
    sourced.forEach(function (safeSource) {
      var item = safeSource.item;
      var entry = document.createElement("li");
      var description = document.createElement("strong");
      description.textContent = item.caption || item.alt || "Istorinė nuotrauka";
      var source = document.createElement("a");
      source.href = safeSource.url;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = item.sourceName || "Atidaryti šaltinį";
      var license = document.createElement("span");
      license.textContent = item.license || "";
      entry.appendChild(description);
      entry.appendChild(source);
      if (license.textContent) entry.appendChild(license);
      list.appendChild(entry);
    });
    section.appendChild(heading);
    section.appendChild(list);
    return section;
  }

  function renderBuilderLayout(atminimas, media, layout) {
    document.getElementById("antmastis").hidden = true;
    document.getElementById("nuotraukos").hidden = true;
    document.getElementById("video-blokas").hidden = true;

    var view = document.createElement("section");
    view.id = "builder-view";
    view.className = "builder-view";
    var storyBlocks = normalizeStoryBlocks(atminimas);
    var hasStoryBlocks = storyBlocks.length > 0;
    view.classList.toggle("builder-view--story-blocks", hasStoryBlocks);
    var stageBackground = applyMemorialBackground(layout.__stage && layout.__stage.background);
    view.style.backgroundColor = stageBackground;
    if (!hasStoryBlocks && layout.__stage && layout.__stage.heightPct) {
      view.dataset.savedHeightPct = layout.__stage.heightPct;
    }

    var headerSaved = mergedPiece(layout, "header");
    var header = document.createElement("header");
    header.className = "builder-piece builder-header builder-header-card";
    header.dataset.piece = "header";
    applyPieceStyle(header, headerSaved);

    var title = document.createElement("h1");
    title.textContent = [atminimas.vardas, atminimas.pavarde].filter(Boolean).join(" ") || "Atminimas";
    var dates = document.createElement("p");
    dates.textContent = formatDates(atminimas.gimimo_data, atminimas.mirties_data);
    var epitaph = document.createElement("blockquote");
    epitaph.className = "builder-epitaph";
    epitaph.textContent = atminimas.epitafija || "";
    header.appendChild(title);
    header.appendChild(dates);
    if (epitaph.textContent) header.appendChild(epitaph);
    view.appendChild(header);

    var fullStory = atminimas.tekstas_200 || "";
    var storyWordCount = String(fullStory).trim().split(/\s+/).filter(Boolean).length;
    var allImages = orderedImages(media);
    if (!hasStoryBlocks) {
      var text = document.createElement("blockquote");
      text.className = "builder-piece builder-text";
      text.dataset.piece = "text";
      text.textContent = excerptWords(fullStory, 80);
      applyPieceStyle(text, mergedPiece(layout, "text"));
      view.appendChild(text);

      var primaryImages = allImages.slice(0, 4);
      primaryImages.forEach(function (item, index) {
        var name = "photo-" + (index + 1);
        view.appendChild(buildImagePiece(item, name, layout, index ? "builder-photo-small" : ""));
      });
    }

    var video = media.find(function (item) { return item.type === "video" && item.url; });
    var captions = media.find(function (item) { return item.type === "captions" && item.url; });
    var storyVideoWrap = null;
    if (video) {
      var videoWrap = document.createElement("div");
      if (hasStoryBlocks) {
        videoWrap.className = "memorial-story-video";
        storyVideoWrap = videoWrap;
      } else {
        videoWrap.className = "builder-piece builder-video";
        videoWrap.dataset.piece = "video";
        applyPieceStyle(videoWrap, mergedPiece(layout, "video"));
      }
      var player = document.createElement("video");
      player.controls = true;
      player.playsInline = true;
      player.preload = "none";
      player.src = video.url;
      if (captions) {
        var track = document.createElement("track");
        track.kind = "captions";
        track.label = "Lietuvių";
        track.srclang = captions.language || "lt";
        track.src = captions.url;
        track.default = true;
        player.appendChild(track);
      }
      videoWrap.appendChild(player);
      if (!hasStoryBlocks) view.appendChild(videoWrap);
    }

    var contentRoot = document.getElementById("turinys");
    contentRoot.appendChild(view);
    if (hasStoryBlocks) {
      contentRoot.appendChild(buildStoryBlocks(storyBlocks, allImages));
      if (storyVideoWrap) contentRoot.appendChild(storyVideoWrap);
    } else {
      if (storyWordCount > 80) contentRoot.appendChild(buildStorySection(fullStory));
      if (allImages.length > 4) contentRoot.appendChild(buildStoryGallery(allImages.slice(4), 4, allImages));
    }
    var mediaSources = buildMediaSources(allImages);
    if (mediaSources) contentRoot.appendChild(mediaSources);
    window.addEventListener("resize", function () {
      fitBuilderName(title);
      applyResponsiveBuilderHeights(view);
    });
    bindBuilderGallery(view, allImages);
  }

  function renderLegacy(atminimas, media) {
    document.getElementById("atminimo-vardas").textContent =
      [atminimas.vardas, atminimas.pavarde].filter(Boolean).join(" ") || "Atminimas";
    document.getElementById("atminimo-datos").textContent =
      formatDates(atminimas.gimimo_data, atminimas.mirties_data);
    document.getElementById("atminimo-epitafija").textContent = atminimas.epitafija || "";

    var longText = document.getElementById("atminimo-tekstas");
    longText.textContent = atminimas.tekstas_200 || "";
    longText.hidden = !longText.textContent;

    var images = orderedImages(media);
    var photos = document.getElementById("nuotraukos");
    photos.innerHTML = "";
    images.forEach(function (item, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "nuotrauka-kortele";
      button.setAttribute("aria-label", "Atidaryti: " + (item.alt || ("atminimo nuotrauka " + (index + 1))));
      button.addEventListener("click", function () { openGallery(index, images); });
      var image = document.createElement("img");
      image.src = item.url;
      image.alt = item.alt || ("Atminimo nuotrauka " + (index + 1));
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";
      if (index === 0) image.fetchPriority = "high";
      if (item.pixel_art) image.classList.add("pixel-art");
      button.appendChild(image);
      if (item.caption) {
        var visibleCaption = document.createElement("span");
        visibleCaption.className = "nuotrauka-kortele__caption";
        visibleCaption.textContent = item.caption;
        button.appendChild(visibleCaption);
      }
      photos.appendChild(button);
    });

    var videoItem = media.find(function (item) { return item.type === "video" && item.url; });
    var captionsItem = media.find(function (item) { return item.type === "captions" && item.url; });
    var videoBlock = document.getElementById("video-blokas");
    if (videoItem) {
      videoBlock.hidden = false;
      var player = videoBlock.querySelector("video");
      player.preload = "none";
      player.src = videoItem.url;
      player.querySelectorAll("track").forEach(function (track) { track.remove(); });
      if (captionsItem) {
        var captionsTrack = document.createElement("track");
        captionsTrack.kind = "captions";
        captionsTrack.label = "Lietuvių";
        captionsTrack.srclang = captionsItem.language || "lt";
        captionsTrack.src = captionsItem.url;
        captionsTrack.default = true;
        player.appendChild(captionsTrack);
      }
      player.load();
    } else {
      videoBlock.hidden = true;
    }
    initVideoFullscreenControls();
  }

  function renderPage(payload, message) {
    var atminimas = payload.atminimas || payload;
    var media = normalizeMedia(atminimas);
    var layout = parseJson(atminimas.layout_json, {});
    var hasBuilderData = Object.keys(layout).length > 0 ||
      parseJson(atminimas.media_json, []).length > 0 ||
      normalizeStoryBlocks(atminimas).length > 0;

    if (hasBuilderData) renderBuilderLayout(atminimas, media, layout);
    else {
      applyMemorialBackground("#f2ede4");
      renderLegacy(atminimas, media);
    }

    if (message) {
      var status = document.getElementById("duomenu-busena");
      status.textContent = message;
      status.hidden = false;
    }
    document.getElementById("kraunama").hidden = true;
    document.getElementById("turinys").hidden = false;
    var builderView = document.getElementById("builder-view");
    if (builderView) {
      var builderTitle = builderView.querySelector("h1");
      if (builderTitle) fitBuilderName(builderTitle);
      applyResponsiveBuilderHeights(builderView);
    }
    if (atminimas.demo) {
      document.getElementById("memorial-demo-notice").hidden = false;
      document.title = [atminimas.vardas, atminimas.pavarde].filter(Boolean).join(" ") + " – demonstracinis atminimo puslapis";
    }
    if (window.AtminimasMemorialActions) AtminimasMemorialActions.init(atminimas, { demo: !!atminimas.demo });
  }

  function fillGallery(images) {
    var inner = document.getElementById("gallery-inner");
    inner.innerHTML = "";
    images.forEach(function (item, index) {
      var figure = document.createElement("figure");
      var image = document.createElement("img");
      image.src = item.url;
      image.alt = item.alt || ("Atminimo nuotrauka " + (index + 1));
      image.loading = "lazy";
      image.decoding = "async";
      figure.appendChild(image);
      if (item.caption) {
        var caption = document.createElement("figcaption");
        caption.textContent = item.caption;
        figure.appendChild(caption);
      }
      inner.appendChild(figure);
    });
  }

  function openGallery(index, images) {
    if (!images.length) return;
    fillGallery(images);
    galleryIndex = Math.max(0, Math.min(index, images.length - 1));
    var gallery = document.getElementById("gallery");
    galleryReturnFocus = document.activeElement;
    gallery.style.display = "block";
    gallery.setAttribute("aria-hidden", "false");
    document.getElementById("gallery-close").focus();
    requestAnimationFrame(function () { galleryScroll(true); });
  }

  function closeGallery() {
    var gallery = document.getElementById("gallery");
    gallery.style.display = "none";
    gallery.setAttribute("aria-hidden", "true");
    if (galleryReturnFocus && galleryReturnFocus.focus) galleryReturnFocus.focus();
  }

  function galleryCount() {
    return document.getElementById("gallery-inner").querySelectorAll("img").length;
  }

  function galleryScroll(instant) {
    var inner = document.getElementById("gallery-inner");
    inner.scrollTo({ left: galleryIndex * inner.clientWidth, behavior: instant ? "auto" : "smooth" });
    document.getElementById("gallery-prev").disabled = galleryIndex <= 0;
    document.getElementById("gallery-next").disabled = galleryIndex >= galleryCount() - 1;
  }

  function bindBuilderGallery(view, images) {
    view.querySelectorAll(".builder-photo").forEach(function (button, index) {
      button.addEventListener("click", function () { openGallery(index, images); });
    });
  }

  function initGallery() {
    document.getElementById("gallery-close").addEventListener("click", closeGallery);
    document.getElementById("gallery-prev").addEventListener("click", function () {
      if (galleryIndex > 0) { galleryIndex--; galleryScroll(false); }
    });
    document.getElementById("gallery-next").addEventListener("click", function () {
      if (galleryIndex < galleryCount() - 1) { galleryIndex++; galleryScroll(false); }
    });
    var inner = document.getElementById("gallery-inner");
    inner.addEventListener("pointerdown", function (event) {
      gallerySwipeStartX = event.clientX;
      gallerySwipeStartY = event.clientY;
    });
    inner.addEventListener("pointerup", function (event) {
      if (gallerySwipeStartX == null) return;
      var dx = event.clientX - gallerySwipeStartX;
      var dy = event.clientY - gallerySwipeStartY;
      gallerySwipeStartX = null;
      gallerySwipeStartY = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0 && galleryIndex < galleryCount() - 1) galleryIndex++;
      if (dx > 0 && galleryIndex > 0) galleryIndex--;
      galleryScroll(false);
    });
    document.addEventListener("keydown", function (event) {
      var gallery = document.getElementById("gallery");
      if (gallery.style.display !== "block") return;
      if (event.key === "Tab") {
        var controls = Array.from(gallery.querySelectorAll("button:not([hidden]):not([disabled])"));
        if (controls.length) {
          var current = controls.indexOf(document.activeElement);
          var next = event.shiftKey ? current - 1 : current + 1;
          if (current < 0) next = 0;
          if (next < 0) next = controls.length - 1;
          if (next >= controls.length) next = 0;
          event.preventDefault();
          controls[next].focus();
        }
      }
      if (event.key === "Escape") closeGallery();
      if (event.key === "ArrowLeft" && galleryIndex > 0) { galleryIndex--; galleryScroll(false); }
      if (event.key === "ArrowRight" && galleryIndex < galleryCount() - 1) { galleryIndex++; galleryScroll(false); }
    });
  }

  function initVideoFullscreenControls() {
    document.querySelectorAll(".video-fs-wrap").forEach(function (wrap) {
      if (wrap.dataset.videoFsInit === "1") return;
      wrap.dataset.videoFsInit = "1";
      var play = wrap.querySelector(".video-fs-play");
      var close = wrap.querySelector(".video-fs-close");
      var video = wrap.querySelector("video");
      if (!play || !close || !video) return;

      play.addEventListener("click", function () {
        var request = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
        if (request) {
          var result = request.call(wrap);
          if (result && result.catch) result.catch(function () { wrap.classList.add("fs-fake"); });
        } else {
          wrap.classList.add("fs-fake");
        }
        close.hidden = false;
        play.hidden = true;
        video.play().catch(function () {});
      });

      close.addEventListener("click", function () {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
        wrap.classList.remove("fs-fake");
        close.hidden = true;
        play.hidden = false;
      });
    });
  }

  async function init() {
    initGallery();
    var params = new URLSearchParams(window.location.search);
    var identifier = (params.get("id") || params.get("slug") || params.get("s") || "").trim();
    if (!identifier) {
      window.location.replace("index.html");
      return;
    }

    if (window.AtminimasDemo && AtminimasDemo.isMaironisIdentifier(identifier)) {
      renderPage({ atminimas: AtminimasDemo.maironis.profile }, "");
      return;
    }

    try {
      var payload = await AtminimasApi.loadAtminimasBySlug(identifier);
      renderPage(payload, "");
    } catch {
      document.getElementById("kraunama").hidden = true;
      document.getElementById("klaida").textContent = "Atminimo puslapio nepavyko rasti.";
      document.getElementById("klaida").hidden = false;
    }
  }

  init();
})();
