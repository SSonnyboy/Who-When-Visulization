import json
from collections import Counter
from urllib.parse import parse_qs, urlparse

from workers import Response, WorkerEntrypoint


DATASET_ASSETS = {
    "cn": "/all-data-cn.json",
    "en": "/all-data.json",
}


def json_response(payload, status=200):
    return Response(
        json.dumps(payload, ensure_ascii=False),
        status=status,
        headers={
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
    )


def text_response(body, status=200, headers=None):
    response_headers = {"content-type": "text/plain; charset=utf-8"}
    if headers:
        response_headers.update(headers)
    return Response(body, status=status, headers=response_headers)


def first_value(params, key, default=None):
    values = params.get(key)
    if not values:
        return default
    return values[0]


def parse_int(value, default, minimum=0, maximum=None):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    if parsed < minimum:
        return minimum
    if maximum is not None and parsed > maximum:
        return maximum
    return parsed


def build_case_preview(item, lang):
    if lang == "cn":
        question = item.get("question_cn") or item.get("question") or ""
    else:
        question = item.get("question") or item.get("question_cn") or ""
    return {
        "id": item.get("id"),
        "dataset": item.get("dataset"),
        "level": item.get("level"),
        "question": question,
        "question_id": item.get("question_ID"),
        "mistake_agent": item.get("mistake_agent"),
        "mistake_step": item.get("mistake_step"),
        "is_correct": item.get("is_correct"),
    }


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        base_path = getattr(self.env, "BASE_PATH", "/who&when").rstrip("/")
        parsed_url = urlparse(request.url)
        path = parsed_url.path or "/"
        suffix = f"?{parsed_url.query}" if parsed_url.query else ""

        if path == "/":
            return self.redirect_to_base(base_path, suffix)

        if path == base_path:
            return text_response("", status=307, headers={"Location": f"{base_path}/{suffix}"})

        if not path.startswith(f"{base_path}/"):
            return text_response("Not Found", status=404)

        relative_path = path[len(base_path) :] or "/"

        if relative_path.startswith("/api/"):
            return await self.handle_api(relative_path, parsed_url.query, base_path)

        return await self.serve_asset(relative_path)

    def redirect_to_base(self, base_path, suffix=""):
        return text_response("", status=307, headers={"Location": f"{base_path}/{suffix}"})

    async def handle_api(self, relative_path, raw_query, base_path):
        params = parse_qs(raw_query, keep_blank_values=False)

        if relative_path == "/api/health":
            return json_response(
                {
                    "status": "ok",
                    "service": "who-when-python-worker",
                    "base_path": base_path,
                    "route_pattern": "vis.102465.xyz/who&when*",
                }
            )

        lang = self.resolve_lang(params)
        cases = await self.load_cases(lang)
        if isinstance(cases, Response):
            return cases

        if relative_path == "/api/summary":
            return json_response(self.build_summary(cases, lang))

        if relative_path == "/api/cases":
            return json_response(self.list_cases(cases, params, lang))

        if relative_path.startswith("/api/cases/"):
            case_id = relative_path[len("/api/cases/") :].strip()
            payload, status = self.get_case_detail(cases, case_id, lang)
            return json_response(payload, status=status)

        return json_response({"error": "Unknown API endpoint."}, status=404)

    def resolve_lang(self, params):
        requested = (first_value(params, "lang", getattr(self.env, "DEFAULT_DATASET_LANG", "cn")) or "cn").lower()
        if requested in DATASET_ASSETS:
            return requested
        return getattr(self.env, "DEFAULT_DATASET_LANG", "cn")

    async def load_cases(self, lang):
        asset_path = DATASET_ASSETS.get(lang, DATASET_ASSETS["cn"])
        response = await self.env.ASSETS.fetch(f"https://assets.local{asset_path}")
        if not response.ok:
            return json_response(
                {
                    "error": "Failed to load bundled dataset asset.",
                    "asset_path": asset_path,
                },
                status=500,
            )

        return await response.json()

    def build_summary(self, cases, lang):
        dataset_counter = Counter()
        level_counter = Counter()
        mistake_counter = Counter()
        correct_count = 0

        for item in cases:
            dataset_counter[item.get("dataset") or "unknown"] += 1
            level_counter[str(item.get("level") or "unknown")] += 1
            if item.get("mistake_agent"):
                mistake_counter[item["mistake_agent"]] += 1
            if item.get("is_correct"):
                correct_count += 1

        return {
            "lang": lang,
            "total_cases": len(cases),
            "correct_cases": correct_count,
            "incorrect_cases": len(cases) - correct_count,
            "datasets": dict(dataset_counter),
            "levels": dict(level_counter),
            "top_mistake_agents": [
                {"name": name, "count": count}
                for name, count in mistake_counter.most_common(10)
            ],
        }

    def list_cases(self, cases, params, lang):
        dataset = first_value(params, "dataset", "all")
        search = (first_value(params, "search", "") or "").strip().lower()
        limit = parse_int(first_value(params, "limit", "20"), default=20, minimum=1, maximum=100)
        offset = parse_int(first_value(params, "offset", "0"), default=0, minimum=0)

        filtered = []
        for item in cases:
            if dataset not in ("", "all", None) and item.get("dataset") != dataset:
                continue

            if search:
                searchable = " ".join(
                    [
                        item.get("id") or "",
                        item.get("question") or "",
                        item.get("question_cn") or "",
                        item.get("mistake_agent") or "",
                        item.get("mistake_reason") or "",
                        item.get("mistake_reason_cn") or "",
                    ]
                ).lower()
                if search not in searchable:
                    continue

            filtered.append(item)

        page_items = filtered[offset : offset + limit]

        return {
            "lang": lang,
            "dataset": dataset,
            "search": search,
            "total": len(filtered),
            "limit": limit,
            "offset": offset,
            "items": [build_case_preview(item, lang) for item in page_items],
        }

    def get_case_detail(self, cases, case_id, lang):
        decoded_case_id = case_id.strip()
        for item in cases:
            if item.get("id") == decoded_case_id:
                return (
                    {
                        "lang": lang,
                        "item": item,
                    },
                    200,
                )

        return (
            {
                "lang": lang,
                "error": "Case not found.",
                "case_id": decoded_case_id,
            },
            404,
        )

    async def serve_asset(self, relative_path):
        asset_path = relative_path or "/"
        if asset_path in ("", "/"):
            asset_path = "/index.html"

        response = await self.env.ASSETS.fetch(f"https://assets.local{asset_path}")
        if response.ok:
            return response

        if asset_path != "/index.html":
            fallback = await self.env.ASSETS.fetch("https://assets.local/index.html")
            if fallback.ok and asset_path.endswith("/"):
                return fallback

        return text_response("Asset not found.", status=404)
