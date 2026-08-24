use std::io::{self, BufRead, Write};

use buzz_bridge::{
    handle_line, redact_text, CredentialStore, FakeCredentialStore, FakeRelay, KeyringCredentialStore,
    RelayAdapter, StockBuzzRelay,
};

fn relay_url_from_args() -> String {
    std::env::args()
        .skip_while(|arg| arg != "--relay-url")
        .nth(1)
        .or_else(|| std::env::var("PANTHEON_BUZZ_RELAY_URL").ok())
        .unwrap_or_default()
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    let store = KeyringCredentialStore::platform_default();
    let fake_store = FakeCredentialStore::default();
    let relay_url = relay_url_from_args();
    let secret = store.get().ok().flatten();
    let stock = if relay_url.is_empty() {
        None
    } else {
        StockBuzzRelay::new(relay_url, secret.as_deref()).ok()
    };
    let fake = FakeRelay::default();

    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            let _ = writeln!(
                stderr,
                "{}",
                redact_text(r#"{"level":"error","msg":"stdin read failed"}"#)
            );
            continue;
        };
        let outcome = if let Some(relay) = stock.as_ref() {
            match store.get() {
                Ok(_) => handle_line(line.as_bytes(), &store, relay as &dyn RelayAdapter),
                Err(_) => handle_line(line.as_bytes(), &fake_store, relay as &dyn RelayAdapter),
            }
        } else {
            match store.get() {
                Ok(_) => handle_line(line.as_bytes(), &store, &fake as &dyn RelayAdapter),
                Err(_) => handle_line(line.as_bytes(), &fake_store, &fake as &dyn RelayAdapter),
            }
        };
        let _ = writeln!(stdout, "{}", outcome.response);
        let _ = stdout.flush();
        if outcome.should_exit {
            break;
        }
    }
}
