use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

/// Measures network latency to a remote host by establishing a TCP connection
/// This is done on a separate channel from the terminal session, so it doesn't
/// interfere with the user's SSH session.
pub fn measure_tcp_latency(host: &str, port: u16, timeout_ms: u64) -> Result<Duration, String> {
    let addr = format!("{}:{}", host, port);
    let timeout = Duration::from_millis(timeout_ms);
    
    let start = Instant::now();
    
    // Resolve hostname to socket addresses
    let socket_addrs: Vec<_> = addr.to_socket_addrs()
        .map_err(|e| format!("Failed to resolve {}: {}", addr, e))?
        .collect();
    
    if socket_addrs.is_empty() {
        return Err(format!("No addresses found for {}", addr));
    }
    
    // Try connecting to the first resolved address
    match TcpStream::connect_timeout(&socket_addrs[0], timeout) {
        Ok(_stream) => {
            // Connection successful, measure the time
            let latency = start.elapsed();
            Ok(latency)
        }
        Err(e) => Err(format!("Connection failed: {}", e))
    }
}

/// Performs multiple latency measurements and returns the average
pub fn measure_average_latency(host: &str, port: u16, samples: usize, timeout_ms: u64) -> Result<Duration, String> {
    let mut total = Duration::ZERO;
    let mut successful = 0;
    
    for _ in 0..samples {
        match measure_tcp_latency(host, port, timeout_ms) {
            Ok(latency) => {
                total += latency;
                successful += 1;
            }
            Err(_) => continue,
        }
    }
    
    if successful == 0 {
        return Err("All latency measurements failed".to_string());
    }
    
    Ok(total / successful as u32)
}

/// Background thread function for continuous latency monitoring
pub fn continuous_latency_monitor(
    host: String,
    port: u16,
    interval_secs: u64,
    callback: impl Fn(Duration) + Send + 'static,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        loop {
            if let Ok(latency) = measure_tcp_latency(&host, port, 5000) {
                callback(latency);
            }
            std::thread::sleep(Duration::from_secs(interval_secs));
        }
    })
}
