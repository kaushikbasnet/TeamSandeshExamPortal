# Loksewa Competition Exam Portal – setup on InfinityFree

Everything (exam page, admin page, PHP and pictures) is on one InfinityFree site.
Correct answers and scoring stay on the server, so students can't find the answers in the page source.

## 1. Create the database
1. InfinityFree client area > your account > **Control Panel** > **MySQL Databases**. Create a database (e.g. `exam`).
2. Note the **MySQL Hostname** (like `sql301.infinityfree.com`), **database name** (like `if0_37xxxxxx_exam`),
   **MySQL username** (like `if0_37xxxxxx`), and the **password**. The password is your hosting account password
   (client area > Account > Show), not your InfinityFree login password.
3. Open **phpMyAdmin** for that database > **Import** > choose `schema.sql` > **Go**.
   (If you already imported it for the first version, you don't need to do it again. New columns are added automatically.)

## 2. Edit the settings
Open `htdocs/api/config.php` with Notepad and set:
- `db_host`: the MySQL Hostname (**not** localhost)
- `db_name`, `db_user`, `db_pass`
- `admin_password`: a long password of your choice
- `duration_minutes`: total exam time (45).
- `protect_content`: `true` keeps the anti-cheating rules on (see below).

## 3. Upload
**Updating from the first version?** Upload everything again EXCEPT `api/config.php`, so your database details are kept.
New settings apply automatically. The old `per_question_seconds` line in your config.php is now ignored, so the
10-second rule is off without you changing anything.

Control Panel > **Online File Manager** > `htdocs`. Upload everything that is INSIDE the zip's `htdocs` folder,
including the `api` and `uploads` folders and their `.htaccess` files. You should end up with
`htdocs/index.html`, `htdocs/api/start.php` and `htdocs/uploads/`.

- Student link: `https://YOUR-SITE.infinityfreeapp.com/`
- Admin link: `https://YOUR-SITE.infinityfreeapp.com/admin.html` (do not share)

## 4. Load the competition questions (GK + IQ)
The 50 questions from your Word files are ready in `loksewa-questions.xlsx` (in the zip, next to `htdocs`).
Their 8 IQ pictures (`iq-q34.png` … `iq-q42.png`) are already inside `htdocs/uploads`, so upload that folder too.
1. Open the admin page > **Upload questions** tab > choose `loksewa-questions.xlsx`.
2. Check the preview (correct answers are green).
3. Choose **Replace all existing questions** > **Save these questions**.
   If it says students have already started, delete your test students on the Results tab first.
GK questions 1–30 come first, then IQ 31–50, the same order as your papers.

## 4b. Add or change questions later
There are three ways. Each shows a preview with the correct answers in green before anything is saved.

**a) Excel file:** Upload questions tab > **Download Excel template**. Fill one question per row
(Section, Type, Question, Option A–D, Correct Answer, Picture, Table) and upload it. A CSV file works too.

**b) Type or paste:** Upload questions tab > type in the box, or copy from Word, in this format:
```
[IQ]
1. What number comes next? 2, 6, 12, 20, ?
A. 24
B. 30
C. 32
D. 36
Answer: B

[GK]
2. Match each planet with its description.
List I:
A. Mercury
B. Jupiter
List II:
1. The largest planet
2. Closest to the Sun
A. A-1, B-2
B. A-2, B-1
Answer: B
```
Add `Picture: q5.png` under a question to show a picture. An option can be just a picture name, like `A. shape1.png`.

**c) One by one:** Questions tab > **+ Add a question**, or **Edit** on any question. The form has a picture picker and an Upload picture button.

**Pictures:** upload them on the **Pictures** tab (JPG, PNG, GIF, WEBP, up to 2 MB each), then use the file name
in Excel, in the text, or pick it in the form.

## Fixed exam time (2:00 PM to 2:45 PM Nepal time)
The exam opens at **2:00 PM** and closes for everyone at **2:45 PM** Nepal time. You don't need to change config.php for this.
- Before 2:00 PM the page shows a countdown and students can't start.
- Anyone who starts late still finishes at 2:45 PM. At 2:45 PM every open exam is submitted automatically, and nobody can start after that.
- The server's clock is used, so changing the phone's clock doesn't help.
- To change it, add these lines to `api/config.php` (inside the `return [` list):
  `'exam_start' => '14:00', 'exam_end' => '14:45', 'exam_date' => '2026-11-28',`
  `exam_date` limits the exam to one day; without it the window repeats every day.
  To test the exam outside these hours, set `'exam_start' => '', 'exam_end' => '',` and put them back afterwards.

## How winners are ranked
Highest score first. If scores are equal, the earlier **submission time** ranks higher. Students see these rules
before they start and again on the finish page, together with their exact submission time.

## 5. How the exam works
- Registration: name, phone, email, current address. Each phone and email can take the exam once.
- One **45-minute timer**. Students move freely between questions and can change answers until they submit.
  When time runs out, answers are submitted automatically.
- The server keeps the official time. Changing the computer clock or reloading the page doesn't give extra time.
- Start time, finish time, total time and time spent on each question are recorded.
- Results tab: ranked by score, then earliest submission time. Download CSV for Excel. "Answers" shows each student's answers and seconds per question.

## Anti-cheating rule: the question is removed
If a student switches to another app or tab, minimises the browser, reloads the page, copies (Ctrl+C), right-clicks
(on computers), tries to print, opens developer tools, or presses a screenshot key, **the question on their screen is removed**:
its answer is cleared, it counts as skipped, it is crossed out in the question list and can't be opened again.
The server enforces this too. Students are told this rule before they start.

On the Results tab you see per student: "Left page", "Copy tries", "Screenshot keys" and "Questions removed".
"Answers" shows which question was removed and why. The student's name and phone are also shown faintly across
every question, so any shared screenshot shows who took it.

What it can't do: no website can fully stop screenshots. A phone's screenshot buttons, snipping tools and photos
taken with another phone can't always be detected.

## Match the following and tables
In Excel, put the table in the **Table** cell: first line = column headings, then one row per line (Alt+Enter),
columns separated by `|`. Three or more columns work too. In the editor, use the Table boxes.
Shown as a table with options like `A-4, B-2, C-1, D-3`. The student picks one option. It is one
answer worth 1 mark and is recorded like any other question.

## Test before the competition
Take the exam yourself, check the Results tab, then **Delete** your test entry. Before the day, remove the sample questions:
use "Replace all existing questions" when you upload your real questions.
