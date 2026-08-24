use std::io::{self, BufReader, Write};

use buzz_bridge::{
    handle_line, production_relay, read_ndjson_frame, redact_text, relay_url_from_args,
    CredentialStore, KeyringCredentialStore,
};

fn main() {
    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin.lock());
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    let store = KeyringCredentialStore::platform_default();
    let relay_url = relay_url_from_args(std::env::args());
    let secret = store.get().ok().flatten();
    let relay = production_relay(relay_url.as_deref(), secret.as_deref());

    loop {
        let frame = match read_ndjson_frame(&mut reader) {
            Ok(Some(Ok(line))) => line,
            Ok(Some(Err(_))) => {
                let oversized = vec![b'x'; buzz_bridge::MAX_FRAME_BYTES + 1];
                let outcome = handle_line(&oversized, &store, relay.as_ref());
                let _ = writeln_response(&mut stdout, &outcome.response);
                continue;
            }
            Ok(None) => break,
            Err(_) => {
                let _ = writeln!(
                    stderr,
                    "{}",
                    redact_text(r#"{"level":"error","msg":"stdin read failed"}"#)
                );
                continue;
            }
        };
        let outcome = handle_line(&frame, &store, relay.as_ref());
        let _ = writeln_response(&mut stdout, &outcome.response);
        if outcome.should_exit {
            break;
        }
    }
}

fn writeln_response(stdout: &mut impl io::Write, response: &str) -> io::Result<()> {
    writeln!(stdout, "{response}")?;
    stdout.flush()
}
