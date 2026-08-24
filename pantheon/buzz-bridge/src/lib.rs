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
    handle_line, redact_text, BridgeEvent, BridgeRequest, HandleOutcome, ProtocolError,
    BUZZ_COMPATIBILITY_COMMIT, MAX_FRAME_BYTES, MAX_ID_LEN, MAX_MESSAGE_LIMIT, MIN_MESSAGE_LIMIT,
};
pub use relay::{BuzzStatus, FakeRelay, RelayAdapter, RelayError, StockBuzzRelay};
