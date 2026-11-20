# LET majorship load — Culture and Arts (BCAED), Mathematics, Science, Special Needs Education

Saved: 2026-11-20 17:43 (Malay Peninsula Standard Time)
Project: `D:\hermes project\teacher ceppee` (app) + `D:\hermes project\QUESTION BANK` (sources & tools)

## Goal

Load the four remaining LET majorship papers — **Culture and Arts Education (source folder
`BCAED`), Mathematics, Science, Special Needs Education** — into the live Teacher Ceppee bank as
60 new sets (8,546 items), with Mathematics' worked solutions imported as explanations,
**without touching the 132 sets / 19,772 items already live**, then fill the explanations for the
three majors that have none and verify everything down the student path.

---

## Current context / assumptions (verified on 2026-11-20, not remembered)

### The bank today

| fact | value | how it was checked |
|---|---|---|
| live sets | 132 | `question_sets` import history + `e2e_sets.py` assertion |
| live items | 19,772 rows, 19,748 visible (24 hidden) | `e2e_sets.py` line 68 |
| explanations | all 19,772 have one | 2026-10 campaign, see skill |
| new sets | 60 (15 per major) | folder listing |
| new items after cleaning | **8,546** | dry build in a scratch prototype, reproduced by Task 6 |

`db_load.py` **wipes the whole bank**. Running it for this job would delete 19,772 items whose
explanations exist only in the database (the on-disk archive `_archive/bank_before_reimport.json`
predates the explanation campaign). **This plan never wipes.** It builds into its own work
directory and clears only its own 60 sets.

### What is in each source folder

```
QUESTION BANK\LET\MAJORSHIP\
  BCAED\                        15 x "BCAED N.docx"            150 items each
  Science\SCIENCE\              15 x "SCIENCE N.docx"          150 items each
  Special Needs Education\      15 x "SPED N.docx"             150 items each
  Math\QUESTIONS\               15 x "MATH N.docx"             120-128 parsed lines
  Math\SOLUTIONS_EXPLANATIONS\  15 x "MATHEMATICS N SOL.docx"  one worked solution per item
```

### Four source problems, all fixed in the parser

1. **`docx_text()` throws away in-paragraph line breaks.** It substitutes `<w:br/>` into the XML
   *between* runs and then collects only `<w:t>` contents, so
   `"SET 1" <w:br/> "1. B — Brahmagupta"` comes back as `"SET 11. B — Brahmagupta"`. That one bug
   hides the first solution of several `MATHEMATICS N SOL.docx` files, eats the whole first item of
   `MATH 12.docx`, and glues every option of `BCAED`/`SCIENCE`/`SPED` onto one line.
   Fix: new `docx_lines()` that keeps `br`/`cr` as `\n` and `tab` as `" "`.
2. **Unnumbered sources need grouping by answer line.** Once the real breaks are visible, `BCAED`,
   `SCIENCE` and `SPED` arrive as *six lines per item* (stem, A, B, C, D, `Answer: B`). The current
   "no numbering → one line = one item" branch turns that into 750 half-items per file.
   Fix: accumulate lines into a block until a line carries `Answer:`/`Sagot:`.
3. **`MATH 12.docx` numbers an ALL-CAPS item-type label as if it were a question**
   (`1. HISTORICAL IDENTIFICATION THROUGH A CLUE`, real stem on the next line), and its item 17 is
   a table whose rows (`1. 9`, `1. 99`, `2. 01 …`) look like numbered items → 128 parsed lines for
   120 real questions. Fix: a numbered all-caps label takes its stem from the line under it; the
   table rows are dropped later as "no 4 usable options" (they already are).
4. **Math answers live in a second file** in two header layouts: `1. B — Brahmagupta`
   (MATH 1-7, 9, 10, 12, 14, 15) and `1. Answer: B — Babylonian` (MATH 8, 11, 13).
   Fix: `parse_solution_text()` accepts both.

Measured after those fixes: **1,777 explanations** recovered from the solutions, **10 items get a
key they were missing**, and **8 items disagree** between the questions key and the solution
letter. A disagreement never flips a key — the item keeps the questions-file key and gets no
explanation, so the human review pass sees it (the 2026-10 policy).

### The `qbank2.py` source table is wrong for all four folders today

```python
("math",    ...\Math           ...)                      # no *.docx directly -> 0 files
("science", ...\Science        ...)                      # no *.docx directly -> 0 files
("sned",    ...\Special Needs Education ..., "elementary")
("bcaed",   ...\BCAED ..., "BCAED", "secondary")         # "BCAED" is not a major
```

`SPECIALIZATIONS` in `src/lib/exam.ts` contains **"Culture and Arts Education"**, not "BCAED".
An item tagged `BCAED` is invisible to every student filter (the drills match the string exactly).

### The Management API token file is gone

`apply_sql.py` reads `C:\Users\legor\AppData\Local\hermes\cache\scratch\sb_token.txt`, pruned with
the scratch dir. The token still exists in Windows Credential Manager
(`Supabase CLI:supabase`, a 44-character `sbp_…` blob stored as UTF-8 bytes, **not** UTF-16), and
Task 0 restores the file. The Supabase CLI is logged in (`supabase projects list` works).

### Working-tree state

- `D:\hermes project\QUESTION BANK` is **not a git repository** — nothing under `_tools/` is
  versioned, so there are no commits in this plan.
- `D:\hermes project\teacher ceppee` has uncommitted changes to `.gitignore` and
  `src/lib/exam.ts` (the AP / Mother-Tongue removal). Leave them; this plan changes no app code.

---

## Architecture / proposed approach

Keep the existing pipeline and make it **filterable**: `qbank2.py` gains `QB_ONLY` (source ids) and
`QB_WORK` (work dir), so the four majors are parsed and built into their own
`_work_sets/new/master.json` while the reviewed `master.json` of the 132 live sets is never
rewritten. A fixed extractor plus one grouping rule make the parser read the three new shapes
correctly, and `parse_solution_text()` pairs the Math solutions. A new `db_load_new.py` imports only
that file, clearing just its own 60 sets, and `verify_new.py` compares the database against the
built artifact and the pre-load baseline.

---

## Step-by-step tasks

