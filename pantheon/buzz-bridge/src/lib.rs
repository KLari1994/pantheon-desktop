//! Key-safe Buzz sidecar library.
//!
//! The binary in `main.rs` is a thin NDJSON loop over this crate. Tests drive
//! the same public protocol surface the Electron parent uses.

pub mod credential_store;
pub mod protocol;
pub mod relay;

pub use credential_store::{
    CredentialStore, FakeCredentialStore, KeyringCredentialStore, StoreError, KEYRING_ACCOUNT,
    KEYRING_SERVICE,
};
pub use protocol::{
    handle_line, read_ndjson_frame, redact_text, relay_url_from_args, BridgeEvent, BridgeRequest,
    HandleOutcome, ProtocolError, BUZZ_COMPATIBILITY_COMMIT, MAX_FRAME_BYTES, MAX_ID_LEN,
    MAX_MESSAGE_LIMIT, MIN_MESSAGE_LIMIT,
};
pub use relay::{
    production_relay, BuzzMessage, BuzzMessageWindow, BuzzRoom, BuzzRoomPage, BuzzStatus,
    ClosedRelay, FakeRelay, RelayAdapter, RelayError, StockBuzzRelay,
};
