/// Concurrency and mutex poisoning tests
/// 
/// These tests verify that the application can handle concurrent access
/// to shared state and recover from mutex poisoning scenarios.

#[cfg(test)]
mod concurrency_tests {
    use crate::utils::mutex::{safe_lock, safe_lock_or_recover, safe_lock_with_context, try_lock};
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::Duration;

    // Test 1: Verify safe_lock handles poisoned mutex gracefully
    #[test]
    fn test_safe_lock_handles_poison() {
        let mutex = Arc::new(Mutex::new(vec![1, 2, 3]));
        let mutex_clone = Arc::clone(&mutex);

        // Poison the mutex
        let _ = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Intentional panic to poison mutex");
        })
        .join();

        // safe_lock should return an error, not panic
        let result = safe_lock(&mutex);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("poisoned"));
    }

    // Test 2: Verify safe_lock_or_recover allows recovery
    #[test]
    fn test_safe_lock_or_recover_recovers_from_poison() {
        let mutex = Arc::new(Mutex::new(HashMap::new()));
        let mutex_clone = Arc::clone(&mutex);

        // Poison the mutex
        let _ = thread::spawn(move || {
            let mut guard = mutex_clone.lock().unwrap();
            guard.insert("key1", "value1");
            panic!("Intentional panic");
        })
        .join();

        // Should recover and allow continued use
        let mut guard = safe_lock_or_recover(&mutex);
        guard.insert("key2", "value2");
        assert_eq!(guard.get("key2"), Some(&"value2"));
    }

    // Test 3: Test concurrent access to content store (like preview.rs)
    #[test]
    fn test_concurrent_content_store_access() {
        let content_store = Arc::new(Mutex::new(HashMap::new()));
        let mut handles = vec![];

        // Spawn 10 threads that all write to the store concurrently
        for i in 0..10 {
            let store_clone = Arc::clone(&content_store);
            let handle = thread::spawn(move || {
                for j in 0..100 {
                    let key = format!("thread-{}-item-{}", i, j);
                    let value = format!("content-{}-{}", i, j);
                    
                    // Use safe_lock_with_context as in the real code
                    match safe_lock_with_context(&store_clone, "Test store") {
                        Ok(mut guard) => {
                            guard.insert(key, value);
                        }
                        Err(e) => panic!("Lock failed: {}", e),
                    }
                }
            });
            handles.push(handle);
        }

        // Wait for all threads
        for handle in handles {
            handle.join().unwrap();
        }

        // Verify all items were inserted
        let guard = safe_lock(&content_store).unwrap();
        assert_eq!(guard.len(), 1000); // 10 threads * 100 items
    }

    // Test 4: Test API key cache concurrent access (like settings.rs)
    #[test]
    fn test_concurrent_api_key_cache() {
        let api_key_cache = Arc::new(Mutex::new(HashMap::new()));
        let mut handles = vec![];

        // Simulate concurrent get/set operations
        for i in 0..5 {
            let cache_clone = Arc::clone(&api_key_cache);
            let handle = thread::spawn(move || {
                let provider = format!("provider-{}", i);
                let api_key = format!("key-{}", i);
                
                // Write
                {
                    let mut cache = safe_lock_with_context(&cache_clone, "API key cache").unwrap();
                    cache.insert(provider.clone(), api_key.clone());
                }

                // Read
                {
                    let cache = safe_lock_with_context(&cache_clone, "API key cache").unwrap();
                    assert_eq!(cache.get(&provider), Some(&api_key));
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        let cache = safe_lock(&api_key_cache).unwrap();
        assert_eq!(cache.len(), 5);
    }

    // Test 5: Test try_lock with already locked mutex
    #[test]
    fn test_try_lock_when_locked() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        let _guard = mutex.lock().unwrap();

        // Spawn thread that tries to lock
        let handle = thread::spawn(move || {
            let result = try_lock(&*mutex_clone);
            assert!(result.is_none()); // Should return None, not block
        });

        handle.join().unwrap();
    }

    // Test 6: Test multiple readers don't block each other (using try_lock)
    #[test]
    fn test_sequential_locks_succeed() {
        let mutex = Arc::new(Mutex::new(vec![1, 2, 3]));
        
        // First lock
        {
            let guard = safe_lock(&mutex).unwrap();
            assert_eq!(*guard, vec![1, 2, 3]);
        } // Lock released

        // Second lock should succeed
        {
            let guard = safe_lock(&mutex).unwrap();
            assert_eq!(*guard, vec![1, 2, 3]);
        }
    }

    // Test 7: Verify no deadlock with nested lock attempts
    #[test]
    fn test_no_deadlock_with_safe_lock() {
        let mutex = Arc::new(Mutex::new(HashMap::new()));
        let mutex_clone = Arc::clone(&mutex);

        let handle = thread::spawn(move || {
            for i in 0..100 {
                let mut guard = safe_lock(&mutex_clone).unwrap();
                guard.insert(i, i * 2);
            }
        });

        // Main thread also accesses
        for i in 100..200 {
            let mut guard = safe_lock(&mutex).unwrap();
            guard.insert(i, i * 2);
        }

        handle.join().unwrap();

        let guard = safe_lock(&mutex).unwrap();
        assert_eq!(guard.len(), 200);
    }

    // Test 8: Test recovery after panic in critical section
    #[test]
    fn test_recovery_after_panic_in_critical_section() {
        let mutex = Arc::new(Mutex::new(vec![1, 2, 3]));
        let mutex_clone = Arc::clone(&mutex);

        // Thread that panics while holding lock
        let _ = thread::spawn(move || {
            let mut guard = mutex_clone.lock().unwrap();
            guard.push(4);
            panic!("Simulated error");
        })
        .join();

        // Using safe_lock_or_recover, we can continue
        let mut guard = safe_lock_or_recover(&mutex);
        guard.push(5);
        
        // The vec should contain items from before and after the panic
        assert!(guard.contains(&1));
        assert!(guard.contains(&4)); // Item added before panic
        assert!(guard.contains(&5)); // Item added after recovery
    }

    // Test 9: Test safe_lock_with_context provides useful error messages
    #[test]
    fn test_safe_lock_with_context_error_message() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        // Poison the mutex
        let _ = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Test panic");
        })
        .join();

        let result = safe_lock_with_context(&mutex, "Test operation");
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(error.contains("Test operation"));
        assert!(error.contains("poisoned"));
    }

    // Test 10: Stress test - many threads, many operations
    #[test]
    fn test_stress_concurrent_access() {
        let mutex = Arc::new(Mutex::new(0i32));
        let mut handles = vec![];

        // 20 threads each incrementing 1000 times
        for _ in 0..20 {
            let mutex_clone = Arc::clone(&mutex);
            let handle = thread::spawn(move || {
                for _ in 0..1000 {
                    let mut guard = safe_lock(&mutex_clone).unwrap();
                    *guard += 1;
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        let guard = safe_lock(&mutex).unwrap();
        assert_eq!(*guard, 20000); // 20 threads * 1000 increments
    }

    // Test 11: Test that dropped guard releases lock
    #[test]
    fn test_guard_drop_releases_lock() {
        let mutex = Arc::new(Mutex::new(42));

        {
            let _guard = safe_lock(&mutex).unwrap();
            // Lock is held
        } // Guard dropped here

        // Should be able to lock again immediately
        let guard = safe_lock(&mutex).unwrap();
        assert_eq!(*guard, 42);
    }

    // Test 12: Test concurrent reads don't corrupt data
    #[test]
    fn test_concurrent_reads_preserve_data() {
        let mutex = Arc::new(Mutex::new(vec![1, 2, 3, 4, 5]));
        let mut handles = vec![];

        for _ in 0..10 {
            let mutex_clone = Arc::clone(&mutex);
            let handle = thread::spawn(move || {
                for _ in 0..100 {
                    let guard = safe_lock(&mutex_clone).unwrap();
                    // Verify data is intact
                    assert_eq!(*guard, vec![1, 2, 3, 4, 5]);
                    thread::sleep(Duration::from_micros(10));
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }
    }

    // Test 13: Test try_lock succeeds when mutex is available
    #[test]
    fn test_try_lock_succeeds_when_available() {
        let mutex = Mutex::new(100);
        
        match try_lock(&mutex) {
            Some(Ok(guard)) => {
                assert_eq!(*guard, 100);
                drop(guard); // Explicitly drop before mutex goes out of scope
            },
            Some(Err(e)) => panic!("Unexpected error: {}", e),
            None => panic!("Expected successful lock"),
        };
    }

    // Test 14: Test try_lock handles poisoned mutex
    #[test]
    fn test_try_lock_handles_poisoned() {
        let mutex = Arc::new(Mutex::new(0));
        let mutex_clone = Arc::clone(&mutex);

        // Poison it
        let _ = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Poison");
        })
        .join();

        match try_lock(&mutex) {
            Some(Err(e)) => {
                assert!(e.contains("poisoned"));
            },
            _ => panic!("Expected poisoned error"),
        };
    }

    // Test 15: Integration test - simulate preview window scenario
    #[test]
    fn test_preview_window_scenario() {
        // Simulate preview.rs usage
        type ContentStore = Arc<Mutex<HashMap<String, (String, String)>>>;
        let content_store: ContentStore = Arc::new(Mutex::new(HashMap::new()));

        // Simulate multiple preview windows being opened concurrently
        let mut handles = vec![];
        for i in 0..5 {
            let store_clone = Arc::clone(&content_store);
            let handle = thread::spawn(move || {
                let window_label = format!("preview-{}", i);
                let filename = format!("file-{}.txt", i);
                let content = format!("Content for file {}", i);

                // Open preview (insert)
                {
                    let mut guard = safe_lock_with_context(&store_clone, "Failed to lock content store").unwrap();
                    guard.insert(window_label.clone(), (filename.clone(), content.clone()));
                }

                thread::sleep(Duration::from_millis(10));

                // Read preview
                {
                    let guard = safe_lock_with_context(&store_clone, "Failed to lock content store").unwrap();
                    let retrieved = guard.get(&window_label).unwrap();
                    assert_eq!(retrieved.0, filename);
                    assert_eq!(retrieved.1, content);
                }

                // Close preview (remove)
                {
                    let mut guard = safe_lock_with_context(&store_clone, "Failed to lock content store").unwrap();
                    guard.remove(&window_label);
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // All previews should be closed
        let guard = safe_lock(&content_store).unwrap();
        assert_eq!(guard.len(), 0);
    }

    // Test 16: Integration test - simulate API key cache scenario
    #[test]
    fn test_api_key_cache_scenario() {
        // Simulate settings.rs usage
        type ApiKeyCache = Arc<Mutex<HashMap<String, String>>>;
        let api_key_cache: ApiKeyCache = Arc::new(Mutex::new(HashMap::new()));

        let providers = vec!["openai", "anthropic", "ollama"];
        let mut handles = vec![];

        for provider in providers {
            let cache_clone = Arc::clone(&api_key_cache);
            let provider = provider.to_string();
            
            let handle = thread::spawn(move || {
                // Save API key
                {
                    let mut cache = safe_lock_with_context(&cache_clone, "Failed to lock API key cache").unwrap();
                    cache.insert(provider.clone(), format!("key-for-{}", provider));
                }

                thread::sleep(Duration::from_millis(5));

                // Get API key
                {
                    let cache = safe_lock_with_context(&cache_clone, "Failed to lock API key cache").unwrap();
                    let key = cache.get(&provider).unwrap();
                    assert_eq!(*key, format!("key-for-{}", provider));
                }

                thread::sleep(Duration::from_millis(5));

                // Delete API key
                {
                    let mut cache = safe_lock_with_context(&cache_clone, "Failed to lock API key cache").unwrap();
                    cache.remove(&provider);
                }
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // All keys should be deleted
        let cache = safe_lock(&api_key_cache).unwrap();
        assert_eq!(cache.len(), 0);
    }
}
