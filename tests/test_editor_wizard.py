import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class EditorWizardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = (ROOT / "redaktorius.html").read_text(encoding="utf-8")
        cls.script = (ROOT / "assets" / "redaktorius.js").read_text(encoding="utf-8")
        cls.styles = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")

    def test_five_steps_start_with_only_first_step_visible(self):
        sections = re.findall(
            r'<section class="editor-step([^"]*)"[^>]+data-editor-step="([^"]+)"[^>]*>',
            self.page,
        )
        self.assertEqual(
            [name for _, name in sections],
            ["text", "colors", "files", "positions", "preview"],
        )
        self.assertIn("is-active", sections[0][0])
        first_tag = re.search(
            r'<section class="editor-step is-active"[^>]+data-editor-step="text"[^>]*>',
            self.page,
        ).group(0)
        self.assertIn('aria-hidden="false"', first_tag)
        for step in ("colors", "files", "positions", "preview"):
            tag = re.search(
                rf'<section class="editor-step"[^>]+data-editor-step="{step}"[^>]*>',
                self.page,
            ).group(0)
            self.assertIn('aria-hidden="true"', tag)
            self.assertRegex(tag, r"\shidden(?:\s|>)")

    def test_stepper_controls_steps_and_exposes_progress(self):
        for step in ("text", "colors", "files", "positions", "preview"):
            self.assertRegex(
                self.page,
                rf'data-editor-step-button="{step}"[^>]+aria-controls="editor-section-{step}"',
            )
        self.assertIn('role="progressbar"', self.page)
        self.assertIn('aria-valuenow="1"', self.page)
        self.assertIn('id="editor-step-status" role="status" aria-live="polite"', self.page)

    def test_script_hides_inactive_steps_and_moves_focus(self):
        self.assertIn("step.hidden = !active;", self.script)
        self.assertIn('step.setAttribute("aria-hidden", String(!active));', self.script)
        self.assertIn('button.classList.toggle("is-complete"', self.script)
        self.assertIn('heading.focus({ preventScroll: true });', self.script)
        self.assertIn('"Toliau: " + editorStepLabels', self.script)
        self.assertIn("step: currentEditorStep", self.script)
        self.assertIn("currentEditorStep = draft.step", self.script)

    def test_desktop_and_mobile_share_the_same_wizard_rules(self):
        self.assertIn(".editor-step:not(.is-active) {", self.styles)
        self.assertIn(".editor-step.is-active {", self.styles)
        self.assertNotRegex(
            self.styles,
            r"@media \(min-width: 861px\)\s*\{[^}]*\.editor-step-actions[^}]*display:\s*none",
        )

    def test_mobile_final_actions_do_not_cover_the_scrollable_content(self):
        self.assertRegex(
            self.page,
            r'class="[^"]*\beditor-final-actions\b[^"]*\bpreview-actions\b[^"]*"'
            r"\s+data-preview-actions",
        )
        self.assertRegex(
            self.styles,
            r"(?s)\.preview-actions\s*\{"
            r"[^}]*position:\s*static;"
            r"[^}]*flex-direction:\s*column;"
            r"[^}]*gap:\s*10px;"
            r"[^}]*\}",
        )
        self.assertRegex(
            self.styles,
            r"(?s)\.preview-actions\s+\.button\s*\{"
            r"[^}]*flex:\s*0 0 auto;"
            r"[^}]*width:\s*100%;"
            r"[^}]*min-height:\s*52px;"
            r"[^}]*padding:\s*12px 16px;"
            r"[^}]*\}",
        )

    def test_narrow_mobile_navigation_stays_on_one_scrollable_row(self):
        self.assertRegex(
            self.styles,
            r"\.editor-topbar__nav \{\s*"
            r"grid-column: 1 / -1;\s*"
            r"display: flex;\s*"
            r"flex-wrap: nowrap;\s*"
            r"overflow-x: auto;",
        )

    def test_video_limit_and_session_are_checked_before_upload(self):
        self.assertIn("iki 50 MB", self.page)
        self.assertIn('id="editor-video-help"', self.page)
        self.assertIn("var MAX_VIDEO_BYTES = 50 * 1024 * 1024;", self.script)
        self.assertIn("file.size > MAX_VIDEO_BYTES", self.script)
        self.assertIn("AtminimasAuth.ensureFreshSession()", self.script)

    def test_optional_video_slot_is_hidden_until_a_video_exists(self):
        video_slot = re.search(
            r'<div class="editor-piece editor-video-slot"[^>]*>',
            self.page,
        ).group(0)
        self.assertIn(" hidden", video_slot)
        self.assertIn("function setVideoSlotVisible(visible)", self.script)
        self.assertIn("wrap.hidden = !visible;", self.script)
        self.assertGreaterEqual(self.script.count("setVideoSlotVisible(true);"), 3)
        self.assertGreaterEqual(self.script.count("setVideoSlotVisible(false);"), 4)

    def test_new_order_fails_closed_when_catalog_is_unavailable(self):
        self.assertIn('id="editor-product-unavailable"', self.page)
        self.assertIn("function setProductUnavailable(message)", self.script)
        self.assertIn(
            "var productAvailabilityReady = isDemoMode || !!editId || prototypeRequested;",
            self.script,
        )
        self.assertIn(
            "if (!isDemoMode && !editId && !prototypeRequested && window.AtminimasProductCatalog)",
            self.script,
        )
        self.assertIn("catalog.remote && catalog.metal", self.script)
        self.assertNotIn("}).finally(function ()", self.script)

    def test_manual_preview_opens_on_desktop_and_restores_focus(self):
        editor_mobile_media = self.styles.rfind("@media (max-width: 860px)")
        canvas_rule = self.styles.index(".editor-preview-open .editor-canvas {")
        close_rule = self.styles.index(".editor-preview-open .editor-preview-close {")
        self.assertEqual(self.styles.count(".editor-preview-open .editor-canvas {"), 1)
        self.assertLess(canvas_rule, editor_mobile_media)
        self.assertLess(close_rule, editor_mobile_media)
        self.assertIn('var canvas = document.querySelector(".editor-canvas");', self.script)
        self.assertIn("canvas.scrollTop = 0;", self.script)
        self.assertIn('canvas.setAttribute("role", "dialog");', self.script)
        self.assertIn('canvas.setAttribute("aria-modal", "true");', self.script)
        self.assertIn("previewOpener.focus();", self.script)


if __name__ == "__main__":
    unittest.main()
