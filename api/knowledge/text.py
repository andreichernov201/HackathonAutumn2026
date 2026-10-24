import re
from functools import lru_cache

import snowballstemmer


@lru_cache(maxsize=32000)
def stem(word: str) -> str:
    # Instantiate per uncached call: Snowball's stemmer mutates internal state,
    # so sharing a single instance across FastAPI threads would race.
    return snowballstemmer.stemmer('russian').stemWord(word.lower())


def stem_text(text: str) -> str:
    return ' '.join(stem(word) for word in re.findall(r'\w+', text, re.UNICODE))
