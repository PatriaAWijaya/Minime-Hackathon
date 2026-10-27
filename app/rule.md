# rule.md — MiniMe App Build Rules

Hard rules. A rule is broken only by Patria's explicit order for
that specific case, recorded in the log.

1. **Indie new-work-only.** Nothing from old Minime code is copied
   into this repo. Third-party engines (FFmpeg, Whisper,
   HyperFrames, mediabunny) are tools, never claimed as event work.
2. **No secrets in the repo.** No API keys, tokens, passwords, or
   private keys in code, docs, logs, or prompts. Keys live in
   environment / Secure Vault / local Keychain only. The repo
   must pass `npm run scan` on every commit.
3. **Gates belong to Patria.** No gate (GSTP, GKonten, Fase 0, or
   any other) is approved by the agent. Code enforces gates and
   fails visibly (GateError) without an approval record.
4. **Postiz draft-only.** The client exposes createDraft only.
   No publish/schedule method may be added without Patria's
   explicit order. Nothing is published or scheduled by default.
5. **Zero-error gate.** `npx tsc` (0 errors), `npm run gate-test`
   (all groups pass), `npm run scan` (passed), app/prototype JS
   checks — all green before any push. A push + log entry happens
   only on a clean pass.
6. **No silent failures.** A feature that cannot work must say so
   in the UI (like the Export button stating the engine does not
   exist yet). No fake success states, no unlabelled mocks in
   production paths (test mocks are labelled).
7. **Compact but powerful.** No unused dependencies, no duplicate
   artifacts, no dead code. The v5 single-file build is the one
   frontend source in Tahap A — never a second copy.
8. **Rust hygiene.** No `unwrap()`/`expect()` in production Rust
   paths; handle errors and exit cleanly with a message.
9. **Vite `base: './'` is mandatory** for any Vite frontend build
   (absolute `/assets/...` paths break under Tauri WebView).
10. **User data is never deleted automatically.** A user-entered
    project or a working flow is removed only on Patria's explicit
    command — never as a side effect of a build, restart, or
    self-heal.
11. **Rupiah first.** Costs are shown in IDR whenever a rate
    exists; when no rate exists, IDR is null — never guessed.
12. **Theme + nav are locked.** Monochrome + pastel pink `#FFD1DC`
    (dark text on accent surfaces); agent list + Detail panel
    only in the Home window. Changes need Patria's order.
13. **Bahasa: Indonesia, Inggris, Mandarin.** Model AI dan UI
    memakai tiga bahasa ini (ID/EN/ZH); pengguna mengganti
    bahasa lewat menu Pengaturan; default Patria adalah
    Indonesia. String UI baru wajib tersedia di ketiga
    bahasa; dropdown bahasa yang belum mengganti apa pun
    dilarang (aturan no.6: tanpa status sukses palsu).
14. **Engine video: compiler di frontend, eksekusi di Rust,
    tanpa shell.** Model timeline + compiler FFmpeg murni di
    frontend (teruji unit); Rust hanya menjalankan argv
    FFmpeg/ffprobe tanpa shell; QC gagal = render gagal,
    bukan sukses. Timeline ve2 (dummy) belum tersambung ke
    model render — penyambungan itu pekerjaan lanjutan,
    bukan klaim.
