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

use serde::Serialize;
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
