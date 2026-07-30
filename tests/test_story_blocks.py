import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def balanced_block(source, marker_pattern):
    marker = re.search(marker_pattern, source, re.MULTILINE)
    if not marker:
        return ""
    opening = source.find("{", marker.start())
    if opening < 0:
        return ""
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening + 1:index]
    return ""


def balanced_blocks(source, marker_pattern):
    blocks = []
    cursor = 0
    while cursor < len(source):
        marker = re.search(marker_pattern, source[cursor:], re.MULTILINE)
        if not marker:
            break
        marker_start = cursor + marker.start()
        opening = source.find("{", marker_start)
        if opening < 0:
            break
        depth = 0
        closing = -1
        for index in range(opening, len(source)):
            if source[index] == "{":
                depth += 1
            elif source[index] == "}":
                depth -= 1
                if depth == 0:
                    closing = index
                    break
        if closing < 0:
            break
        blocks.append(source[opening + 1:closing])
        cursor = closing + 1
    return blocks


class StoryBlocksContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.editor_html = read("redaktorius.html")
        cls.editor_js = read("assets/redaktorius.js")
        cls.api_js = read("assets/atminimas-duomenys.js")
        cls.memorial_js = read("assets/memorial-page.js")
        cls.styles = read("css/styles.css")
        cls.schema = read("supabase/schema.sql")
        cls.core = read("supabase/functions/_shared/core.ts")
        cls.profile_manage = read("supabase/functions/profile-manage/index.ts")
        cls.profile_content = read("supabase/functions/profile-content/index.ts")
        cls.migrations = {
            path.name: path.read_text(encoding="utf-8")
            for path in (ROOT / "supabase" / "migrations").glob("*.sql")
        }

    def test_story_blocks_have_a_validated_database_contract(self):
        self.assertRegex(
            self.schema,
            r"story_blocks_json\s+jsonb\s+not\s+null\s+default\s+'\[\]'::jsonb",
        )
        story_migrations = {
            name: source
            for name, source in self.migrations.items()
            if "story_blocks_json" in source
        }
        self.assertTrue(story_migrations, "Trūksta story_blocks_json migracijos")
        migration = "\n".join(story_migrations.values())
        self.assertIn("add column if not exists story_blocks_json", migration)
        self.assertIn("private.normalize_profile_story_blocks", migration)
        self.assertRegex(
            migration,
            r"create\s+trigger\s+normalize_profile_story_blocks",
        )
        self.assertRegex(
            migration,
            r"grant\s+insert\s*\([^;]*story_blocks_json[^;]*\)"
            r"\s+on\s+table\s+public\.profiliai\s+to\s+authenticated",
        )
        self.assertIn("tekstas_200", migration)
        self.assertIn("new.media_json", migration)
        self.assertRegex(
            migration,
            r"(?:40\s+blocks|jsonb_array_length|(?:<=|>)\s*40)",
        )
        self.assertIn("10000", migration)
        self.assertNotRegex(
            migration,
            r"update\s+public\.profiliai\s+set\s+story_blocks_json",
            "Legacy rows must remain in the old renderer until the owner saves them",
        )

    def test_shared_sanitizer_enforces_the_portable_block_shape(self):
        self.assertIn("export function safeStoryBlocks", self.core)
        self.assertIn("export function storyBlocksText", self.core)
        self.assertRegex(
            self.core,
            r"MAX_STORY_BLOCKS\s*=\s*40\b",
        )
        self.assertRegex(
            self.core,
            r"\.slice\(\s*0\s*,\s*MAX_STORY_BLOCKS\s*\)",
        )
        self.assertRegex(
            self.core,
            r"MAX_STORY_TEXT_LENGTH\s*=\s*10_000\b",
        )
        self.assertRegex(self.core, r'type\s*===\s*"text"')
        self.assertRegex(self.core, r'type\s*===\s*"photo"')
        self.assertIn("photoOrder", self.core)
        self.assertIn("10000", self.core)
        self.assertNotIn("innerHTML", balanced_block(
            self.core, r"export function safeStoryBlocks",
        ))

    def test_story_blocks_cross_every_create_update_and_read_boundary(self):
        self.assertRegex(
            self.api_js,
            r"story_blocks_json\s*:\s*storyBlocks",
        )
        self.assertRegex(
            self.api_js,
            r"story_blocks\s*:\s*storyBlocks",
        )
        self.assertIn("options.storyBlocks", self.api_js)

        self.assertIn(
            "safeStoryBlocks(body.story_blocks)",
            self.profile_manage,
        )
        self.assertRegex(
            self.profile_manage,
            r"existingStoryBlocks\s*=\s*safeStoryBlocks\(\s*"
            r"profile\.story_blocks_json",
        )
        self.assertRegex(
            self.profile_manage,
            r"let\s+storyBlocks\s*=\s*existingStoryBlocks",
        )
        self.assertRegex(
            self.profile_manage,
            r"(?:hasStoryBlocks|hasOwnProperty)[\s\S]{0,500}"
            r"safeStoryBlocks\(body\.story_blocks\)",
        )
        self.assertRegex(
            self.profile_manage,
            r"story_blocks_json\s*:\s*storyBlocks",
        )
        self.assertRegex(
            self.profile_manage,
            r"tekstas_200\s*:\s*storyBlocksText\(storyBlocks\)",
        )
        self.assertRegex(
            self.profile_manage,
            r"story_blocks_json\s*:\s*\[\]",
        )

        self.assertRegex(
            self.profile_content,
            r"\.select\(\s*[\"'][^\"']*story_blocks_json[^\"']*[\"']",
        )
        self.assertIn(
            "story_blocks_json: safeStoryBlocks(profile.story_blocks_json)",
            self.profile_content,
        )

    def test_editor_exposes_accessible_block_controls(self):
        combined = self.editor_html + "\n" + self.editor_js
        for label in (
            "Pridėti tekstą",
            "Pridėti nuotrauką",
            "Aukštyn",
            "Žemyn",
            "Ištrinti",
        ):
            with self.subTest(label=label):
                self.assertIn(label, combined)
        blocks_position = self.editor_html.index("data-story-blocks")
        add_text_position = self.editor_html.index('data-story-add="text"')
        add_photo_position = self.editor_html.index('data-story-add="photo"')
        self.assertLess(blocks_position, add_text_position)
        self.assertLess(add_text_position, add_photo_position)
        self.assertRegex(
            combined,
            r"data-(?:story|content)-block",
        )
        for action_marker in (
            "data-story-move",
            "data-story-delete",
            "data-story-text",
            "data-story-photo-select",
            "data-story-photo-caption",
        ):
            with self.subTest(action_marker=action_marker):
                self.assertIn(action_marker, self.editor_js)
        self.assertIn("storyBlocks.splice(index, 1)", self.editor_js)
        self.assertRegex(
            self.editor_js,
            r"storyBlocks\.splice\(\s*targetIndex\s*,\s*0\s*,\s*moved\s*\)",
        )

    def test_draft_and_existing_profile_keep_legacy_story_text(self):
        save_draft = balanced_block(
            self.editor_js, r"function\s+saveDraftNow\s*\(",
        )
        restore_draft = balanced_block(
            self.editor_js, r"function\s+restoreDraft\s*\(",
        )
        load_profile = balanced_block(
            self.editor_js, r"function\s+loadProfileForEditing\s*\(",
        )
        ensure_blocks = balanced_block(
            self.editor_js, r"function\s+ensureStoryBlocks\s*\(",
        )
        self.assertRegex(save_draft, r"storyBlocks|story_blocks")
        self.assertIn("restoreDraftFields(draft.form)", restore_draft)
        self.assertRegex(
            restore_draft,
            r"setStoryBlocks\(\s*draft\.storyBlocks\s*,\s*true\s*,"
            r"\s*draft\.storyEmpty\s*===\s*true\s*\)",
        )
        self.assertLess(
            restore_draft.index("restoreDraftFields(draft.form)"),
            restore_draft.index(
                "setStoryBlocks(draft.storyBlocks, true, draft.storyEmpty === true)"
            ),
        )
        self.assertIn("form.elements.tekstas_200", ensure_blocks)
        self.assertRegex(
            ensure_blocks,
            r'type\s*:\s*"text"[\s\S]{0,160}tekstas_200',
        )
        self.assertIn("story_blocks_json", load_profile)
        self.assertIn("tekstas_200", load_profile)
        self.assertRegex(
            self.editor_js,
            r"story_blocks_json|storyBlocks",
        )

    def test_empty_story_and_photo_identity_round_trip_safely(self):
        self.assertRegex(
            self.editor_js,
            r"if\s*\(\s*!hasPersistableBlock\s*\)"
            r"[\s\S]{0,180}storyBlocks\s*=\s*\[\s*"
            r"\{\s*type:\s*\"text\",\s*text:\s*\"\""
            r"[\s\S]{0,100}offsetX:\s*0[\s\S]{0,100}offsetY:\s*0"
            r"\s*\}\s*\]",
        )
        self.assertIn("storyEmpty: storyEmptyMode", self.editor_js)
        self.assertRegex(
            self.editor_js,
            r"if\s*\(\s*storyEmptyMode\s*\)\s*return",
        )
        self.assertGreaterEqual(
            self.editor_js.count("storyBlocks: collectStoryBlocks(true)"),
            2,
        )
        normalizer = balanced_block(
            self.memorial_js, r"function\s+normalizeStoryBlocks\s*\(",
        )
        self.assertRegex(
            normalizer,
            r"result\.push\(\s*\{\s*type:\s*\"text\",\s*text:\s*text"
            r"[\s\S]{0,180}offsetX:[\s\S]{0,180}offsetY:",
        )
        renderer = balanced_block(
            self.memorial_js, r"function\s+buildStoryBlocks\s*\(",
        )
        self.assertRegex(
            renderer,
            r"Number\(\s*image\.order\s*\)\s*===\s*Number\(\s*block\.photoOrder\s*\)",
        )

    def test_photo_processing_is_generation_safe_and_awaited(self):
        sync_photos = balanced_block(
            self.editor_js, r"async\s+function\s+syncPhotos\s*\(",
        )
        save_draft = balanced_block(
            self.editor_js, r"function\s+saveDraftNow\s*\(",
        )
        self.assertIn("++photoProcessingGeneration", sync_photos)
        self.assertIn("generation !== photoProcessingGeneration", sync_photos)
        self.assertIn("localProcessedPhotos", sync_photos)
        self.assertIn("await persistProcessedPhotoOrder()", sync_photos)
        self.assertIn("clearTimeout(draftSaveTimer)", sync_photos)
        self.assertIn("photosProcessing", save_draft)
        self.assertGreaterEqual(
            self.editor_js.count("await photoSyncPromise"),
            2,
        )
        self.assertRegex(
            sync_photos,
            r"previousPhotoCount\s*\+\s*1",
        )

    def test_editor_enforces_the_shared_flattened_text_limit(self):
        self.assertRegex(
            self.editor_js,
            r"MAX_STORY_CHARS\s*=\s*10000\b",
        )
        limiter = balanced_block(
            self.editor_js, r"function\s+limitStoryBlocksToWords\s*\(",
        )
        self.assertIn("remainingChars", limiter)
        self.assertIn("MAX_STORY_CHARS", limiter)

    def test_long_story_preview_refits_after_images_load(self):
        preview = balanced_block(
            self.editor_js, r"function\s+renderStoryPreview\s*\(",
        )
        keep_video = balanced_block(
            self.editor_js, r"function\s+keepVideoBelowStory\s*\(",
        )
        self.assertRegex(
            preview,
            r"addEventListener\(\s*\"load\"[\s\S]{0,160}scheduleStageFit",
        )
        self.assertRegex(
            self.editor_js,
            r"MAX_STORY_STAGE_HEIGHT_PCT\s*=\s*8000\b",
        )
        self.assertIn("previewLongText.offsetHeight", keep_video)
        self.assertNotIn("setPieceTopPct(videoPiece", keep_video)

    def test_story_mode_video_uses_flow_after_the_ordered_story(self):
        builder = balanced_block(
            self.memorial_js, r"function\s+renderBuilderLayout\s*\(",
        )
        self.assertIn('videoWrap.className = "memorial-story-video"', builder)
        story_append = builder.index(
            "contentRoot.appendChild(buildStoryBlocks(storyBlocks, allImages))"
        )
        video_append = builder.index(
            "contentRoot.appendChild(storyVideoWrap)"
        )
        self.assertLess(story_append, video_append)
        self.assertIn(".memorial-story-video", self.styles)

    def test_photo_alignment_wraps_full_story_text_and_round_trips(self):
        self.assertNotIn("PREVIEW_STORY_WORDS", self.editor_js)
        self.assertNotIn("function storyPreview(", self.editor_js)
        preview = balanced_block(
            self.editor_js, r"function\s+renderStoryPreview\s*\(",
        )
        self.assertIn("text.textContent = value", preview)
        self.assertNotRegex(preview, r"slice\(|excerpt|PREVIEW")

        self.assertIn("dataset.storyPhotoAlign", self.editor_js)
        self.assertIn("data-story-photo-align", self.editor_js)
        self.assertIn("Vieta prie teksto", self.editor_js)
        for label in (
            "Per visą plotį (atskira eilutė)",
            "Kairėje – tekstas apteka dešinėje",
            "Dešinėje – tekstas apteka kairėje",
        ):
            self.assertIn(label, self.editor_js)

        for source in (
            self.editor_js,
            self.api_js,
            self.memorial_js,
            self.core,
        ):
            with self.subTest(source=source[:40]):
                self.assertIn("align", source.lower())
                self.assertIn('"left"', source)
                self.assertIn('"right"', source)
                self.assertIn('"full"', source)

        wrapping_migrations = "\n".join(
            source
            for name, source in self.migrations.items()
            if "story_photo_wrapping" in name
        )
        self.assertTrue(wrapping_migrations)
        self.assertIn("'align', photo_align", wrapping_migrations)
        self.assertRegex(
            wrapping_migrations,
            r"in\s*\(\s*'left'\s*,\s*'right'\s*\)",
        )
        self.assertIn("'align', 'full'", wrapping_migrations)

        renderer = balanced_block(
            self.memorial_js, r"function\s+buildStoryBlocks\s*\(",
        )
        self.assertIn("block.align", renderer)
        self.assertIn("memorial-story-block--photo-", renderer)
        self.assertRegex(
            self.styles,
            r"\.memorial-story-block--photo-left[\s\S]{0,320}"
            r"float\s*:\s*left",
        )
        self.assertRegex(
            self.styles,
            r"\.memorial-story-block--photo-right[\s\S]{0,320}"
            r"float\s*:\s*right",
        )
        self.assertRegex(
            self.styles,
            r"\.memorial-story-block--photo-full\s*\{[\s\S]{0,100}"
            r"clear\s*:\s*both",
        )
        self.assertIn("display: flow-root", self.styles)
        self.assertIn("Kad tekstas aptekėtų nuotrauką", self.editor_html)

    def test_story_blocks_move_independently_and_persist_positions(self):
        for source in (
            self.editor_js,
            self.api_js,
            self.memorial_js,
            self.core,
        ):
            with self.subTest(source=source[:40]):
                self.assertIn("offsetX", source)
                self.assertIn("offsetY", source)

        preview = balanced_block(
            self.editor_js, r"function\s+renderStoryPreview\s*\(",
        )
        self.assertIn("storyLayoutHandle(index", preview)
        self.assertIn("dataset.storyPreviewIndex", preview)
        self.assertIn("setupStoryPreviewDragging()", preview)

        drag = balanced_block(
            self.editor_js, r"function\s+setupStoryPreviewDragging\s*\(",
        )
        self.assertIn("block.offsetX", drag)
        self.assertIn("block.offsetY", drag)
        self.assertIn("scheduleDraftSave()", drag)
        self.assertIn('"ArrowLeft"', drag)
        self.assertIn('"Home"', drag)

        bind_drag = balanced_block(
            self.editor_js, r"function\s+bindDrag\s*\(",
        )
        self.assertIn(
            'piece === previewLongText && stage.classList.contains("has-story-blocks")',
            bind_drag,
        )

        position_migration = "\n".join(
            source
            for name, source in self.migrations.items()
            if "story_block_independent_positions" in name
        )
        self.assertTrue(position_migration)
        self.assertIn("'offsetX', block_offset_x", position_migration)
        self.assertIn("'offsetY', block_offset_y", position_migration)
        self.assertIn("least(70, greatest(-70", position_migration)
        self.assertIn("least(320, greatest(-320", position_migration)

        renderer = balanced_block(
            self.memorial_js, r"function\s+buildStoryBlocks\s*\(",
        )
        self.assertIn("applyStoryBlockPosition(text, block)", renderer)
        self.assertIn("applyStoryBlockPosition(figure, block)", renderer)
        self.assertIn("--story-offset-padding", renderer)
        self.assertIn(".editor-story-layout-handle", self.styles)
        self.assertIn(".memorial-story-block--positioned", self.styles)
        self.assertIn(
            "Pajudinus vieną bloką, kiti lieka savo vietoje",
            self.editor_html,
        )

    def test_story_photos_are_selectable_resizable_and_keep_display_settings(self):
        for source in (
            self.editor_js,
            self.api_js,
            self.memorial_js,
            self.core,
        ):
            with self.subTest(source=source[:40]):
                self.assertIn("widthPct", source)
                self.assertIn('"cover"', source)
                self.assertIn('"contain"', source)

        self.assertIn('id="editor-story-photo-tools"', self.editor_html)
        self.assertIn('id="editor-story-photo-size"', self.editor_html)
        self.assertIn('data-story-photo-fit="contain"', self.editor_html)
        self.assertIn('data-story-photo-fit="cover"', self.editor_html)
        self.assertIn("setupStoryPhotoTools()", self.editor_js)
        self.assertIn("selectStoryPhoto(", self.editor_js)
        self.assertIn("updateSelectedStoryPhoto(", self.editor_js)
        self.assertIn("MIN_STORY_PHOTO_WIDTH = 35", self.editor_js)
        self.assertIn("MAX_STORY_PHOTO_WIDTH = 100", self.editor_js)

        preview = balanced_block(
            self.editor_js, r"function\s+renderStoryPreview\s*\(",
        )
        self.assertIn("dataset.storyPhotoSelect", preview)
        self.assertIn("applyStoryPhotoAppearance(figure, block)", preview)
        self.assertIn("syncStoryPhotoTools()", preview)

        controls = balanced_block(
            self.editor_js, r"function\s+setupStoryPhotoTools\s*\(",
        )
        self.assertIn("[data-story-photo-size]", controls)
        self.assertIn("[data-story-photo-fit]", controls)
        self.assertIn("[data-story-photo-reset]", controls)
        self.assertIn("event.detail === 0", self.editor_js)

        renderer = balanced_block(
            self.memorial_js, r"function\s+buildStoryBlocks\s*\(",
        )
        self.assertIn("--story-photo-width", renderer)
        self.assertIn("memorial-story-block--photo-fit-", renderer)

        display_migration = "\n".join(
            source
            for name, source in self.migrations.items()
            if "story_photo_display_controls" in name
        )
        self.assertTrue(display_migration)
        self.assertIn("'widthPct', photo_width", display_migration)
        self.assertIn("'fit', photo_fit", display_migration)
        self.assertIn("least(100, greatest(35", display_migration)
        self.assertIn("'widthPct', 100", display_migration)
        self.assertIn("'fit', 'contain'", display_migration)

        self.assertRegex(
            self.styles,
            r"\.editor-preview-story__photo,[\s\S]{0,420}"
            r"background:\s*transparent",
        )
        self.assertRegex(
            self.styles,
            r"\.memorial-story-block--photo img\s*\{[\s\S]{0,220}"
            r"background:\s*transparent",
        )
        self.assertIn(".editor-preview-story__photo.is-selected", self.styles)
        self.assertIn(".editor-story-photo-tools", self.styles)

    def test_photo_draft_errors_cannot_be_reported_as_saved(self):
        save_draft = balanced_block(
            self.editor_js, r"function\s+saveDraftNow\s*\(",
        )
        persist_photos = balanced_block(
            self.editor_js,
            r"async\s+function\s+persistProcessedPhotoOrder\s*\(",
        )
        sync_photos = balanced_block(
            self.editor_js, r"async\s+function\s+syncPhotos\s*\(",
        )
        self.assertIn("hasDraftMediaPersistenceFailure()", save_draft)
        self.assertIn("photoDraftPersistenceFailed = true", persist_photos)
        self.assertRegex(
            sync_photos,
            r"if\s*\(\s*!photoDraftPersistenceFailed\s*\)\s*"
            r"scheduleDraftSave\(\)",
        )
        self.assertIn("photoPreparationFailed = true", self.editor_js)
        self.assertGreaterEqual(
            self.editor_js.count("if (photoPreparationFailed)"),
            2,
        )

    def test_all_draft_media_writes_are_atomic_and_awaited(self):
        batch_writer = balanced_block(
            self.editor_js,
            r"async\s+function\s+persistDraftFileChanges\s*\(",
        )
        persist_photos = balanced_block(
            self.editor_js,
            r"async\s+function\s+persistProcessedPhotoOrder\s*\(",
        )
        persist_login = balanced_block(
            self.editor_js,
            r"async\s+function\s+persistDraftBeforeLogin\s*\(",
        )
        save_draft = balanced_block(
            self.editor_js, r"function\s+saveDraftNow\s*\(",
        )
        self.assertIn('db.transaction(DRAFT_STORE, "readwrite")', batch_writer)
        self.assertIn("updates.forEach", batch_writer)
        self.assertIn("tx.onabort", batch_writer)
        self.assertIn("await persistDraftFileChanges(changes)", persist_photos)
        self.assertNotIn("await putDraftFile", persist_photos)
        self.assertNotIn("await deleteDraftFile", persist_photos)
        self.assertIn('changes.push({ key: "video"', persist_login)
        self.assertIn('changes.push({ key: "captions"', persist_login)
        self.assertIn("await persistDraftFileChanges(changes)", persist_login)
        self.assertIn("auxiliaryMediaPersistencePending", save_draft)

        self.assertIn(
            'queueAuxiliaryMediaPersistence("video", file)',
            self.editor_js,
        )
        self.assertIn(
            'queueAuxiliaryMediaPersistence("captions", file)',
            self.editor_js,
        )
        self.assertGreaterEqual(
            self.editor_js.count("await waitForAuxiliaryMediaPersistence(false)"),
            2,
        )

    def test_manager_keeps_media_metadata_when_signing_temporarily_fails(self):
        signer = balanced_block(
            self.profile_content, r"async\s+function\s+signedMedia\s*\(",
        )
        self.assertIn("if (!includePath) return null", signer)
        self.assertIn("path: item.path", signer)
        self.assertIn("unavailable: true", signer)

        existing_media = balanced_block(
            self.editor_js, r"function\s+showExistingMedia\s*\(",
        )
        self.assertRegex(existing_media, r"if\s*\(\s*item\.url\s*\)")
        self.assertIn("nuotraukų peržiūra laikinai nepasiekiama", existing_media)

    def test_memorial_renderer_appends_text_and_photo_blocks_in_one_loop(self):
        self.assertRegex(
            self.memorial_js,
            r"parseJson\(\s*atminimas\.story_blocks_json\s*,\s*\[\]\s*\)",
        )
        self.assertRegex(
            self.memorial_js,
            r"appendChild\(\s*buildStoryBlocks\(\s*storyBlocks\s*,\s*allImages\s*\)\s*\)",
        )
        renderer = balanced_block(
            self.memorial_js,
            r"function\s+(?:render|build)StoryBlocks\s*\(",
        )
        self.assertTrue(renderer, "Trūksta atminimo puslapio blokų rendererio")
        self.assertRegex(
            renderer,
            r"(?:storyBlocks|blocks)\.forEach\s*\(",
        )
        self.assertRegex(renderer, r'block\.type\s*===\s*"text"')
        self.assertRegex(renderer, r'block\.type\s*!==\s*"photo"')
        self.assertIn("block.photoOrder", renderer)
        self.assertIn("textContent", renderer)
        self.assertIn('className = "memorial-story-block memorial-story-block--text"', renderer)
        self.assertIn(
            'className = "memorial-story-block memorial-story-block--photo ',
            renderer,
        )
        self.assertIn("section.appendChild(text)", renderer)
        self.assertIn("section.appendChild(figure)", renderer)
        self.assertNotRegex(renderer, r"blocks\.(?:filter|sort)\s*\(")

    def test_mobile_preview_actions_are_compact_and_non_sticky(self):
        self.assertRegex(
            self.editor_html,
            r'class="[^"]*\beditor-final-actions\b[^"]*\bpreview-actions\b[^"]*"'
            r"\s+data-preview-actions",
        )
        mobile_candidates = balanced_blocks(
            self.styles,
            r"@media\s*\(\s*max-width\s*:\s*860px\s*\)",
        )
        mobile = next(
            (block for block in mobile_candidates if ".preview-actions" in block),
            "",
        )
        self.assertTrue(mobile, "Trūksta redaktoriaus mobilios media taisyklės")
        actions = balanced_block(
            mobile,
            r"\.preview-actions\s*\{",
        )
        buttons = balanced_block(
            mobile,
            r"\.preview-actions\s+(?:button|\.button)\s*\{",
        )
        self.assertRegex(actions, r"position\s*:\s*static")
        self.assertRegex(actions, r"flex-direction\s*:\s*column")
        self.assertRegex(actions, r"flex-wrap\s*:\s*nowrap")
        self.assertRegex(actions, r"gap\s*:\s*(?:8|9|10|11|12)px")
        self.assertRegex(buttons, r"width\s*:\s*100%")
        self.assertRegex(buttons, r"min-height\s*:\s*(?:4[89]|5[0-6])px")
        self.assertRegex(
            buttons,
            r"padding\s*:\s*(?:12|13|14|15|16)px"
            r"(?:\s+(?:12|13|14|15|16)px)?",
        )
        self.assertRegex(buttons, r"flex\s*:\s*0\s+0\s+auto")
        self.assertRegex(buttons, r"height\s*:\s*auto")


if __name__ == "__main__":
    unittest.main(verbosity=2)
