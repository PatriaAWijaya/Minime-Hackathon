//! Instalasi Postiz lokal satu klik (wizard Setup Postiz v51).
//!
//! Tanpa terminal: perintah ini memeriksa Docker, menulis
//! docker-compose.yml + .env + dynamicconfig ke ~/minime-postiz,
//! menjalankan `docker compose up -d`, lalu menunggu port 4007
//! menjawab HTTP. Template compose menyalin struktur instalasi
//! Postiz Patria yang terbukti jalan (postiz-app latest,
//! postgres:17-alpine, redis:7.2, stack Temporal untuk penjadwalan),
//! dengan penyesuaian: tanpa container_name tetap (hindari tabrakan
//! bila pengguna sudah punya container `postiz`), tanpa EMAIL
//! (reset password belum didukung instalasi baru — bukan pemblokir
//! signup/login), tanpa kunci OAuth sosial (diisi belakangan lewat
//! dashboard bila diperlukan channel tertentu).
//!
//! Aturan keamanan (disengaja):
//! - Hanya perintah `docker` dengan argumen tetap, tanpa shell,
//!   tanpa input pengguna di argumen apa pun. Direktori instalasi
//!   tetap (~/minime-postiz), bukan input.
//! - File yang sudah ada TIDAK PERNAH ditimpa: instalasi lama
//!   dipakai ulang apa adanya (up -d saja). Bila compose ada tapi
//!   .env hilang, instalasi ditolak mentah-mentah (status
//!   `incomplete`) karena password DB lama tak bisa ditebak —
//!   menimpa .env akan merusak autentikasi database yang sudah ada.
//! - Secret (JWT_SECRET, POSTGRES_PASSWORD) dibangkitkan dari
//!   /dev/urandom dalam heks (aman untuk URL, tanpa karakter `$`
//!   sehingga interpolasi compose tidak pecah), ditulis hanya ke
//!   .env milik pengguna, dan TIDAK PERNAH masuk log, error string,
//!   atau nilai balik perintah ini. Pesan gagal hanya membawa
//!   ekor stderr docker (tidak memuat nilai env).
//! - TIDAK ADA perintah destruktif: tidak ada `down -v`, tidak ada
//!   hapus volume/direktori. Satu-satunya pengecualian sadar:
//!   `docker compose up -d` dapat me-recreate container bila
//!   confignya berubah — itu perilaku standar compose, bukan hapus data.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const INSTALL_DIR_NAME: &str = "minime-postiz";

const COMPOSE_YML: &str = r#"services:
  postiz:
    image: ghcr.io/gitroomhq/postiz-app:latest
    restart: unless-stopped
    env_file:
      - .env
    environment:
      MAIN_URL: http://localhost:4007
      FRONTEND_URL: http://localhost:4007
      NEXT_PUBLIC_BACKEND_URL: http://localhost:4007/api
      DATABASE_URL: postgresql://postiz-user:${POSTGRES_PASSWORD}@postiz-postgres:5432/postiz-db-local
      REDIS_URL: redis://postiz-redis:6379
      BACKEND_INTERNAL_URL: http://localhost:3000
      TEMPORAL_ADDRESS: temporal:7233
      IS_GENERAL: "true"
      STORAGE_PROVIDER: local
      UPLOAD_DIRECTORY: /uploads/
      NEXT_PUBLIC_UPLOAD_DIRECTORY: /uploads/
      NX_ADD_PLUGINS: "false"
      NOT_SECURED: "true"
    volumes:
      - postiz-config:/config/
      - postiz-uploads:/uploads/
    ports:
      - '4007:5000'
    networks:
      - postiz-network
      - temporal-network
    depends_on:
      postiz-postgres:
        condition: service_healthy
      postiz-redis:
        condition: service_healthy
  postiz-postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postiz-user
      POSTGRES_DB: postiz-db-local
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-volume:/var/lib/postgresql/data
    networks:
      - postiz-network
    healthcheck:
      test: pg_isready -U postiz-user -d postiz-db-local
      interval: 10s
      timeout: 3s
      retries: 3
  postiz-redis:
    image: redis:7.2
    restart: unless-stopped
    healthcheck:
      test: redis-cli ping
      interval: 10s
      timeout: 3s
      retries: 3
    volumes:
      - postiz-redis-data:/data
    networks:
      - postiz-network
  temporal:
    image: temporalio/auto-setup:1.28.1
    restart: unless-stopped
    ports:
      - '7233:7233'
    depends_on:
      - temporal-postgresql
      - temporal-elasticsearch
    environment:
      - DB=postgres12
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=temporal-postgresql
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development-sql.yaml
      - ENABLE_ES=true
      - ES_SEEDS=temporal-elasticsearch
      - ES_VERSION=v7
      - TEMPORAL_NAMESPACE=default
    networks:
      - temporal-network
    volumes:
      - ./dynamicconfig:/etc/temporal/config/dynamicconfig
  temporal-postgresql:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: temporal
      POSTGRES_PASSWORD: temporal
    networks:
      - temporal-network
    expose:
      - 5432
    volumes:
      - /var/lib/postgresql/data
  temporal-elasticsearch:
    image: elasticsearch:7.17.27
    restart: unless-stopped
    environment:
      - cluster.routing.allocation.disk.threshold_enabled=true
      - cluster.routing.allocation.disk.watermark.low=512mb
      - cluster.routing.allocation.disk.watermark.high=256mb
      - cluster.routing.allocation.disk.watermark.flood_stage=128mb
      - discovery.type=single-node
      - ES_JAVA_OPTS=-Xms256m -Xmx256m
      - xpack.security.enabled=false
    networks:
      - temporal-network
    expose:
      - 9200
    volumes:
      - /var/lib/elasticsearch/data
