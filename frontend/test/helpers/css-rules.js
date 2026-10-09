// Use the test environment's CSSOM rather than scanning across unrelated rule blocks.
export function parseStylesheet(source) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(source);
  return sheet;
}

const normalize = (value) => value.trim().replace(/\s+/g, ' ');

function uniqueRule(parent, matches, description) {
  const rules = Array.from(parent.cssRules).filter(matches);
  if (rules.length !== 1) {
    throw new Error(`Expected one CSS rule for ${description}, found ${rules.length}`);
  }
  return rules[0];
}

export function ruleDeclarations(parent, selector) {
  const { style } = uniqueRule(
    parent,
    (rule) => rule.selectorText && normalize(rule.selectorText) === normalize(selector),
    selector
  );
  return Object.fromEntries(
    Array.from(style, (property) => [property, style.getPropertyValue(property)])
  );
}

export function conditionalRules(parent, kind, condition) {
  return uniqueRule(
    parent,
    (rule) => rule.cssText.startsWith(`@${kind} `) && rule.conditionText === condition,
    `@${kind} ${condition}`
  );
}
