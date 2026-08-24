use buzz_bridge::{
    handle_line, handle_line_with_pump, poll_subscription, redact_text, BuzzMember, BuzzMessage,
    BuzzMessageWindow, BuzzRoom, BuzzRoomPage, BuzzStatus, CredentialStore, EventPump,
    FakeCredentialStore, FakeRelay, RelayAdapter, RelayError, BUZZ_COMPATIBILITY_COMMIT,
};
use serde_json::{json, Value};
use uuid::Uuid;

fn nsec_canary() -> String {
    format!("nsec1{}", hex::encode(Uuid::new_v4().as_bytes()).repeat(2))
}

fn hex_canary() -> String {
    hex::encode(Uuid::new_v4().as_bytes()).repeat(2)
}

fn parse(outcome: &buzz_bridge::HandleOutcome) -> Value {
    serde_json::from_str(&outcome.response).expect("json")
}

#[test]
fn oversized_content_is_rejected() {
    let id = Uuid::new_v4();
    let content = "x".repeat(64 * 1024 + 1);
    let request = json!({
        "id": id,
        "method": "messages.send",
        "params": { "roomId": "room-a", "content": content }
    });
    let store = FakeCredentialStore::default();
    let relay = FakeRelay::default();
    let outcome = handle_line(request.to_string().as_bytes(), &store, &relay);
    let body = parse(&outcome);
    let code = body["error"]["code"].as_str().unwrap_or("");
    assert!(
        code == "invalid_content" || code == "frame_too_large",
        "expected invalid_content or frame_too_large, got {code}"
    );
}

#[test]
fn emoji_over_64_chars_is_rejected() {
    let id = Uuid::new_v4();
    let emoji = "🙂".repeat(65);
    let request = json!({
        "id": id,
        "method": "reactions.add",
        "params": { "roomId": "room-a", "targetEventId": "evt-1", "emoji": emoji }
    });
    let store = FakeCredentialStore::default();
    let relay = FakeRelay::default();
    let outcome = handle_line(request.to_string().as_bytes(), &store, &relay);
    assert_eq!(parse(&outcome)["error"]["code"], "invalid_emoji");
}

struct MemberOnlyRelay;

impl RelayAdapter for MemberOnlyRelay {
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
            rooms: vec![],
            next_cursor: None,
        })
    }
    fn get_room(&self, room_id: &str) -> Result<BuzzRoom, RelayError> {
        Ok(BuzzRoom {
            id: room_id.into(),
            name: "General".into(),
            about: None,
            kind: Some("office".into()),
            visibility: Some("private".into()),
            ttl_seconds: None,
            expires_at: None,
            self_role: Some("member".into()),
            members: vec![BuzzMember {
                pubkey: "aa".repeat(32),
                name: None,
                role: Some("member".into()),
            }],
        })
    }
    fn message_window(
        &self,
        _room_id: &str,
        _before: Option<&str>,
        _limit: u32,
    ) -> Result<BuzzMessageWindow, RelayError> {
        Ok(BuzzMessageWindow {
            messages: vec![],
            reactions: vec![],
        })
    }
}

#[test]
fn members_add_is_role_denied_below_admin() {
    let id = Uuid::new_v4();
    let request = json!({
        "id": id,
        "method": "members.add",
        "params": { "roomId": "room-a", "pubkey": "bb".repeat(32) }
    });
    let store = FakeCredentialStore::default();
    let outcome = handle_line(request.to_string().as_bytes(), &store, &MemberOnlyRelay);
    assert_eq!(parse(&outcome)["error"]["code"], "role_denied");
}

#[test]
fn messages_send_returns_event_id() {
    let id = Uuid::new_v4();
    let request = json!({
        "id": id,
        "method": "messages.send",
        "params": { "roomId": "room-a", "content": "hello from pantheon" }
    });
    let store = FakeCredentialStore::default();
    let relay = FakeRelay::default();
    let outcome = handle_line(request.to_string().as_bytes(), &store, &relay);
    let body = parse(&outcome);
    assert_eq!(body["ok"], true);
    assert!(body["result"]["eventId"].as_str().unwrap().len() > 0);
    assert!(body["result"]["createdAt"].as_u64().is_some());
}

#[test]
fn write_responses_never_contain_key_material() {
    let nsec = nsec_canary();
    let hex = hex_canary();
    let store = FakeCredentialStore::default();
    store.set(&nsec).unwrap();
    store.set(&hex).unwrap();
    let relay = FakeRelay::default();
    let id = Uuid::new_v4();
    let request = json!({
        "id": id,
        "method": "messages.send",
        "params": { "roomId": "room-a", "content": format!("hi {nsec} {hex}") }
    });
    let outcome = handle_line(request.to_string().as_bytes(), &store, &relay);
    assert!(!outcome.response.contains(&nsec), "{}", outcome.response);
    assert!(!outcome.response.contains(&hex), "{}", outcome.response);
    let leaked = format!("owner {nsec} {hex}");
    let redacted = redact_text(&leaked);
    assert!(!redacted.contains(&nsec));
    assert!(!redacted.contains(&hex));
}

struct EventfulRelay;

impl RelayAdapter for EventfulRelay {
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
            rooms: vec![],
            next_cursor: None,
        })
    }
    fn get_room(&self, room_id: &str) -> Result<BuzzRoom, RelayError> {
        Ok(BuzzRoom {
            id: room_id.into(),
            name: "General".into(),
            about: None,
            kind: None,
            visibility: None,
            ttl_seconds: None,
            expires_at: None,
            self_role: Some("owner".into()),
            members: vec![],
        })
    }
    fn message_window(
        &self,
        room_id: &str,
        _before: Option<&str>,
        _limit: u32,
    ) -> Result<BuzzMessageWindow, RelayError> {
        Ok(BuzzMessageWindow {
            messages: vec![BuzzMessage {
                id: "evt-new".into(),
                room_id: room_id.into(),
                content: "fresh".into(),
                created_at: 99,
                author: "alice".into(),
                thread_root_id: None,
                reply_to_id: None,
                attachments: None,
            }],
            reactions: vec![],
        })
    }
    fn events_since(&self, room_ids: &[String], _since: u64) -> Result<Vec<Value>, RelayError> {
        Ok(room_ids
            .iter()
            .map(|room_id| {
                json!({
                    "id": "evt-new",
                    "kind": 9,
                    "content": "fresh",
                    "created_at": 99,
                    "pubkey": "alice",
                    "tags": [["h", room_id]]
                })
            })
            .collect())
    }
}

#[test]
fn subscribe_emits_room_event_frames() {
    let pump = EventPump::default();
    let store = FakeCredentialStore::default();
    let relay = EventfulRelay;
    let id = Uuid::new_v4();
    let request = json!({
        "id": id,
        "method": "subscribe.start",
        "params": { "roomIds": ["room-a"] }
    });
    let outcome = handle_line_with_pump(request.to_string().as_bytes(), &store, &relay, &pump);
    assert_eq!(parse(&outcome)["ok"], true);
    let frames = poll_subscription(&relay, &pump);
    assert!(
        frames.iter().any(|frame| {
            frame.get("type").and_then(Value::as_str) == Some("room.event")
                && frame.get("room_id").and_then(Value::as_str) == Some("room-a")
        }),
        "frames={frames:?}"
    );
}
