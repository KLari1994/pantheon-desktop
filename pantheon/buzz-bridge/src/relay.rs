use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use thiserror::Error;

use crate::protocol::BUZZ_COMPATIBILITY_COMMIT;

pub const KIND_CHANNEL_METADATA: u16 = 39000;
pub const KIND_CHANNEL_MEMBERS: u16 = 39002;
pub const MESSAGE_KINDS: [u16; 5] = [9, 40002, 40008, 45001, 45003];

#[derive(Debug, Error)]
pub enum RelayError {
    #[error("{0}")]
    Unavailable(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuzzStatus {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub compatibility_commit: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzMember {
    pub pubkey: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzRoom {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub about: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub self_role: Option<String>,
    #[serde(default)]
    pub members: Vec<BuzzMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzAttachment {
    pub url: String,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzMessage {
    pub id: String,
    pub room_id: String,
    pub content: String,
    pub created_at: u64,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_root_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<BuzzAttachment>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzReaction {
    pub id: String,
    pub target_event_id: String,
    pub emoji: String,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuzzMessageWindow {
    pub messages: Vec<BuzzMessage>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reactions: Vec<BuzzReaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub event_id: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzRoomPage {
    pub rooms: Vec<BuzzRoom>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

pub trait RelayAdapter: Send + Sync {
    fn status(&self) -> Result<BuzzStatus, RelayError>;
    fn list_rooms(&self, cursor: Option<&str>) -> Result<BuzzRoomPage, RelayError>;
    fn get_room(&self, room_id: &str) -> Result<BuzzRoom, RelayError>;
    fn message_window(
        &self,
        room_id: &str,
        before: Option<&str>,
        limit: u32,
    ) -> Result<BuzzMessageWindow, RelayError>;
    fn publish(&self, _event: &Value) -> Result<PublishResult, RelayError> {
        Err(RelayError::Unavailable("publish unsupported".into()))
    }
    fn events_since(&self, _room_ids: &[String], _since: u64) -> Result<Vec<Value>, RelayError> {
        Err(RelayError::Unavailable("events_since unsupported".into()))
    }
}

/// Production fail-closed adapter. Used when the sidecar has no relay URL
/// or (on Windows) no owner credential. Not a test fake.
pub struct ClosedRelay {
    reason: String,
}

impl ClosedRelay {
    pub fn missing_relay_url() -> Self {
        Self {
            reason: "missing_relay_url".into(),
        }
    }

    pub fn missing_credential() -> Self {
        Self {
            reason: "missing_credential".into(),
        }
    }

    pub fn from_message(reason: impl Into<String>) -> Self {
        Self {
            reason: reason.into(),
        }
    }
}

impl RelayAdapter for ClosedRelay {
    fn status(&self) -> Result<BuzzStatus, RelayError> {
        Ok(BuzzStatus {
            state: "closed".into(),
            error: Some(self.reason.clone()),
            compatibility_commit: BUZZ_COMPATIBILITY_COMMIT.into(),
            relay_url: None,
        })
    }

    fn list_rooms(&self, _cursor: Option<&str>) -> Result<BuzzRoomPage, RelayError> {
        Err(RelayError::Unavailable(self.reason.clone()))
    }

    fn get_room(&self, _room_id: &str) -> Result<BuzzRoom, RelayError> {
        Err(RelayError::Unavailable(self.reason.clone()))
    }

    fn message_window(
        &self,
        _room_id: &str,
        _before: Option<&str>,
        _limit: u32,
    ) -> Result<BuzzMessageWindow, RelayError> {
        Err(RelayError::Unavailable(self.reason.clone()))
    }

    fn publish(&self, _event: &Value) -> Result<PublishResult, RelayError> {
        Err(RelayError::Unavailable(self.reason.clone()))
    }

    fn events_since(&self, _room_ids: &[String], _since: u64) -> Result<Vec<Value>, RelayError> {
        Err(RelayError::Unavailable(self.reason.clone()))
    }
}

pub struct FakeRelay {
    rooms: Vec<BuzzRoom>,
    messages: Vec<BuzzMessage>,
    published: Mutex<Vec<Value>>,
}

impl Default for FakeRelay {
    fn default() -> Self {
        Self {
            rooms: vec![BuzzRoom {
                id: "room-a".into(),
                name: "General".into(),
                about: None,
                kind: Some("office".into()),
                visibility: Some("private".into()),
                ttl_seconds: None,
                expires_at: None,
                self_role: Some("owner".into()),
                members: vec![BuzzMember {
                    pubkey: "alice".into(),
                    name: Some("Alice".into()),
                    role: Some("owner".into()),
                }],
            }],
            messages: vec![BuzzMessage {
                id: "evt-1".into(),
                room_id: "room-a".into(),
                content: "hello".into(),
                created_at: 1,
                author: "alice".into(),
                thread_root_id: None,
                reply_to_id: None,
                attachments: None,
            }],
            published: Mutex::new(Vec::new()),
        }
    }
}

impl RelayAdapter for FakeRelay {
    fn status(&self) -> Result<BuzzStatus, RelayError> {
        Ok(BuzzStatus {
            state: "open".into(),
            error: None,
            compatibility_commit: BUZZ_COMPATIBILITY_COMMIT.into(),
            relay_url: Some("https://relay.example.test".into()),
        })
    }

    fn list_rooms(&self, _cursor: Option<&str>) -> Result<BuzzRoomPage, RelayError> {
        Ok(BuzzRoomPage {
            rooms: self.rooms.clone(),
            next_cursor: None,
        })
    }

    fn get_room(&self, room_id: &str) -> Result<BuzzRoom, RelayError> {
        self.rooms
            .iter()
            .find(|room| room.id == room_id)
            .cloned()
            .ok_or_else(|| RelayError::Unavailable("room not found".into()))
    }

    fn message_window(
        &self,
        room_id: &str,
        _before: Option<&str>,
        limit: u32,
    ) -> Result<BuzzMessageWindow, RelayError> {
        let messages = self
            .messages
            .iter()
            .filter(|message| message.room_id == room_id)
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(BuzzMessageWindow { messages, reactions: vec![] })
    }

    fn publish(&self, event: &Value) -> Result<PublishResult, RelayError> {
        let created_at = event
            .get("created_at")
            .and_then(Value::as_u64)
            .unwrap_or_else(crate::protocol::unix_now);
        let event_id = event
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("evt-{created_at}"));
        if let Ok(mut published) = self.published.lock() {
            published.push(event.clone());
        }
        Ok(PublishResult {
            event_id,
            created_at,
        })
    }

    fn events_since(&self, room_ids: &[String], _since: u64) -> Result<Vec<Value>, RelayError> {
        let published = self
            .published
            .lock()
            .map_err(|_| RelayError::Unavailable("lock".into()))?
            .clone();
        Ok(published
            .into_iter()
            .filter(|event| {
                event
                    .get("tags")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .any(|tag| {
                        let parts = tag.as_array();
                        matches!(parts, Some(parts) if parts.first().and_then(Value::as_str) == Some("h")
                            && parts.get(1).and_then(Value::as_str).is_some_and(|id| room_ids.iter().any(|room| room == id)))
                    })
            })
            .collect())
    }
}

pub struct StockBuzzRelay {
    relay_url: String,
    secret_hex: Option<[u8; 32]>,
    http: reqwest::blocking::Client,
}

impl StockBuzzRelay {
    pub fn new(relay_url: String, secret: Option<&str>) -> Result<Self, RelayError> {
        let secret_hex = match secret {
            Some(value) => Some(decode_secret(value).map_err(|e| RelayError::Unavailable(e))?),
            None => None,
        };
        let http = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| RelayError::Unavailable(e.to_string()))?;
        Ok(Self {
            relay_url: relay_url.trim_end_matches('/').to_string(),
            secret_hex,
            http,
        })
    }

    fn query(&self, filter: Value) -> Result<Vec<Value>, RelayError> {
        let url = format!("{}/query", self.relay_url);
        let body = serde_json::to_vec(&[filter]).map_err(|e| RelayError::Unavailable(e.to_string()))?;
        let mut request = self
            .http
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body.clone());
        if let Some(secret) = self.secret_hex {
            let auth = sign_nip98(&secret, "POST", &url, Some(&body))?;
            request = request.header("Authorization", auth);
        }
        let response = request.send().map_err(|e| RelayError::Unavailable(e.to_string()))?;
        let text = response.text().map_err(|e| RelayError::Unavailable(e.to_string()))?;
        serde_json::from_str(&text).map_err(|e| RelayError::Unavailable(e.to_string()))
    }
}

impl RelayAdapter for StockBuzzRelay {
    fn status(&self) -> Result<BuzzStatus, RelayError> {
        let url = self.relay_url.clone();
        let result = self
            .http
            .get(&url)
            .header("Accept", "application/nostr+json")
            .send();
        match result {
            Ok(response) if response.status().is_success() => Ok(BuzzStatus {
                state: "open".into(),
                error: None,
                compatibility_commit: BUZZ_COMPATIBILITY_COMMIT.into(),
                relay_url: Some(self.relay_url.clone()),
            }),
            Ok(response) => Ok(BuzzStatus {
                state: "closed".into(),
                error: Some(format!("http {}", response.status())),
                compatibility_commit: BUZZ_COMPATIBILITY_COMMIT.into(),
                relay_url: Some(self.relay_url.clone()),
            }),
            Err(err) => Ok(BuzzStatus {
                state: "closed".into(),
                error: Some(err.to_string()),
                compatibility_commit: BUZZ_COMPATIBILITY_COMMIT.into(),
                relay_url: Some(self.relay_url.clone()),
            }),
        }
    }

    fn list_rooms(&self, _cursor: Option<&str>) -> Result<BuzzRoomPage, RelayError> {
        let events = self.query(json!({ "kinds": [KIND_CHANNEL_METADATA], "limit": 100 }))?;
        Ok(BuzzRoomPage {
            rooms: events.iter().filter_map(room_from_event).collect(),
            next_cursor: None,
        })
    }

    fn get_room(&self, room_id: &str) -> Result<BuzzRoom, RelayError> {
        let events = self.query(json!({
            "kinds": [KIND_CHANNEL_METADATA],
            "#d": [room_id],
            "limit": 1
        }))?;
        let mut room = events
            .first()
            .and_then(room_from_event)
            .ok_or_else(|| RelayError::Unavailable("room not found".into()))?;
        if let Ok(members) = self.query(json!({
            "kinds": [KIND_CHANNEL_MEMBERS],
            "#d": [room_id],
            "limit": 1
        })) {
            if let Some(event) = members.first() {
                room.members = p_tags(event)
                    .into_iter()
                    .map(|(pubkey, role)| BuzzMember {
                        pubkey,
                        name: None,
                        role,
                    })
                    .collect();
            }
        }
        Ok(room)
    }

    fn message_window(
        &self,
        room_id: &str,
        before: Option<&str>,
        limit: u32,
    ) -> Result<BuzzMessageWindow, RelayError> {
        let mut filter = json!({
            "kinds": MESSAGE_KINDS,
            "#h": [room_id],
            "limit": limit
        });
        if let Some(before) = before {
            filter["until"] = json!(before);
        }
        let events = self.query(filter)?;
        Ok(BuzzMessageWindow {
            messages: events
                .iter()
                .filter_map(|event| message_from_event(event, room_id))
                .collect(),
            reactions: events.iter().filter_map(reaction_from_event).collect(),
        })
    }

    fn publish(&self, event: &Value) -> Result<PublishResult, RelayError> {
        let signed = match self.secret_hex {
            Some(secret) => sign_nostr_event(&secret, event)?,
            None => event.clone(),
        };
        let url = format!("{}/events", self.relay_url);
        let body = serde_json::to_vec(&signed).map_err(|e| RelayError::Unavailable(e.to_string()))?;
        let mut request = self
            .http
            .post(&url)
            .header("Content-Type", "application/json")
            .body(body.clone());
        if let Some(secret) = self.secret_hex {
            let auth = sign_nip98(&secret, "POST", &url, Some(&body))?;
            request = request.header("Authorization", auth);
        }
        let response = request.send().map_err(|e| RelayError::Unavailable(e.to_string()))?;
        if !response.status().is_success() {
            return Err(RelayError::Unavailable(format!("http {}", response.status())));
        }
        Ok(PublishResult {
            event_id: signed
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("unpublished")
                .to_string(),
            created_at: signed
                .get("created_at")
                .and_then(Value::as_u64)
                .unwrap_or_else(crate::protocol::unix_now),
        })
    }

    fn events_since(&self, room_ids: &[String], since: u64) -> Result<Vec<Value>, RelayError> {
        if room_ids.is_empty() {
            return Ok(vec![]);
        }
        self.query(json!({
            "kinds": [9, 7, 5, 9000, 9001, KIND_CHANNEL_METADATA, KIND_CHANNEL_MEMBERS],
            "#h": room_ids,
            "since": since,
            "limit": 200
        }))
    }
}

fn room_from_event(event: &Value) -> Option<BuzzRoom> {
    let tags = event.get("tags")?.as_array()?;
    let mut id = None;
    let mut name = None;
    let mut about = None;
    let mut visibility = None;
    let mut ttl_seconds = None;
    let mut kind = None;
    for tag in tags {
        let Some(parts) = tag.as_array() else { continue };
        let key = parts.first().and_then(Value::as_str).unwrap_or("");
        let value = parts.get(1).and_then(Value::as_str).map(str::to_string);
        match key {
            "d" => id = value,
            "name" => name = value,
            "about" => about = value,
            "visibility" | "public" => visibility = value.or(Some(key.to_string())),
            "ttl" => ttl_seconds = value.and_then(|raw| raw.parse().ok()),
            "kind" => kind = value,
            _ => {}
        }
    }
    let created_at = event.get("created_at").and_then(Value::as_u64);
    let expires_at = match (created_at, ttl_seconds) {
        (Some(created), Some(ttl)) => Some(created + ttl),
        _ => None,
    };
    Some(BuzzRoom {
        id: id?,
        name: name.unwrap_or_else(|| "Room".into()),
        about,
        kind,
        visibility,
        ttl_seconds,
        expires_at,
        self_role: None,
        members: Vec::new(),
    })
}

fn p_tags(event: &Value) -> Vec<(String, Option<String>)> {
    event
        .get("tags")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tag| {
            let parts = tag.as_array()?;
            if parts.first().and_then(Value::as_str) == Some("p") {
                let pubkey = parts.get(1).and_then(Value::as_str).map(str::to_string)?;
                let role = parts
                    .get(3)
                    .and_then(Value::as_str)
                    .or_else(|| parts.get(2).and_then(Value::as_str).filter(|value| {
                        matches!(*value, "owner" | "admin" | "member" | "guest" | "bot")
                    }))
                    .map(str::to_string);
                Some((pubkey, role))
            } else {
                None
            }
        })
        .collect()
}

fn message_from_event(event: &Value, room_id: &str) -> Option<BuzzMessage> {
    let kind = event.get("kind").and_then(Value::as_u64).unwrap_or(9);
    if kind != 9 && !MESSAGE_KINDS.contains(&(kind as u16)) {
        return None;
    }
    if kind == 7 || kind == 5 {
        return None;
    }
    Some(BuzzMessage {
        id: event.get("id")?.as_str()?.to_string(),
        room_id: room_id.to_string(),
        content: event.get("content").and_then(Value::as_str).unwrap_or("").to_string(),
        created_at: event.get("created_at").and_then(Value::as_u64).unwrap_or(0),
        author: event.get("pubkey").and_then(Value::as_str).unwrap_or("").to_string(),
        thread_root_id: tag_value(event, "E").or_else(|| tag_value(event, "e")),
        reply_to_id: tag_value(event, "e"),
        attachments: imeta_attachments(event),
    })
}

fn reaction_from_event(event: &Value) -> Option<BuzzReaction> {
    if event.get("kind").and_then(Value::as_u64) != Some(7) {
        return None;
    }
    Some(BuzzReaction {
        id: event.get("id")?.as_str()?.to_string(),
        target_event_id: tag_value(event, "e")?,
        emoji: event.get("content").and_then(Value::as_str).unwrap_or("").to_string(),
        author: event.get("pubkey").and_then(Value::as_str).unwrap_or("").to_string(),
    })
}

fn tag_value(event: &Value, key: &str) -> Option<String> {
    event
        .get("tags")
        .and_then(Value::as_array)?
        .iter()
        .find_map(|tag| {
            let parts = tag.as_array()?;
            if parts.first().and_then(Value::as_str) == Some(key) {
                parts.get(1).and_then(Value::as_str).map(str::to_string)
            } else {
                None
            }
        })
}

fn imeta_attachments(event: &Value) -> Option<Vec<BuzzAttachment>> {
    let tags = event.get("tags")?.as_array()?;
    let attachments: Vec<BuzzAttachment> = tags
        .iter()
        .filter_map(|tag| {
            let parts = tag.as_array()?;
            if parts.first().and_then(Value::as_str) != Some("imeta") {
                return None;
            }
            let mut url = None;
            let mut mime = None;
            let mut name = None;
            let mut size = None;
            for part in parts.iter().skip(1) {
                let Some(raw) = part.as_str() else { continue };
                if let Some(value) = raw.strip_prefix("url ") {
                    url = Some(value.to_string());
                } else if let Some(value) = raw.strip_prefix("m ") {
                    mime = Some(value.to_string());
                } else if let Some(value) = raw.strip_prefix("alt ") {
                    name = Some(value.to_string());
                } else if let Some(value) = raw.strip_prefix("size ") {
                    size = value.parse().ok();
                }
            }
            Some(BuzzAttachment {
                url: url?,
                mime_type: mime.unwrap_or_else(|| "application/octet-stream".into()),
                name,
                size_bytes: size,
            })
        })
        .collect();
    if attachments.is_empty() {
        None
    } else {
        Some(attachments)
    }
}

/// Build the production relay. FakeRelay is never selected here.
/// Windows without a credential fails closed. Missing URL fails closed.
pub fn production_relay(relay_url: Option<&str>, secret: Option<&str>) -> Box<dyn RelayAdapter> {
    let Some(url) = relay_url.map(str::trim).filter(|value| !value.is_empty()) else {
        return Box::new(ClosedRelay::missing_relay_url());
    };
    if cfg!(windows) && secret.is_none() {
        return Box::new(ClosedRelay::missing_credential());
    }
    match StockBuzzRelay::new(url.to_string(), secret) {
        Ok(relay) => Box::new(relay),
        Err(err) => Box::new(ClosedRelay::from_message(err.to_string())),
    }
}

pub fn public_key_hex_from_secret(secret: &str) -> Option<String> {
    let bytes = decode_secret(secret).ok()?;
    Some(hex::encode(xonly_public_key(&bytes)?))
}

fn keypair_from_secret(secret: &[u8; 32]) -> Option<secp256k1::Keypair> {
    let secret_key = secp256k1::SecretKey::from_byte_array(*secret).ok()?;
    Some(secp256k1::Keypair::from_secret_key(
        secp256k1::SECP256K1,
        &secret_key,
    ))
}

fn decode_secret(secret: &str) -> Result<[u8; 32], String> {
    let trimmed = secret.trim();
    if let Some(rest) = trimmed.strip_prefix("nsec1") {
        return decode_nsec(rest);
    }
    let bytes = hex::decode(trimmed).map_err(|_| "invalid secret".to_string())?;
    bytes
        .try_into()
        .map_err(|_| "invalid secret length".to_string())
}

fn decode_nsec(data: &str) -> Result<[u8; 32], String> {
    // Bech32 payload after the nsec1 HRP. Tests never persist a real key; this
    // path exists so a Windows sidecar can load an nsec from Credential Manager.
    let charset = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    let mut values = Vec::new();
    for byte in data.bytes() {
        let pos = charset
            .iter()
            .position(|c| *c == byte)
            .ok_or_else(|| "invalid nsec".to_string())?;
        values.push(pos as u8);
    }
    if values.len() < 7 {
        return Err("invalid nsec".into());
    }
    let data_part = &values[..values.len() - 6];
    let mut acc = 0u32;
    let mut bits = 0u32;
    let mut out = Vec::new();
    for value in data_part {
        acc = (acc << 5) | u32::from(*value);
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    out.try_into().map_err(|_| "invalid nsec length".to_string())
}

fn xonly_public_key(secret: &[u8; 32]) -> Option<[u8; 32]> {
    Some(keypair_from_secret(secret)?.x_only_public_key().0.serialize())
}

fn sign_nostr_event(secret: &[u8; 32], event: &Value) -> Result<Value, RelayError> {
    use sha2::{Digest, Sha256};

    let keypair = keypair_from_secret(secret)
        .ok_or_else(|| RelayError::Unavailable("invalid credential".into()))?;
    let pubkey = hex::encode(keypair.x_only_public_key().0.serialize());
    let created_at = event
        .get("created_at")
        .and_then(Value::as_u64)
        .unwrap_or_else(crate::protocol::unix_now);
    let kind = event.get("kind").and_then(Value::as_u64).unwrap_or(9);
    let tags = event.get("tags").cloned().unwrap_or_else(|| json!([]));
    let content = event.get("content").and_then(Value::as_str).unwrap_or("");
    let serialized = json!([0, pubkey, created_at, kind, tags, content]);
    let id_bytes = Sha256::digest(serialized.to_string().as_bytes());
    let signature = keypair.sign_schnorr_no_aux_rand(id_bytes.as_slice());
    Ok(json!({
        "id": hex::encode(id_bytes),
        "pubkey": pubkey,
        "created_at": created_at,
        "kind": kind,
        "tags": tags,
        "content": content,
        "sig": hex::encode(signature.to_byte_array())
    }))
}

fn sign_nip98(
    secret: &[u8; 32],
    method: &str,
    url: &str,
    body: Option<&[u8]>,
) -> Result<String, RelayError> {
    use sha2::{Digest, Sha256};

    let keypair = keypair_from_secret(secret)
        .ok_or_else(|| RelayError::Unavailable("invalid credential".into()))?;
    let pubkey = hex::encode(keypair.x_only_public_key().0.serialize());
    let created_at = crate::protocol::unix_now();
    let mut tags = vec![
        vec!["u".to_string(), url.to_string()],
        vec!["method".to_string(), method.to_string()],
        vec!["nonce".to_string(), uuid::Uuid::new_v4().to_string()],
    ];
    if let Some(body) = body {
        tags.push(vec!["payload".to_string(), hex::encode(Sha256::digest(body))]);
    }
    let serialized = json!([0, pubkey, created_at, 27235, tags, ""]);
    let id_bytes = Sha256::digest(serialized.to_string().as_bytes());
    let signature = keypair.sign_schnorr_no_aux_rand(id_bytes.as_slice());
    let event = json!({
        "id": hex::encode(id_bytes),
        "pubkey": pubkey,
        "created_at": created_at,
        "kind": 27235,
        "tags": tags,
        "content": "",
        "sig": hex::encode(signature.to_byte_array())
    });
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, event.to_string());
    Ok(format!("Nostr {encoded}"))
}
