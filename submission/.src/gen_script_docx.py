"""Generator naskah demo 3 menit -> SCRIPT_HACKATHON.docx.
Sumber editabel: ../demo-script-livestream-3min.md (jangan edit docx langsung;
ubah md, lalu jalankan skrip ini lagi).
"""
from docx import Document
from docx.shared import Pt

SEGMENTS = [
    ("0:00–0:20 — Hook + masalah",
     "Tampilkan dashboard Minime, satu project kosong. Jangan slide.",
     "In Indonesia, / important work often begins with a short message // "
     "The problem is not generating text / it is turning one incomplete brief / "
     "into coordinated, accountable teamwork // every task owned, / every step "
     "approved by a human // Minime does that: / one person, / five AI teammates, / "
     "all supervised by a human //"),
    ("0:20–0:50 — Brief masuk, tugas terbelah",
     "Ketik satu brief singkat di chat, kirim. Tunjukkan bubble user + ack Prime "
     "langsung tampil, lalu tugas-tugas terbelah ke Kanban.",
     "I type one brief / — one product, / one week of content // Watch what "
     "happens // Minime splits it into owned tasks: / research, / strategy, / "
     "creative, / finance, / and code // You see my message appear, / then Prime "
     "answers immediately, / and the tasks land on the board // each with an owner, / "
     "each with a status // Nothing is anonymous work // Nothing disappears into a "
     "chat log // If a task stalls, / I see where it stalled, / and who owns it //"),
    ("0:50–1:30 — Agen bekerja, artefak berpindah",
     "Pindah ke Graph — tunjukkan node agen bekerja; buka Library — tunjukkan "
     "artefak yang sudah lewat antar agen: riset, STP, brief.",
     "Each agent works in the background / — not one chat answering everything, / "
     "but a team passing work along // Research hands its findings to strategy / "
     "Strategy hands its brief to creative / Creative hands its draft back for "
     "review // On the graph you can see the team: / nodes working, / edges carrying "
     "artifacts from one owner to the next // In the library, / the proof is there: / "
     "research notes, / a positioning brief, / a draft // each produced by an agent, / "
     "each traceable to the brief it came from // Artifacts pass between agents, / "
     "and a human approves the result // One reliable loop / — not a feature demo //"),
    ("1:30–2:10 — Planner: draft-only, tanpa auto-post",
     "Buka Planner — tunjukkan draf yang sudah dibuat dari brief, pengingat H-3, "
     "dan dialog konfirmasi terbit. Tekankan: postingan tunggal tidak pernah "
     "terbit otomatis.",
     "Publishing is draft-only by default // A single post never goes out on its "
     "own / It waits for my approval, / with a reminder three days before it is due // "
     "Look at the planner: / drafts made from this same brief, / each with its date, / "
     "each waiting — not sent // When I open one, / I can edit it, / reschedule it, / "
     "or delete it // And when I do approve, / a confirmation dialog asks me once "
     "more // Scheduled batches only publish / after I approve the whole batch // "
     "Nothing here publishes by accident // Safety is not a setting here / It is the "
     "design //"),
    ("2:10–2:45 — QC Prime + Media Studio",
     "Tunjukkan satu hasil yang lewat QC Prime (maksimal 2 revisi), lalu Media "
     "Studio — voice/TTS atau gambar hasil generate.",
     "Every creative output passes Prime quality control // A different model family "
     "checks the work / — the maker never grades itself — / with at most two "
     "revisions // If it fails twice, / it comes back to me, / not to an endless loop "
     "// Here is one result that passed: / you can see the revision, / and the "
     "approval // And the studio turns approved work into voice and visuals / — a "
     "voice-over from the approved script, / an image from the approved prompt // "
     "Same brief, / same approval, / one loop from words to media //"),
    ("2:45–3:00 — Metrik + visi + repo",
     "Tampilkan footer Total …ms / biaya per tugas bila ada, lalu tampilkan URL "
     "repo di layar. Kalimat penutup langsung ke kamera.",
     "Minime brings Meta's newest models / into the workflow one person runs // "
     "The result is not activity for its own sake / It is visible, / traceable "
     "teamwork / that a solo founder can supervise // Repo on screen // Thank you //"),
]

NOTES = [
    "Aplikasi harus sudah berjalan sebelum mulai; jangan buka slide.",
    "Bila panggilan model live melambat: JANGAN dipalsukan. Potong ke klip rekaman "
    "proses yang sama, atau tunjukkan hasil yang sudah selesai di Library — lalu lanjutkan.",
    "Siapkan satu project dengan brief + hasil yang sudah jadi sebagai cadangan, "
    "supaya demo tidak bergantung penuh pada panggilan live.",
    "Akhiri dengan URL repo tampil di layar minimal 5 detik.",
]

doc = Document()
doc.core_properties.title = "Naskah Demo 3 Menit — Minime-Hackathon"
style = doc.styles["Normal"]
style.font.size = Pt(12)

doc.add_heading("Naskah Demo Livestream — Minime-Hackathon (3 menit)", level=1)
p = doc.add_paragraph()
p.add_run("Aturan: HANYA tampilkan pekerjaan 27 Okt–4 Nov 2026. ").bold = True
p.add_run("Narasi dalam bahasa Inggris (untuk juri); aba-aba panggung dalam bahasa "
          "Indonesia (untuk presenter). Perkiraan durasi: 435 kata narasi = 3:00 "
          "pada tempo demo 145 kata/menit. Tanda / = jeda napas, // = ganti kalimat.")

for title, cue, narration in SEGMENTS:
    doc.add_heading(title, level=2)
    p = doc.add_paragraph()
    p.add_run("[Aba-aba: ").bold = True
    p.add_run(cue + "]")
    p = doc.add_paragraph()
    p.add_run("Narasi:").bold = True
    doc.add_paragraph(narration)

doc.add_heading("Catatan live (bila dibawakan langsung, bukan rekaman)", level=2)
for note in NOTES:
    doc.add_paragraph(note, style="List Bullet")

doc.save("/home/hatch/workspace/minime-hackathon/submission/SCRIPT_HACKATHON.docx")
print("OK: SCRIPT_HACKATHON.docx ditulis")
