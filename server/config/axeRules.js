// Documented, selected axe-core rule set for AccessFlow (proposal: "a selected set of rules").
// Detection is limited to these rules; AccessFlow does NOT claim full WCAG coverage or conformance.
// IDs that the installed axe-core version does not know are skipped at runtime and reported
// as a scan warning (see axeRunner.js), so a version bump can never crash a scan.

export const RULESET_ID = 'accessflow-core-v1';

export const SELECTED_RULES = [
  // Text alternatives and names (WCAG 1.1.1, 4.1.2, 2.4.4)
  'image-alt', 'input-image-alt', 'button-name', 'link-name', 'select-name', 'frame-title',
  'svg-img-alt', 'object-alt',
  // Forms and labels (1.3.1, 3.3.2, 1.3.5)
  'label', 'form-field-multiple-labels', 'autocomplete-valid',
  // Colour (1.4.3)
  'color-contrast',
  // Document structure and language (2.4.2, 3.1.1, 3.1.2, 1.3.1)
  'document-title', 'html-has-lang', 'html-lang-valid', 'valid-lang',
  'empty-heading', 'heading-order', 'page-has-heading-one', 'landmark-one-main', 'region',
  'list', 'listitem', 'duplicate-id-aria',
  // Keyboard and focus (2.1.1, 2.4.1, 4.1.2)
  'bypass', 'tabindex', 'scrollable-region-focusable', 'aria-hidden-focus', 'nested-interactive',
  // ARIA validity (4.1.2)
  'aria-allowed-attr', 'aria-required-attr', 'aria-valid-attr', 'aria-valid-attr-value', 'aria-roles',
  // Zoom and media (1.4.4, 1.2.2)
  'meta-viewport', 'video-caption',
];
