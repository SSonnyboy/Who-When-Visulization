const DATASET_ASSETS = {
  cn: "/who_when/all-data-cn.json",
  en: "/who_when/all-data.json",
};

const ASSET_ORIGIN = "https://assets.local";

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

function textResponse(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "text/plain; charset=utf-8");

  return new Response(body, {
    ...init,
    headers,
  });
}

function firstValue(params, key, fallback = null) {
  return params.get(key) ?? fallback;
}

function parseIntParam(value, fallback, minimum = 0, maximum) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  if (parsed < minimum) {
    return minimum;
  }

  if (maximum !== undefined && parsed > maximum) {
    return maximum;
  }

  return parsed;
}

function normalizeBasePath(value) {
  const raw = String(value ?? "/").trim();
  if (raw === "" || raw === "/") {
    return "";
  }

  return `/${raw.replace(/^\/+|\/+$/g, "")}`;
}

function resolveBasePath(env) {
  return normalizeBasePath(env.BASE_PATH ?? "/");
}

function resolveLang(params, env) {
  const fallback = String(env.DEFAULT_DATASET_LANG ?? "cn").toLowerCase();
  const requested = String(firstValue(params, "lang", fallback) ?? fallback).toLowerCase();

  if (requested in DATASET_ASSETS) {
    return requested;
  }

  return fallback in DATASET_ASSETS ? fallback : "cn";
}

function buildCasePreview(item, lang) {
  const question =
    lang === "cn"
      ? item.question_cn || item.question || ""
      : item.question || item.question_cn || "";

  return {
    id: item.id,
    dataset: item.dataset,
    level: item.level,
    question,
    question_id: item.question_ID,
    mistake_agent: item.mistake_agent,
    mistake_step: item.mistake_step,
    is_correct: item.is_correct,
  };
}

function incrementCounter(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function counterToObject(counter) {
  return Object.fromEntries(counter.entries());
}

function buildSummary(cases, lang) {
  const datasetCounter = new Map();
  const levelCounter = new Map();
  const mistakeCounter = new Map();
  let correctCount = 0;

  for (const item of cases) {
    incrementCounter(datasetCounter, item.dataset || "unknown");
    incrementCounter(levelCounter, String(item.level || "unknown"));

    if (item.mistake_agent) {
      incrementCounter(mistakeCounter, item.mistake_agent);
    }

    if (item.is_correct) {
      correctCount += 1;
    }
  }

  const topMistakeAgents = Array.from(mistakeCounter.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return {
    lang,
    total_cases: cases.length,
    correct_cases: correctCount,
    incorrect_cases: cases.length - correctCount,
    datasets: counterToObject(datasetCounter),
    levels: counterToObject(levelCounter),
    top_mistake_agents: topMistakeAgents,
  };
}

function listCases(cases, params, lang) {
  const dataset = firstValue(params, "dataset", "all");
  const search = String(firstValue(params, "search", "") ?? "")
    .trim()
    .toLowerCase();
  const limit = parseIntParam(firstValue(params, "limit", "20"), 20, 1, 100);
  const offset = parseIntParam(firstValue(params, "offset", "0"), 0, 0);

  const filtered = cases.filter((item) => {
    if (dataset && dataset !== "all" && item.dataset !== dataset) {
      return false;
    }

    if (!search) {
      return true;
    }

    const searchable = [
      item.id || "",
      item.question || "",
      item.question_cn || "",
      item.mistake_agent || "",
      item.mistake_reason || "",
      item.mistake_reason_cn || "",
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(search);
  });

  const pageItems = filtered.slice(offset, offset + limit);

  return {
    lang,
    dataset,
    search,
    total: filtered.length,
    limit,
    offset,
    items: pageItems.map((item) => buildCasePreview(item, lang)),
  };
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getCaseDetail(cases, caseId, lang) {
  const decodedCaseId = safeDecodeURIComponent(caseId.trim());

  for (const item of cases) {
    if (item.id === decodedCaseId) {
      return [{ lang, item }, 200];
    }
  }

  return [
    {
      lang,
      error: "Case not found.",
      case_id: decodedCaseId,
    },
    404,
  ];
}

async function loadCases(env, lang) {
  const assetPath = DATASET_ASSETS[lang] ?? DATASET_ASSETS.cn;
  const response = await env.ASSETS.fetch(new URL(assetPath, ASSET_ORIGIN));

  if (!response.ok) {
    return jsonResponse(
      {
        error: "Failed to load bundled dataset asset.",
        asset_path: assetPath,
      },
      { status: 500 },
    );
  }

  return response.json();
}

async function handleApi(relativePath, params, basePath, env) {
  if (relativePath === "/api/health") {
    return jsonResponse({
      status: "ok",
      service: "who-when-js-worker",
      base_path: basePath || "/",
      route_patterns: ["vis.102465.xyz/who_when*"],
    });
  }

  const lang = resolveLang(params, env);
  const cases = await loadCases(env, lang);
  if (cases instanceof Response) {
    return cases;
  }

  if (relativePath === "/api/summary") {
    return jsonResponse(buildSummary(cases, lang));
  }

  if (relativePath === "/api/cases") {
    return jsonResponse(listCases(cases, params, lang));
  }

  if (relativePath.startsWith("/api/cases/")) {
    const caseId = relativePath.slice("/api/cases/".length).trim();
    const [payload, status] = getCaseDetail(cases, caseId, lang);
    return jsonResponse(payload, { status });
  }

  return jsonResponse({ error: "Unknown API endpoint." }, { status: 404 });
}

function redirectToBase(basePath, suffix = "") {
  return textResponse("", {
    status: 307,
    headers: {
      Location: `${basePath}/${suffix}`,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname || "/";
    const basePath = resolveBasePath(env);

    if (basePath && path === basePath) {
      return redirectToBase(basePath, url.search || "");
    }

    const apiPrefix = basePath ? `${basePath}/api/` : "/api/";
    if (path.startsWith(apiPrefix)) {
      const relativePath = basePath ? path.slice(basePath.length) : path;
      return handleApi(relativePath, url.searchParams, basePath, env);
    }

    return textResponse("Not Found", { status: 404 });
  },
};
