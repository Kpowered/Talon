use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::context_builder;
use crate::diagnosis_engine::{self, DiagnosisContextPacket, DiagnosisGenerationInput};
use crate::secrets;
use crate::session_store::{self, DiagnosisResponse, FailureContext, Host, HostConfig as HostRecordConfig, HostObservedState, Session, TalonWorkspaceState, TerminalSnapshot};

const META_SHELL_PREFIX: &str = "__TALON_META_SHELL__";
const META_CWD_PREFIX: &str = "__TALON_META_CWD__";
const CMD_START_PREFIX: &str = "__TALON_CMD_START__";
const CMD_END_PREFIX: &str = "__TALON_CMD_END__";
const CONNECT_TIMEOUT_SECONDS: u64 = 8;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConnectionConfig {
    pub host_id: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub fingerprint_hint: String,
    pub private_key_path: Option<String>,
    #[serde(default)]
    pub has_saved_password: bool,
}

#[derive(Clone)]
pub struct ManagedSessionRecord {
    pub id: String,
    pub host_id: String,
    pub state: String,
    pub shell: String,
    pub cwd: String,
    pub connected_at: String,
    pub last_command_at: String,
    pub auto_capture_enabled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLifecycleEvent {
    pub id: String,
    pub session_id: String,
    pub event_type: String,
    pub detail: String,
    pub occurred_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConnectionIssue {
    pub session_id: String,
    pub kind: String,
    pub title: String,
    pub summary: String,
    pub operator_action: String,
    pub suggested_command: String,
    pub observed_at: String,
    pub fingerprint: Option<String>,
    pub expected_fingerprint_hint: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub can_trust_in_app: bool,
    pub in_app_action_kind: Option<String>,
    pub in_app_action_label: Option<String>,
}

#[derive(Clone)]
pub struct CommandHistoryEntry {
    pub id: String,
    pub session_id: String,
    pub command: String,
    pub started_at: String,
    pub completed_at: String,
    pub exit_code: i32,
    pub stderr_class: Option<String>,
    pub stderr_evidence: Option<String>,
    pub stdout_tail: Vec<String>,
    pub stderr_tail: Vec<String>,
}

struct ActiveCommandState {
    id: String,
    command: String,
    started_at: String,
    stdout_tail: Vec<String>,
    stderr_tail: Vec<String>,
}

#[derive(Default)]
struct SessionStreamState {
    stdout_tail: Vec<String>,
    stderr_tail: Vec<String>,
    last_updated_at: String,
}

struct DiagnosisCacheEntry {
    trigger_key: String,
    response: DiagnosisResponse,
    packet: DiagnosisContextPacket,
}

struct SessionRuntimeHandle {
    stdin: Arc<Mutex<ChildStdin>>,
    pid: u32,
    askpass_path: Option<PathBuf>,
    started_at: Instant,
}

pub struct SessionRegistry {
    pub hosts: Vec<Host>,
    pub host_configs: Vec<HostConnectionConfig>,
    pub managed_sessions: Vec<ManagedSessionRecord>,
    pub active_session_id: String,
    pub recent_events: Vec<SessionLifecycleEvent>,
    pub terminal_buffers: HashMap<String, Vec<String>>,
    stream_state: HashMap<String, SessionStreamState>,
    connection_issues: HashMap<String, SessionConnectionIssue>,
    latest_failures: HashMap<String, FailureContext>,
    active_commands: HashMap<String, ActiveCommandState>,
    command_history: Vec<CommandHistoryEntry>,
    runtimes: HashMap<String, SessionRuntimeHandle>,
    diagnosis_cache: HashMap<String, DiagnosisCacheEntry>,
    event_counter: usize,
    command_counter: usize,
}

static REGISTRY: OnceLock<Mutex<SessionRegistry>> = OnceLock::new();
const HOST_CONFIGS_FILE_NAME: &str = "host-configs.json";
const HOSTS_FILE_NAME: &str = "hosts.json";

fn now_iso() -> String {
    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg("[DateTime]::UtcNow.ToString('o')")
        .output();

    match output {
        Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout).trim().to_string(),
        _ => "2026-03-06T00:00:00.0000000Z".into(),
    }
}

fn default_host_configs() -> Vec<HostConnectionConfig> {
    vec![
        HostConnectionConfig {
            host_id: "host-prod-web-1".into(),
            port: 22,
            username: "root".into(),
            auth_method: "agent".into(),
            fingerprint_hint: "SHA256:prod-web-1".into(),
            private_key_path: None,
            has_saved_password: false,
        },
        HostConnectionConfig {
            host_id: "host-api-gateway".into(),
            port: 22,
            username: "root".into(),
            auth_method: "agent".into(),
            fingerprint_hint: "SHA256:api-gateway".into(),
            private_key_path: None,
            has_saved_password: false,
        },
        HostConnectionConfig {
            host_id: "host-db-primary".into(),
            port: 22,
            username: "postgres".into(),
            auth_method: "private-key".into(),
            fingerprint_hint: "SHA256:db-primary".into(),
            private_key_path: None,
            has_saved_password: false,
        },
    ]
}

fn default_hosts() -> Vec<Host> {
    vec![
        Host {
            id: "host-prod-web-1".into(),
            config: HostRecordConfig {
                label: "prod-web-1".into(),
                address: "root@10.0.0.12".into(),
                region: "sjc-1".into(),
                tags: vec!["production".into(), "edge".into()],
            },
            observed: HostObservedState {
                status: "critical".into(),
                latency_ms: 186,
                cpu_percent: 74,
                memory_percent: 81,
                last_seen_at: "2026-03-06T13:41:32Z".into(),
            },
        },
        Host {
            id: "host-api-gateway".into(),
            config: HostRecordConfig {
                label: "api-gateway".into(),
                address: "root@10.0.0.23".into(),
                region: "hkg-1".into(),
                tags: vec!["production".into(), "api".into()],
            },
            observed: HostObservedState {
                status: "warning".into(),
                latency_ms: 92,
                cpu_percent: 46,
                memory_percent: 67,
                last_seen_at: "2026-03-06T13:41:09Z".into(),
            },
        },
        Host {
            id: "host-db-primary".into(),
            config: HostRecordConfig {
                label: "db-primary".into(),
                address: "postgres@10.0.0.31".into(),
                region: "hkg-1".into(),
                tags: vec!["production".into(), "database".into()],
            },
            observed: HostObservedState {
                status: "healthy".into(),
                latency_ms: 41,
                cpu_percent: 31,
                memory_percent: 54,
                last_seen_at: "2026-03-06T13:40:58Z".into(),
            },
        },
    ]
}

fn host_configs_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir().or_else(dirs::data_dir)?;
    Some(base.join("Talon").join(HOST_CONFIGS_FILE_NAME))
}

fn hosts_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir().or_else(dirs::data_dir)?;
    Some(base.join("Talon").join(HOSTS_FILE_NAME))
}