Work from git-bash. Use native `D:/…` paths for Python arguments (MSYS does not translate `/d/…`
for native programs); `cd "/d/hermes project/…"` in bash is fine.

---

### Task 0 — Restore the Management API token file (2 min)

Create `C:\Users\legor\AppData\Local\hermes\cache\scratch\restore_token.ps1`:

```powershell
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Cred {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, int type, int reserved, out IntPtr cred);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    byte[] b = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);
    CredFree(p);
    return Encoding.UTF8.GetString(b);
  }
}
'@
Add-Type -TypeDefinition $sig
$t = [Cred]::Read("Supabase CLI:supabase")
if (-not $t) { Write-Output "NOT FOUND"; exit 1 }
[System.IO.File]::WriteAllText("C:\Users\legor\AppData\Local\hermes\cache\scratch\sb_token.txt", $t)
Write-Output "written len=$($t.Length)"
```

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File "C:/Users/legor/AppData/Local/hermes/cache/scratch/restore_token.ps1"
```

Expected: `written len=44`

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python apply_sql.py -c "select 1 as ok"
```

Expected: `[{"ok": 1}]`

If the project was asleep the first query can return
`HTTP 544: {"message":"Failed to run sql query: Connection terminated due to connection timeout"}` —
retry once, it succeeds after the project wakes. If it still fails, have the owner create a
personal access token at https://supabase.com/dashboard/account/tokens and save it into that same
file themselves (never paste a token into chat).

---

### Task 1 — Record the pre-load baseline (2 min)

Create `D:\hermes project\QUESTION BANK\_tools\baseline.py`:

