import csv
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path


SOURCE = Path("src/assets/deck-fondations-2k/Fondations-2k.csv")
TARGET = Path("src/assets/deck-fondations-2k/Fondations-2k-English.csv")
ENV_FILE = Path(".env")
DEEPL_ENDPOINT = "https://api-free.deepl.com/v2/translate"
TRANSLATABLE_COLUMNS = ("SentFrench", "VocabDef", "Note")


def read_env_value(key: str) -> str | None:
    if not ENV_FILE.exists():
        return None

    for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() != key:
            continue
        cleaned = value.strip()
        if cleaned.startswith('"') and cleaned.endswith('"'):
            cleaned = cleaned[1:-1]
        if cleaned.startswith("'") and cleaned.endswith("'"):
            cleaned = cleaned[1:-1]
        return cleaned

    return None


ARABIC_SPAN_PATTERN = re.compile(r"[\u0600-\u06FF]+")


def protect_arabic_spans(text: str) -> tuple[str, dict[str, str]]:
    placeholders: dict[str, str] = {}

    def replacer(match: re.Match[str]) -> str:
        token = f"__ARABIC_{len(placeholders)}__"
        placeholders[token] = match.group(0)
        return token

    protected = ARABIC_SPAN_PATTERN.sub(replacer, text)
    return protected, placeholders


def restore_arabic_spans(text: str, placeholders: dict[str, str]) -> str:
    restored = text
    for token, original in placeholders.items():
        restored = restored.replace(token, original)
    return restored


def deepl_translate_batch(texts: list[str], api_key: str) -> list[str]:
    payload_parts: list[tuple[str, str]] = [
        ("auth_key", api_key),
        ("source_lang", "FR"),
        ("target_lang", "EN"),
        ("preserve_formatting", "1"),
        ("split_sentences", "nonewlines"),
    ]
    for text in texts:
        payload_parts.append(("text", text))

    payload = urllib.parse.urlencode(payload_parts).encode("utf-8")
    request = urllib.request.Request(
        DEEPL_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8")
    parsed = json.loads(body)
    return [item["text"].strip() for item in parsed.get("translations", [])]


def main() -> None:
    api_key = read_env_value("DEEPL_API_KEY") or read_env_value("DEEPL_API_KEY2")
    if not api_key:
        raise RuntimeError("DeepL API key not found in .env")

    rows: list[dict[str, str]] = []
    with SOURCE.open("r", encoding="utf-8-sig", newline="") as source_file:
        reader = csv.DictReader(source_file, delimiter=";")
        if reader.fieldnames is None:
            raise RuntimeError("Missing CSV headers")
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append({key: (value or "") for key, value in row.items()})

    unique_values: list[str] = []
    seen_values: set[str] = set()
    for row in rows:
        for column in TRANSLATABLE_COLUMNS:
            value = (row.get(column, "") or "").strip()
            if not value or value in seen_values:
                continue
            seen_values.add(value)
            unique_values.append(value)

    cache: dict[str, str] = {}
    chunk_size = 40
    for offset in range(0, len(unique_values), chunk_size):
        chunk_original = unique_values[offset : offset + chunk_size]
        protected_chunk: list[str] = []
        placeholder_maps: list[dict[str, str]] = []
        for original in chunk_original:
            protected, placeholders = protect_arabic_spans(original)
            protected_chunk.append(protected)
            placeholder_maps.append(placeholders)

        translations: list[str] = []
        for attempt in range(5):
            try:
                translations = deepl_translate_batch(protected_chunk, api_key)
                break
            except Exception:
                if attempt == 4:
                    translations = protected_chunk
                    break
                time.sleep(0.7 * (attempt + 1))

        for index, original in enumerate(chunk_original):
            translated = translations[index] if index < len(translations) else protected_chunk[index]
            translated = restore_arabic_spans(translated, placeholder_maps[index])
            cache[original] = translated if translated else original

        time.sleep(0.15)

    for row in rows:
        for column in TRANSLATABLE_COLUMNS:
            current = (row.get(column, "") or "").strip()
            if not current:
                continue
            row[column] = cache.get(current, current)

    with TARGET.open("w", encoding="utf-8", newline="") as target_file:
        writer = csv.DictWriter(
            target_file,
            fieldnames=fieldnames,
            delimiter=";",
            quotechar='"',
            quoting=csv.QUOTE_MINIMAL,
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {TARGET}")
    print(f"Unique translated strings: {len(cache)}")


if __name__ == "__main__":
    main()
