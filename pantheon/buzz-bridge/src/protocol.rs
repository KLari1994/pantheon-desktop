use std::io::{BufRead, Read};
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::credential_store::{CredentialStore, StoreError};
use crate::relay::{RelayAdapter, RelayError};

pub const MAX_CONTENT_BYTES: usize = 64 * 1024;
pub const MAX_EMOJI_CHARS: usize = 64;
pub const MAX_MENTIONS: usize = 32;
pub const MAX_ATTACHMENTS: usize = 32;

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
    InvalidContent,
    InvalidEmoji,
    RoleDenied,
    InvalidPubkey,
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
            Self::InvalidContent => "invalid_content",
            Self::InvalidEmoji => "invalid_emoji",
            Self::RoleDenied => "role_denied",
            Self::InvalidPubkey => "invalid_pubkey",
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
    let pump = EventPump::default();
    handle_line_with_pump(line, store, relay, &pump)
}

pub fn handle_line_with_pump(
    line: &[u8],
    store: &dyn CredentialStore,
    relay: &dyn RelayAdapter,
    pump: &EventPump,
) -> HandleOutcome {
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

    match dispatch(&request, store, relay, pump) {
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
    pump: &EventPump,
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
        "messages.send" => send_message(request, relay),
        "reactions.add" => add_reaction(request, relay),
        "reactions.remove" => remove_reaction(request, relay),
        "members.add" => mutate_member(request, relay, true),
        "members.remove" => mutate_member(request, relay, false),
        "subscribe.start" => start_subscription(request, pump),
        "subscribe.stop" => {
            pump.clear();
            Ok(json!({ "stopped": true }))
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

#[derive(Default)]
pub struct EventPump {
    rooms: std::sync::Mutex<Vec<String>>,
    since: std::sync::Mutex<u64>,
}

impl EventPump {
    pub fn set_rooms(&self, rooms: Vec<String>) {
        if let Ok(mut slot) = self.rooms.lock() {
            *slot = rooms;
        }
        if let Ok(mut since) = self.since.lock() {
            *since = unix_now().saturating_sub(1);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut slot) = self.rooms.lock() {
            slot.clear();
        }
    }

    pub fn rooms(&self) -> Vec<String> {
        self.rooms.lock().map(|slot| slot.clone()).unwrap_or_default()
    }

    pub fn since(&self) -> u64 {
        self.since.lock().map(|slot| *slot).unwrap_or(0)
    }

    pub fn advance(&self, now: u64) {
        if let Ok(mut since) = self.since.lock() {
            *since = now;
        }
    }
}

pub fn poll_subscription(relay: &dyn RelayAdapter, pump: &EventPump) -> Vec<Value> {
    let rooms = pump.rooms();
    if rooms.is_empty() {
        return Vec::new();
    }
    match relay.events_since(&rooms, pump.since()) {
        Ok(events) => {
            pump.advance(unix_now());
            events
                .into_iter()
                .filter_map(|event| {
                    let room_id = event
                        .get("tags")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .find_map(|tag| {
                            let parts = tag.as_array()?;
                            if parts.first().and_then(Value::as_str) == Some("h") {
                                parts.get(1).and_then(Value::as_str).map(str::to_string)
                            } else {
                                None
                            }
                        })?;
                    Some(json!({
                        "type": "room.event",
                        "room_id": room_id,
                        "event": event
                    }))
                })
                .collect()
        }
        Err(err) => vec![json!({
            "type": "relay.status",
            "state": "closed",
            "error": err.to_string()
        })],
    }
}

fn param_str<'a>(request: &'a BridgeRequest, key: &str) -> &'a str {
    request.params.get(key).and_then(Value::as_str).unwrap_or("")
}

fn send_message(request: &BridgeRequest, relay: &dyn RelayAdapter) -> Result<Value, ProtocolError> {
    let room_id = param_str(request, "roomId");
    validate_room_id(room_id)?;
    let content = param_str(request, "content");
    if content.len() > MAX_CONTENT_BYTES {
        return Err(ProtocolError::InvalidContent);
    }
    let mentions = request
        .params
        .get("mentions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if mentions.len() > MAX_MENTIONS {
        return Err(ProtocolError::InvalidContent);
    }
    let attachments = request
        .params
        .get("attachments")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if attachments.len() > MAX_ATTACHMENTS {
        return Err(ProtocolError::InvalidContent);
    }
    let mut tags = vec![json!(["h", room_id])];
    if let Some(thread) = request.params.get("threadRootId").and_then(Value::as_str) {
        validate_room_id(thread)?;
        tags.push(json!(["e", thread]));
        tags.push(json!(["E", thread]));
    }
    for mention in mentions {
        if let Some(pubkey) = mention.as_str() {
            tags.push(json!(["p", pubkey]));
        }
    }
    for attachment in attachments {
        let url = attachment.get("url").and_then(Value::as_str).unwrap_or("");
        let mime = attachment.get("mimeType").and_then(Value::as_str).unwrap_or("application/octet-stream");
        if url.is_empty() {
            continue;
        }
        let mut imeta = vec!["imeta".to_string(), format!("url {url}"), format!("m {mime}")];
        if let Some(name) = attachment.get("name").and_then(Value::as_str) {
            imeta.push(format!("alt {name}"));
        }
        if let Some(size) = attachment.get("sizeBytes").and_then(Value::as_u64) {
            imeta.push(format!("size {size}"));
        }
        tags.push(Value::Array(imeta.into_iter().map(Value::from).collect()));
    }
    let created_at = unix_now();
    let event = json!({
        "kind": 9,
        "content": content,
        "created_at": created_at,
        "tags": tags
    });
    let published = relay.publish(&event).map_err(|_| ProtocolError::Unavailable)?;
    Ok(json!({
        "eventId": published.event_id,
        "createdAt": published.created_at
    }))
}

fn add_reaction(request: &BridgeRequest, relay: &dyn RelayAdapter) -> Result<Value, ProtocolError> {
    let room_id = param_str(request, "roomId");
    validate_room_id(room_id)?;
    let target = param_str(request, "targetEventId");
    validate_room_id(target)?;
    let emoji = param_str(request, "emoji");
    if emoji.is_empty() || emoji.chars().count() > MAX_EMOJI_CHARS {
        return Err(ProtocolError::InvalidEmoji);
    }
    let event = json!({
        "kind": 7,
        "content": emoji,
        "created_at": unix_now(),
        "tags": [["h", room_id], ["e", target]]
    });
    let published = relay.publish(&event).map_err(|_| ProtocolError::Unavailable)?;
    Ok(json!({ "eventId": published.event_id }))
}

fn remove_reaction(request: &BridgeRequest, relay: &dyn RelayAdapter) -> Result<Value, ProtocolError> {
    let room_id = param_str(request, "roomId");
    validate_room_id(room_id)?;
    let reaction_id = param_str(request, "reactionEventId");
    validate_room_id(reaction_id)?;
    let event = json!({
        "kind": 5,
        "content": "",
        "created_at": unix_now(),
        "tags": [["h", room_id], ["e", reaction_id]]
    });
    let published = relay.publish(&event).map_err(|_| ProtocolError::Unavailable)?;
    Ok(json!({ "eventId": published.event_id }))
}

fn role_rank(role: &str) -> u8 {
    match role {
        "owner" => 4,
        "admin" => 3,
        "member" => 2,
        "guest" => 1,
        _ => 0,
    }
}

fn require_admin(relay: &dyn RelayAdapter, room_id: &str) -> Result<(), ProtocolError> {
    let room = relay.get_room(room_id).map_err(|_| ProtocolError::Unavailable)?;
    let self_role = room.self_role.as_deref().unwrap_or("guest");
    if role_rank(self_role) < role_rank("admin") {
        return Err(ProtocolError::RoleDenied);
    }
    Ok(())
}

fn mutate_member(request: &BridgeRequest, relay: &dyn RelayAdapter, add: bool) -> Result<Value, ProtocolError> {
    let room_id = param_str(request, "roomId");
    validate_room_id(room_id)?;
    let pubkey = param_str(request, "pubkey");
    if pubkey.is_empty() || pubkey.len() > MAX_ID_LEN {
        return Err(ProtocolError::InvalidPubkey);
    }
    require_admin(relay, room_id)?;
    let mut tags = vec![json!(["h", room_id]), json!(["p", pubkey])];
    if add {
        if let Some(role) = request.params.get("role").and_then(Value::as_str) {
            tags.push(json!(["role", role]));
        }
    }
    let event = json!({
        "kind": if add { 9000 } else { 9001 },
        "content": "",
        "created_at": unix_now(),
        "tags": tags
    });
    let published = relay.publish(&event).map_err(|_| ProtocolError::Unavailable)?;
    Ok(json!({ "eventId": published.event_id }))
}

fn start_subscription(request: &BridgeRequest, pump: &EventPump) -> Result<Value, ProtocolError> {
    let rooms = request
        .params
        .get("roomIds")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut ids = Vec::new();
    for room in rooms {
        let id = room.as_str().unwrap_or("");
        validate_room_id(id)?;
        ids.push(id.to_string());
    }
    pump.set_rooms(ids);
    Ok(json!({ "started": true }))
}