```python
"""Capture the live bank counts before a partial load. Never writes to the DB."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apply_sql import run

OUT = r"D:\hermes project\QUESTION BANK\_work_sets\baseline.json"

row = run("""
select (select count(*) from public.question_sets) sets,
       (select count(*) from public.exam_questions) items,
       (select count(*) from public.question_keys) keys,
       (select count(*) from public.question_keys
         where coalesce(explanation,'') <> '') explained
""")[0]
row["track"] = "LET"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(row, open(OUT, "w", encoding="utf-8"), indent=1)
print("baseline ->", OUT, row)
```

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python baseline.py
```

Expected:

```
baseline -> D:\hermes project\QUESTION BANK\_work_sets\baseline.json {'sets': 132, 'items': 19772, 'keys': 19772, 'explained': 19772}
```

If the numbers differ, the printed values are the baseline — note them and continue. If `items` is
0, the wrong project is reachable: stop.

---

### Task 2 — Write the failing parser tests (5 min, TDD red)

Create `D:\hermes project\QUESTION BANK\_tools\test_new_sets.py` (plain script: this box has no
`pip`/pytest and the repo's tests are scripts).

```python
"""Parser tests for the four remaining LET majorships.

    python test_new_sets.py        # PASS/FAIL lines, exit 1 on any failure

Written BEFORE the qbank2.py fixes: it must fail on docx_lines/read_set_text not
existing, then pass unchanged once they do.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qbank2 as Q

BASE = os.path.join(Q.ROOT, "LET", "MAJORSHIP")
fails = []


def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (("  " + str(detail)) if detail else ""))
    if not cond:
        fails.append(label)


def items_of(*parts):
    return Q.parse_text(Q.read_set_text(os.path.join(BASE, *parts)))


def usable(items):
    return [q for q in items if q["answer"] and q["options"] and len(q["options"]) == 4
            and all(o.strip() for o in q["options"])]


# 1-3. The three unnumbered sources: stem, options and answer each on their own line.
for label, folder, name in [("BCAED 1", "BCAED", "BCAED 1.docx"),
                            ("SPED 1", "Special Needs Education", "SPED 1.docx"),
                            ("SCIENCE 1", os.path.join("Science", "SCIENCE"), "SCIENCE 1.docx")]:
    it = items_of(folder, name)
    check(f"{label} -> 150 usable", len(it) == 150 and len(usable(it)) == 150,
          (len(it), len(usable(it))))

# 4. MATH 12: a numbered ALL-CAPS item-type label must not eat the stem.
m12 = items_of("Math", "QUESTIONS", "MATH 12.docx")
check("MATH 12 -> 120 usable", len(usable(m12)) == 120, len(usable(m12)))
check("MATH 12 -> first stem recovered",
      any(q["stem"].startswith("A mathematician introduced") for q in m12),
      [q["stem"][:45] for q in m12[:2]])
check("MATH 12 -> no item is just the label",
      not any(q["stem"] == "HISTORICAL IDENTIFICATION THROUGH A CLUE" for q in m12))

# 5-6. Solutions parse in both layouts, and item 1 is no longer glued to "SET 1".
sol_b = Q.parse_solution_text(Q.docx_lines(os.path.join(
    BASE, "Math", "SOLUTIONS_EXPLANATIONS", "MATHEMATICS 8 SOL.docx")))
sol_a = Q.parse_solution_text(Q.docx_lines(os.path.join(
    BASE, "Math", "SOLUTIONS_EXPLANATIONS", "MATHEMATICS 1 SOL.docx")))
check("MATH 8 SOL -> 120 entries", len(sol_b) == 120, len(sol_b))
check("MATH 8 SOL -> item 1 is B and explained",
      sol_b.get(1, {}).get("answer") == "B" and len(sol_b.get(1, {}).get("explanation", "")) > 40,
      sol_b.get(1, {}).get("answer"))
check("MATH 1 SOL -> 120 entries", len(sol_a) == 120, len(sol_a))
check("MATH 1 SOL -> item 1 is B", sol_a.get(1, {}).get("answer") == "B",
      sol_a.get(1, {}).get("answer"))
check("MATH 1 SOL -> no Final Answer tail",
      "Final Answer" not in sol_a.get(3, {}).get("explanation", ""),
      sol_a.get(3, {}).get("explanation", "")[-60:])

# 7-8. Regression: the two shapes the live bank was built from must not change.
fil = items_of("Filipino", "FILIPINO 13.docx")
check("FILIPINO 13 -> 150 usable (one-line items unchanged)",
      len(usable(fil)) == 150, len(usable(fil)))
prof = items_of("PROF ED", "PROF 1 QA.docx")
check("PROF 1 QA -> 150 usable (numbered items unchanged)",
      len(usable(prof)) == 150, len(usable(prof)))

print()
print(f"{len(fails)} failed")
sys.exit(1 if fails else 0)
```

Run it — it must fail, because `docx_lines` does not exist yet:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python test_new_sets.py
```

Expected: `AttributeError: module 'qbank2' has no attribute 'docx_lines'`, exit 1.

---

### Task 3 — Fix the extractor and the unnumbered grouping in `qbank2.py` (5 min)

File: `D:\hermes project\QUESTION BANK\_tools\qbank2.py`

**3a.** Insert immediately after the line `LETTERS = "ABCD"` (line 91):

```python
# docx_text() loses every in-paragraph <w:br/>: it substitutes the break into the
# XML between runs, then keeps only <w:t> contents, so
#   "SET 1" <w:br/> "1. B — Brahmagupta"   ->   "SET 11. B — Brahmagupta"
# docx_lines() walks each paragraph in document order and keeps the breaks.
TOKEN = re.compile(r"<w:t(?:\s+[^>]*)?>(.*?)</w:t>|<w:(br|cr|tab)\b[^>]*/>")

# A numbered ALL-CAPS item-type label ("1. HISTORICAL IDENTIFICATION THROUGH A
# CLUE") is not a stem; MATH 12 puts the real question on the following line.
LABEL_LINE = re.compile(r"^\s*(\d{1,4})\s*[\.\)]\s+([A-Z][A-Z0-9 \-—–'&:,.()/]{3,})\s*$")
OPT_LINE = re.compile(r"^\s*[A-D]\s*[\.\)]")


def docx_lines(path):
    """Paragraph text with in-paragraph breaks kept as real line breaks."""
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8", "replace")
    out = []
    for para in xml.split("</w:p>"):
        parts = []
        for m in TOKEN.finditer(para):
            if m.group(1) is not None:
                parts.append(html.unescape(m.group(1)))
            else:
                parts.append("\n" if m.group(2) in ("br", "cr") else " ")
        line = "".join(parts).replace("\u00a0", " ").rstrip()
        if line.strip():
            out.append(line)
    return "\n".join(out)


def read_set_text(path):
    """docx_lines() with the numbered ALL-CAPS label promoted to a stem."""
    lines = docx_lines(path).split("\n")
    out = []
    i = 0
    while i < len(lines):
        m = LABEL_LINE.match(lines[i])
        if m:
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if (j < len(lines) and not NUM.match(lines[j])
                    and not OPT_LINE.match(lines[j])):
                out.append(f"{m.group(1)}. {lines[j].strip()}")
                i = j + 1
                continue
        out.append(lines[i])
        i += 1
    return "\n".join(out)
```

**3b.** Replace the whole unnumbered branch of `parse_text()` — from `if not marks:` down to its
first `return items` — with:

```python
    if not marks:
        # Unnumbered sources: one item = the lines up to and including its answer
        # line. FILIPINO 13-15 put everything on one line, so a block is one line;
        # BCAED / SCIENCE / SPED break the stem and each option onto its own line,
        # so a block is six. Grouping on the answer line serves both.
        blocks, cur = [], []
        for ln in lines:
            if not ln.strip():
                continue
            cur.append(ln)
            if ANS.search(ln):
                blocks.append("\n".join(cur))
                cur = []
        if cur:
            blocks.append("\n".join(cur))
        items = []
        for i, body in enumerate(blocks):
            ans = ANS.search(body)
            qbody = body[: ans.start()] if ans else body
            stem, opts = split_options(qbody)
            opts, ans_letter = clean_options(opts, ans.group(1).upper() if ans else None)
            items.append({
                "num": i + 1, "stem": clean_stem(stem), "options": opts,
                "answer": ans_letter, "explanation": "",
            })
        return items
```

**3c.** In `stage_parse()` and `stage_extract()`, change `t = docx_text(path)` to
`t = read_set_text(path)` (two places), so the parser and the `txt/` cache both use the fixed
extractor.

Run:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python test_new_sets.py
```

Expected: tests 1-4 and 7-8 `PASS`; the run still dies at test 5 with
`AttributeError: module 'qbank2' has no attribute 'parse_solution_text'`.

---

### Task 4 — Add solution parsing to `qbank2.py` (5 min, TDD green)

**4a.** Immediately after `parse_text()` (before the `# ---- stages` banner) add:

```python
# ---------------------------------------------------------------- solutions
# One worked-solution .docx per set, two header layouts in the same folder:
#   "1. B — Brahmagupta"          (MATH 1-7, 9, 10, 12, 14, 15)
#   "1. Answer: B — Babylonian"   (MATH 8, 11, 13)
# The explanation is everything between one header and the next.
SOLUTIONS = {
    "math": os.path.join(ROOT, r"LET\MAJORSHIP\Math\SOLUTIONS_EXPLANATIONS"),
}
SOL_HEAD = re.compile(
    r"^\s*(\d{1,4})\s*[\.\)]\s*(?:Answer\s*[:：]\s*)?([A-Da-d])\s*[—–\-]\s*(.+)$")


def solution_path(sid, set_no):
    folder = SOLUTIONS.get(sid)
    if not folder or set_no is None:
        return None
    return os.path.join(folder, f"MATHEMATICS {set_no} SOL.docx")


def parse_solution_text(text):
    """{item_no: {"answer": "B", "explanation": "..."}} from a solutions file."""
    lines = text.split("\n")
    heads = []
    for i, ln in enumerate(lines):
        m = SOL_HEAD.match(ln)
        if m:
            heads.append((i, int(m.group(1)), m.group(2).upper()))
    out = {}
    for k, (i, num, letter) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        body = " ".join(l.strip() for l in lines[i + 1:end] if l.strip())
        body = re.sub(r"\s+", " ", body).strip()
        body = re.sub(r"\s*Final Answer\s*:.*$", "", body).strip()
        out[num] = {"answer": letter, "explanation": body}
    return out
```

**4b.** In `stage_parse()`, after `items = parse_text(t)` add:

```python
        sols = {}
        sp = solution_path(sid, set_no(fname))
        if sp and os.path.exists(sp):
            sols = parse_solution_text(docx_lines(sp))
        for q in items:
            s = sols.get(q["num"])
            if not s:
                continue
            if not q["answer"]:
                q["answer"] = s["answer"]
                q["answer_src"] = "solutions"
                if not q["explanation"]:
                    q["explanation"] = s["explanation"]
            elif q["answer"] != s["answer"]:
                # The two files disagree. Never flip a key on machine evidence:
                # keep the questions-file key, attach no explanation, and let the
                # human review pass (review.py flagged) decide.
                q["key_conflict"] = f"questions={q['answer']} solution={s['answer']}"
            elif not q["explanation"]:
                q["explanation"] = s["explanation"]
```

Run:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python test_new_sets.py
```

Expected: every line `PASS`, ending `0 failed`; `echo $?` → `0`.

---

### Task 5 — Fix the `SOURCES` rows, the `CAE` label, `payload_row`, and add `QB_ONLY`/`QB_WORK` (5 min)

File: `D:\hermes project\QUESTION BANK\_tools\qbank2.py`

**5a.** Replace these four `SOURCES` rows:

```python
    ("math",    os.path.join(ROOT, r"LET\MAJORSHIP\Math"), "Specialization", "Mathematics", "secondary"),
    ("science", os.path.join(ROOT, r"LET\MAJORSHIP\Science"), "Specialization", "Science", "secondary"),
    ("sned",    os.path.join(ROOT, r"LET\MAJORSHIP\Special Needs Education"), "Specialization", "Special Needs Education", "elementary"),
    ("bcaed",   os.path.join(ROOT, r"LET\MAJORSHIP\BCAED"), "Specialization", "BCAED", "secondary"),
```

with:

```python
    # Mathematics questions and their worked solutions live in two subfolders.
    ("math",    os.path.join(ROOT, r"LET\MAJORSHIP\Math\QUESTIONS"), "Specialization", "Mathematics", "secondary"),
    ("science", os.path.join(ROOT, r"LET\MAJORSHIP\Science\SCIENCE"), "Specialization", "Science", "secondary"),
    # 'both': SNED is a BSNEd (elementary) paper but is also listed for secondary
    # takers in SPECIALIZATIONS, and every draw RPC treats 'both' as any level.
    ("sned",    os.path.join(ROOT, r"LET\MAJORSHIP\Special Needs Education"), "Specialization", "Special Needs Education", "both"),
    # BCAED is the Culture and Arts Education paper. "BCAED" is not a major, so the
    # exact-match drill filter would never show a single one of its items.
    ("bcaed",   os.path.join(ROOT, r"LET\MAJORSHIP\BCAED"), "Specialization", "Culture and Arts Education", "secondary"),
```

**5b.** In `SPEC_LABEL` replace `"Special Needs Education": "SNED", "BCAED": "BCAED",` with:

```python
    "Special Needs Education": "SNED", "Culture and Arts Education": "CAE",
```

**5c.** Add `payload_row()` to `qbank2.py`, anywhere after `norm_key`:

```python
def payload_row(s, it, set_id):
    """One exam_questions row for admin_import_questions (shared by db_load*.py)."""
    return {
        "question_text": it["stem"],
        "choice_a": it["options"][0], "choice_b": it["options"][1],
        "choice_c": it["options"][2], "choice_d": it["options"][3],
        "track": s["track"], "level": s["level"], "subject": s["subject"],
        "subtopic": it.get("subtopic"), "specialization": s["specialization"],
        "difficulty": it["difficulty"],
        "is_free": bool(s["set_no"] == 1 and it["item_no"] <= 3),
        "source": s["title"], "set_id": set_id, "item_no": it["item_no"],
        "bucket": it["bucket"], "item_type": it["item_type"],
        "correct_choice": it["answer"], "explanation": it["explanation"] or None,
    }
```

**5d.** Make the pipeline filterable. Replace:

```python
ROOT = r"D:\hermes project\QUESTION BANK"
WORK = os.path.join(ROOT, "_work_sets")
```

with:

```python
ROOT = r"D:\hermes project\QUESTION BANK"
# QB_WORK keeps a partial run's cache out of the reviewed full-bank raw.json/master.json.
WORK = os.environ.get("QB_WORK") or os.path.join(ROOT, "_work_sets")
# QB_ONLY=bcaed,math -> only those source ids are extracted / parsed / built.
ONLY = [s.strip() for s in os.environ.get("QB_ONLY", "").split(",") if s.strip()]
```

and inside `list_sources()` replace:

```python
    for sid, folder, subject, spec, level in SOURCES:
        if not os.path.isdir(folder):
            continue
```

with:

```python
    for sid, folder, subject, spec, level in SOURCES:
        if ONLY and sid not in ONLY:
            continue
        if not os.path.isdir(folder):
            continue
```

**5e.** In `D:\hermes project\QUESTION BANK\_tools\db_load.py`, delete its local
`def payload_row(...)` (lines 59-71) and add after `from apply_sql import run`:

```python
from qbank2 import payload_row
```

Checks:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python -c "import qbank2, db_load; print(len(qbank2.list_sources()), 'sources;', len(db_load.master), 'sets in master.json')"
```

Expected: `192 sources; 132 sets in master.json`
(192 = every source row now resolves to a real folder; `master.json` still holds only the 132 live
sets and is only read here.)

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python test_new_sets.py
```

Expected: `0 failed`.

---

### Task 6 — Build the 60 new sets into their own master (3 min)

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && \
QB_ONLY=bcaed,math,science,sned \
QB_WORK="D:/hermes project/QUESTION BANK/_work_sets/new" \
python qbank2.py parse
```

Expected: `parsed 60 sets, 8562 items`

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && \
QB_ONLY=bcaed,math,science,sned \
QB_WORK="D:/hermes project/QUESTION BANK/_work_sets/new" \
python qbank2.py build
```

Expected header `sets 60  items 8546  reused_explanations <n>`, then `dropped 16:` with
14 `no 4 usable options`, 1 `duplicate option text`, 1 `stem too short`, then a 60-row table.

Assert the artifact before loading:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python -c "
import json
from collections import Counter
m=json.load(open(r'D:\hermes project\QUESTION BANK\_work_sets\new\master.json',encoding='utf-8'))
n=Counter(); e=Counter()
for s in m:
    n[s['specialization']]+=len(s['items'])
    e[s['specialization']]+=sum(1 for q in s['items'] if q['explanation'])
print(len(m),'sets',dict(n)); print('explained',dict(e))
assert len(m)==60 and sum(n.values())==8546
assert n['Culture and Arts Education']==2249 and n['Mathematics']==1797
assert n['Science']==2250 and n['Special Needs Education']==2250
assert e['Mathematics']==1777 and e['Science']==0
print('BUILD OK')
"
```

Expected:

```
60 sets {'Culture and Arts Education': 2249, 'Mathematics': 1797, 'Science': 2250, 'Special Needs Education': 2250}
explained {'Culture and Arts Education': 0, 'Mathematics': 1777, 'Science': 0, 'Special Needs Education': 0}
BUILD OK
```

If the numbers differ, **stop** and report the actual table — do not load.

---

### Task 7 — Create `db_load_new.py` (5 min)

Create `D:\hermes project\QUESTION BANK\_tools\db_load_new.py`:

```python
"""Load ONE built batch into the live bank WITHOUT wiping the bank.

