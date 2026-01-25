/// Safe mutex handling utilities to prevent poisoning and deadlocks.
/// 
/// ## Mutex Poisoning
/// 
/// Rust mutexes can become "poisoned" when a thread panics while holding a lock.
/// Calling `.unwrap()` on a poisoned mutex causes the current thread to panic,
/// which can cascade through the application and poison other mutexes.
/// 
/// ## Solution
/// 
/// This module provides utilities that gracefully handle mutex poisoning:
/// - `safe_lock()` - Returns a Result instead of panicking
/// - `safe_lock_or_recover()` - Attempts to recover from poisoned state
/// 
/// ## Usage
/// 
/// ```rust
/// use crate::utils::mutex::{safe_lock, safe_lock_or_recover};
/// use std::sync::Mutex;
/// 
/// let mutex = Mutex::new(HashMap::new());
/// 
/// // Safe locking that returns Result
/// let guard = safe_lock(&mutex)?;
/// 
/// // Or auto-recover from poisoning
/// let guard = safe_lock_or_recover(&mutex);
/// ```

use std::sync::{Mutex, MutexGuard};

/// Safely lock a mutex, converting poison errors to Result::Err.
/// 
/// This function prevents panic cascades by returning an error instead of
/// panicking when a mutex is poisoned.
/// 
/// # Arguments
/// 
/// * `mutex` - The mutex to lock
/// 
/// # Returns
/// 
/// * `Ok(MutexGuard)` - Successfully acquired lock
/// * `Err(String)` - Mutex was poisoned or lock failed
/// 
/// # Example
/// 
/// ```rust
/// let mutex = Mutex::new(vec![1, 2, 3]);
/// let guard = safe_lock(&mutex)?;
/// ```
pub fn safe_lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<T>, String> {
    mutex
        .lock()
        .map_err(|e| format!("Mutex lock failed (poisoned): {}", e))
}

/// Lock a mutex and automatically recover from poisoned state.
/// 
/// When a mutex is poisoned, this function:
/// 1. Logs a warning about the poisoning
/// 2. Calls `into_inner()` to recover the guard
/// 3. Returns the guard, allowing operations to continue
/// 
/// This is useful for application state that can tolerate poisoning,
/// but you should carefully consider if recovery is appropriate for
/// your use case.
/// 
/// # Arguments
/// 
/// * `mutex` - The mutex to lock
/// 
/// # Returns
/// 
/// * `MutexGuard` - Guard to the mutex data (recovered if poisoned)
/// 
/// # Example
/// 
/// ```rust
/// let mutex = Mutex::new(HashMap::new());
/// let mut guard = safe_lock_or_recover(&mutex);
/// guard.insert("key".to_string(), "value".to_string());
/// ```
pub fn safe_lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("[WARNING] Mutex was poisoned, attempting recovery");
            poisoned.into_inner()
        }
    }
}

/// Lock a mutex with explicit error context.
/// 
/// This is useful when you want to provide specific context about
/// what operation failed if the mutex is poisoned.
/// 
/// # Arguments
/// 
/// * `mutex` - The mutex to lock
/// * `context` - Error context string (e.g., "Failed to lock content store")
/// 
/// # Returns
/// 
/// * `Ok(MutexGuard)` - Successfully acquired lock
/// * `Err(String)` - Mutex was poisoned with custom context
/// 
/// # Example
/// 
/// ```rust
/// let mutex = Mutex::new(HashMap::new());
/// let guard = safe_lock_with_context(&mutex, "Failed to lock user cache")?;
/// ```
pub fn safe_lock_with_context<'a, T>(
    mutex: &'a Mutex<T>,
    context: &str,
) -> Result<MutexGuard<'a, T>, String> {
    mutex
        .lock()
        .map_err(|e| format!("{}: mutex poisoned ({})", context, e))
}

/// Attempt to lock a mutex, returning None if it's already locked.
/// 
/// This is useful for non-blocking operations where you want to skip
/// the operation if the mutex is busy rather than waiting.
/// 
/// # Arguments
/// 
/// * `mutex` - The mutex to try locking
/// 
/// # Returns
/// 
/// * `Some(Ok(MutexGuard))` - Successfully acquired lock
/// * `Some(Err(String))` - Mutex was poisoned
/// * `None` - Mutex is already locked by another thread
/// 
/// # Example
/// 
/// ```rust
/// let mutex = Mutex::new(vec![]);
/// match try_lock(&mutex) {
///     Some(Ok(mut guard)) => guard.push(1),
///     Some(Err(e)) => eprintln!("Poisoned: {}", e),
///     None => eprintln!("Already locked, skipping"),
/// }
/// ```
pub fn try_lock<T>(mutex: &Mutex<T>) -> Option<Result<MutexGuard<T>, String>> {
    match mutex.try_lock() {
        Ok(guard) => Some(Ok(guard)),
        Err(std::sync::TryLockError::Poisoned(e)) => {
            Some(Err(format!("Mutex poisoned: {}", e)))
        }
        Err(std::sync::TryLockError::WouldBlock) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn test_safe_lock_success() {
        let mutex = Mutex::new(42);
        let guard = safe_lock(&mutex).unwrap();
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_safe_lock_with_context() {
        let mutex = Mutex::new(vec![1, 2, 3]);
        let guard = safe_lock_with_context(&mutex, "Test context").unwrap();
        assert_eq!(*guard, vec![1, 2, 3]);
    }

    #[test]
    fn test_try_lock_success() {
        let mutex = Mutex::new(100);
        match try_lock(&mutex) {
            Some(Ok(guard)) => {
                assert_eq!(*guard, 100);
                drop(guard);
            },
            _ => panic!("Expected successful lock"),
        };
    }

    #[test]
    fn test_try_lock_would_block() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        let _guard = mutex.lock().unwrap();

        // Spawn thread that tries to lock
        let handle = thread::spawn(move || {
            let result = try_lock(&*mutex_clone);
            // Check the result and return a bool, not the guard
            result.is_none()
        });

        let is_none = handle.join().unwrap();
        assert!(is_none, "Expected None for locked mutex");
    }

    #[test]
    fn test_safe_lock_or_recover_success() {
        let mutex = Mutex::new(String::from("test"));
        let guard = safe_lock_or_recover(&mutex);
        assert_eq!(*guard, "test");
    }

    #[test]
    fn test_safe_lock_or_recover_with_poisoned() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        // Poison the mutex by panicking while holding the lock
        let _ = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Intentional panic to poison mutex");
        })
        .join();

        // safe_lock_or_recover should succeed despite poisoning
        let mut guard = safe_lock_or_recover(&mutex);
        *guard = 42;
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_safe_lock_with_poisoned_returns_err() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        // Poison the mutex
        let _ = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Intentional panic");
        })
        .join();

        // safe_lock should return Err for poisoned mutex
        let result = safe_lock(&mutex);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("poisoned"));
    }
}
