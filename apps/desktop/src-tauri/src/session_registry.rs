use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use serde::Serialize;

use crate::context_builder;
use crate::session_store::{self, FailureContext, Host, Session, TalonWorkspaceState, TerminalSnapshot};

const META_SHELL_PREFIX: &str = "__TALON_META_SHELL__";
const META_CWD_PREFIX: &str = "__TALON_META_CWD__";
const CMD_START_PREFIX: &str = "__TALON_CMD_START__";
const CMD_END_PREFIX: &str = "__TALON_CMD_END__";
const CONNECT_TIMEOUT_SECONDS: u64 = 8;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostConnectionConfig {
    pub host_id: String,
    pub port: u16,
    pub username: String,
    pub auth_method: String,
    pub fingerprint_hint: String,
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
}

#[derive(Clone)]
pub struct CommandHistoryEntry {
    pub id: String,
    pub session_id: String,
    pub command: String,
    pub started_at: String,
    pub completed_at: String,
    pub exit_code: i32,
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

struct SessionRuntimeHandle {
    stdin: Arc<Mutex<ChildStdin>>,
    pid: u32,
    askpass_path: Option<PathBuf>,
}

pub struct SessionRegistry {
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
    event_counter: usize,
    command_counter: usize,
}

static REGISTRY: OnceLock<Mutex<SessionRegistry>> = OnceLock::new();

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
        },
        HostConnectionConfig {
            host_id: "host-api-gateway".into(),
            port: 22,
            username: "root".into(),
            auth_method: "agent".into(),
            fingerprint_hint: "SHA256:api-gateway".into(),
        },
        HostConnectionConfig {
            host_id: "host-db-primary".into(),
            port: 22,
            username: "postgres".into(),
            auth_method: "private-key".into(),
            fingerprint_hint: "SHA256:db-primary".into(),
        },
    ]
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
            host_configs: default_host_configs(),
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
            event_counter: 0,
            command_counter: 0,
        })
    })
}

pub fn list_host_configs() -> Vec<HostConnectionConfig> {
    registry().lock().expect("session registry lock poisoned").host_configs.clone()
}

pub fn busy_session_ids() -> Vec<String> {
    registry()
        .lock()
        .expect("session registry lock poisoned")
        .active_commands
        .keys()
        .cloned()
        .collect()
}

pub fn connection_issue_for(session_id: &str) -> Option<SessionConnectionIssue> {
    registry()
        .lock()
        .expect("session registry lock poisoned")
        .connection_issues
        .get(session_id)
        .cloned()
}

pub fn host_config_for(host_id: &str) -> Option<HostConnectionConfig> {
    registry()
        .lock()
        .expect("session registry lock poisoned")
        .host_configs
        .iter()
        .find(|config| config.host_id == host_id)
        .cloned()
}

pub fn recent_events() -> Vec<SessionLifecycleEvent> {
    registry().lock().expect("session registry lock poisoned").recent_events.clone()
}

pub fn terminal_snapshot(session_id: &str) -> TerminalSnapshot {
    let registry = registry().lock().expect("session registry lock poisoned");
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
        },
    );
}

fn clear_connection_issue(registry: &mut SessionRegistry, session_id: &str) {
    registry.connection_issues.remove(session_id);
}

