/* Sample assignment: "Word frequency counter" in Python. Six anonymised, invented submissions. */
(function (root) {
  "use strict";

  const rubric = {
    title: "Word frequency counter (20 points)",
    criteria: [
      { id: "correctness", name: "Correctness", max: 5, description: "Counts words correctly, including punctuation and case.",
        keywords: ["correct", "bug", "wrong", "output", "crash", "fail", "punctuation", "uppercase", "empty input"] },
      { id: "efficiency", name: "Efficiency", max: 4, description: "Avoids needless quadratic work.", fact: "noNestedLoops",
        keywords: ["efficien", "complex", "slow", "nested", "quadratic", "o(n", "performance"] },
      { id: "style", name: "Readability", max: 4, description: "Clear names, tidy structure.",
        keywords: ["readab", "naming", "variable name", "style", "messy", "format", "tidy", "clean"] },
      { id: "docs", name: "Comments", max: 2, description: "Helpful comments or docstrings.", fact: "hasComments",
        keywords: ["comment", "docstring", "document", "readme"] },
      { id: "testing", name: "Testing", max: 5, description: "Has meaningful tests, including edge cases.", fact: "hasTests",
        keywords: ["test", "assert", "edge case", "coverage"] }
    ]
  };

  const students = [
    {
      id: "s1", name: "Aarav", filename: "aarav_wordcount.py",
      code: `import re
from collections import Counter


def word_frequencies(text):
    """Return a Counter of lowercase words in text."""
    # Keep apostrophes inside words, drop other punctuation
    words = re.findall(r"[a-z']+", text.lower())
    return Counter(words)


def test_basic():
    assert word_frequencies("a a b")["a"] == 2


def test_punctuation_and_case():
    assert word_frequencies("Hi, hi!")["hi"] == 2


def test_empty():
    assert word_frequencies("") == Counter()
`,
      sampleNotes: "Aarav's solution is correct and handles punctuation well. Clean readable naming. Has comments and a docstring. Tests cover the edge cases nicely."
    },
    {
      id: "s2", name: "Bhavna", filename: "bhavna_wordcount.py",
      code: `def count_words(text):
    # split on spaces after removing a few punctuation marks
    words = text.lower().replace(",", "").replace(".", "").split()
    counts = {}
    for w in words:
        total = 0
        for other in words:
            if other == w:
                total += 1
        counts[w] = total
    return counts
`,
      sampleNotes: "Correct output. But there are no tests, deduct 2. Uses nested loops to count words, that's quadratic, minus 1. Naming is fine. Comments are okay."
    },
    {
      id: "s3", name: "Chirag", filename: "chirag_wordcount.py",
      code: `import string


def count_words(text):
    # remove punctuation, then count with a dict
    table = str.maketrans("", "", string.punctuation)
    counts = {}
    for word in text.lower().translate(table).split():
        counts[word] = counts.get(word, 0) + 1
    return counts


if __name__ == "__main__":
    print(count_words("the cat and the hat"))
`,
      sampleNotes: "Works correctly and the code is tidy. Good comments throughout. Nice solution overall."
    },
    {
      id: "s4", name: "Divya", filename: "divya_wordcount.py",
      code: `# word counter
def f(x):
    d = {}
    for y in x.lower().split():
        y = y.strip(".,!?")
        if y in d:
            d[y] += 1
        else:
            d[y] = 1
    return d
`,
      sampleNotes: "Correct. Slightly messy variable names, minus 1. No tests, only half a point off since the logic is simple."
    },
    {
      id: "s5", name: "Esha", filename: "esha_wordcount.py",
      code: `def count(text):
    result = {}
    for word in text.split(" "):
        word = word.strip(".,")
        result[word] = result.get(word, 0) + 1
    return result
`,
      sampleNotes: "Handles punctuation but breaks on uppercase words, a bug, deduct 1. No unit tests, minus 2. Comments are missing, deduct 1."
    },
    {
      id: "s6", name: "Farhan", filename: "farhan_wordcount.py",
      code: `def word_count(text):
    words = text.lower().split()
    counts = {}
    for word in words:
        counts[word] = counts.get(word, 0) + 1
    return counts


def test_word_count():
    assert word_count("a b a")["a"] == 2


print(word_count(""))
print(max(word_count("").values()))
`,
      sampleNotes: "Output is wrong for empty input and it crashes, minus 3. The tests are thin, minus 2. Code is clean."
    }
  ];

  const api = { rubric, students };
  root.TG_SAMPLE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
