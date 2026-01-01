use keyring::Entry;
use tauri::command;

const SERVICE_NAME: &str = "aiterminal";
const KEY_NAME: &str = "api_key";

#[command]
pub async fn save_api_key_to_keychain(key: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry
        .set_password(&key)
        .map_err(|e| format!("Failed to save to keychain: {}", e))?;

    Ok(())
}

#[command]
pub async fn get_api_key_from_keychain() -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;

    entry
        .get_password()
        .map_err(|e| format!("No API key found in keychain: {}", e))
}

#[command]
pub async fn delete_api_key_from_keychain() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, KEY_NAME)
        .map_err(|e| format!("Failed to access keyring: {}", e))?;

    entry
        .delete_credential()
        .map_err(|e| format!("Failed to delete from keychain: {}", e))?;

    Ok(())
}

#[command]
pub async fn check_keychain_available() -> Result<bool, String> {
    // Try to create an entry - if this works, keychain is available
    match Entry::new(SERVICE_NAME, KEY_NAME) {
        Ok(_) => Ok(true),
        Err(e) => {
            eprintln!("Keychain not available: {}", e);
            Ok(false)
        }
    }
}