fn classify_connection_issue(host: &Host, line: &str) -> Option<(String, String, String, String, String)> {
    let normalized = line.to_ascii_lowercase();
    let escaped_host = host.address.replace('\'', "''");

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
            format!("ssh-keygen -R \"{}\"", host.address)
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
            format!("ssh -vvv {}", host.address),
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
            format!("ssh -vvv {}", host.address),
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
        format!("ssh -vvv {}", host.address),
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
    registry.command_history.insert(
        0,
        CommandHistoryEntry {
            id: command.id.clone(),
            session_id: session_id.into(),
            command: command.command.clone(),
            started_at: command.started_at.clone(),
            completed_at: completed_at.clone(),
            exit_code,
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

    if exit_code != 0 {
        let session = registry.managed_sessions.iter().find(|session| session.id == session_id);
        let command_entry = registry
            .command_history
            .first()
            .cloned()
            .expect("latest command entry must exist");
        registry.latest_failures.insert(
            session_id.into(),
            context_builder::build_failure_context(session_id, session, &command_entry),
        );
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

    let address = host.address.trim();
    if let Some((username, hostname)) = address.split_once('@') {
        return (username.to_string(), hostname.to_string());
    }

    (fallback_username, address.to_string())
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
                        let mut state = registry().lock().expect("session registry lock poisoned");
                        push_terminal_line(&mut state, &session_id, String::new());
                        continue;
                    }

                    let mut state = registry().lock().expect("session registry lock poisoned");
                    if let Some(shell) = line.strip_prefix(META_SHELL_PREFIX) {
                        update_session_metadata(&mut state, &session_id, Some(shell.trim()), None);
                        continue;
                    }

                    if let Some(cwd) = line.strip_prefix(META_CWD_PREFIX) {
                        let cwd = cwd.trim();
                        update_session_metadata(&mut state, &session_id, None, Some(cwd));
                        update_session_state(&mut state, &session_id, "connected");
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
                    let mut state = registry().lock().expect("session registry lock poisoned");
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
                    let mut state = registry().lock().expect("session registry lock poisoned");
                    push_terminal_line(&mut state, &session_id, format!("stderr: {}", line));
                    capture_stream_line(&mut state, &session_id, "stderr", &line);
                    capture_command_stream_line(&mut state, &session_id, "stderr", &line);
                    if let Some((kind, title, summary, operator_action, suggested_command)) =
                        classify_connection_issue(&host, &line)
                    {
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
                    let mut state = registry().lock().expect("session registry lock poisoned");
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
        let mut guard = stdin.lock().expect("ssh stdin lock poisoned");
        guard
            .write_all(b"printf '__TALON_META_SHELL__%s\\n' \"${SHELL:-sh}\"\npwd | sed 's#^#__TALON_META_CWD__#'\n")
            .map_err(|error| error.to_string())?;
        guard.flush().map_err(|error| error.to_string())?;
    }

    thread::spawn(move || match child.wait() {
        Ok(status) => {
            let mut state = registry().lock().expect("session registry lock poisoned");
            let askpass_path = state
                .runtimes
                .get(&session_id)
                .and_then(|runtime| runtime.askpass_path.clone());
            update_session_state(&mut state, &session_id, "disconnected");
            state.runtimes.remove(&session_id);
            drop(state);
            if let Some(path) = askpass_path {
                let _ = fs::remove_file(path);
            }
            let mut state = registry().lock().expect("session registry lock poisoned");
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
            let mut state = registry().lock().expect("session registry lock poisoned");
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
            let mut state = registry().lock().expect("session registry lock poisoned");
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
    })
}

pub fn connect_host(host: &Host, config: Option<&HostConnectionConfig>, password: Option<&str>) -> ManagedSessionRecord {
    let host_config = config.cloned().unwrap_or(HostConnectionConfig {
        host_id: host.id.clone(),
        port: 22,
        username: "root".into(),
        auth_method: "agent".into(),
        fingerprint_hint: "unknown".into(),
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
        let mut registry = registry().lock().expect("session registry lock poisoned");
        registry.managed_sessions.retain(|session| session.host_id != host.id);
        registry.runtimes.remove(&session_id);
        registry.managed_sessions.insert(0, record.clone());
        registry.active_session_id = record.id.clone();
        registry.terminal_buffers.insert(
            record.id.clone(),
            vec![
                format!("Opening SSH transport to {}", host.address),
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
            format!("Launching ssh.exe for {}", host.address),
        );
    }

    match launch_runtime(record.id.clone(), host.clone(), host_config, password) {
        Ok(runtime) => {
            let mut registry = registry().lock().expect("session registry lock poisoned");
            registry.runtimes.insert(record.id.clone(), runtime);
            push_event(
                &mut registry,
                &record.id,
                "transport-ready",
                "ssh.exe process started. Waiting for remote shell metadata.".into(),
            );
        }
        Err(error) => {
            let mut registry = registry().lock().expect("session registry lock poisoned");
            update_session_state(&mut registry, &record.id, "disconnected");
            let (kind, title, summary, operator_action, suggested_command) =
                classify_local_connection_error(host, &error);
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

    registry()
        .lock()
        .expect("session registry lock poisoned")
        .managed_sessions
        .iter()
        .find(|session| session.id == record.id)
        .cloned()
        .expect("connected session must exist")
}

pub fn submit_command(session_id: &str, command: &str) -> TerminalSnapshot {
    let trimmed = command.trim();

    {
        let mut registry = registry().lock().expect("session registry lock poisoned");
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
        let mut registry = registry().lock().expect("session registry lock poisoned");
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
        let mut guard = stdin.lock().expect("ssh stdin lock poisoned");
        let wrapped_command = format!(
            "printf '{start}{id}\\n'\n{command}\ntalon_exit=$?\ntalon_cwd=$(pwd)\nprintf '{end}{id}__%s__%s\\n' \"$talon_exit\" \"$talon_cwd\"\n",
            start = CMD_START_PREFIX,
            end = CMD_END_PREFIX,
            id = command_id,
            command = trimmed
        );
        let write_result = guard.write_all(wrapped_command.as_bytes()).and_then(|_| guard.flush());

        if let Err(error) = write_result {
            let mut registry = registry().lock().expect("session registry lock poisoned");
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
        let mut registry = registry().lock().expect("session registry lock poisoned");
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
        let mut registry = registry().lock().expect("session registry lock poisoned");
        registry.active_commands.remove(session_id);
        let pid = registry.runtimes.get(session_id).map(|runtime| runtime.pid);
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
                let mut registry = registry().lock().expect("session registry lock poisoned");
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
            let mut registry = registry().lock().expect("session registry lock poisoned");
            update_session_state(&mut registry, session_id, "disconnected");
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
    let registry = registry().lock().expect("session registry lock poisoned");
    let mut state = session_store::get_workspace_state();
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

    if let Some(active) = state.sessions.iter().find(|session| session.id == state.active_session_id) {
        state.terminal = TerminalSnapshot {
            session_id: active.id.clone(),
            lines: registry
                .terminal_buffers
                .get(&active.id)
                .cloned()
                .unwrap_or_else(default_terminal_buffer),
        };
        state.latest_failure.session_id = active.id.clone();
        state.latest_diagnosis.session_id = active.id.clone();

        if let Some(failure) = registry.latest_failures.get(&active.id) {
            state.latest_failure = failure.clone();
            state.latest_diagnosis = context_builder::build_diagnosis_from_failure(failure);
            state.timeline = context_builder::timeline_for_session(&registry.command_history, &active.id, Some(failure));
        } else {
            state.timeline = context_builder::timeline_for_session(&registry.command_history, &active.id, None);
        }
    }

    state
}
