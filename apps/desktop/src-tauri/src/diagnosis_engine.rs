use std::time::Duration;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::context_builder;
use crate::secrets;
use crate::session_registry::SessionConnectionIssue;
use crate::session_store::{DiagnosisMessage, DiagnosisResponse, FailureContext, SuggestedAction};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisContextPacket {
    pub id: String,
    pub session_id: String,
    pub trigger: String,
    pub host: Value,
    pub connection: Value,
    pub session: Value,
    pub failure: Option<Value>,
    pub connection_issue: Option<Value>,
    pub recent_commands: Vec<Value>,
    pub timeline_window: Vec<Value>,
    pub artifacts: Vec<String>,
    pub generated_at: String,
}

#[derive(Clone)]
pub struct DiagnosisGenerationInput {
    pub packet: DiagnosisContextPacket,
    pub fallback: DiagnosisResponse,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

#[derive(Deserialize)]
struct ProviderDiagnosis {
    summary: Option<String>,
    confidence: Option<u8>,
    likely_causes: Option<Vec<String>>,
    messages: Option<Vec<ProviderMessage>>,
    suggested_actions: Option<Vec<ProviderAction>>,
}

#[derive(Deserialize)]
struct ProviderMessage {
    title: String,
    body: String,
    tone: Option<String>,
}

#[derive(Deserialize)]
struct ProviderAction {
    label: String,
    command: String,
    rationale: Option<String>,
    safety_level: Option<String>,
}

fn provider_prompt(packet: &DiagnosisContextPacket) -> Value {
    json!([
        {
            "role": "system",
            "content": "You are Talon, an SSH troubleshooting copilot. Use only the provided packet. Never assume hidden facts. Prefer read-only suggested actions. Return strict JSON with keys: summary, confidence, likely_causes, messages, suggested_actions."
        },
        {
            "role": "user",
            "content": serde_json::to_string_pretty(packet).unwrap_or_else(|_| "{}".into())
        }
    ])
}

fn normalize_tone(value: Option<String>) -> String {
    match value.as_deref() {
        Some("critical") => "critical".into(),
        Some("success") => "success".into(),
        Some("warning") => "warning".into(),
        _ => "neutral".into(),
    }
}

fn normalize_safety(value: Option<String>) -> String {
    match value.as_deref() {
        Some("guarded") => "guarded".into(),
        _ => "read-only".into(),
    }
}

fn provider_to_response(base: &DiagnosisResponse, packet_id: &str, parsed: ProviderDiagnosis) -> DiagnosisResponse {
    DiagnosisResponse {
        id: format!("diag-{}", packet_id),
        session_id: base.session_id.clone(),
        status: "ready".into(),
        confidence: parsed.confidence.unwrap_or(base.confidence),
        summary: parsed.summary.unwrap_or_else(|| base.summary.clone()),
        likely_causes: parsed.likely_causes.unwrap_or_else(|| base.likely_causes.clone()),
        messages: parsed
            .messages
            .unwrap_or_default()
            .into_iter()
            .enumerate()
            .map(|(index, message)| DiagnosisMessage {
                id: format!("diag-message-{}-{}", packet_id, index),
                source: "agent".into(),
                tone: normalize_tone(message.tone),
                title: message.title,
                body: message.body,
            })
            .collect::<Vec<_>>(),
        suggested_actions: parsed
            .suggested_actions
            .unwrap_or_default()
            .into_iter()
            .enumerate()
            .map(|(index, action)| SuggestedAction {
                id: format!("diag-action-{}-{}", packet_id, index),
                label: action.label,
                command: action.command,
                rationale: action.rationale.unwrap_or_else(|| "Model suggested next inspection step.".into()),
                safety_level: normalize_safety(action.safety_level),
                status: "ready".into(),
            })
            .collect::<Vec<_>>(),
        provider: "openai-compatible".into(),
        error_message: None,
        context_packet_id: packet_id.into(),
        generated_at: base.generated_at.clone(),
    }
}

fn fallback_with_error(mut fallback: DiagnosisResponse, packet_id: &str, error: String) -> DiagnosisResponse {
    fallback.provider = "rule-engine".into();
    fallback.status = "error".into();
    fallback.error_message = Some(error.clone());
    fallback.context_packet_id = packet_id.into();
    fallback.messages.insert(
        0,
        DiagnosisMessage {
            id: format!("diag-provider-error-{}", packet_id),
            source: "system".into(),
            tone: "warning".into(),
            title: "Model diagnosis unavailable".into(),
            body: error,
        },
    );
    fallback
}

pub fn build_packet_from_failure(
    failure: &FailureContext,
    host: Value,
    connection: Value,
    session: Value,
    recent_commands: Vec<Value>,
    timeline_window: Vec<Value>,
) -> DiagnosisContextPacket {
    DiagnosisContextPacket {
        id: format!("packet-{}", failure.id),
        session_id: failure.session_id.clone(),
        trigger: "command-failure".into(),
        host,
        connection,
        session,
        failure: Some(json!(failure)),
        connection_issue: None,
        recent_commands,
        timeline_window,
        artifacts: failure.related_artifacts.clone(),
        generated_at: failure.captured_at.clone(),
    }
}

pub fn build_packet_from_connection_issue(
    issue: &SessionConnectionIssue,
    host: Value,
    connection: Value,
    session: Value,
    recent_commands: Vec<Value>,
    timeline_window: Vec<Value>,
) -> DiagnosisContextPacket {
    DiagnosisContextPacket {
        id: format!("packet-{}-{}", issue.session_id, issue.kind),
        session_id: issue.session_id.clone(),
        trigger: "connection-issue".into(),
        host,
        connection,
        session,
        failure: None,
        connection_issue: Some(json!(issue)),
        recent_commands,
        timeline_window,
        artifacts: Vec::new(),
        generated_at: issue.observed_at.clone(),
    }
}

pub fn fallback_for_failure(failure: &FailureContext) -> DiagnosisResponse {
    let mut response = context_builder::build_diagnosis_from_failure(failure);
    response.provider = "rule-engine".into();
    response.context_packet_id = format!("packet-{}", failure.id);
    response.error_message = None;
    response.status = "ready".into();
    response
}

pub fn fallback_for_connection_issue(issue: &SessionConnectionIssue) -> DiagnosisResponse {
    let mut response = context_builder::build_diagnosis_from_connection_issue(issue);
    response.provider = "rule-engine".into();
    response.context_packet_id = format!("packet-{}-{}", issue.session_id, issue.kind);
    response.error_message = None;
    response.status = "ready".into();
    response
}

pub fn generate(input: DiagnosisGenerationInput) -> DiagnosisResponse {
    let settings = secrets::load_agent_settings();
    let packet_id = input.packet.id.clone();

    if !settings.auto_diagnose {
        let mut fallback = input.fallback.clone();
        fallback.provider = "rule-engine".into();
        fallback.status = "ready".into();
        fallback.context_packet_id = packet_id;
        return fallback;
    }

    let api_key = match secrets::load_agent_api_key() {
        Ok(value) if !value.trim().is_empty() => value,
        Ok(_) | Err(_) => {
            return fallback_with_error(input.fallback.clone(), &packet_id, "No API key configured for model diagnosis; using the local rule engine.".into())
        }
    };

    let client = match Client::builder().timeout(Duration::from_secs(settings.request_timeout_sec)).build() {
        Ok(client) => client,
        Err(error) => {
            return fallback_with_error(input.fallback.clone(), &packet_id, format!("Failed to initialize model client: {}", error));
        }
    };

    let request_body = json!({
        "model": settings.model,
        "response_format": { "type": "json_object" },
        "messages": provider_prompt(&input.packet),
    });

    let response = match client
        .post(format!("{}/chat/completions", settings.base_url.trim_end_matches('/')))
        .bearer_auth(api_key)
        .json(&request_body)
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            return fallback_with_error(input.fallback.clone(), &packet_id, format!("Model request failed: {}", error));
        }
    };

    if !response.status().is_success() {
        return fallback_with_error(
            input.fallback.clone(),
            &packet_id,
            format!("Model request returned HTTP {}.", response.status()),
        );
    }

    let completion = match response.json::<ChatCompletionResponse>() {
        Ok(value) => value,
        Err(error) => {
            return fallback_with_error(input.fallback.clone(), &packet_id, format!("Failed to decode model response: {}", error));
        }
    };

    let Some(content) = completion.choices.first().map(|choice| choice.message.content.clone()) else {
        return fallback_with_error(input.fallback.clone(), &packet_id, "Model response did not include a completion choice.".into());
    };

    let parsed = match serde_json::from_str::<ProviderDiagnosis>(&content) {
        Ok(parsed) => parsed,
        Err(error) => {
            return fallback_with_error(input.fallback.clone(), &packet_id, format!("Model response was not valid JSON: {}", error));
        }
    };

    provider_to_response(&input.fallback, &packet_id, parsed)
}
