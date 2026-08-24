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
pub struct BuzzMember {
    pub pubkey: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuzzRoom {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub members: Vec<BuzzMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzRoomPage {
    pub rooms: Vec<BuzzRoom>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzMessage {
    pub id: String,
    pub room_id: String,
    pub content: String,
    pub created_at: u64,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuzzMessageWindow {
    pub messages: Vec<BuzzMessage>,
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
}

#[derive(Clone)]
pub struct FakeRelay {
    rooms: Vec<BuzzRoom>,
    messages: Vec<BuzzMessage>,
}

impl Default for FakeRelay {
    fn default() -> Self {
        Self {
            rooms: vec![BuzzRoom {
                id: "room-a".into(),
                name: "General".into(),
                members: vec![BuzzMember {
                    pubkey: "alice".into(),
                    name: Some("Alice".into()),
                }],
            }],
            messages: vec![BuzzMessage {
                id: "evt-1".into(),
                room_id: "room-a".into(),
                content: "hello".into(),
                created_at: 1,
                author: "alice".into(),
            }],
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
        Ok(BuzzMessageWindow { messages })
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
                    .map(|pubkey| BuzzMember { pubkey, name: None })
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
        })
    }
}

fn room_from_event(event: &Value) -> Option<BuzzRoom> {
    let tags = event.get("tags")?.as_array()?;
    let mut id = None;
    let mut name = None;
    for tag in tags {
        let Some(parts) = tag.as_array() else { continue };
        let key = parts.first().and_then(Value::as_str).unwrap_or("");
        let value = parts.get(1).and_then(Value::as_str).map(str::to_string);
        match key {
            "d" => id = value,
            "name" => name = value,
            _ => {}
        }
    }
    Some(BuzzRoom {
        id: id?,
        name: name.unwrap_or_else(|| "Room".into()),
        members: Vec::new(),
    })
}

fn p_tags(event: &Value) -> Vec<String> {
    event
        .get("tags")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tag| {
            let parts = tag.as_array()?;
            if parts.first().and_then(Value::as_str) == Some("p") {
                parts.get(1).and_then(Value::as_str).map(str::to_string)
            } else {
                None
            }
        })
        .collect()
}

fn message_from_event(event: &Value, room_id: &str) -> Option<BuzzMessage> {
    Some(BuzzMessage {
        id: event.get("id")?.as_str()?.to_string(),
        room_id: room_id.to_string(),
        content: event.get("content").and_then(Value::as_str).unwrap_or("").to_string(),
        created_at: event.get("created_at").and_then(Value::as_u64).unwrap_or(0),
        author: event.get("pubkey").and_then(Value::as_str).unwrap_or("").to_string(),
    })
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