fn load_host_configs() -> Vec<HostConnectionConfig> {
    let Some(path) = host_configs_path() else {
        return default_host_configs();
    };

    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str::<Vec<HostConnectionConfig>>(&contents).unwrap_or_else(|_| default_host_configs()),
        Err(_) => default_host_configs(),
    }
}

fn load_hosts() -> Vec<Host> {
    let Some(path) = hosts_path() else {
        return default_hosts();
    };

    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str::<Vec<Host>>(&contents).unwrap_or_else(|_| default_hosts()),
        Err(_) => default_hosts(),
    }
}

fn save_host_configs(host_configs: &[HostConnectionConfig]) -> Result<(), String> {
    let Some(path) = host_configs_path() else {
        return Err("Could not resolve local data directory for Talon host configs.".into());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = serde_json::to_string_pretty(host_configs).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn save_hosts(hosts: &[Host]) -> Result<(), String> {
    let Some(path) = hosts_path() else {
        return Err("Could not resolve local data directory for Talon hosts.".into());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = serde_json::to_string_pretty(hosts).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

fn default_session() -> ManagedSessionRecord {
    ManagedSessionRecord {
        id: "session-a91f".into(),
        host_id: "host-prod-web-1".into(),
        state: "disconnected".into(),
        shell: "bash".into(),
        cwd: "/etc/nginx".into(),
        connected_at: "2026-03-06T13:36:02Z".into(),
        last_command_at: "2026-03-06T13:42:02Z".into(),
        auto_capture_enabled: true,
    }
}

fn default_events() -> Vec<SessionLifecycleEvent> {
    vec![SessionLifecycleEvent {
        id: "event-bootstrap-session-registry".into(),
        session_id: "session-a91f".into(),
        event_type: "bootstrap".into(),
        detail: "Session registry initialized. Real SSH transport is now wired through ssh.exe.".into(),
        occurred_at: "2026-03-06T13:36:02Z".into(),
    }]
}

fn default_terminal_buffer() -> Vec<String> {
    vec!["Talon session registry ready. Connect a host to start a real SSH shell.".into()]
}

fn registry() -> &'static Mutex<SessionRegistry> {
    REGISTRY.get_or_init(|| {
        let default_session = default_session();
        let mut terminal_buffers = HashMap::new();
        terminal_buffers.insert(default_session.id.clone(), default_terminal_buffer());

        Mutex::new(SessionRegistry {
            hosts: load_hosts(),
            host_configs: load_host_configs(),
            managed_sessions: vec![default_session.clone()],
            active_session_id: default_session.id.clone(),
            recent_events: default_events(),
            terminal_buffers,
            stream_state: HashMap::new(),
            connection_issues: HashMap::new(),
            latest_failures: HashMap::new(),
            active_commands: HashMap::new(),
            command_history: Vec::new(),
            runtimes: HashMap::new(),
            diagnosis_cache: HashMap::new(),
            event_counter: 0,
            command_counter: 0,
        })
    })
}

fn lock_registry() -> MutexGuard<'static, SessionRegistry> {
    registry().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn lock_stdin(stdin: &Arc<Mutex<ChildStdin>>) -> MutexGuard<'_, ChildStdin> {
    stdin.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}


pub fn list_host_configs() -> Vec<HostConnectionConfig> {
    lock_registry()
        .host_configs
        .iter()
        .cloned()
        .map(|mut config| {
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            config
        })
        .collect()
}

pub fn upsert_host(host: Host) -> Result<Vec<Host>, String> {
    let mut registry = lock_registry();
    if let Some(existing) = registry.hosts.iter_mut().find(|existing| existing.id == host.id) {
        *existing = host;
    } else {
        registry.hosts.insert(0, host);
    }
    save_hosts(&registry.hosts)?;
    Ok(registry.hosts.clone())
}

pub fn upsert_host_config(config: HostConnectionConfig) -> Result<Vec<HostConnectionConfig>, String> {
    let updated_configs = {
        let mut registry = lock_registry();
        if let Some(existing) = registry
            .host_configs
            .iter_mut()
            .find(|existing| existing.host_id == config.host_id)
        {
            *existing = config.clone();
            existing.has_saved_password = secrets::has_saved_host_password(&existing.host_id);
        } else {
            let mut config = config;
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            registry.host_configs.insert(0, config);
        }
        save_host_configs(&registry.host_configs)?;
        registry.host_configs.clone()
    };

    Ok(updated_configs
        .into_iter()
        .map(|mut config| {
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            config
        })
        .collect())
}

pub fn delete_host_config(host_id: &str) -> Result<Vec<HostConnectionConfig>, String> {
    let updated_configs = {
        let mut registry = lock_registry();
        registry.host_configs.retain(|config| config.host_id != host_id);
        save_host_configs(&registry.host_configs)?;
        registry.host_configs.clone()
    };

    Ok(updated_configs
        .into_iter()
        .map(|mut config| {
            config.has_saved_password = secrets::has_saved_host_password(&config.host_id);
            config
        })
        .collect())
}

pub fn delete_host(host_id: &str) -> Result<Vec<Host>, String> {
    let mut registry = lock_registry();
    registry.hosts.retain(|host| host.id != host_id);
    registry.host_configs.retain(|config| config.host_id != host_id);
    save_hosts(&registry.hosts)?;
    save_host_configs(&registry.host_configs)?;
    Ok(registry.hosts.clone())
}

pub fn busy_session_ids() -> Vec<String> {
    lock_registry()
        .active_commands
        .keys()
        .cloned()
        .collect()
}

pub fn connection_issue_for(session_id: &str) -> Option<SessionConnectionIssue> {
    lock_registry()
        .connection_issues
        .get(session_id)
        .cloned()
}

pub fn host_config_for(host_id: &str) -> Option<HostConnectionConfig> {
    lock_registry()
        .host_configs
        .iter()
        .find(|config| config.host_id == host_id)
        .cloned()
}

pub fn host_for(host_id: &str) -> Option<Host> {
    lock_registry()
        .hosts
        .iter()
        .find(|host| host.id == host_id)
        .cloned()
}

pub fn first_host() -> Option<Host> {
    lock_registry().hosts.first().cloned()
}

pub fn recent_events() -> Vec<SessionLifecycleEvent> {
    lock_registry().recent_events.clone()
}

pub fn terminal_snapshot(session_id: &str) -> TerminalSnapshot {
    let registry = lock_registry();
    let lines = registry
        .terminal_buffers
        .get(session_id)
        .cloned()
        .or_else(|| registry.terminal_buffers.get(&registry.active_session_id).cloned())
        .unwrap_or_default();

    TerminalSnapshot {
        session_id: session_id.into(),
        lines,
    }
}

fn next_event_id(registry: &mut SessionRegistry, session_id: &str, event_type: &str) -> String {
    registry.event_counter += 1;
    format!("event-{}-{}-{}", session_id, event_type, registry.event_counter)
}

fn push_event(registry: &mut SessionRegistry, session_id: &str, event_type: &str, detail: String) {
    let event = SessionLifecycleEvent {
        id: next_event_id(registry, session_id, event_type),
        session_id: session_id.into(),
        event_type: event_type.into(),
        detail,
        occurred_at: now_iso(),
    };
    registry.recent_events.insert(0, event);
    registry.recent_events.truncate(24);
}

fn push_terminal_line(registry: &mut SessionRegistry, session_id: &str, line: String) {
    let lines = registry
        .terminal_buffers
        .entry(session_id.into())
        .or_insert_with(Vec::new);
    lines.push(line);
    if lines.len() > 400 {
        let drain = lines.len() - 400;
        lines.drain(0..drain);
    }
}

fn push_stream_tail(target: &mut Vec<String>, line: String) {
    target.push(line);
    if target.len() > 80 {
        let drain = target.len() - 80;
        target.drain(0..drain);
    }
}

fn capture_stream_line(registry: &mut SessionRegistry, session_id: &str, stream: &str, line: &str) {
    let state = registry
        .stream_state
        .entry(session_id.into())
        .or_insert_with(SessionStreamState::default);

    state.last_updated_at = now_iso();
    match stream {
        "stderr" => push_stream_tail(&mut state.stderr_tail, line.into()),
        _ => push_stream_tail(&mut state.stdout_tail, line.into()),
    }
}

fn capture_command_stream_line(registry: &mut SessionRegistry, session_id: &str, stream: &str, line: &str) {
    if let Some(command) = registry.active_commands.get_mut(session_id) {
        match stream {
            "stderr" => push_stream_tail(&mut command.stderr_tail, line.into()),
            _ => push_stream_tail(&mut command.stdout_tail, line.into()),
        }
    }
}

fn set_connection_issue(
    registry: &mut SessionRegistry,
    session_id: &str,
    kind: &str,
    title: &str,
    summary: String,
    operator_action: &str,
    suggested_command: String,
) {
    registry.connection_issues.insert(
        session_id.into(),
        SessionConnectionIssue {
            session_id: session_id.into(),
            kind: kind.into(),
            title: title.into(),
            summary,
            operator_action: operator_action.into(),
            suggested_command,
            observed_at: now_iso(),
            fingerprint: None,
            expected_fingerprint_hint: None,
            host: None,
            port: None,
            can_trust_in_app: false,
            in_app_action_kind: None,
            in_app_action_label: None,
        },
    );
}

fn clear_connection_issue(registry: &mut SessionRegistry, session_id: &str) {
    registry.connection_issues.remove(session_id);
}

fn classify_connection_issue(host: &Host, line: &str) -> Option<(String, String, String, String, String)> {
    let normalized = line.to_ascii_lowercase();
    let escaped_host = host.config.address.replace('\'', "''");

    if normalized.contains("host key verification failed")
        || normalized.contains("no host key is known")
        || normalized.contains("remote host identification has changed")
    {
        let title = if normalized.contains("changed") {
            "Host key mismatch"
        } else {
            "Host trust confirmation required"
        };
        let operator_action = if normalized.contains("changed") {
            "Compare the expected fingerprint with an operator-approved value before changing known_hosts."
        } else {
            "Review the server fingerprint out of band before trusting this host."
        };
        let suggested_command = if normalized.contains("changed") {
            format!("ssh-keygen -R \"{}\"", host.config.address)
        } else {
            format!("ssh-keyscan -H \"{}\"", escaped_host)
        };
        return Some((
            "host-trust".into(),
            title.into(),
            line.into(),
            operator_action.into(),
            suggested_command,
        ));
    }

    if normalized.contains("permission denied")
        || normalized.contains("no supported authentication methods available")
        || normalized.contains("publickey")
    {
        return Some((
            "auth".into(),
            "SSH authentication failed".into(),
            line.into(),
            "Confirm the username, agent state, and selected private key before retrying.".into(),
            "ssh-add -L".into(),
        ));
    }

    if normalized.contains("connection timed out") || normalized.contains("operation timed out") {
        return Some((
            "timeout".into(),
            "SSH connection timed out".into(),
            line.into(),
            "Confirm host reachability and network path before retrying.".into(),
            format!("ssh -vvv {}", host.config.address),
        ));
    }

    if normalized.contains("could not resolve hostname")
        || normalized.contains("connection refused")
        || normalized.contains("no route to host")
        || normalized.contains("name or service not known")
    {
        return Some((
            "network".into(),
            "SSH network path failed".into(),
            line.into(),
            "Verify DNS, port reachability, and whether sshd is accepting connections on the target.".into(),
            format!("ssh -vvv {}", host.config.address),
        ));
    }

    None
}

fn classify_local_connection_error(host: &Host, line: &str) -> (String, String, String, String, String) {
    classify_connection_issue(host, line).unwrap_or((
        "transport".into(),
        "SSH transport launch failed".into(),
        line.into(),
        "Review the local SSH configuration, selected auth method, and transport prerequisites before retrying.".into(),
        format!("ssh -vvv {}", host.config.address),
    ))
}

fn create_askpass_helper(session_id: &str) -> Result<PathBuf, String> {
    let sanitized = session_id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>();
    let path = env::temp_dir().join(format!("talon_askpass_{}.cmd", sanitized));
    fs::write(&path, "@echo off\r\necho %TALON_SSH_PASSWORD%\r\n").map_err(|error| error.to_string())?;
    Ok(path)
}

fn next_command_id(registry: &mut SessionRegistry, session_id: &str) -> String {
    registry.command_counter += 1;
    format!("cmd-{}-{}", session_id, registry.command_counter)
}

fn parse_command_end(line: &str) -> Option<(String, i32, String)> {
    let payload = line.strip_prefix(CMD_END_PREFIX)?;
    let mut parts = payload.splitn(3, "__");
    let command_id = parts.next()?.to_string();
    let exit_code = parts.next()?.parse::<i32>().ok()?;
    let cwd = parts.next()?.to_string();
    Some((command_id, exit_code, cwd))
}

fn complete_active_command(registry: &mut SessionRegistry, session_id: &str, command_id: &str, exit_code: i32, cwd: &str) {
    let Some(command) = registry.active_commands.remove(session_id) else {
        push_event(
            registry,
            session_id,
            "command-error",
            format!("Received completion marker for unknown command {}", command_id),
        );
        return;
    };

    if command.id != command_id {
        push_event(
            registry,
            session_id,
            "command-error",
            format!(
                "Received completion marker for {} while {} was active",
                command_id, command.id
            ),
        );
    }

    update_session_metadata(registry, session_id, None, Some(cwd));
    let completed_at = now_iso();
    let stderr_signal = classify_command_stderr_signal(&command.stderr_tail);
    let stderr_class = stderr_signal.as_ref().map(|(class, _, _)| (*class).to_string());
    let stderr_evidence = stderr_signal.as_ref().map(|(_, _, evidence)| evidence.clone());
    registry.command_history.insert(
        0,
        CommandHistoryEntry {
            id: command.id.clone(),
            session_id: session_id.into(),
            command: command.command.clone(),
            started_at: command.started_at.clone(),
            completed_at: completed_at.clone(),
            exit_code,
            stderr_class,
            stderr_evidence,
            stdout_tail: command.stdout_tail.clone(),
            stderr_tail: command.stderr_tail.clone(),
        },
    );
    registry.command_history.truncate(48);

    push_event(
        registry,
        session_id,
        "command-completed",
        format!("{} exited with code {} in {}", command.command, exit_code, cwd),
    );

    let observed_status = command_health_status(registry, session_id, &command.stderr_tail);
    update_host_observed_for_session(registry, session_id, Some(observed_status), true);

    if exit_code != 0 {
        let session = registry.managed_sessions.iter().find(|session| session.id == session_id);
        if let Some(command_entry) = registry.command_history.first().cloned() {
            registry.latest_failures.insert(
                session_id.into(),
                context_builder::build_failure_context(session_id, session, &command_entry),
            );
        }
        push_event(
            registry,
            session_id,
            "command-failed",
            format!("{} failed with exit code {}", command.command, exit_code),
        );
    }
}

fn update_session_state(registry: &mut SessionRegistry, session_id: &str, state: &str) {
    if let Some(session) = registry.managed_sessions.iter_mut().find(|session| session.id == session_id) {
        session.state = state.into();
        if state == "connected" {
            session.connected_at = now_iso();
        }
    }
}

fn update_host_observed(
    registry: &mut SessionRegistry,
    host_id: &str,
    status: Option<&str>,
    last_seen_at: Option<&str>,
    latency_ms: Option<u32>,
) {
    if let Some(host) = registry.hosts.iter_mut().find(|host| host.id == host_id) {
        if let Some(status) = status {
            host.observed.status = status.into();
        }
        if let Some(last_seen_at) = last_seen_at {
            host.observed.last_seen_at = last_seen_at.into();
        }
        if let Some(latency_ms) = latency_ms {
            host.observed.latency_ms = latency_ms;
        }
        let _ = save_hosts(&registry.hosts);
    }
}

fn update_host_observed_for_session(
    registry: &mut SessionRegistry,
    session_id: &str,
    status: Option<&str>,
    touch_last_seen: bool,
) {
    let host_id = registry
        .managed_sessions
        .iter()
        .find(|session| session.id == session_id)
        .map(|session| session.host_id.clone());

    if let Some(host_id) = host_id {
        let last_seen = if touch_last_seen { Some(now_iso()) } else { None };
        update_host_observed(registry, &host_id, status, last_seen.as_deref(), None);
    }
}

fn capture_connect_latency_ms(registry: &SessionRegistry, session_id: &str) -> Option<u32> {
    registry
        .runtimes
        .get(session_id)
        .map(|runtime| runtime.started_at.elapsed().as_millis().min(u128::from(u32::MAX)) as u32)
}

fn classify_command_stderr_signal(stderr_tail: &[String]) -> Option<(&'static str, &'static str, String)> {
    for line in stderr_tail.iter().rev() {
        let normalized = line.to_ascii_lowercase();

        if normalized.contains("connection refused")
            || normalized.contains("connection reset")
            || normalized.contains("no route to host")
            || normalized.contains("network is unreachable")
        {
            return Some(("network-path", "critical", line.clone()));
        }

        if normalized.contains("no space left on device")
            || normalized.contains("disk quota exceeded")
            || normalized.contains("read-only file system")
        {
            return Some(("filesystem", "critical", line.clone()));
        }

        if normalized.contains("out of memory")
            || normalized.contains("cannot allocate memory")
            || normalized.contains(" killed")
            || normalized.starts_with("killed")
            || normalized.contains("oom")
        {
            return Some(("resource-pressure", "critical", line.clone()));
        }

        if normalized.contains("permission denied")
            || normalized.contains("access denied")
            || normalized.contains("operation not permitted")
        {
            return Some(("permission", "warning", line.clone()));
        }
    }

    None
}

fn classify_command_stderr_severity(stderr_tail: &[String]) -> Option<&'static str> {
    classify_command_stderr_signal(stderr_tail).map(|(_, severity, _)| severity)
}

fn host_health_from_recent_commands(registry: &SessionRegistry, session_id: &str) -> &'static str {
    let mut consecutive_failures = 0;

    for entry in registry.command_history.iter().filter(|entry| entry.session_id == session_id) {
        if entry.exit_code == 0 {
            break;
        }
        consecutive_failures += 1;
        if consecutive_failures >= 3 {
            return "critical";
        }
    }

    if consecutive_failures > 0 {
        "warning"
    } else {
        "healthy"
    }
}

