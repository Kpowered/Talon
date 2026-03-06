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