volumes:
  postgres-volume:
  postiz-redis-data:
  postiz-config:
  postiz-uploads:
networks:
  postiz-network:
  temporal-network:
"#;

const DYNAMICCONFIG_YAML: &str = r#"limit.maxIDLength:
  - value: 255
    constraints: {}
system.forceSearchAttributesCacheRefreshOnRead:
  - value: true # Dev setup only. Please don't turn this on in production.
    constraints: {}
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRes {
    pub status: String,
    pub detail: String,
}

fn ok(status: &str) -> InstallRes {
    InstallRes {
        status: status.to_string(),
        detail: String::new(),
    }
}

fn rand_hex(nbytes: usize) -> String {
    let mut buf = vec![0u8; nbytes];
    let got = fs::File::open("/dev/urandom")
        .and_then(|mut f: fs::File| f.read_exact(&mut buf))
        .is_ok();
    if !got {
        // Fallback bila /dev/urandom tak tersedia: waktu + pid.
        let t = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let mut seed = t ^ ((std::process::id() as u128) << 64);
        for b in buf.iter_mut() {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            *b = (seed & 0xff) as u8;
        }
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn install_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME tidak ditemukan".to_string())?;
    Ok(PathBuf::from(home).join(INSTALL_DIR_NAME))
}

fn run(cmd: &str, args: &[&str], dir: Option<&PathBuf>) -> Result<std::process::Output, String> {
    let mut c = Command::new(cmd);
    c.args(args);
    if let Some(d) = dir {
        c.current_dir(d);
    }
    c.output().map_err(|e| e.to_string())
}

fn tail_chars(s: &str, n: usize) -> String {
    let t = s.trim();
    let count = t.chars().count();
    if count <= n {
        t.to_string()
    } else {
        t.chars().skip(count - n).collect()
    }
}

fn http_up() -> bool {
    let mut stream = match TcpStream::connect("127.0.0.1:4007") {
        Ok(s) => s,
        Err(_) => return false,
    };
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(3))).ok();
    if stream.write_all(b"GET / HTTP/1.0\r\n\r\n").is_err() {
        return false;
    }
    let mut buf = [0u8; 512];
    match stream.read(&mut buf) {
        Ok(n) => n > 0 && String::from_utf8_lossy(&buf[..n]).contains("HTTP/"),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn postiz_install() -> Result<InstallRes, String> {
    // 1. Docker tersedia dan daemon berjalan?
    let version = run("docker", &["--version"], None);
    match version {
        Ok(o) if o.status.success() => {}
        _ => return Ok(ok("no_docker")),
    }
    let info = run("docker", &["info"], None);
    match info {
        Ok(o) if o.status.success() => {}
        _ => return Ok(ok("need_docker")),
    }
    // 2. Direktori + file (hanya tulis yang belum ada).
    let dir = install_dir()?;
    fs::create_dir_all(dir.join("dynamicconfig")).map_err(|e| e.to_string())?;
    let compose_path = dir.join("docker-compose.yml");
    let env_path = dir.join(".env");
    let compose_existed = compose_path.exists();
    let env_existed = env_path.exists();
    if compose_existed && !env_existed {
        return Ok(InstallRes {
            status: "incomplete".into(),
            detail: "docker-compose.yml ada tapi .env hilang — pulihkan .env atau pindahkan folder ~/minime-postiz".into(),
        });
    }
    if !compose_existed {
        fs::write(&compose_path, COMPOSE_YML).map_err(|e| e.to_string())?;
    }
    if !env_existed {
        let env = format!(
            "JWT_SECRET={}\nPOSTGRES_PASSWORD={}\n",
            rand_hex(32),
            rand_hex(24)
        );
        fs::write(&env_path, env).map_err(|e| e.to_string())?;
    }
    let dc_path = dir.join("dynamicconfig").join("development-sql.yaml");
    if !dc_path.exists() {
        fs::write(&dc_path, DYNAMICCONFIG_YAML).map_err(|e| e.to_string())?;
    }
    // 3. Jalankan stack (termasuk pull image pertama).
    let up = run("docker", &["compose", "up", "-d"], Some(&dir)).map_err(|e| e)?;
    if !up.status.success() {
        let err = String::from_utf8_lossy(&up.stderr);
        return Ok(InstallRes {
            status: "failed".into(),
            detail: tail_chars(&err, 300),
        });
    }
    // 4. Tunggu port 4007 menjawab HTTP (maks ~180 detik).
    for _ in 0..60 {
        if http_up() {
            return Ok(ok("ok"));
        }
        std::thread::sleep(Duration::from_secs(3));
    }
    Ok(ok("starting"))
}

#[tauri::command]
pub fn open_docker_desktop() -> Result<(), String> {
    Command::new("open")
        .args(["-a", "Docker"])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// v60: isi kredensial provider OAuth Postiz dari dalam MiniMe
/// (perintah Patria: user cukup input/klik di aplikasi — tanpa
/// terminal, tanpa edit .env manual).
///
/// Keamanan (disengaja):
/// - Nilai TIDAK PERNAH masuk log, error string, atau nilai balik —
///   yang dikembalikan hanya direktori Postiz yang dipakai.
/// - Hanya 4 kunci yang boleh ditulis (LINKEDIN_CLIENT_ID/SECRET,
///   INSTAGRAM_APP_ID/SECRET); baris .env lain dipertahankan
///   byte-per-byte (komentar, baris kosong, kunci lain termasuk
///   kredensial SMTP tidak disentuh). Nilai kosong = lewati kunci itu.
/// - Nilai dengan baris baru ditolak mentah-mentah (anti injeksi
///   baris .env); nilai di luar set aman dikutip ganda + escape.
/// - Direktori Postiz TIDAK ditebak dari path tetap: diambil dari
///   label compose container yang sedang melayani port 4007.
///   Bila Postiz tidak jalan, perintah ditolak (kredensial tanpa
///   restart tidak ada gunanya).
/// - Restart HANYA service `postiz` (bukan postgres/redis) — data
///   tidak disentuh; tulis .env lewat file sementara + rename agar
///   tidak pernah setengah tertulis.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderEnvReq {
    pub linkedin_id: String,
    pub linkedin_secret: String,
    pub instagram_id: String,
    pub instagram_secret: String,
}

fn docker_bin() -> Option<String> {
    // App GUI punya PATH minimal — coba docker di PATH dulu, lalu
    // lokasi-lokasi umum macOS.
    if Command::new("docker")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some("docker".to_string());
    }
    let home = std::env::var("HOME").unwrap_or_default();
    for p in [
        "/Applications/Docker.app/Contents/Resources/bin/docker",
        "/usr/local/bin/docker",
        &format!("{home}/.docker/bin/docker"),
    ] {
        if Command::new(p)
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(p.to_string());
        }
    }
    None
}

