#!/bin/bash
# Perbaiki MiniMe — pasang MiniMe.app dari DMG ini ke /Applications,
# hapus flag quarantine, lalu sign ulang ad-hoc supaya Gatekeeper
# tidak lagi menolak app saat dibuka.
#
# Cara pakai: double-click file ini di dalam DMG MiniMe.
# (Saat pertama kali dibuka dari DMG yang diunduh, macOS bisa menampilkan
#  dialog peringatan "downloaded from the Internet" — klik Open.)
#
# Yang dilakukan script ini, berurutan:
#   1. Bila /Applications/MiniMe.app sudah ada, pindahkan ke Trash lewat
#      Finder (osascript delete) supaya bisa dipulihkan — tanpa rm -rf.
#   2. Salin MiniMe.app dari DMG ke /Applications (cp -R).
#   3. Hapus flag quarantine rekursif (xattr -dr com.apple.quarantine).
#   4. Sign ulang ad-hoc (codesign --force --deep --sign -).
#   5. Verifikasi (codesign --verify, spctl -a, cek xattr) dengan hasil
#      berbahasa awam.
# Script ini idempotent dan aman dijalankan dua kali. Tanpa sudo.
# Lokasi DMG ditentukan dari posisi script sendiri (dirname $0),
# tanpa hardcode /Volumes/MiniMe.
set -euo pipefail

DMG_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="$DMG_DIR/MiniMe.app"
APP_DST="/Applications/MiniMe.app"

echo "== Perbaiki MiniMe =="
echo "Sumber: $APP_SRC"
echo ""

if [ ! -d "$APP_SRC" ]; then
  echo "GAGAL: MiniMe.app tidak ditemukan di samping script ini."
  echo "Jalankan script ini dari dalam DMG MiniMe (jangan pindahkan scriptnya keluar DMG)."
  read -p "Tekan Enter untuk menutup... " _ || true
  exit 1
fi

# 1. App lama -> Trash lewat Finder (bisa dipulihkan, bukan rm -rf)
if [ -e "$APP_DST" ]; then
  echo "MiniMe.app lama ditemukan di /Applications, memindahkan ke Trash..."
  if ! osascript -e 'tell application "Finder" to delete POSIX file "/Applications/MiniMe.app"'; then
    echo "GAGAL: tidak bisa memindahkan app lama ke Trash."
    echo "Tutup MiniMe bila sedang jalan, lalu coba lagi."
    read -p "Tekan Enter untuk menutup... " _ || true
    exit 1
  fi
  for _ in $(seq 1 30); do
    [ ! -e "$APP_DST" ] && break
    sleep 1
  done
  if [ -e "$APP_DST" ]; then
    echo "GAGAL: app lama masih ada di /Applications sesudah 30 detik."
    read -p "Tekan Enter untuk menutup... " _ || true
    exit 1
  fi
  echo "App lama sudah di Trash."
fi

# 2. Salin dari DMG ke /Applications
echo "Menyalin MiniMe.app ke /Applications..."
if ! cp -R "$APP_SRC" "$APP_DST"; then
  echo "GAGAL: tidak bisa menyalin MiniMe.app ke /Applications."
  read -p "Tekan Enter untuk menutup... " _ || true
  exit 1
fi

# 3. Hapus flag quarantine (bila tidak ada flag, lanjut saja)
echo "Menghapus flag quarantine..."
if xattr -dr com.apple.quarantine "$APP_DST" 2>/dev/null; then
  echo "Flag quarantine dihapus."
else
  echo "Catatan: tidak ada flag quarantine yang perlu dihapus."
fi

# 4. Sign ulang ad-hoc
echo "Menandatangani ulang (ad-hoc)..."
if ! codesign --force --deep --sign - "$APP_DST"; then
  echo "GAGAL: codesign gagal. Lihat pesan di atas."
  read -p "Tekan Enter untuk menutup... " _ || true
  exit 1
fi

# 5. Verifikasi (hanya info, kegagalan di sini tidak menghentikan script)
echo "Memverifikasi..."
if codesign --verify --deep --verbose "$APP_DST" 2>&1; then
  echo "codesign --verify: LOLOS"
else
  echo "PERINGATAN: codesign --verify gagal — lihat baris di atas."
fi
echo "--- spctl (info; app ad-hoc tetap ditolak spctl, itu sudah diketahui) ---"
spctl -a -vv "$APP_DST" 2>&1 || true
echo "--- quarantine ---"
if xattr -l "$APP_DST" 2>/dev/null | grep -q com.apple.quarantine; then
  echo "PERINGATAN: flag quarantine masih ada."
else
  echo "Quarantine: bersih."
fi

echo ""
echo "SELESAI. MiniMe.app sudah terpasang di /Applications dan siap dibuka."
echo "Bila macOS masih menampilkan peringatan saat pertama dibuka,"
echo "klik kanan MiniMe.app lalu pilih Open."
read -p "Tekan Enter untuk menutup... " _ || true
