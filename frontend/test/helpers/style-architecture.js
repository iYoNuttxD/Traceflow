// Structural CSS ownership/token checks. These do not establish rendered cascade or contrast.
export function styleRules(parent) {
  return Array.from(parent.cssRules).flatMap((rule) => [
    ...(rule.style ? [rule] : []),
    ...(rule.cssRules ? styleRules(rule) : [])
  ]);
}

const contextualColors = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer'
]);
const colorFunctionOrHex = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
const colorProperty =
  /^(?:--|(?:background|border|outline|column-rule|text-decoration|text-emphasis)(?:-|$)|(?:color|fill|stroke|accent-color|caret-color|box-shadow|text-shadow|filter)$)/;

export function literalColorDeclarations(stylesheet) {
  const probe = document.createElement('span').style;
  return styleRules(stylesheet).flatMap((rule) =>
    Array.from(rule.style).flatMap((property) => {
      const value = rule.style.getPropertyValue(property);
      // Strings and URL contents are not color values. Keep var() fallbacks and color-mix()
      // arguments so a literal cannot hide behind a token or a theme-aware function.
      const colorValue = value.replace(/url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gi, '');
      const namedColor =
        colorProperty.test(property) &&
        (colorValue.match(/[-a-z_][\w-]*/gi) ?? []).some((word) => {
          if (contextualColors.has(word.toLowerCase())) return false;
          probe.color = '';
          probe.color = word;
          return probe.color !== '';
        });
      return colorFunctionOrHex.test(colorValue) || namedColor
        ? [{ selector: rule.selectorText, property, value }]
        : [];
    })
  );
}

export function themeSpecificRules(parent) {
  return Array.from(parent.cssRules).flatMap((rule) => [
    ...(/data-theme/i.test(rule.selectorText ?? '') ||
    /prefers-color-scheme/i.test(rule.conditionText ?? '')
      ? [rule.cssText]
      : []),
    ...(rule.cssRules ? themeSpecificRules(rule) : [])
  ]);
}

export function unscopedSprintSelectors(stylesheet) {
  return styleRules(stylesheet).flatMap((rule) =>
    // Fail closed for functional selector lists: each branch mentioning SprintDialog/Menu
    // must have its own explicit Requirements owner, rather than inheriting a sibling's scope.
    (rule.selectorText ?? '')
      .split(',')
      .map((selector) => selector.trim())
      .filter(
        (selector) =>
          /\.sprint-(?:dialog|menu)(?:\b|[-_])/.test(selector) &&
          // A sibling of the Requirements owner is outside its scope. Requiring the next
          // non-whitespace token to differ from +/~ still permits descendant/child rules.
          !/^\.(?:requirements-screen|requirement-(?:form|details)-dialog)\s+(?![+~\s])/.test(
            selector
          )
      )
  );
}
