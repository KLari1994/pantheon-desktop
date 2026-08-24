use buzz_bridge::{
    handle_line, redact_text, FakeCredentialStore, FakeRelay, HandleOutcome, MAX_FRAME_BYTES,
    MAX_MESSAGE_LIMIT,
};
use serde_json::Value;
use uuid::Uuid;

fn ctx() -> (FakeCredentialStore, FakeRelay) {
    (FakeCredentialStore::default(), FakeRelay::default())
}

fn handle(line: &str) -> HandleOutcome {
    let (store, relay) = ctx();
    handle_line(line.as_bytes(), &store, &relay)
}

fn response_json(outcome: &HandleOutcome) -> Value {
    serde_json::from_str(&outcome.response).expect("response is json")
}

#[test]
fn unknown_method_returns_error_and_does_not_exit() {
    let id = Uuid::new_v4();
    let outcome = handle(&format!(
        r#"{{"id":"{id}","method":"messages.send","params":{{}}}}"#
    ));
    assert!(!outcome.should_exit);
    let body = response_json(&outcome);
    assert_eq!(body["id"], id.to_string());
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "unknown_method");
}

#[test]
fn malformed_uuid_id_is_rejected() {
    let outcome = handle(r#"{"id":"not-a-uuid","method":"status"}"#);
    assert!(!outcome.should_exit);
    let body = response_json(&outcome);
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "invalid_id");
}

#[test]
fn message_window_above_200_is_rejected() {
    let id = Uuid::new_v4();
    let outcome = handle(&format!(
        r#"{{"id":"{id}","method":"messages.window","params":{{"roomId":"room-a","limit":{}}}}}"#,
        MAX_MESSAGE_LIMIT + 1
    ));
    let body = response_json(&outcome);
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "invalid_limit");
}

#[test]
fn message_window_zero_is_rejected() {
    let id = Uuid::new_v4();
    let outcome = handle(&format!(
        r#"{{"id":"{id}","method":"messages.window","params":{{"roomId":"room-a","limit":0}}}}"#
    ));
    let body = response_json(&outcome);
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "invalid_limit");
}

#[test]
fn payload_above_byte_ceiling_is_rejected_without_exit() {
    let id = Uuid::new_v4();
    let padding = "x".repeat(MAX_FRAME_BYTES);
    let line = format!(r#"{{"id":"{id}","method":"status","pad":"{padding}"}}"#);
    assert!(line.len() > MAX_FRAME_BYTES);
    let (store, relay) = ctx();
    let outcome = handle_line(line.as_bytes(), &store, &relay);
    assert!(!outcome.should_exit);
    let body = response_json(&outcome);
    assert_eq!(body["ok"], false);
    assert_eq!(body["error"]["code"], "frame_too_large");
}

#[test]
fn malformed_json_returns_error_and_keeps_serving() {
    let (store, relay) = ctx();
    let first = handle_line(b"{not-json", &store, &relay);
    assert!(!first.should_exit);
    let first_body = response_json(&first);
    assert_eq!(first_body["ok"], false);
    assert_eq!(first_body["error"]["code"], "malformed_frame");

    let id = Uuid::new_v4();
    let second = handle_line(
        format!(r#"{{"id":"{id}","method":"status"}}"#).as_bytes(),
        &store,
        &relay,
    );
    assert!(!second.should_exit);
    let second_body = response_json(&second);
    assert_eq!(second_body["ok"], true);
    assert_eq!(second_body["id"], id.to_string());
}

#[test]
fn empty_room_id_is_rejected() {
    let id = Uuid::new_v4();
    let outcome = handle(&format!(
        r#"{{"id":"{id}","method":"rooms.get","params":{{"roomId":""}}}}"#
    ));
    assert_eq!(response_json(&outcome)["error"]["code"], "invalid_room_id");
}

#[test]
fn room_id_over_128_is_rejected() {
    let id = Uuid::new_v4();
    let room = "r".repeat(129);
    let outcome = handle(&format!(
        r#"{{"id":"{id}","method":"rooms.get","params":{{"roomId":"{room}"}}}}"#
    ));
    assert_eq!(response_json(&outcome)["error"]["code"], "invalid_room_id");
}

#[test]
fn redaction_strips_runtime_nsec_canary() {
    let canary = format!("nsec1{}", "qpzry9x8gf2tvdw0s3jn54khce6mua7l");
    let leaked = format!("owner key {canary} loaded");
    let redacted = redact_text(&leaked);
    assert!(!redacted.contains(&canary), "redacted={redacted}");
    assert!(redacted.contains("[redacted]"));
}

#[test]
fn redaction_strips_runtime_hex_canary() {
    let canary = format!("{:064x}", 0xC0FFEE_u128);
    assert_eq!(canary.len(), 64);
    let leaked = format!("secret={canary}");
    let redacted = redact_text(&leaked);
    assert!(!redacted.contains(&canary), "redacted={redacted}");
}
