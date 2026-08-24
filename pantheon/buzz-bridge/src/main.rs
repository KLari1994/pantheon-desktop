use std::io::{self, BufReader, Write};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use buzz_bridge::{
    handle_line_with_pump, poll_subscription, production_relay, read_ndjson_frame, redact_text,
    relay_url_from_args, CredentialStore, EventPump, KeyringCredentialStore,
};

fn main() {
    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin.lock());
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    let store = KeyringCredentialStore::platform_default();
    let relay_url = relay_url_from_args(std::env::args());
    let secret = store.get().ok().flatten();
    let relay = Arc::new(production_relay(relay_url.as_deref(), secret.as_deref()));
    let pump = Arc::new(EventPump::default());

    {
        let relay = Arc::clone(&relay);
        let pump = Arc::clone(&pump);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_secs(3));
            let frames = poll_subscription(relay.as_ref().as_ref(), pump.as_ref());
            let mut out = io::stdout();
            for frame in frames {
                let _ = writeln_response(&mut out, &redact_text(&frame.to_string()));
            }
        });
    }

    loop {
        let frame = match read_ndjson_frame(&mut reader) {
            Ok(Some(Ok(line))) => line,
            Ok(Some(Err(_))) => {
                let oversized = vec![b'x'; buzz_bridge::MAX_FRAME_BYTES + 1];
                let outcome = handle_line_with_pump(&oversized, &store, relay.as_ref().as_ref(), pump.as_ref());
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
        let outcome = handle_line_with_pump(&frame, &store, relay.as_ref().as_ref(), pump.as_ref());
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
