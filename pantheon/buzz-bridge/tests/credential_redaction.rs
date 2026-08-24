use buzz_bridge::{
    handle_line, redact_text, CredentialStore, FakeCredentialStore, FakeRelay, KeyringCredentialStore,
};
use serde_json::Value;
use uuid::Uuid;

fn runtime_nsec_canary() -> String {
    format!("nsec1{}", hex::encode(Uuid::new_v4().as_bytes()).repeat(2))
}

fn runtime_hex_canary() -> String {
    hex::encode(Uuid::new_v4().as_bytes()).repeat(2)
}

#[test]
fn credential_set_response_and_logs_never_contain_runtime_canary() {
    let canary = runtime_nsec_canary();
    let store = FakeCredentialStore::default();
    let relay = FakeRelay::default();
    let id = Uuid::new_v4();
    let request = serde_json::json!({
        "id": id,
        "method": "credential.set",
        "params": { "privateKey": canary }
    });
    let outcome = handle_line(request.to_string().as_bytes(), &store, &relay);
    assert!(!outcome.response.contains(&canary), "response leaked canary");
    let redacted_log = redact_text(&format!("credential.set accepted for {canary}"));
    assert!(!redacted_log.contains(&canary));
    let body: Value = serde_json::from_str(&outcome.response).unwrap();
    assert_eq!(body["ok"], true);
    assert!(store.get().unwrap().is_some());
}

#[test]
fn hex_canary_never_appears_in_serialized_status() {
    let canary = runtime_hex_canary();
    let store = FakeCredentialStore::default();
    store.set(&canary).unwrap();
    let relay = FakeRelay::default();
    let id = Uuid::new_v4();
    let outcome = handle_line(
        format!(r#"{{"id":"{id}","method":"status"}}"#).as_bytes(),
        &store,
        &relay,
    );
    assert!(
        !outcome.response.contains(&canary),
        "status leaked hex canary: {}",
        outcome.response
    );
}

#[test]
fn real_keyring_is_unsupported_off_windows() {
    if cfg!(windows) {
        return;
    }
    let store = KeyringCredentialStore::platform_default();
    let err = store.get().expect_err("linux keyring must report unsupported");
    assert!(err.to_string().to_lowercase().contains("unsupported"));
}