fn command_health_status(registry: &SessionRegistry, session_id: &str, stderr_tail: &[String]) -> &'static str {
    classify_command_stderr_severity(stderr_tail).unwrap_or_else(|| host_health_from_recent_commands(registry, session_id))
}

fn update_session_metadata(registry: &mut SessionRegistry, session_id: &str, shell: Option<&str>, cwd: Option<&str>) {
    if let Some(session) = registry.managed_sessions.iter_mut().find(|session| session.id == session_id) {
        if let Some(shell) = shell {
            session.shell = shell.into();
        }
        if let Some(cwd) = cwd {
            session.cwd = cwd.into();
        }
    }
}

fn parse_host_target(host: &Host, config: Option<&HostConnectionConfig>) -> (String, String) {
    let fallback_username = config
        .map(|value| value.username.clone())
        .unwrap_or_else(|| "root".into());

    let address = host.config.address.trim();
    if let Some((username, hostname)) = address.split_once('@') {
        return (username.to_string(), hostname.to_string());
    }

    (fallback_username, address.to_string())
}

fn known_hosts_path() -> Option<PathBuf> {
    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    Some(home.join(".ssh").join("known_hosts"))
}

fn recent_commands_for_session(session_id: &str, command_history: &[CommandHistoryEntry]) -> Vec<serde_json::Value> {
    command_history
        .iter()
        .rev()
        .filter(|entry| entry.session_id == session_id)
        .take(6)
        .map(|entry| serde_json::json!({
            "id": entry.id,
            "command": entry.command,
            "startedAt": entry.started_at,
            "completedAt": entry.completed_at,
            "exitCode": entry.exit_code,
            "stderrClass": entry.stderr_class,
            "stderrEvidence": entry.stderr_evidence,
            "stdoutTail": entry.stdout_tail,
            "stderrTail": entry.stderr_tail,
        }))
        .collect()
}

