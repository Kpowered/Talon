use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandRequest {
    scenario: String,
    command: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoActionResponse {
    appended_lines: Vec<String>,
    status: String,
    summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoStateResponse {
    scenario: String,
    summary: String,
    status: String,
    suggestion: String,
    safe_command: String,
}

#[tauri::command]
fn get_demo_state(scenario: &str) -> DemoStateResponse {
    match scenario {
        "api-latency" => DemoStateResponse {
            scenario: scenario.to_string(),
            summary: "Cache miss storm is the most likely driver of the latency spike.".into(),
            status: "warning".into(),
            suggestion: "Warm hot keys and inspect Redis hit ratio before scaling blindly.".into(),
            safe_command: "redis-cli info stats | grep keyspace".into(),
        },
        "db-replication" => DemoStateResponse {
            scenario: scenario.to_string(),
            summary: "Replica replay appears stalled under disk pressure.".into(),
            status: "critical".into(),
            suggestion: "Free disk and inspect WAL replay before any failover decision.".into(),
            safe_command:
                "sudo -u postgres psql -c \"select now() - pg_last_xact_replay_timestamp();\"".into(),
        },
        _ => DemoStateResponse {
            scenario: "nginx-port".into(),
            summary: "Port 80 collision is blocking nginx from rebinding.".into(),
            status: "critical".into(),
            suggestion: "Find who owns :80, validate nginx config, then retry safely.".into(),
            safe_command: "sudo lsof -i :80".into(),
        },
    }
}

#[tauri::command]
fn run_demo_command(payload: CommandRequest) -> DemoActionResponse {
    let command = payload.command.trim();

    let (status, summary, lines) = match payload.scenario.as_str() {
        "api-latency" => (
            "warning",
            "Redis stats confirm cache miss pressure; warming keys is the safe next move.",
            vec![
                format!("$ {}", command),
                "keyspace_hits:981220".into(),
                "keyspace_misses:214992".into(),
                "observation: miss ratio remains elevated after deploy".into(),
            ],
        ),
        "db-replication" => (
            "critical",
            "Replay lag remains elevated; disk pressure should be treated first.",
            vec![
                format!("$ {}", command),
                "?column?".into(),
                "--------------------".into(),
                "00:07:12.442118".into(),
                "observation: replay delay remains above safe threshold".into(),
            ],
        ),
        _ => (
            "critical",
            "docker-proxy is still holding port 80, so nginx cannot restart yet.",
            vec![
                format!("$ {}", command),
                "COMMAND      PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME".into(),
                "docker-proxy 17302 root    7u  IPv4  42119      0t0  TCP *:http (LISTEN)".into(),
                "observation: legacy-certbot container still owns :80".into(),
            ],
        ),
    };

    DemoActionResponse {
        appended_lines: lines,
        status: status.into(),
        summary: summary.into(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_demo_state, run_demo_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