fn docker_out(docker: &str, args: &[&str], dir: Option<&PathBuf>) -> Result<String, String> {
    let mut c = Command::new(docker);
    c.args(args);
    if let Some(d) = dir {
        c.current_dir(d);
    }
    let out = c.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(tail_chars(&String::from_utf8_lossy(&out.stderr), 300));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

fn env_line(key: &str, val: &str) -> String {
    if val
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        format!("{key}={val}")
    } else {
        let esc = val.replace('\\', "\\\\").replace('"', "\\\"");
        format!("{key}=\"{esc}\"")
    }
}

fn upsert_env(content: &str, pairs: &[(&str, &str)]) -> String {
    let mut done = vec![false; pairs.len()];
    let mut out = String::new();
    for line in content.lines() {
        let t = line.trim_start();
        let body = t.strip_prefix("export ").unwrap_or(t);
        let mut replaced = false;
        for (i, (k, v)) in pairs.iter().enumerate() {
            if let Some(rest) = body.strip_prefix(k) {
                if rest.starts_with('=') {
                    out.push_str(&env_line(k, v));
                    out.push('\n');
                    done[i] = true;
                    replaced = true;
                    break;
                }
            }
        }
        if !replaced {
            out.push_str(line);
            out.push('\n');
        }
    }
    for (i, (k, v)) in pairs.iter().enumerate() {
        if !done[i] {
            out.push_str(&env_line(k, v));
            out.push('\n');
        }
    }
    out
}

