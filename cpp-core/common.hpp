#pragma once
#include <string>

static const std::string SERVER_ADDR = "127.0.0.1";
static const int SERVER_PORT = 9090;

// Commands
static const std::string CMD_READ  = "READ";
static const std::string CMD_WRITE = "WRITE";
#define LOGT(msg) log_msg(LogLevel::INFO, std::string("[trace] ")+msg)
#define CACHE_CAPACITY 128
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-09-27 9:21:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-01 11:11:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-09 9:3:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-13 19:47:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-14 15:35:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-24 11:8:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-25 11:11:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-26 9:33:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-29 19:52:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-10-31 13:50:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-11-01 14:24:00)
// TODO: consider tuning CACHE_CAPACITY after profiling (2025-11-03 13:23:00)
