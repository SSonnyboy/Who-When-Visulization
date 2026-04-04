import json
import time
from pathlib import Path

import requests


BASE_DIR = Path(__file__).resolve().parents[2]
SOURCE_FILE = BASE_DIR / 'dashboard' / 'all-data.json'
OUTPUT_FILE = BASE_DIR / 'dashboard' / 'all-data-cn.json'
CACHE_FILE = BASE_DIR / 'dashboard' / 'translation-cache.json'


def load_cache():
    if CACHE_FILE.exists():
        return json.loads(CACHE_FILE.read_text(encoding='utf-8'))
    return {}


def save_cache(cache):
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')


def translate_text(text, cache, target='zh-CN'):
    text = (text or '').strip()
    if not text:
        return ''

    if text in cache:
        return cache[text]

    params = {
        'client': 'gtx',
        'dt': 't',
        'sl': 'auto',
        'tl': target,
        'q': text
    }

    try:
        response = requests.get('https://translate.googleapis.com/translate_a/single', params=params, timeout=20)
        response.raise_for_status()
        fragments = response.json()
        translated = ''.join(part[0] for part in fragments[0] if part[0])
    except Exception as exc:
        print(f'翻译失败（使用备选）: {text} -> {exc}')
        translated = text

    cache[text] = translated
    time.sleep(0.35)
    return translated


def main():
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f'{SOURCE_FILE} 不存在')

    data = json.loads(SOURCE_FILE.read_text(encoding='utf-8'))
    cache = load_cache()

    to_translate = set()
    for item in data:
        to_translate.add((item.get('question') or item.get('prompt') or '').strip())
        to_translate.add((item.get('ground_truth') or item.get('groundtruth') or '').strip())
        to_translate.add((item.get('mistake_reason') or '').strip())

    to_translate = {text for text in to_translate if text}
    total = len(to_translate)
    for count, text in enumerate(sorted(to_translate), 1):
        translate_text(text, cache)
        if count % 20 == 0 or count == total:
            print(f'已翻译 {count}/{total} 条文本；缓存大小 {len(cache)}')
            save_cache(cache)

    translated_data = []
    for item in data:
        entry = dict(item)
        entry['question_cn'] = cache.get((item.get('question') or item.get('prompt') or '').strip(), '')
        entry['ground_truth_cn'] = cache.get((item.get('ground_truth') or item.get('groundtruth') or '').strip(), '')
        entry['mistake_reason_cn'] = cache.get((item.get('mistake_reason') or '').strip(), '')
        translated_data.append(entry)

    OUTPUT_FILE.write_text(json.dumps(translated_data, ensure_ascii=False, indent=2), encoding='utf-8')
    save_cache(cache)


if __name__ == '__main__':
    main()