fn host_and_connection_values(host: &Host, config: &HostConnectionConfig) -> (serde_json::Value, serde_json::Value) {
    (
        serde_json::json!({
            "id": host.id,
            "config": host.config,
            "observed": host.observed,
        }),
        serde_json::json!({
            "port": config.port,
            "username": config.username,
            "authMethod": config.auth_method,
            "fingerprintHint": config.fingerprint_hint,
            "privateKeyPath": config.private_key_path,
            "hasSavedPassword": secrets::has_saved_host_password(&config.host_id),
        }),
    )
}

fn session_value(session: &ManagedSessionRecord) -> serde_json::Value {
    serde_json::json!({
        "id": session.id,
        "state": session.state,
        "shell": session.shell,
        "cwd": session.cwd,
        "connectedAt": session.connected_at,
        "lastCommandAt": session.last_command_at,
        "autoCaptureEnabled": session.auto_capture_enabled,
    })
}

fn ssh_keyscan(host: &str, port: u16) -> Result<String, String> {
    let output = Command::new("ssh-keyscan")
        .arg("-p")
        .arg(port.to_string())
        .arg(host)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn fingerprint_for_key_line(key_line: &str) -> Result<String, String> {
    let temp_path = env::temp_dir().join(format!("talon-known-host-{}.pub", now_iso().replace(':', "-").replace('.', "-")));
    fs::write(&temp_path, key_line).map_err(|error| error.to_string())?;
    let output = Command::new("ssh-keygen")
        .arg("-lf")
        .arg(&temp_path)
        .arg("-E")
        .arg("sha256")
        .output()
        .map_err(|error| error.to_string())?;
    let _ = fs::remove_file(&temp_path);
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let line = String::from_utf8_lossy(&output.stdout);
    let fingerprint = line.split_whitespace().nth(1).unwrap_or("").trim().to_string();
    if fingerprint.is_empty() {
        return Err("Could not parse ssh-keygen fingerprint output.".into());
    }
    Ok(fingerprint)
}

pub fn cached_context_packet_for(session_id: &str) -> Option<DiagnosisContextPacket> {
    lock_registry()
        .diagnosis_cache
        .get(session_id)
        .map(|entry| entry.packet.clone())
}

pub fn invalidate_diagnosis(session_id: &str) {
    lock_registry()
        .diagnosis_cache
        .remove(session_id);
}

pub fn prepare_host_trust(session_id: &str) -> Result<SessionConnectionIssue, String> {
    let (host, port, hint) = {
        let registry = lock_registry();
        let session = registry
            .managed_sessions
            .iter()
            .find(|session| session.id == session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;
        let host = registry
            .hosts
            .iter()
            .find(|host| host.id == session.host_id)
            .cloned()
            .ok_or_else(|| format!("Host {} not found", session.host_id))?;
        let config = registry
            .host_configs
            .iter()
            .find(|config| config.host_id == host.id)
            .cloned()
            .ok_or_else(|| format!("Host config {} not found", host.id))?;
        let (_, hostname) = parse_host_target(&host, Some(&config));
        (hostname, config.port, config.fingerprint_hint)
    };

    let key_line = ssh_keyscan(&host, port)?;
    let fingerprint = fingerprint_for_key_line(key_line.lines().next().unwrap_or(&key_line))?;

    let mut registry = lock_registry();
    let issue = SessionConnectionIssue {
        session_id: session_id.into(),
        kind: "host-trust".into(),
        title: "Host trust confirmation required".into(),
        summary: format!("Scanned host fingerprint {} for {}:{}.", fingerprint, host, port),
        operator_action: "Review the scanned fingerprint and confirm only if it matches an operator-approved value.".into(),
        suggested_command: format!("ssh-keyscan -p {} {}", port, host),
        observed_at: now_iso(),
        fingerprint: Some(fingerprint),
        expected_fingerprint_hint: Some(hint),
        host: Some(host),
        port: Some(port),
        can_trust_in_app: true,
        in_app_action_kind: Some("confirm-host-trust".into()),
        in_app_action_label: Some("Trust host".into()),
    };
    registry.connection_issues.insert(session_id.into(), issue.clone());
    Ok(issue)
}

pub fn confirm_host_trust(session_id: &str, fingerprint: &str) -> Result<Option<SessionConnectionIssue>, String> {
    let issue = prepare_host_trust(session_id)?;
    let actual = issue.fingerprint.clone().unwrap_or_default();
    if actual != fingerprint {
        return Err(format!("Fingerprint mismatch: expected scanned value {}, got {}", actual, fingerprint));
    }
    let key_line = ssh_keyscan(issue.host.as_deref().unwrap_or(""), issue.port.unwrap_or(22))?;
    let path = known_hosts_path().ok_or_else(|| "Could not resolve known_hosts path.".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let existing = fs::read_to_string(&path).unwrap_or_default();
    if !existing.contains(&key_line) {
        let mut next = existing;
        if !next.is_empty() && !next.ends_with('\n') {
            next.push('\n');
        }
        next.push_str(&key_line);
        next.push('\n');
        fs::write(&path, next).map_err(|error| error.to_string())?;
    }

    let mut registry = lock_registry();
    if let Some(config) = registry.host_configs.iter_mut().find(|config| config.host_id == issue.session_id.trim_start_matches("session-")) {
        config.fingerprint_hint = actual;
    }
    clear_connection_issue(&mut registry, session_id);
    Ok(None)
}

fn resolve_private_key_path(host_id: &str) -> Option<PathBuf> {
    let env_key = format!(
        "TALON_SSH_KEY_PATH_{}",
        host_id.replace('-', "_").to_ascii_uppercase()
    );

    if let Ok(path) = env::var(&env_key) {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }

    let home = env::var("USERPROFILE").ok().map(PathBuf::from)?;
    for candidate in ["id_ed25519", "id_rsa"] {
        let path = home.join(".ssh").join(candidate);
        if path.exists() {
            return Some(path);
        }
    }

    None
}

fn start_stdout_reader(session_id: String, stdout: ChildStdout) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let line = line.trim_end_matches(['\r', '\n']).to_string();
                    if line.is_empty() {
                        let mut state = lock_registry();
                        push_terminal_line(&mut state, &session_id, String::new());
                        continue;
                    }

                    let mut state = lock_registry();
                    if let Some(shell) = line.strip_prefix(META_SHELL_PREFIX) {
                        update_session_metadata(&mut state, &session_id, Some(shell.trim()), None);
                        continue;
                    }

                    if let Some(cwd) = line.strip_prefix(META_CWD_PREFIX) {
                        let cwd = cwd.trim();
                        let latency_ms = capture_connect_latency_ms(&state, &session_id);
                        update_session_metadata(&mut state, &session_id, None, Some(cwd));
                        update_session_state(&mut state, &session_id, "connected");
                        let host_id = state
                            .managed_sessions
                            .iter()
                            .find(|session| session.id == session_id)
                            .map(|session| session.host_id.clone());
                        if let Some(host_id) = host_id {
                            update_host_observed(&mut state, &host_id, Some("healthy"), Some(&now_iso()), latency_ms);
                        }
                        clear_connection_issue(&mut state, &session_id);
                        push_event(
                            &mut state,
                            &session_id,
                            "shell-ready",
                            format!("Remote shell is ready in {}", cwd),
                        );
                        push_terminal_line(
                            &mut state,
                            &session_id,
                            format!("Connected. Remote shell ready in {}", cwd),
                        );
                        continue;
                    }

                    if let Some(command_id) = line.strip_prefix(CMD_START_PREFIX) {
                        push_event(
                            &mut state,
                            &session_id,
                            "command-start",
                            format!("Remote shell started {}", command_id.trim()),
                        );
                        continue;
                    }

                    if let Some((command_id, exit_code, cwd)) = parse_command_end(&line) {
                        complete_active_command(&mut state, &session_id, &command_id, exit_code, cwd.trim());
                        continue;
                    }

                    push_terminal_line(&mut state, &session_id, line.clone());
                    capture_stream_line(&mut state, &session_id, "stdout", &line);
                    capture_command_stream_line(&mut state, &session_id, "stdout", &line);
                    push_event(&mut state, &session_id, "stdout", line);
                }
                Err(error) => {
                    let mut state = lock_registry();
                    update_session_state(&mut state, &session_id, "degraded");
                    push_event(
                        &mut state,
                        &session_id,
                        "stream-error",
                        format!("stdout reader failed: {}", error),
                    );
                    break;
                }
            }
        }
    });
}