Reads the master.json produced by the filtered build (Task 6), creates/updates the
question_sets rows for those sets only, clears just those sets so a re-run is
idempotent, then imports their items through admin_import_questions with the admin
JWT claims impersonated (the RPC calls is_admin()).

    python db_load_new.py --dry-run
    python db_load_new.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apply_sql import run
from qbank2 import payload_row

MASTER = os.environ.get("QB_MASTER") or \
    r"D:\hermes project\QUESTION BANK\_work_sets\new\master.json"
BATCH = 5
master = json.load(open(MASTER, encoding="utf-8"))


def q(sql, timeout=600):
    return run(sql, timeout=timeout)


def admin_id():
    rows = q("select id from public.profiles where is_admin order by created_at limit 1")
    if not rows:
        raise SystemExit("no admin profile found -- cannot call the admin RPCs")
    return rows[0]["id"]


ADMIN = admin_id()
CLAIMS = json.dumps({"sub": ADMIN, "role": "authenticated"})


def key(s):
    return (s["track"], s["subject"], s["specialization"] or "", s["set_no"])


def create_sets():
    rows = [{
        "track": s["track"], "subject": s["subject"], "specialization": s["specialization"],
        "level": s["level"], "set_no": s["set_no"], "title": s["title"],
        "source_file": s["source_file"], "item_count": len(s["items"]),
    } for s in master]
    payload = json.dumps(rows, ensure_ascii=False)
    q(f"""
begin;
insert into public.question_sets
  (track, subject, specialization, level, set_no, title, source_file, item_count)
select x.track, x.subject, x.specialization, x.level, x.set_no, x.title, x.source_file, x.item_count
  from jsonb_to_recordset($j${payload}$j$::jsonb) as x(
    track text, subject text, specialization text, level text, set_no int,
    title text, source_file text, item_count int)
on conflict (track, subject, coalesce(specialization, ''), set_no) do update
  set title = excluded.title, item_count = excluded.item_count,
      source_file = excluded.source_file, level = excluded.level, updated_at = now();
commit;""")
    got = q("select id, track, subject, specialization, set_no from public.question_sets")
    idx = {(r["track"], r["subject"], r["specialization"] or "", r["set_no"]): r["id"] for r in got}
    print(f"question_sets: {len(got)} rows")
    missing = [s["title"] for s in master if key(s) not in idx]
    if missing:
        raise SystemExit(f"sets not created: {missing}")
    return idx


