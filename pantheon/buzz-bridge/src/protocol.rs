use std::io::{BufRead, Read};
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::credential_store::{CredentialStore, StoreError};
use crate::relay::{RelayAdapter, RelayError};

pub const MAX_FRAME_BYTES: usize = 65_536;
pub const MIN_MESSAGE_LIMIT: u32 = 1;
pub const MAX_MESSAGE_LIMIT: u32 = 200;
pub const MAX_ID_LEN: usize = 128;
pub const BUZZ_COMPATIBILITY_COMMIT: &str = "0720f5380ce8a6c050afac159f8462c06cd51ab5";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeRequest {
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeEvent {
    #[serde(rename = "relay.status")]
    RelayStatus {
        state: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    #[serde(rename = "room.event")]
    RoomEvent { room_id: String, event: Value },
}

pub struct HandleOutcome {
    pub response: String,
    pub should_exit: bool,
}

#[derive(Debug)]
pub enum ProtocolError {
    FrameTooLarge,
    MalformedFrame,
    InvalidId,
    UnknownMethod,
    InvalidLimit,
    InvalidRoomId,
    Unavailable,
}

impl ProtocolError {
    fn code(&self) -> &'static str {
        match self {
            Self::FrameTooLarge => "frame_too_large",
            Self::MalformedFrame => "malformed_frame",
            Self::InvalidId => "invalid_id",
            Self::UnknownMethod => "unknown_method",
            Self::InvalidLimit => "invalid_limit",
            Self::InvalidRoomId => "invalid_room_id",
            Self::Unavailable => "unavailable",
        }
    }
}

pub fn redact_text(input: &str) -> String {
    let nsec = Regex::new(r"nsec1[0-9a-z]{20,}").expect("nsec regex");
    let hex64 = Regex::new(r"\b[0-9a-fA-F]{64}\b").expect("hex regex");
    let without_nsec = nsec.replace_all(input, "[redacted]");
    hex64.replace_all(&without_nsec, "[redacted]").into_owned()
}

fn error_response(id: Option<&str>, code: &str, message: &str) -> String {
    redact_text(
        &json!({
            "id": id,
            "ok": false,
            "error": { "code": code, "message": message }
        })
        .to_string(),
    )
}

fn ok_response(id: &str, result: Value) -> String {
    json!({
        "id": id,
        "ok": true,
        "result": result
    })
    .to_string()
}

/// Parse `--relay-url` from argv. Production never reads env for this.
pub fn relay_url_from_args<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        let arg = arg.as_ref();
        if arg == "--relay-url" {
            return iter
                .next()
                .map(|value| value.as_ref().trim().to_string())
                .filter(|value| !value.is_empty());
        }
        if let Some(value) = arg.strip_prefix("--relay-url=") {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Read one NDJSON line, rejecting before the buffer can grow past the ceiling.
pub fn read_ndjson_frame<R: BufRead>(
    reader: &mut R,
) -> std::io::Result<Option<Result<Vec<u8>, ProtocolError>>> {
    let mut buf = Vec::new();
    let n = reader
        .by_ref()
        .take(MAX_FRAME_BYTES as u64 + 1)
        .read_until(b'\n', &mut buf)?;
    if n == 0 {
        return Ok(None);
    }
    let ended = buf.last() == Some(&b'\n');
    if !ended || buf.len() > MAX_FRAME_BYTES {
        if !ended {
            let mut discard = Vec::new();
            reader.read_until(b'\n', &mut discard)?;
        }
        return Ok(Some(Err(ProtocolError::FrameTooLarge)));
    }
    buf.pop();
    if buf.last() == Some(&b'\r') {
        buf.pop();
    }
    if buf.len() > MAX_FRAME_BYTES {
        return Ok(Some(Err(ProtocolError::FrameTooLarge)));
    }
    Ok(Some(Ok(buf)))
}

fn validate_room_id(value: &str) -> Result<(), ProtocolError> {
    if value.is_empty() || value.len() > MAX_ID_LEN {
        return Err(ProtocolError::InvalidRoomId);
    }
    Ok(())
}

pub fn handle_line(line: &[u8], store: &dyn CredentialStore, relay: &dyn RelayAdapter) -> HandleOutcome {
    if line.len() > MAX_FRAME_BYTES {
        return HandleOutcome {
            response: error_response(None, "frame_too_large", "NDJSON frame exceeds 65536 bytes"),
            should_exit: false,
        };
    }

    let parsed: Value = match serde_json::from_slice(line) {
        Ok(value) => value,
        Err(_) => {
            return HandleOutcome {
                response: error_response(None, "malformed_frame", "frame is not valid JSON"),
                should_exit: false,
            };
        }
    };

    let raw_id = parsed
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if Uuid::parse_str(&raw_id).is_err() {
        return HandleOutcome {
            response: error_response(Some(&raw_id), "invalid_id", "request id must be a UUID"),
            should_exit: false,
        };
    }

    let request: BridgeRequest = match serde_json::from_value(parsed) {
        Ok(request) => request,
        Err(_) => {
            return HandleOutcome {
                response: error_response(Some(&raw_id), "malformed_frame", "frame is not a request"),
                should_exit: false,
            };
        }
    };

    match dispatch(&request, store, relay) {
        Ok(result) => HandleOutcome {
            response: ok_response(&request.id, result),
            should_exit: false,
        },
        Err(err) => HandleOutcome {
            response: error_response(Some(&request.id), err.code(), err.code()),
            should_exit: false,
        },
    }
}

fn dispatch(
    request: &BridgeRequest,
    store: &dyn CredentialStore,
    relay: &dyn RelayAdapter,
) -> Result<Value, ProtocolError> {
    match request.method.as_str() {
        "status" => Ok(status_payload(store, relay)),
        "rooms.list" => {
            let cursor = request
                .params
                .get("cursor")
                .and_then(Value::as_str)
                .map(str::to_string);
            let page = relay
                .list_rooms(cursor.as_deref())
                .map_err(|_| ProtocolError::Unavailable)?;
            Ok(serde_json::to_value(page).unwrap_or_else(|_| json!({ "rooms": [], "nextCursor": null })))
        }
        "rooms.get" => {
            let room_id = request
                .params
                .get("roomId")
                .and_then(Value::as_str)
                .unwrap_or("");
            validate_room_id(room_id)?;
            let room = relay.get_room(room_id).map_err(|_| ProtocolError::Unavailable)?;
            Ok(serde_json::to_value(room).unwrap_or_else(|_| json!({})))
        }
        "messages.window" => {
            let room_id = request
                .params
                .get("roomId")
                .and_then(Value::as_str)
                .unwrap_or("");
            validate_room_id(room_id)?;
            let limit = request
                .params
                .get("limit")
                .and_then(Value::as_u64)
                .ok_or(ProtocolError::InvalidLimit)?;
            if limit < MIN_MESSAGE_LIMIT as u64 || limit > MAX_MESSAGE_LIMIT as u64 {
                return Err(ProtocolError::InvalidLimit);
            }
            let before = request
                .params
                .get("before")
                .and_then(Value::as_str)
                .map(str::to_string);
            if let Some(before) = before.as_deref() {
                validate_room_id(before)?;
            }
            let window = relay
                .message_window(room_id, before.as_deref(), limit as u32)
                .map_err(|_| ProtocolError::Unavailable)?;
            Ok(serde_json::to_value(window).unwrap_or_else(|_| json!({ "messages": [] })))
        }
        "credential.set" => {
            let private_key = request
                .params
                .get("privateKey")
                .and_then(Value::as_str)
                .unwrap_or("");
            if private_key.is_empty() {
                return Err(ProtocolError::MalformedFrame);
            }
            store
                .set(private_key)
                .map_err(|_| ProtocolError::MalformedFrame)?;
            Ok(json!({ "stored": true }))
        }
        _ => Err(ProtocolError::UnknownMethod),
    }
}

fn status_payload(store: &dyn CredentialStore, relay: &dyn RelayAdapter) -> Value {
    let credential = match store.get() {
        Ok(value) => value,
        Err(StoreError::Unsupported) => {
            return json!({
                "state": "closed",
                "error": "unsupported",
                "compatibilityCommit": BUZZ_COMPATIBILITY_COMMIT,
                "hasCredential": false
            });
        }
        Err(_) => None,
    };
    let has_credential = credential.is_some();
    let pubkey = credential
        .as_deref()
        .and_then(crate::relay::public_key_hex_from_secret);
    match relay.status() {
        Ok(status) => json!({
            "state": status.state,
            "error": status.error,
            "compatibilityCommit": BUZZ_COMPATIBILITY_COMMIT,
            "relayUrl": status.relay_url,
            "hasCredential": has_credential,
            "pubkey": pubkey
        }),
        Err(RelayError::Unavailable(message)) => json!({
            "state": "closed",
            "error": message,
            "compatibilityCommit": BUZZ_COMPATIBILITY_COMMIT,
            "hasCredential": has_credential,
            "pubkey": pubkey
        }),
    }
}

pub fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