fn start_stderr_reader(session_id: String, host: Host, stderr: ChildStderr) {
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut line = String::new();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let line = line.trim_end_matches(['\r', '\n']).to_string();
                    let mut state = lock_registry();
                    push_terminal_line(&mut state, &session_id, format!("stderr: {}", line));
                    capture_stream_line(&mut state, &session_id, "stderr", &line);
                    capture_command_stream_line(&mut state, &session_id, "stderr", &line);
                    if let Some((kind, title, summary, operator_action, suggested_command)) =
                        classify_connection_issue(&host, &line)
                    {
                        let observed_status = if kind == "auth" || kind == "host-trust" {
                            "warning"
                        } else {
                            "critical"
                        };
                        update_host_observed_for_session(&mut state, &session_id, Some(observed_status), true);
                        set_connection_issue(
                            &mut state,
                            &session_id,
                            &kind,
                            &title,
                            summary,
                            &operator_action,
                            suggested_command,
                        );
                    }
                    push_event(&mut state, &session_id, "stderr", line);
                }
                Err(error) => {
                    let mut state = lock_registry();
                    push_event(
                        &mut state,
                        &session_id,
                        "stream-error",
                        format!("stderr reader failed: {}", error),
                    );
                    break;
                }
            }
        }
    });
}

