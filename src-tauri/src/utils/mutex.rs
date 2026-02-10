/// Safe mutex handling utilities to prevent panic cascades from poisoned mutexes.

use std::sync::{Mutex, MutexGuard};

/// Safely lock a mutex, returning Err instead of panicking on poison.
#[allow(dead_code)]
pub fn safe_lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|e| format!("Mutex lock failed (poisoned): {}", e))
}

/// Lock a mutex, recovering from poisoned state by logging and continuing.
#[allow(dead_code)]
pub fn safe_lock_or_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("[WARNING] Mutex was poisoned, attempting recovery");
            poisoned.into_inner()
        }
    }
}

/// Lock a mutex with explicit error context for better diagnostics.
pub fn safe_lock_with_context<'a, T>(
    mutex: &'a Mutex<T>,
    context: &str,
) -> Result<MutexGuard<'a, T>, String> {
    mutex
        .lock()
        .map_err(|e| format!("{}: mutex poisoned ({})", context, e))
}

/// Try to lock a mutex without blocking. Returns None if already locked.
#[allow(dead_code)]
pub fn try_lock<T>(mutex: &Mutex<T>) -> Option<Result<MutexGuard<'_, T>, String>> {
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

        let handle = thread::spawn(move || {
            let result = try_lock(&*mutex_clone);
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

        let _ = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Intentional panic to poison mutex");
        })
        .join();

        let mut guard = safe_lock_or_recover(&mutex);
        *guard = 42;
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_safe_lock_with_poisoned_returns_err() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        let _ = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Intentional panic");
        })
        .join();

        let result = safe_lock(&mutex);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("poisoned"));
    }
}
