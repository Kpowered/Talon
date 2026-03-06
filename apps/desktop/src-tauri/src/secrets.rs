use std::fs;
use std::path::PathBuf;

use keyring::Entry;
use serde::{Deserialize, Serialize};

const APP_NAME: &str = "Talon";
const AGENT_SETTINGS_FILE_NAME: &str = "agent-settings.json";
const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL: &str = "gpt-4.1-mini";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    pub provider_type: String,
    pub base_url: String,
    pub model: String,
    pub auto_diagnose: bool,
    pub request_timeout_sec: u64,
    pub has_api_key: bool,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            provider_type: "openai-compatible".into(),
            base_url: DEFAULT_BASE_URL.into(),
            model: DEFAULT_MODEL.into(),
            auto_diagnose: true,
            request_timeout_sec: 20,
            has_api_key: false,
        }
    }
}

fn app_dir() -> Option<PathBuf> {
    let base = dirs::data_local_dir().or_else(dirs::data_dir)?;
    Some(base.join(APP_NAME))
}

fn agent_settings_path() -> Option<PathBuf> {
    Some(app_dir()?.join(AGENT_SETTINGS_FILE_NAME))
}

pub fn load_agent_settings() -> AgentSettings {
    let Some(path) = agent_settings_path() else {
        return AgentSettings::default();
    };

    let mut settings = match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str::<AgentSettings>(&contents).unwrap_or_default(),
        Err(_) => AgentSettings::default(),
    };
    settings.has_api_key = load_agent_api_key().map(|value| !value.is_empty()).unwrap_or(false);
    settings
}

pub fn save_agent_settings(mut settings: AgentSettings) -> Result<AgentSettings, String> {
    settings.has_api_key = load_agent_api_key().map(|value| !value.is_empty()).unwrap_or(false);
    let Some(path) = agent_settings_path() else {
        return Err("Could not resolve local data directory for Talon agent settings.".into());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let payload = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, payload).map_err(|error| error.to_string())?;
    Ok(settings)
}

fn secret_entry(service: &str, account: &str) -> Result<Entry, String> {
    Entry::new(service, account).map_err(|error| error.to_string())
}

pub fn save_agent_api_key(value: &str) -> Result<(), String> {
    secret_entry("talon-agent", "default-api-key")?
        .set_password(value)
        .map_err(|error| error.to_string())
}

pub fn load_agent_api_key() -> Result<String, String> {
    secret_entry("talon-agent", "default-api-key")?
        .get_password()
        .map_err(|error| error.to_string())
}

pub fn clear_agent_api_key() -> Result<(), String> {
    let entry = secret_entry("talon-agent", "default-api-key")?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn host_password_account(host_id: &str) -> String {
    format!("host-password-{}", host_id)
}

pub fn save_host_password(host_id: &str, value: &str) -> Result<(), String> {
    secret_entry("talon-host", &host_password_account(host_id))?
        .set_password(value)
        .map_err(|error| error.to_string())
}

pub fn load_host_password(host_id: &str) -> Result<String, String> {
    secret_entry("talon-host", &host_password_account(host_id))?
        .get_password()
        .map_err(|error| error.to_string())
}

pub fn clear_host_password(host_id: &str) -> Result<(), String> {
    let entry = secret_entry("talon-host", &host_password_account(host_id))?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn has_saved_host_password(host_id: &str) -> bool {
    load_host_password(host_id).map(|value| !value.is_empty()).unwrap_or(false)
}