fn launch_runtime(
    session_id: String,
    host: Host,
    config: HostConnectionConfig,
    password: Option<&str>,
) -> Result<SessionRuntimeHandle, String> {
    let (username, hostname) = parse_host_target(&host, Some(&config));
    let mut command = Command::new("ssh");

    command
        .arg("-T")
        .arg("-o")
        .arg("StrictHostKeyChecking=yes")
        .arg("-o")
        .arg(format!("ConnectTimeout={}", CONNECT_TIMEOUT_SECONDS))
        .arg("-p")
        .arg(config.port.to_string())
        .arg(format!("{}@{}", username, hostname))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut askpass_path = None;

    if config.auth_method == "private-key" {
        command.arg("-o").arg("BatchMode=yes");
        let key_path = resolve_private_key_path(&host.id)
            .ok_or_else(|| format!("No SSH private key found for host {}", host.id))?;
        command.arg("-i").arg(key_path);
    }

    if config.auth_method == "password" {
        let password = password
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "Password authentication requires an operator-provided password.".to_string())?;
        let helper_path = create_askpass_helper(&session_id)?;
        command
            .arg("-o")
            .arg("BatchMode=no")
            .arg("-o")
            .arg("PubkeyAuthentication=no")
            .arg("-o")
            .arg("PreferredAuthentications=password")
            .arg("-o")
            .arg("NumberOfPasswordPrompts=1")
            .env("SSH_ASKPASS", &helper_path)
            .env("SSH_ASKPASS_REQUIRE", "force")
            .env("DISPLAY", "talon")
            .env("TALON_SSH_PASSWORD", password);
        askpass_path = Some(helper_path);
    } else {
        command.arg("-o").arg("BatchMode=yes");
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let pid = child.id();
    let stdin = child.stdin.take().ok_or_else(|| "failed to open ssh stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "failed to open ssh stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "failed to open ssh stderr".to_string())?;
    let stdin = Arc::new(Mutex::new(stdin));

    start_stdout_reader(session_id.clone(), stdout);
    start_stderr_reader(session_id.clone(), host.clone(), stderr);

    {
        let mut guard = lock_stdin(&stdin);
        guard
            .write_all(b"printf '__TALON_META_SHELL__%s\\n' \"${SHELL:-sh}\"\npwd | sed 's#^#__TALON_META_CWD__#'\n")
            .map_err(|error| error.to_string())?;
        guard.flush().map_err(|error| error.to_string())?;
    }

    thread::spawn(move || match child.wait() {
        Ok(status) => {
            let mut state = lock_registry();
            let askpass_path = state
                .runtimes
                .get(&session_id)
                .and_then(|runtime| runtime.askpass_path.clone());
            update_session_state(&mut state, &session_id, "disconnected");
            update_host_observed_for_session(&mut state, &session_id, Some("warning"), true);
            state.runtimes.remove(&session_id);
            drop(state);
            if let Some(path) = askpass_path {
                let _ = fs::remove_file(path);
            }
            let mut state = lock_registry();
            push_event(
                &mut state,
                &session_id,
                "disconnected",
                format!("ssh process exited with status {}", status),
            );
            push_terminal_line(
                &mut state,
                &session_id,
                format!("SSH session closed with status {}", status),
            );
        }
        Err(error) => {
            let mut state = lock_registry();
            let askpass_path = state
                .runtimes
                .get(&session_id)
                .and_then(|runtime| runtime.askpass_path.clone());
            update_session_state(&mut state, &session_id, "degraded");
            state.runtimes.remove(&session_id);
            drop(state);
            if let Some(path) = askpass_path {
                let _ = fs::remove_file(path);
            }
            let mut state = lock_registry();
            push_event(
                &mut state,
                &session_id,
                "disconnected",
                format!("ssh process wait failed: {}", error),
            );
        }
    });

    Ok(SessionRuntimeHandle {
        stdin,
        pid,
        askpass_path,
        started_at: Instant::now(),
    })
}