def clear_sets(idx):
    """Delete the items of ONLY these sets, through the admin RPC."""
    ids = ",".join("'%s'::uuid" % idx[key(s)] for s in master)
    q("begin;\nset local request.jwt.claims = $c$" + CLAIMS + "$c$;\n"
      "do $$ declare r record; begin\n"
      "  for r in select unnest(array[" + ids + "]) as id loop\n"
      "    perform public.admin_clear_bank(p_set_id => r.id);\n"
      "  end loop;\n"
      "end $$;\ncommit;")
    print(f"cleared {len(master)} sets")


def load(idx, batch=BATCH):
    total = 0
    for i in range(0, len(master), batch):
        chunk = master[i:i + batch]
        rows = []
        for s in chunk:
            rows += [payload_row(s, it, idx[key(s)]) for it in s["items"]]
        payload = json.dumps(rows, ensure_ascii=False)
        sql = ("begin;\nset local request.jwt.claims = $c$" + CLAIMS + "$c$;\n"
               "select admin_import_questions($j$" + payload + "$j$::jsonb) as imported;\ncommit;")
        res = q(sql)
        n = res[0]["imported"] if isinstance(res, list) and res else res
        total += len(rows)
        print(f"  sets {i + 1}-{i + len(chunk)}: imported {n} (running {total})", flush=True)
        if not isinstance(n, int) or n != len(rows):
            raise SystemExit(f"import mismatch: expected {len(rows)} got {n}")
        time.sleep(0.3)
    return total


if __name__ == "__main__":
    new_items = sum(len(s["items"]) for s in master)
    print(f"master: {MASTER}\n  {len(master)} sets, {new_items} items; admin {ADMIN}")
    if "--dry-run" in sys.argv:
        print("dry run: nothing written")
        raise SystemExit(0)
    idx = create_sets()
    clear_sets(idx)
    n = load(idx)
    print("imported total:", n)
    print(q("""
      select count(*) items,
             count(*) filter (where set_id is null) no_set,
             (select count(*) from public.question_sets) sets,
             (select count(*) from public.question_keys) keys,
             (select count(*) from public.exam_questions q
               where not exists (select 1 from public.question_keys k where k.question_id = q.id))
               missing_keys
        from public.exam_questions
    """))
```

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python db_load_new.py --dry-run
```

Expected:

```
master: D:\hermes project\QUESTION BANK\_work_sets\new\master.json
  60 sets, 8546 items; admin <uuid>
dry run: nothing written
```

---

