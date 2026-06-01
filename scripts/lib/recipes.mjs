export const MOCKUP_VIEWPORTS = [
  { name: "mobile", width: 375, height: 900 },
  { name: "tablet", width: 768, height: 1000 },
  { name: "desktop", width: 1440, height: 1000 },
];

const FOCUSED_KINDS = new Set([
  "chart",
  "table",
  "grid",
  "viz",
  "visualization",
  "data-viz",
  "data-visualization",
  "decision",
  "decision-area",
  "metric",
  "kpi",
  "report",
]);

function compactName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "focus";
}

function screenshotAction(selector, kind, name, optional = false) {
  return {
    type: "screenshotElement",
    selector,
    name: name || kind || "focused-evidence",
    focusedEvidenceKind: kind || "decision-area",
    optional,
  };
}

function waitStable() {
  return { type: "waitForStableLayout", ms: 180 };
}

export function parseFocusSpec(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const text = String(value).trim();
  if (!text) return null;

  if (text.includes("|")) {
    const [selector, kind = "decision-area", name] = text.split("|");
    return { selector: selector.trim(), kind: kind.trim(), name: name?.trim() || compactName(kind) };
  }

  const lastColon = text.lastIndexOf(":");
  if (lastColon > 0) {
    const selector = text.slice(0, lastColon).trim();
    const kind = text.slice(lastColon + 1).trim();
    if (FOCUSED_KINDS.has(kind)) return { selector, kind, name: compactName(kind) };
  }

  return { selector: text, kind: "decision-area", name: "focused-evidence" };
}

export function normalizeRecipeName(value) {
  const name = compactName(value);
  const aliases = {
    dashboard: "dashboard-basic",
    "dashboard-basic": "dashboard-basic",
    "data-table": "data-table",
    table: "data-table",
    grid: "data-table",
    "search-filter": "form-search-filter",
    "form-search-filter": "form-search-filter",
    filter: "form-search-filter",
    "mobile-card": "mobile-card",
    cards: "mobile-card",
    marketing: "marketing-hero",
    "marketing-hero": "marketing-hero",
  };
  return aliases[name] || name;
}

export function statesForRecipe(recipeName) {
  const recipe = normalizeRecipeName(recipeName);
  if (recipe === "dashboard-basic") {
    return [
      {
        name: "recipe-dashboard-decision-area",
        actions: [
          waitStable(),
          screenshotAction("[data-qa='decision-area'], [data-qa='primary-chart'], [data-qa='dashboard-main'], main, body", "decision-area", "dashboard-decision-area"),
        ],
      },
      {
        name: "recipe-dashboard-table-or-grid",
        actions: [
          waitStable(),
          screenshotAction("table, [role='table'], [role='grid'], [data-qa='data-grid'], main, body", "table", "dashboard-table-or-grid"),
        ],
      },
    ];
  }
  if (recipe === "data-table") {
    return [
      {
        name: "recipe-data-table",
        actions: [
          waitStable(),
          screenshotAction("table, [role='table'], [role='grid'], [data-qa='data-table'], main, body", "table", "data-table"),
        ],
      },
    ];
  }
  if (recipe === "form-search-filter") {
    return [
      {
        name: "recipe-search-focus",
        actions: [
          { type: "focus", selector: "input[type='search'], [role='searchbox'], input[placeholder*='Search'], input[name*='search']", optional: true },
          { type: "wait", ms: 160 },
          screenshotAction("input[type='search'], [role='searchbox'], input[placeholder*='Search'], input[name*='search']", "decision-area", "search-focus", true),
        ],
      },
      {
        name: "recipe-filter-open",
        actions: [
          { type: "click", selector: "[aria-haspopup='listbox'], [aria-haspopup='menu'], [role='combobox'], select, button:has-text('Filter'), button:has-text('Filters')", optional: true },
          { type: "wait", ms: 180 },
          screenshotAction("[role='listbox'], [role='menu'], [data-qa*='filter'], main, body", "decision-area", "filter-open"),
        ],
      },
    ];
  }
  if (recipe === "mobile-card") {
    return [
      {
        name: "recipe-mobile-card",
        actions: [
          waitStable(),
          screenshotAction("[data-card], [data-qa*='card'], article, li, main, body", "grid", "mobile-card-grid"),
        ],
      },
    ];
  }
  if (recipe === "marketing-hero") {
    return [
      {
        name: "recipe-marketing-first-viewport",
        actions: [
          waitStable(),
          screenshotAction("header, [data-qa='hero'], main, body", "decision-area", "marketing-first-viewport"),
        ],
      },
    ];
  }
  return [];
}

export function statesForFocusTargets(focusTargets = []) {
  return focusTargets
    .map(parseFocusSpec)
    .filter(Boolean)
    .map((focus, index) => ({
      name: `focused-evidence-${index + 1}-${compactName(focus.name || focus.kind)}`,
      actions: [
        waitStable(),
        screenshotAction(focus.selector, focus.kind || "decision-area", focus.name || focus.kind || `focus-${index + 1}`),
      ],
    }));
}

export function applyQaRecipes(config, options = {}) {
  const recipes = [...new Set((options.recipes || []).map(normalizeRecipeName).filter(Boolean))];
  const focus = (options.focus || []).map(parseFocusSpec).filter(Boolean);
  const recipeStates = recipes.flatMap((recipe) => statesForRecipe(recipe));
  const focusStates = statesForFocusTargets(focus);
  if (!recipes.length && !focus.length) return config;
  return {
    ...config,
    recipes,
    focus,
    states: [
      ...(config.states?.length ? config.states : [{ name: "default" }]),
      ...recipeStates,
      ...focusStates,
    ],
  };
}

export function inferRecipesForSurface(surface = "", profile = "") {
  const text = `${surface} ${profile}`.toLowerCase();
  const recipes = [];
  if (/dashboard|analytics|report|data-viz|visualization|metrics/.test(text)) recipes.push("dashboard-basic");
  if (/table|grid|catalog|reference|admin|dense/.test(text)) recipes.push("data-table");
  if (/search|filter|form/.test(text)) recipes.push("form-search-filter");
  if (/mobile|card|list/.test(text)) recipes.push("mobile-card");
  if (/marketing|landing|homepage|editorial/.test(text)) recipes.push("marketing-hero");
  return [...new Set(recipes)];
}