pub fn connect_host(host: &Host, config: Option<&HostConnectionConfig>, password: Option<&str>) -> ManagedSessionRecord {
    let host_config = config.cloned().unwrap_or(HostConnectionConfig {
        host_id: host.id.clone(),
        port: 22,
        username: "root".into(),
        auth_method: "agent".into(),
        fingerprint_hint: "unknown".into(),
        private_key_path: None,
        has_saved_password: false,
    });

    let session_id = format!("session-{}", host.id);
    let now = now_iso();
    let record = ManagedSessionRecord {
        id: session_id.clone(),
        host_id: host.id.clone(),
        state: "degraded".into(),
        shell: "sh".into(),
        cwd: "~".into(),
        connected_at: now.clone(),
        last_command_at: now,
        auto_capture_enabled: true,
    };

    {
        let mut registry = lock_registry();
        registry.managed_sessions.retain(|session| session.host_id != host.id);
        registry.runtimes.remove(&session_id);
        registry.managed_sessions.insert(0, record.clone());
        registry.active_session_id = record.id.clone();
        registry.terminal_buffers.insert(
            record.id.clone(),
            vec![
                format!("Opening SSH transport to {}", host.config.address),
                format!(
                    "Auth: {} on port {} with strict host key checking",
                    host_config.auth_method, host_config.port
                ),
            ],
        );
        push_event(
            &mut registry,
            &record.id,
            "connecting",
            format!("Launching ssh.exe for {}", host.config.address),
        );
    }

    match launch_runtime(record.id.clone(), host.clone(), host_config, password) {
        Ok(runtime) => {
            let mut registry = lock_registry();
            registry.runtimes.insert(record.id.clone(), runtime);
            push_event(
                &mut registry,
                &record.id,
                "transport-ready",
                "ssh.exe process started. Waiting for remote shell metadata.".into(),
            );
        }
        Err(error) => {
            let mut registry = lock_registry();
            update_session_state(&mut registry, &record.id, "disconnected");
            let (kind, title, summary, operator_action, suggested_command) =
                classify_local_connection_error(host, &error);
            let observed_status = if kind == "auth" || kind == "host-trust" {
                "warning"
            } else {
                "critical"
            };
            update_host_observed(&mut registry, &host.id, Some(observed_status), Some(&now_iso()), None);
            set_connection_issue(
                &mut registry,
                &record.id,
                &kind,
                &title,
                summary,
                &operator_action,
                suggested_command,
            );
            push_terminal_line(&mut registry, &record.id, format!("Connection failed: {}", error));
            push_event(&mut registry, &record.id, "connection-error", error);
        }
    }

    lock_registry()
        .managed_sessions
        .iter()
        .find(|session| session.id == record.id)
        .cloned()
        .unwrap_or(record)
}

pub fn submit_command(session_id: &str, command: &str) -> TerminalSnapshot {
    let trimmed = command.trim();

    {
        let mut registry = lock_registry();
        if registry.active_commands.contains_key(session_id) {
            push_terminal_line(
                &mut registry,
                session_id,
                "Command rejected: another command is still running in this session.".into(),
            );
            push_event(
                &mut registry,
                session_id,
                "command-rejected",
                "Command rejected because another wrapped command is still in flight.".into(),
            );
            return terminal_snapshot(session_id);
        }
    }

    let stdin = {
        let mut registry = lock_registry();
        let command_id = next_command_id(&mut registry, session_id);
        let started_at = now_iso();
        registry.active_commands.insert(
            session_id.into(),
            ActiveCommandState {
                id: command_id.clone(),
                command: trimmed.into(),
                started_at,
                stdout_tail: Vec::new(),
                stderr_tail: Vec::new(),
            },
        );
        push_event(
            &mut registry,
            session_id,
            "command-submitted",
            format!("Queued command {}: {}", command_id, trimmed),
        );
        push_terminal_line(&mut registry, session_id, format!("$ {}", trimmed));

        if let Some(session) = registry.managed_sessions.iter_mut().find(|session| session.id == session_id) {
            session.last_command_at = now_iso();
        }

        registry
            .runtimes
            .get(session_id)
            .map(|runtime| (runtime.stdin.clone(), command_id))
    };

    if let Some((stdin, command_id)) = stdin {
        let mut guard = lock_stdin(&stdin);
        let wrapped_command = format!(
            "printf '{start}{id}\\n'\n{command}\ntalon_exit=$?\ntalon_cwd=$(pwd)\nprintf '{end}{id}__%s__%s\\n' \"$talon_exit\" \"$talon_cwd\"\n",
            start = CMD_START_PREFIX,
            end = CMD_END_PREFIX,
            id = command_id,
            command = trimmed
        );
        let write_result = guard.write_all(wrapped_command.as_bytes()).and_then(|_| guard.flush());

        if let Err(error) = write_result {
            let mut registry = lock_registry();
            registry.active_commands.remove(session_id);
            push_terminal_line(
                &mut registry,
                session_id,
                format!("Command dispatch failed: {}", error),
            );
            push_event(
                &mut registry,
                session_id,
                "command-error",
                format!("Failed to write to remote shell: {}", error),
            );
        }
    } else {
        let mut registry = lock_registry();
        push_terminal_line(
            &mut registry,
            session_id,
            "Command rejected: no active SSH transport for this session.".into(),
        );
        push_event(
            &mut registry,
            session_id,
            "command-error",
            "No active SSH transport for this session.".into(),
        );
    }

    terminal_snapshot(session_id)
}

pub fn disconnect_session(session_id: &str) -> TerminalSnapshot {
    let pid = {
        let mut registry = lock_registry();
        registry.active_commands.remove(session_id);
        let pid = registry.runtimes.get(session_id).map(|runtime| runtime.pid);
        update_host_observed_for_session(&mut registry, session_id, Some("warning"), true);
        push_event(
            &mut registry,
            session_id,
            "disconnecting",
            "Operator requested session disconnect.".into(),
        );
        push_terminal_line(&mut registry, session_id, "Disconnecting SSH transport...".into());
        pid
    };

    match pid {
        Some(pid) => {
            let result = Command::new("taskkill")
                .arg("/PID")
                .arg(pid.to_string())
                .arg("/T")
                .arg("/F")
                .output();

            if let Err(error) = result {
                let mut registry = lock_registry();
                push_terminal_line(
                    &mut registry,
                    session_id,
                    format!("Disconnect failed: {}", error),
                );
                push_event(
                    &mut registry,
                    session_id,
                    "disconnect-error",
                    format!("Failed to stop ssh pid {}: {}", pid, error),
                );
            }
        }
        None => {
            let mut registry = lock_registry();
            update_session_state(&mut registry, session_id, "disconnected");
            update_host_observed_for_session(&mut registry, session_id, Some("warning"), true);
            push_event(
                &mut registry,
                session_id,
                "disconnect-error",
                "No active SSH transport for this session.".into(),
            );
        }
    }

    terminal_snapshot(session_id)
}

