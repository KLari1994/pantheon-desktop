use std::sync::Mutex;

use thiserror::Error;

pub const KEYRING_SERVICE: &str = "Pantheon Buzz";
pub const KEYRING_ACCOUNT: &str = "owner";

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("credential store unsupported on this platform")]
    Unsupported,
    #[error("credential store error")]
    Backend,
}

pub trait CredentialStore: Send + Sync {
    fn get(&self) -> Result<Option<String>, StoreError>;
    fn set(&self, private_key: &str) -> Result<(), StoreError>;
}

#[derive(Default)]
pub struct FakeCredentialStore {
    value: Mutex<Option<String>>,
}

impl CredentialStore for FakeCredentialStore {
    fn get(&self) -> Result<Option<String>, StoreError> {
        Ok(self.value.lock().expect("credential mutex").clone())
    }

    fn set(&self, private_key: &str) -> Result<(), StoreError> {
        *self.value.lock().expect("credential mutex") = Some(private_key.to_string());
        Ok(())
    }
}

pub struct KeyringCredentialStore;

impl KeyringCredentialStore {
    pub fn platform_default() -> Self {
        Self
    }
}

impl CredentialStore for KeyringCredentialStore {
    fn get(&self) -> Result<Option<String>, StoreError> {
        if !cfg!(windows) {
            return Err(StoreError::Unsupported);
        }
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|_| StoreError::Backend)?;
        match entry.get_password() {
            Ok(value) if value.is_empty() => Ok(None),
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(StoreError::Backend),
        }
    }

    fn set(&self, private_key: &str) -> Result<(), StoreError> {
        if !cfg!(windows) {
            return Err(StoreError::Unsupported);
        }
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|_| StoreError::Backend)?;
        entry.set_password(private_key).map_err(|_| StoreError::Backend)
    }
}
