#!/usr/bin/env python
"""
Translate CHIEF dashboard dataset fields into Chinese using LongCat OpenAI-compatible API.

Usage:
    python translate_dataset_longcat.py \
        --input dashboard/all-data.json \
        --output dashboard/all-data-cn.json \
        --apikey ak_2qI0ZO4FI0vj5c05z63552oR2UO4P \
        --concurrency 4

The script caches translations locally to `translation-cache-longcat.json`.
"""

from __future__ import annotations

import argparse
import json
import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

BASE_URL = "https://api.longcat.chat/openai/v1/chat/completions"
MODEL = "LongCat-Flash-Lite"
CACHE_FILE = Path(__file__).resolve().parent / "translation-cache-longcat.json"


def load_cache() -> dict[str, str]:
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, str], cache_lock: threading.Lock) -> None:
    with cache_lock:
        snapshot = dict(cache)
    CACHE_FILE.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_text(text: str) -> str:
    cleaned = text.replace("\n", " ").replace("\r", " ")
    cleaned = " ".join(cleaned.split())
    return cleaned.strip()


def build_prompt(text: str) -> str:
    return (
        "Translate the following user-facing content into zh-CN (simplified Chinese). "
        "Keep the meaning unchanged, do not add extra explanation.\n\n"
        f"Input: {text}"
    )


def call_longcat(api_key: str, text: str) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a translation assistant. Keep output concise and only return the translated text."
                ),
            },
            {"role": "user", "content": build_prompt(text)},
        ],
    }

    resp = requests.post(BASE_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("LongCat response missing choices")
    content = choices[0].get("message", {}).get("content", "")
    return content.strip()


def translate_text(
    key: str, text: str, api_key: str, cache: dict[str, str], cache_lock: threading.Lock
) -> tuple[str, str]:
    if not text:
        return key, ""
    with cache_lock:
        if text in cache:
            return key, cache[text]

    cleaned = clean_text(text)
    for attempt in range(1, 6):
        try:
            translation = call_longcat(api_key, cleaned[:600])
            with cache_lock:
                cache[text] = translation
            return key, translation
        except requests.HTTPError as exc:
            status = exc.response.status_code
            if status in {429, 503}:
                wait = min(2 ** attempt, 20)
                time.sleep(wait)
                continue
            if status == 400:
                cleaned = cleaned[:200]
                continue
            print(f"⚠️请求被拒绝 ({status})：{exc.response.text[:120]}")
            break
        except requests.RequestException:
            time.sleep(2)
    with cache_lock:
        cache[text] = ""
    return key, ""


def build_tasks(data: list[dict[str, str]]) -> dict[str, str]:
    texts: dict[str, str] = {}
    for index, record in enumerate(data):
        question = (record.get("question") or record.get("prompt") or "").strip()
        ground = (record.get("ground_truth") or record.get("groundtruth") or "").strip()
        reason = (record.get("mistake_reason") or "").strip()
        if question:
            texts[f"question::{index}"] = question
        if ground:
            texts[f"ground::{index}"] = ground
        if reason:
            texts[f"reason::{index}"] = reason

        system_prompt = record.get("system_prompt") or {}
        if isinstance(system_prompt, dict):
            for agent_name, content in system_prompt.items():
                text = (content or "").strip()
                if text:
                    texts[f"system::{index}::{agent_name}"] = text

        history = record.get("history") or []
        if isinstance(history, list):
            for step_idx, step in enumerate(history):
                content = (step.get("content") or step.get("message") or "").strip()
                if content:
                    texts[f"history::{index}::{step_idx}"] = content
    return texts


def assemble_output(data: list[dict[str, str]], translations: dict[str, str]) -> list[dict[str, str]]:
    out = []
    for index, record in enumerate(data):
        entry = dict(record)
        entry["question_cn"] = translations.get(f"question::{index}") or ""
        entry["ground_truth_cn"] = translations.get(f"ground::{index}") or ""
        entry["mistake_reason_cn"] = translations.get(f"reason::{index}") or ""

        system_prompt = {}
        raw_system = record.get("system_prompt") or {}
        if isinstance(raw_system, dict):
            for agent_name in raw_system:
                system_prompt[agent_name] = translations.get(
                    f"system::{index}::{agent_name}"
                )
        entry["system_prompt_cn"] = system_prompt

        history_cn = []
        raw_history = record.get("history") or []
        for step_idx, _ in enumerate(raw_history if isinstance(raw_history, list) else []):
            history_cn.append(translations.get(f"history::{index}::{step_idx}") or "")
        entry["history_cn"] = history_cn
        out.append(entry)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Translate dashboard dataset using LongCat")
    parser.add_argument("--input", type=Path, default="./all-data.json")
    parser.add_argument("--output", type=Path, default="./all-data-cn.json")
    parser.add_argument("--apikey", type=str, default="ak_2qI0ZO4FI0vj5c05z63552oR2UO4P")
    parser.add_argument("--concurrency", type=int, default=8)
    args = parser.parse_args()

    if not args.input.exists():
        raise FileNotFoundError(f"{args.input} not found")

    data = json.loads(args.input.read_text(encoding="utf-8"))
    tasks = build_tasks(data)
    cache = load_cache()
    translations: dict[str, str] = {}
    lock = threading.Lock()
    cache_lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {
            executor.submit(
                translate_text, key, text, args.apikey, cache, cache_lock
            ): key
            for key, text in tasks.items()
        }
        total = len(futures)
        for i, future in enumerate(as_completed(futures), 1):
            key = futures[future]
            try:
                _, translation = future.result()
            except Exception as exc:
                print(f"❌ Translation failed for {key}: {exc}")
                translation = ""
            with lock:
                translations[key] = translation
                if i % 20 == 0 or i == total:
                    print(f"✅ translated {i}/{total} texts; cache size {len(cache)}")
                    save_cache(cache, cache_lock)

    translated_data = assemble_output(data, translations)
    args.output.write_text(json.dumps(translated_data, ensure_ascii=False, indent=2), encoding="utf-8")
    save_cache(cache, cache_lock)
    print(f"完成，结果写入 {args.output}")


if __name__ == "__main__":
    main()