pub fn workspace_state() -> TalonWorkspaceState {
    let (mut state, generation_input, active_session_id) = {
        let registry = lock_registry();
        let mut state = session_store::get_workspace_state();
        state.hosts = registry.hosts.clone();
        state.sessions = registry
            .managed_sessions
            .iter()
            .map(|session| Session {
                id: session.id.clone(),
                host_id: session.host_id.clone(),
                state: session.state.clone(),
                shell: session.shell.clone(),
                cwd: session.cwd.clone(),
                connected_at: session.connected_at.clone(),
                last_command_at: session.last_command_at.clone(),
                auto_capture_enabled: session.auto_capture_enabled,
            })
            .collect();
        state.active_session_id = registry.active_session_id.clone();

        let mut generation_input: Option<(String, DiagnosisGenerationInput)> = None;
        if let Some(active) = registry.managed_sessions.iter().find(|session| session.id == state.active_session_id) {
            state.terminal = TerminalSnapshot {
                session_id: active.id.clone(),
                lines: registry
                    .terminal_buffers
                    .get(&active.id)
                    .cloned()
                    .unwrap_or_else(default_terminal_buffer),
            };

            let host = registry
                .hosts
                .iter()
                .find(|host| host.id == active.host_id)
                .cloned();
            let config = registry
                .host_configs
                .iter()
                .find(|config| config.host_id == active.host_id)
                .cloned();
            let timeline = context_builder::timeline_for_session(
                &registry.command_history,
                &active.id,
                registry.latest_failures.get(&active.id),
                registry.connection_issues.get(&active.id),
            );
            state.timeline = timeline.clone();

            if let (Some(host), Some(config)) = (host, config) {
                let (host_value, connection_value) = host_and_connection_values(&host, &config);
                let session_value = session_value(active);
                let recent_commands = recent_commands_for_session(&active.id, &registry.command_history);

                if let Some(failure) = registry.latest_failures.get(&active.id) {
                    state.latest_failure = failure.clone();
                    let fallback = diagnosis_engine::fallback_for_failure(failure);
                    let packet = diagnosis_engine::build_packet_from_failure(
                        failure,
                        host_value,
                        connection_value,
                        session_value,
                        recent_commands,
                        timeline.iter().cloned().map(|item| serde_json::json!(item)).collect(),
                    );
                    let trigger_key = packet.id.clone();
                    if let Some(cached) = registry.diagnosis_cache.get(&active.id) {
                        if cached.trigger_key == trigger_key {
                            state.latest_diagnosis = cached.response.clone();
                        } else {
                            generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                        }
                    } else {
                        generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                    }
                } else if let Some(issue) = registry.connection_issues.get(&active.id) {
                    let fallback = diagnosis_engine::fallback_for_connection_issue(issue);
                    let packet = diagnosis_engine::build_packet_from_connection_issue(
                        issue,
                        host_value,
                        connection_value,
                        session_value,
                        recent_commands,
                        timeline.iter().cloned().map(|item| serde_json::json!(item)).collect(),
                    );
                    let trigger_key = packet.id.clone();
                    if let Some(cached) = registry.diagnosis_cache.get(&active.id) {
                        if cached.trigger_key == trigger_key {
                            state.latest_diagnosis = cached.response.clone();
                        } else {
                            generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                        }
                    } else {
                        generation_input = Some((active.id.clone(), DiagnosisGenerationInput { packet, fallback }));
                    }
                }
            }
        }

        (state, generation_input, registry.active_session_id.clone())
    };

    if let Some((session_id, input)) = generation_input {
        let response = diagnosis_engine::generate(input.clone());
        let mut registry = lock_registry();
        registry.diagnosis_cache.insert(
            session_id.clone(),
            DiagnosisCacheEntry {
                trigger_key: input.packet.id.clone(),
                response: response.clone(),
                packet: input.packet,
            },
        );
        if session_id == active_session_id {
            state.latest_diagnosis = response;
        }
    }

    state
}

#[cfg(test)]
mod tests {
    use super::{classify_command_stderr_severity, command_health_status, CommandHistoryEntry, SessionRegistry};
    use std::collections::HashMap;

    fn registry_with_history(entries: Vec<CommandHistoryEntry>) -> SessionRegistry {
        SessionRegistry {
            hosts: Vec::new(),
            host_configs: Vec::new(),
            managed_sessions: Vec::new(),
            active_session_id: String::new(),
            recent_events: Vec::new(),
            terminal_buffers: HashMap::new(),
            stream_state: HashMap::new(),
            connection_issues: HashMap::new(),
            latest_failures: HashMap::new(),
            active_commands: HashMap::new(),
            command_history: entries,
            runtimes: HashMap::new(),
            diagnosis_cache: HashMap::new(),
            event_counter: 0,
            command_counter: 0,
        }
    }

    fn history_entry(session_id: &str, exit_code: i32) -> CommandHistoryEntry {
        CommandHistoryEntry {
            id: format!("cmd-{}-{}", session_id, exit_code),
            session_id: session_id.into(),
            command: "test".into(),
            started_at: "2026-03-07T00:00:00Z".into(),
            completed_at: "2026-03-07T00:00:01Z".into(),
            exit_code,
            stderr_class: None,
            stderr_evidence: None,
            stdout_tail: Vec::new(),
            stderr_tail: Vec::new(),
        }
    }

    #[test]
    fn classifies_high_signal_stderr_patterns() {
        assert_eq!(
            classify_command_stderr_severity(&["cp: permission denied".into()]),
            Some("warning")
        );
        assert_eq!(
            classify_command_stderr_severity(&["write failed: No space left on device".into()]),
            Some("critical")
        );
        assert_eq!(
            classify_command_stderr_severity(&["dial tcp: connection refused".into()]),
            Some("critical")
        );
    }

    #[test]
    fn uses_stderr_severity_before_consecutive_failure_rule() {
        let registry = registry_with_history(vec![history_entry("session-1", 1)]);
        assert_eq!(
            command_health_status(&registry, "session-1", &["operation not permitted".into()]),
            "warning"
        );
        assert_eq!(
            command_health_status(&registry, "session-1", &["out of memory".into()]),
            "critical"
        );
    }

    #[test]
    fn falls_back_to_consecutive_failure_rule_when_stderr_has_no_match() {
        let warning_registry = registry_with_history(vec![history_entry("session-1", 1), history_entry("session-1", 1)]);
        assert_eq!(command_health_status(&warning_registry, "session-1", &[]), "warning");

        let critical_registry = registry_with_history(vec![
            history_entry("session-1", 1),
            history_entry("session-1", 2),
            history_entry("session-1", 127),
        ]);
        assert_eq!(command_health_status(&critical_registry, "session-1", &["plain failure".into()]), "critical");

        let healthy_registry = registry_with_history(vec![history_entry("session-1", 0), history_entry("session-1", 1)]);
        assert_eq!(command_health_status(&healthy_registry, "session-1", &[]), "healthy");
    }
}