### Task 8 — Load the 60 sets (5 min)

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python db_load_new.py
```

Expected (12 batches of 5 sets):

```
question_sets: 192 rows
cleared 60 sets
  sets 1-5: imported 750 (running 750)
  ...
  sets 56-60: imported 750 (running 8546)
imported total: 8546
items 28318 no_set 0 sets 192 keys 28318 missing_keys 0
```

`28,318 = 19,772 + 8,546`. If `sets` is not 192 or `missing_keys` is not 0, stop and report.

Then store each new set's composition (the shape the picker prints). `backfill_shapes.py` line 12
hardcodes the full-bank path — change that line to:

```python
MASTER = os.environ.get("QB_MASTER") or r"D:\hermes project\QUESTION BANK\_work_sets\master.json"
master = json.load(open(MASTER, encoding="utf-8"))
```

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && \
QB_MASTER="D:/hermes project/QUESTION BANK/_work_sets/new/master.json" \
python backfill_shapes.py
```

Expected:

```
60 sets in master.json
sets with no shape: []
[{'sets': 192, 'easy': <old+1800>, 'med': <old+2400>, 'hard': <old+3040>, 'ped': <old+1306>, 'total': 28318}]
```

Two numbers are the assertion: `sets with no shape: []` and `'sets': 192` / `'total': 28318`. The
four bucket sums are cumulative over the whole bank (the 132 live sets keep their existing shapes),
so only their deltas — 1,800 easy / 2,400 medium / 3,040 hard / 1,306 pedagogical — are new.

---

### Task 9 — Create `verify_new.py` and prove the load (5 min)

Create `D:\hermes project\QUESTION BANK\_tools\verify_new.py`:

```python
"""Compare the live bank against the built batch and the pre-load baseline.

    python baseline.py     # once, BEFORE loading
    python verify_new.py   # after loading
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apply_sql import run

MASTER = os.environ.get("QB_MASTER") or \
    r"D:\hermes project\QUESTION BANK\_work_sets\new\master.json"
BASELINE = r"D:\hermes project\QUESTION BANK\_work_sets\baseline.json"

master = json.load(open(MASTER, encoding="utf-8"))
base = json.load(open(BASELINE, encoding="utf-8"))
new_total = sum(len(s["items"]) for s in master)
fails = []


def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (("  " + str(detail)) if detail else ""))
    if not cond:
        fails.append(label)


rows = run("""
select s.subject, coalesce(s.specialization,'-') spec, s.set_no, s.title,
       count(q.id)::int live,
       count(*) filter (where coalesce(k.explanation,'') <> '')::int explained,
       count(*) filter (where k.correct_choice = 'A')::int a,
       count(*) filter (where k.correct_choice = 'B')::int b,
       count(*) filter (where k.correct_choice = 'C')::int c,
       count(*) filter (where k.correct_choice = 'D')::int d
  from public.question_sets s
  left join public.exam_questions q on q.set_id = s.id
  left join public.question_keys k on k.question_id = q.id
 group by 1,2,3,4
 order by 2,3
""")
live = {(r["subject"], r["spec"], r["set_no"]): r for r in rows}

bad = []
for s in master:
    r = live.get((s["subject"], s["specialization"] or "-", s["set_no"]))
    if not r or r["live"] != len(s["items"]):
        bad.append((s["title"], len(s["items"]), r and r["live"]))
check("all 60 new sets present with the built item counts", not bad, bad[:5])

tot = run("""
select (select count(*) from public.question_sets) sets,
       (select count(*) from public.exam_questions) items,
       (select count(*) from public.question_keys) keys,
       (select count(*) from public.exam_questions q
         where not exists (select 1 from public.question_keys k
                            where k.question_id = q.id)) nokey,
       (select count(*) from (select set_id from public.exam_questions
                               group by set_id having count(*) > 150) x) over150
""")[0]

check(f"question_sets = {base['sets']} + {len(master)}",
      tot["sets"] == base["sets"] + len(master), tot["sets"])
check(f"exam_questions = {base['items']} + {new_total}",
      tot["items"] == base["items"] + new_total, tot["items"])
check("every item has a key row", tot["nokey"] == 0, tot["nokey"])
check("no set over 150 items", tot["over150"] == 0, tot["over150"])

print()
agg = {}
for s in master:
    r = live[(s["subject"], s["specialization"] or "-", s["set_no"])]
    a = agg.setdefault(s["specialization"],
                       {"items": 0, "explained": 0, "A": 0, "B": 0, "C": 0, "D": 0})
    a["items"] += r["live"]
    a["explained"] += r["explained"]
    for L in "ABCD":
        a[L] += r[L.lower()]
for spec in sorted(agg):
    a = agg[spec]
    n = (a["A"] + a["B"] + a["C"] + a["D"]) or 1
    print(f"{spec:<28}items {a['items']:>5}  explained {a['explained']:>5}  "
          f"A {a['A'] / n:5.1%}  B {a['B'] / n:5.1%}  C {a['C'] / n:5.1%}  D {a['D'] / n:5.1%}")

print()
print("ALL CHECKS PASS" if not fails else f"{len(fails)} CHECKS FAILED")
sys.exit(1 if fails else 0)
```

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python verify_new.py
```

Expected:

```
PASS  all 60 new sets present with the built item counts
PASS  question_sets = 132 + 60  192
PASS  exam_questions = 19772 + 8546  28318
PASS  every item has a key row  0
PASS  no set over 150 items  0

Culture and Arts Education  items  2249  explained     0  A 24.9%  B 25.2%  C 25.0%  D 24.9%
Mathematics                 items  1797  explained  1777  A 13.7%  B 47.4%  C 33.9%  D  5.0%
Science                     items  2250  explained     0  A 24.8%  B 25.2%  C 25.2%  D 24.8%
Special Needs Education     items  2250  explained     0  A 25.1%  B 25.0%  C 25.1%  D 24.8%

ALL CHECKS PASS
```

(Percentages vary by a tenth. **Mathematics is genuinely B-heavy — the source's own bias**,
confirmed by 1,777 solution letters agreeing with the questions file. Do not "fix" it.)

---

### Task 10 — Prove the app will show the new papers (3 min)

Create `D:\hermes project\QUESTION BANK\_tools\verify_catalog.py`:

```python
"""Ask the set picker's own RPC what a student will see, for each new major."""
import json, os, sys, urllib.request