#[tauri::command]
pub fn postiz_provider_env(req: ProviderEnvReq) -> Result<String, String> {
    let pairs: Vec<(&str, &str)> = [
        ("LINKEDIN_CLIENT_ID", req.linkedin_id.trim()),
        ("LINKEDIN_CLIENT_SECRET", req.linkedin_secret.trim()),
        ("INSTAGRAM_APP_ID", req.instagram_id.trim()),
        ("INSTAGRAM_APP_SECRET", req.instagram_secret.trim()),
    ]
    .into_iter()
    .filter(|(_, v)| !v.is_empty())
    .collect();
    if pairs.is_empty() {
        return Err("Tidak ada nilai yang diisi".into());
    }
    for (_, v) in &pairs {
        if v.contains('\n') || v.contains('\r') {
            return Err("Nilai tidak boleh mengandung baris baru".into());
        }
    }
    let docker = docker_bin().ok_or("Docker tidak ditemukan — jalankan Docker Desktop dulu")?;
    let ps = docker_out(&docker, &["ps", "--format", "{{.ID}} {{.Ports}}"], None)?;
    let mut dir: Option<PathBuf> = None;
    for line in ps.lines() {
        if !line.contains("4007") {
            continue;
        }
        let id = line.split_whitespace().next().unwrap_or("");
        if id.is_empty() {
            continue;
        }
        let wd = docker_out(
            &docker,
            &[
                "inspect",
                id,
                "--format",
                "{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}",
            ],
            None,
        )?;
        let wd = wd.trim().to_string();
        if !wd.is_empty() && wd != "<no value>" {
            dir = Some(PathBuf::from(wd));
            break;
        }
    }
    let dir =
        dir.ok_or("Postiz tidak sedang jalan di port 4007 — jalankan dulu dari wizard langkah 1")?;
    if !dir.join("docker-compose.yml").exists() {
        return Err("docker-compose.yml tidak ditemukan di direktori Postiz".into());
    }
    let env_path = dir.join(".env");
    let old = fs::read_to_string(&env_path).unwrap_or_default();
    let new = upsert_env(&old, &pairs);
    let tmp = dir.join(".env.minime-tmp");
    fs::write(&tmp, &new).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &env_path).map_err(|e| e.to_string())?;
    docker_out(&docker, &["compose", "up", "-d", "postiz"], Some(&dir))
        .map_err(|e| format!("Restart Postiz gagal: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}