APP = r"D:\hermes project\teacher ceppee"
env = {}
for line in open(os.path.join(APP, ".env.local"), encoding="utf-8"):
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.strip().split("=", 1)
        env[k] = v.strip()
URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
ANON = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]


def rpc(name, args):
    req = urllib.request.Request(
        URL + f"/rest/v1/rpc/{name}", data=json.dumps(args).encode(),
        headers={"apikey": ANON, "Authorization": f"Bearer {ANON}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


CASES = [("secondary", "Mathematics"), ("secondary", "Science"),
         ("secondary", "Culture and Arts Education"),
         ("elementary", "Special Needs Education"), ("secondary", "Special Needs Education")]
bad = 0
for level, major in CASES:
    rows = rpc("set_catalog", {"p_track": "LET", "p_level": level, "p_specialization": major})
    live = sum(r["live"] for r in rows)
    ok = len(rows) == 15
    bad += 0 if ok else 1
    print(f"{'PASS' if ok else 'FAIL'}  {level:<10}{major:<28}{len(rows):>3} papers, {live} items live")
    if rows:
        print(f"      first: {rows[0]['title']} live={rows[0]['live']} shape="
              f"{rows[0]['shape_easy']}/{rows[0]['shape_medium_hard']}/"
              f"{rows[0]['shape_extremely_hard']}/{rows[0]['shape_pedagogical']}")
sys.exit(1 if bad else 0)
```

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python verify_catalog.py
```

Expected: five `PASS` lines, 15 papers each, live item totals 1,797 / 2,250 / 2,249 / 2,250 / 2,250
in the order above, exit 0. This is the same RPC `/review/let/sets?level=…&major=…` calls, so no browser pass is needed.

---

### Task 11 — Run the two existing set-level suites (15 min, mostly waiting)

Update the hardcoded bank size in `e2e_sets.py` (line 68):

```python
check("bank_stats sees every live LET item", tot == 19748, f"{tot}")
```

→

```python
check("bank_stats sees every live LET item", tot == 28294, f"{tot}")
```

(`28,294 = 19,748 visible + 8,546 new`; the 24 hidden items stay hidden.)

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python e2e_sets.py
```

Expected: `bank_stats: 28294 items, 28294 accessible` and `ALL PASS`.

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python test_set_mocks.py
```

Expected, at the end:

```
sets drawn                 : 192
papers not exactly 150/uniq: 0
papers whose mix != shape  : <a few> (subject could not supply the missing kind)
sets that needed a filler  : <the 15 Math sets and the 149-item CAE set>
practice mode keys+expl    : 150/150
unsubscribed user rows     : 0 (must be 0)
```

`papers not exactly 150/uniq` must be 0. A non-zero "mix != shape" count is expected and correct:
Math sets hold 119-120 items and one CAE set 149, so their papers are topped up from the same
subject and bucket — the documented `start_set_mock` behaviour.

---

### Task 12 — Phase D: explanations for Culture and Arts, Science, Special Needs (the long tail)

Until this runs, 6,769 items show a blank "why" in drill / flashcards / practice mode
(`28,318` keys − `21,549` explained = CAE 2,249 + Science 2,250 + SNED 2,250 + Math's remaining 20).

**12a.** In `e2e_explanations.py`, replace the `tests = [...]` list (lines 40-45) with:

```python
tests = [
    ("Values Education", "secondary", "draw_drill", 12),
    ("Physical Education", "secondary", "draw_drill", 12),
    ("Early Childhood Education", "elementary", "draw_drill", 12),
    ("Filipino", "secondary", "draw_drill", 12),
    ("Culture and Arts Education", "secondary", "draw_drill", 12),
    ("Mathematics", "secondary", "draw_drill", 12),
    ("Science", "secondary", "draw_drill", 12),
    ("Special Needs Education", "elementary", "draw_drill", 12),
]
```

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python e2e_explanations.py
```

Expected **now**: four `PASS` (the old majors) and four `FAIL … 0 items, 0 with explanation`.
That is the red test for this phase.

**12b.** Archive the finished campaign's artifacts so `review.py` starts clean:

```bash
cd "/d/hermes project/QUESTION BANK/_review" && mkdir -p archive-2026-10 && \
mv batches/*.json out/*.jsonl archive-2026-10/ 2>/dev/null; ls
```

Expected: `archive-2026-10  BRIEF.md  batches  decisions.json  flagged.json  out`

**12c.** Export the batches:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && \
python review.py export --batch 80 --only "Culture and Arts Education,Science,Special Needs Education"
```

Expected: `6769 items still need an explanation`, then `wrote 85 batches to …\_review\batches`.

**12d.** Dispatch reviewer children, nine waves of ten; each child owns exactly one batch and gets
only the brief plus its own file:

```
delegate_task(tasks=[
  {"goal": "Write explanations for LET question bank batch 001-caeset1.",
   "context": "Read D:\\hermes project\\QUESTION BANK\\_review\\BRIEF.md and follow it exactly. "
              "Input: D:\\hermes project\\QUESTION BANK\\_review\\batches\\001-caeset1.json "
              "Output: D:\\hermes project\\QUESTION BANK\\_review\\out\\001-caeset1.jsonl "
              "Write the JSONL with Python; never print the items. Reply with one line: "
              "batch, item count, verdict counts."},
  ... one entry per batch in the wave ...
])
```

Repeat these two rules to every child verbatim (they are in `BRIEF.md`, but the 2026-10 run lost
two workers to the first one):

- Write the JSONL straight to disk and reply with a count only — no long item commentary.
- Do not browse, do not touch the database, do not edit the batch file.

After each wave:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python review.py status
```

Expected: `batches: 85 total, <85 - 10·wave> without output`; `explanations: 21549 / 28318`
until 12e.

**12e.** Apply the explanations and queue key doubts:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python review.py load
```

Expected: one line per output file, then `applied 6769 explanations` and
`key doubts queued: <n> new, <n> total`.

**12f.** Adjudicate the doubts by hand — repair when the intended question is recoverable, hide
(`is_active=false`) when no option is defensible, as in the 2026-10 campaign:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python review.py flagged | head -120
```

Write the decisions in the shape `adjudicate.py` expects (see `_review/decisions.json`), then:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python adjudicate.py
```

**12g.** Re-run the phase test:

```bash
cd "/d/hermes project/QUESTION BANK/_tools" && python e2e_explanations.py
```

Expected: eight `PASS` lines and `ALL PASS`.

---

### Task 13 — Record what was loaded (2 min)

Patch the `teacher-ceppee` skill (`skill_manage(action='patch')`) so the next session does not
re-derive any of it:

- Inventory line: **19,772 items / 132 sets** → **28,318 items / 192 sets**, adding
  `Culture and Arts Education 15 / 2,249 (BCAED folder)`, `Mathematics 15 / 1,797
  (Math/QUESTIONS + Math/SOLUTIONS_EXPLANATIONS)`, `Science 15 / 2,250`,
  `Special Needs Education 15 / 2,250 (level 'both')`.
- Defect catalogue, add: *`docx_text()` drops in-paragraph `<w:br/>` (it substitutes the break
  between runs and then keeps only `<w:t>`), which glues `SET 1` onto `1. B — …`. `docx_lines()` in
  `qbank2.py` keeps the breaks; `read_set_text()` adds the ALL-CAPS-label fix for `MATH 12`.*
- Add: *Unnumbered sources are grouped by their answer line, not one-line-per-item — BCAED /
  SCIENCE / SPED break each option onto its own line.*
- Add: *Math solutions are a second `.docx` per set (`MATHEMATICS N SOL.docx`, two header
  layouts); `parse_solution_text()` fills the 10 missing keys and deliberately leaves the 8 key
  conflicts unexplained for the review pass.*
- Add the partial-load recipe:
  ```
  QB_ONLY=bcaed,math,science,sned QB_WORK=...\_work_sets\new python qbank2.py parse|build
  python db_load_new.py     # never db_load.py: that wipes the reviewed bank
  python verify_new.py
  ```
- Note that `apply_sql.py`'s token file is pruned with the scratch dir, and that it is recoverable
  from Windows Credential Manager (`Supabase CLI:supabase`, UTF-8 bytes) with
  `…\hermes\cache\scratch\restore_token.ps1`.

---

## Tests / validation

| layer | command | expected |
|---|---|---|
| parser unit | `python test_new_sets.py` | `0 failed`, exit 0 |
| build artifact | Task 6 one-liner | `BUILD OK`, 60 sets / 8,546 items |
| live DB vs artifact | `python verify_new.py` | `ALL CHECKS PASS`, 192 sets / 28,318 items |
| picker RPC | `python verify_catalog.py` | 5 × `PASS`, 15 papers each |
| student path | `python e2e_sets.py` | `ALL PASS` at 28,294 |
| set mocks | `python test_set_mocks.py` | 192 drawn, 0 papers ≠ 150/unique |
| explanations | `python e2e_explanations.py` | 8 × `PASS`, `ALL PASS` |

Rollback, only if Tasks 8-9 show something is wrong:

```sql
begin;
set local request.jwt.claims = '{"sub":"<admin uuid>","role":"authenticated"}';
select admin_clear_bank(p_specialization => 'Culture and Arts Education');
select admin_clear_bank(p_specialization => 'Mathematics');
select admin_clear_bank(p_specialization => 'Science');
select admin_clear_bank(p_specialization => 'Special Needs Education');
delete from public.question_sets
 where specialization in ('Culture and Arts Education','Mathematics','Science','Special Needs Education');
commit;
```

Run it through `python apply_sql.py file.sql`; `python verify_new.py` must then show the baseline
counts again (132 / 19,772).

---

## Risks, tradeoffs, open questions

1. **Never run `db_load.py` without arguments on this bank again.** It calls `admin_clear_bank()`
   with no filters and would delete 28,318 items — 19,772 of whose explanations exist nowhere else.
   If a full rebuild is ever needed, export explanations first
   (`select q.question_text, k.explanation …`) into `_archive/bank_<date>.json` and use it as the
   archive.
2. **16 items are dropped** (14 with fewer than four usable options, 1 with a duplicate option,
   1 with a two-character stem): Math 14, CAE 1, SPED 1 — Science loses none. Recovering them means
   editing the source `.docx`, which is out of scope. `qbank2.py build` lists every one.
3. **Math is 47.4% B / 5.0% D.** 1,777 solution letters agree with the questions file, so the keys
   are aligned and the source is skewed. Flagged for reviewers, not a blocker.
4. **8 Math key conflicts are left unexplained on purpose** (`key_conflict` on the item, printed by
   `build`). They go to the Phase D review, where a human/worker verdict is adjudicated. A machine
   never flips a key — that rule produced 24 hidden items rather than 24 wrong keys last time.
5. **Special Needs Education is loaded as `level='both'`**, unlike BECEd (`elementary`). SNED is a
   BSNEd paper per the JMC *and* is offered to secondary takers in `SPECIALIZATIONS`; `'both'` is
   the only tag that makes the papers reachable from both pickers (all draw RPCs treat `'both'` as
   "any level"; `start_set_mock` uses the set's own items). To make it elementary-only later:
   `update public.question_sets set level='elementary' where specialization='Special Needs Education';`
   and the same for `exam_questions`.
6. **Math sets hold 119-120 items, not 150**, and `cae-13` holds 149. `start_set_mock` fills the
   paper from the same subject + bucket, so `test_set_mocks.py` will report a mix that differs from
   the stored shape for those sets. Documented behaviour, not a regression.
7. **Phase D is ~85 delegate children / 9 waves / 1.5-2 hours.** The four majors are drillable as
   soon as Task 11 passes; explanations are what make the feedback useful. Shipping Task 11 and
   running Phase D separately is a legitimate stopping point.
8. **Open question for the owner:** whether to advertise the four majors on the hub before Phase D
   finishes. No code change either way — the hub prints "N items unlocked" from `bank_stats`.
9. **Open question for the owner:** English is next (2 sets / 300 items, B-heavy 65%, plus the
   unparsed `ENGLISH MAJOR 1319 ITEMS PART 4 (1).doc`). That `.doc` needs
   `soffice --convert-to docx`, which is not installed on this box — check before promising it.
